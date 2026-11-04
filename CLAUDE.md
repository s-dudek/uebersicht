# Übersicht – Hinweise für Claude

Persönliche Web-App (PWA) von Simon (Dudek Grafik) und seiner Freundin Anna-Lena: Todos, Notizen mit Handschrift,
Kategorien, Kalender mit Terminen und Geburtstagen, Gerichte/Wochenplan, Teilen, Push-Erinnerungen.
Live: https://s-dudek.github.io/uebersicht/ (GitHub Pages, Branch `main`). Backend: Supabase-Projekt `gerpilzxolufdnlsltxk`.

## Zusammenarbeit
- Auf Deutsch antworten (österreichisch: Paradeiser, Erdäpfel …), kurz und sachlich, ohne lange Aufzählungen.
- Simon ist Grafiker, kein Programmierer: Ergebnisse in einfachen Worten erklären, keine Befehle zum Selbst-Ausführen, wenn Claude es selbst machen kann.
- Nach jeder fertigen Änderung: prüfen, committen, auf `main` pushen (GitHub Pages veröffentlicht nach 1–2 Minuten).
- Es gibt genau zwei Konten (Simon, Anna-Lena), Registrierung ist abgeschaltet. Nie Konten anlegen oder Passwörter eingeben.

## Feste Regeln
- **Sicherheit zu 100 %.** Alles aus der Datenbank vor der Anzeige mit `esc()` maskieren, Farben nur über `safeColor()`,
  gespeicherte Daten beim Laden prüfen (siehe `deserialize` in `js/ink-store.js`).
- CSP in `index.html` nicht aufweichen: keine Inline-Skripte, keine `on…`-Attribute, keine fremden Skript-Quellen.
- Keine Geheimnisse ins Repository: kein `service_role`/secret Key, kein VAPID-Privatschlüssel, kein CRON_SECRET.
  `config.js` enthält nur die öffentliche URL und den Publishable Key (darf öffentlich sein).
- Sauberer, gut gegliederter Code ohne Wirrwarr: kleine Module, sprechende Namen, kurze deutsche Kommentare, keine toten Reste.
  Auf Effizienz achten (z. B. Kacheln statt Riesen-Canvas, kein unnötiges Neuladen).

## Aufbau
- Kein Build für die App: `index.html`, `style.css`, `js/*.js` (ES-Module) werden direkt ausgeliefert. Übersicht der Module in `README.md`.
- `js/vendor/supabase.js`: supabase-js lokal gebündelt (`npm run supabase`), kein CDN.
- `style.css` ist nach Bereichen gegliedert (Grundlagen, Anmeldung, Startseite, …, Handschrift, Desktop, Animationen). Farben als Variablen in `:root`.
- Layout: unter 1024 px Smartphone/Tablet (Steuerknopf unten rechts, Leiste unten), ab 1024 px Desktop mit Seitenleiste (`isDesktop()`).
- `render()` baut die Ansicht neu auf; während Gesten `render.hold = true` setzen, danach `render.pending` abarbeiten.
- Handschrift (`js/ink*.js`): je Notiz-Ordner eine Startseite in `ink_pages`, Titel führen zu Unterseiten, A4-Bereiche auf dem 25er-Raster,
  unendliche Fläche (verschieben, zoomen 25–400 %, „Ursprungsansicht“), Werkzeugleiste unter der Kopfleiste (einfahrbar), Ordnerwahl über den Titel,
  Formen (als Striche), Textmarker (Strich mit `m`), Text (Element `x`), Bemaßung (Element `d`), Bilder mit Zuschnitt `cr` und Radierspuren `er`,
  Bereiche mit Name `n`, Hintergrund `bg` (lines/dots/blank) und Farbe `fc`, Gliederung (Bereiche und Titel je Seite, „Auf der Fläche zeigen“),
  Text mit Schriftart `ff` (FONTS in ink-draw.js, Google Fonts in index.html), Schnitt `fw`, kursiv `i`; Ursprungsansicht = erster Bereich,
  Handballen: großer Kontakt, Finger kurz nach dem Stift und Verschieben direkt vor dem Stift werden ignoriert bzw. zurückgenommen.
  Einstieg über den Knopf „Handschrift“ in den Notizen,
  Stifttaste wechselt Werkzeug (nur wo der Browser sie meldet – Apple-Pencil-Doppeltippen/Drücken erreicht Webseiten nicht),
  Export als PDF/PNG/JPEG (eigener PDF-Schreiber in `ink-export.js`). Bilder im privaten Storage-Bucket `ink` (`c/<ordner-id>/…`, `u/<user-id>/…`).

## Supabase
- Alle Datenbank-Änderungen als wiederholbares SQL (`if not exists`, `drop policy if exists`) unten an `supabase-setup.sql` anhängen.
- Ausführen im SQL Editor des Projekts; den Bestätigungsdialog bei Live-Änderungen klickt Simon selbst.
- Jede Tabelle mit Row Level Security. Zugriff auf Ordner über `can_access_category(id)`, Handschrift über `can_access_ink(...)`.
- Neue Zeilen mit selbst erzeugter UUID einfügen, ohne `.select()` danach (sonst greift die Lese-Regel vor dem Einfügen).
- `ink_pages` bewusst nicht in den Live-Updates (Realtime), sonst lädt jedes Speichern alles neu.
- Push: Edge Function `supabase/functions/send-reminders`, Zeitplan in `supabase/push-zeitplan.sql` (Platzhalter, echte Werte nur bei Simon).

## Prüfen und veröffentlichen
1. `npm install` (einmalig), dann `node tools/lint.mjs` – muss „alles sauber“ melden.
2. Vorschau mit Beispieldaten: `npm run vorschau` → `demo/uebersicht-vorschau.html` (nicht im Repo).
   Die Beispiel-Datenbank `demo/mock-supabase.js` bildet die Zugriffsregeln nach: bei neuen Tabellen oder Regeln mitpflegen.
   Mit Playwright Bildschirmfotos bei 390 px, 820 px (iPad) und 1280 px prüfen, Konsole auf Fehler.
   Simons Vorschau ist das Artifact https://claude.ai/artifact/5tX5mkGZ7retXy9QMp7gG8 – mit der neu gebauten Datei aktualisieren (gleiche URL behalten).
3. In `sw.js` die Nummer bei `CACHE` erhöhen und neue Dateien in `FILES` eintragen.
4. Committen und auf `main` pushen.

## Stand und offene Punkte (November 2026)
- Datenbank ist auf dem Stand von `supabase-setup.sql` (inkl. Handschrift in Ordnern).
- Push-Erinnerungen: App-Teil fertig; Edge Function deployen, Secrets setzen und Zeitplan (`supabase/push-zeitplan.sql`) einrichten ist noch offen.
- Ideen, die Simon angeboten wurden: Wochenansicht im Kalender mit 7 Spalten am Desktop, Pinnwand der Startseite auch am Smartphone.
- Handschrift am iPad mit Apple Pencil noch von Simon zu testen (Handballen, langes Drücken, Export über das Teilen-Menü).
