// Einkaufs- und Bereitstellungsliste: dieselben Symbolkarten wie im Rezept,
// digital abhakbar (z.B. iPad beim Einkaufen / am Vorratsschrank) und druckbar.
import { App, escapeHtml, printWithClass } from './app.js';
import { scaledQty, formatQty } from './recipe-model.js';
import { symbolSrc } from './arasaac.js';

const $ = (id) => document.getElementById(id);
const KEY = (id) => `bildrezept_checkliste_${id}`;

export function getChecks(recipeId) {
  try { return JSON.parse(localStorage.getItem(KEY(recipeId))) || {}; } catch { return {}; }
}
export function saveChecks(recipeId, checks) {
  localStorage.setItem(KEY(recipeId), JSON.stringify(checks));
}

function itemLabel(r, item) {
  return item.qty ? formatQty(scaledQty(r, item.qty), item.name, item.nameSingular) : item.name;
}

function renderCards(r, items, checks) {
  return items.map((item) => `
    <button class="check-card${checks[item.id] ? ' done' : ''}" data-item="${item.id}">
      <img src="${symbolSrc(item.symbol)}" alt="">
      <span>${escapeHtml(itemLabel(r, item))}</span>
    </button>`).join('');
}

function render() {
  const r = App.recipe;
  const checks = getChecks(r.id);
  $('checklist-einkauf').innerHTML = renderCards(r, r.ingredients, checks);
  $('checklist-bereit').innerHTML = renderCards(r, r.tools, checks);
}

export function openChecklist() {
  render();
  $('checklist-dialog').showModal();
}

$('checklist-dialog').addEventListener('click', (e) => {
  const card = e.target.closest('.check-card');
  if (!card) return;
  const checks = getChecks(App.recipe.id);
  checks[card.dataset.item] = !checks[card.dataset.item];
  saveChecks(App.recipe.id, checks);
  card.classList.toggle('done', !!checks[card.dataset.item]);
});

$('checklist-reset').addEventListener('click', () => {
  if (!confirm('Alle Haken der Liste zurücksetzen?')) return;
  saveChecks(App.recipe.id, {});
  render();
});

/** Einkaufs-/Bereitstellungsliste drucken (aus Dialog ODER Druck-Menü). */
export function printChecklist() {
  const r = App.recipe;
  $('checklist-sheet').innerHTML = `
    <h1>${escapeHtml(r.title)} — Einkaufen und Bereitstellen</h1>
    <h2>Einkaufen</h2>
    <div class="sheet-cards">${renderCards(r, r.ingredients, {})}</div>
    <h2>Vorher bereitstellen</h2>
    <div class="sheet-cards">${renderCards(r, r.tools, {})}</div>`;
  printWithClass('print-checklist');
}

$('checklist-print').addEventListener('click', () => {
  $('checklist-dialog').close();
  printChecklist();
});

$('checklist-close').addEventListener('click', () => $('checklist-dialog').close());
