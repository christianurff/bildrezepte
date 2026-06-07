// Rezept-Rendering (Editor + Kochmodus nutzen dieselbe Liste) und Bearbeitung.
import { App, escapeHtml } from './app.js';
import { scaledQty, formatQty, chunkText, ingredientById, parseQtyValue } from './recipe-model.js';
import { symbolSrc, searchIds, imageUrl, termsFor, getUnitSymbol, setUnitSymbol, unitSearchTerms, resolveSymbol } from './arasaac.js';
import { icon, FLAG_ICONS } from './icons.js';
import { STEP_FLAGS, MAX_FLAGS } from './recipe-model.js';
import { showFlags, showMengenbilder } from './settings.js';
import { routineChips, setRoutine, hasRoutine } from './routines.js';
import { getChecks, saveChecks } from './checklist.js';
import { rememberSymbol } from './symbol-lexicon.js';
import { resizeImage } from './generate.js';
import { saveRecipe } from './storage.js';

const $ = (id) => document.getElementById(id);
const isEdit = () => App.mode === 'edit';

export function renderRecipe() {
  const r = App.recipe;
  const title = $('recipe-title');
  title.textContent = r.title;
  title.contentEditable = isEdit() ? 'plaintext-only' : 'false';
  $('servings-value').textContent = r.servings;
  // Admin: Speichern schreibt auch die öffentliche Sammlung — am Knopf sichtbar machen
  $('btn-save').innerHTML = icon('save') + (r.published?.admin ? 'Speichern + Sammlung' : 'Speichern');
  renderCards('ingredients', r.ingredients, (ing) =>
    formatQty(scaledQty(r, ing.qty), ing.name, ing.nameSingular));
  renderCards('tools', r.tools, (t) => t.name);
  renderSteps();
  $('routines-chips').innerHTML = routineChips(r);
  $('finished-card').hidden = true;
}

// Routine-Bausteine an-/abwählen (nur Edit-Modus sichtbar, siehe CSS)
$('routines-chips').addEventListener('click', async (e) => {
  const chip = e.target.closest('.routine-chip');
  if (!chip || !isEdit()) return;
  const key = chip.dataset.routine;
  chip.disabled = true;
  await setRoutine(App.recipe, key, !hasRoutine(App.recipe, key));
  persistAndRender();
});

function renderCards(containerId, items, labelFn) {
  const el = $(containerId);
  el.innerHTML = '';
  // Im Kochmodus sind die Karten abhakbar (Einkaufen/Bereitstellen) —
  // gleicher Speicher wie die Einkaufsliste, beide bleiben synchron.
  const checks = App.mode === 'cook' ? getChecks(App.recipe.id) : {};
  for (const item of items) {
    const card = document.createElement('div');
    card.className = 'symbol-card' + (checks[item.id] ? ' done' : '');
    card.dataset.id = item.id;
    const label = labelFn(item);
    card.innerHTML = `
      <img class="card-symbol" src="${symbolSrc(item.symbol)}" alt="" data-id="${item.id}">
      <span class="card-label${label.length > 24 ? ' long' : ''}" data-id="${item.id}">${escapeHtml(label)}</span>`;
    el.appendChild(card);
  }
  if (isEdit()) {
    const add = document.createElement('button');
    add.className = 'symbol-card card-add';
    add.textContent = '＋';
    add.title = containerId === 'ingredients' ? 'Zutat hinzufügen' : 'Hilfsmittel hinzufügen';
    add.addEventListener('click', () => addItem(containerId));
    el.appendChild(add);
  }
}

