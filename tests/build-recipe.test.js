import test from 'node:test';
import assert from 'node:assert/strict';
import { buildRecipeFromAi, stepText, recipeSummaryText, STEP_FLAGS, parseStepMinutes } from '../js/recipe-model.js';

const ai = {
  title: 'Pfannkuchen',
  servingsBase: 4,
  ingredients: [
    { qty: { value: 200, unit: 'g' }, name: 'Mehl', nameSingular: '', search: ['Mehl'] },
    { qty: { value: 3, unit: 'stueck' }, name: 'Eier', nameSingular: 'Ei', search: ['Ei'] },
  ],
  tools: [{ name: 'Schüssel', search: ['Schüssel'] }],
  steps: [
    { chunks: [
      { text: 'Wiege', search: ['wiegen', 'Waage'] },
      { ref: 0 },
      { text: 'ab', search: [] },
    ] },
    { chunks: [
      { text: 'Gib', search: ['geben'] },
      { text: 'das Mehl', search: ['Mehl'] },
      { arrow: true, text: 'in' },
      { text: 'die Schüssel', search: ['Schüssel'] },
    ] },
  ],
};

test('buildRecipeFromAi erzeugt IDs und übernimmt Struktur', () => {
  const r = buildRecipeFromAi(ai);
  assert.equal(r.title, 'Pfannkuchen');
  assert.equal(r.servings, 4);                       // startet bei servingsBase
  assert.equal(r.ingredients[0].id, 'z1');
  assert.equal(r.tools[0].id, 'h1');
  assert.equal(r.steps[0].id, 's1');
  assert.equal(r.steps[0].chunks[1].qtyRef, 'z1');   // ref-Index → ID
  assert.equal(r.steps[1].chunks[2].arrow, true);
  assert.equal(r.ingredients[0].symbol, null);        // Symbole kommen später
});

test('stepText setzt Mengen skaliert in den Satz ein', () => {
  const r = buildRecipeFromAi(ai);
  assert.equal(stepText(r, r.steps[0]), 'Wiege 200 Gramm Mehl ab.');
  r.servings = 6;
  assert.equal(stepText(r, r.steps[0]), 'Wiege 300 Gramm Mehl ab.');
});

test('Pfeil-Chunk: Wort wird gesprochen, Pfeil ist nur Bild', () => {
  const r = buildRecipeFromAi(ai);
  assert.equal(stepText(r, r.steps[1]), 'Gib das Mehl in die Schüssel.');
});

test('recipeSummaryText: Klartext für KI-Prüfung und Vorschau', () => {
  const r = buildRecipeFromAi(ai);
  const s = recipeSummaryText(r);
  assert.match(s, /^Pfannkuchen \(für 4 Personen\)/);
  assert.match(s, /Zutaten: 200 Gramm Mehl, 3 Eier/);
  assert.match(s, /Hilfsmittel: Schüssel/);
  assert.match(s, /1\. Wiege 200 Gramm Mehl ab\./);
  assert.match(s, /2\. Gib das Mehl in die Schüssel\./);
});

test('Schritt-Marker: nur festes Vokabular, max. 2, Notiz nie von der KI', () => {
  const withFlags = { ...ai, steps: [
    { chunks: [{ text: 'Schneide', search: ['schneiden'] }], flags: ['scharf', 'quatsch', 'heiss', 'hilfe'], note: 'KI-Notiz' },
  ] };
  const r = buildRecipeFromAi(withFlags);
  assert.deepEqual(r.steps[0].flags, ['scharf', 'heiss']);  // Unbekanntes raus, max. 2 (Frage 3: „wenig")
  assert.equal(r.steps[0].note, '');                        // Notizen schreibt nur die Lehrkraft
  assert.ok(STEP_FLAGS.scharf && STEP_FLAGS.heiss && STEP_FLAGS.hilfe);
});

test('parseStepMinutes: erkennt Zeitangaben im Schritttext', () => {
  assert.equal(parseStepMinutes('Stelle den Timer auf 20 Minuten.'), 20);
  assert.equal(parseStepMinutes('Backe alles 1 Stunde.'), 60);
  assert.equal(parseStepMinutes('Warte 5 Min.'), 5);
  assert.equal(parseStepMinutes('Rühre alles um.'), null);
});

test('wirft bei kaputtem JSON verständliche Fehler', () => {
  assert.throws(() => buildRecipeFromAi({}), /Titel/);
  assert.throws(() => buildRecipeFromAi({ ...ai, steps: [] }), /Schritte/);
  assert.throws(() => buildRecipeFromAi({
    ...ai,
    ingredients: [{ qty: { value: 2, unit: 'tasse' }, name: 'X', search: [] }],
  }), /Einheit/);
});
