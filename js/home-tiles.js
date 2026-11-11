// Startseite: Kacheln wie Widgets am iPhone – Datum, Kalender (Termine), Todos, Notizen, Gerichte, Training
// und alles, was „Zu Home hinzugefügt“ wurde (Kategorien, Notizen, Todos; pins.js).
// Am Desktop größer und mit mehr Inhalt (Kalender groß: Tag als Zeitleiste, Todos zum Abhaken).
// Reihenfolge und Größe je Person, getrennt für Desktop (profiles.cat_order: 'tiles'/'tilesz', Desktop 'tilesD'/'tileszD'; Größen als "todos:s").
// Langes Drücken: Menü mit Größe und „Home-Bildschirm bearbeiten“ (menu.js), weiterziehen = verschieben (drag.js).
// Im Bearbeiten-Modus wackeln die Kacheln, lassen sich sofort ziehen und haben einen Knopf für die Größe.
import { dayContent, hm } from './calendar.js';
import { catById, esc, isDesktop, isTodoList, safeColor, sketchSrc, state, store } from './core.js';
import { addDays, isoWeek, mondayOf, remindLabel, ymd } from './dates.js';
import { evTitle } from './events.js';
import { catOrder, catSym, saveCatOrder } from './folders.js';
import { ICON } from './icons.js';
import { calDayBody } from './home.js';
import { SLOTS, mealsOn } from './meals.js';
import { pinned } from './pins.js';
import { render } from './render.js';

export const SIZES = [['s', 'Klein', 'szS'], ['m', 'Mittel', 'szM'], ['l', 'Groß', 'szL']];
const kind = (k) => k + (isDesktop() ? 'D' : '');   // eigenes Layout am Desktop
const byNewest = (a, b) => b.updated_at.localeCompare(a.updated_at);
const titles = (list) => list.map((i) => i.title || 'Ohne Titel');
const checks = (list) => list.map((i) => ({ id: i.id, text: i.title || 'Ohne Titel' }));   // Todos: zum Abhaken
const slotName = (m) => SLOTS.find(([k]) => k === m.meta?.slot)?.[1];

// ---------- Füllung der Kacheln: Kennzahl (Klein) und Grafik unten (Mittel/Groß) ----------
// Wochenleiste Mo–So: je Tag ein Punkt (0 leer, 1 geplant, 2 erledigt), heute hervorgehoben
function weekStrip(today, level) {
  const mon = mondayOf(new Date()), days = ['M', 'D', 'M', 'D', 'F', 'S', 'S'];
  return `<span class="mt-week">${days.map((l, k) => {
    const d = addDays(mon, k), v = level(d);
    return `<span class="${d === today ? 'now' : ''}"><small>${l}</small><i class="lv${v}"></i></span>`;
  }).join('')}</span>`;
}
// Fortschritt als Balken mit Text
const progress = (done, all, text) => `<span class="mt-prog"><span><i style="width:${all ? Math.round((done / all) * 100) : 0}%"></i></span><small>${esc(text)}</small></span>`;
// „vor 5 Min.“, „vor 3 Std.“, „gestern“ …
function ago(iso) {
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 6e4);
  if (m < 1) return 'gerade eben';
  if (m < 60) return `vor ${m} Min.`;
  if (m < 1440) return `vor ${Math.round(m / 60)} Std.`;
  return m < 2880 ? 'gestern' : `vor ${Math.round(m / 1440)} Tagen`;
}
// nächster Termin heute (ab jetzt), sonst null
function nextToday(today) {
  const now = new Date().getHours() * 60 + new Date().getMinutes();
  return dayContent(today, 'home').timed.find((t) => t.end > now) || null;
}

