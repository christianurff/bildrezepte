// Öffentliche Rezepte-Sammlung: stöbern, suchen, übernehmen, veröffentlichen, melden.
import { openRecipe, escapeHtml, showError } from './app.js';
import { COLLECTION_CATEGORIES, searchCollection, fetchCollectionRecipe, publishToCollection, reportCollectionRecipe, updateCollectionRecipe, deleteCollectionRecipe } from './api.js';
import { recipeSummaryText } from './recipe-model.js';
import { imageUrl } from './arasaac.js';
import { saveRecipe, getRecipe } from './storage.js';
import { icon } from './icons.js';

const $ = (id) => document.getElementById(id);
const state = { q: '', cat: '', offset: 0, loaded: false };

// ===== Stöbern =====
export function initCollection() {
  if (state.loaded) return;
  state.loaded = true;
  renderCats();
  load({ reset: true });
}

function renderCats() {
  $('collection-cats').innerHTML = ['', ...COLLECTION_CATEGORIES].map((c) =>
    `<button class="cat-chip${c === state.cat ? ' active' : ''}" data-cat="${escapeHtml(c)}">${c || 'Alle'}</button>`
  ).join('');
}

async function load({ reset = false } = {}) {
  const ul = $('collection-list');
  if (reset) { state.offset = 0; ul.innerHTML = '<li class="empty">Wird geladen …</li>'; }
  try {
    const { items, hasMore } = await searchCollection({ q: state.q, cat: state.cat, offset: state.offset });
    if (reset) ul.innerHTML = '';
    if (!items.length && reset) {
      ul.innerHTML = '<li class="empty">Keine Rezepte gefunden.</li>';
    }
    for (const item of items) ul.appendChild(renderItem(item));
    $('collection-more').hidden = !hasMore;
    state.offset += items.length;
  } catch (err) {
    ul.innerHTML = `<li class="empty">${escapeHtml(err.message)}</li>`;
  }
}

// Admin-Modus: Passwort liegt lokal, jede Aktion wird serverseitig geprüft
const adminPw = () => localStorage.getItem('bildrezept_admin_pw') || '';

function renderItem(item) {
  const li = document.createElement('li');
  li.className = 'collection-item';
  const preview = item.preview.map((id) => `<img src="${imageUrl(id, 300)}" alt="">`).join('');
  const meta = [
    item.categories.join(' · '),
    `${item.steps} Schritte`,
    item.author ? `von ${escapeHtml(item.author)}` : '',
  ].filter(Boolean).join(' — ');
  const adminDel = adminPw() ? `<button class="collection-admin-del" title="Löschen (Admin)">${icon('trash')}</button>` : '';
  li.innerHTML = `
    <button class="collection-open">
      <span class="collection-preview">${preview}</span>
      <span class="collection-info">
        <strong>${escapeHtml(item.title)}</strong>
        <small>${meta}</small>
      </span>
    </button>
    ${adminDel}
    <button class="collection-report" title="Rezept melden">${icon('flag')}</button>`;
  li.querySelector('.collection-open').addEventListener('click', () => openFromCollection(item.id));
  li.querySelector('.collection-report').addEventListener('click', async () => {
    if (!confirm(`„${item.title}" als unpassend melden?`)) return;
    await reportCollectionRecipe(item.id);
    li.remove();
    alert('Danke für deine Meldung!');
  });
  li.querySelector('.collection-admin-del')?.addEventListener('click', async () => {
    if (!confirm(`„${item.title}" endgültig aus der Sammlung löschen?`)) return;
    try {
      await deleteCollectionRecipe(item.id, { adminPw: adminPw() });
      li.remove();
    } catch (err) { alert(err.message); }
  });
  return li;
}

async function openFromCollection(id) {
  try {
    // Feste lokale ID pro Sammlungs-Rezept: mehrfaches Öffnen erzeugt
    // KEINE neuen Kopien — eine vorhandene Bearbeitung wird wieder geöffnet.
    const localId = `r-coll-${id}`;
    let recipe = getRecipe(localId);
    if (!recipe) {
      recipe = await fetchCollectionRecipe(id);
      recipe.id = localId;
    }
    // Im Admin-Modus trägt die Kopie den Sammlungs-Bezug: Speichern und
    // Moduswechsel schreiben Änderungen direkt zurück in die Sammlung.
    if (adminPw()) recipe.published = { id, admin: true };
    saveRecipe(recipe);
    openRecipe(recipe, 'edit');
  } catch (err) {
    showError(err.message);
  }
}

// ===== Admin-Modus an/aus =====
/** Aktiven Admin-Modus deutlich anzeigen: Knopf-Zustand + Hinweiszeile. */
function renderAdminState() {
  const on = !!adminPw();
  const btn = document.getElementById('btn-admin');
  btn.textContent = on ? 'Admin-Modus verlassen' : 'Admin';
  btn.classList.toggle('active', on);
  $('admin-hint').hidden = !on;
}

document.getElementById('btn-admin').addEventListener('click', () => {
  if (adminPw()) {
    if (confirm('Admin-Modus verlassen?')) {
      localStorage.removeItem('bildrezept_admin_pw');
      renderAdminState();
      load({ reset: true });
    }
    return;
  }
  const pw = prompt('Admin-Passwort:');
  if (!pw) return;
  localStorage.setItem('bildrezept_admin_pw', pw);
  renderAdminState();
  load({ reset: true });
  alert('Admin-Modus aktiv: Öffentliche Rezepte können jetzt geöffnet, bearbeitet und gelöscht werden.\n\nÄnderungen werden beim Speichern und beim Verlassen des Editors in die Sammlung übernommen.');
});

