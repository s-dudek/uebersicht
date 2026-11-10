// Einstieg: alle Teile starten, sobald die Module geladen sind
import { initActions } from './actions.js';
import { initAuth } from './auth.js';
import { initCalDrag } from './cal-drag.js';
import { initCalendarGestures } from './calendar.js';
import { startControl } from './control.js';
import { onLayoutChange } from './core.js';
import { initSync } from './data.js';
import { initCategorySort, initItemDrag } from './drag.js';
import { handleGoogleReturn } from './google-cal.js';
import { initContextMenu } from './menu.js';
import { initReminders } from './reminders.js';
import { render } from './render.js';
import { initSplash } from './splash.js';

initSplash();            // Startbild sofort zeigen
startControl();          // Steuerknopf anlegen (wird von der Ansicht benutzt)
initActions();           // Tippen und Absenden in der Hauptansicht
initItemDrag();          // Einträge ziehen, sortieren, gruppieren
initCategorySort();      // Ordner umsortieren
initCalendarGestures();  // Kalender: antippen und wischen
initCalDrag();           // Kalender: Termine ziehen und Länge ändern
initContextMenu();       // Rechtsklick-Menü (Maus)
initSync();              // beim Zurückkehren in die App neu laden
initReminders();         // Erinnerungen prüfen
initAuth();              // Anmeldung prüfen, dann Daten laden
handleGoogleReturn();    // zurück von „Zugriff erlauben“ bei Google
onLayoutChange(render);  // Fenster breiter/schmaler: Smartphone- bzw. Desktop-Layout

// Offline-Zwischenspeicher und Push-Mitteilungen
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}
