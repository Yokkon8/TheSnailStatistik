// Import der GoDartsPro-Trainingsbilanz. Eingelesen wird nur die
// "Members statistics summary" (Sessions und geworfene Darts) –
// die einzelnen Trainingsspiele werden bewusst nicht übernommen.

import { store } from "./store.js";

// Erste Zahl einer Zeile: "Sessions played 2599 64.97 0" → 2599
function ersteZahl(zeile) {
  const treffer = zeile.match(/\d+(?:[.,]\d+)?/);
  return treffer ? Number(treffer[0].replace(",", ".")) : null;
}

export function parseGdpStats(text) {
  const stats = { importedAt: new Date().toISOString() };
  for (const zeile of text.split(/\r?\n/)) {
    if (/sessions played/i.test(zeile) && stats.sessions === undefined) {
      const wert = ersteZahl(zeile.replace(/sessions played/i, ""));
      if (wert !== null) stats.sessions = wert;
    }
    if (/darts thrown/i.test(zeile) && stats.darts === undefined) {
      const wert = ersteZahl(zeile.replace(/darts thrown/i, ""));
      if (wert !== null) stats.darts = wert;
    }
  }
  if (stats.sessions === undefined && stats.darts === undefined) {
    throw new Error("Keine Summary gefunden – bitte den Block „Members statistics summary“ kopieren.");
  }
  return stats;
}

export function importGdpStats(text) {
  const stats = parseGdpStats(text);
  store.setGdp(stats);
  return stats;
}
