// Lehrkraft-Vorbereitungsblatt: nüchternes Textblatt mit hochgerechneter
// Einkaufsliste (Gruppen-Multiplikator), Geräten, Zeiten und Gefahrenstellen.
import { escapeHtml } from './app.js';
import { scaledQty, scaleValue, formatQty, stepText, parseStepMinutes, STEP_FLAGS } from './recipe-model.js';

export function buildPrepSheet(recipe, groups) {
  const r = recipe;
  const g = Math.max(1, groups);

  const zutaten = r.ingredients.map((z) => {
    const je = scaledQty(r, z.qty);
    const gesamt = { value: scaleValue(je.value, je.unit, g), unit: je.unit };
    const jeText = g > 1 ? ` <small>(je Gruppe: ${escapeHtml(formatQty(je, ''))})</small>` : '';
    return `<li class="cb">${escapeHtml(formatQty(gesamt, z.name, z.nameSingular))}${jeText}</li>`;
  }).join('');

  const geraete = r.tools.map((t) =>
    `<li class="cb">${escapeHtml(t.name)}${g > 1 ? ` — ${g}×` : ''}</li>`).join('');

  const zeiten = r.steps
    .map((s, i) => ({ i, min: parseStepMinutes(stepText(r, s)) }))
    .filter((x) => x.min)
    .map((x) => `<li>Schritt ${x.i + 1}: ${x.min} Minuten</li>`).join('');

  const gefahren = r.steps
    .map((s, i) => ({ s, i }))
    .filter((x) => (x.s.flags || []).length || x.s.note)
    .map((x) => {
      const marker = (x.s.flags || []).map((f) => STEP_FLAGS[f]?.label.split(' — ')[0] || f).join(', ');
      const note = x.s.note ? `<br><em>Notiz: ${escapeHtml(x.s.note)}</em>` : '';
      return `<li><strong>Schritt ${x.i + 1}</strong>${marker ? ` (${escapeHtml(marker)})` : ''}: ${escapeHtml(stepText(r, x.s))}${note}</li>`;
    }).join('');

  const gesamtMin = r.steps.reduce((sum, s) => sum + (parseStepMinutes(stepText(r, s)) || 0), 0);

  return `
    <h1>Vorbereitung: ${escapeHtml(r.title)}</h1>
    <p>${r.servings} Personen je Gruppe${g > 1 ? ` × ${g} Gruppen` : ''} · ${r.steps.length} Schritte${gesamtMin ? ` · Warte-/Garzeiten gesamt ca. ${gesamtMin} Min.` : ''}</p>
    <h2>Einkaufen${g > 1 ? ' (für alle Gruppen)' : ''}</h2><ul>${zutaten}</ul>
    <h2>Geräte bereitstellen</h2><ul>${geraete}</ul>
    ${zeiten ? `<h2>Zeiten im Ablauf</h2><ul>${zeiten}</ul>` : ''}
    ${gefahren ? `<h2>Aufsicht nötig / Notizen</h2><ul>${gefahren}</ul>` : ''}`;
}
