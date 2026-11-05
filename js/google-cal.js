// Google-Kalender bearbeiten: Verbinden (einmal „Zugriff erlauben“), Kalenderliste samt Unterkalendern,
// Termine laden, ändern, anlegen, löschen.
// Alles läuft über die Edge Function "google-calendar"; die Google-Schlüssel bleiben auf dem Server.
import { askConfirm, esc, safeColor, sb, store, toast } from './core.js';
import { addDays, ymd } from './dates.js';
import { closeSheet, openSheet } from './sheet.js';

const TZ = (() => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone; } catch { return 'Europe/Vienna'; } })();
const pad = (n) => String(n).padStart(2, '0');
const hhmm = (d) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
export const G_BLUE = '#4285F4';

// Aufruf der Funktion; Fehlertext der Funktion weiterreichen
async function call(action, extra = {}) {
  const { data, error } = await sb.functions.invoke('google-calendar', { body: { action, tz: TZ, ...extra } });
  if (error) {
    const msg = await error.context?.json?.().then((j) => j.error).catch(() => '');
    throw new Error(msg || error.message);
  }
  return data || {};
}

// verbunden? und welche Kalender (gcal = Google-ID, writable = darf man Termine anlegen/ändern)
export async function googleStatus() {
  const off = { connected: false, email: '', reconnect: false, cals: [] };
  try {
    const d = await call('status');
    if (!d.connected) return off;
    const l = await call('calendars');
    const cals = (Array.isArray(l.calendars) ? l.calendars : []).filter((c) => c && /^[\w.@#+-]{1,300}$/.test(c.id)).map((c) => ({
      gcal: c.id, name: String(c.name || 'Kalender').slice(0, 100), color: safeColor(c.color, G_BLUE), primary: !!c.primary, writable: !!c.writable,
    })).sort((a, b) => b.primary - a.primary);
    return { connected: true, email: String(d.email || '').slice(0, 200), reconnect: !!l.reconnect, cals };
  } catch { return off; }
}

