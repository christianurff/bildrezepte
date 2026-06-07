// KI-Pipeline: Eingabe (Foto/URL/Text) → strukturiertes Bildrezept mit Symbolen.
import { chat, fetchRecipePage } from './api.js';
import { buildRecipeFromAi } from './recipe-model.js';
import { resolveRecipeSymbols } from './arasaac.js';

export const SYSTEM_PROMPT = `Du wandelst Kochrezepte in „Bildrezepte" für Kinder mit kognitiver Beeinträchtigung um.
Antworte AUSSCHLIESSLICH mit einem JSON-Objekt nach diesem Schema:
{
  "title": "Kurzer Rezeptname",
  "servingsBase": 4,
  "ingredients": [
    { "qty": { "value": 200, "unit": "g" }, "name": "Mehl", "nameSingular": "", "search": ["Mehl"] }
  ],
  "tools": [ { "name": "Schüssel", "search": ["Schüssel"] } ],
  "steps": [
    { "chunks": [
      { "text": "Wiege", "search": ["wiegen", "Waage"] },
      { "ref": 0 },
      { "text": "ab", "search": [] }
    ], "flags": [] },
    { "chunks": [
      { "text": "Gib", "search": ["geben"] },
      { "ref": 0 },
      { "text": "in", "arrow": true },
      { "text": "die Schüssel", "search": ["Schüssel"] }
    ], "flags": [] }
  ]
}

REGELN FÜR EINHEITEN:
- Erlaubt sind NUR diese "unit"-Werte: "g" (Gramm), "ml" (Milliliter), "el" (großer Löffel), "tl" (kleiner Löffel), "becher", "prise", "pck" (Päckchen), "stueck" (zählbare Dinge wie Eier, Äpfel).
- Rechne alle anderen Angaben in diese Einheiten um (z.B. „1 Tasse" → "becher", „1 EL" → "el").
- Vage Angaben („etwas", „nach Geschmack") → 1 "prise" oder weglassen.
- "value" ist eine Zahl: ganzzahlig oder ,5 (z.B. 0.5, 1.5). Keine anderen Brüche.
- Bei "stueck": "name" im Plural („Eier"), "nameSingular" im Singular („Ei"). Sonst "nameSingular": "".

REGELN FÜR SCHRITTE:
- Genau EINE Handlung pro Schritt. Kurzer Hauptsatz im Imperativ („Gib …", „Rühre …", „Schneide …").
- Wenn eine Zutat abgemessen oder abgewogen werden muss: ZUERST ein eigener Mess-Schritt („Wiege … ab" mit Waage / „Miss … ab" mit Löffel oder Messbecher), DANACH ein eigener Verwendungs-Schritt („Gib das Mehl in die Schüssel.").
- Mengenangaben erscheinen IMMER als { "ref": <Index der Zutat in "ingredients"> }-Chunk, nie als ausgeschriebener Text. Aber: "ref" nur beim Abmessen und beim ERSTEN Verwenden einer Zutat — danach die Zutat nur noch beim Namen nennen („die Kartoffeln", „das Mehl") als normaler Text-Chunk.
- "chunks" sind Wortgruppen aus 1–3 Wörtern. Inhaltstragende Wortgruppen (Tätigkeiten, Dinge, Geräte, Orte) bekommen 1–3 ARASAAC-Suchbegriffe in "search" (bester zuerst; einfache Grundformen wie „rühren", „Schüssel", „Backofen"). Funktionswörter („in", „ab", „dann") bekommen "search": [].
- Geräte und Orte im Schritt bekommen IMMER Suchbegriffe — auch mit Artikel davor: „mit dem Messer" → "search": ["Messer"], „in einem Topf" → "search": ["Topf"], „in die Pfanne" → "search": ["Pfanne"].
- Wenn etwas in, auf oder an etwas kommt (geben, schütten, füllen, stellen, legen, schieben), endet der Schritt IMMER mit Pfeil + Ziel: zuerst der Pfeil-Chunk { "text": "in", "arrow": true } — der Pfeil ist das Bild, der "text" (Präposition wie „in", „auf") wird gesprochen —, DIREKT DANACH der Ziel-Chunk mit Suchbegriffen, z.B. { "text": "die Schüssel", "search": ["Schüssel"] }.
- Nach einem Pfeil-Chunk folgt IMMER ein Ziel-Chunk mit Suchbegriffen (Schüssel, Topf, Pfanne, Backofen, Teller …). Ein Pfeil steht nie am Ende eines Schritts, und sein Ziel-Chunk hat nie ein leeres "search".
- Präposition und Ziel NIE in einem Chunk zusammenfassen. FALSCH: { "text": "in die Schüssel" }. RICHTIG: { "text": "in", "arrow": true } gefolgt von { "text": "die Schüssel", "search": ["Schüssel"] }.
- WICHTIG: Alle Chunk-Texte eines Schritts ergeben hintereinander gelesen einen vollständigen, grammatisch und orthografisch korrekten deutschen Satz — mit Artikeln und im richtigen Fall. RICHTIG: „Gare alles in der Heißluftfritteuse." FALSCH: „Gare alle in Heißluftfritteuse." Lies jeden Satz zur Probe.
- Ziel-Chunks enthalten immer den Artikel im grammatisch passenden Fall („in die Schüssel", „auf dem Backblech", „in der Pfanne").
- Sicherheits-Marker: Setze bei Gefahren-Schritten "flags" — "heiss" (Herd, Backofen, kochendes Wasser, heiße Pfanne), "scharf" (Messer, Reibe, Sparschäler), "hilfe" (Kind soll vorher einen Erwachsenen holen, z.B. Backofen öffnen). Maximal 2 Marker pro Schritt, nur wenn wirklich zutreffend; sonst "flags": [].
- Temperaturangaben NIE weglassen — eigener Schritt: „Stelle den Backofen auf 180 Grad." (search: „Backofen").
- Die App hat einen eingebauten Timer: Steht im Schritttext eine Dauer („20 Minuten", „2 Stunden"), erscheint am Schritt automatisch eine Timer-Uhr zum Starten. Back-, Koch-, Warte- und Ruhezeiten deshalb NIE weglassen, sondern als eigenen Schritt MIT der Dauer im Text schreiben: „Backe die Muffins 20 Minuten." (search: „backen", „Backofen"), „Warte 10 Minuten." (search: „warten"), „Lass den Teig 30 Minuten ruhen." (search: „warten", „Teig"). KEINE Extra-Schritte wie „Stelle den Timer auf 20 Minuten." oder „Warte, bis der Timer klingelt." — der Timer ist schon da.
- Dauern immer als ganze Zahlen: „90 Minuten" oder „2 Stunden", NIE „1,5 Stunden" oder „eine halbe Stunde" (→ „30 Minuten").
- Reihenfolge logisch und lückenlos: Vorbereitung → Zubereitung → Fertig.

HILFSMITTEL:
- Liste ALLE Geräte und Gegenstände, die angefasst werden (Schüssel, Waage, Löffel, Messer, Brett, Backblech, Topflappen …), jeweils mit "search"-Begriffen.
- Auch Backofen, Herd und ähnliche Geräte gehören in "tools", wenn sie benutzt werden — jedes Ziel hinter einem Pfeil muss in "tools" auftauchen (außer es ist eine Zutat).`;

