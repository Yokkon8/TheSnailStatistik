// Import der persönlichen 3K-Darts-Statistik. Die App bietet keinen Export,
// aber die Profil-Statistik lässt sich als Text kopieren – dieser Parser
// liest die Kennzahlen aus dem eingefügten Text.

import { store } from "./store.js";

// Letzte Zahl einer Zeile: "(75,2 %) 82" → 82, "Ø 64.30" → 64.3, "-" → null
function letzteZahl(zeile) {
  const treffer = zeile.match(/\d+(?:[.,]\d+)?/g);
  if (!treffer) return null;
  return Number(treffer[treffer.length - 1].replace(",", "."));
}

const FELDER = {
  "Anzahl Spiele": "spiele",
  "Spiele gewonnen": "siege",
  "Anzahl Legs": "legs",
  "Gewonnene Legs": "legsGewonnen",
  "3D Average": "average",
  "⌀ Erste 9D": "erste9",
  "60+": "s60",
  "80+": "s80",
  "100+": "s100",
  "140+": "s140",
  "180": "s180",
  "Checkout Anzahl": "checkouts",
  "Max Checkout": "maxCheckout",
  "Checkout 50+": "co50",
  "Checkout 100+": "co100",
};

export function parseDreikStats(text) {
  const zeilen = text.split(/\r?\n/).map((z) => z.trim()).filter(Boolean);
  const stats = { importedAt: new Date().toISOString(), dartsProLeg: {} };

  for (let i = 0; i < zeilen.length; i++) {
    const zeile = zeilen[i];
    const naechste = zeilen[i + 1] ?? "";
    const feld = FELDER[zeile];
    if (feld && stats[feld] === undefined) {
      const wert = letzteZahl(naechste);
      if (wert !== null) stats[feld] = wert;
      continue;
    }
    const legMatch = zeile.match(/^(\d{1,2}) Darts$/);
    if (legMatch) {
      const wert = letzteZahl(naechste);
      if (wert !== null) stats.dartsProLeg[legMatch[1]] = wert;
    }
  }

  if (stats.spiele === undefined && stats.s180 === undefined) {
    throw new Error("Das sieht nicht nach der 3K-Statistik aus – bitte den kompletten Text aus dem Profil einfügen.");
  }
  return stats;
}

export function importDreikStats(text) {
  const stats = parseDreikStats(text);
  store.setDreik(stats);
  return stats;
}

// Anzahl Short Legs (Legs mit höchstens 20 Darts)
export function dreikShortLegs(stats) {
  return Object.entries(stats.dartsProLeg ?? {})
    .filter(([darts]) => Number(darts) <= 20)
    .reduce((summe, [, anzahl]) => summe + anzahl, 0);
}

export function dreikBestesLeg(stats) {
  const gespielt = Object.entries(stats.dartsProLeg ?? {})
    .filter(([, anzahl]) => anzahl > 0)
    .map(([darts]) => Number(darts));
  return gespielt.length ? Math.min(...gespielt) : null;
}
