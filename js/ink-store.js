// Handschrift: Speichern und Laden der Seiten (Tabelle ink_pages) und Bilder (Speicher "ink")
import { safeColor, sb, state } from './core.js';

const BUCKET = 'ink';
const IMG_PATH = /^(?:[uc]\/)?[\w-]{1,64}\/[\w-]{1,64}\.jpg$/;   // u/<user-id>/… oder c/<ordner-id>/… (ältere: <user-id>/…)
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_IMG = 1600;                                  // längste Bildseite in Pixel
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

const strokeOut = (s) => ({ c: s.c, w: s.w, p: encodePts(s.pts), ...(s.m ? { m: 1 } : {}) });
const strokeIn = (s) => ({ t: 's', c: safeColor(s?.c, '#0C3741'), w: num(s?.w, .5, 60, 2.2), pts: decodePts(s?.p), ...(s?.m === 1 ? { m: 1 } : {}) });

// Seiteninhalt für die Datenbank
export const FRAMES = { a4p: [850, 1200], a4l: [1200, 850] };   // A4 hoch/quer, genau auf den Kästchen (25 Einheiten)
const FRAME_BGS = ['lines', 'dots', 'blank'];                   // Hintergründe eines Bereichs (ohne: kariert wie die Fläche)

export function serialize(items, h, w) {
  return {
    v: 1, h: Math.round(h), w: Math.round(w),
    items: items.map((it) => {
      const g = it.g ? { g: it.g } : {};
      if (it.t === 'f') return { t: 'f', fmt: it.fmt, x: it.x, y: it.y, ...(it.n ? { n: it.n } : {}), ...(it.bg ? { bg: it.bg } : {}) };
      if (it.t === 'x') return { t: 'x', x: it.x, y: it.y, txt: it.txt, c: it.c, fs: it.fs, ...g };
      if (it.t === 's') return { t: 's', ...strokeOut(it), ...g };
      if (it.t === 'i') {
        const img = { t: 'i', src: it.src, x: it.x, y: it.y, w: it.w, h: it.h, ...g };
        if (it.cr) img.cr = it.cr.map((v) => Math.round(v * 1e4) / 1e4);
        if (it.er?.length) img.er = it.er.map((e) => ({ r: Math.round(e.r * 1e5) / 1e5, p: encodeRel(e.pts) }));
        return img;
      }
      if (it.t === 'd') return { t: 'd', a: it.a, b: it.b, c: it.c, w: it.w, txt: it.txt, ...g };
      return { t: 't', page: it.page, s: it.s.map(strokeOut), ...g };
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
      out = { t: 'i', src: it.src, x: num(it.x, -1e6, 1e6, 0), y: num(it.y, -1e6, 1e6, 0), w: num(it.w, 1, 20000, 300), h: num(it.h, 1, 20000, 200) };
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
      out = { t: 't', page: it.page, s: it.s.map(strokeIn) };
    } else if (it?.t === 'f' && FRAMES[it.fmt]) {
      const snap = (v) => Math.round(num(v, -1e6, 1e6, 0) / 25) * 25;
      out = { t: 'f', fmt: it.fmt, x: snap(it.x), y: snap(it.y) };
      if (typeof it.n === 'string' && it.n.trim()) out.n = it.n.trim().slice(0, 40);   // eigener Name
      if (FRAME_BGS.includes(it.bg)) out.bg = it.bg;                                    // Hintergrund
    } else if (it?.t === 'x' && typeof it.txt === 'string' && it.txt) {                 // Text
      out = { t: 'x', x: num(it.x, -1e6, 1e6, 0), y: num(it.y, -1e6, 1e6, 0), txt: it.txt.slice(0, 2000), c: safeColor(it.c, '#0C3741'), fs: num(it.fs, 4, 400, 20) };
    }
    if (!out) continue;
    if (UUID.test(it.g || '')) out.g = it.g;   // Gruppe
    items.push(out);
  }
  return { items, h: num(data?.h, 0, 1e6, 0), w: num(data?.w, 0, 1e6, 0) };
}

export const titleOut = (strokes) => ({ s: strokes.map(strokeOut) });
export const titleIn = (t) => (Array.isArray(t?.s) ? t.s.map(strokeIn) : []);

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
export async function loadChild(id, parentId, catId, titleStrokes) {
  const { data, error } = await sb.from('ink_pages').select('*').eq('id', id);
  if (error) throw error;
  if (data[0]) return data[0];
  const row = { id, owner_id: state.me, parent_id: parentId, category_id: catId || null, title: titleOut(titleStrokes), data: { v: 1, items: [] } };
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

export async function savePage(id, items, h, w) {
  const { error } = await sb.from('ink_pages').update({ data: serialize(items, h, w), updated_at: new Date().toISOString() }).eq('id', id);
  return error;
}

// Unterseite samt allen tieferen Seiten und deren Bildern löschen
export async function deletePageTree(id) {
  // Bilder aller Seiten des Zweigs einsammeln (die Seite selbst eingeschlossen)
  const imgs = [];
  const collect = (rows) => rows.forEach((p) => deserialize(p.data).items.forEach((it) => { if (it.t === 'i') imgs.push(it.src); }));
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
  const blob = await new Promise((res) => cv.toBlob(res, 'image/jpeg', .82));
  if (!blob) throw new Error('Bild konnte nicht umgewandelt werden.');
  const path = catId ? `c/${catId}/${newId()}.jpg` : `u/${state.me}/${newId()}.jpg`;
  const { error } = await sb.storage.from(BUCKET).upload(path, blob, { contentType: 'image/jpeg', upsert: false });
  if (error) throw error;
  cache.set(path, createImageBitmap(blob));
  return { path, w, h };
}

export function getImage(path) {
  if (!cache.has(path)) {
    cache.set(path, sb.storage.from(BUCKET).download(path)
      .then(({ data, error }) => (error || !data ? null : createImageBitmap(data)))
      .catch(() => null));
  }
  return cache.get(path);
}

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
