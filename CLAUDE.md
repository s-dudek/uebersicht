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
- Startseite (`home.js`): überall Kacheln (eigene Kachel „Datum“, Kalender-Kachel mit Terminen); Bearbeiten nur über langes Drücken/Rechtsklick (Desktop dann oben „Fertig“), 12 Spalten (Klein ¼, Mittel ½ doppelt hoch, Groß volle Breite),
  mehr Inhalt (Kalender Groß = Tag als Zeitleiste `calDayBody`, Mittel = Terminliste; Todos zum Abhaken), eigenes Layout (cat_order 'tilesD'/'tileszD'); schmal dunkelgrüne Leiste (`homeBar`: Logo, runder Knopf Neue Notiz,
  Einstellungen, Abmelden) und Kacheln (`home-tiles.js`, wie Widgets am iPhone: Größe Klein/Mittel/Groß und Reihenfolge je Person in
  cat_order 'tiles'/'tilesz'; langes Drücken = Menü, weiterziehen = verschieben, „Home-Bildschirm bearbeiten“ = wackeln mit Größen-Knopf, „Fertig“); Angeheftetes („Zu Home hinzufügen“) ist dort ebenfalls eine Kachel
  (keine eigene Pinnwand am Handy); Notizen- und Notiz-Ordner-Kacheln mit Knopf direkt in den Canvas (zuletzt benutzter Ordner: `inkFolder`).
  Kachel-Gestaltung: Akzentfarbe `accent` (`--ac`), Symbol im Farbkreis, keine Wasserzeichen; Klein = Kennzahl (`stat`), Mittel/Groß = Liste plus Grafik unten (`foot`: Wochenleiste, Fortschritt, zuletzt bearbeitet; am Handy bei Mittel ausgeblendet), Datum aufwendiger (Verlauf, Ring = Jahresfortschritt mit KW; Groß und am Desktop auch Mittel zusätzlich Tag im Jahr und laufende Woche).
  Freie Fläche der Startseite: Rechtsklick bzw. langes Drücken = „Home-Bildschirm bearbeiten“ (menu.js).
  Kopfleisten der Bereiche schmal im selben Dunkelgrün, gleiche Höhe (44 px) und Schrift in Salbei (außer Canvas). Einen eigenen Bereich „Kategorien“ gibt es nicht mehr (Ordner in Todos/Notizen).
- Fenster (Sheets): oben rechts runde Knöpfe aus `sheetActs()` (sheet.js) – Bearbeiten, Speichern ✓, Schließen ✕, Löschen; Kopf bleibt beim Scrollen oben.
  Speichern übernimmt und schließt; Schließen verwirft bei neuen Einträgen (sonst ist schon gespeichert); keine Speichern-/Löschen-Knöpfe unten.
- Keine kleinen Beschreibungs-/Hinweistexte auf den Seiten (Bedienung erklärt sich über Menü und Knöpfe).
- Todo-Listen und Notiz-Ordner getrennt (`todoLists`/`noteFolders` in folders.js): Listen erscheinen nur bei den Notizen, wenn Notizen darin liegen, und umgekehrt.
- Todos und Notizen: geöffneter Ordner ohne Ordner-Spalte, Wechsel oben über den Titel (`openFolderDrop` in menu.js, auch Canvas).
  Abhaken: Zeile bleibt kurz markiert (`.just-done`, `toggleTodo` in data.js), nochmal tippen nimmt zurück.
- Reine Canvas-Ordner (`categories.canvas_only`, `isCanvasOnly`/`inkMode` in core.js): öffnen direkt den Canvas, ohne Notizen-Liste und ohne Notizen-Bereich;
  wählbar beim Anlegen („Art“) und im Ordner-Fenster.