// alle Kacheln: { key, label, icon, color, size, act, lines, empty, badge, ink (Canvas-Ordner oder 'last') }
function allTiles(today) {
  const todos = () => state.items.filter((i) => i.type === 'todo' && !i.done);
  const notes = () => state.items.filter((i) => i.type === 'note').sort(byNewest);
  const upcoming = () => state.items.filter((i) => i.remind_at && !i.reminded && !i.done).sort((a, b) => a.remind_at.localeCompare(b.remind_at));
  const trainingOn = (d) => state.items.filter((i) => i.type === 'training' && i.due_date === d);
  const base = [
    { key: 'date', label: 'Datum', size: 'l', desk: 's', act: `data-act="home-cal" data-id="${today}"` },
    { key: 'cal', label: 'Kalender', icon: ICON.calendar, accent: '#3E7CA8', size: 'm', desk: 'l', act: `data-act="home-cal" data-id="${state.homeDay || today}"`,
      lines: () => calRows(today), empty: 'Heute nichts eingetragen', badge: true,
      stat: () => { const t = nextToday(today); return t ? { big: hm(t.start), sub: t.label } : { big: String(calRows(today).length), sub: 'Termine heute' }; },
      foot: () => weekStrip(today, (d) => { const c = dayContent(d, 'home'); return c.timed.length + c.allday.length ? 1 : 0; }) },
    { key: 'todos', label: 'Todos', icon: ICON.todos, accent: '#4E7569', size: 's', desk: 'm', act: 'data-act="nav" data-id="todos"', lines: () => checks(todos()), empty: 'Alles erledigt', badge: true,
      stat: () => { const open = todos(), late = open.filter((i) => i.due_date && i.due_date < today).length; return { big: String(open.length), sub: late ? `${late} überfällig` : open.length ? 'offen' : 'alles erledigt' }; },
      foot: () => { const all = state.items.filter((i) => i.type === 'todo'), done = all.filter((i) => i.done).length; return progress(done, all.length, `${done} von ${all.length} erledigt`); } },
    { key: 'notes', label: 'Notizen', icon: ICON.notes, accent: '#7FA08A', size: 's', desk: 'm', act: 'data-act="nav" data-id="notes"', ink: 'last',
      lines: () => titles(notes()), empty: 'Noch keine Notizen', badge: true,
      stat: () => ({ big: String(notes().length), sub: notes().length === 1 ? 'Notiz' : 'Notizen' }),
      foot: () => { const n = notes()[0]; return n ? `<span class="mt-foot">Zuletzt bearbeitet ${esc(ago(n.updated_at))}</span>` : ''; } },
    { key: 'meals', label: 'Gerichte', icon: ICON.pot, accent: '#D9873E', size: 'm', act: 'data-act="nav" data-id="meals"',
      lines: () => mealsOn(today).map((m) => (slotName(m) ? `${slotName(m)}: ${m.title}` : m.title)), empty: 'Heute nichts geplant',
      stat: () => { const m = mealsOn(today)[0]; return m ? { big: slotName(m) || 'Heute', sub: m.title, word: true } : { big: '–', sub: 'nichts geplant' }; },
      foot: () => weekStrip(today, (d) => (mealsOn(d).length ? 1 : 0)) },
    { key: 'reminders', label: 'Erinnerungen', icon: ICON.bell, accent: '#D9873E', size: 's', act: 'data-act="nav" data-id="reminders"', badge: true,
      lines: () => upcoming().map((i) => `${remindLabel(i.remind_at)} · ${i.type === 'event' ? evTitle(i) : i.title || 'Erinnerung'}`), empty: 'Keine Erinnerungen',
      stat: () => { const n = upcoming()[0]; return n ? { big: remindLabel(n.remind_at).split(' ').pop(), sub: n.type === 'event' ? evTitle(n) : n.title || 'Erinnerung' } : { big: '0', sub: 'keine gestellt' }; } },
    { key: 'training', label: 'Training', icon: ICON.dumbbell, accent: '#C2575A', size: 's', act: 'data-act="nav" data-id="training"',
      lines: () => titles(trainingOn(today)), empty: 'Heute frei',
      stat: () => { const t = trainingOn(today)[0]; return t ? { big: t.done ? 'Erledigt' : 'Heute', sub: t.title, word: true } : { big: 'Frei', sub: 'kein Training heute', word: true }; },
      foot: () => weekStrip(today, (d) => { const t = trainingOn(d); return t.some((x) => x.done) ? 2 : t.length ? 1 : 0; }) },
  ];
  const pins = pinned().map(({ key, type, obj }) => {
    if (type === 'cat') {
      const list = isTodoList(obj);
      const inside = state.items.filter((i) => i.category_id === obj.id && (list ? i.type === 'todo' && !i.done : i.type === 'note'));
      return { key, label: obj.name, icon: catSym(obj), accent: safeColor(obj.color, '#4E7569'), size: 'm', act: obj.canvas_only ? `data-act="home-canvas" data-id="${obj.id}"` : `data-act="pin-open" data-id="${obj.id}"`,
        lines: () => (list ? checks : titles)(inside.sort(byNewest)), empty: list ? 'Alles erledigt' : 'Leer', badge: !obj.canvas_only, ink: list || obj.canvas_only ? null : obj.id,
        stat: () => (obj.canvas_only ? { big: 'Canvas', sub: 'öffnen', word: true } : { big: String(inside.length), sub: list ? 'offen' : inside.length === 1 ? 'Notiz' : 'Notizen' }) };
    }
    const i = obj;
    return { key, label: i.type === 'note' ? i.title || 'Notiz' : 'Todo', icon: i.type === 'note' ? ICON.notes : ICON.todos, accent: i.type === 'note' ? '#7FA08A' : '#4E7569', size: 's', act: `data-act="open" data-id="${i.id}"`,
      lines: () => (i.type === 'note' ? String(i.body || '').split('\n').filter(Boolean) : checks([i])), empty: i.type === 'note' ? 'Kein Text' : '',
      img: i.type === 'note' ? sketchSrc(i) : '',   // Skizze aus dem Canvas
      stat: () => (i.type === 'note' ? { big: '', sub: String(i.body || '').split('\n').find(Boolean) || 'Kein Text' } : { big: '', sub: i.title || 'Ohne Titel' }) };
  });
  // Standardgröße: am Desktop teils größer (mehr Platz für Inhalt)
  return [...base, ...pins].map((t) => ({ ...t, size: isDesktop() && t.desk ? t.desk : t.size }));
}

