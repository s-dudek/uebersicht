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
- Layout: unter 1024 px Smartphone/Tablet (Steuerknopf unten rechts auf Unterseiten: tippen = Startseite; Leiste unten), ab 1024 px Desktop mit Seitenleiste (`isDesktop()`).
- Startseite (`home.js`): Desktop Übersicht (Datum, Tag im Kalender, Essen heute, Pinnwand); schmal dunkelgrüne Leiste (`homeBar`: Logo, runder Knopf Neue Notiz,
  Einstellungen, Abmelden) und Kacheln (`home-tiles.js`, wie Widgets am iPhone: Größe Klein/Mittel/Groß und Reihenfolge je Person in
  cat_order 'tiles'/'tilesz'; langes Drücken = Menü, weiterziehen = verschieben, „Home-Bildschirm bearbeiten“ = wackeln mit Größen-Knopf, „Fertig“); Angeheftetes („Zu Home hinzufügen“) ist dort ebenfalls eine Kachel
  (keine eigene Pinnwand am Handy); Notizen- und Notiz-Ordner-Kacheln mit Knopf direkt in den Canvas (zuletzt benutzter Ordner: `inkFolder`).
  Kopfleisten der Bereiche schmal im selben Dunkelgrün, gleiche Höhe (44 px) und Schrift in Salbei (außer Canvas). Einen eigenen Bereich „Kategorien“ gibt es nicht mehr (Ordner in Todos/Notizen).
- Papierkorb (`trash.js`): Löschen setzt nur `deleted_at` (items, categories); `loadAll` trennt in `state.trash`; nach 30 Tagen endgültig (beim Laden),
  Kategorie endgültig löschen nimmt Canvas und Bilder mit, Einträge bleiben ohne Kategorie. Geöffnet über Seitenleiste bzw. Einstellungen.
- Notizen: Mehrfachauswahl (`note-select.js`, Knopf „Auswählen“ im Ordner): antippen markiert, dann Verschieben (Ordner wählen) oder Löschen (mit Canvas-Seiten).
- Menü (`menu.js`): Rechtsklick (Maus) bzw. langes Drücken auf Ordner/Karten am Touchscreen (drag.js; weiterziehen = umsortieren),
  mit „Verschieben“ (Reihenfolge) und „Zu Home hinzufügen“.
- Startbild (`splash.js`): nur das Zeichen klappt wie ein altes Fernsehbild zu Strich und Punkt zusammen; beim Aufleuchten blendet der dunkle Grund schon aus.
- `render()` baut die Ansicht neu auf; während Gesten `render.hold = true` setzen, danach `render.pending` abarbeiten.
- Canvas (früher „Handschrift“, Code `js/ink*.js`): je Notiz-Ordner eine Startseite in `ink_pages`, Titel führen zu Unterseiten, A4-Bereiche auf dem 25er-Raster.
  Notizen-Bereich (Element `n`, nur Lage) zeigt die Notizen des Ordners als Liste (HTML); jede Notiz hat eine Unterseite mit gleicher ID
  und ihrer Beschreibung oben; Notiz löschen löscht die Unterseite mit (data.js). Auswahl lässt sich nachträglich umgestalten (Farbe, Stärke, Schrift).
  unendliche Fläche (verschieben, zoomen 25–400 %, „Ursprungsansicht“), Werkzeugleiste unter der Kopfleiste (einfahrbar), Ordnerwahl über den Titel,
  Formen (als Striche), Textmarker (Strich mit `m`), Text (Element `x`), Bemaßung (Element `d`), Bilder mit Zuschnitt `cr` und Radierspuren `er`,
  Bereiche mit Name `n`, Hintergrund `bg` (lines/dots/blank), Farbe `fc`, Layout `ly` im Dudek-CI (ink-layout.js) mit Angaben `lf` (Titel, Projekt, Nr., Kontakt), Gliederung (Notizen zuerst, Titel unter ihrem Bereich, „Auf der Fläche zeigen“),
  Werkzeugleiste: Umschalter Text/Zeichnen/Radieren, Auswahl als eigener Knopf (solange aktiv ruhen die anderen Werkzeuge),
  Eigenschaften-Leiste unten (`.ink-ctx`, contextHtml in ink.js): je nach Werkzeug/Auswahl Farbe, Stärke, Schrift, Radiergröße, Aktionen; rechts runder Knopf „Ursprungsansicht“,
  Kopfleiste links (Desktop): Knopf ☰ fährt die Seitenleiste ein/aus (`state.inkSideOff`, gemerkt); rechts: Bereich, Speichern | Raster aus/ein (Bereiche bleiben kariert), Finger, Gliederung | Rückgängig, Wiederholen.
  Speichern-Fenster: links Bereiche, Vorlage samt Angaben (nachträglich), Format, Hintergrund; rechts große Vorschau.
  Text mit Schriftart `ff` (FONTS in ink-draw.js, Google Fonts in index.html), Schnitt `fw`, kursiv `i`; Ursprungsansicht = erster Bereich,
  Titel aus Strichen und Texten (`tx`). Handballen: großer Kontakt, Finger kurz nach dem Stift oder nahe der letzten Stiftstelle,
  Verschieben direkt vor dem Stift werden ignoriert bzw. zurückgenommen. Bildschirmtastatur: `#app` auf `visualViewport` begrenzt (ink.js).
  Einstieg über den Knopf „Canvas“ in den Notizen; Ordnerwahl in Notizen und Canvas oben über den Titel (dort auch Name, Farbe, Symbol),
  Stifttaste wechselt Werkzeug (nur wo der Browser sie meldet – Apple-Pencil-Doppeltippen/Drücken erreicht Webseiten nicht),
  Export als PDF/PNG/JPEG (eigener PDF-Schreiber in `ink-export.js`). Bilder im privaten Storage-Bucket `ink` (`c/<ordner-id>/…`, `u/<user-id>/…`).

