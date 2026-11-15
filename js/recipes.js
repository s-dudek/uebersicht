// Bereich Essen → Rezepte: Sammlung mit Fotos, Bewertung, Notiz, Portionen umrechnen, Kochen Schritt für Schritt (cook.js),
// Zutaten auf die Einkaufsliste, in den Wochenplan übernehmen. Anlegen von Hand oder per Code („rezepte“, z. B. von Claude aus einem Foto).
// Rezept = Eintrag Typ 'recipe' im Ordner „Wocheneinkauf“ (geteilt wie die Gerichte); meta:
// { servings, unit (z. B. „Kastenkuchen“, sonst Portionen), minutes, tags[], ingredients: [{ n Name, q Menge, s Abteilung }], steps[], note, rating 0–5,
//   photos[] (Storage-Pfade), source }
import { canDeleteItem, debounce, esc, itemById, sb, state, toast } from './core.js';
import { deleteItem, saveItem } from './data.js';
import { ymd } from './dates.js';
import { ICON } from './icons.js';
import { imageUrl, isImagePath, removeImages, uploadImage } from './ink-store.js';
import { openCook } from './cook.js';
import { addToShop, ensureShopCat, SECTIONS, SLOTS } from './meals.js';
import { render } from './render.js';
import { closeSheet, openSheet, sheetActs } from './sheet.js';

const recipes = () => state.items.filter((i) => i.type === 'recipe')
  .sort((a, b) => (b.meta?.rating || 0) - (a.meta?.rating || 0) || a.title.localeCompare(b.title, 'de'));
// Einheit der Menge: eigene (z. B. „Kastenkuchen“) oder Portion/Portionen
const unitOf = (m, n) => m.unit || (n === 1 ? 'Portion' : 'Portionen');
const photosOf = (r) => (r.meta?.photos || []).filter(isImagePath);
const stars = (n, act = '') => `<span class="rc-stars">${[1, 2, 3, 4, 5].map((k) => `<${act ? `button type="button" data-star="${k}" aria-label="${k} Sterne"` : 'i'} class="${k <= n ? 'on' : ''}">${ICON.star}</${act ? 'button' : 'i'}>`).join('')}</span>`;

// ---------- Mengen: Zahl am Anfang erkennen und für andere Portionen umrechnen ----------
const FRACTIONS = { '½': 0.5, '¼': 0.25, '¾': 0.75, '⅓': 1 / 3, '⅔': 2 / 3 };
const UNITS = /^(g|kg|ml|l|el|tl|msp|prise|prisen|stk|stück|pkg|packung|packungen|dose|dosen|becher|bund|zehe|zehen|scheibe|scheiben|tasse|tassen|große|großer|kleine|kleiner|reife)\b/i;
function scaleQty(q, k) {
  const m = String(q || '').match(/^\s*(\d+(?:[.,]\d+)?|[½¼¾⅓⅔])(.*)$/);
  if (!m || k === 1) return q || '';
  const v = (FRACTIONS[m[1]] ?? parseFloat(m[1].replace(',', '.'))) * k;
  const r = v >= 10 ? Math.round(v) : Math.round(v * 10) / 10;
  return `${String(r).replace('.', ',')}${m[2]}`;
}
// „160 g Weizenmehl“ → { q: '160 g', n: 'Weizenmehl' } (für das Eingabefeld, eine Zutat je Zeile)
function parseLine(line) {
  const m = line.trim().match(/^(\d+(?:[.,]\d+)?|[½¼¾⅓⅔])\s*(.*)$/);
  if (!m) return { q: '', n: line.trim() };
  const u = m[2].match(UNITS);
  const q = u ? `${m[1]} ${u[0]}` : m[1];
  return { q, n: (u ? m[2].slice(u[0].length) : m[2]).trim() || m[2].trim() };
}
// Abteilung für die Einkaufsliste grob aus dem Namen erraten (lässt sich in der Liste ändern)
const GUESS = [['Obst & Gemüse', /banane|apfel|zitrone|tomate|paradeiser|zwiebel|knoblauch|salat|karotte|erdäpfel|kartoffel|beere|gurke|paprika|kräuter/i],
  ['Kühlregal', /milch|drink|joghurt|butter|käse|topfen|sahne|obers|ei(er)?\b|tofu/i], ['Fleisch & Fisch', /fleisch|huhn|hähnchen|rind|schwein|lachs|fisch|speck|wurst/i],
  ['Gewürze & Öle', /salz|pfeffer|öl|essig|vanille|zimt|gewürz|natron|backpulver/i], ['Süßes & Snacks', /schoko|kakao|zucker|honig|sirup|dicksaft/i],
  ['Trockenware & Konserven', /mehl|stärke|reis|nudel|pasta|haferflocken|linsen|bohnen|dose|nüsse|samen/i], ['Brot & Backwaren', /brot|semmel|toast/i]];