// gespeicherte Reihenfolge; neue Kacheln an ihrer Standardstelle einfügen (z. B. „Datum“ vorne)
const ordered = (tiles) => {
  const list = catOrder(kind('tiles')).map((k) => tiles.find((t) => t.key === k)).filter(Boolean);
  tiles.forEach((t, i) => { if (!list.includes(t)) list.splice(Math.min(i, list.length), 0, t); });
  return list;
};
export const tileSize = (key, fallback = 's') => {
  const s = catOrder(kind('tilesz')).find((x) => x.startsWith(key + ':') && !x.slice(key.length + 1).includes(':'))?.slice(key.length + 1);
  return SIZES.some(([k]) => k === s) ? s : fallback;
};
export function setTileSize(key, size) {
  saveCatOrder(kind('tilesz'), [...catOrder(kind('tilesz')).filter((x) => !(x.startsWith(key + ':') && !x.slice(key.length + 1).includes(':'))), `${key}:${size}`]);
}
export function setHomeEdit(on) { state.homeEdit = on; render(); }
export const isPinTile = (key) => /^[ci]:/.test(key);

// Zeilen der Vorschau: schmal Mittel 1 / Groß 5, Desktop Mittel 5 / Groß 10 (zweispaltig)
const previewRows = (size) => (size === 's' ? 0 : isDesktop() ? (size === 'l' ? 10 : 5) : size === 'l' ? 5 : 1);
const line = (x) => (typeof x === 'object'
  ? `<li class="mt-todo"><button class="tcheck" data-act="toggle" data-id="${x.id}" aria-label="Erledigt"></button><span>${esc(x.text)}</span></li>`
  : `<li>${esc(x)}</li>`);

// Datum (dunkel): Wochentag, Tag groß, Monat; Ring mit Kalenderwoche zeigt, wie weit das Jahr ist;
// Groß zusätzlich Tag im Jahr als Balken und die laufende Woche
function dateBody(size, d) {
  if (size === 's' && !isDesktop()) return `<small class="md-wd">${d.toLocaleDateString('de-AT', { weekday: 'short' })}</small><b class="md-day">${d.getDate()}</b>`;
  const y = d.getFullYear(), days = (new Date(y + 1, 0, 1) - new Date(y, 0, 1)) / 864e5;
  const nth = Math.floor((new Date(y, d.getMonth(), d.getDate()) - new Date(y, 0, 1)) / 864e5) + 1, part = nth / days;
  const ring = `<span class="md-ring" title="${nth}. Tag des Jahres"><svg viewBox="0 0 36 36" aria-hidden="true"><circle cx="18" cy="18" r="15.5"/><circle class="on" cx="18" cy="18" r="15.5" pathLength="100" stroke-dasharray="${(part * 100).toFixed(1)} 100"/></svg><em>KW</em><b>${isoWeek(ymd(d))}</b></span>`;
  const tall = size === 'l' || (size === 'm' && isDesktop());   // genug Höhe für Jahresbalken und Woche
  const year = tall ? `<span class="md-year"><span><i style="width:${(part * 100).toFixed(1)}%"></i></span><small>Tag ${nth} von ${days} · noch ${days - nth} Tage</small></span>` : '';
  const week = tall ? `<span class="mt-dweek">${Array.from({ length: 7 }, (_, k) => {
    const x = addDays(mondayOf(d), k);
    return `<span class="${x === ymd(d) ? 'now' : ''}"><small>${['M', 'D', 'M', 'D', 'F', 'S', 'S'][k]}</small>${+x.slice(8)}</span>`;
  }).join('')}</span>` : '';
  return `<span class="md-top"><small class="md-wd">${d.toLocaleDateString('de-AT', { weekday: 'long' })}</small>${ring}</span>
    <b class="md-day">${d.getDate()}</b><span class="md-month">${d.toLocaleDateString('de-AT', { month: 'long', year: 'numeric' })}</span>${year}${week}`;
}