## Codes für Gerichte und Training
Simon stellt mit Claude im Chat Essen oder Training zusammen; Claude gibt einen Code aus, den Simon in der App unter
Gerichte bzw. Training → „Code einfügen“ einfügt (`js/plan-import.js`). Ein Code kann Gerichte, Einkauf und Training enthalten,
für einen Tag oder eine Woche. Format (JSON, Text davor wie `PLAN` ist egal, Datum immer `JJJJ-MM-TT`):
```
PLAN {
  "gerichte": [{ "datum", "mahlzeit": "fruehstueck|mittag|abend", "kochen_am", "titel", "symbol", "portionen", "dauer_min",
                 "tags": [], "naehrwerte": { "kcal", "eiweiss", "fett", "kohlenhydrate" }, "zutaten": [], "zubereitung": [], "hinweis" }],
  "einkauf":  [{ "name", "menge", "abteilung": "Obst & Gemüse|Brot & Backwaren|Kühlregal|Fleisch & Fisch|Tiefkühl|Trockenware & Konserven|Gewürze & Öle|Getränke|Süßes & Snacks|Drogerie & Haushalt|Sonstiges", "fuer" }],
  "training": [{ "datum", "titel", "art": "kraft|ausdauer|mobilitaet|sport|ruhe", "dauer_min", "fuer",
                 "aufwaermen": [], "uebungen": [{ "name", "saetze", "wdh", "gewicht", "dauer", "pause", "hinweis" }], "abschluss": [], "hinweis" }]
}
```
**Kurze Trainings-Codes (bevorzugt):** Übungs-Datenbank in `js/training-catalog.js` mit festen Nummern
(1xx Beine/Po, 2xx Brust/Schultern/Arme, 3xx Rücken, 4xx Rumpf, 5xx Ausdauer, 6xx Mobilität; Einheiten E1, E2 …).
Code `TR-JJMMTT-<Tag>-<Tag>-…`, ab dem Datum ein Eintrag je Tag: `0` frei, `E3` fertige Einheit, oder Übungen mit Punkt getrennt,
je `Nr[xSätzexWdh][@kg]` (Wdh. mit `s` = Sekunden), z. B. `TR-261109-E3-0-301x4x8@12.402.603-0-E12`. Vorher in der Datei nachsehen,
welche Nummern es gibt; fehlt eine Übung oder Einheit, sie am Ende anhängen (Nummern nie ändern), committen und pushen, dann den Code geben.
In der App zeigt Training → „Übungen“ die ganze Datenbank.

