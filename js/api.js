// Aufrufe an den Cloudflare Worker. Worker-URL lokal überschreibbar:
// localStorage.setItem('bildrezept_worker_url', 'http://localhost:8787')
const DEFAULT_WORKER_URL = 'https://bildrezepte-api.urff.workers.dev';

// Basis-URL für QR-/Teilen-Links: die tatsächlich gehostete Adresse
// (z.B. lernsoftware-mathematik.de/bildrezepte) — lokal/Datei: die Zieldomain.
export const APP_BASE_URL = (() => {
  if (typeof location === 'undefined') return 'https://bildrezepte.urff.app'; // Node-Tests
  const local = !location.protocol.startsWith('http')
    || ['localhost', '127.0.0.1'].includes(location.hostname);
  if (local) return 'https://bildrezepte.urff.app';
  return location.origin + location.pathname.replace(/index\.html$/, '').replace(/\/$/, '');
})();

function workerUrl() {
  return localStorage.getItem('bildrezept_worker_url') || DEFAULT_WORKER_URL;
}

/** In der iOS-App laufen GET-Anfragen durch den nativen Offline-Puffer:
 *  einmal geladen = lokal gespeichert, offline weiter verfügbar. */
export function viaCache(url) {
  if (typeof window !== 'undefined' && window.isNativeApp && window.nativeCacheScheme) {
    return `${window.nativeCacheScheme}://proxy?u=${encodeURIComponent(url)}`;
  }
  return url;
}

export async function chat(messages, { json = false } = {}) {
  const body = { messages };
  if (json) body.response_format = { type: 'json_object' };
  const res = await fetch(`${workerUrl()}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Die KI ist gerade nicht erreichbar (HTTP ${res.status}). Bitte nochmal versuchen.`);
  const data = await res.json();
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error('Die KI hat keine Antwort geliefert. Bitte nochmal versuchen.');
  return content;
}

export async function fetchRecipePage(targetUrl) {
  const res = await fetch(`${workerUrl()}/api/fetch?url=${encodeURIComponent(targetUrl)}`);
  if (!res.ok) throw new Error('Die Internetseite konnte nicht geladen werden.');
  return res.json(); // { title, text }
}

export async function publishRecipe(recipe) {
  const res = await fetch(`${workerUrl()}/api/recipes`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(recipe),
  });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Teilen fehlgeschlagen.');
  const { id } = await res.json();
  return { id, url: `${APP_BASE_URL}/#r=${id}` };
}

export async function fetchSharedRecipe(id) {
  const res = await fetch(viaCache(`${workerUrl()}/api/recipes/${id}`));
  if (!res.ok) throw new Error('Dieses Rezept wurde nicht gefunden.');
  return res.json();
}

// ===== Öffentliche Rezepte-Sammlung =====
export const COLLECTION_CATEGORIES = ['Backen süß', 'Backen herzhaft', 'Kochen', 'Ohne Kochen', 'Snacks', 'Nachtisch', 'Getränke'];

/** Veröffentlichen mit serverseitiger KI-Prüfung. Liefert {ok, …} oder wirft bei Technikfehlern. */
export async function publishToCollection(recipe, summary, author) {
  const res = await fetch(`${workerUrl()}/api/collection`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ recipe, summary, author }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Veröffentlichen hat nicht geklappt. Bitte später nochmal versuchen.');
  return data; // {ok:true, id, categories, keywords} oder {ok:false, reason, suggestions}
}

export async function searchCollection({ q = '', cat = '', offset = 0 } = {}) {
  const params = new URLSearchParams();
  if (q) params.set('q', q);
  if (cat) params.set('cat', cat);
  if (offset) params.set('offset', String(offset));
  const res = await fetch(viaCache(`${workerUrl()}/api/collection?${params}`));
  if (!res.ok) throw new Error('Die Sammlung ist gerade nicht erreichbar.');
  return res.json(); // {items, hasMore}
}

export async function fetchCollectionRecipe(id) {
  const res = await fetch(viaCache(`${workerUrl()}/api/collection/${id}`));
  if (!res.ok) throw new Error('Dieses Rezept wurde nicht gefunden.');
  return res.json();
}

export async function reportCollectionRecipe(id) {
  await fetch(`${workerUrl()}/api/collection/${id}/report`, { method: 'POST' });
}

function authHeaders({ ownerToken = '', adminPw = '' } = {}) {
  return adminPw ? { 'X-Admin-Token': adminPw } : { 'X-Owner-Token': ownerToken };
}

/** Veröffentlichtes Rezept aktualisieren (Urheber oder Admin) — wird erneut KI-geprüft. */
export async function updateCollectionRecipe(id, recipe, summary, author, auth) {
  const res = await fetch(`${workerUrl()}/api/collection/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...authHeaders(auth) },
    body: JSON.stringify({ recipe, summary, author }),
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 404) throw new Error('nicht-gefunden');
  if (res.status === 403) throw new Error('Keine Berechtigung — falsches Passwort oder fremdes Rezept.');
  if (!res.ok) throw new Error(data.error || 'Aktualisieren hat nicht geklappt.');
  return data;
}

export async function deleteCollectionRecipe(id, auth) {
  const res = await fetch(`${workerUrl()}/api/collection/${id}`, {
    method: 'DELETE',
    headers: authHeaders(auth),
  });
  if (res.status === 403) throw new Error('Keine Berechtigung — falsches Passwort oder fremdes Rezept.');
  if (!res.ok) throw new Error('Löschen hat nicht geklappt.');
}
