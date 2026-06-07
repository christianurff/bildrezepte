import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeTerm } from '../js/symbol-lexicon.js';

test('normalizeTerm: kleingeschrieben, Artikel entfernt', () => {
  assert.equal(normalizeTerm('die Schüssel'), 'schüssel');
  assert.equal(normalizeTerm('Ein Löffel '), 'löffel');
  assert.equal(normalizeTerm('Mehl'), 'mehl');
  assert.equal(normalizeTerm(''), '');
});