export function renderSteps() {
  const r = App.recipe;
  const ol = $('steps');
  ol.innerHTML = '';
  r.steps.forEach((step, i) => {
    const li = document.createElement('li');
    li.className = 'step';
    li.dataset.id = step.id;
    const tools = isEdit() ? `
      <button class="step-up" title="nach oben">↑</button>
      <button class="step-down" title="nach unten">↓</button>
      <button class="step-add" title="Schritt danach einfügen">＋</button>
      <button class="step-flag" title="Marker und Notiz">${icon('shield')}</button>
      <button class="step-del" title="Schritt löschen">${icon('trash')}</button>` : '';
    // Ruhige, immer gleiche Sicherheits-Symbole unter der Schrittnummer (max. 2),
    // über die Anzeige-Einstellungen abschaltbar
    const flags = (showFlags() ? (step.flags || []) : []).map((f) =>
      `<span class="flag-badge" title="${escapeHtml(STEP_FLAGS[f]?.label || f)}">${icon(FLAG_ICONS[f])}</span>`).join('');
    const note = isEdit() && step.note
      ? `<span class="step-note">Notiz: ${escapeHtml(step.note)}</span>` : '';
    const chunkAdd = isEdit() ? `<button class="chunk-add" title="Wortgruppe hinzufügen">＋</button>` : '';
    // Im Edit-Modus vor jeder Wortgruppe ein schmaler Einfügen-Knopf
    const insertBtn = (ci) => isEdit() ? `<button class="chunk-insert" data-chunk="${ci}" title="Hier Wortgruppe einfügen">＋</button>` : '';
    li.innerHTML = `
      <span class="step-side"><span class="step-badge">${i + 1}</span>${flags}</span>
      <span class="step-main">
        <span class="step-chunks">${step.chunks.map((c, ci) => insertBtn(ci) + renderChunk(r, step, c, ci)).join('')}${chunkAdd}</span>
        ${note}
      </span>
      <span class="step-tools">${tools}</span>
      <span class="step-check"></span>`;
    ol.appendChild(li);
  });
}

function chunkSymbol(r, chunk) {
  if (chunk.arrow) return null;
  return chunk.qtyRef ? ingredientById(r, chunk.qtyRef)?.symbol : chunk.symbol;
}

function renderChunk(r, step, chunk, ci) {
  const del = isEdit() ? `<button class="chunk-del" data-chunk="${ci}" title="entfernen">×</button>` : '';
  if (chunk.arrow) {
    // Wort (z.B. „in") über dem Pfeil — aber nur mit Pfeil, wenn danach
    // noch ein Bild folgt; sonst bleibt nur das Wort.
    const editable = isEdit() ? ' contenteditable="plaintext-only"' : '';
    const followsSymbol = step.chunks.slice(ci + 1).some((c) => chunkSymbol(r, c));
    const arrow = followsSymbol ? '<span class="chunk-arrow">→</span>' : '';
    return `<span class="chunk" data-chunk="${ci}">
      <span class="chunk-text" data-chunk="${ci}"${editable}>${escapeHtml(chunk.text || '')}</span>${arrow}${del}</span>`;
  }
  // Mengen-Chunk mit Löffel-/Becher-Einheit: zwei Bildkarten
  // („1 großen Löffel" [Löffel] + „Öl" [Öl]) — wie in der METACOM-Vorlage.
  if (chunk.qtyRef) {
    const ing = ingredientById(r, chunk.qtyRef);
    if (!ing) return '';
    const q = scaledQty(r, ing.qty);
    const unitSym = getUnitSymbol(q.unit);
    const ingImg = ing.symbol ? `<img class="chunk-symbol" src="${symbolSrc(ing.symbol)}" alt="" data-chunk="${ci}">` : '';
    // Mengen-Veranschaulichung (Einstellung): ganze Anzahl 2-6 als wiederholte Bilder
    const anzahl = showMengenbilder() && Number.isInteger(q.value) && q.value >= 2 && q.value <= 6 ? q.value : 1;
    if (unitSym && unitSym.type !== 'placeholder') {
      const amount = formatQty(q, '', '', { akk: true });
      const unitImg = `<img class="chunk-symbol${anzahl > 1 ? ' mini' : ''} chunk-symbol-unit" src="${symbolSrc(unitSym)}" alt="" data-chunk="${ci}" data-unit="${q.unit}">`;
      return `<span class="chunk" data-chunk="${ci}">
        <span class="chunk-text chunk-qty" data-chunk="${ci}">${escapeHtml(amount)}</span>
        <span class="multi-row">${unitImg.repeat(anzahl)}</span>
      </span><span class="chunk" data-chunk="${ci}">
        <span class="chunk-text chunk-qty" data-chunk="${ci}">${escapeHtml(ing.name)}</span>${ingImg}${del}</span>`;
    }
    if (q.unit === 'stueck' && anzahl > 1 && ing.symbol) {
      const mini = `<img class="chunk-symbol mini" src="${symbolSrc(ing.symbol)}" alt="" data-chunk="${ci}">`;
      return `<span class="chunk" data-chunk="${ci}">
        <span class="chunk-text chunk-qty" data-chunk="${ci}">${escapeHtml(chunkText(r, chunk))}</span>
        <span class="multi-row">${mini.repeat(anzahl)}</span>${del}</span>`;
    }
    return `<span class="chunk" data-chunk="${ci}">
      <span class="chunk-text chunk-qty" data-chunk="${ci}">${escapeHtml(chunkText(r, chunk))}</span>${ingImg}${del}</span>`;
  }
  const sym = chunkSymbol(r, chunk);
  // Bild und Text sind getrennt löschbar: × am Bild entfernt nur das Symbol,
  // × am Text nur den Text — ist beides weg, verschwindet die Wortgruppe.
  const symDel = isEdit() && sym
    ? `<button class="symbol-del" data-chunk="${ci}" title="Bild entfernen">×</button>` : '';
  const img = sym
    ? `<span class="chunk-img-wrap"><img class="chunk-symbol" src="${symbolSrc(sym)}" alt="" data-chunk="${ci}">${symDel}</span>` : '';
  const addSym = isEdit() && !sym
    ? `<button class="chunk-symbol-add" data-chunk="${ci}" title="Bild hinzufügen">＋</button>` : '';
  const textDel = isEdit() ? `<button class="text-del" data-chunk="${ci}" title="Text entfernen">×</button>` : '';
  const editable = isEdit() ? ' contenteditable="plaintext-only"' : '';
  return `<span class="chunk" data-chunk="${ci}">
    <span class="chunk-text-wrap"><span class="chunk-text" data-chunk="${ci}"${editable}>${escapeHtml(chunkText(r, chunk))}</span>${textDel}</span>${img}${addSym}</span>`;
}

