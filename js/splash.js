// Startbild: Dudek-Zeichen als laufendes Ladesymbol hell auf dunkel (loader.js). Zum Schluss löst es sich weich auf:
// der laufende Abschnitt verschwindet, das Zeichen steht kurz vollständig da, dann wird es weit, unscharf und durchsichtig –
// wie Nebel, der sich verzieht –, während der dunkle Grund ausblendet und die App freigibt. Läuft einmal pro App-Start.
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

  // 2. das Zeichen löst sich auf: weiter, unscharf, durchsichtig; gleichzeitig blendet der dunkle Grund aus
  el.animate([{ backgroundColor: bg }, { backgroundColor: 'rgba(0,0,0,0)' }], { duration: 520, easing: 'ease-in-out', fill: 'both' });
  await logo.animate([
    { transform: 'scale(1)', filter: 'blur(0)', opacity: 1 },
    { transform: 'scale(1.5)', filter: 'blur(14px)', opacity: 0 },
  ], { duration: 560, easing: 'cubic-bezier(.4,0,.2,1)', fill: 'both' }).finished;
  el.remove();
}
