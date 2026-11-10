// Kalender-Abschnitte (wie die Kalenderliste bei Google): eigene Abschnitte der App und verknüpfte Kalender (ICS-Abos).
// Was ausgeblendet ist, wird je Person gespeichert (profiles.cal_prefs) – getrennt für Kalender und Startseite.
import { safeColor, sb, state, toast } from './core.js';
import { addDays, ymd } from './dates.js';
import { disconnectGoogle, googleStatus, listGoogle } from './google-cal.js';
import { expand, parseIcs } from './ics.js';
import { render } from './render.js';

// eigene Abschnitte: Schlüssel, Name, Farbe
export const SECTIONS = [
  ['ev', 'Termine', '#0C3741'], ['bday', 'Geburtstage', '#7FA08A'], ['todo', 'Todos mit Datum', '#3E7CA8'],
  ['meal', 'Gerichte', '#A8BEA7'], ['train', 'Training', '#D9873E'], ['rem', 'Erinnerungen', '#6E8582'],
];
export const EXT_COLORS = ['#7A5AA6', '#C2575A', '#3E7CA8', '#D9873E', '#C9A227', '#4E7569'];
const STALE = 15 * 60e3;          // verknüpfte Kalender höchstens alle 15 Minuten neu holen
const WINDOW = [-120, 500];       // aufgeklappt von … bis … Tage um heute

// ---------- Einstellungen: ausgeblendete Abschnitte ----------
const prefs = () => {
  const p = state.profiles[state.me]?.cal_prefs;
  return { hide: Array.isArray(p?.hide) ? p.hide : [], home: Array.isArray(p?.home) ? p.home : [] };
};
// where: 'hide' (Kalender) oder 'home' (Startseite)
export const isShown = (key, where = 'hide') => !prefs()[where].includes(key);

export async function toggleSection(key, where = 'hide') {
  const p = prefs();
  p[where] = p[where].includes(key) ? p[where].filter((k) => k !== key) : [...p[where], key];
  const me = state.profiles[state.me] || (state.profiles[state.me] = { id: state.me });
  me.cal_prefs = p;
  render();
  const { error } = await sb.from('profiles').update({ cal_prefs: p }).eq('id', state.me);
  if (error) toast('Einstellung nicht gespeichert: ' + error.message, 4000);
}

// ---------- Verknüpfte Kalender ----------
export let calendars = [];      // [{ id, name, color }] – Google-Kalender zusätzlich mit gcal, writable
export const google = { connected: false, email: '', reconnect: false, cals: [] };
const feeds = new Map();        // id -> { at, byDay: Map<tag, Vorkommen[]>, error }
const occById = new Map();      // Vorkommen-ID -> Vorkommen (für das Fenster mit Einzelheiten)
let loading = null, listAt = 0;

// einmal laden und dann nur, wenn veraltet; danach neu zeichnen (gibt das Laden zurück, falls es läuft)
export function ensureExternal(force = false) {
  if (!state.me || loading) return loading;
  if (!force && Date.now() - listAt < STALE) return null;
  loading = refresh(force).finally(() => { loading = null; });
  return loading;
}

async function refresh(force) {
  listAt = Date.now();
  const [{ data, error }, g] = await Promise.all([sb.from('calendars').select('id, name, color').order('created_at'), googleStatus()]);
  Object.assign(google, g);
  calendars = error ? [] : data.map((c) => ({ id: c.id, name: String(c.name).slice(0, 60), color: safeColor(c.color, EXT_COLORS[0]) }));
  // jeder Google-Kalender (auch Unterkalender) als eigener Eintrag zum Ein- und Ausblenden
  calendars.push(...google.cals.map((c) => ({ id: 'g:' + c.gcal, gcal: c.gcal, name: c.name, color: c.color, writable: c.writable, google: true })));
  for (const id of feeds.keys()) if (!calendars.some((c) => c.id === id)) feeds.delete(id);
  await Promise.all(calendars.filter((c) => force || !feeds.has(c.id) || Date.now() - feeds.get(c.id).at > STALE).map(loadFeed));
  render();
}