// zu Google „Zugriff erlauben“ und danach zurück in die App (?google=ok)
export async function connectGoogle() {
  try {
    const { url } = await call('start');
    if (!/^https:\/\/accounts\.google\.com\//.test(url || '')) throw new Error('Unerwartete Antwort');
    location.href = url;
  } catch (e) { toast('Google: ' + e.message, 5000); }
}

export const disconnectGoogle = () => call('disconnect');

// Rückkehr von Google: Meldung zeigen, Adresse aufräumen
export function handleGoogleReturn() {
  const r = new URLSearchParams(location.search).get('google');
  if (!r) return;
  history.replaceState(null, '', location.pathname);
  setTimeout(() => toast(r === 'ok' ? 'Google-Kalender verbunden.' : 'Google-Verbindung hat nicht geklappt.', 4000), 800);
}

// Google-Termin → Vorkommen wie bei den ICS-Abos (Date-Objekte, gid = Google-ID)
const toDate = (v, allDay) => { if (!allDay) return new Date(v); const [y, m, d] = String(v).split('-').map(Number); return new Date(y, m - 1, d); };
export async function listGoogle(gcal, from, to) {
  const { events } = await call('list', { cal: gcal, from: from.toISOString(), to: to.toISOString() });
  return (Array.isArray(events) ? events : []).filter((e) => e && /^[a-z0-9_]+$/i.test(e.id) && e.start && e.end).map((e) => ({
    gid: e.id, title: String(e.title || '(ohne Titel)').slice(0, 300), location: String(e.location || '').slice(0, 300),
    desc: String(e.desc || '').slice(0, 4000), allDay: !!e.allDay, recurring: !!e.recurring,
    start: toDate(e.start, e.allDay), end: toDate(e.end, e.allDay),
  })).filter((o) => !isNaN(o.start) && !isNaN(o.end));
}

// Bearbeiten-Fenster: o = vorhandenes Vorkommen (mit gcal) oder null für neu.
// Beim Anlegen: cals = beschreibbare Kalender, sel = vorgewählter, pre = schon Eingetipptes,
// toApp(pre) wechselt zum Termin in der App. onDone(gcal) lädt den Kalender neu.
export function openGoogleEvent(o, { day = ymd(new Date()), time = '', cals = [], sel = '', pre = {}, toApp = null, color = G_BLUE, name = 'Google', onDone } = {}) {
  const isNew = !o;
  const pick = isNew && (cals.length > 1 || toApp);
  const st = o ? o.start : new Date(`${day}T${time || '09:00'}`);
  const en = o ? (o.allDay ? new Date(o.end - 864e5) : o.end) : new Date(st.getTime() + 36e5);
  const allDay = o ? o.allDay : false;
  const head = isNew ? cals.find((c) => c.gcal === sel) || cals[0] || { name: 'Google', color: G_BLUE } : { name, color };
  const sheet = openSheet(`<div class="sheet-head"><span class="status"><i class="src-dot" style="background:${safeColor(head.color, G_BLUE)}"></i>${esc(head.name)}</span><button class="link-btn" data-close>Abbrechen</button></div>
    <form id="ge-form">
      ${pick ? `<div class="field"><label for="ge-cal">Kalender</label><select class="select" id="ge-cal">
        ${toApp ? '<option value="">Übersicht (App)</option>' : ''}${cals.map((c) => `<option value="${esc(c.gcal)}" ${c.gcal === head.gcal ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select></div>` : ''}
      <input class="title-input" id="ge-title" placeholder="Was steht an?" value="${esc(o?.title || pre.title || '')}" autocomplete="off" maxlength="300">
      <button class="menu-item" id="ge-all" type="button" style="margin-top:12px">Ganztägig<span class="sw ${allDay ? 'on' : ''}"></span></button>
      <div class="field"><label>Beginn</label><div class="row-inline"><input class="input" type="date" id="ge-d1" value="${ymd(st)}" required><input class="input ge-t" type="time" id="ge-t1" value="${hhmm(st)}"></div></div>
      <div class="field"><label>Ende</label><div class="row-inline"><input class="input" type="date" id="ge-d2" value="${ymd(en)}" required><input class="input ge-t" type="time" id="ge-t2" value="${hhmm(en)}"></div></div>
      <div class="field"><label for="ge-loc">Ort</label><input class="input" id="ge-loc" maxlength="300" value="${esc(o?.location || '')}"></div>
      <div class="field"><label for="ge-desc">Beschreibung</label><textarea class="textarea" id="ge-desc" style="min-height:80px" maxlength="4000">${esc(o?.desc || pre.desc || '')}</textarea></div>
      ${o?.recurring ? '<p class="hint">Wiederkehrender Termin: geändert wird nur dieser eine Termin.</p>' : ''}
      <button class="btn block" id="ge-save">${isNew ? 'In Google anlegen' : 'Speichern'}</button>
      ${isNew ? '' : `<button class="btn danger block" type="button" id="ge-del" style="margin-top:10px">Termin löschen</button>`}
    </form>`);
  let all = allDay;
  const $ = (s) => sheet.querySelector(s);
  const showTimes = () => sheet.querySelectorAll('.ge-t').forEach((t) => { t.hidden = all; });
  showTimes();
  $('[data-close]').addEventListener('click', closeSheet);
  // anderer Kalender gewählt: merken (gilt fürs nächste Anlegen); „Übersicht“ wechselt zum Termin in der App
  $('#ge-cal')?.addEventListener('change', (e) => {
    if (!e.target.value) {
      store('calTarget', 'app');
      const p = { title: $('#ge-title').value, desc: $('#ge-desc').value, day: $('#ge-d1').value || day, time: all ? '' : $('#ge-t1').value };
      closeSheet();
      return toApp(p);
    }
    store('calTarget', e.target.value);
    const c = cals.find((x) => x.gcal === e.target.value);
    if (c) { $('.sheet-head .src-dot').style.background = c.color; $('.sheet-head .status').lastChild.textContent = c.name; }
  });
  $('#ge-all').addEventListener('click', () => { all = !all; $('#ge-all .sw').classList.toggle('on', all); showTimes(); });
  // Beginn verschoben: Ende mitziehen, wenn es sonst davor läge
  $('#ge-d1').addEventListener('change', () => { if ($('#ge-d2').value < $('#ge-d1').value) $('#ge-d2').value = $('#ge-d1').value; });

  const busy = async (btn, fn, gcal) => {
    btn.disabled = true;
    try { await fn(); closeSheet(); await onDone?.(gcal); } catch (e) { toast('Google: ' + e.message, 5000); btn.disabled = false; }
  };
  $('#ge-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const d1 = $('#ge-d1').value, d2 = $('#ge-d2').value || d1, t1 = $('#ge-t1').value || '09:00', t2 = $('#ge-t2').value || t1;
    const event = all
      ? { allDay: true, start: d1, end: addDays(d2 < d1 ? d1 : d2, 1) }
      : { allDay: false, start: `${d1}T${t1}:00`, end: `${d2}T${t2}:00` };
    if (!all && event.end <= event.start) return toast('Das Ende liegt vor dem Beginn.', 3000);
    Object.assign(event, { title: $('#ge-title').value.trim(), location: $('#ge-loc').value.trim(), desc: $('#ge-desc').value });
    const gcal = o ? o.gcal : $('#ge-cal')?.value || cals[0]?.gcal || 'primary';
    busy($('#ge-save'), () => call('save', { cal: gcal, id: o?.gid, event }), gcal);
  });
  $('#ge-del')?.addEventListener('click', async () => {
    if (!(await askConfirm(`„${o.title}“ löschen?`, 'Löschen', 'Der Termin wird auch in Google gelöscht.'))) return;
    busy($('#ge-del'), () => call('delete', { cal: o.gcal, id: o.gid }), o.gcal);
  });
  if (isNew) setTimeout(() => $('#ge-title')?.focus(), 60);
}