// Merker: Gab es seit dem letzten Sammlungs-Abgleich inhaltliche Änderungen?
let dirty = false;
export const isDirty = () => dirty;
export const clearDirty = () => { dirty = false; };

export function persistAndRender() {
  persist();
  renderRecipe();
}

function persist() {
  dirty = true;
  saveRecipe(App.recipe);
}

// ===== Personen-Stepper =====
$('servings-minus').addEventListener('click', () => changeServings(-1));
$('servings-plus').addEventListener('click', () => changeServings(1));

function changeServings(delta) {
  const r = App.recipe;
  r.servings = Math.max(1, Math.min(99, r.servings + delta));
  persistAndRender();
}

// ===== Live-Speichern: jeder Tastendruck geht sofort ins Modell, =====
// ===== gespeichert wird entprellt (und zusätzlich bei Moduswechsel) =====
let persistTimer = null;
function schedulePersist() {
  clearTimeout(persistTimer);
  persistTimer = setTimeout(persist, 400);
}

/** Sofort speichern (z.B. Speichern-Knopf, Moduswechsel). */
export function saveNow() {
  clearTimeout(persistTimer);
  if (App.recipe) persist();
}

// ===== Titel bearbeiten =====
$('recipe-title').addEventListener('input', (e) => {
  const t = e.target.textContent.trim();
  if (t) { App.recipe.title = t; schedulePersist(); }
});
$('recipe-title').addEventListener('focusout', (e) => {
  if (!e.target.textContent.trim()) e.target.textContent = App.recipe.title;
});

// ===== Schritte: Bearbeitung per Event-Delegation =====
const stepsEl = $('steps');

function findStep(target) {
  const li = target.closest('.step');
  if (!li) return {};
  const r = App.recipe;
  const si = r.steps.findIndex((s) => s.id === li.dataset.id);
  return { li, si, step: r.steps[si] };
}