// Termine eines Kalenders holen: Google über die eigene Funktion, sonst das ICS-Abo
async function occurrences(cal, from, to) {
  if (cal.google) return (await listGoogle(cal.gcal, from, to)).map((o) => ({ ...o, key: o.gid, gcal: cal.gcal }));
  const { data, error } = await sb.functions.invoke('calendar-feed', { body: { id: cal.id } });
  if (error) throw new Error((await error.context?.text?.().catch(() => '')) || error.message);
  return expand(parseIcs(typeof data === 'string' ? data : ''), from, to).map((o, k) => ({ ...o, key: k }));
}

async function loadFeed(cal) {
  try {
    const today = new Date(), from = new Date(addDays(ymd(today), WINDOW[0])), to = new Date(addDays(ymd(today), WINDOW[1]));
    const list = await occurrences(cal, from, to);
    for (const id of occById.keys()) if (id.startsWith(`x:${cal.id}:`)) occById.delete(id);
    const byDay = new Map();
    list.forEach((o) => {
      const occ = { ...o, id: `x:${cal.id}:${o.key}`, cal: cal.id };
      occById.set(occ.id, occ);
      // ganztägig oder über Mitternacht: an jedem Tag als Leiste, sonst am Starttag mit Uhrzeit
      const last = o.allDay ? new Date(o.end - 1) : o.end;
      const multi = o.allDay || ymd(o.start) !== ymd(new Date(last - 1));
      for (let d = ymd(o.start); d <= ymd(last); d = addDays(d, 1)) {
        if (!byDay.has(d)) byDay.set(d, []);
        byDay.get(d).push({ ...occ, multi });
        if (!multi) break;
      }
    });
    feeds.set(cal.id, { at: Date.now(), byDay, error: null });
  } catch (e) {
    feeds.set(cal.id, { at: Date.now(), byDay: feeds.get(cal.id)?.byDay || new Map(), error: String(e.message || e) });
  }
}

// einen Kalender sofort neu laden (nach dem Ändern eines Google-Termins)
export async function reloadCalendar(id) {
  const cal = calOf(id);
  if (cal) { await loadFeed(cal); render(); }
}
export const reloadGoogle = (gcal) => reloadCalendar('g:' + gcal);
export const writableGoogle = () => calendars.filter((c) => c.google && c.writable);

// Google trennen: Zugriff aufheben, Google-Kalender aus der Liste nehmen
export async function unlinkGoogle() {
  await disconnectGoogle();
  Object.assign(google, { connected: false, email: '', reconnect: false, cals: [] });
  calendars.filter((c) => c.google).forEach((c) => feeds.delete(c.id));
  calendars = calendars.filter((c) => !c.google);
  render();
}

export const feedError = (id) => feeds.get(id)?.error || null;
export const extOcc = (id) => occById.get(id);
export const calOf = (id) => calendars.find((c) => c.id === id);

// gerade gelöschte Termine (noch „Rückgängig“ möglich): schon ausblenden
const gone = new Set();
export const hideOcc = (id, on) => { if (on) gone.add(id); else gone.delete(id); };

// Vorkommen der sichtbaren verknüpften Kalender an einem Tag
export function extOn(day, where = 'hide') {
  return calendars.filter((c) => isShown('x:' + c.id, where))
    .flatMap((c) => (feeds.get(c.id)?.byDay.get(day) || []).filter((o) => !gone.has(o.id)).map((o) => ({ ...o, color: c.color, calName: c.name })));
}

export async function addCalendar({ name, url, color }) {
  const { error } = await sb.from('calendars').insert({ id: crypto.randomUUID(), owner_id: state.me, name: name.trim().slice(0, 60), url: url.trim(), color: safeColor(color, EXT_COLORS[0]) });
  if (error) throw error;
  ensureExternal(true);
}

export async function removeCalendar(id) {
  const { error } = await sb.from('calendars').delete().eq('id', id);
  if (error) throw error;
  calendars = calendars.filter((c) => c.id !== id);
  feeds.delete(id);
  render();
}
