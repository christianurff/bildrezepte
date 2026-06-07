// ARASAAC-Piktogramm-Suche mit localStorage-Cache (Muster: Rechengeschichten-App).
import { lookupSymbol, normalizeTerm } from './symbol-lexicon.js';
import { viaCache } from './api.js';

const CACHE_KEY = 'bildrezept_arasaac_cache';

// In der iOS-App via nativem Offline-Puffer: einmal gesehene Symbole
// bleiben dauerhaft lokal verfügbar.
// Sicherheit: ID wird auf eine Ganzzahl gezwungen — so kann ein manipuliertes
// (geteiltes) Rezept keinen Code in die Bild-URL schmuggeln (XSS).
export const imageUrl = (id, size = 300) => {
  const n = Math.trunc(Number(id));
  if (!Number.isFinite(n) || n <= 0) return 'symbole/platzhalter.svg';
  return viaCache(`https://static.arasaac.org/pictograms/${n}/${n}_${size}.png`);
};

function cache() {
  try { return JSON.parse(localStorage.getItem(CACHE_KEY)) || {}; } catch { return {}; }
}

export async function searchIds(term) {
  const key = term.toLowerCase().trim();
  if (!key) return [];
  const c = cache();
  if (c[key]) return c[key];
  try {
    const res = await fetch(viaCache(`https://api.arasaac.org/api/pictograms/de/search/${encodeURIComponent(key)}`));
    if (res.status === 404) { c[key] = []; }
    else if (!res.ok) return []; // Fehler nicht cachen
    else c[key] = (await res.json()).slice(0, 12).map((p) => p._id);
    localStorage.setItem(CACHE_KEY, JSON.stringify(c));
    return c[key];
  } catch { return []; }
}

export async function resolveSymbol(terms) {
  // Zuerst das Symbol-Lexikon (manuell angepasste Symbole), dann ARASAAC.
  const remembered = lookupSymbol(terms);
  if (remembered) return remembered;
  for (const term of terms || []) {
    const ids = await searchIds(term);
    if (ids.length) return { type: 'arasaac', arasaacId: ids[0], alternatives: ids };
  }
  return { type: 'placeholder' };
}

/** Begriffe eines Elements für Lexikon/Suche: Suchbegriffe + Text bzw. Name. */
export function termsFor(item) {
  return [...(item.search || []), item.name || item.text].filter(Boolean);
}

export function symbolSrc(symbol, size = 300) {
  if (!symbol) return null;
  if (symbol.type === 'arasaac') return imageUrl(symbol.arasaacId, size);
  // Eigene Fotos nur als echte Bild-Data-URL akzeptieren — ein manipuliertes
  // geteiltes Rezept kann so kein „onerror"/Anführungszeichen ins src schmuggeln.
  if (symbol.type === 'photo' && /^data:image\/(png|jpe?g|webp|gif);base64,[A-Za-z0-9+/=]+$/.test(symbol.dataUrl || '')) {
    return symbol.dataUrl;
  }
  return 'symbole/platzhalter.svg';
}

// ===== Einheiten-Symbole (Löffel, Becher) für Mengen-Chunks =====
const UNIT_SEARCH = { el: ['Esslöffel', 'Löffel'], tl: ['Teelöffel', 'Löffel'], becher: ['Becher'] };
const unitSymbols = {};

export function unitSearchTerms(unit) { return UNIT_SEARCH[unit] || []; }
export function getUnitSymbol(unit) { return unitSymbols[unit] || null; }
export function setUnitSymbol(unit, symbol) { unitSymbols[unit] = symbol; }

/** Symbole für el/tl/becher auflösen (Lexikon zuerst — Anpassungen bleiben erhalten). */
export async function ensureUnitSymbols() {
  for (const [unit, terms] of Object.entries(UNIT_SEARCH)) {
    if (unitSymbols[unit]) continue;
    unitSymbols[unit] = await resolveSymbol(terms);
  }
}

/** Lookup „normalisierter Name → Symbol" aus Zutaten und Hilfsmitteln. */
function itemSymbolMap(recipe) {
  const byName = new Map();
  for (const item of [...recipe.ingredients, ...recipe.tools]) {
    if (item.symbol && item.symbol.type !== 'placeholder') {
      for (const t of termsFor(item)) byName.set(normalizeTerm(t), item.symbol);
    }
  }
  return byName;
}

function symbolFromItems(byName, chunk) {
  const key = termsFor(chunk).map(normalizeTerm).find((t) => byName.has(t));
  return key ? JSON.parse(JSON.stringify(byName.get(key))) : null;
}

/**
 * Schritt-Wörter ohne Bild erben Symbole von Zutaten/Hilfsmitteln
 * („dem Messer" → Symbol des Hilfsmittels „Messer"). Ohne Netzzugriff,
 * läuft auch beim Öffnen bestehender Rezepte. Liefert true bei Änderungen.
 */
export function fillChunkSymbolsFromItems(recipe) {
  const byName = itemSymbolMap(recipe);
  let changed = false;
  for (const s of recipe.steps) {
    for (const c of s.chunks) {
      // noSymbol: Bild wurde bewusst entfernt — nicht wieder auffüllen
      if (c.arrow || c.qtyRef || c.symbol || c.noSymbol) continue;
      const sym = lookupSymbol(termsFor(c)) || symbolFromItems(byName, c);
      if (sym) { c.symbol = sym; changed = true; }
    }
  }
  return changed;
}

/** Alle Symbole eines frischen Rezepts auflösen (max. 6 parallel). */
export async function resolveRecipeSymbols(recipe, onProgress = () => {}) {
  const items = [...recipe.ingredients, ...recipe.tools];
  const chunks = recipe.steps.flatMap((s) => s.chunks.filter((c) => !c.arrow && !c.qtyRef));
  const total = items.length + chunks.length;
  let done = 0;

  // 1) Zutaten und Hilfsmittel
  const queue = [...items];
  async function worker() {
    while (queue.length) {
      const item = queue.shift();
      item.symbol = await resolveSymbol(termsFor(item));
      onProgress(++done, total);
    }
  }
  await Promise.all(Array.from({ length: 6 }, worker));

  // 2) Schritt-Chunks: Lexikon → Zutaten/Hilfsmittel-Namen → ARASAAC.
  //    Chunks ohne Suchbegriffe (Funktionswörter) bekommen keine ARASAAC-Suche.
  const byName = itemSymbolMap(recipe);
  const cQueue = [...chunks];
  async function chunkWorker() {
    while (cQueue.length) {
      const chunk = cQueue.shift();
      let sym = lookupSymbol(termsFor(chunk)) || symbolFromItems(byName, chunk);
      if (!sym && chunk.search?.length) sym = await resolveSymbol(termsFor(chunk));
      chunk.symbol = sym;
      onProgress(++done, total);
    }
  }
  await Promise.all(Array.from({ length: 6 }, chunkWorker));
}
