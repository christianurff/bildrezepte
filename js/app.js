// App-Zustand, Ansichts-Umschaltung, Start-Ansicht.
import { generateRecipe, resizeImage } from './generate.js';
import * as storage from './storage.js';
import { icon, applyIcons } from './icons.js';
import { initCollection, openPublishDialog } from './collection.js';
import { initDonateUi, countRecipeAndMaybeAsk } from './donate.js';

applyIcons();
initDonateUi();
// In der nativen App: Vollbild-Knopf überflüssig (Schüler-Modus skaliert)
if (window.isNativeApp) document.body.classList.add('native');
// Anzeige-Einstellungen: nach Änderung das offene Rezept neu rendern
import('./settings.js').then(({ initSettings }) => initSettings(async () => {
  if (App.recipe && App.mode !== 'start') {
    (await import('./editor.js')).renderRecipe();
  }
}));

export const App = {
  recipe: null,          // aktuelles Rezept (Datenmodell, Spec § 3)
  mode: 'start',         // 'start' | 'edit' | 'cook'
};

/** Admin-Modus: Änderungen an einem Sammlungs-Rezept direkt zurückschreiben. */
async function syncCollectionAsAdmin({ quiet = true } = {}) {
  const r = App.recipe;
  const pw = localStorage.getItem('bildrezept_admin_pw') || '';
  if (!r?.published?.admin || !pw) return false;
  const ed = await import('./editor.js');
  if (quiet && !ed.isDirty()) return false; // nichts geändert → kein KI-Check nötig
  const { updateCollectionRecipe } = await import('./api.js');
  const { recipeSummaryText } = await import('./recipe-model.js');
  const clean = { ...r };
  delete clean.published;
  try {
    await updateCollectionRecipe(r.published.id, clean, recipeSummaryText(r),
      localStorage.getItem('bildrezept_author') || '', { adminPw: pw });
    ed.clearDirty();
    return true;
  } catch (err) {
    if (!quiet) alert(`Sammlung nicht aktualisiert: ${err.message}`);
    else console.warn('Sammlungs-Abgleich fehlgeschlagen:', err.message);
    return false;
  }
}

function leaveEditMode() {
  if (!App.recipe) return;
  // dedupeTitle: gleichnamige Alt-Kopien werden hier überspeichert (Dubletten)
  storage.saveRecipe(App.recipe, { dedupeTitle: true });
  syncCollectionAsAdmin(); // läuft im Hintergrund, nur wenn etwas geändert wurde
}

const NAV_DEPTH = { start: 0, edit: 1, cook: 2 };
// Eigener Verlauf für die Übergangs-Richtung: App.mode wird von openRecipe
// schon VOR dem Ansichtswechsel gesetzt (das Rendering hängt daran) und
// taugt deshalb nicht als „vorherige Ebene".
let lastNavMode = 'start';

export function showView(mode) {
  // Beim Verlassen des Bearbeiten-Modus immer speichern
  if (App.mode === 'edit' && mode !== 'edit') leaveEditMode();
  // Übergangs-Richtung: tiefer = von rechts herein, zurück = von links
  const dir = NAV_DEPTH[mode] > NAV_DEPTH[lastNavMode] ? 'slide-push'
            : NAV_DEPTH[mode] < NAV_DEPTH[lastNavMode] ? 'slide-pop' : null;
  lastNavMode = mode;
  App.mode = mode;
  document.getElementById('view-start').hidden = mode !== 'start';
  document.getElementById('view-recipe').hidden = mode === 'start';
  document.body.classList.toggle('cook', mode === 'cook');
  document.body.classList.toggle('edit', mode === 'edit');
  // Navigations-Stack: Übersicht → Bearbeiten → Kochen, Zurück geht eine Ebene hoch
  $('nav-back').hidden = mode === 'start';
  $('nav-back-label').textContent = mode === 'cook' ? 'Bearbeiten' : 'Übersicht';
  document.querySelector('.app-title').hidden = mode !== 'start';
  $('nav-print').hidden = mode !== 'edit';
  $('nav-share').hidden = mode !== 'edit';
  $('nav-info').hidden = mode !== 'start';
  if (mode === 'start') {
    renderMyRecipes();
    initCollection();
  }
  if (dir) {
    window.scrollTo(0, 0);
    const el = document.getElementById(mode === 'start' ? 'view-start' : 'view-recipe');
    el.classList.remove('slide-push', 'slide-pop');
    void el.offsetWidth; // Animation auch beim Wechsel edit↔cook neu starten
    el.classList.add(dir);
  }
}

