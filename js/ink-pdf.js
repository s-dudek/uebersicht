// Canvas: PDF öffnen – jede PDF-Seite wird als Bild gerendert (pdf.js, lokal in js/vendor, erst bei Bedarf geladen)
// und als Hintergrund einer neuen Seite hochgeladen; darauf lässt sich wie gewohnt schreiben.
import { uploadCanvas } from './ink-store.js';

const MAX_PAGES = 60;     // mehr Seiten auf einmal nicht
const LONG_PX = 1800;     // längste Seite des Bildes in Pixel (gut lesbar, klein genug zum Speichern)
const vendor = (f) => new URL('js/vendor/' + f, location.href).href;   // neben index.html

// file: PDF; catId: Ordner des Canvas; onPage(i, n): Fortschritt. Gibt [{ path, w, h }] zurück.
export async function importPdf(file, catId, onPage) {
  if (file?.type !== 'application/pdf' && !/\.pdf$/i.test(file?.name || '')) throw new Error('Bitte eine PDF-Datei wählen.');
  const lib = await import(vendor('pdf.mjs'));
  lib.GlobalWorkerOptions.workerSrc = vendor('pdf.worker.mjs');
  // ohne eval und ohne eingebettete Schriften als Webfonts (passt zur CSP; Text wird als Form gezeichnet)
  const doc = await lib.getDocument({ data: new Uint8Array(await file.arrayBuffer()), isEvalSupported: false, disableFontFace: true }).promise;
  const total = doc.numPages, n = Math.min(total, MAX_PAGES), out = [];
  try {
    for (let i = 1; i <= n; i++) {
      onPage?.(i, n);
      const page = await doc.getPage(i), base = page.getViewport({ scale: 1 });
      const vp = page.getViewport({ scale: LONG_PX / Math.max(base.width, base.height) });
      const cv = document.createElement('canvas');
      cv.width = Math.round(vp.width); cv.height = Math.round(vp.height);
      const ctx = cv.getContext('2d');
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, cv.width, cv.height);
      await page.render({ canvasContext: ctx, viewport: vp }).promise;
      page.cleanup();
      out.push({ ...(await uploadCanvas(cv, catId, .85)), w: cv.width, h: cv.height });
    }
  } finally {
    doc.destroy();
  }
  return { pages: out, more: total > n };
}