const guessSection = (n) => GUESS.find(([, re]) => re.test(n))?.[0] || 'Sonstiges';

// ---------- Übersicht ----------
export function renderRecipes() {
  const list = recipes();
  queueMicrotask(fillPhotos);   // Fotos nachladen, sobald die Ansicht steht
  const card = (r) => {
    const m = r.meta || {}, p = photosOf(r)[0];
    return `<button class="rc-card" data-act="open" data-id="${r.id}" data-q="${esc(`${r.title} ${(m.tags || []).join(' ')}`.toLowerCase())}">
      <span class="rc-img">${p ? `<img data-photo="${esc(p)}" alt="">` : ICON.pot}</span>
      <span class="rc-body"><b>${esc(r.title || 'Rezept')}</b>
        <span class="rc-meta">${m.rating ? stars(m.rating) : ''}${m.minutes ? `<small>${ICON.clock}${esc(m.minutes)} Min.</small>` : ''}</span>
        ${(m.tags || []).length ? `<span class="m-tags">${m.tags.slice(0, 3).map((t) => `<i>${esc(t)}</i>`).join('')}</span>` : ''}</span></button>`;
  };
  return `<div class="rc-top"><input class="input rc-q" id="rc-q" type="search" placeholder="Rezept suchen …" autocomplete="off"></div>
    ${list.length ? `<div class="rc-grid">${list.map(card).join('')}</div>` : '<section class="tile"><p class="empty">Noch keine Rezepte. Neues Rezept anlegen oder ein Foto an Claude schicken und den Code einfügen.</p></section>'}`;
}
// Suche: Karten nur aus- und einblenden (kein Neuzeichnen, das Feld behält den Fokus)
export function filterRecipes(q) {
  const s = q.trim().toLowerCase();
  document.querySelectorAll('.rc-card').forEach((c) => { c.hidden = !!s && !c.dataset.q.includes(s); });
}
function fillPhotos(root = document) {
  root.querySelectorAll('img[data-photo]:not([src])').forEach((img) => imageUrl(img.dataset.photo).then((u) => { if (u) img.src = u; }));
}