// Termine des Tages als Zeilen (nur die für die Startseite eingeschalteten Abschnitte)
function calRows(today) {
  const { timed, allday } = dayContent(today, 'home');
  return [...allday.map((a) => `ganztägig · ${a.label}`), ...timed.map((t) => `${hm(t.start)} · ${t.label}`)];
}

// Inhalt je Kachel und Größe: klein nur Symbol und Name, größer mit Vorschau
// Klein: Symbol, Name und große Kennzahl; Mittel/Groß: Liste und unten eine Grafik (Wochenleiste, Fortschritt …);
function body(t, size, today, d) {
  if (t.key === 'date') return dateBody(size, d);
  if (t.key === 'cal' && size === 'l' && isDesktop()) return calDayBody(today);   // Desktop groß: Tag als Zeitleiste
  const head = `<span class="mt-h"><span class="mt-ic">${t.icon}</span><span>${esc(t.label)}</span></span>`;
  if (t.img) return `${head}<img class="mt-img" src="${esc(t.img)}" alt="">`;   // Notiz mit Skizze: das Bild füllt die Kachel
  if (size === 's') {
    const s = t.stat?.() || { big: '', sub: '' };
    // schmal (Handy): Name steht vor der Angabe unten statt neben dem Symbol
    return `${head}<span class="mt-stat ${s.word ? 'word' : ''}">${s.big ? `<b>${esc(s.big)}</b>` : ''}<small><em>${esc(t.label)}</em><span>${esc(s.sub)}</span></small></span>`;
  }
  const lines = t.lines(), n = previewRows(size);
  const badge = t.badge && lines.length ? `<i>${lines.length}</i>` : '';
  const preview = n ? `<ul class="mt-list">${(lines.length ? lines : [t.empty]).slice(0, n).map(line).join('')}</ul>` : '';
  return `${badge}${head}${preview}${t.foot ? `<span class="mt-fill"></span>${t.foot(size)}` : ''}`;
}

export function renderTiles(today, d) {
  const edit = !!state.homeEdit;
  const tile = (t) => {
    const size = tileSize(t.key, t.size), wide = t.key === 'cal' && size === 'l' && isDesktop();
    // Notizen bzw. Notiz-Ordner: Knopf direkt in den Canvas
    const ink = !edit && t.ink != null ? `<button class="mt-ink" data-act="home-canvas" data-id="${esc(t.ink)}" aria-label="Canvas öffnen" title="Canvas">${ICON.ink}</button>` : '';
    const ac = t.accent ? ` style="--ac:${safeColor(t.accent, '#4E7569')}"` : '';
    return `<div class="mt mt-${isPinTile(t.key) ? 'pin' : t.key} sz-${size} ${wide ? 'mt-day dash-day' : ''}"${ac} role="button" tabindex="0" aria-label="${esc(t.label)}" data-tile="${esc(t.key)}" data-cdrag="${esc(t.key)}" ${edit ? '' : t.act}>
      ${body(t, size, today, d)}${ink}
      ${edit ? `<button class="mt-size" data-act="tile-size" data-id="${esc(t.key)}" aria-label="Größe ändern">${ICON[SIZES.find(([k]) => k === size)[2]]}</button>` : ''}</div>`;
  };
  return `<div class="mtiles ${edit ? 'editing' : ''}" data-cgrid="${kind('tiles')}">${ordered(allTiles(today)).map(tile).join('')}</div>`;
}

// Canvas eines Notiz-Ordners öffnen ('last' = zuletzt benutzter)
function openCanvas(id) {
  const last = store('inkFolder') ?? '';
  const fid = id === 'last' ? (last === '' || catById(last) ? last : '') : id;
  Object.assign(state, { tab: 'notes', list: fid, noteMode: 'ink', keepList: true });
  render();
}

export function tileAction(act, id) {
  if (act === 'tile-size') {
    const t = allTiles('').find((x) => x.key === id);
    const i = SIZES.findIndex(([k]) => k === tileSize(id, t?.size));
    return setTileSize(id, SIZES[(i + 1) % SIZES.length][0]);
  }
  if (act === 'home-edit') return setHomeEdit(!state.homeEdit);
  if (act === 'home-canvas') return openCanvas(id);
}

// Standardgröße einer Kachel (für das Menü)
export const defaultSize = (key) => allTiles('').find((t) => t.key === key)?.size || 's';
