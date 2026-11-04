// Bereich Training: Woche mit den Einheiten (Kraft, Ausdauer, …), Übungen zum Abhaken.
// Einheiten kommen per Code (siehe plan-import.js); eigene Einheiten sind nur für die eigene Person sichtbar.
import { canDeleteItem, debounce, esc, itemById, sb, state } from './core.js';
import { deleteItem, loadAll, saveItem } from './data.js';
import { addDays, dayName, isoWeek, parseYmd, ymd } from './dates.js';
import { ICON } from './icons.js';
import { closeSheet, openSheet } from './sheet.js';

export const KINDS = {
  kraft: ['Kraft', 'dumbbell'], ausdauer: ['Ausdauer', 'heart'], mobilitaet: ['Mobilität', 'leaf'], sport: ['Sport', 'star'], ruhe: ['Erholung', 'clock'],
};
const kindOf = (k) => KINDS[k] || KINDS.kraft;

export const trainingOn = (day) => state.items.filter((i) => i.type === 'training' && i.due_date === day)
  .sort((a, b) => (a.meta?.order ?? 0) - (b.meta?.order ?? 0) || a.title.localeCompare(b.title, 'de'));

// Übung als kurze Zeile: 3 × 10 · 40 kg · Pause 90 s
const exLine = (u) => [u.sets && u.reps ? `${u.sets} × ${u.reps}` : u.sets ? `${u.sets} Sätze` : u.reps, u.weight, u.duration, u.rest && `Pause ${u.rest}`].filter(Boolean).join(' · ');

export function trainingRow(t) {
  const [label, icon] = kindOf(t.meta?.kind);
  const ex = t.meta?.exercises || [];
  return `<button class="mrow trn ${t.done ? 'done' : ''}" data-act="open" data-id="${t.id}">
    <span class="m-slot">${esc(label)}</span>
    <span class="m-main">
      <b><span class="tic-in">${ICON[icon]}</span>${esc(t.title)}</b>
      <span class="m-tags">${t.meta?.minutes ? `<i>${esc(t.meta.minutes)} Min.</i>` : ''}${ex.length ? `<i>${ex.length} Übungen</i>` : ''}${t.meta?.for ? `<i>${esc(t.meta.for)}</i>` : ''}</span>
    </span>
    ${t.done ? `<span class="trn-done" title="Erledigt">${ICON.check}</span>` : ''}
  </button>`;
}

export function renderTraining() {
  const days = Array.from({ length: 7 }, (_, k) => addDays(state.weekStart, k));
  const today = ymd(new Date());
  const week = days.flatMap(trainingOn);
  const minutes = week.reduce((s, t) => s + (+t.meta?.minutes || 0), 0);
  const summary = `<section class="tile wsum">
      <div class="wsum-h"><b>KW ${isoWeek(state.weekStart)}</b><span>${esc(parseYmd(state.weekStart).toLocaleDateString('de-AT', { day: 'numeric', month: 'short' }))} – ${esc(parseYmd(addDays(state.weekStart, 6)).toLocaleDateString('de-AT', { day: 'numeric', month: 'short', year: 'numeric' }))}</span></div>
      <div class="wsum-row">
        <div><b>${week.length}</b><span>Einheiten</span></div>
        <div><b>${week.filter((t) => t.done).length}</b><span>erledigt</span></div>
        <div><b>${minutes || '–'}</b><span>Minuten</span></div>
      </div>
      <div class="wsum-act"><button class="btn" data-act="import-plan">${ICON.plus} Code einfügen</button></div>
    </section>`;
  if (!week.length) {
    return summary + `<section class="tile"><p class="empty">Für diese Woche ist noch kein Training geplant. Stell dir mit Claude ein Training zusammen (für einen Tag oder die ganze Woche) und füge den Code hier ein.</p></section>`;
  }
  return summary + `<div class="tgrid days">${days.map((d) => {
    const list = trainingOn(d);
    const head = `<div class="th"><b>${esc(dayName(d))}</b><small class="dd">${esc(dayName(d, { day: 'numeric', month: 'numeric' }))}</small>${d === today ? '<span class="utag">Heute</span>' : ''}</div>`;
    if (!list.length) return `<section class="tile day empty-day">${head}<p class="kempty">Kein Training.</p></section>`;
    return `<section class="tile day ${d === today ? 'today' : ''}">${head}<div class="mrows">${list.map(trainingRow).join('')}</div></section>`;
  }).join('')}</div>`;
}

