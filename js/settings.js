// Anzeige-Einstellungen (pro Gerät, localStorage). Bewusst wenige Schalter.
const $ = (id) => document.getElementById(id);

/** Sicherheits-Marker (heiß/scharf/Hilfe) anzeigen — Standard: an. */
export const showFlags = () => localStorage.getItem('bildrezept_set_flags') !== '0';

/** Mengen als Bilder („3 Löffel" = 3 Symbole) — Standard: an. */
export const showMengenbilder = () => localStorage.getItem('bildrezept_set_mengen') !== '0';

/** Schritte im Kochmodus automatisch vorlesen — Standard: aus. */
export const autoSpeak = () => localStorage.getItem('bildrezept_set_autospeak') === '1';

/** Nachfragen, bevor ein gleichnamiges Rezept überschrieben wird — Standard: aus
 *  (stilles Auto-Überschreiben). Wird in js/storage.js ausgewertet. */
export const overwriteFragen = () => localStorage.getItem('bildrezept_set_overwrite_fragen') === '1';

export function initSettings(onChange) {
  $('nav-settings').addEventListener('click', () => {
    $('set-flags').checked = showFlags();
    $('set-mengen').checked = showMengenbilder();
    $('set-autospeak').checked = autoSpeak();
    $('set-overwrite-fragen').checked = overwriteFragen();
    $('settings-dialog').showModal();
  });
  $('settings-close').addEventListener('click', () => {
    localStorage.setItem('bildrezept_set_flags', $('set-flags').checked ? '1' : '0');
    localStorage.setItem('bildrezept_set_mengen', $('set-mengen').checked ? '1' : '0');
    localStorage.setItem('bildrezept_set_autospeak', $('set-autospeak').checked ? '1' : '0');
    localStorage.setItem('bildrezept_set_overwrite_fragen', $('set-overwrite-fragen').checked ? '1' : '0');
    $('settings-dialog').close();
    onChange();
  });
}
