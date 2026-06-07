#!/bin/bash
# Startet die Bildrezepte-App lokal und öffnet sie im Browser.
# (Browser blockieren JavaScript-Module von file:// — darum ein Mini-Webserver.)
cd "$(dirname "$0")"
PORT=8421
if ! lsof -i :$PORT > /dev/null 2>&1; then
  (sleep 1 && open "http://localhost:$PORT") &
  echo "Bildrezepte läuft auf http://localhost:$PORT — Fenster schließen beendet die App."
  python3 -m http.server $PORT
else
  open "http://localhost:$PORT"
fi
