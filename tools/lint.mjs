// Prüft alle Module in js/: nicht importierte (undefinierte) und unbenutzte Namen.
// Aufruf: node tools/lint.mjs
import fs from 'node:fs';
import path from 'node:path';
import * as acorn from 'acorn';
import * as walk from 'acorn-walk';

const dir = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../js');
const GLOBALS = new Set(Object.getOwnPropertyNames(globalThis).concat([
  'window', 'document', 'navigator', 'localStorage', 'location', 'Notification', 'atob', 'btoa', 'crypto', 'getComputedStyle',
  'requestAnimationFrame', 'cancelAnimationFrame', 'matchMedia', 'HTMLElement', 'Event', 'CustomEvent', 'Image', 'FileReader', 'undefined', 'arguments',
]));
let problems = 0;
for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.js'))) {
  const src = fs.readFileSync(path.join(dir, f), 'utf8');
  const ast = acorn.parse(src, { ecmaVersion: 'latest', sourceType: 'module' });
  const imported = new Set(), declared = new Set(), used = new Set();
  for (const n of ast.body) if (n.type === 'ImportDeclaration') n.specifiers.forEach((s) => imported.add(s.local.name));
  // alle Deklarationen (grob: jede Bindung irgendwo in der Datei)
  walk.full(ast, (n) => {
    if (n.type === 'VariableDeclarator') walk.full(n.id, (x) => { if (x.type === 'Identifier') declared.add(x.name); });
    if (/Function/.test(n.type)) { if (n.id) declared.add(n.id.name); n.params.forEach((p) => walk.full(p, (x) => { if (x.type === 'Identifier') declared.add(x.name); })); }
    if (n.type === 'CatchClause' && n.param) walk.full(n.param, (x) => { if (x.type === 'Identifier') declared.add(x.name); });
    if (n.type === 'ClassDeclaration' && n.id) declared.add(n.id.name);
  });
  walk.ancestor(ast, {
    Identifier(n, _, anc) {
      const p = anc[anc.length - 2];
      if (p && (p.type === 'MemberExpression' && p.property === n && !p.computed)) return;
      if (p && p.type === 'Property' && p.key === n && !p.computed && !p.shorthand) return;
      if (p && (p.type === 'ImportSpecifier' || p.type === 'ImportDefaultSpecifier' || p.type === 'ExportSpecifier')) return;
      if (p && p.type === 'LabeledStatement') return;
      used.add(n.name);
    },
  });
  const undef = [...used].filter((x) => !imported.has(x) && !declared.has(x) && !GLOBALS.has(x));
  const unusedImp = [...imported].filter((x) => { const re = new RegExp(`(?<![\\w$])${x.replace(/\$/g, '\\$')}(?![\\w$])`, 'g'); return (src.match(re) || []).length < 2; });
  if (undef.length || unusedImp.length) { problems++; console.log(f.padEnd(14), undef.length ? 'nicht importiert: ' + undef.join(', ') : '', unusedImp.length ? ' unbenutzt importiert: ' + unusedImp.join(', ') : ''); }
}
console.log(problems ? `${problems} Datei(en) mit Problemen` : 'alles sauber');
process.exitCode = problems ? 1 : 0;
