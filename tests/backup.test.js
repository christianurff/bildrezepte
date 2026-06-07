import test from 'node:test';
import assert from 'node:assert/strict';

globalThis.localStorage = {
  _s: {}, getItem(k) { return this._s[k] ?? null; },
  setItem(k, v) { this._s[k] = v; }, removeItem(k) { delete this._s[k]; },
};

const { buildBackup, parseBackup, saveRecipe, getRecipe, listRecipes } = await import('../js/storage.js');

test('Backup-Roundtrip: Rezepte rein und wieder raus', () => {
  const recipes = [
    { id: 'r-1', title: 'Pfannkuchen', servingsBase: 4, servings: 4, ingredients: [], tools: [], steps: [{ id: 's1', chunks: [] }] },
    { id: 'r-2', title: 'Pommes', servingsBase: 2, servings: 2, ingredients: [], tools: [], steps: [{ id: 's1', chunks: [] }] },
  ];
  const text = buildBackup(recipes);
  const parsed = parseBackup(text);
  assert.equal(parsed.length, 2);
  assert.equal(parsed[1].title, 'Pommes');
});

test('saveRecipe: gleicher Titel überschreibt bestehende Kopien (andere ID)', () => {
  localStorage._s = {};
  // Gleiches Rezept kam zweimal ins Gerät: generiert (r-abc) und aus der Sammlung (r-coll-1)
  saveRecipe({ id: 'r-abc', title: 'Schnelle Muffins', steps: [] });
  saveRecipe({ id: 'r-coll-1', title: 'schnelle muffins ', steps: [], published: { id: 'p1', admin: true } });
  assert.equal(listRecipes().length, 1, 'nur eine Kopie pro Titel');
  assert.equal(listRecipes()[0].id, 'r-coll-1', 'die zuletzt gespeicherte gewinnt');
  // Veröffentlichungs-Bezug überlebt, wenn die ältere Kopie ihn trug
  const neu = { id: 'r-neu', title: 'Schnelle Muffins', steps: [] };
  saveRecipe(neu);
  assert.equal(listRecipes().length, 1);
  assert.equal(getRecipe('r-neu').published?.id, 'p1', 'published-Bezug geerbt');
  assert.equal(neu.published?.id, 'p1', 'auch am übergebenen Objekt (App.recipe)');
  // Andere Titel bleiben unangetastet
  saveRecipe({ id: 'r-2', title: 'Pommes', steps: [] });
  assert.equal(listRecipes().length, 2);
  // Umbenennen eines BESTEHENDEN Rezepts auf einen vergebenen Titel löscht nichts
  // (sonst würde beim Tippen „Pizzateig" ein vorhandenes „Pizza" verschwinden)
  saveRecipe({ id: 'r-2', title: 'Schnelle Muffins', steps: [] });
  assert.equal(listRecipes().length, 2, 'Tipp-Zwischenspeichern räumt nicht auf');
  // Aber beim bewussten Speichern (Editor verlassen / Speichern-Knopf) schon
  saveRecipe({ id: 'r-2', title: 'Schnelle Muffins', steps: [] }, { dedupeTitle: true });
  assert.equal(listRecipes().length, 1, 'dedupeTitle ersetzt gleichnamige Alt-Kopien');
  assert.equal(listRecipes()[0].id, 'r-2');
});

test('parseBackup: lehnt fremde/kaputte Dateien verständlich ab', () => {
  assert.throws(() => parseBackup('kein json'), /keine Bildrezepte-Datei/);
  assert.throws(() => parseBackup('{"foo":1}'), /keine Bildrezepte-Datei/);
  assert.throws(() => parseBackup(JSON.stringify({ format: 'bildrezepte-backup', version: 1, recipes: [{ title: 'ohne id' }] })), /unvollständig/);
});
