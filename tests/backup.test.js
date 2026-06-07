import test from 'node:test';
import assert from 'node:assert/strict';

globalThis.localStorage = {
  _s: {}, getItem(k) { return this._s[k] ?? null; },
  setItem(k, v) { this._s[k] = v; }, removeItem(k) { delete this._s[k]; },
};

const { buildBackup, parseBackup } = await import('../js/storage.js');

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

test('parseBackup: lehnt fremde/kaputte Dateien verständlich ab', () => {
  assert.throws(() => parseBackup('kein json'), /keine Bildrezepte-Datei/);
  assert.throws(() => parseBackup('{"foo":1}'), /keine Bildrezepte-Datei/);
  assert.throws(() => parseBackup(JSON.stringify({ format: 'bildrezepte-backup', version: 1, recipes: [{ title: 'ohne id' }] })), /unvollständig/);
});
