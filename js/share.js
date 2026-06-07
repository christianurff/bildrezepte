// Teilen: Rezept in KV ablegen → Kurzlink + QR-Code.
import { publishRecipe } from './api.js';

export async function shareRecipe(recipe) {
  // Kochfortschritt liegt separat; Veröffentlichungs-Infos (Owner-Token!)
  // gehören nicht in den geteilten Link.
  const clean = { ...recipe };
  delete clean.published;
  const { id, url } = await publishRecipe(clean);
  return { id, url };
}

export function renderQr(container, url) {
  const qr = window.qrcode(0, 'M');
  qr.addData(url);
  qr.make();
  container.innerHTML = qr.createSvgTag({ cellSize: 5, margin: 2, scalable: true });
}