- Erinnerungen (`remind-page.js`, Bereich `reminders` in NAV, Kachel „Erinnerungen“): alle Einträge mit `remind_at`; eigene als Typ `reminder`
  (Titel, Zeit, `meta.fid` = Canvas-Ordner); oben schnell stellen (Schnellwahl bzw. Zeit wählen, Enter = in 1 Std.).
  Canvas: Auswahl → „Erinnern“ legt eine Erinnerung an und setzt ein Glocken-Feld (Element `b`: `rem`, Kopie `tt`, Größe `sz`; ink-remind.js) daneben;
  Feld antippen = Erinnerung im Bereich Erinnerungen. Termin- und Glocken-Feld merken den Rückweg (`state.backTo`, `goFromCanvas` in nav.js):
  Pfeil „Zurück zum Canvas“ in der Kopfleiste von Kalender/Erinnerungen (`backToCanvas` in ink.js zeigt das Feld wieder).
- Geteilte Einträge anderer: „Für mich entfernen“ (Menü, Fenster) blendet nur bei mir aus (cat_order 'hidden'), zurück im Papierkorb.
- Papierkorb (`trash.js`): Löschen setzt nur `deleted_at` (items, categories); `loadAll` trennt in `state.trash`; nach 30 Tagen endgültig (beim Laden),
  Kategorie endgültig löschen nimmt Canvas und Bilder mit, Einträge bleiben ohne Kategorie. Geöffnet über Seitenleiste bzw. Einstellungen.
- Notizen: Mehrfachauswahl (`note-select.js`, Knopf „Auswählen“ im Ordner): antippen markiert, dann Verschieben (Ordner wählen) oder Löschen (mit Canvas-Seiten).
- Menü (`menu.js`): Rechtsklick (Maus) bzw. langes Drücken auf Ordner/Karten am Touchscreen (drag.js; weiterziehen = umsortieren),
  mit „Verschieben“ (Reihenfolge) und „Zu Home hinzufügen“.
- Ladesymbol (`loader.js`, nach Simons GIF): Zeichen als feine Linie, ein kräftiger Abschnitt läuft rundum (je Bogen ein Pfad, Keyframes ld-top/-right/-left);
  im Startbild (mind. 1,5 s), statt „Lädt …“ und klein unten beim Nachladen (`busy()` um loadAll, verknüpfte Kalender, Canvas laden).
