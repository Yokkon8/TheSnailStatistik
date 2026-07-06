// Datenhaltung: aktuell lokal im Browser (localStorage).
// Später ersetzbar durch eine Cloud-Synchronisation, ohne dass sich die App-Oberfläche ändert.

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
        data = { settings: { name: "The Snail" }, highlights: demoData() };
        this._cache = data;
        this.save();
      } else {
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
  },

  remove(id) {
    const data = this.load();
    data.highlights = data.highlights.filter((h) => h.id !== id);
    this.save();
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
    this._cache = data;
    this.save();
  },

  reset() {
    this._cache = { settings: { name: "" }, highlights: [] };
    this.save();
  },
};