stepsEl.addEventListener('input', (e) => {
  if (!e.target.classList?.contains('chunk-text') || e.target.classList.contains('chunk-qty')) return;
  const { step } = findStep(e.target);
  if (!step) return;
  const chunk = step.chunks[Number(e.target.dataset.chunk)];
  if (!chunk) return;
  chunk.text = e.target.textContent.trim();
  schedulePersist();
});

stepsEl.addEventListener('click', (e) => {
  if (!isEdit()) return;
  // closest(): Klicks auf SVG-Icons IN den Knöpfen treffen sonst das SVG statt des Knopfes
  const t = e.target.closest('.chunk-del, .text-del, .symbol-del, .chunk-insert, .chunk-add, .step-up, .step-down, .step-add, .step-del, .chunk-qty');
  if (!t) return;
  const { si, step } = findStep(t);
  if (step === undefined) return;
  const r = App.recipe;

  if (t.classList.contains('chunk-del')) {
    step.chunks.splice(Number(t.dataset.chunk), 1);
    persistAndRender();
  } else if (t.classList.contains('text-del')) {
    const ci2 = Number(t.dataset.chunk);
    const chunk = step.chunks[ci2];
    chunk.text = '';
    if (!chunk.symbol) step.chunks.splice(ci2, 1); // ohne Bild bleibt nichts übrig
    persistAndRender();
  } else if (t.classList.contains('symbol-del')) {
    const ci2 = Number(t.dataset.chunk);
    const chunk = step.chunks[ci2];
    chunk.symbol = null;
    chunk.noSymbol = true; // bewusst entfernt — beim Öffnen nicht wieder auffüllen
    if (!chunk.text) step.chunks.splice(ci2, 1);
    persistAndRender();
  } else if (t.classList.contains('chunk-insert')) {
    openChunkAdd(step, Number(t.dataset.chunk));
  } else if (t.classList.contains('chunk-add')) {
    openChunkAdd(step, step.chunks.length);
  } else if (t.classList.contains('step-up') && si > 0) {
    [r.steps[si - 1], r.steps[si]] = [r.steps[si], r.steps[si - 1]];
    persistAndRender();
  } else if (t.classList.contains('step-down') && si < r.steps.length - 1) {
    [r.steps[si + 1], r.steps[si]] = [r.steps[si], r.steps[si + 1]];
    persistAndRender();
  } else if (t.classList.contains('step-add')) {
    r.steps.splice(si + 1, 0, { id: `s-${Date.now()}`, chunks: [{ text: 'Neuer Schritt', search: [], symbol: null }] });
    persistAndRender();
    focusChunk(r.steps[si + 1].id, 0);
  } else if (t.classList.contains('step-flag')) {
    openFlagsDialog(step);
  } else if (t.classList.contains('step-del')) {
    if (confirm('Diesen Schritt wirklich löschen?')) {
      r.steps.splice(si, 1);
      persistAndRender();
    }
  } else if (t.classList.contains('chunk-qty')) {
    const chunk = step.chunks[Number(t.dataset.chunk)];
    const ing = ingredientById(r, chunk.qtyRef);
    if (ing) openItemDialog('ingredients', ing.id);
  }
});

function focusChunk(stepId, ci) {
  const el = stepsEl.querySelector(`.step[data-id="${stepId}"] .chunk-text[data-chunk="${ci}"]`);
  if (!el) return;
  el.focus();
  const range = document.createRange();
  range.selectNodeContents(el);
  getSelection().removeAllRanges();
  getSelection().addRange(range);
}

// ===== „Was einfügen?": Text, Menge (rechnet mit), Zeit mit Timer, Pfeil =====
let pendingInsert = null; // { step, index }

function openChunkAdd(step, index) {
  pendingInsert = { step, index };
  $('chunk-add-main').hidden = false;
  $('chunk-add-qty').hidden = true;
  $('chunk-add-time').hidden = true;
  $('chunk-add-dialog').showModal();
}

function insertChunk(chunk, focus = false) {
  const { step, index } = pendingInsert;
  step.chunks.splice(index, 0, chunk);
  $('chunk-add-dialog').close();
  persistAndRender();
  if (focus) focusChunk(step.id, index);
}

