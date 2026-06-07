// Ritualisierte Routine-Bausteine (opt-in): immer gleiche Schritte vor und
// nach dem Rezept — Hände waschen, Schürze, aufräumen. Eigene Schritt-IDs
// (rt-…), damit sie gezielt ein- und ausgeschaltet werden können.
import { resolveSymbol } from './arasaac.js';

export const ROUTINES = [
  { key: 'haende', label: 'Wasche deine Hände', search: ['Hände waschen'], pos: 'vor' },
  { key: 'schuerze', label: 'Ziehe die Schürze an', search: ['Schürze'], pos: 'vor' },
  { key: 'zutaten', label: 'Bereite alle Zutaten vor', search: ['Zutaten', 'Lebensmittel'], pos: 'vor' },
  { key: 'hilfsmittel', label: 'Stelle alle Hilfsmittel bereit', search: ['vorbereiten', 'Tisch decken'], pos: 'vor' },
  { key: 'abwaschen', label: 'Spüle das Geschirr', search: ['abwaschen', 'spülen'], pos: 'nach' },
  { key: 'aufraeumen', label: 'Räume auf', search: ['aufräumen'], pos: 'nach' },
];

export const hasRoutine = (recipe, key) => recipe.steps.some((s) => s.id === `rt-${key}`);

/** Routine-Schritt einfügen oder entfernen (verändert das übergebene Rezept). */
export async function setRoutine(recipe, key, on) {
  const def = ROUTINES.find((r) => r.key === key);
  if (!def) return;
  const id = `rt-${key}`;
  const idx = recipe.steps.findIndex((s) => s.id === id);
  if (!on) {
    if (idx >= 0) recipe.steps.splice(idx, 1);
    return;
  }
  if (idx >= 0) return;
  const step = {
    id, routine: true, flags: [], note: '',
    chunks: [{ text: def.label, search: def.search, symbol: null }],
  };
  step.chunks[0].symbol = await resolveSymbol([...def.search, def.label]);
  if (def.pos === 'vor') {
    // Hinter bereits vorhandene Vor-Routinen, in fester Reihenfolge
    let insert = 0;
    for (const r of ROUTINES.filter((x) => x.pos === 'vor')) {
      if (r.key === key) break;
      if (hasRoutine(recipe, r.key)) insert++;
    }
    recipe.steps.splice(insert, 0, step);
  } else {
    recipe.steps.push(step);
  }
}

/** Chips-HTML für Editor und Teilen-Dialog — gruppiert in vor/nach dem Kochen. */
export function routineChips(recipe) {
  const chip = (r) => `
    <button type="button" class="routine-chip${hasRoutine(recipe, r.key) ? ' active' : ''}" data-routine="${r.key}">
      ${r.label}
    </button>`;
  const group = (pos, label) => `
    <span class="routine-group"><span class="routines-label">${label}</span>
      ${ROUTINES.filter((r) => r.pos === pos).map(chip).join('')}
    </span>`;
  return group('vor', 'Vor dem Kochen:') + group('nach', 'Nach dem Kochen:');
}
