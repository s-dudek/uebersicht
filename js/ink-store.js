// Canvas: Speichern und Laden der Seiten (Tabelle ink_pages) und Bilder (Speicher "ink")
import { safeColor, sb, state } from './core.js';
import { FONTS } from './ink-draw.js';
import { FRAME_LAYOUTS, LAYOUT_FIELDS } from './ink-layout.js';

const BUCKET = 'ink';
const IMG_PATH = /^(?:[uc]\/)?[\w-]{1,64}\/[\w-]{1,64}\.(?:jpg|png)$/;   // u/<user-id>/… oder c/<ordner-id>/… (ältere: <user-id>/…); PNG: Sticker
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DAY = /^\d{4}-\d{2}-\d{2}$/, TIME = /^\d{2}:\d{2}$/;
const EXT_OCC = /^x:[\w.@:#-]{1,400}$/;   // Termin eines verknüpften Kalenders (cal-sources.js)
const LAYER_ID = /^L[\w-]{1,24}$/;                     // Ebene (ink-layers.js)
const MAX_IMG = 1600;                                  // längste Bildseite in Pixel
const MAX_STICKER = 1024;                              // längste Seite eines Stickers in Pixel
const STICKER = /^stk-[\w-]{1,48}\.png$/;              // Sticker der eigenen Sammlung: u/<user-id>/stk-….png
export const newId = () => crypto.randomUUID();

// ---------- Striche kompakt speichern: Ganzzahlen, ab dem 2. Punkt als Differenz ----------
// Ein Strich im Speicher: { t: 's', c: Farbe, w: Breite, pts: [x, y, druck, x, y, druck, …] } (Einheiten der Seite, Druck 0–1)
const Q = [4, 4, 20];   // Auflösung: 1/4 Einheit, Druck in 20 Stufen

function encodePts(pts) {
  const out = new Array(pts.length);
  const prev = [0, 0, 0];
  for (let i = 0; i < pts.length; i++) {
    const k = i % 3, v = Math.round(pts[i] * Q[k]);
    out[i] = v - prev[k];
    prev[k] = v;
  }
  return out.join(',');
}

function decodePts(str) {
  if (typeof str !== 'string' || !str) return [];
  const raw = str.split(',');
  const pts = new Array(raw.length - (raw.length % 3));
  const acc = [0, 0, 0];
  for (let i = 0; i < pts.length; i++) {
    const k = i % 3, d = parseInt(raw[i], 10);
    acc[k] += Number.isFinite(d) ? d : 0;
    pts[i] = acc[k] / Q[k];
  }
  return pts;
}

const num = (v, min, max, def) => (Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : def);

// Bild-Radierspuren: Punkte relativ zum Bild (0–1), auf 1/2000 genau
const ER_Q = 2000;
function encodeRel(pts) {
  const prev = [0, 0];
  return pts.map((v, i) => { const q = Math.round(v * ER_Q), d = q - prev[i % 2]; prev[i % 2] = q; return d; }).join(',');
}
function decodeRel(str) {
  if (typeof str !== 'string' || !str) return [];
  const raw = str.split(',').slice(0, 20000);
  const acc = [0, 0];
  return raw.slice(0, raw.length - (raw.length % 2)).map((d, i) => {
    acc[i % 2] += parseInt(d, 10) || 0;
    return Math.min(2, Math.max(-1, acc[i % 2] / ER_Q));
  });
}

// Text: gespeichert und beim Laden geprüft (auch Texte in Titeln)
const rotOut = (it) => (it.r ? { r: Math.round(it.r * 1e4) / 1e4 } : {});   // Drehung (Bogenmaß)
const rotIn = (it) => { const r = num(it?.r, 0, 6.2832, 0); return r ? { r } : {}; };
const textOut = (it) => ({ t: 'x', x: it.x, y: it.y, txt: it.txt, c: it.c, fs: it.fs, ff: it.ff, fw: it.fw, ...(it.i ? { i: 1 } : {}), ...rotOut(it) });
function textIn(it) {
  if (it?.t !== 'x' || typeof it.txt !== 'string' || !it.txt) return null;
  return { t: 'x', x: num(it.x, -1e6, 1e6, 0), y: num(it.y, -1e6, 1e6, 0), txt: it.txt.slice(0, 2000), c: safeColor(it.c, '#0C3741'), fs: num(it.fs, 4, 400, 20),
    ff: FONTS[it.ff] ? it.ff : 'sans', fw: [300, 400, 500, 700].includes(it.fw) ? it.fw : 400, ...(it.i === 1 ? { i: 1 } : {}), ...rotIn(it) };
}
const textsIn = (list) => (Array.isArray(list) ? list.slice(0, 50).map(textIn).filter(Boolean) : []);

const strokeOut = (s) => ({ c: s.c, w: s.w, p: encodePts(s.pts), ...(s.m ? { m: 1 } : {}) });
const strokeIn = (s) => ({ t: 's', c: safeColor(s?.c, '#0C3741'), w: num(s?.w, .5, 60, 2.2), pts: decodePts(s?.p), ...(s?.m === 1 ? { m: 1 } : {}) });

// Seiteninhalt für die Datenbank
export const FRAMES = { a4p: [850, 1200], a4l: [1200, 850], home: [750, 500] };   // A4 hoch/quer, Homescreen-Ausschnitt; genau auf den Kästchen (25 Einheiten)
export const FRAME_NAMES = { a4p: 'A4 hoch', a4l: 'A4 quer', home: 'Startbildschirm' };
const FRAME_BGS = ['lines', 'dots', 'blank'];                   // Hintergründe eines Bereichs (ohne: kariert wie die Fläche)

// meta: { layers: [{ id, n, h (ausgeblendet), k (gesperrt) }], fix: { bg, pat, ly } (ausgeblendete feste Ebenen), cols: Seiten je Reihe (gespeichert als ar) }
export function serialize(items, h, w, meta = {}) {
  return {
    v: 2, h: Math.round(h), w: Math.round(w),
    ...layersOut(meta),
    ...(meta.cols === 2 ? { ar: 2 } : {}),
    items: items.map((it) => {
      const g = { ...(it.g ? { g: it.g } : {}), ...(it.l ? { l: it.l } : {}) };   // Gruppe, Ebene
      if (it.t === 'n') return { t: 'n', x: it.x, y: it.y };
      if (it.t === 'b') return { t: 'b', x: it.x, y: it.y, sz: it.sz, rem: it.rem, tt: it.tt };   // Erinnerungs-Feld
      if (it.t === 'c') {   // Termin-Feld: Verweis und Kopie für unterwegs
        const c = { t: 'c', x: it.x, y: it.y, sz: it.sz, d: it.d, tt: it.tt };
        for (const k of ['ev', 'xo', 'tm']) if (it[k]) c[k] = it[k];
        return c;
      }
      if (it.t === 'f') {
        const f = { t: 'f', fmt: it.fmt, x: it.x, y: it.y };
        for (const k of ['n', 'bg', 'fc', 'ly', 'lf', 'cov', 'pc', 'mc', 'im']) if (it[k]) f[k] = it[k];
        return f;
      }
      if (it.t === 'x') return { ...textOut(it), ...g };
      if (it.t === 's') return { t: 's', ...strokeOut(it), ...g };
      if (it.t === 'i') {
        const img = { t: 'i', src: it.src, x: it.x, y: it.y, w: it.w, h: it.h, ...rotOut(it), ...g };
        if (it.cr) img.cr = it.cr.map((v) => Math.round(v * 1e4) / 1e4);
        if (it.er?.length) img.er = it.er.map((e) => ({ r: Math.round(e.r * 1e5) / 1e5, p: encodeRel(e.pts) }));
        return img;
      }
      if (it.t === 'd') return { t: 'd', a: it.a, b: it.b, c: it.c, w: it.w, txt: it.txt, ...g };
      return { t: 't', page: it.page, ...titleOut(it), ...g };
    }),
  };
}

// Seiteninhalt aus der Datenbank: alles prüfen, Unbekanntes verwerfen
export function deserialize(data) {
  const list = Array.isArray(data?.items) ? data.items : [];
  const items = [];
  for (const it of list) {
    let out = null;
    if (it?.t === 's') out = strokeIn(it);
    else if (it?.t === 'i' && IMG_PATH.test(it.src || '')) {
      out = { t: 'i', src: it.src, x: num(it.x, -1e6, 1e6, 0), y: num(it.y, -1e6, 1e6, 0), w: num(it.w, 1, 20000, 300), h: num(it.h, 1, 20000, 200), ...rotIn(it) };
      const cr = Array.isArray(it.cr) && it.cr.length === 4 ? it.cr.map((v) => num(v, 0, 1, 0)) : null;
      if (cr && cr[2] - cr[0] > .01 && cr[3] - cr[1] > .01) out.cr = cr;   // Zuschnitt
      if (Array.isArray(it.er)) {                                            // radierte Stellen
        const er = it.er.slice(0, 500).map((e) => ({ r: num(e?.r, 1e-4, .5, .01), pts: decodeRel(e?.p) })).filter((e) => e.pts.length);
        if (er.length) out.er = er;
      }
    } else if (it?.t === 'd' && Array.isArray(it.a) && Array.isArray(it.b)) {   // Bemaßung
      const pt = (p) => [num(p[0], -1e6, 1e6, 0), num(p[1], -1e6, 1e6, 0)];
      out = { t: 'd', a: pt(it.a), b: pt(it.b), c: safeColor(it.c, '#0C3741'), w: num(it.w, .5, 30, 2.2), txt: typeof it.txt === 'string' ? it.txt.slice(0, 40) : '' };
    } else if (it?.t === 't' && UUID.test(it.page || '') && Array.isArray(it.s)) {
      out = { t: 't', page: it.page, ...titleIn(it) };
    } else if (it?.t === 'n') {   // Notizen-Bereich (nur einmal je Seite)
      if (!items.some((o) => o.t === 'n')) out = { t: 'n', x: num(it.x, -1e6, 1e6, 0), y: num(it.y, -1e6, 1e6, 0) };
    } else if (it?.t === 'f' && FRAMES[it.fmt]) {
      const snap = (v) => Math.round(num(v, -1e6, 1e6, 0) / 25) * 25;
      out = { t: 'f', fmt: it.fmt, x: snap(it.x), y: snap(it.y) };
      if (typeof it.n === 'string' && it.n.trim()) out.n = it.n.trim().slice(0, 40);   // eigener Name
      if (FRAME_BGS.includes(it.bg)) out.bg = it.bg;                                    // Hintergrund
      if (safeColor(it.fc)) out.fc = it.fc;                                             // Farbe von Rahmen und Reiter
      if (it.cov === 1 && it.fmt !== 'home') out.cov = 1;                              // Deckseite
      if (safeColor(it.pc)) out.pc = it.pc;                                             // Farbe des Papiers (Hintergrund)
      if (safeColor(it.mc)) out.mc = it.mc;                                             // Farbe des Musters
      if (it.fmt !== 'home' && IMG_PATH.test(it.im || '')) out.im = it.im;              // Bild als Hintergrund (Seite aus einer PDF)
      if (FRAME_LAYOUTS.some(([k]) => k && k === it.ly)) out.ly = it.ly;                // Layout im Dudek-CI
      if (it.lf && typeof it.lf === 'object') {                                         // Angaben im Layout
        const lf = {};
        for (const [k] of LAYOUT_FIELDS) if (typeof it.lf[k] === 'string' && it.lf[k].trim()) lf[k] = it.lf[k].trim().slice(0, 80);
        if (Object.keys(lf).length) out.lf = lf;
      }
    } else if (it?.t === 'x') out = textIn(it);   // Text
    else if (it?.t === 'b' && UUID.test(it.rem || '')) {   // Erinnerungs-Feld
      out = { t: 'b', x: num(it.x, -1e6, 1e6, 0), y: num(it.y, -1e6, 1e6, 0), sz: ['s', 'm', 'l'].includes(it.sz) ? it.sz : 's', rem: it.rem, tt: typeof it.tt === 'string' ? it.tt.slice(0, 200) : '' };
    }
    else if (it?.t === 'c' && DAY.test(it.d || '') && (UUID.test(it.ev || '') || EXT_OCC.test(it.xo || ''))) {   // Termin-Feld
      out = { t: 'c', x: num(it.x, -1e6, 1e6, 0), y: num(it.y, -1e6, 1e6, 0), sz: ['s', 'm', 'l'].includes(it.sz) ? it.sz : 'm', d: it.d,
        tt: typeof it.tt === 'string' ? it.tt.slice(0, 200) : '', ...(it.ev ? { ev: it.ev } : { xo: it.xo }), ...(TIME.test(it.tm || '') ? { tm: it.tm } : {}) };
    }
    if (!out) continue;
    if (UUID.test(it.g || '')) out.g = it.g;   // Gruppe
    if (LAYER_ID.test(it.l || '')) out.l = it.l;   // Ebene
    items.push(out);
  }
  return { items, v: data?.v === 2 ? 2 : 1, ...layersIn(data), cols: data?.ar === 2 ? 2 : 1, h: num(data?.h, 0, 1e6, 0), w: num(data?.w, 0, 1e6, 0) };
}

// Ebenen: Liste (oben zuerst) und ausgeblendete feste Ebenen (Hintergrund, Muster, Vorlage)
const FIX = ['bg', 'pat', 'ly'];
function layersOut({ layers, fix } = {}) {
  const out = {};
  if (layers?.length) out.layers = layers.map((l) => ({ id: l.id, n: l.n, ...(l.h ? { h: 1 } : {}), ...(l.k ? { k: 1 } : {}) }));
  const f = FIX.filter((k) => fix?.[k]);
  if (f.length) out.fix = Object.fromEntries(f.map((k) => [k, 1]));
  return out;
}
function layersIn(data) {
  const seen = new Set();
  const layers = (Array.isArray(data?.layers) ? data.layers : []).slice(0, 30).filter((l) => LAYER_ID.test(l?.id || '') && !seen.has(l.id) && seen.add(l.id))
    .map((l) => ({ id: l.id, n: typeof l.n === 'string' && l.n.trim() ? l.n.trim().slice(0, 40) : 'Ebene', ...(l.h === 1 ? { h: 1 } : {}), ...(l.k === 1 ? { k: 1 } : {}) }));
  const fix = Object.fromEntries(FIX.filter((k) => data?.fix?.[k] === 1).map((k) => [k, 1]));
  return { layers, fix };
}

// Titel: Striche (s) und Texte (tx)
export const titleOut = (t) => ({ s: (t.s || []).map(strokeOut), ...(t.tx?.length ? { tx: t.tx.map(textOut) } : {}) });
export function titleIn(t) {
  const out = { s: Array.isArray(t?.s) ? t.s.map(strokeIn) : [] };
  const tx = textsIn(t?.tx);
  if (tx.length) out.tx = tx;
  return out;
}

// ---------- Seiten ----------
// Startseite eines Notiz-Ordners (catId leer: "Ohne Kategorie", nur die eigene)
const rootQuery = (catId) => {
  const q = sb.from('ink_pages').select('*').is('parent_id', null);
  return catId ? q.eq('category_id', catId) : q.is('category_id', null);
};

export async function loadRoot(catId) {
  const { data, error } = await rootQuery(catId);
  if (error) throw error;
  if (data[0]) return data[0];
  // erste Nutzung: Startseite anlegen (ID selbst erzeugt, ohne Rückgabe)
  const row = { id: newId(), owner_id: state.me, parent_id: null, category_id: catId || null, data: { v: 1, items: [] } };
  const ins = await sb.from('ink_pages').insert(row);
  if (ins.error) {
    // gleichzeitig auf einem anderen Gerät (oder von der anderen Person) angelegt: nochmal lesen
    const again = await rootQuery(catId);
    if (again.error || !again.data[0]) throw ins.error;
    return again.data[0];
  }
  return row;
}

// Unterseite eines Titels: wird erst beim ersten Öffnen angelegt
export async function loadChild(id, parentId, catId, title) {
  const { data, error } = await sb.from('ink_pages').select('*').eq('id', id);
  if (error) throw error;
  if (data[0]) return data[0];
  const row = { id, owner_id: state.me, parent_id: parentId, category_id: catId || null, title: titleOut(title), data: { v: 1, items: [] } };
  const ins = await sb.from('ink_pages').insert(row);
  if (ins.error) throw ins.error;
  return row;
}

// alle Seiten eines Ordners (für die Seitenübersicht)
export async function loadTree(catId) {
  const q = sb.from('ink_pages').select('id, parent_id, title, data');
  const { data, error } = await (catId ? q.eq('category_id', catId) : q.is('category_id', null));
  if (error) throw error;
  return data || [];
}

export async function savePage(id, items, h, w, meta) {
  const { error } = await sb.from('ink_pages').update({ data: serialize(items, h, w, meta), updated_at: new Date().toISOString() }).eq('id', id);
  return error;
}

// Unterseite samt allen tieferen Seiten und deren Bildern löschen
export async function deletePageTree(id) {
  // Bilder aller Seiten des Zweigs einsammeln (die Seite selbst eingeschlossen)
  const imgs = [];
  const collect = (rows) => rows.forEach((p) => deserialize(p.data).items.forEach((it) => { if (it.t === 'i') imgs.push(it.src); else if (it.im) imgs.push(it.im); }));
  const self = await sb.from('ink_pages').select('id, data').eq('id', id);
  if (self.error) return self.error;
  collect(self.data);
  const queue = [id];
  while (queue.length) {
    const { data, error } = await sb.from('ink_pages').select('id, data').eq('parent_id', queue.shift());
    if (error) return error;
    collect(data);
    data.forEach((p) => queue.push(p.id));
  }
  const { error } = await sb.from('ink_pages').delete().eq('id', id);   // tiefere Seiten folgen automatisch (cascade)
  if (!error && imgs.length) await removeImages(imgs);
  return error;
}

// ---------- Bilder ----------
const cache = new Map();   // Pfad -> Promise<ImageBitmap | null>

// Foto verkleinern (entfernt dabei auch Standort- und Kameradaten) und hochladen
export async function uploadImage(file, catId) {
  if (!file?.type?.startsWith('image/')) throw new Error('Bitte ein Bild auswählen.');
  const bmp = await createImageBitmap(file);
  const k = Math.min(1, MAX_IMG / Math.max(bmp.width, bmp.height));
  const w = Math.round(bmp.width * k), h = Math.round(bmp.height * k);
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  cv.getContext('2d').drawImage(bmp, 0, 0, w, h);
  bmp.close?.();
  return { ...(await uploadCanvas(cv, catId)), w, h };
}

// Canvas als JPEG in den Ordner des Canvas hochladen (Fotos, PDF-Seiten)
export async function uploadCanvas(cv, catId, quality = .82) {
  const blob = await new Promise((res) => cv.toBlob(res, 'image/jpeg', quality));
  if (!blob) throw new Error('Bild konnte nicht umgewandelt werden.');
  const path = catId ? `c/${catId}/${newId()}.jpg` : `u/${state.me}/${newId()}.jpg`;
  const { error } = await sb.storage.from(BUCKET).upload(path, blob, { contentType: 'image/jpeg', upsert: false });
  if (error) throw error;
  cache.set(path, createImageBitmap(blob));
  return { path };
}

export function getImage(path) {
  if (!cache.has(path)) {
    cache.set(path, sb.storage.from(BUCKET).download(path)
      .then(({ data, error }) => (error || !data ? null : createImageBitmap(data)))
      .catch(() => null));
  }
  return cache.get(path);
}

// Bild als data-URL für <img> (die CSP erlaubt data:, aber keine blob:-Adressen); '' wenn nicht ladbar
const urls = new Map();
export function imageUrl(path) {
  if (!IMG_PATH.test(path || '')) return Promise.resolve('');
  if (!urls.has(path)) {
    urls.set(path, sb.storage.from(BUCKET).download(path).then(({ data, error }) => (error || !data ? '' : new Promise((res) => {
      const r = new FileReader();
      r.onload = () => res(String(r.result));
      r.onerror = () => res('');
      r.readAsDataURL(data);
    }))).catch(() => ''));
  }
  return urls.get(path);
}
export const isImagePath = (p) => IMG_PATH.test(p || '');

// ---------- Sticker: eigene Sammlung (PNG mit durchsichtigem Hintergrund) ----------
// Bild bzw. SVG als Bild laden (SVG über eine data-URL, die CSP erlaubt keine blob:-Adressen; gespeichert wird nur das gerasterte PNG)
function readImage(file) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onerror = () => rej(new Error('Datei konnte nicht gelesen werden.'));
    r.onload = () => { const img = new Image(); img.onload = () => res(img); img.onerror = () => rej(new Error('Bild konnte nicht geöffnet werden.')); img.src = String(r.result); };
    r.readAsDataURL(file);
  });
}
const pngBlob = (cv) => new Promise((res) => cv.toBlob(res, 'image/png'));

