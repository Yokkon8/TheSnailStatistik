import { store, TYPES, SOURCES, newId } from "./store.js";
import { auth } from "./auth.js";
import { sync } from "./sync.js";
import { importScoliaFiles, scoliaYearValue, monthlyValues, yearlyValues } from "./scolia.js";

const view = document.getElementById("view");
const state = { year: null, filter: "alle" };

// ---------- Hilfsfunktionen ----------

function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
  );
}

function fmtNum(n) {
  return n.toLocaleString("de-DE");
}

function fmtDate(iso) {
  return new Date(iso + "T12:00:00").toLocaleDateString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function typeLabel(h) {
  if (h.type === "shortleg") return `${h.value}-Darter`;
  if (h.type === "highfinish") return `${h.value}er Finish`;
  return TYPES[h.type] ?? h.type;
}

function sortedHighlights(list) {
  return [...list].sort((a, b) => b.date.localeCompare(a.date));
}

let toastTimer;
function toast(msg) {
  const t = document.getElementById("toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove("show"), 2500);
}

function highlightRow(h, withDelete) {
  return `
    <li class="hl-row">
      <span class="badge t-${esc(h.type)}">${esc(typeLabel(h))}</span>
      <div class="hl-main">
        <div class="hl-title">${esc(h.note) || esc(TYPES[h.type] ?? "")}</div>
        <div class="hl-sub">${fmtDate(h.date)} &middot; ${esc(SOURCES[h.source] ?? h.source)}</div>
      </div>
      ${withDelete ? `<button class="icon-btn" data-del="${esc(h.id)}" title="Eintrag löschen">✕</button>` : ""}
    </li>`;
}

// Hinweis-Banner zur Anmeldung, solange noch kein Microsoft-Konto verbunden ist
function loginBanner() {
  if (!auth.available() || auth.account()) return "";
  return `
    <div class="panel sync-banner">
      <img class="sync-banner-logo" src="images/logo-fs.png" alt="">
      <div class="sync-banner-text">Melde dich mit deinem Microsoft-Konto an, dann sind deine
        Statistiken auf PC, iPhone und iPad immer auf demselben Stand.</div>
      <button class="btn primary" id="btn-login">Mit Microsoft anmelden</button>
    </div>`;
}

function syncInfoText() {
  if (sync.status === "synct") return "☁️ Synchronisiere…";
  if (sync.status === "fehler") return "⚠️ Letzter Versuch fehlgeschlagen: " + esc(sync.error ?? "");
  if (sync.lastSync) {
    const zeit = sync.lastSync.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
    return `☁️ Zuletzt synchronisiert: ${zeit} Uhr`;
  }
  return "Noch nicht synchronisiert.";
}

// Scolia-Sektion der Übersicht: Jahreswerte + Balkendiagramm
// (prefix = Jahr wie "2026" oder "" für die Gesamt-Ansicht)
function scoliaSection(data, prefix, isGesamt) {
  const metrics = Object.values(data.scolia ?? {});
  if (!metrics.length) return "";

  const cards = metrics
    .map((m) => ({ metric: m, value: scoliaYearValue(m, prefix) }))
    .filter((c) => c.value !== null)
    .map(
      (c) => `
      <div class="stat">
        <div class="stat-num green">${fmtNum(c.value)}${c.metric.key.includes("rate") ? "&thinsp;%" : ""}</div>
        <div class="stat-label">${esc(c.metric.label)}</div>
      </div>`
    )
    .join("");

  const chartMetric = (data.scolia ?? {}).x01_games ?? metrics[0];
  return `
    <h2>Aus Scolia</h2>
    ${cards ? `<div class="stat-grid">${cards}</div>` : `<div class="panel empty">Für ${isGesamt ? "diesen Zeitraum" : esc(prefix)} sind keine Scolia-Werte importiert.</div>`}
    ${chartMetric ? barChart(chartMetric, prefix, isGesamt) : ""}
  `;
}

function barChart(metric, year, isGesamt) {
  let labels, werte, untertitel;
  if (isGesamt) {
    const proJahr = yearlyValues(metric);
    labels = proJahr.map((e) => e.year);
    werte = proJahr.map((e) => e.value ?? 0);
    untertitel = `${esc(metric.label)} pro Jahr`;
  } else {
    labels = ["Jan", "Feb", "Mär", "Apr", "Mai", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dez"];
    werte = monthlyValues(metric, year);
    untertitel = `${esc(metric.label)} pro Monat ${esc(year)}`;
  }
  if (!werte.some((v) => v > 0)) return "";
  const max = Math.max(...werte);
  return `
    <div class="panel bar-chart">
      <div class="bars">
        ${werte
          .map(
            (v, i) => `
          <div class="bar-col">
            <div class="bar-value">${v ? fmtNum(v) : ""}</div>
            <div class="bar" style="height:${Math.max(Math.round((v / max) * 100), v > 0 ? 3 : 0)}%"></div>
            <div class="bar-label">${labels[i]}</div>
          </div>`
          )
          .join("")}
      </div>
      <div class="hl-sub" style="margin-top:10px;">${untertitel}</div>
    </div>`;
}

// ---------- Übersicht ----------

function renderDashboard(root) {
  const data = store.load();
  const currentYear = String(new Date().getFullYear());
  // Jahre aus manuellen Highlights UND Scolia-Daten einsammeln
  const years = new Set([currentYear]);
  data.highlights.forEach((h) => years.add(h.date.slice(0, 4)));
  Object.values(data.scolia ?? {}).forEach((m) =>
    Object.keys(m.values).forEach((k) => years.add(k.slice(0, 4)))
  );
  const yearList = [...years].sort().reverse();
  if (!state.year || (state.year !== "gesamt" && !yearList.includes(state.year))) {
    state.year = currentYear;
  }

  const isGesamt = state.year === "gesamt";
  const prefix = isGesamt ? "" : state.year; // startsWith("") trifft alles

  const hs = data.highlights.filter((h) => h.date.startsWith(prefix));
  const count = (type) => hs.filter((h) => h.type === type).length;
  const shortlegs = hs.filter((h) => h.type === "shortleg");
  const bestLeg = shortlegs.length ? Math.min(...shortlegs.map((h) => h.value)) : null;
  const latest = sortedHighlights(hs).slice(0, 5);

  root.innerHTML = `
    <h1>Übersicht</h1>
    <p class="page-sub">Deine Dart-Highlights auf einen Blick.</p>
    ${loginBanner()}
    <div class="toolbar">
      <label for="year-select" style="color:var(--muted);font-weight:600;">Jahr:</label>
      <select id="year-select" class="year-select">
        <option value="gesamt" ${isGesamt ? "selected" : ""}>Alle Jahre</option>
        ${yearList.map((y) => `<option value="${y}" ${y === state.year ? "selected" : ""}>${y}</option>`).join("")}
      </select>
    </div>
    <div class="stat-grid">
      <div class="stat"><div class="stat-num gold">${count("180")}</div><div class="stat-label">180er</div></div>
      <div class="stat"><div class="stat-num red">${count("171")}</div><div class="stat-label">171+</div></div>
      <div class="stat"><div class="stat-num blue">${count("140")}</div><div class="stat-label">140+</div></div>
      <div class="stat"><div class="stat-num green">${count("highfinish")}</div><div class="stat-label">High Finishes</div></div>
      <div class="stat"><div class="stat-num">${shortlegs.length}</div><div class="stat-label">Short Legs</div></div>
      <div class="stat"><div class="stat-num">${bestLeg ? bestLeg : "–"}</div><div class="stat-label">Bestes Leg (Darts)</div></div>
    </div>
    ${scoliaSection(data, prefix, isGesamt)}
    <h2>Letzte Highlights</h2>
    ${
      latest.length
        ? `<ul class="hl-list">${latest.map((h) => highlightRow(h, false)).join("")}</ul>`
        : `<div class="panel empty">Noch keine Highlights ${isGesamt ? "erfasst" : "in " + esc(state.year)}.<br>Trag dein erstes unter <a href="#/erfassen">Erfassen</a> ein! 🎯</div>`
    }
    ${
      store.hasDemo()
        ? `<div class="hint">ℹ️ Du siehst gerade <strong>Beispieldaten</strong>, damit du dir die App vorstellen kannst. Unter <a href="#/einstellungen">Mehr</a> kannst du sie mit einem Klick entfernen.</div>`
        : ""
    }
  `;

  root.querySelector("#year-select").addEventListener("change", (e) => {
    state.year = e.target.value;
    renderDashboard(root);
  });
  root.querySelector("#btn-login")?.addEventListener("click", () => auth.login());
}

// ---------- Highlights ----------

function renderHighlights(root) {
  const data = store.load();
  const filters = [
    ["alle", "Alle"],
    ["180", "180er"],
    ["171", "171+"],
    ["140", "140+"],
    ["highfinish", "High Finish"],
    ["shortleg", "Short Legs"],
  ];
  const list = sortedHighlights(
    state.filter === "alle"
      ? data.highlights
      : data.highlights.filter((h) => h.type === state.filter)
  );

  root.innerHTML = `
    <h1>Highlights</h1>
    <p class="page-sub">Alle erfassten Highlights, neueste zuerst.</p>
    <div class="chip-row">
      ${filters
        .map(
          ([key, label]) =>
            `<button class="chip ${state.filter === key ? "active" : ""}" data-filter="${key}">${label}</button>`
        )
        .join("")}
    </div>
    ${
      list.length
        ? `<ul class="hl-list">${list.map((h) => highlightRow(h, true)).join("")}</ul>`
        : `<div class="panel empty">Keine Einträge für diesen Filter.</div>`
    }
  `;

  root.querySelectorAll("[data-filter]").forEach((btn) =>
    btn.addEventListener("click", () => {
      state.filter = btn.dataset.filter;
      renderHighlights(root);
    })
  );

  root.querySelectorAll("[data-del]").forEach((btn) =>
    btn.addEventListener("click", () => {
      if (confirm("Diesen Eintrag wirklich löschen?")) {
        store.remove(btn.dataset.del);
        renderHighlights(root);
        toast("Eintrag gelöscht");
      }
    })
  );
}

// ---------- Erfassen ----------

function renderErfassen(root) {
  const today = new Date().toISOString().slice(0, 10);

  root.innerHTML = `
    <h1>Highlight erfassen</h1>
    <p class="page-sub">Trag ein neues Highlight manuell ein – bis die automatischen Schnittstellen stehen.</p>
    <form id="add-form" class="form panel">
      <label class="field">Typ
        <select name="type" id="type-select">
          <option value="180">180er</option>
          <option value="171">171+</option>
          <option value="140">140+</option>
          <option value="highfinish">High Finish (Checkout ab 100)</option>
          <option value="shortleg">Short Leg (11- bis 20-Darter)</option>
        </select>
      </label>
      <div id="value-wrap"></div>
      <label class="field">Datum
        <input type="date" name="date" value="${today}" required>
      </label>
      <label class="field">Quelle
        <select name="source">
          ${Object.entries(SOURCES)
            .map(([key, label]) => `<option value="${key}" ${key === "manuell" ? "selected" : ""}>${label}</option>`)
            .join("")}
        </select>
      </label>
      <label class="field">Notiz (optional)
        <input type="text" name="note" placeholder="z. B. Ligaspiel gegen …" maxlength="120">
      </label>
      <button type="submit" class="btn primary">Speichern 🎯</button>
    </form>
  `;

  const form = root.querySelector("#add-form");
  const typeSelect = root.querySelector("#type-select");
  const valueWrap = root.querySelector("#value-wrap");

  function updateValueField() {
    const t = typeSelect.value;
    if (t === "shortleg") {
      const darts = Array.from({ length: 10 }, (_, i) => 11 + i);
      valueWrap.innerHTML = `
        <label class="field">Anzahl Darts
          <select name="value">
            ${darts.map((d) => `<option value="${d}">${d} Darts</option>`).join("")}
          </select>
        </label>`;
    } else if (t === "highfinish") {
      valueWrap.innerHTML = `
        <label class="field">Checkout (Punkte)
          <input type="number" name="value" min="100" max="170" value="100" required>
        </label>`;
    } else {
      valueWrap.innerHTML = "";
    }
  }

  typeSelect.addEventListener("change", updateValueField);
  updateValueField();

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const f = new FormData(form);
    const type = f.get("type");
    store.add({
      id: newId(),
      type,
      value: f.get("value") ? Number(f.get("value")) : null,
      date: f.get("date"),
      source: f.get("source"),
      note: (f.get("note") || "").trim(),
    });
    toast("Gespeichert! 🎯");
    form.querySelector('[name="note"]').value = "";
  });
}

// ---------- Quellen ----------

function renderQuellen(root) {
  const scoliaMetrics = Object.values(store.load().scolia ?? {});
  const scoliaActive = scoliaMetrics.length > 0;

  const sources = [
    {
      name: "Scolia",
      status: scoliaActive ? `CSV-Import aktiv (${scoliaMetrics.length} Statistik${scoliaMetrics.length > 1 ? "en" : ""})` : "Noch nicht verbunden",
      ok: scoliaActive,
      desc: "Kamera-basiertes Auto-Scoring an deinem Steeldart-Board. Exportiere im Scolia Web Client (Statistiken) die Diagramme als CSV und lies sie hier ein.",
      actions: `
        <div class="settings-row">
          <button class="btn" id="btn-scolia-import">📄 Scolia-CSV importieren</button>
          <input type="file" id="scolia-file" accept=".csv,text/csv" multiple hidden>
        </div>`,
    },
    {
      name: "GoDartsPro",
      status: "Noch nicht verbunden",
      ok: false,
      desc: "Online-Trainingsplattform mit Übungen und Auswertungen. Geplant: Übernahme deiner Trainingsergebnisse.",
      actions: "",
    },
    {
      name: "Russ Bray Darts Scorer",
      status: "Noch nicht verbunden",
      ok: false,
      desc: "Scoring-App auf deinem iPad. Geplant: Import deiner Spielstatistiken per Datei-Export.",
      actions: "",
    },
  ];

  root.innerHTML = `
    <h1>Quellen</h1>
    <p class="page-sub">Hier laufen alle deine Dart-Plattformen zusammen.</p>
    <div class="source-grid">
      ${sources
        .map(
          (s) => `
        <div class="panel source-card">
          <div class="source-head">
            <span class="source-name">${s.name}</span>
            <span class="status ${s.ok ? "ok" : ""}">${s.status}</span>
          </div>
          <div class="source-desc">${s.desc}</div>
          ${s.actions}
        </div>`
        )
        .join("")}
    </div>
    <div class="hint">
      💡 Einzelne Highlights (z. B. einen 180er vom Ligaspiel) kannst du jederzeit unter
      <a href="#/erfassen">Erfassen</a> manuell eintragen – die Quelle wird mitgespeichert.
    </div>
  `;

  const fileInput = root.querySelector("#scolia-file");
  root.querySelector("#btn-scolia-import").addEventListener("click", () => fileInput.click());
  fileInput.addEventListener("change", async () => {
    if (!fileInput.files.length) return;
    try {
      const imported = await importScoliaFiles(fileInput.files);
      toast(`Importiert: ${imported.map((m) => m.label).join(", ")} ✅`);
      renderQuellen(root);
    } catch (e) {
      toast("Import fehlgeschlagen: " + (e.message || "unbekannter Fehler"));
    }
    fileInput.value = "";
  });
}

// ---------- Mehr / Einstellungen ----------

function renderEinstellungen(root) {
  const data = store.load();
  const account = auth.account();

  const kontoBlock = account
    ? `
      <div><strong>${esc(account.name ?? "Angemeldet")}</strong><br>
        <span class="hl-sub">${esc(account.username ?? "")}</span></div>
      <div class="hl-sub">${syncInfoText()}</div>
      <div class="settings-row">
        <button class="btn" id="btn-sync-now">🔄 Jetzt synchronisieren</button>
        <button class="btn" id="btn-logout">Abmelden</button>
      </div>`
    : auth.available()
      ? `
      <div class="hl-sub">Nicht angemeldet – deine Daten bleiben nur auf diesem Gerät.
        Nach der Anmeldung werden sie über deinen SharePoint auf allen Geräten synchronisiert.</div>
      <div class="settings-row">
        <button class="btn primary" id="btn-login">Mit Microsoft anmelden</button>
      </div>`
      : `<div class="hl-sub">Die Anmelde-Funktion konnte nicht geladen werden.</div>`;

  root.innerHTML = `
    <h1>Mehr</h1>
    <p class="page-sub">Profil, Konto, Datensicherung und App-Infos.</p>

    <h2>Profil</h2>
    <div class="panel settings-group">
      <label class="field" style="max-width:320px;">Name / Spitzname
        <input type="text" id="player-name" value="${esc(data.settings.name ?? "")}" maxlength="40">
      </label>
    </div>

    <h2>Konto &amp; Synchronisation</h2>
    <div class="panel settings-group">${kontoBlock}</div>

    <h2>Daten</h2>
    <div class="panel settings-group">
      <div class="settings-row">
        <button class="btn" id="btn-export">⬇️ Daten exportieren (JSON)</button>
        <button class="btn" id="btn-import">⬆️ Daten importieren</button>
        <input type="file" id="import-file" accept="application/json,.json" hidden>
      </div>
      <div class="settings-row">
        ${store.hasDemo() ? `<button class="btn" id="btn-demo">🧹 Beispieldaten entfernen</button>` : ""}
        <button class="btn danger" id="btn-reset">Alle Daten löschen</button>
      </div>
      <div class="hl-sub">
        Die Daten liegen aktuell lokal auf diesem Gerät. Mit Export/Import kannst du sie
        zwischen Geräten übertragen – eine automatische Synchronisation ist der nächste Ausbauschritt.
      </div>
    </div>

    <h2>Über die App</h2>
    <div class="panel settings-group">
      <div><strong>The Snail – Dart-Statistik</strong> · Version 0.1</div>
      <div class="hl-sub">
        Installierbar als App: am PC über das Installations-Symbol in der Adressleiste (Edge/Chrome),
        am iPhone/iPad in Safari über „Teilen → Zum Home-Bildschirm".
      </div>
    </div>
  `;

  root.querySelector("#player-name").addEventListener("change", (e) => {
    data.settings.name = e.target.value.trim();
    store.touchSettings();
    toast("Name gespeichert");
  });

  root.querySelector("#btn-login")?.addEventListener("click", () => auth.login());
  root.querySelector("#btn-logout")?.addEventListener("click", () => auth.logout());
  root.querySelector("#btn-sync-now")?.addEventListener("click", () => {
    toast("Synchronisation gestartet …");
    sync.fullSync();
  });

  root.querySelector("#btn-export").addEventListener("click", () => {
    const blob = new Blob([JSON.stringify(store.load(), null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `thesnail-daten-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  });

  const fileInput = root.querySelector("#import-file");
  root.querySelector("#btn-import").addEventListener("click", () => fileInput.click());
  fileInput.addEventListener("change", async () => {
    const file = fileInput.files[0];
    if (!file) return;
    try {
      const imported = JSON.parse(await file.text());
      if (!imported || !Array.isArray(imported.highlights)) throw new Error("Format");
      if (confirm("Vorhandene Daten durch die importierten ersetzen?")) {
        store.replace(imported);
        renderEinstellungen(root);
        toast("Daten importiert ✅");
      }
    } catch {
      toast("Import fehlgeschlagen – keine gültige Datei");
    }
    fileInput.value = "";
  });

  root.querySelector("#btn-demo")?.addEventListener("click", () => {
    store.removeDemo();
    renderEinstellungen(root);
    toast("Beispieldaten entfernt");
  });

  root.querySelector("#btn-reset").addEventListener("click", () => {
    if (confirm("Wirklich ALLE Daten unwiderruflich löschen?")) {
      store.reset();
      renderEinstellungen(root);
      toast("Alle Daten gelöscht");
    }
  });
}

// ---------- Router ----------

const routes = {
  "/": renderDashboard,
  "/highlights": renderHighlights,
  "/erfassen": renderErfassen,
  "/quellen": renderQuellen,
  "/einstellungen": renderEinstellungen,
};

function navigate() {
  const hash = location.hash.replace(/^#/, "") || "/";
  const render = routes[hash] ?? renderDashboard;
  render(view);
  document.querySelectorAll(".nav a").forEach((a) => {
    a.classList.toggle("active", a.getAttribute("href") === "#" + (routes[hash] ? hash : "/"));
  });
  window.scrollTo(0, 0);
}

window.addEventListener("hashchange", navigate);
navigate();

// ---------- Anmeldung & Synchronisation ----------

const statusEl = document.getElementById("sync-status");

function updateSyncStatus() {
  if (!statusEl) return;
  if (!auth.available() || !auth.account()) {
    statusEl.textContent = "Daten nur auf diesem Gerät";
  } else if (sync.status === "synct") {
    statusEl.textContent = "☁️ Synchronisiere…";
  } else if (sync.status === "fehler") {
    statusEl.textContent = "⚠️ Synchronisation gestört";
  } else if (sync.lastSync) {
    statusEl.textContent = "☁️ Synchronisiert";
  } else {
    statusEl.textContent = "☁️ Angemeldet";
  }
}

window.addEventListener("thesnail-sync", () => {
  updateSyncStatus();
  // Aktuelle Seite auffrischen – außer im Erfassen-Formular, um Eingaben nicht zu stören
  const hash = location.hash.replace(/^#/, "") || "/";
  if (hash !== "/erfassen") navigate();
});

updateSyncStatus();
sync.init().then(() => {
  updateSyncStatus();
  const hash = location.hash.replace(/^#/, "") || "/";
  if (hash !== "/erfassen") navigate();
});
