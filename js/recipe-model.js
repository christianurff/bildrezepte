// Datenmodell, Maßeinheiten-Vokabular (Spec § 3.1), Skalierung und Anzeige.
// Reine Funktionen — testbar mit `node --test`.

// Festes Marker-Vokabular für Schritte (Spec-Erweiterung „Ausbaustufe 2"):
// ruhige, immer gleiche Symbole — kein Freitext, maximal 2 pro Schritt sichtbar.
export const STEP_FLAGS = {
  heiss: { label: 'Heiß — Vorsicht' },
  scharf: { label: 'Scharfes Messer — Vorsicht' },
  hilfe: { label: 'Hilfe holen — auf einen Erwachsenen warten' },
};
export const MAX_FLAGS = 2;

/** Zeitangabe in einem Schritttext erkennen (für den Time-Timer), in Minuten. */
export function parseStepMinutes(text) {
  const m = String(text || '').match(/(\d+)\s*(Minuten?|Min\.?|Stunden?|Std\.?)/i);
  if (!m) return null;
  const n = parseInt(m[1], 10);
  return /Stunde|Std/i.test(m[2]) ? n * 60 : n;
}

export const UNITS = {
  g:      { one: 'Gramm',          many: 'Gramm' },
  ml:     { one: 'Milliliter',     many: 'Milliliter' },
  el:     { one: 'großer Löffel',  oneAkk: 'großen Löffel',  many: 'große Löffel',  half: true },
  tl:     { one: 'kleiner Löffel', oneAkk: 'kleinen Löffel', many: 'kleine Löffel', half: true },
  becher: { one: 'Becher',         many: 'Becher',        half: true },
  prise:  { one: 'Prise',          many: 'Prisen' },
  pck:    { one: 'Päckchen',       many: 'Päckchen' },
  stueck: { one: '',               many: '' },
};

export function scaleValue(value, unit, factor) {
  if (factor === 1) return value;
  const raw = value * factor;
  switch (unit) {
    case 'g': {
      const step = raw >= 100 ? 10 : 5;
      return Math.max(step, Math.round(raw / step) * step);
    }
    case 'ml': {
      const step = raw >= 250 ? 25 : 10;
      return Math.max(step, Math.round(raw / step) * step);
    }
    case 'el': case 'tl': case 'becher':
      return Math.max(0.5, Math.round(raw * 2) / 2);
    case 'prise':
      return factor >= 3 ? Math.max(value, Math.round((value * factor) / 2)) : value;
    default: // stueck, pck
      return Math.max(1, Math.round(raw));
  }
}

export function scaledQty(recipe, qty) {
  const factor = recipe.servings / recipe.servingsBase;
  return { value: scaleValue(qty.value, qty.unit, factor), unit: qty.unit };
}

/** Mengenwert robust einlesen: 0.5, "0,5", "1/2", "1 1/2", "½" — sonst null, nie NaN. */
export function parseQtyValue(input) {
  if (typeof input === 'number') return Number.isFinite(input) ? input : null;
  const s = String(input ?? '').replace('½', ' 1/2').replace(',', '.').trim();
  const m = s.match(/^(\d+)?\s*(\d+)\s*\/\s*(\d+)$/);
  if (m) {
    const whole = m[1] ? parseInt(m[1], 10) : 0;
    const den = parseInt(m[3], 10);
    return den ? whole + parseInt(m[2], 10) / den : null;
  }
  const f = parseFloat(s);
  return Number.isFinite(f) ? f : null;
}

function formatNumber(value) {
  if (!Number.isFinite(value)) return '?';
  const whole = Math.floor(value);
  if (value === whole) return String(whole);
  return whole === 0 ? '½' : `${whole} ½`;
}

export function formatQty(qty, name = '', nameSingular = '', { akk = false } = {}) {
  const { value, unit } = qty;
  const u = UNITS[unit] || UNITS.stueck;
  if (unit === 'stueck' || !UNITS[unit]) {
    const n = value === 1 && nameSingular ? nameSingular : name;
    return `${formatNumber(value)} ${n}`.trim();
  }
  // Auf Karten Nominativ („1 großer Löffel"), im Satz Akkusativ („1 großen Löffel")
  const one = akk ? (u.oneAkk || u.one) : u.one;
  let amount;
  if (value === 0.5 && u.half) amount = akk ? `einen halben ${one}` : `ein halber ${one}`;
  else if (value === 1) amount = `1 ${one}`;
  else amount = `${formatNumber(value)} ${u.many}`;
  return name ? `${amount} ${name}` : amount;
}