/** Rezept öffnen und rendern. Modus zuerst setzen — das Rendering hängt davon ab. */
export async function openRecipe(recipe, mode) {
  if (App.mode === 'edit') leaveEditMode();
  // Pflichtfelder absichern — schützt vor Abstürzen bei fremden/alten/manipulierten
  // Rezepten (geteilt oder aus der Sammlung).
  recipe.title = typeof recipe.title === 'string' && recipe.title.trim() ? recipe.title : 'Rezept';
  if (!Array.isArray(recipe.ingredients)) recipe.ingredients = [];
  if (!Array.isArray(recipe.tools)) recipe.tools = [];
  if (!Array.isArray(recipe.steps)) recipe.steps = [];
  for (const s of recipe.steps) if (!Array.isArray(s.chunks)) s.chunks = [];
  // IDs auf einen sicheren Zeichensatz zwingen — verhindert, dass ein manipuliertes
  // geteiltes Rezept über data-Attribute Code einschleust (XSS). Deterministisch,
  // damit normale IDs (z1, s1 …) und gespeicherter Fortschritt stabil bleiben.
  const safeId = (id) => String(id || '').replace(/[^A-Za-z0-9_-]/g, '') || 'x';
  recipe.ingredients.forEach((z) => { z.id = safeId(z.id); });
  recipe.tools.forEach((t) => { t.id = safeId(t.id); });
  recipe.steps.forEach((s) => {
    s.id = safeId(s.id);
    s.chunks.forEach((c) => { if (c.qtyRef) c.qtyRef = safeId(c.qtyRef); });
  });
  App.recipe = recipe;
  App.mode = mode;
  // Schritt-Wörter ohne Bild erben Symbole aus Zutaten/Hilfsmitteln und Lexikon;
  // Einheiten-Symbole (Löffel/Becher) für Mengen-Chunks bereitstellen
  const { fillChunkSymbolsFromItems, ensureUnitSymbols } = await import('./arasaac.js');
  await ensureUnitSymbols();
  let changed = fillChunkSymbolsFromItems(recipe);
  // Rezepte aus fremden Quellen reparieren: fehlende Personenzahl (→ NaN) und kaputte Mengen
  if (!Number.isInteger(recipe.servingsBase) || recipe.servingsBase < 1) { recipe.servingsBase = 4; changed = true; }
  if (!Number.isInteger(recipe.servings) || recipe.servings < 1) { recipe.servings = recipe.servingsBase; changed = true; }
  for (const z of recipe.ingredients) {
    if (!Number.isFinite(z.qty.value)) { z.qty.value = 1; changed = true; }
  }
  if (changed) storage.saveRecipe(recipe);
  const { renderRecipe } = await import('./editor.js');
  renderRecipe();
  showView(mode);
}

export function showError(message) {
  const box = document.getElementById('error-box');
  box.textContent = message;
  box.hidden = false;
}

// ===== Start-Ansicht: Eingabewege =====
let pendingInput = null; // {type, value}
const $ = (id) => document.getElementById(id);

function showInputPanel(kind) {
  $('input-panel').hidden = false;
  $('text-input').hidden = kind !== 'text';
  $('url-input').hidden = kind !== 'url';
  $('error-box').hidden = true;
  ($(`${kind}-input`)).focus?.();
}

$('tile-text').addEventListener('click', () => showInputPanel('text'));
$('tile-url').addEventListener('click', () => showInputPanel('url'));
$('tile-photo').addEventListener('click', () => $('photo-input').click());

$('photo-input').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  try {
    pendingInput = { type: 'photo', value: await resizeImage(file) };
    runGenerate();
  } catch (err) {
    showError(err.message);
  } finally {
    e.target.value = '';
  }
});

$('btn-generate').addEventListener('click', () => {
  const url = $('url-input').hidden ? '' : $('url-input').value.trim();
  const text = $('text-input').hidden ? '' : $('text-input').value.trim();
  pendingInput = url ? { type: 'url', value: url } : { type: 'text', value: text };
  if (!pendingInput.value) return showError('Bitte erst ein Rezept eingeben.');
  runGenerate();
});

async function runGenerate() {
  const progress = $('progress');
  progress.hidden = false;
  $('error-box').hidden = true;
  $('btn-generate').disabled = true;
  try {
    const recipe = await generateRecipe(pendingInput, (msg) => { progress.textContent = msg; });
    storage.saveRecipe(recipe);
    await openRecipe(recipe, 'edit');
    countRecipeAndMaybeAsk(); // Spendenhinweis nach jedem 3. erstellten Rezept
  } catch (err) {
    showError(err.message);
  } finally {
    progress.hidden = true;
    $('btn-generate').disabled = false;
  }
}