$('collection-search').addEventListener('submit', (e) => {
  e.preventDefault();
  state.q = $('collection-q').value.trim();
  load({ reset: true });
});
$('collection-cats').addEventListener('click', (e) => {
  const chip = e.target.closest('.cat-chip');
  if (!chip) return;
  state.cat = chip.dataset.cat;
  renderCats();
  load({ reset: true });
});
$('collection-more').addEventListener('click', () => load());

// ===== Veröffentlichen / Aktualisieren / Entfernen =====
let publishRecipeRef = null;

export function openPublishDialog(recipe) {
  publishRecipeRef = recipe;
  const pub = recipe.published;
  $('publish-form').hidden = false;
  $('publish-result').hidden = true;
  $('publish-author').value = localStorage.getItem('bildrezept_author') || '';
  let hint = pub
    ? (pub.admin ? 'Dieses Rezept stammt aus der Sammlung (Admin-Modus). Änderungen werden dort übernommen.'
                 : 'Dieses Rezept ist bereits veröffentlicht. Du kannst es aktualisieren oder aus der Sammlung entfernen.')
    : 'Dein Rezept wird automatisch geprüft und ist danach für alle sichtbar und nutzbar.';
  // Datenschutz-Absicherung: eigene Fotos vor der Veröffentlichung prüfen
  const hatFotos = [...recipe.ingredients, ...recipe.tools, ...recipe.steps.flatMap((s) => s.chunks)]
    .some((x) => x.symbol?.type === 'photo');
  if (hatFotos) hint += ' Das Rezept enthält eigene Fotos — bitte sicherstellen, dass keine Personen erkennbar sind.';
  $('publish-hint').textContent = hint;
  $('publish-go').textContent = pub ? 'Änderungen veröffentlichen' : 'Prüfen und veröffentlichen';
  $('publish-withdraw').hidden = !pub;
  $('publish-dialog').showModal();
}

function showPublishResult(html) {
  $('publish-result-body').innerHTML = html;
  $('publish-form').hidden = true;
  $('publish-result').hidden = false;
}

function authFor(pub) {
  return pub.admin ? { adminPw: adminPw() } : { ownerToken: pub.ownerToken };
}

$('publish-go').addEventListener('click', async () => {
  if (!publishRecipeRef) return;
  const btn = $('publish-go');
  const author = $('publish-author').value.trim();
  localStorage.setItem('bildrezept_author', author);
  btn.disabled = true;
  const label = btn.textContent;
  btn.textContent = 'Wird geprüft …';
  // Lokale Veröffentlichungs-Infos (Owner-Token) nie mitsenden
  const clean = { ...publishRecipeRef };
  delete clean.published;
  const summary = recipeSummaryText(publishRecipeRef);
  try {
    const pub = publishRecipeRef.published;
    const result = pub
      ? await updateCollectionRecipe(pub.id, clean, summary, author, authFor(pub))
      : await publishToCollection(clean, summary, author);
    if (result.ok) {
      if (!pub) publishRecipeRef.published = { id: result.id, ownerToken: result.ownerToken };
      saveRecipe(publishRecipeRef);
      showPublishResult(`
        <p><strong>${pub ? 'Aktualisiert' : 'Veröffentlicht'} — danke fürs Teilen!</strong></p>
        <p class="dialog-hint">Kategorien: ${result.categories.map(escapeHtml).join(', ')}<br>
        Stichwörter: ${result.keywords.map(escapeHtml).join(', ')}</p>`);
      load({ reset: true });
    } else {
      showPublishResult(`
        <p><strong>Noch nicht veröffentlicht:</strong> ${escapeHtml(result.reason)}</p>
        ${result.suggestions?.length ? `<p>Vorschläge:</p><ul>${result.suggestions.map((s) => `<li>${escapeHtml(s)}</li>`).join('')}</ul>` : ''}`);
    }
  } catch (err) {
    if (err.message === 'nicht-gefunden') {
      // Eintrag wurde inzwischen entfernt → Bezug lösen, nächster Versuch veröffentlicht neu
      delete publishRecipeRef.published;
      saveRecipe(publishRecipeRef);
      showPublishResult('<p>Das Rezept war nicht mehr in der Sammlung. Beim nächsten Versuch wird es neu veröffentlicht.</p>');
    } else {
      showPublishResult(`<p>${escapeHtml(err.message)}</p>`);
    }
  } finally {
    btn.disabled = false;
    btn.textContent = label;
  }
});

$('publish-withdraw').addEventListener('click', async () => {
  const pub = publishRecipeRef?.published;
  if (!pub || !confirm('Dieses Rezept aus der öffentlichen Sammlung entfernen?')) return;
  try {
    await deleteCollectionRecipe(pub.id, authFor(pub));
    delete publishRecipeRef.published;
    saveRecipe(publishRecipeRef);
    showPublishResult('<p><strong>Aus der Sammlung entfernt.</strong> Dein lokales Rezept bleibt erhalten.</p>');
    load({ reset: true });
  } catch (err) {
    showPublishResult(`<p>${escapeHtml(err.message)}</p>`);
  }
});

$('publish-cancel').addEventListener('click', () => $('publish-dialog').close());
$('publish-close').addEventListener('click', () => $('publish-dialog').close());
