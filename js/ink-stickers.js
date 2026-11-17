// Canvas: Sticker-Sammlung – eigene PNG- und SVG-Dateien ohne Hintergrund bzw. als Sticker gespeicherte Auswahlen
// (als PNG gespeichert, ink-store.js). Namen und Gruppen je Person in profiles.cat_order 'stk' = [[datei, name, gruppe], …].
// Antippen setzt den Sticker auf die Seite; „Bearbeiten“: Name und Gruppe ändern, aus der Sammlung entfernen.
import { esc, toast } from './core.js';
import { catOrder, saveProfileList } from './folders.js';
import { ICON } from './icons.js';
import { deleteSticker, imageUrl, listStickers, uploadSticker } from './ink-store.js';
import { LOADER } from './loader.js';
import { closeSheet, openSheet, sheetActs } from './sheet.js';

const FILE = /^stk-[\w-]{1,48}\.png$/;
const fileOf = (path) => path.split('/').pop();
const clean = (v) => (typeof v === 'string' ? v.trim().slice(0, 40) : '');

// Namen und Gruppen (geprüft): Datei -> { n, g }
function readMeta() {
  const map = new Map();
  for (const e of catOrder('stk')) if (Array.isArray(e) && FILE.test(e[0] || '')) map.set(e[0], { n: clean(e[1]), g: clean(e[2]) });
  return map;
}
const saveMeta = (map) => saveProfileList('stk', [...map].filter(([, m]) => m.n || m.g).map(([f, m]) => [f, m.n, m.g]));

// Namen für einen neu gespeicherten Sticker merken (z. B. Text der Auswahl)
export async function nameSticker(path, name) {
  const n = clean(name);
  if (!n) return;
  const map = readMeta();
  map.set(fileOf(path), { n, g: '' });
  await saveMeta(map);
}

// onPick(pfad): Sticker einfügen
export function openStickers({ onPick }) {
  const sheet = openSheet(`<div class="sheet-head"><h2>Sticker</h2>${sheetActs({ edit: true })}</div>
    <div class="stk-body"><div class="center loading">${LOADER}</div></div>`);
  const body = sheet.querySelector('.stk-body');
  let list = [], editing = false, meta = readMeta();
  const info = (p) => meta.get(fileOf(p)) || { n: '', g: '' };
  const setInfo = (p, patch) => { meta.set(fileOf(p), { ...info(p), ...patch }); saveMeta(meta); };

  function tile(p, groups) {
    const { n, g } = info(p);
    if (!editing) return `<div class="stk"><button class="stk-pick" data-p="${esc(p)}" aria-label="${esc(n || 'Sticker')} einfügen"><img alt=""></button>${n ? `<span class="stk-n">${esc(n)}</span>` : ''}</div>`;
    return `<div class="stk"><div class="stk-pick" data-p="${esc(p)}"><img alt=""></div>
      <input class="input stk-in" data-name="${esc(p)}" maxlength="40" value="${esc(n)}" placeholder="Name" aria-label="Name">
      <select class="input stk-in" data-grp="${esc(p)}" aria-label="Gruppe"><option value="">Ohne Gruppe</option>
        ${groups.map((x) => `<option value="${esc(x)}" ${x === g ? 'selected' : ''}>${esc(x)}</option>`).join('')}<option value="__neu__">Neue Gruppe …</option></select>
      <button class="stk-del" data-del="${esc(p)}" aria-label="Sticker entfernen" title="Entfernen">${ICON.close}</button></div>`;
  }

  // Gruppen als Abschnitte (alphabetisch, „Ohne Gruppe“ zuletzt); ohne Gruppen eine einzige Fläche
  function draw() {
    const groups = [...new Set(list.map((p) => info(p).g).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'de'));
    const add = `<label class="stk stk-add">${ICON.plus}<span>Neu</span><input type="file" accept="image/png,image/svg+xml,.svg" multiple hidden></label>`;
    body.classList.toggle('editing', editing);
    body.innerHTML = !groups.length ? `<div class="stk-grid">${add}${list.map((p) => tile(p, groups)).join('')}</div>`
      : `<div class="stk-grid">${add}</div>` + [...groups, ''].map((g) => {
        const own = list.filter((p) => info(p).g === g);
        return own.length ? `<div class="stk-h">${esc(g || 'Ohne Gruppe')}<i>${own.length}</i></div><div class="stk-grid">${own.map((p) => tile(p, groups)).join('')}</div>` : '';
      }).join('');
    body.querySelectorAll('[data-p]').forEach((b) => imageUrl(b.dataset.p).then((src) => { if (src) b.firstElementChild.src = src; }));
  }
  async function load() {
    try { list = await listStickers(); } catch (e) { toast('Sticker konnten nicht geladen werden: ' + (e.message || e)); }
    draw();
  }

  sheet.querySelector('[data-close]').addEventListener('click', closeSheet);
  sheet.querySelector('[data-edit]').addEventListener('click', (e) => { editing = !editing; e.currentTarget.classList.toggle('on', editing); draw(); });
  body.addEventListener('change', async (e) => {
    const t = e.target;
    if (t.dataset.name) return setInfo(t.dataset.name, { n: clean(t.value) });
    if (t.dataset.grp) {
      if (t.value !== '__neu__') { setInfo(t.dataset.grp, { g: t.value }); return draw(); }
      const inp = Object.assign(document.createElement('input'), { className: 'input stk-in', maxLength: 40, placeholder: 'Neue Gruppe' });
      inp.dataset.newgrp = t.dataset.grp;
      t.replaceWith(inp);
      inp.focus();
      return;
    }
    if (t.dataset.newgrp) { setInfo(t.dataset.newgrp, { g: clean(t.value) }); return draw(); }
    const files = [...(t.files || [])];
    if (!files.length) return;
    toast(files.length > 1 ? `${files.length} Sticker werden hochgeladen …` : 'Sticker wird hochgeladen …');
    for (const f of files) {
      try { const path = await uploadSticker(f); meta.set(fileOf(path), { n: clean(f.name.replace(/\.[^.]+$/, '')), g: '' }); }
      catch (err) { toast(`${f.name}: ${err.message || err}`, 4000); }
    }
    saveMeta(meta);
    load();
  });
  body.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.matches('input')) e.target.blur(); });
  body.addEventListener('focusout', (e) => { if (e.target.dataset?.newgrp && !e.target.value.trim()) draw(); });
  body.addEventListener('click', async (e) => {
    const del = e.target.closest('[data-del]'), pick = e.target.closest('button[data-p]');
    if (del) {
      await deleteSticker(del.dataset.del);
      meta.delete(fileOf(del.dataset.del));
      saveMeta(meta);
      list = list.filter((p) => p !== del.dataset.del);
      draw();
    } else if (pick) { closeSheet(); onPick(pick.dataset.p); }
  });
  load();
}
