// Supabase Edge Function "google-calendar"
// Verbindet je Person ein Google-Konto (OAuth) und liest/ändert Termine im Hauptkalender ("primary").
// Die Google-Schlüssel (refresh/access token) liegen nur in der Tabelle google_links, die allein diese
// Funktion lesen darf (keine Zugriffsregeln für Browser). Der Browser bekommt nur Termine zu sehen.
// Secrets: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET (im Supabase-Dashboard, nie im Repository).
import { createClient } from 'npm:@supabase/supabase-js@2';

const APP_URL = 'https://s-dudek.github.io/uebersicht/';
const SCOPE = 'https://www.googleapis.com/auth/calendar.events';
const API = 'https://www.googleapis.com/calendar/v3/calendars/primary/events';
const CLIENT_ID = Deno.env.get('GOOGLE_CLIENT_ID') ?? '';
const CLIENT_SECRET = Deno.env.get('GOOGLE_CLIENT_SECRET') ?? '';
const SB_URL = Deno.env.get('SUPABASE_URL')!;
const CALLBACK = `${SB_URL}/functions/v1/google-calendar`;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
const back = (result: string) => Response.redirect(`${APP_URL}?google=${result}`, 302);

// Dienstzugang nur hier auf dem Server (für google_links)
const admin = createClient(SB_URL, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });

// ---------- signierter "state" für die Rückkehr von Google (wer, bis wann) ----------
const b64u = (buf: ArrayBuffer | Uint8Array) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const hmacKey = () => crypto.subtle.importKey('raw', new TextEncoder().encode(CLIENT_SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
async function sign(payload: string) {
  return b64u(await crypto.subtle.sign('HMAC', await hmacKey(), new TextEncoder().encode(payload)));
}
async function makeState(uid: string) {
  const p = b64u(new TextEncoder().encode(JSON.stringify({ u: uid, e: Date.now() + 10 * 60e3 })));
  return `${p}.${await sign(p)}`;
}
async function readState(state: string): Promise<string | null> {
  const [p, s] = state.split('.');
  if (!p || !s || (await sign(p)) !== s) return null;
  try {
    const o = JSON.parse(atob(p.replace(/-/g, '+').replace(/_/g, '/')));
    return typeof o.u === 'string' && o.e > Date.now() ? o.u : null;
  } catch { return null; }
}

// ---------- Google-Zugang ----------
async function tokenRequest(params: Record<string, string>) {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: CLIENT_ID, client_secret: CLIENT_SECRET, ...params }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error_description || data.error || `Google antwortet mit ${res.status}`);
  return data;
}

// gültiger access token (bei Bedarf mit dem refresh token erneuert)
async function accessToken(uid: string): Promise<string | null> {
  const { data: link } = await admin.from('google_links').select('refresh_token, access_token, expires_at').eq('user_id', uid).maybeSingle();
  if (!link) return null;
  if (link.access_token && new Date(link.expires_at).getTime() > Date.now() + 60e3) return link.access_token;
  const t = await tokenRequest({ grant_type: 'refresh_token', refresh_token: link.refresh_token });
  await admin.from('google_links').update({ access_token: t.access_token, expires_at: new Date(Date.now() + t.expires_in * 1000).toISOString() }).eq('user_id', uid);
  return t.access_token;
}

async function google(token: string, url: string, init: RequestInit = {}) {
  const res = await fetch(url, { ...init, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } });
  if (res.status === 204) return null;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error?.message || `Google antwortet mit ${res.status}`);
  return data;
}

// Google-Termin → schlankes Format für die App
const slim = (e: any) => ({
  id: e.id, title: e.summary || '', location: e.location || '', desc: e.description || '',
  allDay: !!e.start?.date, start: e.start?.dateTime || e.start?.date, end: e.end?.dateTime || e.end?.date,
  recurring: !!e.recurringEventId,
});