// ===== Meine Rezepte =====
function renderMyRecipes() {
  const ul = $('my-recipes');
  ul.innerHTML = '';
  const recipes = storage.listRecipes();
  if (!recipes.length) {
    ul.innerHTML = '<li class="empty">Noch keine Rezepte gespeichert.</li>';
    return;
  }
  for (const r of recipes) {
    const li = document.createElement('li');
    li.className = 'my-recipe';
    const date = new Date(r.savedAt).toLocaleDateString('de-DE');
    li.innerHTML = `
      <button class="my-recipe-open">${escapeHtml(r.title)} <small>(${date})</small></button>
      <button class="my-recipe-publish" title="In die öffentliche Sammlung">${icon('upload')}</button>
      <button class="my-recipe-delete" title="Löschen">${icon('trash')}</button>`;
    li.querySelector('.my-recipe-open').addEventListener('click', () => openRecipe(storage.getRecipe(r.id), 'edit'));
    li.querySelector('.my-recipe-publish').addEventListener('click', () => openPublishDialog(storage.getRecipe(r.id)));
    li.querySelector('.my-recipe-delete').addEventListener('click', () => {
      if (confirm(`„${r.title}" wirklich löschen?`)) {
        storage.deleteRecipe(r.id);
        renderMyRecipes();
      }
    });
    ul.appendChild(li);
  }
}

export function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// ===== Drucken (Menü: Bildrezept / Vorbereitungsblatt) =====
/** window.print() tut in der iOS-App nichts — dort druckt die native Seite
 *  (UIPrintInteractionController) und feuert danach selbst 'afterprint'. */
function doPrint() {
  if (window.isNativeApp && window.webkit?.messageHandlers?.nativeApp) {
    window.webkit.messageHandlers.nativeApp.postMessage({ action: 'print' });
  } else {
    window.print();
  }
}

export function printWithClass(cls) {
  document.body.classList.add(cls);
  const done = () => {
    document.body.classList.remove(cls);
    window.removeEventListener('afterprint', done);
  };
  window.addEventListener('afterprint', done);
  doPrint();
}

$('nav-print').addEventListener('click', () => {
  if (App.recipe) $('print-dialog').showModal();
});
$('print-cancel').addEventListener('click', () => $('print-dialog').close());

$('print-recipe').addEventListener('click', async () => {
  $('print-dialog').close();
  // Wenn möglich, QR-Kurzlink auf den Bogen — offline einfach ohne drucken.
  try {
    const { shareRecipe, renderQr } = await import('./share.js');
    const { url } = await shareRecipe(App.recipe);
    renderQr($('print-qr'), url);
  } catch {
    $('print-qr').innerHTML = '';
  }
  doPrint();
});

$('print-shopping').addEventListener('click', async () => {
  $('print-dialog').close();
  (await import('./checklist.js')).printChecklist();
});

$('print-prep').addEventListener('click', async () => {
  const groups = Math.max(1, Math.min(20, parseInt($('print-groups').value, 10) || 1));
  const { buildPrepSheet } = await import('./sheets.js');
  $('prep-sheet').innerHTML = buildPrepSheet(App.recipe, groups);
  $('print-dialog').close();
  printWithClass('print-prep');
});

// ===== Teilen: ein Tipp → QR-Code + Link =====
$('nav-share').addEventListener('click', async () => {
  if (!App.recipe) return;
  $('share-qr').innerHTML = '<p class="dialog-hint">Link wird erstellt …</p>';
  $('share-url').textContent = '';
  $('share-dialog').showModal();
  try {
    const { shareRecipe, renderQr } = await import('./share.js');
    const { url } = await shareRecipe(App.recipe);
    renderQr($('share-qr'), url);
    $('share-url').textContent = url;
    $('share-native').hidden = !navigator.share;
    $('share-copy').onclick = async () => {
      await navigator.clipboard.writeText(url);
      $('share-copy').textContent = '✓ Kopiert';
      setTimeout(() => { $('share-copy').textContent = 'Link kopieren'; }, 1500);
    };
    $('share-native').onclick = () => navigator.share({ title: App.recipe.title, url });
  } catch (err) {
    $('share-qr').innerHTML = `<p class="dialog-hint">${escapeHtml(err.message)}</p>`;
  }
});
$('share-close').addEventListener('click', () => $('share-dialog').close());

