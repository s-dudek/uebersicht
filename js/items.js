// Todo- und Notiz-Fenster sowie Teilen
import { canDeleteItem, catById, debounce, esc, isCatShared, isItemShared, itemById, membersOf, nameOf, safeColor, sb, sharesOf, state, toast } from './core.js';
import { deleteItem, loadAll, saveItem, silentDelete } from './data.js';
import { remindLabel, toLocalInput } from './dates.js';
import { openEvent, showEvent } from './events.js';
import { ICON } from './icons.js';
import { openMeal } from './meals.js';
import { openTraining } from './training.js';
import { canvasShow } from './ink-remind.js';
import { openReminder } from './remind-page.js';
import { pushOn, pushSupport, remindHint } from './reminders.js';
import { render } from './render.js';
import { categoryOptions, clearSheetClose, closeSheet, colorPick, openSheet, sheetActs } from './sheet.js';
import { hideForMe } from './trash.js';

// ---------- Todo / Notiz öffnen ----------
// Text einer Notiz zum Lesen: maskiert, Zeilenumbrüche bleiben, Web-Adressen werden zu Links
const readable = (text) => esc(text).replace(/\bhttps?:\/\/[^\s<>"']+/g, (u) => `<a href="${u}" target="_blank" rel="noopener noreferrer">${u}</a>`);

// Bestehende Notiz: zuerst lesen, „Bearbeiten“ öffnet das Bearbeitungsfenster
function openNoteView(id) {
  const n = itemById(id);
  if (!n) return;
  const c = catById(n.category_id);
  const info = [
    c ? esc(c.name) : 'Ohne Kategorie',
    n.owner_id !== state.me ? `von ${esc(nameOf(n.owner_id))}` : isItemShared(n) ? 'geteilt' : '',
    n.remind_at && !n.reminded ? `Erinnerung ${esc(remindLabel(n.remind_at))}` : '',
  ].filter(Boolean).join(' · ');
  const sheet = openSheet(`
    <div class="sheet-head">
      <span class="status">${info}</span>
      ${sheetActs({ edit: true })}
    </div>
    <article class="note-view"${n.meta?.color ? ` style="--ic:${safeColor(n.meta.color)}"` : ''}>
      <h2 class="nv-title">${esc(n.title) || '<span class="muted">Ohne Titel</span>'}</h2>
      ${n.body.trim() ? `<div class="nv-body">${readable(n.body)}</div>` : '<p class="muted">Kein Text.</p>'}
    </article>`, { full: n.body.length > 400 });   // lange Notizen bekommen das ganze Fenster
  sheet.querySelector('[data-close]').addEventListener('click', closeSheet);
  const edit = () => openItem(id, { edit: true });
  sheet.querySelector('[data-edit]').addEventListener('click', edit);
  sheet.querySelector('.note-view').addEventListener('dblclick', edit);   // Doppelklick am Desktop
}

export function openItem(id, { isNew = false, edit = false } = {}) {
  const i = itemById(id);
  if (!i) return;
  if (i.type === 'meal') return openMeal(id);
  if (i.type === 'training') return openTraining(id);
  if (i.type === 'reminder') return openReminder(id, { onShow: canvasShow(i) });
  if (i.type === 'event') return isNew || edit ? openEvent(id, { isNew }) : showEvent(id);
  if (i.type === 'note' && !isNew && !edit) return openNoteView(id);
  const isNote = i.type === 'note';
  const mine = i.owner_id === state.me;

  const sheet = openSheet(`
    <div class="sheet-head">
      <span class="status" id="save-status"></span>
      ${sheetActs({ save: true, del: canDeleteItem(i), delLabel: mine ? 'Löschen' : 'Löschen (für alle)' })}
    </div>
    <div class="title-row">
      <input class="title-input" id="f-title" placeholder="${isNote ? 'Titel' : 'Todo'}" value="${esc(i.title)}">
    </div>
    <div class="f-colrow">${colorPick(i.meta?.color || '', 'f-col')}</div>
    ${isNote
      ? `<textarea class="note-body" id="f-body" placeholder="Notiz …">${esc(i.body)}</textarea>`
      : `<div class="field" style="margin-top:12px"><label>Notiz</label><textarea class="textarea" id="f-body" style="min-height:90px" placeholder="Details (optional)">${esc(i.body)}</textarea></div>
         <div class="field"><label>Fällig am</label><input class="input" type="date" id="f-due" value="${esc(i.due_date || '')}"></div>`}
    <div class="field" ${isNote ? 'style="margin-top:12px"' : ''}><label>Kategorie</label><select class="select" id="f-cat">${categoryOptions(i.category_id)}</select></div>
    <div class="field"><label>Erinnerung</label>
      <div class="row-inline">
        <input class="input" type="datetime-local" id="f-remind" value="${i.remind_at ? esc(toLocalInput(i.remind_at)) : ''}">
        <button class="btn secondary" type="button" id="f-remind-clear" ${i.remind_at ? '' : 'hidden'}>Entfernen</button>
      </div>
      <div class="remind-quick">
        ${[['in 1 Std.', 60], ['Heute 18:00', 'today18'], ['Morgen 8:00', 'tom8']].map(([l, v]) => `<button type="button" class="chip" data-remind="${v}">${l}</button>`).join('')}
      </div>
      <div class="hint" id="f-remind-hint">${remindHint(i)}</div>
    </div>
    <div class="field"><label>Geteilt</label><div id="share-area"></div></div>
    ${mine ? '' : '<button class="btn secondary block" id="f-hide">Für mich entfernen</button>'}
  `, { full: isNote, onClose: () => { saveText.flush(); if (isNew && !itemById(id)?.title && !itemById(id)?.body) silentDelete(id); } });

  const $status = sheet.querySelector('#save-status');
  const $title = sheet.querySelector('#f-title');
  const $body = sheet.querySelector('#f-body');

  const saveText = debounce(async () => {
    const cur = itemById(id);
    if (!cur) return;
    const patch = {};
    if ($title.value !== cur.title) patch.title = $title.value;
    if ($body.value !== cur.body) patch.body = $body.value;
    if (!Object.keys(patch).length) return;
    $status.textContent = 'Speichert …';
    const { error } = await saveItem(id, patch);
    if ($status.isConnected) $status.textContent = error ? 'Nicht gespeichert' : 'Gespeichert';
  }, 600);

  $title.addEventListener('input', saveText);
  $body.addEventListener('input', saveText);
  sheet.querySelector('#f-due')?.addEventListener('change', (e) => saveItem(id, { due_date: e.target.value || null }));
  // Erinnerung
  const $remind = sheet.querySelector('#f-remind'), $rClear = sheet.querySelector('#f-remind-clear'), $rHint = sheet.querySelector('#f-remind-hint');
  const setRemind = async (date) => {
    const iso = date ? date.toISOString() : null;
    $remind.value = date ? toLocalInput(iso) : '';
    $rClear.hidden = !date;
    await saveItem(id, { remind_at: iso, reminded: false });
    $rHint.innerHTML = remindHint(itemById(id));
    if (date && !pushOn() && !pushSupport()) toast('Tipp: In den Einstellungen Mitteilungen aktivieren, dann kommt die Erinnerung auch bei geschlossener App.', 5000);
  };
  $remind.addEventListener('change', () => setRemind($remind.value ? new Date($remind.value) : null));
  $rClear.addEventListener('click', () => setRemind(null));
  sheet.querySelectorAll('[data-remind]').forEach((b) => b.addEventListener('click', () => {
    const v = b.dataset.remind, d = new Date();
    if (v === 'today18') { d.setHours(18, 0, 0, 0); if (d < new Date()) d.setDate(d.getDate() + 1); }
    else if (v === 'tom8') { d.setDate(d.getDate() + 1); d.setHours(8, 0, 0, 0); }
    else d.setMinutes(d.getMinutes() + Number(v), 0, 0);
    setRemind(d);
  }));
  sheet.querySelectorAll('#f-col [data-col]').forEach((x) => x.addEventListener('click', () => {
    sheet.querySelectorAll('#f-col [data-col]').forEach((y) => y.classList.toggle('on', y === x));
    const meta = { ...(itemById(id)?.meta || {}) };
    if (x.dataset.col) meta.color = x.dataset.col; else delete meta.color;
    saveItem(id, { meta });
  }));
  sheet.querySelector('#f-cat').addEventListener('change', (e) => {
    saveItem(id, { category_id: e.target.value || null }).then(() => renderShareArea(sheet, id));
  });
  // Speichern: übernehmen und schließen; Schließen verwirft einen neuen Eintrag (Bestehendes ist schon gespeichert)
  sheet.querySelector('[data-save]').addEventListener('click', closeSheet);
  sheet.querySelector('[data-close]').addEventListener('click', () => {
    if (isNew) { saveText.flush = () => {}; clearSheetClose(); silentDelete(id); }
    closeSheet();
  });
  sheet.querySelector('#f-hide')?.addEventListener('click', () => { saveText.flush(); closeSheet(); hideForMe(id); });
  sheet.querySelector('[data-del]')?.addEventListener('click', async () => {
    saveText.flush = () => {};
    if (await deleteItem(id)) { isNew = false; closeSheet(); }
  });

  renderShareArea(sheet, id);
  if (isNew || (!isNote && !i.title)) setTimeout(() => $title.focus(), 50);
}

// Alle Personen mit Konto als Auswahl (Tippen = teilen / nicht mehr teilen)
const otherPeople = (exclude = []) => Object.values(state.profiles).filter((p) => p.id !== state.me && !exclude.includes(p.id))
  .sort((a, b) => (a.name || a.email).localeCompare(b.name || b.email, 'de'));

export function personPicker(selected, exclude = []) {
  const people = otherPeople(exclude);
  // Ohne sichtbare Konten (Datenbank noch nicht erweitert): wie früher per E-Mail
  if (!people.length) return `<form class="row-inline pp-mail"><input class="input" type="email" name="email" placeholder="E-Mail der Person" autocomplete="email" required><button class="btn secondary" type="submit">Teilen</button></form>`;
  return `<div class="ppick">${people.map((p) => {
    const on = selected.includes(p.id);
    return `<button type="button" class="pp ${on ? 'on' : ''}" data-person="${p.id}" aria-pressed="${on}">
      <span class="pp-av">${esc((p.name || p.email || '?').trim().charAt(0).toUpperCase())}</span>
      <span class="pp-t"><b>${esc(p.name || p.email)}</b><small>${esc(p.email || '')}</small></span>
      <span class="pp-ck">${on ? ICON.check : ''}</span>
    </button>`;
  }).join('')}</div>`;
}

export function renderShareArea(sheet, id) {
  const area = sheet.querySelector('#share-area');
  const i = itemById(id);
  if (!area || !i) return;
  const mine = i.owner_id === state.me;
  const cat = catById(i.category_id);
  let html = '';

  if (!mine) html += `<div class="hint" style="margin:0 2px 8px">Erstellt von ${esc(nameOf(i.owner_id))}.</div>`;
  if (cat && isCatShared(cat)) {
    const people = [cat.owner_id, ...membersOf(cat.id)].filter((u) => u !== state.me).map(nameOf);
    html += `<div class="hint" style="margin:0 2px 8px">Sichtbar für alle in „${esc(cat.name)}“: ${esc(people.join(', '))}</div>`;
  }
  if (mine) {
    const inCat = cat && isCatShared(cat) ? [cat.owner_id, ...membersOf(cat.id)] : [];
    html += personPicker(sharesOf(id), inCat);
  } else if (!(cat && isCatShared(cat))) {
    html += `<div class="hint" style="margin:0 2px">Direkt mit dir geteilt.</div>`;
  }
  area.innerHTML = html;

  area.querySelectorAll('[data-person]').forEach((b) => b.addEventListener('click', async () => {
    const uid = b.dataset.person, p = state.profiles[uid];
    b.disabled = true;
    if (sharesOf(id).includes(uid)) {
      const { error } = await sb.from('item_shares').delete().eq('item_id', id).eq('user_id', uid);
      if (error) { b.disabled = false; return toast('Fehler: ' + error.message); }
      state.shares = state.shares.filter((s) => !(s.item_id === id && s.user_id === uid));
      toast(`Nicht mehr mit ${p?.name || 'dieser Person'} geteilt`);
    } else {
      const { data, error } = await sb.rpc('share_item', { iid: id, target_email: p?.email || '' });
      if (error) { b.disabled = false; return toast('Fehler: ' + error.message); }
      if (data !== 'ok') { b.disabled = false; return toast(shareMessage(data), 3500); }
      state.shares.push({ item_id: id, user_id: uid });
      toast(`Mit ${p?.name || 'Person'} geteilt`);
    }
    renderShareArea(sheet, id); render();
  }));
  area.querySelector('.pp-mail')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const { data, error } = await sb.rpc('share_item', { iid: id, target_email: e.target.email.value });
    if (error) return toast('Fehler: ' + error.message);
    if (data !== 'ok') return toast(shareMessage(data), 3500);
    await loadAll(); renderShareArea(sheet, id); toast('Geteilt');
  });
}

export function shareMessage(code) {
  return {
    not_found: 'Mit dieser E-Mail gibt es noch kein Konto in der App.',
    self: 'Das bist du selbst.',
    not_allowed: 'Nur der Besitzer kann teilen.',
  }[code] || 'Teilen nicht möglich.';
}
