// Import von Scolia-CSV-Exporten. Scolia exportiert pro Statistik-Diagramm
// eine Datei wie "x01_games_monthly_from_2023-01-01_to_2026-07-01.csv" mit
// Zeilen im Format: "2023-01-01T00:00:00.000Z";"13"

import { store } from "./store.js";

const METRIC_LABELS = {
  x01_games: "X01-Spiele",
  "180s": "180er",
  "171s": "171+",
  "140s": "140+",
  best_leg: "Bestes Leg",
  average: "3-Dart-Average",
  first9_average: "First-9-Average",
  checkout_rate: "Checkout-Quote",
};

function prettify(key) {
  return key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export function parseScoliaCsv(filename, text) {
  const base = filename.replace(/\.csv$/i, "").trim();
  const match = base.match(/^(.+?)_(monthly|weekly|daily|yearly)_from_/i);
  const key = (match ? match[1] : base).toLowerCase();
  const granularity = match ? match[2].toLowerCase() : "monthly";

  const values = {};
  let count = 0;
  for (const line of text.split(/\r?\n/)) {
    const fields = [...line.matchAll(/"([^"]*)"/g)].map((f) => f[1]);
    if (fields.length < 2) continue;
    const [dateRaw, valueRaw] = fields;
    if (!/^\d{4}-\d{2}-\d{2}T/.test(dateRaw)) continue; // Kopfzeile überspringen
    const num = Number(valueRaw.replace(",", "."));
    if (!Number.isFinite(num)) continue;
    const dateKey = granularity === "monthly" ? dateRaw.slice(0, 7) : dateRaw.slice(0, 10);
    values[dateKey] = num;
    count++;
  }
  if (!count) throw new Error(`„${filename}" enthält keine lesbaren Datenzeilen`);

  return {
    key,
    granularity,
    label: METRIC_LABELS[key] ?? prettify(key),
    importedAt: new Date().toISOString(),
    values,
  };
}

export async function importScoliaFiles(fileList) {
  const imported = [];
  for (const file of fileList) {
    const metric = parseScoliaCsv(file.name, await file.text());
    store.setScoliaMetric(metric);
    imported.push(metric);
  }
  return imported;
}

// Jahreswert einer Metrik: Summe – außer bei "best" (Minimum) und
// Durchschnitts-/Quotenwerten (Mittelwert).
export function scoliaYearValue(metric, year) {
  const vals = Object.entries(metric.values)
    .filter(([k]) => k.startsWith(year))
    .map(([, v]) => v);
  if (!vals.length) return null;
  if (metric.key.includes("best")) return Math.min(...vals);
  if (metric.key.includes("average") || metric.key.includes("rate")) {
    return Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10;
  }
  return vals.reduce((a, b) => a + b, 0);
}
