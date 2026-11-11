// Fenster von unten (Sheets) und gemeinsame Bausteine darin
import { $sheetRoot, COLORS, esc, isCatShared, state } from './core.js';
import { ICON } from './icons.js';

// Farbauswahl (leer = keine Farbe)
export const colorPick = (cur, id) => `<div class="colors" id="${id}">
  <button type="button" class="color none ${!cur ? 'on' : ''}" data-col="" aria-label="Keine Farbe"></button>
  ${COLORS.map((col) => `<button type="button" class="color ${col === cur ? 'on' : ''}" data-col="${col}" style="background:${col}" aria-label="Farbe"></button>`).join('')}</div>`;

// Knöpfe oben rechts im Fenster: rund, immer gleich angeordnet – Bearbeiten, Speichern, Schließen, Löschen.
// data-close schließt (überall gleich verdrahtet); data-edit, data-save und data-del verdrahtet das jeweilige Fenster.
export function sheetActs({ edit = false, save = false, del = false, saveLabel = 'Speichern', delLabel = 'Löschen' } = {}) {
  const b = (attr, icon, label, cls = '') => `<button type="button" class="sh-b ${cls}" ${attr} aria-label="${esc(label)}" title="${esc(label)}">${ICON[icon]}</button>`;
  return `<span class="sh-acts">${edit ? b('data-edit', 'pen', 'Bearbeiten') : ''}${save ? b('data-save', 'check', saveLabel, 'save') : ''}${b('data-close', 'close', 'Schließen')}${del ? b('data-del', 'trash', delLabel, 'del') : ''}</span>`;
}

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