// Canvas verkleinert in die Sammlung legen
export async function saveSticker(src, w, h) {
  const k = Math.min(1, MAX_STICKER / Math.max(w, h));
  const cv = document.createElement('canvas');
  cv.width = Math.max(1, Math.round(w * k)); cv.height = Math.max(1, Math.round(h * k));
  cv.getContext('2d').drawImage(src, 0, 0, cv.width, cv.height);
  const blob = await pngBlob(cv);
  if (!blob) throw new Error('Sticker konnte nicht umgewandelt werden.');
  const path = `u/${state.me}/stk-${newId()}.png`;
  const { error } = await sb.storage.from(BUCKET).upload(path, blob, { contentType: 'image/png', upsert: false });
  if (error) throw error;
  return path;
}

// PNG oder SVG (ohne Hintergrund) als Sticker hochladen
export async function uploadSticker(file) {
  const svg = file?.type === 'image/svg+xml' || /\.svg$/i.test(file?.name || '');
  if (!svg && file?.type !== 'image/png') throw new Error('Bitte eine PNG- oder SVG-Datei wählen.');
  const img = svg ? await readImage(file) : await createImageBitmap(file);
  let w = img.width || img.naturalWidth, h = img.height || img.naturalHeight;
  if (svg && (!w || !h)) { w = 512; h = 512; }                  // SVG ohne Größenangabe
  if (svg && Math.max(w, h) < MAX_STICKER) { const k = MAX_STICKER / Math.max(w, h); w *= k; h *= k; }   // Vektoren scharf rastern
  return saveSticker(img, w, h);
}