$('ca-text').addEventListener('click', () => insertChunk({ text: 'neu', search: [], symbol: null }, true));
$('ca-arrow').addEventListener('click', () => insertChunk({ arrow: true, text: 'in' }));
$('ca-cancel').addEventListener('click', () => $('chunk-add-dialog').close());

$('ca-qty').addEventListener('click', () => {
  $('ca-qty-list').innerHTML = App.recipe.ingredients.map((z) => `
    <button type="button" class="flag-toggle" data-zutat="${z.id}">
      <img class="ca-zutat-bild" src="${symbolSrc(z.symbol)}" alt="">
      ${escapeHtml(formatQty(scaledQty(App.recipe, z.qty), z.name, z.nameSingular))}
    </button>`).join('') || '<p class="dialog-hint">Keine Zutaten im Rezept.</p>';
  $('chunk-add-main').hidden = true;
  $('chunk-add-qty').hidden = false;
});
$('ca-qty-list').addEventListener('click', (e) => {
  const btn = e.target.closest('[data-zutat]');
  if (btn) insertChunk({ qtyRef: btn.dataset.zutat });
});
$('ca-qty-back').addEventListener('click', () => {
  $('chunk-add-qty').hidden = true;
  $('chunk-add-main').hidden = false;
});

$('ca-time').addEventListener('click', () => {
  $('chunk-add-main').hidden = true;
  $('chunk-add-time').hidden = false;
});
$('ca-time-back').addEventListener('click', () => {
  $('chunk-add-time').hidden = true;
  $('chunk-add-main').hidden = false;
});
$('ca-time-ok').addEventListener('click', async () => {
  const m = Math.max(1, Math.min(240, parseInt($('ca-minutes').value, 10) || 10));
  const chunk = { text: `${m} Minuten`, search: ['Timer', 'Uhr'], symbol: null };
  insertChunk(chunk);
  chunk.symbol = await resolveSymbol(['Timer', 'Uhr']); // Uhr-Symbol nachladen
  persistAndRender();
});

// ===== Marker und Notiz pro Schritt =====
let flagsStep = null;

function openFlagsDialog(step) {
  flagsStep = step;
  const box = $('flags-toggles');
  box.innerHTML = Object.entries(STEP_FLAGS).map(([key, def]) => `
    <button type="button" class="flag-toggle${(step.flags || []).includes(key) ? ' active' : ''}" data-flag="${key}">
      ${icon(FLAG_ICONS[key])} ${escapeHtml(def.label)}
    </button>`).join('');
  $('flags-note').value = step.note || '';
  $('flags-dialog').showModal();
}

$('flags-toggles').addEventListener('click', (e) => {
  const btn = e.target.closest('.flag-toggle');
  if (!btn) return;
  const active = $('flags-toggles').querySelectorAll('.flag-toggle.active');
  if (!btn.classList.contains('active') && active.length >= MAX_FLAGS) {
    alert(`Höchstens ${MAX_FLAGS} Marker pro Schritt — das hält die Ansicht ruhig.`);
    return;
  }
  btn.classList.toggle('active');
});

$('flags-save').addEventListener('click', (e) => {
  e.preventDefault();
  if (!flagsStep) return $('flags-dialog').close();
  flagsStep.flags = [...$('flags-toggles').querySelectorAll('.flag-toggle.active')]
    .map((b) => b.dataset.flag);
  flagsStep.note = $('flags-note').value.trim();
  $('flags-dialog').close();
  persistAndRender();
});
$('flags-cancel').addEventListener('click', (e) => { e.preventDefault(); $('flags-dialog').close(); });

// ===== Zutaten / Hilfsmittel: bearbeiten (Edit) oder abhaken (Kochen) =====
function toggleCardCheck(e) {
  const card = e.target.closest('.symbol-card');
  if (!card || !card.dataset.id) return;
  const checks = getChecks(App.recipe.id);
  checks[card.dataset.id] = !checks[card.dataset.id];
  saveChecks(App.recipe.id, checks);
  card.classList.toggle('done', !!checks[card.dataset.id]);
}

