// Termine und Geburtstage (jährliche Wiederholung, Erinnerungen)
import { reloadGoogle, writableGoogle } from './cal-sources.js';
import { calDay, hm, toMin } from './calendar.js';
import { askConfirm, canDeleteItem, catById, debounce, esc, itemById, safeColor, sb, state, store, toast } from './core.js';
import { saveItem, silentDelete, trashItems } from './data.js';
import { addDays, parseYmd, remindLabel } from './dates.js';
import { showEventCard } from './event-view.js';
import { openGoogleEvent } from './google-cal.js';
import { ICON } from './icons.js';
import { renderShareArea } from './items.js';
import { render } from './render.js';
import { categoryOptions, clearSheetClose, closeSheet, openSheet } from './sheet.js';
import { hideForMe } from './trash.js';

// ====================================================================
// Termine + Geburtstage (type 'event'; meta.kind, meta.time, meta.repeat, meta.remind)
// ====================================================================
const EV_REMIND = [['', 'Keine'], ['0', 'Am Tag 8:00'], ['h', '1 Std. vorher'], ['1', 'Am Vortag 18:00'], ['7', '1 Woche vorher']];

export const isBday = (e) => e.meta?.kind === 'birthday';

export const isYearly = (e) => isBday(e) || e.meta?.repeat === 'yearly';

// Datum des Termins im angegebenen Jahr (29.2. in Nicht-Schaltjahren = 28.2.)
const evDateIn = (e, y) => {
  let md = e.due_date.slice(5);
  if (md === '02-29' && !(y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0))) md = '02-28';
  return `${y}-${md}`;
};

const evOn = (e, d) => (e.due_date ? (isYearly(e) ? e.due_date <= d && evDateIn(e, +d.slice(0, 4)) === d : e.due_date === d) : false);

export const eventsOn = (d) => state.items.filter((i) => i.type === 'event' && evOn(i, d))
  .sort((a, b) => (isBday(b) - isBday(a)) || (a.meta?.time || '').localeCompare(b.meta?.time || ''));

export const evAge = (e, d) => { const y0 = +e.due_date.slice(0, 4), y = +d.slice(0, 4); return isBday(e) && y0 > 1900 && y > y0 ? y - y0 : 0; };

export const evTitle = (e) => (isBday(e) ? `${e.title || 'Jemand'} hat Geburtstag` : e.title || 'Termin');

// Erinnerungszeit für das Vorkommen am Tag occ
function evRemindFor(e, occ) {
  const r = e.meta?.remind;
  if (!r) return null;
  const at = (day, hm) => { const [h, m] = hm.split(':').map(Number); const x = parseYmd(day); x.setHours(h, m, 0, 0); return x; };
  if (r === '0') return at(occ, '08:00');
  if (r === 'h') { const t = at(occ, e.meta?.time || '09:00'); t.setHours(t.getHours() - 1); return t; }
  if (r === '1') return at(addDays(occ, -1), '18:00');
  if (r === '7') return at(addDays(occ, -7), '09:00');
  return null;
}

// Nächste Erinnerung ab jetzt (jährlich: nächstes Jahr, wenn heuer schon vorbei)
function evNextRemind(e) {
  if (!e.due_date || !e.meta?.remind) return null;
  const now = Date.now();
  if (!isYearly(e)) { const t = evRemindFor(e, e.due_date); return t ? t.toISOString() : null; }
  const y = new Date().getFullYear();
  for (let k = 0; k < 3; k++) {
    const occ = evDateIn(e, Math.max(y + k, +e.due_date.slice(0, 4)));
    const t = evRemindFor(e, occ);
    if (t && t.getTime() > now) return t.toISOString();
  }
  return null;
}