// ---------- Rezept ansehen: Fotos, Bewertung, Portionen, Zutaten (auf die Einkaufsliste), Zubereitung (Schritt für Schritt), Notiz ----------
export function openRecipe(id) {
  const r = itemById(id);
  if (!r) return;
  const m = r.meta || {}, base = Math.max(1, +m.servings || 1);
  let servings = base;
  const ingHtml = () => (m.ingredients || []).map((x, k) => `<label class="rc-ing"><input type="checkbox" data-ing="${k}" checked><span class="rc-q">${esc(scaleQty(x.q, servings / base))}</span><span>${esc(x.n)}</span></label>`).join('');
  const sheet = openSheet(`<div class="sheet-head"><span class="status">Rezept</span>${sheetActs({ edit: true, del: canDeleteItem(r), delLabel: 'Rezept löschen' })}</div>
    <div class="rc-photos">${photosOf(r).map((p) => `<span class="rc-ph"><img data-photo="${esc(p)}" alt=""><button type="button" class="rc-ph-x" data-unphoto="${esc(p)}" aria-label="Foto entfernen">${ICON.close}</button></span>`).join('')}
      <label class="rc-ph rc-ph-add">${ICON.image}<span>Foto</span><input type="file" accept="image/*" id="rc-file" hidden></label></div>
    <h2 class="rc-title">${esc(r.title || 'Rezept')}</h2>
    <div class="rc-line">${stars(m.rating || 0, 'rate')}${m.minutes ? `<span class="utag light">${ICON.clock} ${esc(m.minutes)} Min.</span>` : ''}${(m.tags || []).map((t) => `<span class="utag light">${esc(t)}</span>`).join('')}</div>
    ${(m.ingredients || []).length ? `<div class="field"><label>Zutaten</label>
      <div class="rc-serv"><button type="button" class="cbtn" data-serv="-1" aria-label="Weniger Portionen">${ICON.minus}</button><b id="rc-n">${servings}</b><span>${esc(unitOf(m, servings))}</span><button type="button" class="cbtn" data-serv="1" aria-label="Mehr Portionen">${ICON.plus}</button></div>
      <div class="rc-ings" id="rc-ings">${ingHtml()}</div>
      <button class="btn secondary block rc-act" type="button" id="rc-shop">${ICON.cart} Auf die Einkaufsliste</button></div>` : ''}
    ${(m.steps || []).length ? `<div class="field"><label>Zubereitung</label>
      <button class="btn block rc-act rc-cook" type="button" id="rc-cook">${ICON.clock} Schritt für Schritt kochen</button>
      <ol class="steps">${m.steps.map((x) => `<li>${esc(x)}</li>`).join('')}</ol></div>` : ''}
    <div class="field"><label for="rc-note">Notiz</label><textarea class="textarea" id="rc-note" placeholder="Was wir anders machen, wie es geschmeckt hat …">${esc(m.note || '')}</textarea></div>
    ${m.source ? `<p class="muted rc-src">Quelle: ${esc(m.source)}</p>` : ''}
    <button class="btn block rc-act" type="button" id="rc-plan">${ICON.calendar} In den Wochenplan</button>`, { onClose: () => saveNote.flush() });
  fillPhotos(sheet);
  const meta = () => ({ ...(itemById(id)?.meta || {}) });
  const saveNote = debounce(() => { const v = sheet.querySelector('#rc-note').value; if (v !== (itemById(id)?.meta?.note || '')) saveItem(id, { meta: { ...meta(), note: v } }); }, 600);
  sheet.querySelector('#rc-note').addEventListener('input', saveNote);
  sheet.querySelector('[data-close]').addEventListener('click', closeSheet);
  sheet.querySelector('[data-edit]').addEventListener('click', () => { saveNote.flush(); editRecipe(id); });
  sheet.querySelector('[data-del]')?.addEventListener('click', async () => { saveNote.flush = () => {}; if (await deleteItem(id)) closeSheet(); });
  // Bewertung: nochmal auf denselben Stern = keine Bewertung
  sheet.querySelectorAll('[data-star]').forEach((b) => b.addEventListener('click', () => {
    const k = +b.dataset.star, rating = (itemById(id)?.meta?.rating || 0) === k ? 0 : k;
    sheet.querySelectorAll('[data-star]').forEach((s) => s.classList.toggle('on', +s.dataset.star <= rating));
    saveItem(id, { meta: { ...meta(), rating } });
  }));
  // Portionen umrechnen
  sheet.querySelectorAll('[data-serv]').forEach((b) => b.addEventListener('click', () => {
    servings = Math.max(1, Math.min(40, servings + +b.dataset.serv));
    sheet.querySelector('#rc-n').textContent = servings;
    sheet.querySelector('#rc-ings').innerHTML = ingHtml();
  }));
  // Kochmodus: ein Schritt nach dem anderen, mit Zutaten für die gewählte Menge, Timer und Stoppuhr
  sheet.querySelector('#rc-cook')?.addEventListener('click', () => {
    saveNote.flush();
    openCook({ title: r.title, steps: m.steps || [], ingredients: (m.ingredients || []).map((x) => [scaleQty(x.q, servings / base), x.n].filter(Boolean).join(' ')) });
  });
  sheet.querySelector('#rc-shop')?.addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    const picked = [...sheet.querySelectorAll('[data-ing]:checked')].map((c) => (m.ingredients || [])[+c.dataset.ing]).filter(Boolean);
    if (!picked.length) return toast('Keine Zutat ausgewählt.');
    btn.disabled = true;
    try {
      const res = await addToShop(picked.map((x) => ({ name: x.n, menge: scaleQty(x.q, servings / base), abteilung: x.s || guessSection(x.n), fuer: r.title })));
      toast(`${res.added + res.merged} Zutaten auf der Einkaufsliste`);
    } catch (err) { toast('Fehler: ' + err.message, 4000); }
    btn.disabled = false;
  });
  sheet.querySelector('#rc-plan').addEventListener('click', () => planRecipe(id, servings));
  // Fotos: hinzufügen (verkleinert, im Ordner „Wocheneinkauf“ gespeichert) und entfernen
  sheet.querySelector('#rc-file').addEventListener('change', async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    try {
      const cat = await ensureShopCat();
      const { path } = await uploadImage(f, cat.id);
      await saveItem(id, { meta: { ...meta(), photos: [...photosOf(itemById(id)), path] } });
      openRecipe(id);
    } catch (err) { toast('Foto: ' + err.message, 4000); }
  });
  sheet.querySelectorAll('[data-unphoto]').forEach((b) => b.addEventListener('click', async () => {
    const p = b.dataset.unphoto;
    await saveItem(id, { meta: { ...meta(), photos: photosOf(itemById(id)).filter((x) => x !== p) } });
    removeImages([p]).catch(() => {});
    openRecipe(id);
  }));
}

