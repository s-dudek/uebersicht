// Kalender: Menü zu einem Termin (Rechtsklick bzw. langes Drücken, cal-drag.js):
// Öffnen, Duplizieren (Tag und Abschnitt wählen), Kopieren nach (anderer Abschnitt), Löschen mit „Rückgängig“.
// Abschnitte, in die man schreiben kann: Termine und Geburtstage der App, beschreibbare Google-Kalender.
import { hm, toMin } from './calendar.js';
import { calOf, extOcc, hideOcc, reloadGoogle, SECTIONS, writableGoogle } from './cal-sources.js';
import { canDeleteItem, esc, itemById, safeColor, sb, state, toast, undoToast } from './core.js';
import { restoreItems, trashItems } from './data.js';
import { addDays, parseYmd, ymd } from './dates.js';
import { evNextRemind, evTitle, isBday } from './events.js';
import { addGoogle, deleteGoogle } from './google-cal.js';
import { render } from './render.js';
import { closeSheet, openSheet } from './sheet.js';

// Termine in Tag, Woche, Monatsliste (eigene und verknüpfte)
export const CAL_ENTRY = ['.cal-panel', '.cal-agenda'].flatMap((p) => [`${p} [data-act="open"][data-id]`, `${p} [data-act="ext-ev"][data-id]`]).join(', ');
const hhmm = (d) => hm(d.getHours() * 60 + d.getMinutes());
const plusHour = (t) => hm(Math.min(toMin(t) + 60, 23 * 60 + 59));

// ---------- Abschnitte ----------
export function calSections() {
  const app = SECTIONS.filter(([k]) => k === 'ev' || k === 'bday').map(([key, name, color]) => ({ key, name, color }));
  return [...app, ...writableGoogle().map((c) => ({ key: 'g:' + c.gcal, name: c.name, color: c.color }))];
}
export const sectionName = (key) => calSections().find((x) => x.key === key)?.name || 'Kalender';
export const sectionOptions = (sel, keys = null) => calSections().filter((x) => !keys || keys.includes(x.key))
  .map((x) => `<option value="${esc(x.key)}" ${x.key === sel ? 'selected' : ''}>${esc(x.name)}</option>`).join('');

// neuer Eintrag in einem Abschnitt. d: { title, desc, location, day, time, end, allDay, span, birth, meta, bday, catId }
export async function createIn(d, key) {
  if (key.startsWith('g:')) {
    const gcal = key.slice(2), end = d.end || plusHour(d.time || '09:00');
    const event = d.allDay || !d.time
      ? { allDay: true, start: d.day, end: addDays(d.day, d.span || 1) }
      : { allDay: false, start: `${d.day}T${d.time}:00`, end: `${d.day}T${end}:00` };
    await addGoogle(gcal, { ...event, title: d.title, location: d.location || '', desc: d.desc || '' });
    return reloadGoogle(gcal);
  }
  const bday = key === 'bday', now = new Date().toISOString();
  const meta = d.meta && !!d.bday === bday ? { ...d.meta }
    : bday ? { kind: 'birthday', repeat: 'yearly', remind: '0', time: '', end: '' }
      : { kind: 'event', repeat: '', remind: '', time: d.allDay ? '' : d.time || '', end: d.allDay ? '' : d.end || '' };
  const row = { id: crypto.randomUUID(), owner_id: state.me, type: 'event', title: d.title || '', body: d.desc || '',
    due_date: bday && d.birth ? d.birth : d.day, category_id: d.catId || null, meta };
  row.remind_at = evNextRemind(row);
  const { error } = await sb.from('items').insert(row);   // ohne .select() (siehe CLAUDE.md)
  if (error) throw new Error(error.message);
  state.items.unshift({ ...row, done: false, reminded: false, created_at: now, updated_at: now });
  render();
}

// Termin unter dem Element, einheitlich beschrieben (App-Termin ev oder verknüpfter Termin x)
function entryOf(el) {
  const day = el.closest('[data-slotday]')?.dataset.slotday;
  if (el.dataset.act === 'ext-ev') {
    const o = extOcc(el.dataset.id);
    if (!o) return null;
    const span = o.allDay ? Math.max(1, Math.round((o.end - o.start) / 864e5)) : 1;
    return { kind: 'x', o, el, title: o.title, desc: o.desc || '', location: o.location || '', day: ymd(o.start), allDay: o.allDay, span,
      time: o.allDay ? '' : hhmm(o.start), end: o.allDay ? '' : hhmm(o.end), canDelete: !!(o.gcal && calOf(o.cal)?.writable), gcal: o.gcal,
      section: o.gcal ? 'g:' + o.gcal : '' };
  }
  const i = itemById(el.dataset.id);
  if (!i || i.type !== 'event') return null;
  const bday = isBday(i);
  return { kind: 'ev', i, el, title: i.title || '', desc: i.body || '', location: '', bday, span: 1,
    day: bday ? (day || `${(state.calDate || ymd(new Date())).slice(0, 4)}${i.due_date.slice(4)}`) : i.due_date,
    allDay: !i.meta?.time, time: i.meta?.time || '', end: i.meta?.end || '', canDelete: canDeleteItem(i),
    birth: bday ? i.due_date : '', meta: i.meta, catId: i.category_id, section: bday ? 'bday' : 'ev' };
}

