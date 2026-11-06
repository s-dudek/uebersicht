// Startbild: Dudek-Zeichen hell auf dunkel (mit leichten Bildzeilen wie auf einer Röhre).
// Zum Schluss schaltet es sich ab wie ein alter Fernseher: das Bild fällt auf dunklem Grund zu einem hellen Strich
// zusammen, der Strich zieht sich zu einem leuchtenden Punkt, der verlischt; dann gibt der Grund die App frei.
// Läuft einmal pro App-Start.
import { LOGO_MARK } from './icons.js';

const el = document.getElementById('splash');
const MIN_SHOW = 700;            // so lange steht das Zeichen mindestens
const started = performance.now();
let done = false;

export function initSplash() {
  if (!el) return;
  el.innerHTML = `<div class="splash-screen">${LOGO_MARK}<i class="splash-glow"></i></div>`;
  document.body.classList.add('splashing');
  el.querySelector('.logo-mark').animate(
    [{ opacity: 0, transform: 'scale(.85)' }, { opacity: 1, transform: 'scale(1)' }],
    { duration: 260, easing: 'ease-out', fill: 'both' });
}

// Aufruf, sobald die erste echte Ansicht (Startseite oder Anmeldung) gezeichnet ist
export function splashReady() {
  if (!el || done) return;
  done = true;
  setTimeout(play, Math.max(0, MIN_SHOW - (performance.now() - started)));
}

function finish() {
  el.remove();
  document.body.classList.remove('splashing');
}

async function play() {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
    await el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 200, fill: 'both' }).finished;
    return finish();
  }
  const screen = el.querySelector('.splash-screen'), glow = el.querySelector('.splash-glow');
  const add = (cls) => { const x = document.createElement('i'); x.className = cls; el.appendChild(x); return x; };

  // 1. kurzes Flackern, dann fällt das Bild senkrecht zu einem Strich zusammen und wird dabei hell
  await el.querySelector('.logo-mark').animate(
    [{ opacity: 1 }, { opacity: .55 }, { opacity: 1 }, { opacity: .8 }, { opacity: 1 }],
    { duration: 160, easing: 'steps(5)' }).finished;
  const collapse = { duration: 260, easing: 'cubic-bezier(.7,0,.9,.45)', fill: 'both' };
  glow.animate([{ opacity: 0 }, { opacity: .2, offset: .4 }, { opacity: 1 }], collapse);
  await screen.animate([{ transform: 'scale(1, 1)' }, { transform: 'scale(1, .006)' }], collapse).finished;

  // 2. der helle Strich zieht sich waagrecht zu einem Punkt zusammen
  const line = add('crt-line');
  screen.remove();
  await line.animate([{ transform: 'scaleX(1)' }, { transform: 'scaleX(.004)' }],
    { duration: 220, easing: 'cubic-bezier(.6,0,.85,.4)', fill: 'both' }).finished;

  // 3. der Punkt glüht kurz nach und verlischt
  const dot = add('crt-dot');
  line.remove();
  await dot.animate([
    { transform: 'scale(.6)', opacity: 1 },
    { transform: 'scale(1)', opacity: 1, offset: .3 },
    { transform: 'scale(0)', opacity: 0 },
  ], { duration: 320, easing: 'ease-out', fill: 'both' }).finished;

  // 4. dunkler Grund blendet aus, darunter die fertige App
  await el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 220, easing: 'ease-out', fill: 'both' }).finished;
  finish();
}