export function openNewEventMenu() {
  const sheet = openSheet(`
    <div class="sheet-head"><h2>Neu im Kalender</h2><button class="link-btn" data-close>Fertig</button></div>
    <div class="nev">
      <button class="nev-b" data-k="event">${ICON.calendar}<b>Termin</b><small>einmalig oder jährlich</small></button>
      <button class="nev-b" data-k="birthday">${ICON.cake}<b>Geburtstag</b><small>jedes Jahr mit Erinnerung</small></button>
    </div>`);
  sheet.querySelector('[data-close]').addEventListener('click', closeSheet);
  sheet.querySelectorAll('[data-k]').forEach((b) => b.addEventListener('click', () => { closeSheet(); createEvent(null, b.dataset.k); }));
}

// Wohin neue Termine gehen: zuletzt gewählter Google-Kalender (falls noch beschreibbar) oder die App
const googleTarget = () => { const t = store('calTarget'); return writableGoogle().some((c) => c.gcal === t) ? t : null; };

// neuer Termin direkt in Google; „Übersicht (App)“ in der Auswahl wechselt zum App-Termin (Eingetipptes bleibt)
function newGoogleEvent(day, time, gcal, pre = {}) {
  openGoogleEvent(null, { day, time, cals: writableGoogle(), sel: gcal, pre, onDone: reloadGoogle,
    toApp: (p) => createEvent(p.day, 'event', p.time, { title: p.title, body: p.desc, app: true }) });
}

export async function createEvent(day, kind = 'event', time = '', pre = {}) {
  const g = kind === 'event' && !pre.app && googleTarget();
  if (g) return newGoogleEvent(day || calDay(), time, g);
  if (createEvent.blocked) return toast('Für Termine muss die Datenbank noch erweitert werden (SQL in Supabase ausführen).', 5000);
  const { data, error } = await sb.from('items').insert({ type: 'event', title: String(pre.title || ''), body: String(pre.body || ''), due_date: day || calDay(), meta: { kind, remind: kind === 'birthday' ? '0' : '', repeat: kind === 'birthday' ? 'yearly' : '', time: kind === 'birthday' ? '' : time, end: time ? hm(Math.min(toMin(time) + 60, 23 * 60 + 59)) : '' } }).select().single();
  if (error) {
    if (/items_type_check/.test(error.message)) { createEvent.blocked = true; return toast('Für Termine muss die Datenbank noch erweitert werden (SQL in Supabase ausführen).', 5000); }
    return toast('Fehler: ' + error.message);
  }
  state.items.unshift(data);
  render();
  openEvent(data.id, { isNew: true });
}

