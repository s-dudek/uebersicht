// Supabase Edge Function "calendar-feed"
// Holt einen verknüpften Kalender (ICS-Abo von Outlook, Google, iCloud …) für die angemeldete Person.
// Die Adresse kommt aus der Tabelle calendars und wird mit dem Zugang der Person gelesen (Zugriffsregeln):
// so lädt jede Person nur ihre eigenen Kalender, und der Browser bekommt nie fremde Adressen zu sehen.
// Browser dürfen fremde Kalender wegen CORS nicht direkt laden – darum dieser kleine Umweg.
import { createClient } from 'npm:@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const MAX_BYTES = 8 * 1024 * 1024;   // größter Kalender
const reply = (body: string, status = 200, type = 'text/plain; charset=utf-8') =>
  new Response(body, { status, headers: { ...CORS, 'Content-Type': type, 'Cache-Control': 'no-store' } });

// nur öffentliche https-Adressen (webcal:// wird zu https://), keine internen Rechner
function safeUrl(raw: string): URL | null {
  let u: URL;
  try { u = new URL(String(raw).trim().replace(/^webcals?:/i, 'https:')); } catch { return null; }
  if (u.protocol !== 'https:' || u.username || u.password || (u.port && u.port !== '443')) return null;
  const h = u.hostname.toLowerCase();
  if (h === 'localhost' || /\.(local|internal|localhost)$/.test(h) || /^[\d.]+$/.test(h) || h.includes(':') || h.startsWith('[')) return null;
  return u;
}

// Weiterleitungen selbst verfolgen, damit auch jedes Ziel geprüft wird
async function fetchIcs(start: URL): Promise<string> {
  let url = start;
  for (let hop = 0; hop < 4; hop++) {
    const res = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(12000), headers: { Accept: 'text/calendar, */*' } });
    if (res.status >= 300 && res.status < 400) {
      const next = safeUrl(new URL(res.headers.get('location') ?? '', url).toString());
      if (!next) throw new Error('Weiterleitung auf eine nicht erlaubte Adresse');
      url = next;
      continue;
    }
    if (!res.ok) throw new Error(`Kalender antwortet mit ${res.status}`);
    if (+(res.headers.get('content-length') ?? 0) > MAX_BYTES) throw new Error('Kalender ist zu groß');
    const buf = await res.arrayBuffer();
    if (buf.byteLength > MAX_BYTES) throw new Error('Kalender ist zu groß');
    const text = new TextDecoder().decode(buf);
    if (!text.includes('BEGIN:VCALENDAR')) throw new Error('Unter dieser Adresse liegt kein Kalender (ICS)');
    return text;
  }
  throw new Error('Zu viele Weiterleitungen');
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return reply('ok');
  if (req.method !== 'POST') return reply('nicht erlaubt', 405);

  // mit dem Zugang der Person lesen: ohne gültige Anmeldung gibt es nichts
  const sb = createClient(Deno.env.get('SUPABASE_URL')!, req.headers.get('apikey') ?? '', {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
    auth: { persistSession: false },
  });
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return reply('nicht angemeldet', 401);

  let id = '';
  try { id = String((await req.json()).id ?? ''); } catch { /* leer */ }
  if (!/^[0-9a-f-]{36}$/i.test(id)) return reply('Kalender fehlt', 400);
  const { data: cal } = await sb.from('calendars').select('url').eq('id', id).maybeSingle();
  if (!cal) return reply('Kalender nicht gefunden', 404);

  const url = safeUrl(cal.url);
  if (!url) return reply('Adresse nicht erlaubt (nur öffentliche https- oder webcal-Adressen)', 400);
  try {
    return reply(await fetchIcs(url), 200, 'text/calendar; charset=utf-8');
  } catch (e) {
    return reply(String((e as Error).message || e), 502);
  }
});
