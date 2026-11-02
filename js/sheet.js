// Fenster von unten (Sheets) und gemeinsame Bausteine darin
import { $sheetRoot, COLORS, esc, isCatShared, state } from './core.js';

// Farbauswahl (leer = keine Farbe)
export const colorPick = (cur, id) => `<div class="colors" id="${id}">
  <button type="button" class="color none ${!cur ? 'on' : ''}" data-col="" aria-label="Keine Farbe"></button>
  ${COLORS.map((col) => `<button type="button" class="color ${col === cur ? 'on' : ''}" data-col="${col}" style="background:${col}" aria-label="Farbe"></button>`).join('')}</div>`;

// ====================================================================
// Sheets (Overlays)
// ====================================================================
let onSheetClose = null;

export function openSheet(html, { full = false, onClose = null } = {}) {
  closeSheet();
  onSheetClose = onClose;
  $sheetRoot.innerHTML = `<div class="backdrop"><div class="sheet ${full ? 'full' : ''}">${html}</div></div>`;
  const bd = $sheetRoot.querySelector('.backdrop');
  bd.addEventListener('click', (e) => { if (e.target === bd) closeSheet(); });
  document.body.style.overflow = 'hidden';
  return $sheetRoot.querySelector('.sheet');
}

// Schließen ohne die hinterlegte Aktion (z. B. leeren Eintrag löschen) auszuführen
export function clearSheetClose() { onSheetClose = null; }

export function closeSheet() {
  if (onSheetClose) { const f = onSheetClose; onSheetClose = null; f(); }
  $sheetRoot.innerHTML = '';
  document.body.style.overflow = '';
}

export function categoryOptions(selected) {
  return `<option value="">Ohne Kategorie</option>` + state.categories.map((c) =>
    `<option value="${c.id}" ${c.id === selected ? 'selected' : ''}>${esc(c.name)}${isCatShared(c) ? ' (gemeinsam)' : ''}</option>`).join('');
}
