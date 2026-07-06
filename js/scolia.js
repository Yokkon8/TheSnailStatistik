// Import von Scolia-CSV-Exporten. Scolia exportiert pro Statistik-Diagramm
// eine Datei wie "x01_games_daily_from_2023-01-29_to_2026-07-06.csv" mit
// Zeilen im Format: "2023-01-29T00:00:00.000Z";"13"
// Tägliche Exporte enthalten für spielfreie Tage eine 0 – bei Durchschnitts-
// werten werden diese Tage ignoriert, sonst würden sie den Schnitt verfälschen.

import { store } from "./store.js";

const METRIC_LABELS = {
  x01_games: "X01-Spiele",
  x01_throws: "Würfe",
  x01_180s: "180er",
  "x01_3-dart_average": "3-Dart-Schnitt",
  x01_scoring: "Scoring",
  "x01_first_9 average": "Erster-9-Schnitt",
  x01_checkout_rate: "Checkout-Rate",
  // ältere/abweichende Benennungen
  "180s": "180er",
  average: "3-Dart-Schnitt",
  first9_average: "Erster-9-Schnitt",
  checkout_rate: "Checkout-Rate",
  best_leg: "Bestes Leg",
};

function prettify(key) {
  return key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

// Durchschnitts- und Quoten-Diagramme: Mittelwert statt Summe
export function isMeanMetric(metric) {
  return /average|avg|rate|scoring|schnitt/.test(metric.key);
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
    values[dateKey] = Math.round(num * 100) / 100;
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
// Durchschnitts-/Quotenwerten (Mittelwert ohne spielfreie Tage).
export function scoliaYearValue(metric, year) {
  let vals = Object.entries(metric.values)
    .filter(([k]) => k.startsWith(year))
    .map(([, v]) => v);
  if (!vals.length) return null;
  if (metric.key.includes("best")) {
    vals = vals.filter((v) => v > 0);
    return vals.length ? Math.min(...vals) : null;
  }
  if (isMeanMetric(metric)) {
    vals = vals.filter((v) => v > 0);
    if (!vals.length) return null;
    return Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10;
  }
  return vals.reduce((a, b) => a + b, 0);
}

// Monatswerte fürs Balkendiagramm – tägliche Daten werden zu Monaten gebündelt
export function monthlyValues(metric, year) {
  const buckets = Array.from({ length: 12 }, () => []);
  for (const [k, v] of Object.entries(metric.values)) {
    if (!k.startsWith(year)) continue;
    buckets[Number(k.slice(5, 7)) - 1].push(v);
  }
  return buckets.map((vals) => {
    if (!vals.length) return 0;
    if (isMeanMetric(metric)) {
      const gespielt = vals.filter((v) => v > 0);
      if (!gespielt.length) return 0;
      return Math.round((gespielt.reduce((a, b) => a + b, 0) / gespielt.length) * 10) / 10;
    }
    return vals.reduce((a, b) => a + b, 0);
  });
}