// eigene Sticker, neueste zuerst
export async function listStickers() {
  const { data, error } = await sb.storage.from(BUCKET).list(`u/${state.me}`, { limit: 1000, sortBy: { column: 'created_at', order: 'desc' } });
  if (error) throw error;
  return (data || []).filter((f) => STICKER.test(f.name)).map((f) => `u/${state.me}/${f.name}`);
}

// Sticker auf eine Seite: Kopie in den Ordner des Canvas (die andere Person sieht die eigene Sammlung nicht)
export async function placeSticker(path, catId) {
  const { data, error } = await sb.storage.from(BUCKET).download(path);
  if (error || !data) throw error || new Error('Sticker nicht gefunden.');
  const bmp = await createImageBitmap(data);
  const copy = catId ? `c/${catId}/${newId()}.png` : `u/${state.me}/${newId()}.png`;
  const up = await sb.storage.from(BUCKET).upload(copy, data, { contentType: 'image/png', upsert: false });
  if (up.error) throw up.error;
  cache.set(copy, Promise.resolve(bmp));
  return { path: copy, w: bmp.width, h: bmp.height };
}

export const deleteSticker = (path) => (STICKER.test(path.split('/').pop() || '') ? removeImages([path]) : Promise.resolve());

export async function removeImages(paths) {
  const list = paths.filter((p) => IMG_PATH.test(p));
  if (!list.length) return;
  list.forEach((p) => cache.delete(p));
  await sb.storage.from(BUCKET).remove(list);
}

// Ordner gelöscht: seine Bilder mit entfernen (die Seiten löscht die Datenbank selbst)
export async function removeFolderImages(catId) {
  if (!UUID.test(catId || '')) return;
  const { data } = await sb.storage.from(BUCKET).list(`c/${catId}`, { limit: 1000 });
  if (data?.length) await removeImages(data.map((f) => `c/${catId}/${f.name}`));
}
