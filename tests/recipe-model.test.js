import test from 'node:test';
import assert from 'node:assert/strict';
import { scaleValue, formatQty, scaledQty, parseQtyValue } from '../js/recipe-model.js';

test('Gramm: unter 100 g auf 5 g runden', () => {
  assert.equal(scaleValue(30, 'g', 1.5), 45);
  assert.equal(scaleValue(33, 'g', 1.5), 50);   // 49,5 → 50
});
test('Gramm: ab 100 g auf 10 g runden', () => {
  assert.equal(scaleValue(130, 'g', 1.5), 200); // 195 → 200
});
test('Milliliter: auf 10 ml, ab 250 ml auf 25 ml', () => {
  assert.equal(scaleValue(120, 'ml', 1.5), 180);
  assert.equal(scaleValue(200, 'ml', 1.5), 300); // 300 ≥ 250 → 25er-Schritt
});
test('Löffel: halbe erlaubt, Minimum ½', () => {
  assert.equal(scaleValue(1, 'el', 1.5), 1.5);
  assert.equal(scaleValue(1, 'el', 0.25), 0.5);
});
test('Stück und Päckchen: ganzzahlig, Minimum 1', () => {
  assert.equal(scaleValue(3, 'stueck', 1.5), 5);  // 4,5 → 5
  assert.equal(scaleValue(1, 'pck', 0.5), 1);
});
test('Prise: skaliert erst ab Faktor 3', () => {
  assert.equal(scaleValue(1, 'prise', 2), 1);
  assert.equal(scaleValue(1, 'prise', 3), 2);
});
test('Faktor 1 verändert nichts', () => {
  assert.equal(scaleValue(33, 'g', 1), 33);
});
test('formatQty: keine Kommazahlen, kindgerechte Einheiten', () => {
  assert.equal(formatQty({ value: 200, unit: 'g' }, 'Mehl'), '200 Gramm Mehl');
  assert.equal(formatQty({ value: 0.5, unit: 'el' }, 'Öl'), 'ein halber großer Löffel Öl');
  assert.equal(formatQty({ value: 1.5, unit: 'tl' }, 'Salz'), '1 ½ kleine Löffel Salz');
  assert.equal(formatQty({ value: 1, unit: 'prise' }, 'Salz'), '1 Prise Salz');
  assert.equal(formatQty({ value: 3, unit: 'stueck' }, 'Eier', 'Ei'), '3 Eier');
  assert.equal(formatQty({ value: 1, unit: 'stueck' }, 'Eier', 'Ei'), '1 Ei');
});
test('formatQty: Akkusativ für Löffel in Sätzen', () => {
  assert.equal(formatQty({ value: 1, unit: 'el' }, 'Butter', '', { akk: true }), '1 großen Löffel Butter');
  assert.equal(formatQty({ value: 0.5, unit: 'tl' }, 'Salz', '', { akk: true }), 'einen halben kleinen Löffel Salz');
  assert.equal(formatQty({ value: 200, unit: 'g' }, 'Mehl', '', { akk: true }), '200 Gramm Mehl');
});

test('parseQtyValue: akzeptiert Brüche, Komma und Zahlen — nie NaN', () => {
  assert.equal(parseQtyValue(0.5), 0.5);
  assert.equal(parseQtyValue('0,5'), 0.5);
  assert.equal(parseQtyValue('1/2'), 0.5);
  assert.equal(parseQtyValue('1 1/2'), 1.5);
  assert.equal(parseQtyValue('½'), 0.5);
  assert.equal(parseQtyValue('2'), 2);
  assert.equal(parseQtyValue('abc'), null);
  assert.equal(parseQtyValue(''), null);
  assert.equal(parseQtyValue(NaN), null);
});

test('formatQty: zeigt nie NaN an', () => {
  assert.ok(!formatQty({ value: NaN, unit: 'el' }, 'Öl').includes('NaN'));
  assert.ok(!formatQty({ value: NaN, unit: 'stueck' }, 'Eier').includes('NaN'));
});

test('scaledQty: nutzt servings/servingsBase', () => {
  const recipe = { servingsBase: 4, servings: 6 };
  assert.deepEqual(scaledQty(recipe, { value: 200, unit: 'g' }), { value: 300, unit: 'g' });
});