/** Foto clientseitig verkleinern → DataURL (max. 1280 px).
 *  PNGs mit Transparenz bleiben PNG (JPEG würde sie schwarz machen),
 *  alles andere wird platzsparendes JPEG. */
export function resizeImage(file, maxDim = 1280, quality = 0.85) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      const px = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      let transparent = false;
      for (let i = 3; i < px.length; i += 4) {
        if (px[i] < 255) { transparent = true; break; }
      }
      resolve(transparent ? canvas.toDataURL('image/png') : canvas.toDataURL('image/jpeg', quality));
      URL.revokeObjectURL(img.src);
    };
    img.onerror = () => reject(new Error('Das Bild konnte nicht gelesen werden.'));
    img.src = URL.createObjectURL(file);
  });
}

async function structureRecipe(userContent, onProgress) {
  onProgress('Schritte werden erstellt …');
  const messages = [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: userContent },
  ];
  for (let attempt = 0; attempt < 2; attempt++) {
    const answer = await chat(messages, { json: true });
    try {
      return buildRecipeFromAi(JSON.parse(answer.replace(/^```json?\s*|```\s*$/g, '')));
    } catch (err) {
      if (attempt === 1) throw new Error(`Die KI-Antwort war unbrauchbar: ${err.message}`);
      messages.push({ role: 'assistant', content: answer });
      messages.push({ role: 'user', content: `Deine Antwort war kein gültiges JSON nach Schema (${err.message}). Antworte erneut, NUR mit dem JSON-Objekt.` });
    }
  }
}

/** Haupteinstieg. input: {type:'text'|'url'|'photo', value} */
export async function generateRecipe(input, onProgress = () => {}) {
  let userContent;
  if (input.type === 'photo') {
    onProgress('Foto wird gelesen …');
    userContent = [
      { type: 'text', text: 'Hier ist ein fotografiertes Rezept. Erstelle daraus das Bildrezept-JSON.' },
      { type: 'image_url', image_url: { url: input.value } },
    ];
  } else if (input.type === 'url') {
    onProgress('Internetseite wird gelesen …');
    const page = await fetchRecipePage(input.value);
    if (!page.text || page.text.length < 50) throw new Error('Auf dieser Seite wurde kein Rezepttext gefunden.');
    userContent = `Rezept von der Seite „${page.title}":\n\n${page.text}`;
  } else {
    userContent = `Rezept:\n\n${input.value}`;
  }
  const recipe = await structureRecipe(userContent, onProgress);
  onProgress('Bilder werden gesucht …');
  await resolveRecipeSymbols(recipe, (done, total) => onProgress(`Bilder werden gesucht … ${done}/${total}`));
  return recipe;
}
