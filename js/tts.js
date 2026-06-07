// Sprachausgabe: Web Speech API, vorbereitet für die native iOS-Bridge
// (Protokoll identisch zur Rechengeschichten-App).
let voice = null;

function bestGermanVoice() {
  if (voice) return voice;
  const all = speechSynthesis.getVoices().filter((v) => v.lang.startsWith('de'));
  voice = all.find((v) => /anna|petra|markus|premium|enhanced/i.test(v.name)) || all[0] || null;
  return voice;
}
if ('speechSynthesis' in window) {
  speechSynthesis.addEventListener?.('voiceschanged', () => { voice = null; });
}

export function speak(text) {
  if (window.isNativeApp && window.webkit?.messageHandlers?.nativeApp) {
    window.webkit.messageHandlers.nativeApp.postMessage({ action: 'speak', text });
    return;
  }
  if (!('speechSynthesis' in window)) return;
  stop();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = 'de-DE';
  u.rate = 0.9;
  const v = bestGermanVoice();
  if (v) u.voice = v;
  speechSynthesis.speak(u);
}

export function stop() {
  if (window.isNativeApp && window.webkit?.messageHandlers?.nativeApp) {
    window.webkit.messageHandlers.nativeApp.postMessage({ action: 'stopSpeaking' });
    return;
  }
  if ('speechSynthesis' in window) speechSynthesis.cancel();
}
