// Kochmodus: aktueller Schritt hervorgehoben, andere gedimmt, Abhaken,
// Auto-Scroll mittig, Sprachausgabe, Fortschritt in localStorage.
import { App } from './app.js';
import { stepText, parseStepMinutes } from './recipe-model.js';
import { getProgress, saveProgress } from './storage.js';
import { speak, stop } from './tts.js';
import { icon } from './icons.js';
import { autoSpeak } from './settings.js';

const $ = (id) => document.getElementById(id);
let state = { index: 0, done: new Set() };

export function startCookMode() {
  const p = getProgress(App.recipe.id);
  state = {
    index: Math.min(p.index, App.recipe.steps.length - 1),
    done: new Set(p.done),
  };
  renderChecks();
  update({ speakNow: false });
  // Wiedereinstiegs-Anker: nach Unterbrechung weitermachen oder von vorn
  const allDone = App.recipe.steps.every((s) => state.done.has(s.id));
  if ((state.index > 0 || state.done.size > 0) && !allDone) {
    $('resume-text').textContent =
      `Du warst bei Schritt ${state.index + 1} von ${App.recipe.steps.length}.`;
    $('resume-dialog').showModal();
  }
}

$('resume-continue').addEventListener('click', () => {
  $('resume-dialog').close();
  update(); // liest den aktuellen Schritt vor, wenn „automatisch vorlesen" an ist
});
$('resume-restart').addEventListener('click', () => {
  $('resume-dialog').close();
  state = { index: 0, done: new Set() };
  persist();
  update({ speakNow: false });
});

export function stopCookMode() {
  stop();
  setDisplayMode(false);
  if (timer?.iv) clearInterval(timer.iv);
  timer = null;
}

// ===== Time-Timer: schrumpfender Sektor für Warte-/Backschritte =====
// Zeit kommt aus dem Schritttext; manuell starten, Pause/Zurücksetzen mit Nachfrage.
let timer = null; // { stepId, total, remaining, running, iv }

const fmtTime = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
// Time-Timer-Optik: 60-Minuten-Zifferblatt, Restzeit als roter Keil links der 12,
// der im Uhrzeigersinn schrumpft (10 Minuten = 1/6 der Uhr rot).
const discStyle = (rem) => {
  const frac = Math.min(1, rem / 3600);
  const start = 100 - frac * 100;
  return `conic-gradient(#f2f2f2 0 ${start}%, #cf3f2f ${start}% 100%)`;
};

function renderTimer() {
  document.getElementById('step-timer')?.remove();
  const r = App.recipe;
  const step = r.steps[state.index];
  if (!step) return;
  const min = parseStepMinutes(stepText(r, step));
  if (!min) return;
  if (!timer || timer.stepId !== step.id) {
    if (timer?.iv) clearInterval(timer.iv);
    timer = { stepId: step.id, total: min * 60, remaining: min * 60, running: false, iv: null };
  }
  const host = document.querySelector('#steps .step.active .step-main');
  if (!host) return;
  const el = document.createElement('div');
  el.id = 'step-timer';
  el.innerHTML = `
    <div class="timer-disc"><span></span></div>
    <div class="timer-btns">
      <button id="timer-toggle"></button>
      <button id="timer-reset">Zurücksetzen</button>
    </div>`;
  host.appendChild(el);
  el.querySelector('#timer-toggle').addEventListener('click', () => {
    if (timer.running) {
      if (!confirm('Den Timer wirklich anhalten?')) return;
      pauseTimer();
    } else if (timer.remaining > 0) {
      startTimer();
    }
    refreshTimerUi();
  });
  el.querySelector('#timer-reset').addEventListener('click', () => {
    if (!confirm('Den Timer auf Anfang zurücksetzen?')) return;
    pauseTimer();
    timer.remaining = timer.total;
    refreshTimerUi();
  });
  refreshTimerUi();
}

function refreshTimerUi() {
  const el = document.getElementById('step-timer');
  if (!el || !timer) return;
  el.querySelector('.timer-disc').style.background = discStyle(timer.remaining);
  el.querySelector('.timer-disc span').textContent =
    timer.remaining > 0 ? fmtTime(timer.remaining) : 'Zeit ist um!';
  el.querySelector('#timer-toggle').textContent = timer.running ? 'Pause' : 'Start';
}

