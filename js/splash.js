// Startbild: Dudek-Zeichen hell auf dunkel, wird zu einem Ball gequetscht,
// der Ball wächst schnell und gibt die Startseite frei. Läuft einmal pro App-Start.
import { LOGO_MARK } from './icons.js';

const el = document.getElementById('splash');
const MIN_SHOW = 700;            // so lange steht das Zeichen mindestens
const started = performance.now();
let done = false;

export function initSplash() {
  if (!el) return;
  el.innerHTML = `${LOGO_MARK}<i class="splash-ball"></i>`;
  document.body.classList.add('splashing');
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

function finish() {
  el.remove();
  document.body.classList.remove('splashing');
}

async function play() {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
    await el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 200, fill: 'both' }).finished;
    return finish();
  }
  const mark = el.querySelector('.logo-mark');
  const ball = el.querySelector('.splash-ball');

  // 1. Zeichen zusammenquetschen, Ball entsteht an seiner Stelle
  const squash = { duration: 380, easing: 'cubic-bezier(.5,0,.6,1)', fill: 'both' };
  mark.animate([
    { transform: 'scale(1)', opacity: 1 },
    { transform: 'scale(1.18, .72)', opacity: 1, offset: .45 },
    { transform: 'scale(.4)', opacity: 0 },
  ], squash);
  await ball.animate([
    { transform: 'scale(0)', offset: 0 },
    { transform: 'scale(0)', offset: .45 },
    { transform: 'scale(1.12, .88)', offset: .8 },
    { transform: 'scale(1)' },
  ], squash).finished;

  // 2. Ball wächst über den ganzen Bildschirm und nimmt die Hintergrundfarbe an
  const cover = Math.hypot(window.innerWidth, window.innerHeight) / ball.offsetWidth + 1;
  const css = getComputedStyle(document.documentElement);
  await ball.animate([
    { transform: 'scale(1)', backgroundColor: css.getPropertyValue('--green-l').trim() },
    { transform: `scale(${cover})`, backgroundColor: css.getPropertyValue('--bg').trim() },
  ], { duration: 480, easing: 'cubic-bezier(.55,0,.75,.2)', fill: 'both' }).finished;

  // 3. sanft ausblenden, darunter liegt die fertige Startseite
  await el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 180, fill: 'both' }).finished;
  finish();
}