// ===== Geteiltes Rezept laden (#r=…) =====
async function openSharedFromHash() {
  const m = location.hash.match(/^#r=([1-9A-HJ-NP-Za-km-z]{4,16})$/);
  if (!m) return;
  // Hash sofort aus der URL nehmen — sonst legt jeder Reload eine neue Kopie an
  history.replaceState(null, '', location.pathname + location.search);
  try {
    // Feste lokale ID pro geteiltem Rezept: kein Duplikat beim erneuten Öffnen
    const localId = `r-shared-${m[1]}`;
    let recipe = storage.getRecipe(localId);
    if (!recipe) {
      const { fetchSharedRecipe } = await import('./api.js');
      recipe = await fetchSharedRecipe(m[1]);
      recipe.id = localId;
      storage.saveRecipe(recipe);
    }
    await openRecipe(recipe, 'cook');
    const cm = await import('./cook-mode.js');
    cm.startCookMode();
    cm.setSchuelerMode(true); // per QR geöffnet → geschützte Kochansicht
  } catch (err) {
    showError(err.message);
  }
}

// ===== Einkaufs-/Bereitstellungsliste =====
$('btn-checklist').addEventListener('click', async () => {
  if (!App.recipe) return;
  (await import('./checklist.js')).openChecklist();
});

// ===== „Kochen": eine Ebene tiefer in die Kochansicht =====
// (Schüler-Modus weiterhin bewusst über den 🔒-Knopf in der Kochleiste)
$('btn-cook-start').addEventListener('click', async () => {
  if (!App.recipe) return;
  await openRecipe(App.recipe, 'cook');
  (await import('./cook-mode.js')).startCookMode();
});

// ===== Backup: Rezepte als Datei sichern und laden =====
$('btn-backup').addEventListener('click', () => {
  const recipes = storage.listRecipes();
  if (!recipes.length) return showError('Noch keine Rezepte zum Sichern.');
  const blob = new Blob([storage.buildBackup(recipes)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  const d = new Date();
  a.download = `bildrezepte-${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
});
$('btn-restore').addEventListener('click', () => $('restore-input').click());
$('restore-input').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  try {
    const recipes = storage.parseBackup(await file.text());
    let neu = 0, ersetzt = 0;
    for (const r of recipes) {
      storage.getRecipe(r.id) ? ersetzt++ : neu++;
      storage.saveRecipe(r);
    }
    renderMyRecipes();
    alert(`Geladen: ${neu} neue Rezepte, ${ersetzt} aktualisiert.`);
  } catch (err) {
    showError(err.message);
  }
});

// ===== Über Bildrezepte (Info-Dialog) =====
$('nav-info').addEventListener('click', () => $('info-dialog').showModal());
$('info-close').addEventListener('click', () => $('info-dialog').close());
$('info-spenden').addEventListener('click', () => {
  $('info-dialog').close();
  $('donate-dialog').showModal();
});
$('info-datenschutz').addEventListener('click', () => {
  $('info-dialog').close();
  $('datenschutz-dialog').showModal();
});
$('datenschutz-close').addEventListener('click', () => $('datenschutz-dialog').close());
$('footer-datenschutz').addEventListener('click', (e) => { e.preventDefault(); $('datenschutz-dialog').showModal(); });

// ===== Symbol-Lexikon-Verwaltung =====
$('btn-lexicon').addEventListener('click', async () => {
  const { listEntries, removeEntry } = await import('./symbol-lexicon.js');
  const { symbolSrc } = await import('./arasaac.js');
  const ul = $('lexicon-list');
  const render = () => {
    const entries = listEntries();
    ul.innerHTML = entries.length
      ? entries.map((e) => `
          <li class="lexicon-entry">
            <img src="${symbolSrc(e.symbol, 300)}" alt="">
            <span>${escapeHtml(e.word)}</span>
            <button class="lexicon-del" data-word="${escapeHtml(e.word)}" title="Eintrag löschen">×</button>
          </li>`).join('')
      : '<li class="dialog-hint">Noch keine angepassten Symbole.</li>';
  };
  ul.onclick = (e) => {
    if (!e.target.classList.contains('lexicon-del')) return;
    removeEntry(e.target.dataset.word);
    render();
  };
  render();
  $('lexicon-dialog').showModal();
});
$('lexicon-close').addEventListener('click', () => $('lexicon-dialog').close());

// ===== Navigation: Zurück geht genau eine Ebene hoch =====
$('nav-back').addEventListener('click', async () => {
  if (App.mode === 'cook') {
    (await import('./cook-mode.js')).stopCookMode();
    openRecipe(App.recipe, 'edit');
  } else {
    showView('start');
  }
});

// ===== Manuell speichern + Sicherheitsnetz beim Schließen =====
$('btn-save').addEventListener('click', async () => {
  const btn = $('btn-save');
  const original = btn.innerHTML;
  const { saveNow } = await import('./editor.js');
  saveNow();
  storage.saveRecipe(App.recipe, { dedupeTitle: true }); // gleichnamige Alt-Kopien ersetzen
  let label = 'Gespeichert';
  if (App.recipe?.published?.admin) {
    btn.innerHTML = 'Speichert in Sammlung …';
    btn.disabled = true;
    if (await syncCollectionAsAdmin({ quiet: false })) label = 'Gespeichert + Sammlung';
    btn.disabled = false;
  }
  btn.innerHTML = `${icon('check')}${label}`;
  setTimeout(() => { btn.innerHTML = original; }, 2000);
});
window.addEventListener('beforeunload', () => {
  if (App.mode === 'edit' && App.recipe) storage.saveRecipe(App.recipe);
});

showView('start');
openSharedFromHash();