// Einträge für showMenu (menu.js) oder null, wenn kein Termin getroffen ist
export function calMenuEntries(target) {
  const el = target.closest(CAL_ENTRY), e = el && entryOf(el);
  if (!e) return null;
  const entries = [['eye', 'Öffnen', () => el.click()], 'sep',
    ['stack', 'Duplizieren …', () => openDuplicate(e)],
    ['share', 'Kopieren nach …', () => openCopy(e)]];
  if (e.canDelete) entries.push('sep', ['trash', 'Löschen', () => removeEntry(e), { danger: true }]);
  return entries;
}

// ---------- Löschen: sofort weg, 5 Sekunden „Rückgängig“ ----------
async function removeEntry(e) {
  const name = e.kind === 'ev' ? evTitle(e.i) : e.title || 'Termin';
  if (e.kind === 'ev') {
    if (!(await trashItems([e.i.id]))) return;
    return undoToast(`„${name}“ gelöscht`, { undo: () => restoreItems([e.i.id]) });
  }
  // Google: erst nach Ablauf wirklich löschen, bis dahin nur ausblenden
  hideOcc(e.o.id, true);
  render();
  undoToast(`„${name}“ gelöscht`, {
    undo: () => { hideOcc(e.o.id, false); render(); },
    done: async () => {
      try { await deleteGoogle(e.o); await reloadGoogle(e.gcal); } catch (err) { toast('Google: ' + err.message, 5000); }
      hideOcc(e.o.id, false);
      render();
    },
  });
}

// ---------- Duplizieren: Tag und Abschnitt wählen ----------
function openDuplicate(e) {
  const sel = calSections().some((x) => x.key === e.section) ? e.section : 'ev';
  const sheet = openSheet(`<div class="sheet-head"><h2>Duplizieren</h2><button class="link-btn" data-close>Abbrechen</button></div>
    <p class="cm-what"><b>${esc(e.title || 'Termin')}</b><span>${esc(e.allDay ? 'ganztägig' : `${e.time}${e.end ? '–' + e.end : ''}`)}</span></p>
    <form id="dup-form">
      <div class="field"><label for="dup-day">Tag</label><input class="input" type="date" id="dup-day" value="${esc(e.day)}" required></div>
      <div class="field"><label for="dup-sec">Abschnitt</label><select class="select" id="dup-sec">${sectionOptions(sel)}</select></div>
      <button class="btn block" id="dup-go">Duplizieren</button>
    </form>`);
  sheet.querySelector('[data-close]').addEventListener('click', closeSheet);
  sheet.querySelector('#dup-form').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const day = sheet.querySelector('#dup-day').value, key = sheet.querySelector('#dup-sec').value;
    if (!day) return;
    const btn = sheet.querySelector('#dup-go');
    btn.disabled = true;
    try {
      await createIn({ ...e, day, birth: '' }, key);
      closeSheet();
      toast(`Dupliziert auf ${parseYmd(day).toLocaleDateString('de-AT', { weekday: 'short', day: 'numeric', month: 'short' })}`);
    } catch (err) {
      btn.disabled = false;
      toast('Fehler: ' + err.message, 5000);
    }
  });
}

// ---------- Kopieren nach: gleicher Tag, anderer Abschnitt ----------
function openCopy(e) {
  const list = calSections().filter((x) => x.key !== e.section);
  const sheet = openSheet(`<div class="sheet-head"><h2>Kopieren nach</h2><button class="link-btn" data-close>Abbrechen</button></div>
    <p class="cm-what"><b>${esc(e.title || 'Termin')}</b><span>${esc(parseYmd(e.day).toLocaleDateString('de-AT', { weekday: 'long', day: 'numeric', month: 'long' }))}</span></p>
    <div class="cm-secs">${list.map((x) => `<button class="cm-sec" data-sec="${esc(x.key)}"><i style="background:${safeColor(x.color, '#0C3741')}"></i><span>${esc(x.name)}</span></button>`).join('')}</div>`);
  sheet.querySelector('[data-close]').addEventListener('click', closeSheet);
  sheet.querySelectorAll('[data-sec]').forEach((b) => b.addEventListener('click', async () => {
    b.disabled = true;
    try {
      await createIn(e, b.dataset.sec);
      closeSheet();
      toast(`Kopiert nach ${sectionName(b.dataset.sec)}`);
    } catch (err) {
      b.disabled = false;
      toast('Fehler: ' + err.message, 5000);
    }
  }));
}
