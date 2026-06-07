// Schlichte SVG-Icons (Stroke, currentColor) — keine Emojis im UI.
// Verwendung: HTML-Elemente mit data-icon="name" bekommen das Icon vorangestellt
// (data-icon-after="name" hängt es hinten an), JS-Code nutzt icon('name').
const PATHS = {
  camera: '<path d="M4 8h3l2-3h6l2 3h3v12H4z"/><circle cx="12" cy="13" r="3.5"/>',
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a13.5 13.5 0 0 1 0 18M12 3a13.5 13.5 0 0 0 0 18"/>',
  text: '<path d="M5 7V5h14v2M12 5v14M9 19h6"/>',
  pencil: '<path d="M12 20h9M16.5 3.5l4 4L7 21H3v-4z"/>',
  pot: '<path d="M5 11h14v6a3 3 0 0 1-3 3H8a3 3 0 0 1-3-3zM3 11h18M9.5 7c0-1.2 1-1.8 1-3M14.5 7c0-1.2 1-1.8 1-3"/>',
  printer: '<path d="M6 9V3h12v6M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/>',
  share: '<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="M8.6 13.5l6.8 4M15.4 6.5l-6.8 4"/>',
  home: '<path d="M3 11l9-8 9 8M5 10v10h14V10"/>',
  trash: '<path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14M10 11v6M14 11v6"/>',
  speaker: '<path d="M11 5L6 9H2v6h4l5 4zM15.5 8.5a5 5 0 0 1 0 7M18.4 5.6a9 9 0 0 1 0 12.8"/>',
  image: '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/>',
  left: '<path d="M15 18l-6-6 6-6"/>',
  right: '<path d="M9 18l6-6-6-6"/>',
  check: '<path d="M20 6L9 17l-5-5"/>',
  restart: '<path d="M3 12a9 9 0 1 0 3-6.7M3 4v5h5"/>',
  expand: '<path d="M8 3H3v5M16 3h5v5M3 16v5h5M21 16v5h-5"/>',
  compress: '<path d="M8 3v5H3M16 3v5h5M3 16h5v5M21 16h-5v5"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/>',
  save: '<path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2zM17 21v-8H7v8M7 3v5h8"/>',
  upload: '<path d="M12 16V4M6 10l6-6 6 6M4 20h16"/>',
  flag: '<path d="M4 21V4c4-2 8 2 12 0v9c-4 2-8-2-12 0"/>',
  heart: '<path d="M12 21S4 14.5 4 8.8C4 6 6.2 4 8.7 4c1.4 0 2.6.7 3.3 1.8C12.7 4.7 13.9 4 15.3 4 17.8 4 20 6 20 8.8 20 14.5 12 21 12 21z"/>',
  flame: '<path d="M12 3c1.5 3.5-2.5 4.5-2.5 8a2.5 2.5 0 0 0 5 0c0-1.4-.7-2.2-1-3.3C16 8.8 18 10.6 18 14a6 6 0 1 1-12 0c0-5 5-6.5 6-11z"/>',
  knife: '<path d="M3 18L13 8l3 3-7 7H3z"/><path d="M16 11l5-5-2-2-5 5"/>',
  hand: '<path d="M8 12V6a1.5 1.5 0 0 1 3 0v5M11 11V4.5a1.5 1.5 0 0 1 3 0V11M14 11V6a1.5 1.5 0 0 1 3 0v6.5"/><path d="M17 12.5V14a7 7 0 0 1-7 7c-2.4 0-3.8-1-5.2-3L3 14.7a1.6 1.6 0 0 1 2.5-2L8 15"/>',
  shield: '<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/>',
  gear: '<circle cx="12" cy="12" r="3.2"/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5 5l2.1 2.1M16.9 16.9L19 19M19 5l-2.1 2.1M7.1 16.9L5 19"/>',
  basket: '<circle cx="9" cy="20" r="1.6"/><circle cx="17" cy="20" r="1.6"/><path d="M3 4h2l2.5 11h10L21 7H6"/>',
  lock: '<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
  timer: '<circle cx="12" cy="13.5" r="7.5"/><path d="M12 10v3.5l2.5 2.5M9.5 2.5h5M12 2.5V6"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5.5"/><circle cx="12" cy="7.6" r="0.6" fill="currentColor"/>',
};

/** Zuordnung Schritt-Marker → Icon (festes Vokabular aus recipe-model.js). */
export const FLAG_ICONS = { heiss: 'flame', scharf: 'knife', hilfe: 'hand' };

export function icon(name, cls = 'icon') {
  return `<svg class="${cls}" viewBox="0 0 24 24" aria-hidden="true">${PATHS[name] || ''}</svg>`;
}

/** Alle data-icon-Attribute im Dokument auflösen (einmal beim Start). */
export function applyIcons(root = document) {
  root.querySelectorAll('[data-icon]').forEach((el) =>
    el.insertAdjacentHTML('afterbegin', icon(el.dataset.icon)));
  root.querySelectorAll('[data-icon-after]').forEach((el) =>
    el.insertAdjacentHTML('beforeend', icon(el.dataset.iconAfter)));
}