$('ingredients').addEventListener('click', (e) => {
  if (App.mode === 'cook') return toggleCardCheck(e);
  if (isEdit() && e.target.classList.contains('card-label')) openItemDialog('ingredients', e.target.dataset.id);
});
$('tools').addEventListener('click', (e) => {
  if (App.mode === 'cook') return toggleCardCheck(e);
  if (isEdit() && e.target.classList.contains('card-label')) openItemDialog('tools', e.target.dataset.id);
});

function addItem(kind) {
  const r = App.recipe;
  if (kind === 'ingredients') {
    const item = { id: `z-${Date.now()}`, qty: { value: 1, unit: 'stueck' }, name: 'Neue Zutat', nameSingular: '', search: [], symbol: { type: 'placeholder' } };
    r.ingredients.push(item);
    persistAndRender();
    openItemDialog('ingredients', item.id);
  } else {
    const item = { id: `h-${Date.now()}`, name: 'Neues Hilfsmittel', search: [], symbol: { type: 'placeholder' } };
    r.tools.push(item);
    persistAndRender();
    openItemDialog('tools', item.id);
  }
}

let dialogTarget = null; // { kind, id }

function openItemDialog(kind, id) {
  const r = App.recipe;
  const list = kind === 'ingredients' ? r.ingredients : r.tools;
  const item = list.find((x) => x.id === id);
  if (!item) return;
  dialogTarget = { kind, id };
  const isIng = kind === 'ingredients';
  $('qty-fields').hidden = !isIng;
  $('qty-name').value = item.name;
  if (isIng) {
    $('qty-value').value = item.qty.value;
    $('qty-unit').value = item.qty.unit;
    $('qty-singular').value = item.nameSingular || '';
    $('qty-base-hint').textContent = `Grundmenge für ${r.servingsBase} Personen`;
    toggleSingularField();
  }
  $('qty-dialog').showModal();
}

function toggleSingularField() {
  $('qty-singular-row').hidden = $('qty-unit').value !== 'stueck';
}
$('qty-unit').addEventListener('change', toggleSingularField);

$('qty-save').addEventListener('click', (e) => {
  e.preventDefault();
  const r = App.recipe;
  const { kind, id } = dialogTarget || {};
  const list = kind === 'ingredients' ? r.ingredients : r.tools;
  const item = list?.find((x) => x.id === id);
  if (!item) return $('qty-dialog').close();
  item.name = $('qty-name').value.trim() || item.name;
  if (kind === 'ingredients') {
    const v = parseQtyValue($('qty-value').value); // akzeptiert auch „1/2" und „0,5"
    if (v && v > 0) item.qty.value = v;
    item.qty.unit = $('qty-unit').value;
    item.nameSingular = $('qty-singular').value.trim();
  }
  $('qty-dialog').close();
  persistAndRender();
});

$('qty-delete').addEventListener('click', (e) => {
  e.preventDefault();
  const r = App.recipe;
  const { kind, id } = dialogTarget || {};
  if (!kind) return $('qty-dialog').close();
  if (!confirm('Wirklich löschen?')) return;
  if (kind === 'ingredients') {
    r.ingredients = r.ingredients.filter((x) => x.id !== id);
    // Mengen-Chunks, die auf die Zutat zeigen, mit entfernen
    for (const s of r.steps) s.chunks = s.chunks.filter((c) => c.qtyRef !== id);
  } else {
    r.tools = r.tools.filter((x) => x.id !== id);
  }
  $('qty-dialog').close();
  persistAndRender();
});

$('qty-cancel').addEventListener('click', (e) => {
  e.preventDefault();
  $('qty-dialog').close();
});

// ===== Symbol-Tausch-Dialog =====
// Ziel ist entweder ein Chunk oder eine Zutat / ein Hilfsmittel.
let symTarget = null;   // { item, allowNone } — item trägt .symbol und Begriffe
let symResults = [];    // zuletzt gezeigte ARASAAC-IDs (werden Alternativen)
let symTyped = '';      // manuell gesuchter Begriff

function symbolTargetFromChunk(step, ci) {
  const chunk = step.chunks[ci];
  if (!chunk || chunk.arrow) return null;
  if (chunk.qtyRef) {
    const ing = ingredientById(App.recipe, chunk.qtyRef);
    return ing ? { item: ing, allowNone: false } : null;
  }
  return { item: chunk, allowNone: true };
}

