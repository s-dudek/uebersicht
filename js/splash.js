// Startbild: Dudek-Zeichen als laufendes Ladesymbol hell auf dunkel (loader.js). Zum Schluss löst es sich passend zur Linie auf:
// der laufende Abschnitt verschwindet, das Zeichen steht kurz kräftig da, dann ziehen sich seine drei Linien
// nacheinander zurück, während der dunkle Grund ausblendet und die App freigibt. Läuft einmal pro App-Start.
import { LOADER } from './loader.js';

const el = document.getElementById('splash');
const MIN_SHOW = 900;            // so lange läuft das Ladesymbol mindestens
const started = performance.now();
let done = false;

export function initSplash() {
  if (!el) return;
  el.innerHTML = LOADER;
  el.firstElementChild.animate(
    [{ opacity: 0, transform: 'scale(.85)' }, { opacity: 1, transform: 'scale(1)' }],
    { duration: 260, easing: 'ease-out', fill: 'both' });
}

// Aufruf, sobald die erste echte Ansicht (Startseite oder Anmeldung) gezeichnet ist
export function splashReady() {
  if (!el || done) return;
  done = true;
  setTimeout(play, Math.max(0, MIN_SHOW - (performance.now() - started)));
}

async function play() {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
    await el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 200, fill: 'both' }).finished;
    return el.remove();
  }
  const logo = el.firstElementChild, lines = [...logo.querySelectorAll('.ld-base')];
  const bg = getComputedStyle(el).backgroundColor;

  // 1. laufender Abschnitt blendet aus, die Linien werden kräftig: das Zeichen steht vollständig da
  logo.querySelectorAll('.ld-run').forEach((r) => r.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 180, fill: 'both' }));
  await Promise.all(lines.map((l) => l.animate([{ strokeWidth: 3, opacity: .55 }, { strokeWidth: 10, opacity: 1 }],
    { duration: 220, easing: 'cubic-bezier(.3,0,.2,1)', fill: 'both' }).finished));

  // 2. die Linien ziehen sich nacheinander zurück (oben, rechts, links), das Zeichen wächst leicht,
  //    gleichzeitig blendet der dunkle Grund aus
  lines.forEach((l) => { l.style.strokeDasharray = '100 100'; l.style.strokeLinecap = 'round'; });
  el.animate([{ backgroundColor: bg }, { backgroundColor: 'rgba(0,0,0,0)' }], { duration: 420, easing: 'ease-in-out', fill: 'both' });
  logo.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.12)' }], { duration: 460, easing: 'ease-out', fill: 'both' });
  await Promise.all([0, 2, 1].map((k, i) => lines[k].animate(
    [{ strokeDashoffset: 0, strokeWidth: 10 }, { strokeDashoffset: -100, strokeWidth: 4 }],
    { duration: 340, delay: i * 60, easing: 'cubic-bezier(.6,0,.4,1)', fill: 'both' }).finished));
  el.remove();
}