// ---------- Einheit ansehen: Übungen abhaken, erledigt, Tag ändern ----------
export function openTraining(id) {
  const t = itemById(id);
  if (!t) return;
  const meta = t.meta || {};
  const [label, icon] = kindOf(meta.kind);
  const checked = new Set(meta.checked || []);
  const list = (title, arr) => (arr?.length ? `<div class="field"><label>${title}</label><ul class="ing">${arr.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></div>` : '');
  const sheet = openSheet(`
    <div class="sheet-head"><span class="status">${esc(label)} · ${esc(dayName(t.due_date, { weekday: 'long', day: 'numeric', month: 'long' }))}</span><button class="link-btn" data-close>Fertig</button></div>
    <div class="title-row"><span class="icon-pick has">${ICON[icon]}</span><textarea class="title-input m-title" id="t-title" rows="2">${esc(t.title)}</textarea></div>
    <div class="m-badges">
      ${meta.minutes ? `<span class="utag light">${ICON.clock} ${esc(meta.minutes)} Min.</span>` : ''}
      ${meta.for ? `<span class="utag light">${esc(meta.for)}</span>` : ''}
    </div>
    ${list('Aufwärmen', meta.warmup)}
    ${(meta.exercises || []).length ? `<div class="field"><label>Übungen</label><div class="ex-list">${meta.exercises.map((u, k) => `
      <button type="button" class="ex ${checked.has(k) ? 'on' : ''}" data-ex="${k}">
        <span class="tcheck ${checked.has(k) ? 'on' : ''}">${ICON.check}</span>
        <span class="ex-t"><b>${esc(u.name)}</b>${exLine(u) ? `<small>${esc(exLine(u))}</small>` : ''}${u.note ? `<small class="ex-n">${esc(u.note)}</small>` : ''}</span>
      </button>`).join('')}</div></div>` : ''}
    ${list('Abschluss', meta.cooldown)}
    ${meta.note ? `<div class="field"><label>Hinweis</label><p class="m-note">${esc(meta.note)}</p></div>` : ''}
    <button class="btn block ${t.done ? 'secondary' : ''}" id="t-done">${ICON.check} ${t.done ? 'Erledigt – wieder öffnen' : 'Als erledigt markieren'}</button>
    <div class="field" style="margin-top:14px"><label>Am</label><input class="input" type="date" id="t-date" value="${esc(t.due_date || '')}"></div>
    ${canDeleteItem(t) ? '<button class="btn danger block" id="t-delete">Einheit entfernen</button>' : ''}`, { onClose: () => saveTitle.flush() });
  const saveTitle = debounce(() => { const v = sheet.querySelector('#t-title')?.value; if (v != null && v !== itemById(id)?.title) saveItem(id, { title: v }); }, 600);
  sheet.querySelector('#t-title').addEventListener('input', saveTitle);
  sheet.querySelector('[data-close]').addEventListener('click', closeSheet);
  // Übung abhaken; sind alle abgehakt, gilt die Einheit als erledigt
  sheet.querySelectorAll('[data-ex]').forEach((b) => b.addEventListener('click', () => {
    const k = +b.dataset.ex;
    checked.has(k) ? checked.delete(k) : checked.add(k);
    b.classList.toggle('on', checked.has(k));
    b.querySelector('.tcheck').classList.toggle('on', checked.has(k));
    const all = checked.size === (meta.exercises || []).length;
    saveItem(id, { meta: { ...(itemById(id).meta || {}), checked: [...checked] }, ...(all && !itemById(id).done ? { done: true } : {}) });
  }));
  sheet.querySelector('#t-done').addEventListener('click', () => { saveItem(id, { done: !itemById(id).done }); closeSheet(); });
  sheet.querySelector('#t-date').addEventListener('change', (e) => { if (e.target.value) saveItem(id, { due_date: e.target.value }); });
  sheet.querySelector('#t-delete')?.addEventListener('click', async () => { if (await deleteItem(id)) closeSheet(); });
}

// ---------- Einheiten aus einem Code übernehmen ----------
const str = (v, max = 120) => (v == null ? '' : String(v).slice(0, max));
const strs = (a, max = 40) => (Array.isArray(a) ? a.slice(0, max).map((x) => str(x, 300)).filter(Boolean) : []);
const isDay = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s || '');

export const validTraining = (list) => (Array.isArray(list) ? list.filter((t) => t && isDay(t.datum) && t.titel) : []);

// Eigene Einheiten an den Tagen des Codes werden ersetzt (ein Tag oder eine ganze Woche)
export async function importTraining(list) {
  const units = validTraining(list);
  const dates = [...new Set(units.map((t) => t.datum))].sort();
  for (const old of state.items.filter((i) => i.type === 'training' && i.owner_id === state.me && dates.includes(i.due_date))) {
    const { error } = await sb.from('items').delete().eq('id', old.id);
    if (error) throw error;
  }
  const rows = units.map((t, k) => ({
    type: 'training', title: str(t.titel, 140), due_date: t.datum, category_id: null,
    meta: {
      kind: KINDS[t.art] ? t.art : 'kraft', minutes: +t.dauer_min || null, for: str(t.fuer, 40), order: k,
      warmup: strs(t.aufwaermen), cooldown: strs(t.abschluss), note: str(t.hinweis, 600),
      exercises: (Array.isArray(t.uebungen) ? t.uebungen : []).slice(0, 40).filter((u) => u && u.name).map((u) => ({
        name: str(u.name), sets: +u.saetze || null, reps: str(u.wdh, 30), weight: str(u.gewicht, 30),
        duration: str(u.dauer, 30), rest: str(u.pause, 30), note: str(u.hinweis, 300),
      })),
    },
  }));
  if (rows.length) {
    const { error } = await sb.from('items').insert(rows);
    if (error) throw new Error(/check/i.test(error.message) ? 'Für Training muss die Datenbank noch erweitert werden (SQL am Ende von supabase-setup.sql).' : error.message);
  }
  await loadAll();
  return { units: rows.length, firstDate: dates[0] };
}
