// Bereich Erinnerungen: alle gestellten Erinnerungen (Todos, Notizen, Termine, Canvas, eigene) auf einen Blick,
// oben schnell eine neue stellen. Eigene Erinnerungen sind Einträge vom Typ 'reminder' (Titel, Zeit, meta.fid = Canvas-Ordner).
import { esc, itemById, sb, state, toast } from './core.js';
import { saveItem, trashItems } from './data.js';
import { remindLabel, toLocalInput } from './dates.js';
import { evTitle } from './events.js';
import { ICON } from './icons.js';
import { openItem } from './items.js';
import { render } from './render.js';
import { closeSheet, openSheet, sheetActs } from './sheet.js';

const KIND = { reminder: ['Erinnerung', 'bell'], todo: ['Todo', 'todos'], note: ['Notiz', 'notes'], event: ['Termin', 'calendar'], meal: ['Gericht', 'pot'], training: ['Training', 'dumbbell'] };

// Schnellwahl der Zeit (wie bei Todos)
export const QUICK = [['in 1 Std.', 'h1'], ['Heute 18:00', 'today18'], ['Morgen 8:00', 'tom8'], ['In 1 Woche', 'w1']];
export function quickTime(k) {
  const d = new Date();
  if (k === 'h1') d.setMinutes(d.getMinutes() + 60, 0, 0);
  else if (k === 'today18') { d.setHours(18, 0, 0, 0); if (d < new Date()) d.setDate(d.getDate() + 1); }
  else if (k === 'tom8') { d.setDate(d.getDate() + 1); d.setHours(8, 0, 0, 0); }
  else if (k === 'w1') { d.setDate(d.getDate() + 7); d.setHours(9, 0, 0, 0); }
  return d;
}

const titleOf = (i) => (i.type === 'event' ? evTitle(i) : i.title || KIND[i.type]?.[0] || 'Erinnerung');
const upcoming = () => state.items.filter((i) => i.remind_at && !i.reminded && !i.done).sort((a, b) => a.remind_at.localeCompare(b.remind_at));
// schon erinnerte eigene Erinnerungen der letzten zwei Wochen
const past = () => state.items.filter((i) => i.type === 'reminder' && i.reminded && Date.now() - new Date(i.remind_at).getTime() < 14 * 864e5)
  .sort((a, b) => b.remind_at.localeCompare(a.remind_at));
export const remindCount = () => upcoming().length;

// neue Erinnerung (ohne .select(), siehe CLAUDE.md)
export async function createReminder({ title, at, fid = null, page = null }) {
  const now = new Date().toISOString();
  const row = { id: crypto.randomUUID(), owner_id: state.me, type: 'reminder', title: String(title || '').slice(0, 300), body: '',
    remind_at: at.toISOString(), reminded: false, category_id: fid || null, meta: fid != null || page ? { fid: fid || '', page } : {} };
  const { error } = await sb.from('items').insert(row);
  if (error) { toast('Fehler: ' + error.message, 4000); return null; }
  const it = { ...row, done: false, due_date: null, created_at: now, updated_at: now };
  state.items.unshift(it);
  render();
  return it;
}

export function renderReminders() {
  const row = (i) => {
    const [kind, icon] = KIND[i.type] || KIND.reminder;
    const from = i.type === 'reminder' && i.meta?.fid != null ? 'Canvas' : kind;
    return `<button class="rm-row ${i.reminded ? 'done' : ''}" data-act="rem-open" data-id="${i.id}">
      <span class="rm-ic">${ICON[icon]}</span>
      <span class="rm-t"><b>${esc(titleOf(i))}</b><small>${esc(from)}</small></span>
      <span class="rm-at">${esc(remindLabel(i.remind_at))}</span></button>`;
  };
  const up = upcoming(), old = past();
  return `<section class="tile rm-quick">
      <form class="rm-form" id="rm-form"><span class="rm-ic">${ICON.bell}</span><input name="title" placeholder="Woran erinnern?" autocomplete="off" enterkeyhint="done" maxlength="300"></form>
      <div class="remind-quick">${QUICK.map(([l, k]) => `<button type="button" class="chip" data-act="rem-quick" data-id="${k}">${l}</button>`).join('')}
        <label class="chip rm-pick">${ICON.clock}<input type="datetime-local" id="rm-at" aria-label="Zeit wählen"></label></div>
    </section>
    <section class="tile rm-list">${up.length ? up.map(row).join('') : '<p class="kempty">Keine Erinnerungen gestellt.</p>'}</section>
    ${old.length ? `<section class="tile rm-list rm-old"><div class="rm-h">Schon erinnert</div>${old.map(row).join('')}</section>` : ''}`;
}