function startTimer() {
  timer.running = true;
  timer.iv = setInterval(() => {
    timer.remaining -= 1;
    if (timer.remaining <= 0) {
      timer.remaining = 0;
      pauseTimer();
      timerDone();
    }
    refreshTimerUi();
  }, 1000);
}

function pauseTimer() {
  timer.running = false;
  clearInterval(timer.iv);
  timer.iv = null;
}

function timerDone() {
  // In der iOS-App zusätzlich eine sanfte Vibration
  if (window.isNativeApp && window.webkit?.messageHandlers?.nativeApp) {
    window.webkit.messageHandlers.nativeApp.postMessage({ action: 'haptic' });
  }
  // Ruhiges Endsignal: zwei weiche Töne, kein Blinken
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    [0, 0.55].forEach((t) => {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.frequency.value = 660;
      o.connect(g); g.connect(ctx.destination);
      g.gain.setValueAtTime(0.0001, ctx.currentTime + t);
      g.gain.exponentialRampToValueAtTime(0.18, ctx.currentTime + t + 0.05);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + t + 0.45);
      o.start(ctx.currentTime + t);
      o.stop(ctx.currentTime + t + 0.5);
    });
  } catch { /* ohne Ton weiter */ }
}

// ===== Vollbild-/Anzeigemodus: alles größer, volle Breite, Kopf/Fuß weg =====
function setDisplayMode(on) {
  document.documentElement.classList.toggle('fullscreen', on);
  const btn = $('cook-fullscreen');
  btn.innerHTML = icon(on ? 'compress' : 'expand') + (on ? 'Vollbild aus' : 'Vollbild');
  document.querySelector('#steps .step.active')?.scrollIntoView({ block: 'center' });
}

async function toggleDisplayMode() {
  const on = !document.documentElement.classList.contains('fullscreen');
  const el = document.documentElement;
  try {
    if (on) await (el.requestFullscreen || el.webkitRequestFullscreen)?.call(el);
    else if (document.fullscreenElement || document.webkitFullscreenElement) {
      await (document.exitFullscreen || document.webkitExitFullscreen)?.call(document);
    }
  } catch { /* echtes Browser-Vollbild ist optional — die Skalierung greift trotzdem */ }
  setDisplayMode(on);
}

$('cook-fullscreen').addEventListener('click', toggleDisplayMode);
// Esc / System-Geste beendet das Browser-Vollbild → Anzeige zurücksetzen
for (const ev of ['fullscreenchange', 'webkitfullscreenchange']) {
  document.addEventListener(ev, () => {
    if (!document.fullscreenElement && !document.webkitFullscreenElement
        && document.documentElement.classList.contains('fullscreen')) {
      setDisplayMode(false);
    }
  });
}

function persist() {
  saveProgress(App.recipe.id, { index: state.index, done: [...state.done] });
}

/** ✓-Knöpfe in die Schritte rendern (nur Kochmodus). */
function renderChecks() {
  document.querySelectorAll('#steps .step').forEach((li) => {
    li.querySelector('.step-check').innerHTML =
      '<button class="check-btn" title="Schritt abhaken">✓</button>';
  });
}

function update({ speakNow = true } = {}) {
  const r = App.recipe;
  document.querySelectorAll('#steps .step').forEach((li, i) => {
    li.classList.toggle('active', i === state.index);
    li.classList.toggle('done', state.done.has(li.dataset.id));
  });
  document.querySelector('#steps .step.active')
    ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  const allDone = r.steps.every((s) => state.done.has(s.id));
  $('finished-card').hidden = !allDone;
  renderTimer();
  if (speakNow && autoSpeak()) {
    speak(stepText(r, r.steps[state.index]));
  }
  persist();
}

function goTo(i) {
  state.index = Math.max(0, Math.min(i, App.recipe.steps.length - 1));
  update();
}