export function buildRecipeFromAi(ai) {
  if (!ai || typeof ai.title !== 'string' || !ai.title.trim()) {
    throw new Error('Die KI-Antwort enthält keinen Titel.');
  }
  if (!Array.isArray(ai.steps) || ai.steps.length === 0) {
    throw new Error('Die KI-Antwort enthält keine Schritte.');
  }
  const servingsBase = Number.isInteger(ai.servingsBase) && ai.servingsBase > 0 ? ai.servingsBase : 4;

  const ingredients = (ai.ingredients || []).map((ing, i) => {
    const qty = ing.qty || {};
    if (!UNITS[qty.unit]) throw new Error(`Unbekannte Einheit „${qty.unit}" bei ${ing.name || 'Zutat ' + (i + 1)}.`);
    const value = parseQtyValue(qty.value); // KI liefert manchmal "1/2" oder "0,5" als Text
    if (value === null || value <= 0) throw new Error(`Ungültige Menge bei ${ing.name || 'Zutat ' + (i + 1)}.`);
    return {
      id: `z${i + 1}`,
      qty: { value, unit: qty.unit },
      name: String(ing.name || '').trim(),
      nameSingular: String(ing.nameSingular || '').trim(),
      search: Array.isArray(ing.search) ? ing.search : [],
      symbol: null,
    };
  });

  const tools = (ai.tools || []).map((t, i) => ({
    id: `h${i + 1}`,
    name: String(t.name || '').trim(),
    search: Array.isArray(t.search) ? t.search : [],
    symbol: null,
  }));

  const steps = ai.steps.map((step, si) => ({
    id: `s${si + 1}`,
    // Sicherheits-Marker: nur festes Vokabular, max. 2; Notizen nur von der Lehrkraft
    flags: (Array.isArray(step.flags) ? step.flags : []).filter((f) => STEP_FLAGS[f]).slice(0, MAX_FLAGS),
    note: '',
    chunks: (step.chunks || []).map((c) => {
      if (c.arrow) return { arrow: true, text: String(c.text || '').trim() };
      if (Number.isInteger(c.ref)) {
        if (!ingredients[c.ref]) throw new Error(`Schritt ${si + 1} verweist auf eine unbekannte Zutat.`);
        return { qtyRef: ingredients[c.ref].id };
      }
      return {
        text: String(c.text || '').trim(),
        search: Array.isArray(c.search) ? c.search : [],
        symbol: null,
      };
    }).filter((c) => c.arrow || c.qtyRef || c.text),
  }));

  return {
    schemaVersion: 1,
    id: `r-${Math.random().toString(36).slice(2, 10)}`,
    title: ai.title.trim(),
    servingsBase,
    servings: servingsBase,
    ingredients, tools, steps,
  };
}

export function ingredientById(recipe, id) {
  return recipe.ingredients.find((z) => z.id === id) || null;
}

export function chunkText(recipe, chunk) {
  if (chunk.arrow) return chunk.text || '';
  if (chunk.qtyRef) {
    const ing = ingredientById(recipe, chunk.qtyRef);
    return ing ? formatQty(scaledQty(recipe, ing.qty), ing.name, ing.nameSingular, { akk: true }) : '';
  }
  return chunk.text;
}

export function stepText(recipe, step) {
  const raw = step.chunks.map((c) => chunkText(recipe, c)).filter(Boolean).join(' ');
  return /[.!?]$/.test(raw) ? raw : raw + '.';
}

/** Klartext-Zusammenfassung des Rezepts (für KI-Prüfung beim Veröffentlichen). */
export function recipeSummaryText(recipe) {
  const zutaten = recipe.ingredients
    .map((z) => formatQty(z.qty, z.name, z.nameSingular)).join(', ');
  const hilfsmittel = recipe.tools.map((t) => t.name).join(', ');
  const schritte = recipe.steps.map((s, i) => `${i + 1}. ${stepText(recipe, s)}`).join('\n');
  return `${recipe.title} (für ${recipe.servingsBase} Personen)\n`
    + `Zutaten: ${zutaten}\nHilfsmittel: ${hilfsmittel}\nSchritte:\n${schritte}`;
}
