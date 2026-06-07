// „Meine Rezepte" + Kochfortschritt in localStorage.
const INDEX_KEY = 'bildrezept_recipes';

function index() {
  try { return JSON.parse(localStorage.getItem(INDEX_KEY)) || {}; } catch { return {}; }
}

export function listRecipes() {
  return Object.values(index()).sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0));
}
const normTitle = (t) => String(t || '').toLowerCase().trim();

/**
 * Gleicher Titel = gleiches Rezept: Beim ERSTEN Speichern einer neuen Kopie
 * (neu generiert, aus Sammlung/QR geöffnet, aus Backup) werden bestehende
 * Einträge mit demselben Titel ersetzt — sonst sammeln sich Dubletten.
 * Optional mit Rückfrage (Einstellung); Standard ist stilles Überschreiben.
 * Bewusst NICHT beim Bearbeiten bestehender Rezepte: Umbenennen während des
 * Tippens dürfte sonst fremde Rezepte löschen.
 */
function dropSameTitle(all, recipe) {
  const doppelte = Object.values(all)
    .filter((r) => r.id !== recipe.id && normTitle(r.title) === normTitle(recipe.title));
  if (!doppelte.length) return;
  const fragen = localStorage.getItem('bildrezept_set_overwrite_fragen') === '1'
    && typeof confirm === 'function';
  if (fragen && !confirm(`Es gibt schon ein Rezept „${doppelte[0].title}“. Überschreiben?`)) return;
  for (const d of doppelte) {
    // Sammlungs-/Veröffentlichungs-Bezug der alten Kopie erben
    if (!recipe.published && d.published) recipe.published = d.published;
    delete all[d.id];
    localStorage.removeItem(`bildrezept_progress_${d.id}`);
  }
}

export function saveRecipe(recipe, { dedupeTitle = false } = {}) {
  const all = index();
  // Dubletten ersetzen: immer bei einer NEUEN Kopie, sonst nur auf Wunsch
  // (Editor-Verlassen / Speichern-Knopf) — nie beim Tipp-Zwischenspeichern.
  if (dedupeTitle || !all[recipe.id]) dropSameTitle(all, recipe);
  all[recipe.id] = { ...recipe, savedAt: Date.now() };
  localStorage.setItem(INDEX_KEY, JSON.stringify(all));
}
export function getRecipe(id) { return index()[id] || null; }
export function deleteRecipe(id) {
  const all = index();
  delete all[id];
  localStorage.setItem(INDEX_KEY, JSON.stringify(all));
  localStorage.removeItem(`bildrezept_progress_${id}`);
}

// ===== Backup als Datei (Export/Import) — Schutz vor localStorage-Verlust =====
export function buildBackup(recipes) {
  return JSON.stringify({ format: 'bildrezepte-backup', version: 1, recipes }, null, 1);
}

export function parseBackup(text) {
  let data;
  try { data = JSON.parse(text); } catch { data = null; }
  if (!data || data.format !== 'bildrezepte-backup' || !Array.isArray(data.recipes)) {
    throw new Error('Das ist keine Bildrezepte-Datei.');
  }
  for (const r of data.recipes) {
    if (!r.id || !r.title || !Array.isArray(r.steps)) {
      throw new Error('Die Datei ist unvollständig oder beschädigt.');
    }
  }
  return data.recipes;
}

export function getProgress(recipeId) {
  try { return JSON.parse(localStorage.getItem(`bildrezept_progress_${recipeId}`)) || { index: 0, done: [] }; }
  catch { return { index: 0, done: [] }; }
}
export function saveProgress(recipeId, progress) {
  localStorage.setItem(`bildrezept_progress_${recipeId}`, JSON.stringify(progress));
}
