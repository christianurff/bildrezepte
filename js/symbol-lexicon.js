// Lokales Verzeichnis „Wort → Symbol" (Spec § 2.3): einmal angepasste Symbole
// werden bei neuen Rezepten automatisch wiederverwendet.
const KEY = 'bildrezept_symbol_lexikon';

export function normalizeTerm(term) {
  return String(term || '')
    .toLowerCase()
    .trim()
    .replace(/^(der|die|das|den|dem|des|ein|eine|einen|einem|einer)\s+/, '')
    .trim();
}

function lexicon() {
  try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; }
}

/** Erstes gemerktes Symbol zu einem der Begriffe, sonst null. */
export function lookupSymbol(terms) {
  const lex = lexicon();
  for (const t of terms || []) {
    const hit = lex[normalizeTerm(t)];
    if (hit) return JSON.parse(JSON.stringify(hit.symbol));
  }
  return null;
}

/** Manuell gewähltes Symbol unter allen Begriffen des Elements merken. */
export function rememberSymbol(terms, symbol) {
  if (!symbol || symbol.type === 'placeholder') return;
  const lex = lexicon();
  for (const t of terms || []) {
    const key = normalizeTerm(t);
    if (key) lex[key] = { symbol, savedAt: Date.now() };
  }
  localStorage.setItem(KEY, JSON.stringify(lex));
}

export function listEntries() {
  return Object.entries(lexicon())
    .map(([word, e]) => ({ word, symbol: e.symbol }))
    .sort((a, b) => a.word.localeCompare(b.word, 'de'));
}

export function removeEntry(word) {
  const lex = lexicon();
  delete lex[word];
  localStorage.setItem(KEY, JSON.stringify(lex));
}