// App-Termin → Google-Format (nur erlaubte Felder, Längen begrenzt)
function toGoogle(ev: any, tz: string) {
  const s = (v: unknown, n: number) => String(v ?? '').slice(0, n);
  const day = /^\d{4}-\d{2}-\d{2}$/, dt = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/;
  const out: any = { summary: s(ev.title, 300), location: s(ev.location, 300), description: s(ev.desc, 4000) };
  if (ev.allDay) {
    if (!day.test(ev.start) || !day.test(ev.end)) throw new Error('Datum fehlt');
    out.start = { date: ev.start }; out.end = { date: ev.end };
  } else {
    if (!dt.test(ev.start) || !dt.test(ev.end)) throw new Error('Uhrzeit fehlt');
    out.start = { dateTime: ev.start, timeZone: tz }; out.end = { dateTime: ev.end, timeZone: tz };
  }
  return out;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (!CLIENT_ID || !CLIENT_SECRET) return json({ error: 'Google ist noch nicht eingerichtet' }, 500);

  // Rückkehr von Google nach "Zugriff erlauben"
  if (req.method === 'GET') {
    const q = new URL(req.url).searchParams;
    const uid = await readState(q.get('state') ?? '');
    if (!uid || !q.get('code')) return back('fehler');
    try {
      const t = await tokenRequest({ grant_type: 'authorization_code', code: q.get('code')!, redirect_uri: CALLBACK });
      if (!t.refresh_token) return back('fehler');
      const cal = await google(t.access_token, 'https://www.googleapis.com/calendar/v3/calendars/primary/events?maxResults=1').catch(() => null);
      const { error } = await admin.from('google_links').upsert({
        user_id: uid, email: String(cal?.summary ?? '').slice(0, 200), refresh_token: t.refresh_token,
        access_token: t.access_token, expires_at: new Date(Date.now() + t.expires_in * 1000).toISOString(),
      });
      return back(error ? 'fehler' : 'ok');
    } catch { return back('fehler'); }
  }
  if (req.method !== 'POST') return json({ error: 'nicht erlaubt' }, 405);

  // alles andere nur angemeldet
  const sb = createClient(SB_URL, req.headers.get('apikey') ?? '', {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } }, auth: { persistSession: false },
  });
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return json({ error: 'nicht angemeldet' }, 401);
  let body: any = {};
  try { body = await req.json(); } catch { /* leer */ }
  const tz = /^[A-Za-z_]+\/[A-Za-z_\/-]+$/.test(body.tz ?? '') ? body.tz : 'Europe/Vienna';

  try {
    switch (body.action) {
      case 'start': {
        const u = new URL('https://accounts.google.com/o/oauth2/v2/auth');
        u.search = new URLSearchParams({ client_id: CLIENT_ID, redirect_uri: CALLBACK, response_type: 'code', scope: SCOPE,
          access_type: 'offline', prompt: 'consent', include_granted_scopes: 'true', state: await makeState(user.id) }).toString();
        return json({ url: u.toString() });
      }
      case 'status': {
        const { data } = await admin.from('google_links').select('email').eq('user_id', user.id).maybeSingle();
        return json({ connected: !!data, email: data?.email ?? '' });
      }
      case 'disconnect': {
        const { data } = await admin.from('google_links').select('refresh_token').eq('user_id', user.id).maybeSingle();
        if (data) await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(data.refresh_token)}`, { method: 'POST' }).catch(() => {});
        await admin.from('google_links').delete().eq('user_id', user.id);
        return json({ ok: true });
      }
    }
    const token = await accessToken(user.id);
    if (!token) return json({ error: 'Google ist nicht verbunden' }, 400);
    const id = /^[a-z0-9_]{1,1024}$/i.test(body.id ?? '') ? body.id : null;
    switch (body.action) {
      case 'list': {
        const from = new Date(body.from), to = new Date(body.to);
        if (isNaN(+from) || isNaN(+to)) return json({ error: 'Zeitraum fehlt' }, 400);
        const out: unknown[] = [];
        let page = '';
        for (let i = 0; i < 10; i++) {
          const q = new URLSearchParams({ singleEvents: 'true', orderBy: 'startTime', maxResults: '2500', timeMin: from.toISOString(), timeMax: to.toISOString(), ...(page ? { pageToken: page } : {}) });
          const data = await google(token, `${API}?${q}`);
          out.push(...(data.items ?? []).filter((e: any) => e.status !== 'cancelled').map(slim));
          if (!data.nextPageToken) break;
          page = data.nextPageToken;
        }
        return json({ events: out });
      }
      case 'save': {
        const ev = toGoogle(body.event ?? {}, tz);
        const data = id ? await google(token, `${API}/${id}`, { method: 'PATCH', body: JSON.stringify(ev) })
          : await google(token, API, { method: 'POST', body: JSON.stringify(ev) });
        return json({ event: slim(data) });
      }
      case 'delete': {
        if (!id) return json({ error: 'Termin fehlt' }, 400);
        await google(token, `${API}/${id}`, { method: 'DELETE' });
        return json({ ok: true });
      }
    }
    return json({ error: 'unbekannte Aktion' }, 400);
  } catch (e) {
    return json({ error: String((e as Error).message || e) }, 502);
  }
});