function checkCurrent() {
  const r = App.recipe;
  state.done.add(r.steps[state.index].id);
  if (state.index < r.steps.length - 1) {
    state.index += 1;
    update();
  } else {
    update({ speakNow: false });
    $('finished-card').scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
}

// ===== Bedienung =====
$('cook-prev').addEventListener('click', () => goTo(state.index - 1));
$('cook-next').addEventListener('click', () => goTo(state.index + 1));
$('cook-speak').addEventListener('click', () =>
  speak(stepText(App.recipe, App.recipe.steps[state.index])));

document.getElementById('steps').addEventListener('click', (e) => {
  if (App.mode !== 'cook') return;
  if (e.target.classList.contains('check-btn')) {
    const li = e.target.closest('.step');
    const i = App.recipe.steps.findIndex((s) => s.id === li.dataset.id);
    if (i === state.index) checkCurrent();
    else goTo(i); // angetippter Schritt wird aktiv, ohne abzuhaken
  }
});

document.addEventListener('keydown', (e) => {
  if (App.mode !== 'cook') return;
  if (e.key === 'ArrowLeft') goTo(state.index - 1);
  if (e.key === 'ArrowRight') goTo(state.index + 1);
});

// Wischgesten: horizontal > 60 px und größer als vertikal
let touchStart = null;
const stepsEl = document.getElementById('steps');
stepsEl.addEventListener('touchstart', (e) => {
  touchStart = { x: e.touches[0].clientX, y: e.touches[0].clientY };
}, { passive: true });
stepsEl.addEventListener('touchend', (e) => {
  if (App.mode !== 'cook' || !touchStart) return;
  const dx = e.changedTouches[0].clientX - touchStart.x;
  const dy = e.changedTouches[0].clientY - touchStart.y;
  touchStart = null;
  if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy)) goTo(state.index + (dx < 0 ? 1 : -1));
}, { passive: true });

// ===== Schüler-Modus: nur Kochansicht, keine Navigation =====
// Echte Geräteverriegelung bewusst dem iOS-„Geführten Zugriff" überlassen —
// hier werden nur die In-App-Ablenkungen ausgeblendet.
// Immer im Vollbild (große Schrift/Symbole, volle Konzentration).
export function setSchuelerMode(on) {
  document.body.classList.toggle('schueler', on);
  setDisplayMode(on);
}

/** Schüler-Modus aktivieren — mit Hinweis, wie man wieder herauskommt. */
export function enterSchuelerMode({ hinweis = true } = {}) {
  setSchuelerMode(true);
  if (hinweis) alert('Schüler-Modus aktiv. Zum Verlassen lange auf den Rezeptnamen drücken.');
}

$('cook-lock').addEventListener('click', () => enterSchuelerMode());

// Verlassen: 1 Sekunde auf den REZEPTTITEL drücken — der liegt mitten im
// Bildschirm, weit weg von allen iOS-Systemgesten-Zonen („gesture gate").
// preventDefault beim Touch-Start verhindert, dass die System-Langdruckgeste
// (Lupe/Textauswahl) den Timer abbricht. 3× tippen bleibt stiller Fallback.
let lockPress = null;
let exitTaps = [];
const exitTarget = document.getElementById('recipe-title');

function askExit() {
  clearTimeout(lockPress);
  exitTaps = [];
  if (confirm('Schüler-Modus verlassen?')) setSchuelerMode(false);
}

function startExitPress(e) {
  if (!document.body.classList.contains('schueler')) return;
  if (e.cancelable) e.preventDefault();
  // Haupt-Ausstieg: 3× schnell tippen — funktioniert auch, wenn iOS die
  // Touches am oberen Rand verzögert zustellt (Gesture-Gate).
  const now = Date.now();
  exitTaps = exitTaps.filter((t) => now - t < 1600);
  exitTaps.push(now);
  if (exitTaps.length >= 3) return askExit();
  // Zusätzlich: langer Druck (Desktop/Browser)
  clearTimeout(lockPress);
  lockPress = setTimeout(askExit, 1000);
}
const cancelExitPress = () => clearTimeout(lockPress);

exitTarget.addEventListener('touchstart', startExitPress, { passive: false });
exitTarget.addEventListener('mousedown', startExitPress);
for (const ev of ['touchend', 'touchcancel', 'mouseup', 'mouseleave']) {
  exitTarget.addEventListener(ev, cancelExitPress);
}

$('btn-restart').addEventListener('click', () => {
  state = { index: 0, done: new Set() };
  persist();
  update({ speakNow: false });
});