// ---------- Anlegen und bearbeiten (eine Zutat bzw. ein Schritt je Zeile) ----------
export function editRecipe(id = null) {
  const r = id ? itemById(id) : null, m = r?.meta || {};
  const num = (k, label, v) => `<label class="rc-num"><span>${label}</span><input class="input" type="number" inputmode="decimal" min="0" id="rc-${k}" value="${v ?? ''}"></label>`;
  const sheet = openSheet(`<div class="sheet-head"><h2>${r ? 'Rezept bearbeiten' : 'Neues Rezept'}</h2>${sheetActs({ save: true })}</div>
    <input class="title-input" id="rc-title" placeholder="Name des Rezepts" value="${esc(r?.title || '')}" maxlength="140" autocomplete="off">
    <div class="rc-nums">${num('servings', 'Menge', m.servings)}<label class="rc-num"><span>Einheit</span><input class="input" id="rc-unit" placeholder="Portionen" maxlength="30" value="${esc(m.unit || '')}"></label>${num('minutes', 'Minuten', m.minutes)}</div>
    <div class="field"><label for="rc-tags">Schlagworte</label><input class="input" id="rc-tags" placeholder="z. B. Kuchen, vegan, schnell" value="${esc((m.tags || []).join(', '))}"></div>
    <div class="field"><label for="rc-ing">Zutaten</label><textarea class="textarea rc-area" id="rc-ing" placeholder="160 g Weizenmehl&#10;2 Bananen">${esc((m.ingredients || []).map((x) => [x.q, x.n].filter(Boolean).join(' ')).join('\n'))}</textarea></div>
    <div class="field"><label for="rc-steps">Zubereitung</label><textarea class="textarea rc-area" id="rc-steps" placeholder="Ein Schritt je Zeile">${esc((m.steps || []).join('\n'))}</textarea></div>
    <div class="field"><label for="rc-source">Quelle</label><input class="input" id="rc-source" placeholder="z. B. Kochbuch, Webseite" value="${esc(m.source || '')}"></div>`);
  const $ = (s) => sheet.querySelector(s);
  const numOr = (s) => { const v = $(s).value; return v === '' ? null : Math.max(0, +v); };
  sheet.querySelector('[data-close]').addEventListener('click', closeSheet);
  sheet.querySelector('[data-save]').addEventListener('click', async () => {
    const title = $('#rc-title').value.trim();
    if (!title) { $('#rc-title').focus(); return toast('Bitte einen Namen eingeben.'); }
    // bestehende Abteilungen behalten, neue Zutaten grob einordnen
    const known = new Map((m.ingredients || []).map((x) => [x.n.toLowerCase(), x.s]));
    const ingredients = $('#rc-ing').value.split('\n').map((l) => l.trim()).filter(Boolean).map(parseLine)
      .map((x) => ({ ...x, s: known.get(x.n.toLowerCase()) || guessSection(x.n) }));
    const next = { ...m, servings: numOr('#rc-servings'), unit: $('#rc-unit').value.trim(), minutes: numOr('#rc-minutes'),
      tags: $('#rc-tags').value.split(',').map((t) => t.trim()).filter(Boolean).slice(0, 8), ingredients,
      steps: $('#rc-steps').value.split('\n').map((l) => l.trim()).filter(Boolean), source: $('#rc-source').value.trim() };
    if (r) { await saveItem(id, { title, meta: next }); return openRecipe(id); }
    const created = await createRecipe(title, next);
    if (created) openRecipe(created.id);
  });
  setTimeout(() => $('#rc-title').focus(), 60);
}

