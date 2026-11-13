// Startbild: Dudek-Zeichen als laufendes Ladesymbol hell auf dunkel (loader.js). Zum Schluss klappt nur das Zeichen zusammen wie das Bild eines alten
// Fernsehers: es wird zu einem leuchtenden Strich (dabei verschwindet schon der dunkle Grund und die App ist zu sehen),
// der Strich zieht sich zu einem Punkt, der verlischt. Läuft einmal pro App-Start.
import { LOADER } from './loader.js';

const el = document.getElementById('splash');
const MIN_SHOW = 1500;           // so lange läuft das Ladesymbol mindestens (knapp eine Runde)
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
  const logo = el.firstElementChild;
  // hell leuchtend, mit dunklem Saum, damit Strich und Punkt auch vor der hellen App sichtbar bleiben
  const glow = 'brightness(3) drop-shadow(0 0 2px rgba(12,55,65,.9)) drop-shadow(0 0 10px #A8BEA7) drop-shadow(0 0 22px rgba(12,55,65,.45))';
  const bg = getComputedStyle(el).backgroundColor;

  // 1. Zeichen klappt senkrecht zu einem Strich zusammen und leuchtet hell auf;
  //    ab dem Aufleuchten blendet der dunkle Grund aus und gibt die App frei
  const collapse = { duration: 280, easing: 'cubic-bezier(.7,0,.9,.45)', fill: 'both' };
  setTimeout(() => el.animate([{ backgroundColor: bg }, { backgroundColor: 'rgba(0,0,0,0)' }],
    { duration: 320, easing: 'ease-out', fill: 'both' }), 170);
  await logo.animate([
    { transform: 'scale(1, 1)', filter: 'brightness(1)' },
    { transform: 'scale(1.6, .04)', filter: glow },
  ], collapse).finished;

  // 2. der Strich zieht sich zu einem Punkt zusammen
  await logo.animate([
    { transform: 'scale(1.6, .04)', filter: glow },
    { transform: 'scale(.05, .04)', filter: glow },
  ], { duration: 220, easing: 'cubic-bezier(.6,0,.85,.4)', fill: 'both' }).finished;

  // 3. der Punkt glüht kurz nach und verlischt
  await logo.animate([
    { transform: 'scale(.05, .04)', opacity: 1, filter: glow },
    { transform: 'scale(.08, .065)', opacity: 1, filter: glow, offset: .3 },
    { transform: 'scale(0, 0)', opacity: 0, filter: glow },
  ], { duration: 300, easing: 'ease-out', fill: 'both' }).finished;
  el.remove();
}