Übernahme ersetzt Gerichte gleicher Tage und Mahlzeit bzw. die eigenen Trainingseinheiten an den Tagen des Codes. Training ist privat
(ohne Kategorie); für Anna-Lena den Code in ihrem Konto einfügen. Nur Felder verwenden, die oben stehen.

## Supabase
- Alle Datenbank-Änderungen als wiederholbares SQL (`if not exists`, `drop policy if exists`) unten an `supabase-setup.sql` anhängen.
- Ausführen im SQL Editor des Projekts; den Bestätigungsdialog bei Live-Änderungen klickt Simon selbst.
- Jede Tabelle mit Row Level Security. Zugriff auf Ordner über `can_access_category(id)`, Handschrift über `can_access_ink(...)`.
- Neue Zeilen mit selbst erzeugter UUID einfügen, ohne `.select()` danach (sonst greift die Lese-Regel vor dem Einfügen).
- `ink_pages` bewusst nicht in den Live-Updates (Realtime), sonst lädt jedes Speichern alles neu.
- Kalender: Woche wie bei Google (7 Spalten, Zeitraster), Kalenderliste (Dropdown) blendet Abschnitte ein/aus;
  Einstellungen in `profiles.cal_prefs` = `{ hide: [], home: [] }` (Schlüssel `ev`, `bday`, `todo`, `meal`, `train`, `rem`, `x:<id>`), `home` gilt für die Startseite.
  Verknüpfte Kalender (Outlook, Google, iCloud) als ICS-Abo in Tabelle `calendars` (nur eigene, nur lesen); geladen über
  Edge Function `supabase/functions/calendar-feed` (CORS-Umweg, prüft Anmeldung und Adresse), gelesen in `js/ics.js`.
  Google-Kalender bearbeitbar (`js/google-cal.js`): Edge Function `supabase/functions/google-calendar` (OAuth; alle Kalender der Kalenderliste je als Eintrag `x:g:<google-id>`, nur beschreibbare bearbeitbar),
  Neue Termine gehen in den zuletzt gewählten Kalender (`calTarget` im Browser: 'app' oder Google-ID), Auswahl oben im Termin-Fenster;
  Tag/Woche mit fester Gesamthöhe und voller Breite, sichtbar 06:00–19:00 (Raster in %, Höhe über Container-Einheiten); Ganztägiges als Leisten (mehrtägig über die Tage gezogen,
  zugeklappt 2 Zeilen mit „+n“, aufklappbar); Kalenderliste als Dropdown am Knopf neben „Heute“ (auch Startseiten-Auswahl); Termine zuerst ansehen (`event-view.js`), dann „Bearbeiten“; Wochenende leicht rot;
  Startseiten-Kachel mit Tageswechsel (`state.homeDay`); Knopf „Aktualisieren“ lädt alles sofort, sonst verknüpfte Kalender höchstens alle 15 Minuten.
  Schlüssel in `google_links` (nur Dienstzugang, keine Regeln), Secrets `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` nur im Dashboard.
  Weiterleitungs-Adresse bei Google: `https://gerpilzxolufdnlsltxk.supabase.co/functions/v1/google-calendar`.
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
- Datenbank ist auf dem Stand von `supabase-setup.sql` (geprüft 5.11.2026: Tabellen, Spalten, Funktionen, Regeln, Bucket `ink`, Realtime).
  Supabase ist als Connector verbunden: Claude kann SQL selbst ausführen (`apply_migration`), Änderungen trotzdem in `supabase-setup.sql` nachtragen.
- Google-Kalender: eingerichtet und verbunden (5.11.2026); Google-App „Übersicht“ im Projekt „My Project 87146“.
- Push-Erinnerungen: App-Teil fertig; Edge Function deployen, Secrets setzen und Zeitplan (`supabase/push-zeitplan.sql`) einrichten ist noch offen.
- Handschrift am iPad mit Apple Pencil noch von Simon zu testen (Handballen, langes Drücken, Export über das Teilen-Menü).
