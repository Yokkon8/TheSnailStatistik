// Datenhaltung: lokal im Browser (localStorage), optional synchronisiert
// über SharePoint (siehe sync.js). Gelöschte Einträge werden als IDs in
// deletedIds vermerkt, damit die Löschung alle Geräte erreicht.

const KEY = "thesnail-data-v1";

export const TYPES = {
  "180": "180er",
  "171": "171+",
  "140": "140+",
  highfinish: "High Finish",
  shortleg: "Short Leg",
};

export const SOURCES = {
  scolia: "Scolia",
  godartspro: "GoDartsPro",
  russbray: "Russ Bray Scorer",
  manuell: "Manuell",
};

function demoData() {
  const d = (date, type, value, source, note = "") => ({
    id: newId(),
    date,
    type,
    value,
    source,
    note,
    demo: true,
  });
  return [
    d("2025-10-12", "shortleg", 15, "russbray"),
    d("2025-11-08", "180", null, "scolia"),
    d("2026-01-17", "180", null, "scolia"),
    d("2026-01-17", "140", null, "scolia"),
    d("2026-02-09", "171", null, "godartspro", "Training – Scoring-Übung"),
    d("2026-02-09", "shortleg", 14, "scolia"),
    d("2026-03-02", "180", null, "russbray", "Ligaspiel"),
    d("2026-03-19", "140", null, "manuell"),
    d("2026-04-14", "highfinish", 121, "manuell", "Ligaspiel – Doppel 14 raus"),
    d("2026-05-30", "shortleg", 12, "russbray", "Bestes Leg bisher!"),
    d("2026-06-21", "180", null, "scolia"),
    d("2026-06-21", "140", null, "scolia"),
  ];
}

export function newId() {
  return crypto.randomUUID
    ? crypto.randomUUID()
    : Date.now() + "-" + Math.random().toString(36).slice(2);
}

function emptyData() {
  return {
    settings: { name: "" },
    settingsUpdatedAt: "",
    highlights: [],
    deletedIds: [],
    scolia: {},
    scoliaClearedAt: "",
  };
}

// Führt lokalen und entfernten Stand zusammen: Vereinigung aller Einträge
// (per ID), Löschungen gewinnen, Beispieldaten werden nie synchronisiert.
export function mergeData(local, remote) {
  const deleted = new Set([...(local.deletedIds ?? []), ...(remote.deletedIds ?? [])]);
  const byId = new Map();
  for (const h of [...(remote.highlights ?? []), ...(local.highlights ?? [])]) {
    if (h.demo || deleted.has(h.id) || byId.has(h.id)) continue;
    byId.set(h.id, h);
  }
  const localNewer = (local.settingsUpdatedAt ?? "") >= (remote.settingsUpdatedAt ?? "");

  // Scolia-Metriken: pro Diagramm gewinnt der neuere Import;
  // nach "Alle Daten löschen" (scoliaClearedAt) bleiben ältere Importe draußen.
  const clearedAt = [local.scoliaClearedAt ?? "", remote.scoliaClearedAt ?? ""].sort().pop();
  const scolia = {};
  for (const src of [remote.scolia ?? {}, local.scolia ?? {}]) {
    for (const [key, metric] of Object.entries(src)) {
      if ((metric.importedAt ?? "") <= clearedAt) continue;
      if (!scolia[key] || (metric.importedAt ?? "") > (scolia[key].importedAt ?? "")) {
        scolia[key] = metric;
      }
    }
  }

  return {
    settings: (localNewer ? local.settings : remote.settings) ?? { name: "" },
    settingsUpdatedAt: localNewer ? (local.settingsUpdatedAt ?? "") : remote.settingsUpdatedAt,
    highlights: [...byId.values()],
    deletedIds: [...deleted],
    scolia,
    scoliaClearedAt: clearedAt,
  };
}

function changed() {
  window.dispatchEvent(new CustomEvent("thesnail-datachanged"));
}

export const store = {
  _cache: null,

  load() {
    if (!this._cache) {
      let data = null;
      try {
        const raw = localStorage.getItem(KEY);
        if (raw) data = JSON.parse(raw);
      } catch {
        data = null;
      }
      if (!data || !Array.isArray(data.highlights)) {
        data = { ...emptyData(), settings: { name: "The Snail" }, highlights: demoData() };
        this._cache = data;
        this.save();
      } else {
        // Ältere Speicherstände um neue Felder ergänzen
        data.deletedIds = data.deletedIds ?? [];
        data.settingsUpdatedAt = data.settingsUpdatedAt ?? "";
        data.scolia = data.scolia ?? {};
        data.scoliaClearedAt = data.scoliaClearedAt ?? "";
        this._cache = data;
      }
    }
    return this._cache;
  },

  save() {
    localStorage.setItem(KEY, JSON.stringify(this._cache));
  },

  add(highlight) {
    this.load().highlights.push(highlight);
    this.save();
    changed();
  },

  remove(id) {
    const data = this.load();
    data.highlights = data.highlights.filter((h) => h.id !== id);
    if (!data.deletedIds.includes(id)) data.deletedIds.push(id);
    this.save();
    changed();
  },

  setScoliaMetric(metric) {
    this.load().scolia[metric.key] = metric;
    this.save();
    changed();
  },

  touchSettings() {
    this.load().settingsUpdatedAt = new Date().toISOString();
    this.save();
    changed();
  },

  hasDemo() {
    return this.load().highlights.some((h) => h.demo);
  },

  removeDemo() {
    const data = this.load();
    data.highlights = data.highlights.filter((h) => !h.demo);
    this.save();
  },

  replace(data) {
    this._cache = {
      ...emptyData(),
      ...data,
      deletedIds: data.deletedIds ?? [],
      settingsUpdatedAt: data.settingsUpdatedAt ?? "",
    };
    this.save();
    changed();
  },

  // Wie replace, aber ohne Änderungs-Signal – wird von der Synchronisation
  // benutzt, damit kein Endlos-Kreislauf aus Sync → Änderung → Sync entsteht.
  replaceQuiet(data) {
    this._cache = data;
    this.save();
  },

  reset() {
    const data = this.load();
    const ids = data.highlights.filter((h) => !h.demo).map((h) => h.id);
    this._cache = {
      ...emptyData(),
      deletedIds: [...data.deletedIds, ...ids],
      scoliaClearedAt: new Date().toISOString(),
    };
    this.save();
    changed();
  },
};
