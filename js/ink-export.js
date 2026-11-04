// Canvas: Bereiche als PDF, PNG oder JPEG ausgeben
// Das PDF wird selbst geschrieben (eine A4-Seite je Bereich, darauf das Bild als JPEG): keine fremde Bibliothek nötig.

const A4 = [595.28, 841.89];   // A4 in Punkt (1/72 Zoll)
export const EXPORT_DPI = 200;
export const exportWidth = (fmt) => Math.round(((fmt === 'a4l' ? 297 : 210) / 25.4) * EXPORT_DPI);   // Pixel

const toBlob = (cv, type, q) => new Promise((res, rej) => cv.toBlob((b) => (b ? res(b) : rej(new Error('Bild konnte nicht erzeugt werden.'))), type, q));

export const toImage = (cv, type) => toBlob(cv, type === 'png' ? 'image/png' : 'image/jpeg', .92);

// pages: [{ cv, landscape }]
export async function toPdf(pages) {
  const enc = new TextEncoder();
  const chunks = [];
  const offsets = [];
  let size = 0;
  const push = (part) => { const b = typeof part === 'string' ? enc.encode(part) : part; chunks.push(b); size += b.length; };
  const obj = (n, body) => { offsets[n] = size; push(`${n} 0 obj\n`); body(); push('\nendobj\n'); };

  push('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n');
  const n = pages.length;
  const pageNo = (i) => 3 + i * 3;   // je Seite: Seite, Inhalt, Bild
  obj(1, () => push('<< /Type /Catalog /Pages 2 0 R >>'));
  obj(2, () => push(`<< /Type /Pages /Count ${n} /Kids [${pages.map((_, i) => `${pageNo(i)} 0 R`).join(' ')}] >>`));

  for (let i = 0; i < n; i++) {
    const { cv, landscape } = pages[i];
    const [W, H] = landscape ? [A4[1], A4[0]] : A4;
    const jpeg = new Uint8Array(await (await toBlob(cv, 'image/jpeg', .9)).arrayBuffer());
    const p = pageNo(i);
    const draw = `q ${W.toFixed(2)} 0 0 ${H.toFixed(2)} 0 0 cm /Im0 Do Q`;
    obj(p, () => push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${W.toFixed(2)} ${H.toFixed(2)}] /Resources << /XObject << /Im0 ${p + 2} 0 R >> >> /Contents ${p + 1} 0 R >>`));
    obj(p + 1, () => push(`<< /Length ${draw.length} >>\nstream\n${draw}\nendstream`));
    obj(p + 2, () => {
      push(`<< /Type /XObject /Subtype /Image /Width ${cv.width} /Height ${cv.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`);
      push(jpeg);
      push('\nendstream');
    });
  }

  const count = 3 + n * 3;
  const xref = size;
  push(`xref\n0 ${count}\n0000000000 65535 f \n`);
  for (let i = 1; i < count; i++) push(`${String(offsets[i]).padStart(10, '0')} 00000 n \n`);
  push(`trailer\n<< /Size ${count} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`);
  return new Blob(chunks, { type: 'application/pdf' });
}

// Dateiname ohne Sonderzeichen
export const fileName = (base, ext) => `${String(base).normalize('NFKD').replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-').slice(0, 60) || 'Handschrift'}.${ext}`;

// iPad/Smartphone: Teilen-Menü (Sichern in Dateien, Fotos, AirDrop …); Computer: herunterladen
export async function deliver(files) {
  const touch = matchMedia('(pointer: coarse)').matches;
  if (touch && navigator.canShare?.({ files })) {
    try { await navigator.share({ files }); return; } catch (e) { if (e.name === 'AbortError') return; }
  }
  for (const f of files) {
    const url = URL.createObjectURL(f);
    const a = Object.assign(document.createElement('a'), { href: url, download: f.name });
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  }
}
