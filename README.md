# Bildrezepte

Web-App, die aus beliebigen Rezepten (Foto, Internetseite oder Text) per KI
**kleinschrittige Bildrezepte** für Kinder mit kognitiver Beeinträchtigung
erstellt — mit ARASAAC-Piktogrammen.

**Funktionen:**
- 📷 / 🔗 / ⌨️ Eingabe per Foto, URL oder Text → KI erstellt Schritte, Zutaten, Hilfsmittel
- Jeder Schritt als Wortgruppen mit Symbolen, alles editierbar (Text, Bilder, Schritte ±)
- Personen-Stepper rechnet alle Mengen kindgerecht um (keine Kommazahlen)
- Abmessen/Abwiegen als eigene Schritte mit klaren Einheiten (Prise, kleiner/großer Löffel, Gramm …)
- **Symbol-Lexikon:** einmal angepasste Symbole werden automatisch wiederverwendet
- **Kochmodus:** Schritt für Schritt abhaken, aktueller Schritt hervorgehoben, Sprachausgabe
- **Drucken:** DIN-A4-Bogen mit Zutaten-/Hilfsmittel-Raster und QR-Code
- **Teilen:** QR-Code / Kurzlink (`…/#r=ID`)
- **Für die Schulpraxis:** Sicherheits-Marker (heiß/scharf/Hilfe) mit Erwachsenen-Notizen,
  Time-Timer mit schrumpfendem Sektor, Wiedereinstieg nach Unterbrechung, Schüler-Modus,
  Routine-Schritte (Hände waschen …), Lehrkraft-Vorbereitungsblatt mit Gruppen-Hochrechnung,
  abhakbare Einkaufs-/Bereitstellungsliste, Rezept-Backup als Datei, Anzeige-Einstellungen
- **Rezepte-Sammlung (Community):** öffentliche Sammlung mit Suche (Titel, Stichwörter,
  Zutaten, Hilfsmittel), Kategorie-Chips und Piktogramm-Vorschau. Veröffentlichen mit
  serverseitiger KI-Prüfung (Ablehnung mit Begründung + Vorschlägen), freiwilliges
  Pseudonym, Melden-Funktion (ab 3 Meldungen automatisch ausgeblendet)

## Nutzung

Lokal: Doppelklick auf **„Bildrezepte starten.command"** — startet einen
Mini-Webserver und öffnet die App (Browser blockieren JavaScript-Module von
`file://`, darum genügt ein Doppelklick auf `index.html` nicht).
Beim allerersten Start ggf. Rechtsklick → „Öffnen" (macOS Gatekeeper).

Online: die Web-Dateien auf einen beliebigen Webspace hochladen.

**Backend:** KI-Erstellung, Teilen-Links und die Rezepte-Sammlung laufen über
einen Cloudflare Worker (KI-Proxy via OpenRouter, KV für Kurzlinks, D1 für die
Sammlung). Der Worker-Code ist **nicht Teil dieses Repositories**. Wer die App
selbst hostet, betreibt bitte ein eigenes Backend mit denselben Routen — der
Worker der Original-Instanz gehört zu `bildrezepte.urff.app`, ist rate-limitiert
und darf nicht von anderen Installationen mitbenutzt werden. Die Worker-URL
steht in `js/api.js` (`DEFAULT_WORKER_URL`) und ist lokal überschreibbar:
`localStorage.setItem('bildrezept_worker_url', 'https://…')`.

## Entwicklung

```bash
node --test tests/*.test.js        # Logik-Tests (Skalierung, Validierung …)
```

Web-App auf ein eigenes/lokales Backend zeigen lassen (Browser-Konsole):
`localStorage.setItem('bildrezept_worker_url', 'http://localhost:8787')`

Piktogramme: [ARASAAC](https://arasaac.org) — Autor: Sergio Palao, Eigentum:
Gobierno de Aragón, Lizenz CC BY-NC-SA (nicht-kommerzielle Nutzung).

App-Lizenz: [CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/deed.de)
(Namensnennung – nicht kommerziell – Weitergabe unter gleichen Bedingungen) —
Christian Urff · [Impressum](https://urff.app/impressum/)

## Manuelle Prüfliste

- [ ] Erstellen per Text / URL / Foto (je 1 echtes Rezept)
- [ ] Mess-Schritte vorhanden, Einheiten nur aus dem Vokabular
- [ ] Personen-Stepper rechnet Karten UND Schritt-Mengen um, keine Kommazahlen
- [ ] Symbol tauschen (Alternative, freie Suche, eigenes Foto), Text ändern,
      Chunk ±, Schritt ↑↓/＋/🗑 — Reload behält alles
- [ ] Symbol-Lexikon: angepasstes Symbol wird im nächsten Rezept automatisch
      wiederverwendet; Eintrag löschbar über den Lexikon-Dialog
- [ ] Kochmodus: abhaken, dimmen, mittig scrollen, vor/zurück ohne Haken,
      Vorlesen manuell + automatisch, Abschlusskarte
- [ ] Drucken: A4-Vorschau, kein zerrissener Schritt, QR + Lizenzzeile
- [ ] Teilen: QR scannen → Rezept öffnet im Kochmodus
- [ ] Offline (DevTools): gespeicherte Rezepte + Kochmodus funktionieren
