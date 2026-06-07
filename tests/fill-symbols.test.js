import test from 'node:test';
import assert from 'node:assert/strict';

// localStorage-Shim, bevor arasaac.js (→ symbol-lexicon.js) geladen wird
globalThis.localStorage = {
  _s: {},
  getItem(k) { return this._s[k] ?? null; },
  setItem(k, v) { this._s[k] = v; },
  removeItem(k) { delete this._s[k]; },
};

const { fillChunkSymbolsFromItems } = await import('../js/arasaac.js');

test('Schritt-Wörter erben Symbole von Hilfsmitteln/Zutaten', () => {
  const topfSymbol = { type: 'arasaac', arasaacId: 111, alternatives: [111] };
  const recipe = {
    ingredients: [{ id: 'z1', name: 'Nudeln', search: ['Nudeln'], symbol: { type: 'arasaac', arasaacId: 222 } }],
    tools: [{ id: 'h1', name: 'Topf', search: ['Topf'], symbol: topfSymbol }],
    steps: [{
      id: 's1',
      chunks: [
        { text: 'Koche', search: ['kochen'], symbol: { type: 'arasaac', arasaacId: 333 } },
        { text: 'in', search: [], symbol: null },          // Funktionswort → bleibt leer
        { text: 'einem Topf', search: [], symbol: null },  // erbt vom Hilfsmittel
      ],
    }],
  };
  const changed = fillChunkSymbolsFromItems(recipe);
  assert.equal(changed, true);
  assert.equal(recipe.steps[0].chunks[2].symbol.arasaacId, 111);
  assert.equal(recipe.steps[0].chunks[1].symbol, null);
  assert.equal(recipe.steps[0].chunks[0].symbol.arasaacId, 333); // unverändert
  // Idempotent: zweiter Lauf ändert nichts mehr
  assert.equal(fillChunkSymbolsFromItems(recipe), false);
});

test('Bewusst entfernte Bilder (noSymbol) werden nicht wieder aufgefüllt', () => {
  const recipe = {
    ingredients: [],
    tools: [{ id: 'h1', name: 'Schüssel', search: ['Schüssel'], symbol: { type: 'arasaac', arasaacId: 444 } }],
    steps: [{
      id: 's1',
      chunks: [
        // Nutzer hat das Bild entfernt — Wort matcht trotzdem das Hilfsmittel
        { text: 'die Schüssel', search: ['Schüssel'], symbol: null, noSymbol: true },
      ],
    }],
  };
  const changed = fillChunkSymbolsFromItems(recipe);
  assert.equal(changed, false);
  assert.equal(recipe.steps[0].chunks[0].symbol, null);
});