- Startbild (`splash.js`): nur das Zeichen klappt wie ein altes Fernsehbild zu Strich und Punkt zusammen; beim Aufleuchten blendet der dunkle Grund schon aus.
- `render()` baut die Ansicht neu auf; während Gesten `render.hold = true` setzen, danach `render.pending` abarbeiten.
- Canvas (früher „Handschrift“, Code `js/ink*.js`): je Notiz-Ordner eine Startseite in `ink_pages`, Titel führen zu Unterseiten, A4-Bereiche auf dem 25er-Raster.
  Notizen-Bereich (Element `n`, nur Lage) zeigt die Notizen des Ordners als Liste (HTML); jede Notiz hat eine Unterseite mit gleicher ID
  und ihrer Beschreibung oben; Notiz löschen löscht die Unterseite mit (data.js). Auswahl lässt sich nachträglich umgestalten (Farbe, Stärke, Schrift).
  unendliche Fläche (verschieben, zoomen 25–400 %, „Ursprungsansicht“), Werkzeugleiste unter der Kopfleiste (einfahrbar), Ordnerwahl über den Titel,
  Formen (als Striche), Textmarker (Strich mit `m`), Text (Element `x`), Bemaßung (Element `d`), Bilder mit Zuschnitt `cr` und Radierspuren `er`,
  Drehen über den Griff oben an der Auswahl (Striche/Formen/Bemaßung: Punkte gedreht; Bilder und Texte: Winkel `r` um die Mitte; gedrehte Bilder nicht zuschneiden),
  Homescreen-Ausschnitt: Menü „Bereich“ → „Homescreen-Ausschnitt“ legt einen Rahmen `fmt: 'home'` (750×500, einer je Canvas, nur Startseite) an und heftet den Ordner an;
  nach jedem Speichern wird der Rahmen als JPEG in `ink_pages.home_img` gelegt (`updateHomeImg`), geladen in `state.homeImgs` (loadAll), geprüft mit `jpegSrc`;
  die Ordner-Kachel zeigt dann nur das Bild (ganze Fläche, Name als Schild) und öffnet den Canvas. Geht auch bei reinen Canvas-Ordnern.
  Kopieren: Auswahl → „Kopieren“ (Leiste/Menü) legt eine Kopie versetzt daneben und merkt sie; langes Drücken/Rechtsklick auf freie Stelle → „Einfügen“ (auch in anderen Ordnern; ohne Titel und Bereiche).
  Termin-Feld (Element `c`, ink-cal.js: Verweis `ev` bzw. `xo` plus Kopie `tt`/`d`/`tm`, Größe `sz` s/m/l wie Kacheln, HTML-Ebene; ziehen = verschieben, antippen = Wochenansicht des Tages, Inhalt immer aktuell aus dem Kalender),
  Bereiche mit Name `n`, Hintergrund `bg` (lines/dots/blank), Farbe `fc`, Layout `ly` im Dudek-CI (ink-layout.js) mit Angaben `lf` (Titel, Projekt, Nr., Kontakt), Gliederung (Notizen zuerst, Titel unter ihrem Bereich, „Auf der Fläche zeigen“),
  Werkzeugleiste: Umschalter Text/Zeichnen/Radieren, Auswahl als eigener Knopf (solange aktiv ruhen die anderen Werkzeuge),
  Eigenschaften-Leiste unten (`.ink-ctx`, contextHtml in ink.js): je nach Werkzeug/Auswahl Farbe, Stärke, Schrift, Radiergröße, Aktionen; rechts runder Knopf „Ursprungsansicht“,
  Kopfleiste links (Desktop): Knopf ☰ fährt die Seitenleiste ein/aus (`state.inkSideOff`, gemerkt); rechts: Bereich, Speichern | Raster aus/ein (Bereiche bleiben kariert), Finger, Gliederung | Rückgängig, Wiederholen.
  Speichern-Fenster: links Bereiche, Vorlage samt Angaben (nachträglich), Format, Hintergrund; rechts große Vorschau.
  Text mit Schriftart `ff` (FONTS in ink-draw.js, Google Fonts in index.html), Schnitt `fw`, kursiv `i`; Ursprungsansicht = erster Bereich,
  Titel aus Strichen und Texten (`tx`). Handballen je Berührung (wie GoodNotes): Hand ist, was aufsetzt, während der Stift schreibt, große
  Auflagen und Berührungen ganz knapp nach dem Stift an seiner Spitze – bis diese Berührung endet; keine Sperre nach Zeit. Verschieben direkt vor dem Stift
  wird zurückgenommen; Loslassen wird am ganzen Dokument gehört (kein Hängenbleiben). Bildschirmtastatur: `#app` auf `visualViewport` begrenzt (ink.js).
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
  Termine in Tag/Woche ziehen und am unteren Rand länger/kürzer ziehen (`cal-drag.js`; eigene App-Termine und beschreibbare Google-Kalender, `moveGoogle`);
  Menü zum Termin (`cal-menu.js`, Rechtsklick bzw. Touch langes Drücken – weiterziehen schließt es und verschiebt): Duplizieren (Tag + Abschnitt),
  Kopieren nach (anderer Abschnitt, gleicher Tag), Löschen sofort mit 5 s „Rückgängig“ (`undoToast` in core.js; Google erst nach Ablauf gelöscht, bis dahin `hideOcc`);
  Abschnitte zum Schreiben (`calSections`: Termine, Geburtstage, beschreibbare Google-Kalender `g:<id>`, `createIn`); im Bearbeiten-Fenster (App und Google) Auswahl „Abschnitt“ = verschieben (dort anlegen, hier löschen);
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
