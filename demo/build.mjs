// Baut aus den echten App-Dateien eine einzelne Vorschau-Seite mit Beispieldaten.
// Die Module werden mit esbuild gebündelt; statt Supabase läuft die Beispiel-Datenbank (mock-supabase.js).
// Aufruf: node demo/build.mjs   (esbuild muss installiert sein: npm i esbuild)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

const result = await build({
  entryPoints: [path.join(root, 'js/main.js')],
  bundle: true,
  format: 'esm',
  write: false,
  logLevel: 'error',
  plugins: [{
    name: 'supabase-durch-beispieldaten',
    setup(b) {
      b.onResolve({ filter: /vendor\/supabase\.js$/ }, () => ({ path: path.join(root, 'demo/supabase-shim.js') }));
    },
  }],
});
const bundle = result.outputFiles[0].text;

const html = `<!doctype html>
<meta charset="utf-8">
<title>Übersicht App</title>
<meta name="claude:viewport-fit-sides" content="cover">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700&display=swap">
<style>
${read('style.css')}
/* Vorschau: der Rahmen polstert oben/unten schon selbst */
:root { --safe-top: 0px; --safe-bottom: 0px; }
</style>
<div id="splash" class="splash" aria-hidden="true"></div>
<div id="app"><div class="center muted">Lädt …</div></div>
<div id="sheet-root"></div>
<div id="toast" class="toast" hidden></div>
<script>
${read('demo/mock-supabase.js')}
</script>
<script type="module">
${bundle}
</script>
`;
const out = path.join(root, 'demo/uebersicht-vorschau.html');
fs.writeFileSync(out, html);
console.log('geschrieben:', out, html.length, 'Bytes');
