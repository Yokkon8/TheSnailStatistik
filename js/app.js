import { store, TYPES, SOURCES, newId } from "./store.js";
import { auth } from "./auth.js";
import { sync } from "./sync.js";
import {
  importScoliaFiles,
  scoliaRangeValue,
  monthlyValues,
  yearlyValues,
  lastDailyValues,
  monthDailyValues,
  scoliaHighlightEvents,
} from "./scolia.js";
import { importDreikStats, dreikShortLegs, dreikBestesLeg } from "./dreik.js";

const view = document.getElementById("view");
const state = {
  year: null,
  month: 0,
  filter: "alle",
  sourceFilter: "alle",
  hlYear: "alle",
  chartMetric: null,
  editId: null,
};

const MONATSNAMEN = [
  "Januar", "Februar", "März", "April", "Mai", "Juni",
  "Juli", "August", "September", "Oktober", "November", "Dezember",
];

function lastNDayKeys(n) {
  const keys = new Set();
  const jetzt = new Date();
  for (let i = 0; i < n; i++) {
    const d = new Date(jetzt.getFullYear(), jetzt.getMonth(), jetzt.getDate() - i);
    keys.add(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`);
  }
  return keys;
}

// Der gewählte Zeitraum steuert Karten, Listen und Diagramm gemeinsam.
// test() prüft Datums-Schlüssel, mode bestimmt die Diagramm-Zeitachse.
function periodInfo() {
  if (state.year === "gesamt") {
    return { test: () => true, mode: "jahre", label: "alle Jahre" };
  }
  if (state.year === "j7" || state.year === "j30") {
    const anzahl = state.year === "j7" ? 7 : 30;
    const keys = lastNDayKeys(anzahl);
    return { test: (d) => keys.has(d), mode: "tage", anzahl, label: `letzte ${anzahl} Tage` };
  }
  if (state.month) {
    const monthKey = `${state.year}-${String(state.month).padStart(2, "0")}`;
    return {
      test: (d) => d.startsWith(monthKey),
      mode: "monatstage",
      monthKey,
      label: `${MONATSNAMEN[state.month - 1]} ${state.year}`,
    };
  }
  return { test: (d) => d.startsWith(state.year), mode: "monate", year: state.year, label: state.year };
}

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
  const anzahl = h.count ?? 1;
  const titel = h.note
    ? esc(h.note)
    : anzahl > 1
      ? `${anzahl} × ${esc(TYPES[h.type] ?? "")}`
      : esc(TYPES[h.type] ?? "");
  return `
    <li class="hl-row">
      <span class="badge t-${esc(h.type)}">${esc(typeLabel(h))}</span>
      <div class="hl-main">
        <div class="hl-title">${titel}</div>
        <div class="hl-sub">${fmtDate(h.date)} &middot; ${esc(SOURCES[h.source] ?? h.source)}${h.virtual ? " (Import)" : ""}</div>
      </div>
      ${
        withDelete && !h.virtual
          ? `<button class="icon-btn" data-edit="${esc(h.id)}" title="Eintrag bearbeiten">✏️</button>
             <button class="icon-btn" data-del="${esc(h.id)}" title="Eintrag löschen">✕</button>`
          : ""
      }
    </li>`;
}

// Eingebaute Quellen + selbst angelegte (Name dient als Schlüssel und Anzeige)
function allSources(data) {
  const map = { ...SOURCES };
  for (const name of data.customSources ?? []) map[name] = name;
  return map;
}

// Manuelle Highlights + aus Scolia abgeleitete Ereignisse, ohne Doppelzählung:
// manuelle Einträge mit Quelle Scolia entfallen, wenn derselbe Typ bereits
// automatisch aus dem Scolia-Import kommt.
function combinedEvents(data, testFn) {
  const alleVirtuellen = scoliaHighlightEvents(data.scolia);
  const importedTypes = new Set(alleVirtuellen.map((e) => e.type));
  const virtual = alleVirtuellen.filter((e) => testFn(e.date));
  const manual = data.highlights.filter(
    (h) => testFn(h.date) && !(h.source === "scolia" && importedTypes.has(h.type))
  );
  return [...manual, ...virtual];
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

// Scolia-Sektion der Übersicht: Karten und Diagramm folgen dem gewählten Zeitraum
function scoliaSection(data, info) {
  const metrics = Object.values(data.scolia ?? {});
  if (!metrics.length) return "";

  // 180er und Best Legs stecken schon in den Highlight-Karten oben –
  // hier nur die reinen Spielstatistiken zeigen.
  const cards = metrics
    .filter((m) => !m.key.includes("180") && !m.key.includes("best"))
    .map((m) => ({ metric: m, value: scoliaRangeValue(m, info.test) }))
    .filter((c) => c.value !== null)
    .map(
      (c) => `
      <div class="stat">
        <div class="stat-num green">${fmtNum(c.value)}${c.metric.key.includes("rate") ? "&thinsp;%" : ""}</div>
        <div class="stat-label">${esc(c.metric.label)}</div>
      </div>`
    )
    .join("");

  if (!state.chartMetric || !data.scolia[state.chartMetric]) {
    state.chartMetric = data.scolia.x01_games ? "x01_games" : metrics[0].key;
  }
  const chartMetric = data.scolia[state.chartMetric];

  return `
    <h2>Spielstatistik <span class="h2-sub">aus Scolia · ${esc(info.label)}</span></h2>
    ${cards ? `<div class="stat-grid">${cards}</div>` : `<div class="panel empty">Keine Scolia-Werte im Zeitraum (${esc(info.label)}).</div>`}
    <div class="toolbar" style="margin:16px 0 0;">
      <select id="chart-metric" class="year-select">
        ${metrics
          .map((m) => `<option value="${esc(m.key)}" ${m.key === state.chartMetric ? "selected" : ""}>${esc(m.label)}</option>`)
          .join("")}
      </select>
    </div>
    ${barChart(chartMetric, info)}
  `;
}

// Die Zeitachse des Diagramms folgt dem Zeitraum automatisch:
// alle Jahre → Jahresbalken, Jahr → Monatsbalken, Monat/letzte Tage → Tagesbalken
function barChart(metric, info) {
  let daten, untertitel;
  if (info.mode === "jahre") {
    daten = yearlyValues(metric).map((e) => ({ label: e.year, value: e.value ?? 0 }));
    untertitel = `${esc(metric.label)} pro Jahr`;
  } else if (info.mode === "monate") {
    const monate = ["Jan", "Feb", "Mär", "Apr", "Mai", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dez"];
    daten = monthlyValues(metric, info.year).map((v, i) => ({ label: monate[i], value: v }));
    untertitel = `${esc(metric.label)} pro Monat ${esc(info.year)}`;
  } else if (info.mode === "monatstage") {
    daten = monthDailyValues(metric, info.monthKey) ?? [];
    untertitel = `${esc(metric.label)} pro Tag – ${esc(info.label)}`;
  } else {
    daten = lastDailyValues(metric, info.anzahl) ?? [];
    untertitel = `${esc(metric.label)} pro Tag – ${esc(info.label)}`;
  }

  if (!daten.length || !daten.some((d) => d.value > 0)) {
    return `<div class="panel empty" style="margin-top:12px;">Keine Werte im Zeitraum (${esc(info.label)}).</div>`;
  }

  const max = Math.max(...daten.map((d) => d.value));
  const dicht = daten.length > 16; // bei vielen Balken: Werte weglassen, nur jede 5. Beschriftung
  const spalten = `grid-template-columns:repeat(${daten.length},1fr);`;
  return `
    <div class="panel bar-chart">
      <div class="bars" style="${spalten}">
        <div class="grid-line" style="bottom:25%"></div>
        <div class="grid-line" style="bottom:50%"></div>
        <div class="grid-line" style="bottom:75%"></div>
        ${daten
          .map(
            (d) => `
          <div class="bar-slot" title="${esc(String(d.label))}: ${fmtNum(d.value)}">
            ${!dicht && d.value ? `<div class="bar-value">${fmtNum(d.value)}</div>` : ""}
            ${
              d.value > 0
                ? `<div class="bar" style="height:${Math.max(Math.round((d.value / max) * 100), 4)}%"></div>`
                : `<div class="bar leer"></div>`
            }
          </div>`
          )
          .join("")}
      </div>
      <div class="bar-axis" style="${spalten}">
        ${daten
          .map((d, i) => `<div class="bar-label">${dicht && i % 5 !== 0 ? "" : esc(String(d.label))}</div>`)
          .join("")}
      </div>
      <div class="hl-sub" style="margin-top:10px;">${untertitel}${dicht ? ` &middot; Höchstwert ${fmtNum(max)}` : ""}</div>
    </div>`;
}

// 3K-Darts-Bilanz: Gesamtwerte ohne Datum – nur in der Ansicht "Alle Jahre"
function dreikSection(data, info) {
  const d = data.dreik;
  if (!d || info.mode !== "jahre") return "";
  const quote = d.spiele ? Math.round((d.siege / d.spiele) * 1000) / 10 : null;
  const shortLegs = dreikShortLegs(d);
  const bestesLeg = dreikBestesLeg(d);
  const karte = (wert, label) =>
    wert === null || wert === undefined
      ? ""
      : `<div class="stat"><div class="stat-num blue">${fmtNum(wert)}</div><div class="stat-label">${label}</div></div>`;
  return `
    <h2>Turnier-Bilanz <span class="h2-sub">aus 3K Darts · alle Zeiten</span></h2>
    <div class="stat-grid">
      ${karte(d.spiele, "Spiele")}
      ${quote !== null ? `<div class="stat"><div class="stat-num blue">${fmtNum(quote)}&thinsp;%</div><div class="stat-label">Siegquote</div></div>` : ""}
      ${karte(d.average, "3-Dart-Schnitt")}
      ${karte(d.s180, "180er")}
      ${karte(shortLegs, "Short Legs")}
      ${karte(bestesLeg, "Bestes Leg (Darts)")}
      ${karte(d.maxCheckout, "Höchstes Finish")}
      ${karte(d.co100, "100+ Finishes")}
    </div>
    <div class="hl-sub" style="margin-top:8px;">
      Die 3K-App liefert nur Gesamtwerte ohne Datum – diese Bilanz erscheint deshalb nur bei „Alle Jahre"
      und fließt nicht in die Highlight-Karten oben ein.
    </div>
  `;
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
  const sonderZeitraeume = ["gesamt", "j7", "j30"];
  if (!state.year || (!sonderZeitraeume.includes(state.year) && !yearList.includes(state.year))) {
    state.year = currentYear;
  }
  const istJahr = /^\d{4}$/.test(state.year);
  if (!istJahr) state.month = 0;

  const info = periodInfo();
  const events = combinedEvents(data, info.test);
  const count = (type) => events.filter((e) => e.type === type).reduce((s, e) => s + (e.count ?? 1), 0);
  const shortlegs = events.filter((e) => e.type === "shortleg");
  const bestLeg = shortlegs.length ? Math.min(...shortlegs.map((h) => h.value)) : null;
  const latest = sortedHighlights(events).slice(0, 5);
  const hatScoliaAnteil = events.some((e) => e.virtual);

  root.innerHTML = `
    <h1>Übersicht</h1>
    <p class="page-sub">Deine Dart-Highlights auf einen Blick.</p>
    ${loginBanner()}
    <div class="toolbar">
      <label for="year-select" style="color:var(--muted);font-weight:600;">Zeitraum:</label>
      <select id="year-select" class="year-select">
        <option value="gesamt" ${state.year === "gesamt" ? "selected" : ""}>Alle Jahre</option>
        <option value="j7" ${state.year === "j7" ? "selected" : ""}>Letzte 7 Tage</option>
        <option value="j30" ${state.year === "j30" ? "selected" : ""}>Letzte 30 Tage</option>
        ${yearList.map((y) => `<option value="${y}" ${y === state.year ? "selected" : ""}>${y}</option>`).join("")}
      </select>
      ${
        istJahr
          ? `<select id="month-select" class="year-select">
              <option value="0">Ganzes Jahr</option>
              ${MONATSNAMEN.map((m, i) => `<option value="${i + 1}" ${state.month === i + 1 ? "selected" : ""}>${m}</option>`).join("")}
            </select>`
          : ""
      }
    </div>
    <div class="stat-grid">
      <div class="stat"><div class="stat-num gold">${fmtNum(count("180"))}</div><div class="stat-label">180er</div></div>
      <div class="stat"><div class="stat-num red">${count("171")}</div><div class="stat-label">171+</div></div>
      <div class="stat"><div class="stat-num green">${count("highfinish")}</div><div class="stat-label">High Finishes</div></div>
      <div class="stat"><div class="stat-num">${count("shortleg")}</div><div class="stat-label">Short Legs</div></div>
      <div class="stat"><div class="stat-num">${bestLeg ? bestLeg : "–"}</div><div class="stat-label">Bestes Leg (Darts)</div></div>
    </div>
    ${hatScoliaAnteil ? `<div class="hl-sub" style="margin-top:8px;">Zusammengefasst aus manueller Erfassung und Scolia-Import.</div>` : ""}
    ${scoliaSection(data, info)}
    ${dreikSection(data, info)}
    <h2>Letzte Highlights</h2>
    ${
      latest.length
        ? `<ul class="hl-list">${latest.map((h) => highlightRow(h, false)).join("")}</ul>`
        : `<div class="panel empty">Keine Highlights im Zeitraum (${esc(info.label)}).<br>Trag eins unter <a href="#/erfassen">Erfassen</a> ein! 🎯</div>`
    }
    ${
      store.hasDemo()
        ? `<div class="hint">ℹ️ Du siehst gerade <strong>Beispieldaten</strong>, damit du dir die App vorstellen kannst. Unter <a href="#/einstellungen">Mehr</a> kannst du sie mit einem Klick entfernen.</div>`
        : ""
    }
  `;

  root.querySelector("#year-select").addEventListener("change", (e) => {
    state.year = e.target.value;
    state.month = 0;
    renderDashboard(root);
  });
  root.querySelector("#month-select")?.addEventListener("change", (e) => {
    state.month = Number(e.target.value);
    renderDashboard(root);
  });
  root.querySelector("#btn-login")?.addEventListener("click", () => auth.login());
  root.querySelector("#chart-metric")?.addEventListener("change", (e) => {
    state.chartMetric = e.target.value;
    renderDashboard(root);
  });
}

// ---------- Highlights ----------

function renderHighlights(root) {
  const data = store.load();
  const filters = [
    ["alle", "Alle"],
    ["180", "180er"],
    ["171", "171+"],
    ["highfinish", "High Finish"],
    ["shortleg", "Short Legs"],
  ];
  const events = combinedEvents(data, () => true);

  const jahre = [...new Set(events.map((e) => e.date.slice(0, 4)))].sort().reverse();
  if (state.hlYear !== "alle" && !jahre.includes(state.hlYear)) state.hlYear = "alle";

  let list = events;
  if (state.filter !== "alle") list = list.filter((h) => h.type === state.filter);
  if (state.sourceFilter !== "alle") list = list.filter((h) => h.source === state.sourceFilter);
  if (state.hlYear !== "alle") list = list.filter((h) => h.date.startsWith(state.hlYear));
  list = sortedHighlights(list);

  const quellen = [["alle", "Alle Quellen"], ...Object.entries(allSources(data))];

  root.innerHTML = `
    <h1>Highlights</h1>
    <p class="page-sub">Alle Highlights – manuell erfasst und aus dem Scolia-Import, neueste zuerst.</p>
    <div class="chip-row">
      ${filters
        .map(
          ([key, label]) =>
            `<button class="chip ${state.filter === key ? "active" : ""}" data-filter="${key}">${label}</button>`
        )
        .join("")}
    </div>
    <div class="chip-row">
      ${quellen
        .map(
          ([key, label]) =>
            `<button class="chip ${state.sourceFilter === key ? "active" : ""}" data-source="${esc(key)}">${esc(label)}</button>`
        )
        .join("")}
    </div>
    <div class="toolbar">
      <select id="hl-year" class="year-select">
        <option value="alle" ${state.hlYear === "alle" ? "selected" : ""}>Alle Jahre</option>
        ${jahre.map((j) => `<option value="${j}" ${state.hlYear === j ? "selected" : ""}>${j}</option>`).join("")}
      </select>
      <span class="hl-sub">${fmtNum(list.length)} ${list.length === 1 ? "Eintrag" : "Einträge"}</span>
    </div>
    ${
      list.length
        ? `<ul class="hl-list">${list.map((h) => highlightRow(h, true)).join("")}</ul>`
        : `<div class="panel empty">Keine Einträge für diese Filter.</div>`
    }
  `;

  root.querySelectorAll("[data-filter]").forEach((btn) =>
    btn.addEventListener("click", () => {
      state.filter = btn.dataset.filter;
      renderHighlights(root);
    })
  );

  root.querySelectorAll("[data-source]").forEach((btn) =>
    btn.addEventListener("click", () => {
      state.sourceFilter = btn.dataset.source;
      renderHighlights(root);
    })
  );

  root.querySelector("#hl-year").addEventListener("change", (e) => {
    state.hlYear = e.target.value;
    renderHighlights(root);
  });

  root.querySelectorAll("[data-edit]").forEach((btn) =>
    btn.addEventListener("click", () => {
      state.editId = btn.dataset.edit;
      location.hash = "#/erfassen";
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
  const editing = state.editId
    ? store.load().highlights.find((h) => h.id === state.editId)
    : null;
  if (state.editId && !editing) state.editId = null;

  const today = new Date().toISOString().slice(0, 10);
  const startTyp = editing?.type ?? "180";
  const startWert = editing?.value ?? null;

  root.innerHTML = `
    <h1>${editing ? "Highlight bearbeiten" : "Highlight erfassen"}</h1>
    <p class="page-sub">${
      editing
        ? "Ändere den Eintrag und speichere – die Änderung wird mitsynchronisiert."
        : "Trag ein neues Highlight manuell ein – bis die automatischen Schnittstellen stehen."
    }</p>
    <form id="add-form" class="form panel">
      <label class="field">Typ
        <select name="type" id="type-select">
          <option value="180" ${startTyp === "180" ? "selected" : ""}>180er</option>
          <option value="171" ${startTyp === "171" ? "selected" : ""}>171+</option>
          ${startTyp === "140" ? `<option value="140" selected>140+</option>` : ""}
          <option value="highfinish" ${startTyp === "highfinish" ? "selected" : ""}>High Finish (Checkout ab 100)</option>
          <option value="shortleg" ${startTyp === "shortleg" ? "selected" : ""}>Short Leg (11- bis 20-Darter)</option>
        </select>
      </label>
      <div id="value-wrap"></div>
      <label class="field">Datum
        <input type="date" name="date" value="${esc(editing?.date ?? today)}" required>
      </label>
      <label class="field">Quelle
        <select name="source">
          ${Object.entries(allSources(store.load()))
            .map(
              ([key, label]) =>
                `<option value="${esc(key)}" ${key === (editing?.source ?? "manuell") ? "selected" : ""}>${esc(label)}</option>`
            )
            .join("")}
        </select>
      </label>
      <label class="field">Notiz (optional)
        <input type="text" name="note" value="${esc(editing?.note ?? "")}" placeholder="z. B. Ligaspiel gegen …" maxlength="120">
      </label>
      <div class="settings-row">
        <button type="submit" class="btn primary">${editing ? "Änderungen speichern ✅" : "Speichern 🎯"}</button>
        ${editing ? `<button type="button" class="btn" id="btn-cancel-edit">Abbrechen</button>` : ""}
      </div>
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
            ${darts.map((d) => `<option value="${d}" ${d === startWert ? "selected" : ""}>${d} Darts</option>`).join("")}
          </select>
        </label>`;
    } else if (t === "highfinish") {
      valueWrap.innerHTML = `
        <label class="field">Checkout (Punkte)
          <input type="number" name="value" min="100" max="170" value="${startWert ?? 100}" required>
        </label>`;
    } else {
      valueWrap.innerHTML = "";
    }
  }

  typeSelect.addEventListener("change", updateValueField);
  updateValueField();

  root.querySelector("#btn-cancel-edit")?.addEventListener("click", () => {
    state.editId = null;
    location.hash = "#/highlights";
  });

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const f = new FormData(form);
    const werte = {
      type: f.get("type"),
      value: f.get("value") ? Number(f.get("value")) : null,
      date: f.get("date"),
      source: f.get("source"),
      note: (f.get("note") || "").trim(),
    };
    if (editing) {
      store.update(editing.id, werte);
      state.editId = null;
      toast("Änderungen gespeichert ✅");
      location.hash = "#/highlights";
    } else {
      store.add({ id: newId(), ...werte });
      toast("Gespeichert! 🎯");
      form.querySelector('[name="note"]').value = "";
    }
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
    {
      name: "3K Darts",
      status: store.load().dreik ? "Bilanz importiert" : "Noch nicht verbunden",
      ok: !!store.load().dreik,
      desc: "Turnier-App von 2K Dartsoftware. Kopiere in der App deine persönliche Statistik („Alle“) als Text und füge sie hier ein – einzelne Turnier-Highlights trägst du weiter unter Erfassen ein.",
      actions: `
        <div class="settings-row">
          <button class="btn" id="btn-dreik-toggle">📋 Statistik einfügen</button>
        </div>
        <div id="dreik-wrap" hidden>
          <textarea id="dreik-text" rows="6" placeholder="Kopierten Statistik-Text aus 3K Darts hier einfügen …"></textarea>
          <div class="settings-row" style="margin-top:8px;">
            <button class="btn primary" id="btn-dreik-parse">Einlesen</button>
          </div>
        </div>`,
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
    <h2>Eigene Quellen</h2>
    <div class="panel settings-group">
      <div class="hl-sub">Leg eigene Quellen an – z. B. für dein Vereins-Board oder eine andere App.
        Sie erscheinen beim Erfassen und im Highlights-Filter und werden mitsynchronisiert.</div>
      ${
        (store.load().customSources ?? []).length
          ? `<ul class="hl-list">${store
              .load()
              .customSources.map(
                (name) => `
              <li class="hl-row">
                <div class="hl-main"><div class="hl-title">${esc(name)}</div></div>
                <button class="icon-btn" data-del-source="${esc(name)}" title="Quelle entfernen">✕</button>
              </li>`
              )
              .join("")}</ul>`
          : ""
      }
      <div class="settings-row">
        <input type="text" id="new-source" placeholder="Name, z. B. Vereinsabend" maxlength="30" style="max-width:280px;">
        <button class="btn" id="btn-add-source">➕ Hinzufügen</button>
      </div>
    </div>

    <div class="hint">
      💡 Einzelne Highlights (z. B. einen 180er vom Ligaspiel) kannst du jederzeit unter
      <a href="#/erfassen">Erfassen</a> manuell eintragen – die Quelle wird mitgespeichert.
    </div>
  `;

  const neueQuelle = () => {
    const eingabe = root.querySelector("#new-source");
    try {
      store.addCustomSource(eingabe.value);
      toast(`Quelle „${eingabe.value.trim()}" angelegt ✅`);
      renderQuellen(root);
    } catch (e) {
      toast(e.message);
    }
  };
  root.querySelector("#btn-add-source").addEventListener("click", neueQuelle);
  root.querySelector("#new-source").addEventListener("keydown", (e) => {
    if (e.key === "Enter") neueQuelle();
  });
  root.querySelectorAll("[data-del-source]").forEach((btn) =>
    btn.addEventListener("click", () => {
      const name = btn.dataset.delSource;
      const verwendet = store.load().highlights.filter((h) => h.source === name).length;
      const frage = verwendet
        ? `Quelle „${name}" entfernen? ${verwendet} Eintrag/Einträge behalten den Namen als Quelle.`
        : `Quelle „${name}" entfernen?`;
      if (confirm(frage)) {
        store.removeCustomSource(name);
        renderQuellen(root);
        toast("Quelle entfernt");
      }
    })
  );

  root.querySelector("#btn-dreik-toggle").addEventListener("click", () => {
    const wrap = root.querySelector("#dreik-wrap");
    wrap.hidden = !wrap.hidden;
    if (!wrap.hidden) root.querySelector("#dreik-text").focus();
  });
  root.querySelector("#btn-dreik-parse").addEventListener("click", () => {
    try {
      const stats = importDreikStats(root.querySelector("#dreik-text").value);
      toast(`3K-Bilanz eingelesen: ${fmtNum(stats.spiele ?? 0)} Spiele, ${fmtNum(stats.s180 ?? 0)} × 180er ✅`);
      renderQuellen(root);
    } catch (e) {
      toast(e.message || "Einlesen fehlgeschlagen");
    }
  });

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
  if (hash !== "/erfassen") state.editId = null; // Bearbeiten-Modus nur auf der Erfassen-Seite
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
