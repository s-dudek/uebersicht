// Erinnerungen: in der App und als Push-Mitteilung
import { cfg, esc, isItemShared, sb, state, store, toast } from './core.js';
import { saveItem } from './data.js';
import { remindLabel } from './dates.js';
import { evTitle, isBday, isYearly } from './events.js';
import { ICON } from './icons.js';
import { openItem } from './items.js';

// ---------- Push-Mitteilungen ----------
export const pushOn = () => store('push') === 'on';

const isStandalone = () => window.matchMedia?.('(display-mode: standalone)').matches || navigator.standalone === true;

function b64ToBytes(b64) {
  const pad = '='.repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

export function pushSupport() {
  if (window.__DEMO) return 'In der Vorschau nicht verfügbar. Funktioniert in der installierten App.';
  const ios = /iPhone|iPad|iPod/.test(navigator.userAgent);
  if (ios && !isStandalone()) return 'Am iPhone zuerst über Teilen → „Zum Home-Bildschirm“ installieren und die App von dort öffnen.';
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return 'Dieser Browser unterstützt keine Push-Mitteilungen.';
  if (!cfg.VAPID_PUBLIC_KEY) return 'Push ist noch nicht eingerichtet (VAPID_PUBLIC_KEY fehlt in config.js).';
  return '';
}

export async function enablePush() {
  const why = pushSupport();
  if (why) { toast(why, 5000); return false; }
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') { toast('Mitteilungen wurden nicht erlaubt. Das lässt sich in den Geräte-Einstellungen ändern.', 5000); return false; }
  const reg = await navigator.serviceWorker.ready;
  const sub = (await reg.pushManager.getSubscription()) || (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(cfg.VAPID_PUBLIC_KEY) }));
  const j = sub.toJSON();
  await sb.from('push_subscriptions').delete().eq('endpoint', j.endpoint);
  const { error } = await sb.from('push_subscriptions').insert({ endpoint: j.endpoint, p256dh: j.keys.p256dh, auth: j.keys.auth });
  if (error) { toast('Fehler: ' + error.message, 5000); return false; }
  store('push', 'on');
  toast('Mitteilungen aktiviert');
  return true;
}

export async function disablePush() {
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (sub) { await sb.from('push_subscriptions').delete().eq('endpoint', sub.endpoint); await sub.unsubscribe(); }
  } catch {}
  store('push', 'off');
  toast('Mitteilungen ausgeschaltet');
}

export function remindHint(i) {
  if (!i?.remind_at) return 'Optional. Die App erinnert dich zur gewählten Zeit.';
  if (pushOn()) return `Erinnerung ${esc(remindLabel(i.remind_at))}, als Mitteilung auf deinen Geräten.`;
  if (!('Notification' in window)) return `Erinnerung ${esc(remindLabel(i.remind_at))}. Auf diesem Gerät erscheint sie als Hinweis in der App.`;
  if (Notification.permission === 'denied') return `Erinnerung ${esc(remindLabel(i.remind_at))}. Benachrichtigungen sind blockiert, sie erscheint als Hinweis in der App.`;
  return `Erinnerung ${esc(remindLabel(i.remind_at))}.`;
}

// Text einer Erinnerung (gleich wie in der Server-Funktion)
function remindText(i) {
  if (i.type === 'event') {
    const r = i.meta?.remind;
    const when = r === '1' ? 'Morgen' : r === '7' ? 'In einer Woche' : r === 'h' ? 'In einer Stunde' : 'Heute';
    return { title: evTitle(i), body: `${when}${!isBday(i) && i.meta?.time ? ' um ' + i.meta.time + ' Uhr' : ''}${i.body ? ' · ' + i.body.slice(0, 80) : ''}` };
  }
  return { title: i.title || (i.type === 'note' ? 'Notiz' : 'Todo'), body: i.type === 'note' ? (i.body || '').slice(0, 120) : 'Erinnerung zu deinem Todo' };
}

// Nach dem Erinnern: jährliche Termine aufs nächste Jahr stellen, sonst als erledigt markieren
function afterRemind(i) {
  if (i.type === 'event' && isYearly(i)) {
    const t = new Date(i.remind_at);
    while (t.getTime() <= Date.now()) t.setFullYear(t.getFullYear() + 1);
    return { remind_at: t.toISOString(), reminded: false };
  }
  return { reminded: true };
}

async function fireReminder(i) {
  const { title, body } = remindText(i);
  let shown = false;
  try {
    if ('Notification' in window && Notification.permission === 'granted') {
      const reg = await navigator.serviceWorker?.getRegistration?.();
      if (reg) await reg.showNotification(title, { body, icon: 'icons/icon-192.png', tag: 'item-' + i.id, data: { id: i.id } });
      else new Notification(title, { body, icon: 'icons/icon-192.png' });
      shown = true;
    }
  } catch {}
  if (!shown || document.visibilityState === 'visible') showReminderBanner(i);
  saveItem(i.id, afterRemind(i));
}

function showReminderBanner(i) {
  const el = document.createElement('div');
  el.className = 'rbanner';
  const rt = remindText(i);
  el.innerHTML = `<span class="rb-ic">${i.type === 'event' && isBday(i) ? ICON.cake : ICON.bell}</span><span class="rb-t"><b>${esc(rt.title)}</b><small>${esc(i.type === 'event' ? rt.body : 'Erinnerung')}</small></span>
    <button class="btn secondary" data-rb="open">Öffnen</button><button class="x-btn" data-rb="x" aria-label="Schließen">×</button>`;
  document.body.appendChild(el);
  el.querySelector('[data-rb=open]').addEventListener('click', () => { el.remove(); openItem(i.id); });
  el.querySelector('[data-rb=x]').addEventListener('click', () => el.remove());
  setTimeout(() => el.remove(), 20000);
}

const bannerShown = new Set();

export function checkReminders() {
  if (!state.me || !state.loaded) return;
  const now = Date.now();
  const due = state.items.filter((i) => i.remind_at && !i.reminded && !i.done && (i.owner_id === state.me || isItemShared(i)) && new Date(i.remind_at).getTime() <= now);
  if (pushOn()) {
    // Server verschickt die Mitteilung; in der offenen App nur einmal den Hinweis zeigen
    due.filter((i) => !bannerShown.has(i.id + i.remind_at)).forEach((i) => { bannerShown.add(i.id + i.remind_at); if (document.visibilityState === 'visible') showReminderBanner(i); });
    return;
  }
  due.forEach(fireReminder);
}

export function initReminders() {
  setInterval(checkReminders, 20000);

  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') setTimeout(checkReminders, 800); });
}
