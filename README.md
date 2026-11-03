# Übersicht

Persönliche Web-App (PWA) für Todos, Notizen, Kalender, Termine/Geburtstage und den Wochenplan.
Läuft auf GitHub Pages, Daten und Anmeldung in Supabase. Kein Build-Schritt nötig: die Dateien werden so ausgeliefert, wie sie hier liegen.

## Aufbau

```
index.html          Seitengerüst, Sicherheitsrichtlinie (CSP)
config.js           Supabase-Adresse und öffentlicher Schlüssel (darf öffentlich sein)
style.css           Gestaltung, nach Bereichen gegliedert
sw.js               Service Worker: Offline-Zwischenspeicher, Push-Mitteilungen
manifest.json       App-Name und Symbol für den Home-Bildschirm
icons/              App-Symbole
js/
  main.js           Einstieg: startet alle Teile
  core.js           Konfiguration, Supabase-Verbindung, Zustand, Helfer
  data.js           Laden, Live-Updates, Speichern
  dates.js          Datum und Uhrzeit
  icons.js          Symbole und Logos (SVG)
  sheet.js          Fenster von unten (Sheets)
  splash.js         Startbild beim Öffnen der App
  render.js         Hauptansicht: Kopfleiste, Inhalt, Leiste unten
  control.js        Steuerknopf (Smartphone)
  nav.js            Bereiche und Wechsel zwischen ihnen
  menu.js           Rechtsklick-Menü (Maus)
  pins.js           „Zu Home hinzufügen“ (Pinnwand auf der Startseite)
  actions.js        Tippen und Absenden in der Hauptansicht
  drag.js           Ziehen und Ablegen
  auth.js           Anmeldung
  home.js           Startseite
  todos.js          Todos
  notes.js          Notizen
  folders.js        Ordner (Kategorien) in Todos/Notizen
  groups.js         Reihenfolge und Gruppen in Listen
  categories.js     Kategorien-Seite und -Fenster
  items.js          Todo-/Notiz-Fenster, Teilen
  events.js         Termine und Geburtstage
  calendar.js       Kalender (Tag, Woche, Monat)
  meals.js          Gerichte, Wochenplan, Einkaufsliste
  reminders.js      Erinnerungen und Push
  panels.js         Schnelle Notiz, Einstellungen
  vendor/supabase.js  Supabase-Bibliothek, lokal gebündelt (kein CDN)
```

## Sicherheit

- Zugriffsregeln (Row Level Security) in Supabase: jede Person sieht nur eigene, geteilte und gemeinsame Einträge.
- Alle Texte aus der Datenbank werden vor der Anzeige maskiert (`esc`), Farben nur als Hex-Werte übernommen (`safeColor`).
- Content-Security-Policy in `index.html`: Skripte nur von dieser Seite, Verbindungen nur zu Supabase.
- Die Supabase-Bibliothek liegt fest im Projekt statt von einem CDN zu kommen.
- Geheime Schlüssel (Supabase `service_role`, VAPID privat, CRON_SECRET) gehören nie in dieses Repository.

## Ändern und veröffentlichen

1. Dateien ändern.
2. In `sw.js` die Nummer bei `CACHE` erhöhen und neue Dateien in `FILES` eintragen.
3. Hochladen (GitHub Pages veröffentlicht nach 1–2 Minuten).

Supabase-Bibliothek erneuern: `npm install`, dann `npm run supabase`.
Code prüfen (Importe): `node tools/lint.mjs`. Vorschau mit Beispieldaten bauen: `npm run vorschau`.

Layout: unter 1024 px Breite Smartphone-Ansicht mit Steuerknopf und Leiste unten, darüber Desktop mit Seitenleiste.