function openSymbolDialog(target) {
  if (!target) return;
  symTarget = target;
  symTyped = '';
  const terms = termsFor(target.item);
  $('symbol-search-input').value = terms[0] || '';
  $('symbol-none').hidden = !target.allowNone;
  // Schnellauswahl: Timer-Uhr + die Symbole der Rezept-Zutaten
  $('symbol-quick').innerHTML = [
    `<button type="button" class="quick-sym" data-quick="timer">${icon('timer')}<span>Timer</span></button>`,
    ...App.recipe.ingredients
      .filter((z) => z.symbol && z.symbol.type !== 'placeholder')
      .map((z) => `<button type="button" class="quick-sym" data-quick="z:${z.id}">
        <img src="${symbolSrc(z.symbol)}" alt=""><span>${escapeHtml(z.name)}</span></button>`),
  ].join('');
  const sym = target.item.symbol;
  if (sym?.type === 'arasaac' && sym.alternatives?.length) {
    showSymbolResults(sym.alternatives);
  } else if (terms[0]) {
    searchAndShow(terms[0]);
  } else {
    showSymbolResults([]);
  }
  $('symbol-dialog').showModal();
}

function showSymbolResults(ids) {
  symResults = ids;
  const box = $('symbol-results');
  box.innerHTML = ids.length
    ? ids.map((id) => `<img class="symbol-result" src="${imageUrl(id, 300)}" alt="" data-id="${id}">`).join('')
    : '<p class="dialog-hint">Nichts gefunden — anderen Begriff versuchen.</p>';
}

async function searchAndShow(term) {
  $('symbol-results').innerHTML = '<p class="dialog-hint">Suche …</p>';
  showSymbolResults(await searchIds(term));
}

$('symbol-search-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const term = $('symbol-search-input').value.trim();
  if (!term) return;
  symTyped = term;
  searchAndShow(term);
});

$('symbol-results').addEventListener('click', (e) => {
  if (!e.target.classList.contains('symbol-result')) return;
  applySymbol({ type: 'arasaac', arasaacId: Number(e.target.dataset.id), alternatives: symResults });
});

/** Eigenes Bild übernehmen — gemeinsamer Weg für Datei-Knopf und Drag-and-drop. */
async function importPhotoFile(file) {
  if (!file || !file.type.startsWith('image/')) return;
  // Einmaliger Datenschutz-Hinweis (rechtliche Absicherung an Schulen)
  if (!localStorage.getItem('bildrezept_foto_hinweis')) {
    alert('Hinweis zu eigenen Fotos:\n\nBitte keine Gesichter oder Personen fotografieren — nur Gegenstände und Lebensmittel.\n\nFotos bleiben auf diesem Gerät. Nur wenn du das Rezept veröffentlichst oder teilst, werden sie mit übertragen.');
    localStorage.setItem('bildrezept_foto_hinweis', '1');
  }
  applySymbol({ type: 'photo', dataUrl: await resizeImage(file, 300) });
}

$('symbol-photo-input').addEventListener('change', (e) => {
  const file = e.target.files[0];
  e.target.value = '';
  importPhotoFile(file);
});

// ===== Drag & Drop: lokales Bild direkt in den Dialog ziehen =====
const symbolDialog = $('symbol-dialog');
symbolDialog.addEventListener('dragover', (e) => {
  e.preventDefault(); // erlaubt das Ablegen
  symbolDialog.classList.add('dragover');
});
symbolDialog.addEventListener('dragleave', (e) => {
  if (!symbolDialog.contains(e.relatedTarget)) symbolDialog.classList.remove('dragover');
});
symbolDialog.addEventListener('drop', (e) => {
  e.preventDefault();
  symbolDialog.classList.remove('dragover');
  importPhotoFile([...e.dataTransfer.files].find((f) => f.type.startsWith('image/')));
});
// Daneben abgelegte Bilder nicht als Seite öffnen (Backdrop oder Editor) — sonst ist das Rezept weg
window.addEventListener('dragover', (e) => { if (symbolDialog.open || isEdit()) e.preventDefault(); });
window.addEventListener('drop', (e) => { if (symbolDialog.open || isEdit()) e.preventDefault(); });

