// Handschrift: Speichern und Laden der Seiten (Tabelle ink_pages) und Bilder (Speicher "ink")
import { safeColor, sb, state } from './core.js';

const BUCKET = 'ink';
const IMG_PATH = /^[\w-]{1,64}\/[\w-]{1,64}\.jpg$/;   // <user-id>/<bild-id>.jpg
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

const strokeOut = (s) => ({ c: s.c, w: s.w, p: encodePts(s.pts) });
const strokeIn = (s) => ({ t: 's', c: safeColor(s?.c, '#0C3741'), w: num(s?.w, .5, 30, 2.2), pts: decodePts(s?.p) });

// Seiteninhalt für die Datenbank
export function serialize(items, h) {
  return {
    v: 1, h: Math.round(h),
    items: items.map((it) => {
      if (it.t === 's') return { t: 's', ...strokeOut(it) };
      if (it.t === 'i') return { t: 'i', src: it.src, x: it.x, y: it.y, w: it.w, h: it.h };
      return { t: 't', page: it.page, s: it.s.map(strokeOut) };
    }),
  };
}

// Seiteninhalt aus der Datenbank: alles prüfen, Unbekanntes verwerfen
export function deserialize(data) {
  const list = Array.isArray(data?.items) ? data.items : [];
  const items = [];
  for (const it of list) {
    if (it?.t === 's') items.push(strokeIn(it));
    else if (it?.t === 'i' && IMG_PATH.test(it.src || '')) {
      items.push({ t: 'i', src: it.src, x: num(it.x, -5000, 5000, 0), y: num(it.y, -5000, 1e6, 0), w: num(it.w, 10, 5000, 300), h: num(it.h, 10, 5000, 200) });
    } else if (it?.t === 't' && UUID.test(it.page || '') && Array.isArray(it.s)) {
      items.push({ t: 't', page: it.page, s: it.s.map(strokeIn) });
    }
  }
  return { items, h: num(data?.h, 0, 1e6, 0) };
}

export const titleOut = (strokes) => ({ s: strokes.map(strokeOut) });
export const titleIn = (t) => (Array.isArray(t?.s) ? t.s.map(strokeIn) : []);

// ---------- Seiten ----------
export async function loadRoot() {
  const { data, error } = await sb.from('ink_pages').select('*').is('parent_id', null);
  if (error) throw error;
  if (data[0]) return data[0];
  // erste Nutzung: Startseite anlegen (ID selbst erzeugt, ohne Rückgabe)
  const row = { id: newId(), owner_id: state.me, parent_id: null, data: { v: 1, items: [] } };
  const ins = await sb.from('ink_pages').insert(row);
  if (ins.error) {
    // gleichzeitig auf einem anderen Gerät angelegt: nochmal lesen
    const again = await sb.from('ink_pages').select('*').is('parent_id', null);
    if (again.error || !again.data[0]) throw ins.error;
    return again.data[0];
  }
  return row;
}

// Unterseite eines Titels: wird erst beim ersten Öffnen angelegt
export async function loadChild(id, parentId, titleStrokes) {
  const { data, error } = await sb.from('ink_pages').select('*').eq('id', id);
  if (error) throw error;
  if (data[0]) return data[0];
  const row = { id, owner_id: state.me, parent_id: parentId, title: titleOut(titleStrokes), data: { v: 1, items: [] } };
  const ins = await sb.from('ink_pages').insert(row);
  if (ins.error) throw ins.error;
  return row;
}

export async function savePage(id, items, h) {
  const { error } = await sb.from('ink_pages').update({ data: serialize(items, h), updated_at: new Date().toISOString() }).eq('id', id);
  return error;
}

export async function saveTitle(id, strokes) {
  const { error } = await sb.from('ink_pages').update({ title: titleOut(strokes) }).eq('id', id);
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
export async function uploadImage(file) {
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
  const path = `${state.me}/${newId()}.jpg`;
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
