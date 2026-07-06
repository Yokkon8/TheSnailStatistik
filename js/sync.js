// Synchronisation der Daten mit SharePoint über Microsoft Graph.
// Ablauf: herunterladen → mit lokalem Stand zusammenführen → hochladen.
// Läuft nur, wenn der Nutzer angemeldet ist; die App funktioniert auch ohne.

import { CONFIG } from "./config.js";
import { auth } from "./auth.js";
import { store, mergeData } from "./store.js";

const GRAPH = "https://graph.microsoft.com/v1.0";
const IDS_KEY = "thesnail-graph-ids";

let syncing = false;
let queued = false;
let pushTimer = null;

export const sync = {
  status: "aus", // aus | bereit | synct | ok | fehler
  lastSync: null,
  error: null,

  async init() {
    const account = await auth.init();
    // Lokale Änderungen automatisch (leicht verzögert) hochladen
    window.addEventListener("thesnail-datachanged", () => {
      if (!auth.account()) return;
      clearTimeout(pushTimer);
      pushTimer = setTimeout(() => this.fullSync(), 2000);
    });
    if (account) {
      this.status = "bereit";
      await this.fullSync();
    }
    return account;
  },

  emit() {
    window.dispatchEvent(new CustomEvent("thesnail-sync", { detail: { status: this.status } }));
  },

  async fullSync() {
    if (!auth.account()) return;
    if (syncing) {
      queued = true;
      return;
    }
    syncing = true;
    this.status = "synct";
    this.error = null;
    this.emit();
    try {
      const token = await auth.getToken();
      const driveId = await resolveDriveId(token);
      const remote = await download(token, driveId);
      const merged = mergeData(store.load(), remote ?? { highlights: [], deletedIds: [] });
      store.replaceQuiet(merged);
      await upload(token, driveId, merged);
      this.status = "ok";
      this.lastSync = new Date();
    } catch (e) {
      this.status = "fehler";
      this.error = e.message || String(e);
      console.error("Synchronisation fehlgeschlagen:", e);
    }
    syncing = false;
    this.emit();
    if (queued) {
      queued = false;
      this.fullSync();
    }
  },
};

// ---------- Microsoft-Graph-Aufrufe ----------

async function graphFetch(token, path, options = {}) {
  const response = await fetch(GRAPH + path, {
    ...options,
    headers: { Authorization: `Bearer ${token}`, ...(options.headers || {}) },
  });
  return response;
}

// Ermittelt einmalig die ID der Bibliothek "Dart" auf der Seite FSPrivat
// und merkt sie sich, damit nicht bei jedem Sync gesucht werden muss.
async function resolveDriveId(token) {
  try {
    const cached = JSON.parse(localStorage.getItem(IDS_KEY));
    if (cached?.driveId) return cached.driveId;
  } catch {}

  const siteRes = await graphFetch(token, `/sites/${CONFIG.sharePointHost}:${CONFIG.sitePath}`);
  if (!siteRes.ok) throw new Error(`SharePoint-Seite nicht erreichbar (${siteRes.status})`);
  const site = await siteRes.json();

  const drivesRes = await graphFetch(token, `/sites/${site.id}/drives?$select=id,name`);
  if (!drivesRes.ok) throw new Error(`Bibliotheken nicht lesbar (${drivesRes.status})`);
  const drives = (await drivesRes.json()).value ?? [];
  const drive = drives.find((d) => d.name.toLowerCase() === CONFIG.libraryName.toLowerCase());
  if (!drive) throw new Error(`Bibliothek „${CONFIG.libraryName}" nicht gefunden`);

  localStorage.setItem(IDS_KEY, JSON.stringify({ driveId: drive.id }));
  return drive.id;
}

function dataPath() {
  return `/root:/${encodeURIComponent(CONFIG.dataFolder)}/${encodeURIComponent(CONFIG.dataFile)}`;
}

async function download(token, driveId) {
  const res = await graphFetch(token, `/drives/${driveId}${dataPath()}:/content`);
  if (res.status === 404) return null; // erste Synchronisation: Datei gibt es noch nicht
  if (!res.ok) throw new Error(`Herunterladen fehlgeschlagen (${res.status})`);
  try {
    return await res.json();
  } catch {
    return null; // beschädigte Datei nicht übernehmen
  }
}

async function upload(token, driveId, data) {
  const body = JSON.stringify(data, null, 2);
  const put = () =>
    graphFetch(token, `/drives/${driveId}${dataPath()}:/content`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body,
    });

  let res = await put();
  if (res.status === 404) {
    // Ordner existiert noch nicht → anlegen und erneut versuchen
    await graphFetch(token, `/drives/${driveId}/root/children`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: CONFIG.dataFolder,
        folder: {},
        "@microsoft.graph.conflictBehavior": "replace",
      }),
    });
    res = await put();
  }
  if (!res.ok) throw new Error(`Hochladen fehlgeschlagen (${res.status})`);
}
