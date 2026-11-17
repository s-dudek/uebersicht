// Canvas: Sticker-Sammlung – eigene PNG- und SVG-Dateien ohne Hintergrund (als PNG gespeichert, ink-store.js).
// Antippen setzt den Sticker auf die Seite; „Bearbeiten“ zeigt Knöpfe zum Entfernen aus der Sammlung.
import { esc, toast } from './core.js';
import { ICON } from './icons.js';
import { deleteSticker, imageUrl, listStickers, uploadSticker } from './ink-store.js';
import { LOADER } from './loader.js';
import { closeSheet, openSheet, sheetActs } from './sheet.js';

// onPick(pfad): Sticker einfügen
export function openStickers({ onPick }) {
  const sheet = openSheet(`<div class="sheet-head"><h2>Sticker</h2>${sheetActs({ edit: true })}</div>
    <div class="stk-grid"><div class="center loading">${LOADER}</div></div>`);
  const grid = sheet.querySelector('.stk-grid');
  let list = [], editing = false;

  function draw() {
    grid.classList.toggle('editing', editing);
    grid.innerHTML = `<label class="stk stk-add">${ICON.plus}<span>Neu</span>
        <input type="file" accept="image/png,image/svg+xml,.svg" multiple hidden></label>`
      + list.map((p) => `<div class="stk"><button class="stk-pick" data-p="${esc(p)}" aria-label="Sticker einfügen"><img alt=""></button>
        <button class="stk-del" data-del="${esc(p)}" aria-label="Sticker entfernen" title="Entfernen">${ICON.close}</button></div>`).join('');
    grid.querySelectorAll('.stk-pick').forEach((b) => imageUrl(b.dataset.p).then((src) => { if (src) b.firstElementChild.src = src; }));
  }
  async function load() {
    try { list = await listStickers(); } catch (e) { toast('Sticker konnten nicht geladen werden: ' + (e.message || e)); }
    draw();
  }

  sheet.querySelector('[data-close]').addEventListener('click', closeSheet);
  sheet.querySelector('[data-edit]').addEventListener('click', (e) => { editing = !editing; e.currentTarget.classList.toggle('on', editing); draw(); });
  grid.addEventListener('change', async (e) => {
    const files = [...(e.target.files || [])];
    if (!files.length) return;
    toast(files.length > 1 ? `${files.length} Sticker werden hochgeladen …` : 'Sticker wird hochgeladen …');
    for (const f of files) { try { await uploadSticker(f); } catch (err) { toast(`${f.name}: ${err.message || err}`, 4000); } }
    load();
  });
  grid.addEventListener('click', async (e) => {
    const del = e.target.closest('[data-del]'), pick = e.target.closest('[data-p]');
    if (del) { await deleteSticker(del.dataset.del); list = list.filter((p) => p !== del.dataset.del); draw(); }
    else if (pick && !editing) { closeSheet(); onPick(pick.dataset.p); }
  });
  load();
}