// eigenen Termin oder Geburtstag ansehen; „Bearbeiten“ öffnet das Formular
export function showEvent(id) {
  const e = itemById(id);
  if (!e) return;
  const b = isBday(e), m = e.meta || {}, cat = catById(e.category_id), yearly = isYearly(e);
  const day = yearly ? `${new Date().getFullYear()}${e.due_date.slice(4)}` : e.due_date;
  const date = parseYmd(day).toLocaleDateString('de-AT', yearly ? { day: 'numeric', month: 'long' } : { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const age = b ? evAge(e, day) : 0;
  const when = b ? `Geburtstag am ${date}${age ? ` · wird ${age}` : ''}`
    : `${date}${m.time ? ` · ${m.time}${m.end ? '–' + m.end : ''}` : ' · ganztägig'}${yearly ? ' · jedes Jahr' : ''}`;
  const rem = EV_REMIND.find(([k]) => k && k === String(m.remind || ''));
  showEventCard({
    title: evTitle(e), when, desc: e.body, calName: cat ? cat.name : 'Übersicht', color: safeColor(cat?.color, '#0C3741'),
    notes: rem ? [`Erinnerung: ${rem[1]}`] : [], onEdit: () => openEvent(id),
  });
}

export function openEvent(id, { isNew = false } = {}) {
  const e = itemById(id);
  if (!e) return;
  const draw = () => {
    const ev = itemById(id); if (!ev) return closeSheet();
    const b = isBday(ev), m = ev.meta || {};
    const sheet = openSheet(`
      <div class="sheet-head">
        <div class="seg-view" id="ev-kind">
          <button type="button" class="${b ? '' : 'on'}" data-kind="event">${ICON.calendar}<span>Termin</span></button>
          <button type="button" class="${b ? 'on' : ''}" data-kind="birthday">${ICON.cake}<span>Geburtstag</span></button>
        </div>
        <button class="link-btn" data-close>Fertig</button>
      </div>
      ${isNew && !b && writableGoogle().length ? `<div class="field"><label for="ev-cal">Kalender</label><select class="select" id="ev-cal">
        <option value="" selected>Übersicht (App)</option>${writableGoogle().map((c) => `<option value="${esc(c.gcal)}">${esc(c.name)}</option>`).join('')}</select></div>` : ''}
      <input class="title-input" id="ev-title" placeholder="${b ? 'Wer hat Geburtstag?' : 'Was steht an?'}" value="${esc(ev.title)}" autocomplete="off">
      <div class="field" style="margin-top:12px"><label>${b ? 'Geburtsdatum' : 'Datum'}</label>
        <div class="row-inline"><input class="input" type="date" id="ev-date" value="${esc(ev.due_date || '')}">
        </div>
        ${b ? '' : `<div class="row-inline ev-times"><label class="tl">von<input class="input" type="time" id="ev-time" value="${esc(m.time || '')}"></label><label class="tl">bis<input class="input" type="time" id="ev-end" value="${esc(m.end || '')}" ${m.time ? '' : 'disabled'}></label></div>
        <div class="hint">Ohne Uhrzeit gilt der Termin ganztägig.</div>`}
        ${b ? '<div class="hint">Mit Geburtsjahr zeigt der Kalender auch, wie alt die Person wird.</div>' : ''}
      </div>
      ${b ? '' : `<button class="menu-item" id="ev-rep" type="button">Jedes Jahr wiederholen<span class="sw ${m.repeat === 'yearly' ? 'on' : ''}"></span></button>`}
      <div class="field" style="margin-top:12px"><label>Erinnerung</label>
        <div class="remind-quick">${EV_REMIND.filter(([k]) => k !== 'h' || (!b && m.time)).map(([k, l]) => `<button type="button" class="chip ${String(m.remind || '') === k ? 'on' : ''}" data-rem="${k}">${l}</button>`).join('')}</div>
        <div class="hint">${ev.remind_at ? `Nächste Erinnerung ${esc(remindLabel(ev.remind_at))}${new Date(ev.remind_at).getFullYear() !== new Date().getFullYear() ? ' ' + new Date(ev.remind_at).getFullYear() : ''}.${isYearly(ev) ? ' Danach jedes Jahr wieder.' : ''}` : m.remind ? 'Dieser Termin ist schon vorbei.' : 'Ohne Erinnerung.'}</div>
      </div>
      <div class="field"><label>Notiz</label><textarea class="textarea" id="ev-body" style="min-height:80px" placeholder="${b ? 'Geschenkidee, Adresse …' : 'Ort, Details …'}">${esc(ev.body)}</textarea></div>
      <div class="field"><label>Kategorie</label><select class="select" id="ev-cat">${categoryOptions(ev.category_id)}</select></div>
      <div class="field"><label>Geteilt</label><div id="share-area"></div></div>
      ${ev.owner_id === state.me ? '' : '<button class="btn secondary block" id="ev-hide">Für mich entfernen</button>'}
      ${canDeleteItem(ev) ? `<button class="btn danger block" id="ev-del">${b ? 'Geburtstag' : 'Termin'} löschen${ev.owner_id === state.me ? '' : ' (für alle)'}</button>` : ''}
    `, { onClose: () => { saveText.flush(); if (isNew && !itemById(id)?.title) silentDelete(id); } });

    const saveText = debounce(() => {
      const cur = itemById(id); if (!cur) return;
      const patch = {};
      const t = sheet.querySelector('#ev-title').value, bd = sheet.querySelector('#ev-body').value;
      if (t !== cur.title) patch.title = t;
      if (bd !== cur.body) patch.body = bd;
      if (Object.keys(patch).length) saveItem(id, patch);
    }, 500);
    // meta ändern und Erinnerung neu berechnen, dann Fenster neu zeichnen
    const setMeta = async (patchMeta, extra = {}, redraw = true) => {
      saveText.flush();
      const cur = itemById(id);
      const next = { ...cur, ...extra, meta: { ...(cur.meta || {}), ...patchMeta } };
      const remind_at = evNextRemind(next);
      clearSheetClose();   // beim Neuzeichnen nicht löschen
      await saveItem(id, { ...extra, meta: next.meta, remind_at, reminded: false });
      if (redraw) { isNew = isNew && !itemById(id)?.title; draw(); }
    };
    sheet.querySelector('[data-close]').addEventListener('click', closeSheet);
    sheet.querySelector('#ev-title').addEventListener('input', saveText);
    sheet.querySelector('#ev-body').addEventListener('input', saveText);
    sheet.querySelectorAll('[data-kind]').forEach((x) => x.addEventListener('click', () => {
      const k = x.dataset.kind;
      if (k === (isBday(itemById(id)) ? 'birthday' : 'event')) return;
      setMeta(k === 'birthday' ? { kind: k, repeat: 'yearly', time: '', remind: m.remind === 'h' ? '0' : m.remind || '0' } : { kind: k });
    }));
    // Google-Kalender gewählt: Eingetipptes mitnehmen, Entwurf in der App verwerfen, Wahl fürs nächste Mal merken
    sheet.querySelector('#ev-cal')?.addEventListener('change', (x) => {
      const gcal = x.target.value;
      if (!gcal) return;
      store('calTarget', gcal);
      const pre = { title: sheet.querySelector('#ev-title').value, desc: sheet.querySelector('#ev-body').value };
      const day = sheet.querySelector('#ev-date').value || itemById(id).due_date, time = itemById(id).meta?.time || '';
      clearSheetClose(); closeSheet(); silentDelete(id);
      newGoogleEvent(day, time, gcal, pre);
    });
    sheet.querySelector('#ev-date').addEventListener('change', (x) => { if (x.target.value) setMeta({}, { due_date: x.target.value }); });
    sheet.querySelector('#ev-time')?.addEventListener('change', (x) => {
      const t = x.target.value;
      const end = !t ? '' : m.end && toMin(m.end) > toMin(t) ? m.end : hm(Math.min(toMin(t) + 60, 23 * 60 + 59));
      setMeta({ time: t, end, ...(t ? {} : m.remind === 'h' ? { remind: '0' } : {}) });
    });
    sheet.querySelector('#ev-end')?.addEventListener('change', (x) => setMeta({ end: x.target.value && toMin(x.target.value) > toMin(m.time) ? x.target.value : m.end }));
    sheet.querySelector('#ev-rep')?.addEventListener('click', () => setMeta({ repeat: itemById(id).meta?.repeat === 'yearly' ? '' : 'yearly' }));
    sheet.querySelectorAll('[data-rem]').forEach((x) => x.addEventListener('click', () => setMeta({ remind: x.dataset.rem })));
    sheet.querySelector('#ev-cat').addEventListener('change', (x) => saveItem(id, { category_id: x.target.value || null }).then(() => renderShareArea(sheet, id)));
    sheet.querySelector('#ev-hide')?.addEventListener('click', () => { saveText.flush(); clearSheetClose(); closeSheet(); hideForMe(id); });
    sheet.querySelector('#ev-del')?.addEventListener('click', async () => {
      if (!(await askConfirm(`„${evTitle(itemById(id))}“ löschen?`, 'Löschen', 'Landet im Papierkorb.'))) return;
      clearSheetClose(); closeSheet(); trashItems([id]);
    });
    renderShareArea(sheet, id);
    if (isNew && !itemById(id).title) setTimeout(() => sheet.querySelector('#ev-title')?.focus(), 50);
  };
  draw();
}