// Schnell stellen: Text oben eintippen, dann Zeit wählen
async function quickAdd(at) {
  const input = document.querySelector('#rm-form input');
  const title = input?.value.trim();
  if (!title) { input?.focus(); return toast('Erst eintippen, woran erinnert werden soll.'); }
  if (!(at > new Date())) return toast('Die Zeit liegt in der Vergangenheit.');
  if (await createReminder({ title, at })) toast(`Erinnerung ${remindLabel(at.toISOString())}`);
}

export function remindAction(act, id, el) {
  if (act === 'rem-quick') return quickAdd(quickTime(id));
  if (act === 'rem-at') return el.value && quickAdd(new Date(el.value));
  if (act === 'rem-open') return openRemindTarget(id);
}

// Erinnerung öffnen: eigene im Fenster, sonst den Eintrag selbst
function openRemindTarget(id) {
  const i = itemById(id);
  if (i) openItem(id);   // eigene Erinnerungen öffnen über openItem ihr eigenes Fenster
}

// Fenster einer Erinnerung: Text, Zeit, Schnellwahl; im Canvas gestellte zeigen ihre Stelle
export function openReminder(id, { onShow = null } = {}) {
  const i = itemById(id);
  if (!i) return;
  const sheet = openSheet(`<div class="sheet-head"><h2>Erinnerung</h2>${sheetActs({ save: true, del: true })}</div>
    <input class="title-input" id="rm-title" placeholder="Woran erinnern?" value="${esc(i.title)}" maxlength="300" autocomplete="off">
    <div class="field" style="margin-top:12px"><label for="rm-time">Wann</label><input class="input" type="datetime-local" id="rm-time" value="${esc(toLocalInput(i.remind_at))}"></div>
    <div class="remind-quick">${QUICK.map(([l, k]) => `<button type="button" class="chip" data-q="${k}">${l}</button>`).join('')}</div>
    ${onShow ? `<button class="btn secondary block" id="rm-show" type="button">${ICON.ink} Im Canvas zeigen</button>` : ''}`);
  const $t = sheet.querySelector('#rm-title'), $time = sheet.querySelector('#rm-time');
  const saveTitle = () => { const v = $t.value.trim(); if (v !== itemById(id)?.title) saveItem(id, { title: v }); };
  const setTime = (d) => { $time.value = toLocalInput(d.toISOString()); saveItem(id, { remind_at: d.toISOString(), reminded: false }); };
  $t.addEventListener('change', saveTitle);
  $time.addEventListener('change', () => { if ($time.value) setTime(new Date($time.value)); });
  sheet.querySelectorAll('[data-q]').forEach((b) => b.addEventListener('click', () => setTime(quickTime(b.dataset.q))));
  sheet.querySelector('[data-save]').addEventListener('click', () => { saveTitle(); closeSheet(); });
  sheet.querySelector('[data-close]').addEventListener('click', closeSheet);
  sheet.querySelector('[data-del]').addEventListener('click', () => { closeSheet(); trashItems([id]); });
  sheet.querySelector('#rm-show')?.addEventListener('click', () => { saveTitle(); closeSheet(); onShow(); });
}

// Abfrage beim Erinnern an etwas im Canvas: Text (vorbelegt) und Zeit; gibt { title, at } oder null
export function askReminder(title = '') {
  return new Promise((resolve) => {
    let done = false;
    const finish = (v) => { if (!done) { done = true; resolve(v); } };
    const sheet = openSheet(`<div class="sheet-head"><h2>Erinnern</h2>${sheetActs({ save: true })}</div>
      <input class="title-input" id="ra-title" placeholder="Woran erinnern?" value="${esc(title)}" maxlength="300" autocomplete="off">
      <div class="field" style="margin-top:12px"><label for="ra-time">Wann</label><input class="input" type="datetime-local" id="ra-time" value="${esc(toLocalInput(quickTime('tom8').toISOString()))}"></div>
      <div class="remind-quick">${QUICK.map(([l, k]) => `<button type="button" class="chip" data-q="${k}">${l}</button>`).join('')}</div>`, { onClose: () => finish(null) });
    const $time = sheet.querySelector('#ra-time');
    const ok = () => {
      const at = new Date($time.value);
      if (!(at > new Date())) return toast('Die Zeit liegt in der Vergangenheit.');
      finish({ title: sheet.querySelector('#ra-title').value.trim() || 'Erinnerung', at });
      closeSheet();
    };
    sheet.querySelectorAll('[data-q]').forEach((b) => b.addEventListener('click', () => { $time.value = toLocalInput(quickTime(b.dataset.q).toISOString()); ok(); }));
    sheet.querySelector('[data-save]').addEventListener('click', ok);
    sheet.querySelector('[data-close]').addEventListener('click', closeSheet);
    setTimeout(() => sheet.querySelector('#ra-title').focus(), 60);
  });
}