// ===== Drag & Drop im Editor: Bild auf die ＋-Fläche oder das Bild einer Wortgruppe ziehen =====
const dropTargetIn = (e) => isEdit()
  ? e.target.closest('.chunk-symbol-add, img.chunk-symbol:not(.chunk-symbol-unit)') : null;
stepsEl.addEventListener('dragover', (e) => {
  const t = dropTargetIn(e);
  if (!t) return;
  e.preventDefault();
  t.classList.add('dragover');
});
stepsEl.addEventListener('dragleave', (e) => {
  e.target.closest?.('.chunk-symbol-add, img.chunk-symbol')?.classList.remove('dragover');
});
stepsEl.addEventListener('drop', (e) => {
  const t = dropTargetIn(e);
  if (!t) return;
  e.preventDefault();
  t.classList.remove('dragover');
  const file = [...e.dataTransfer.files].find((f) => f.type.startsWith('image/'));
  const { step } = findStep(t);
  if (!file || !step) return;
  symTarget = symbolTargetFromChunk(step, Number(t.dataset.chunk));
  importPhotoFile(file);
});

$('symbol-none').addEventListener('click', () => applySymbol(null));
$('symbol-cancel').addEventListener('click', () => $('symbol-dialog').close());

$('symbol-quick').addEventListener('click', async (e) => {
  const btn = e.target.closest('.quick-sym');
  if (!btn) return;
  if (btn.dataset.quick === 'timer') {
    applySymbol(await resolveSymbol(['Timer', 'Uhr']));
  } else {
    const z = ingredientById(App.recipe, btn.dataset.quick.slice(2));
    if (z?.symbol) applySymbol(JSON.parse(JSON.stringify(z.symbol)));
  }
});

function applySymbol(symbol) {
  if (!symTarget) return;
  symTarget.item.symbol = symbol === null && !symTarget.allowNone ? { type: 'placeholder' } : symbol;
  // „Kein Bild" merken bzw. bei neuem Bild zurücknehmen — sonst füllt
  // fillChunkSymbolsFromItems das Bild beim nächsten Öffnen wieder auf
  if (symbol === null && symTarget.allowNone) symTarget.item.noSymbol = true;
  else delete symTarget.item.noSymbol;
  if (symbol) {
    // Im Symbol-Lexikon merken — inkl. manuell gesuchtem Begriff (Spec § 2.3)
    const terms = [...termsFor(symTarget.item), symTyped].filter(Boolean);
    rememberSymbol(terms, symbol);
  }
  symTarget.onApply?.(symTarget.item.symbol);
  $('symbol-dialog').close();
  persistAndRender();
}

/** Einheiten-Symbol (Löffel/Becher) tauschen — gilt für alle Rezepte. */
function openUnitSymbolDialog(unit) {
  const terms = unitSearchTerms(unit);
  const proxy = { text: terms[0] || unit, search: terms, symbol: getUnitSymbol(unit) };
  openSymbolDialog({ item: proxy, allowNone: false, onApply: (sym) => setUnitSymbol(unit, sym) });
}

// Öffnen: Symbol-Klicks und ＋ (Bild hinzufügen) in Schritten, Karten (nur Edit-Modus)
stepsEl.addEventListener('click', (e) => {
  if (!isEdit()) return;
  if (e.target.classList.contains('chunk-symbol-unit')) {
    openUnitSymbolDialog(e.target.dataset.unit);
    return;
  }
  if (!e.target.classList.contains('chunk-symbol') && !e.target.classList.contains('chunk-symbol-add')) return;
  const { step } = findStep(e.target);
  if (step) openSymbolDialog(symbolTargetFromChunk(step, Number(e.target.dataset.chunk)));
});
for (const kind of ['ingredients', 'tools']) {
  $(kind).addEventListener('click', (e) => {
    if (!isEdit() || !e.target.classList.contains('card-symbol')) return;
    const list = App.recipe[kind];
    const item = list.find((x) => x.id === e.target.dataset.id);
    if (item) openSymbolDialog({ item, allowNone: false });
  });
}
