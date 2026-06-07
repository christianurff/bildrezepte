// Freiwillige Spenden: kleiner Footer-Link + Hinweis nach jedem dritten
// erstellten Rezept. Nach einer Spende ist 3 Monate Ruhe.

// PayPal.me-Links. Leer = Spenden-UI komplett aus.
// Mit Betrag im Link lässt PayPal den Betrag teils nicht mehr ändern —
// deshalb zwei Wege: fester Vorschlag UND freie Eingabe.
export const DONATE_URL = 'https://paypal.me/urffapp';
export const DONATE_URL_SUGGESTED = 'https://paypal.me/urffapp/4EUR';

const DONATED_KEY = 'bildrezept_donated_at';
const COUNT_KEY = 'bildrezept_created_count';
const SNOOZE_MS = 90 * 24 * 60 * 60 * 1000; // 3 Monate

const $ = (id) => document.getElementById(id);

// In der iOS-App KEINE Spenden-UI: externe Zahlungslinks verstoßen gegen die
// App-Store-Richtlinien (3.1.1) — Spenden gibt es nur im Web.
const enabled = () => Boolean(DONATE_URL) && !window.isNativeApp;

function donatedRecently() {
  const t = parseInt(localStorage.getItem(DONATED_KEY) || '0', 10);
  return t > 0 && Date.now() - t < SNOOZE_MS;
}

function rememberDonation() {
  localStorage.setItem(DONATED_KEY, String(Date.now()));
}

/** Footer-Link und Dialog verdrahten (einmal beim Start). */
export function initDonateUi() {
  if (!enabled()) return;
  const link = $('donate-link');
  link.href = DONATE_URL;
  link.hidden = false;
  // Footer-Link öffnet erst den Erklär-Dialog (mit 4 € / anderer Betrag)
  link.addEventListener('click', (e) => {
    e.preventDefault();
    $('donate-dialog').showModal();
  });
  const donate = (url) => {
    window.open(url, '_blank', 'noopener');
    rememberDonation(); // Vertrauensbasis: wer klickt, hat 3 Monate Ruhe
    $('donate-dialog').close();
  };
  $('donate-go').addEventListener('click', () => donate(DONATE_URL_SUGGESTED));
  $('donate-any').addEventListener('click', () => donate(DONATE_URL));
  $('donate-later').addEventListener('click', () => $('donate-dialog').close());
}

/** Nach jedem erfolgreich erstellten Rezept aufrufen. */
export function countRecipeAndMaybeAsk() {
  if (!enabled() || donatedRecently()) return;
  const n = parseInt(localStorage.getItem(COUNT_KEY) || '0', 10) + 1;
  localStorage.setItem(COUNT_KEY, String(n));
  if (n % 3 === 0) $('donate-dialog').showModal();
}