async function createRecipe(title, meta) {
  const cat = await ensureShopCat().catch((e) => { toast('Fehler: ' + e.message, 4000); return null; });
  if (!cat) return null;
  const now = new Date().toISOString();
  const row = { id: crypto.randomUUID(), owner_id: state.me, type: 'recipe', title: title.slice(0, 140), body: '', category_id: cat.id, meta: { rating: 0, photos: [], ...meta } };
  const { error } = await sb.from('items').insert(row);   // ohne .select() (siehe CLAUDE.md)
  if (error) { toast('Fehler: ' + error.message, 4000); return null; }
  state.items.unshift({ ...row, done: false, due_date: null, created_at: now, updated_at: now });
  render();
  return row;
}

// ---------- Rezepte aus einem Code (plan-import.js): { titel, portionen, einheit, dauer_min, tags, zutaten, zubereitung, hinweis, quelle } ----------
export const validRecipes = (list) => (Array.isArray(list) ? list.filter((x) => x && typeof x.titel === 'string' && x.titel.trim()) : []);
export async function importRecipes(list) {
  let n = 0;
  for (const x of validRecipes(list)) {
    const num = (v) => (Number.isFinite(+v) && v !== null && v !== '' ? +v : null);
    const ingredients = (Array.isArray(x.zutaten) ? x.zutaten : []).slice(0, 60).map((z) => (typeof z === 'string' ? { ...parseLine(z), s: '' }
      : { n: String(z?.name || '').slice(0, 120), q: String(z?.menge || '').slice(0, 40), s: SECTIONS.some(([k]) => k === z?.abteilung) ? z.abteilung : '' }))
      .filter((z) => z.n).map((z) => ({ ...z, s: z.s || guessSection(z.n) }));
    const meta = { servings: num(x.portionen), minutes: num(x.dauer_min), tags: (Array.isArray(x.tags) ? x.tags : []).map(String).slice(0, 8), ingredients,
      steps: (Array.isArray(x.zubereitung) ? x.zubereitung : []).map(String).slice(0, 40), note: String(x.hinweis || ''), source: String(x.quelle || ''), unit: String(x.einheit || '').slice(0, 30) };
    if (await createRecipe(String(x.titel).trim(), meta)) n++;
  }
  return n;
}

// ---------- In den Wochenplan: Tag und Mahlzeit wählen, das Gericht verweist auf das Rezept ----------
function planRecipe(id, servings) {
  const r = itemById(id);
  if (!r) return;
  const sheet = openSheet(`<div class="sheet-head"><h2>In den Wochenplan</h2>${sheetActs({ save: true, saveLabel: 'Eintragen' })}</div>
    <p class="cm-what"><b>${esc(r.title)}</b><span>${servings} ${esc(unitOf(r.meta || {}, servings))}</span></p>
    <div class="field"><label for="rp-day">Tag</label><input class="input" type="date" id="rp-day" value="${ymd(new Date())}"></div>
    <div class="field"><label for="rp-slot">Mahlzeit</label><select class="select" id="rp-slot">${SLOTS.map(([k, l]) => `<option value="${k}" ${k === 'mittag' ? 'selected' : ''}>${l}</option>`).join('')}</select></div>`);
  sheet.querySelector('[data-close]').addEventListener('click', () => openRecipe(id));
  sheet.querySelector('[data-save]').addEventListener('click', async () => {
    const day = sheet.querySelector('#rp-day').value, slot = sheet.querySelector('#rp-slot').value;
    if (!day) return;
    const m = r.meta || {}, k = servings / Math.max(1, +m.servings || 1);
    const cat = await ensureShopCat();
    const row = { id: crypto.randomUUID(), owner_id: state.me, type: 'meal', title: r.title, body: '', category_id: cat.id, due_date: day,
      meta: { slot, cook_date: day, servings, minutes: m.minutes || null, tags: m.tags || [], recipe: id, note: m.note || '',
        ingredients: (m.ingredients || []).map((x) => [scaleQty(x.q, k), x.n].filter(Boolean).join(' ')), steps: m.steps || [] } };
    const { error } = await sb.from('items').insert(row);
    if (error) return toast('Fehler: ' + error.message, 4000);
    const now = new Date().toISOString();
    state.items.unshift({ ...row, done: false, created_at: now, updated_at: now });
    closeSheet();
    render();
    toast('Im Wochenplan eingetragen');
  });
}
