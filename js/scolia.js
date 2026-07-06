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

// Erzeugt Highlight-Einträge aus täglichen Scolia-Daten: Tage mit 180ern
// und – falls ein Best-Leg-Export vorhanden ist – Short Legs (≤ 20 Darts).
export function scoliaHighlightEvents(scoliaMap) {
  const events = [];
  for (const metric of Object.values(scoliaMap ?? {})) {
    if (metric.granularity !== "daily") continue;
    if (metric.key.includes("180")) {
      for (const [date, v] of Object.entries(metric.values)) {
        if (v > 0) {
          events.push({ id: `scolia-180-${date}`, type: "180", value: null, count: v, date, source: "scolia", virtual: true });
        }
      }
    } else if (metric.key.includes("best")) {
      for (const [date, v] of Object.entries(metric.values)) {
        if (v >= 9 && v <= 20) {
          events.push({ id: `scolia-shortleg-${date}`, type: "shortleg", value: v, count: 1, date, source: "scolia", virtual: true });
        }
      }
    }
  }
  return events;
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

// Bündelt Einzelwerte: Summe – bei Durchschnitts-/Quotenwerten Mittelwert
// ohne spielfreie Tage (Wert 0).
function aggregate(vals, metric) {
  if (!vals.length) return 0;
  if (isMeanMetric(metric)) {
    const gespielt = vals.filter((v) => v > 0);
    if (!gespielt.length) return 0;
    return Math.round((gespielt.reduce((a, b) => a + b, 0) / gespielt.length) * 10) / 10;
  }
  return vals.reduce((a, b) => a + b, 0);
}

const MONATE_KURZ = ["Jan", "Feb", "Mär", "Apr", "Mai", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dez"];

// Letzte N Monate rollierend (für die Monats-Ansicht bei "Alle Jahre")
export function rollingMonthlyValues(metric, count = 12) {
  const result = [];
  const now = new Date();
  for (let i = count - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const vals = Object.entries(metric.values)
      .filter(([k]) => k.startsWith(key))
      .map(([, v]) => v);
    result.push({
      label: `${MONATE_KURZ[d.getMonth()]} ${String(d.getFullYear()).slice(2)}`,
      value: aggregate(vals, metric),
    });
  }
  return result;
}

// Letzte N Tage (nur für täglich exportierte Statistiken)
export function lastDailyValues(metric, count = 30) {
  if (metric.granularity !== "daily") return null;
  const result = [];
  const now = new Date();
  for (let i = count - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    result.push({ label: `${d.getDate()}.${d.getMonth() + 1}.`, value: metric.values[key] ?? 0 });
  }
  return result;
}

// Jahreswerte für die Gesamt-Ansicht: ein Balken pro Jahr
export function yearlyValues(metric) {
  const years = [...new Set(Object.keys(metric.values).map((k) => k.slice(0, 4)))].sort();
  return years.map((year) => ({ year, value: scoliaYearValue(metric, year) ?? 0 }));
}

// Monatswerte fürs Balkendiagramm – tägliche Daten werden zu Monaten gebündelt
export function monthlyValues(metric, year) {
  const buckets = Array.from({ length: 12 }, () => []);
  for (const [k, v] of Object.entries(metric.values)) {
    if (!k.startsWith(year)) continue;
    buckets[Number(k.slice(5, 7)) - 1].push(v);
  }
  return buckets.map((vals) => aggregate(vals, metric));
}
