// „Meine Rezepte" + Kochfortschritt in localStorage.
const INDEX_KEY = 'bildrezept_recipes';

function index() {
  try { return JSON.parse(localStorage.getItem(INDEX_KEY)) || {}; } catch { return {}; }
}

export function listRecipes() {
  return Object.values(index()).sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0));
}
export function saveRecipe(recipe) {
  const all = index();
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
