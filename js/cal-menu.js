// Kalender: Menü zu einem Termin (Rechtsklick bzw. langes Drücken, cal-drag.js):
// Öffnen, Duplizieren (Tag und Kalender wählen), Kopieren an eine Person (gehört dann ihr), Löschen mit „Rückgängig“.
import { hm, toMin } from './calendar.js';
import { calOf, extOcc, hideOcc, reloadGoogle, writableGoogle } from './cal-sources.js';
import { canDeleteItem, esc, itemById, nameOf, sb, state, toast, undoToast } from './core.js';
import { restoreItems, trashItems } from './data.js';
import { addDays, parseYmd, ymd } from './dates.js';
import { evTitle, isBday } from './events.js';
import { addGoogle, deleteGoogle } from './google-cal.js';
import { personPicker } from './items.js';
import { render } from './render.js';
import { closeSheet, openSheet } from './sheet.js';

// Termine in Tag, Woche, Monatsliste (eigene und verknüpfte)
export const CAL_ENTRY = ['.cal-panel', '.cal-agenda'].flatMap((p) => [`${p} [data-act="open"][data-id]`, `${p} [data-act="ext-ev"][data-id]`]).join(', ');
const hhmm = (d) => hm(d.getHours() * 60 + d.getMinutes());
const plusHour = (t) => hm(Math.min(toMin(t) + 60, 23 * 60 + 59));

// Termin unter dem Element, einheitlich beschrieben (App-Termin ev oder verknüpfter Termin x)
function entryOf(el) {
  const day = el.closest('[data-slotday]')?.dataset.slotday;
  if (el.dataset.act === 'ext-ev') {
    const o = extOcc(el.dataset.id);
    if (!o) return null;
    const span = o.allDay ? Math.max(1, Math.round((o.end - o.start) / 864e5)) : 1;
    return { kind: 'x', o, el, title: o.title, desc: o.desc || '', location: o.location || '', day: ymd(o.start), allDay: o.allDay, span,
      time: o.allDay ? '' : hhmm(o.start), end: o.allDay ? '' : hhmm(o.end), canDelete: !!(o.gcal && calOf(o.cal)?.writable), gcal: o.gcal };
  }
  const i = itemById(el.dataset.id);
  if (!i || i.type !== 'event') return null;
  const bday = isBday(i);
  return { kind: 'ev', i, el, title: i.title || '', desc: i.body || '', location: '', bday, span: 1,
    day: bday ? (day || `${(state.calDate || ymd(new Date())).slice(0, 4)}${i.due_date.slice(4)}`) : i.due_date,
    allDay: !i.meta?.time, time: i.meta?.time || '', end: i.meta?.end || '', canDelete: canDeleteItem(i) };
}

// Einträge für showMenu (menu.js) oder null, wenn kein Termin getroffen ist
export function calMenuEntries(target) {
  const el = target.closest(CAL_ENTRY), e = el && entryOf(el);
  if (!e) return null;
  const entries = [['eye', 'Öffnen', () => el.click()], 'sep',
    ['stack', 'Duplizieren …', () => openDuplicate(e)],
    ['share', 'Kopieren an …', () => openCopy(e)]];
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

// ---------- Duplizieren: Tag und Kalender (App oder beschreibbarer Google-Kalender) wählen ----------
function openDuplicate(e) {
  const cals = writableGoogle();
  const sel = e.kind === 'x' && cals.some((c) => c.gcal === e.gcal) ? e.gcal : '';
  const sheet = openSheet(`<div class="sheet-head"><h2>Duplizieren</h2><button class="link-btn" data-close>Abbrechen</button></div>
    <p class="cm-what"><b>${esc(e.title || 'Termin')}</b><span>${esc(e.allDay ? 'ganztägig' : `${e.time}${e.end ? '–' + e.end : ''}`)}</span></p>
    <form id="dup-form">
      <div class="field"><label for="dup-day">Tag</label><input class="input" type="date" id="dup-day" value="${esc(e.day)}" required></div>
      ${cals.length ? `<div class="field"><label for="dup-cal">Kalender</label><select class="select" id="dup-cal">
        <option value="">Übersicht (App)</option>${cals.map((c) => `<option value="${esc(c.gcal)}" ${c.gcal === sel ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select></div>` : ''}
      <button class="btn block" id="dup-go">Duplizieren</button>
    </form>`);
  sheet.querySelector('[data-close]').addEventListener('click', closeSheet);
  sheet.querySelector('#dup-form').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const day = sheet.querySelector('#dup-day').value, gcal = sheet.querySelector('#dup-cal')?.value || '';
    if (!day) return;
    const btn = sheet.querySelector('#dup-go');
    btn.disabled = true;
    try {
      if (gcal) await duplicateToGoogle(e, day, gcal); else await duplicateToApp(e, day);
      closeSheet();
      toast(`Dupliziert auf ${parseYmd(day).toLocaleDateString('de-AT', { weekday: 'short', day: 'numeric', month: 'short' })}`);
    } catch (err) {
      btn.disabled = false;
      toast('Fehler: ' + err.message, 5000);
    }
  });
}

async function duplicateToApp(e, day) {
  const now = new Date().toISOString();
  const meta = e.kind === 'ev' ? { ...e.i.meta } : { kind: 'event', repeat: '', remind: '', time: e.time, end: e.end };
  const row = { id: crypto.randomUUID(), owner_id: state.me, type: 'event', title: e.title, body: e.desc, due_date: e.bday ? e.i.due_date : day,
    category_id: e.kind === 'ev' ? e.i.category_id || null : null, meta };
  const { error } = await sb.from('items').insert(row);   // ohne .select() (siehe CLAUDE.md)
  if (error) throw new Error(error.message);
  state.items.unshift({ ...row, done: false, created_at: now, updated_at: now });
  render();
}

async function duplicateToGoogle(e, day, gcal) {
  const end = e.end || plusHour(e.time || '09:00');
  const event = e.allDay
    ? { allDay: true, start: day, end: addDays(day, e.span) }
    : { allDay: false, start: `${day}T${e.time}:00`, end: `${day}T${end}:00` };
  Object.assign(event, { title: e.title, location: e.location, desc: e.desc });
  await addGoogle(gcal, event);
  await reloadGoogle(gcal);
}

// ---------- Kopieren an eine Person: der Termin landet in ihrem Kalender und gehört ihr ----------
function openCopy(e) {
  const sheet = openSheet(`<div class="sheet-head"><h2>Kopieren an</h2><button class="link-btn" data-close>Abbrechen</button></div>
    <p class="cm-what"><b>${esc(e.title || 'Termin')}</b><span>${esc(parseYmd(e.day).toLocaleDateString('de-AT', { weekday: 'long', day: 'numeric', month: 'long' }))}</span></p>
    ${personPicker([])}`);
  sheet.querySelector('[data-close]').addEventListener('click', closeSheet);
  sheet.querySelectorAll('[data-person]').forEach((b) => b.addEventListener('click', async () => {
    b.disabled = true;
    const { data, error } = await sb.rpc('give_event', {
      target: b.dataset.person, p_title: e.title, p_body: e.desc, p_day: e.bday ? e.i.due_date : e.day,
      p_time: e.allDay ? '' : e.time, p_end: e.allDay ? '' : e.end, p_kind: e.bday ? 'birthday' : 'event',
    });
    if (error || data !== 'ok') { b.disabled = false; return toast(error ? 'Fehler: ' + error.message : 'Kopieren nicht möglich.', 4000); }
    closeSheet();
    toast(`An ${nameOf(b.dataset.person)} kopiert`);
  }));
}
