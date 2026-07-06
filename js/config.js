// Zentrale Konfiguration: App-Registrierung (Microsoft 365) und SharePoint-Ablageort.
// Diese IDs sind öffentliche Kennnummern, keine Geheimnisse.

export const CONFIG = {
  // App-Registrierung "TheSnailStatistik" im Mandanten Schneck IT
  clientId: "24862b52-c951-4aec-a465-4356f52f90db",
  tenantId: "25672472-09ec-4702-b5c0-d577a3965ca9",
  scopes: ["Files.ReadWrite.All"],

  // Ablageort der Daten: SharePoint-Seite FSPrivat, Bibliothek "Dart"
  sharePointHost: "schneckit.sharepoint.com",
  sitePath: "/sites/FSPrivat",
  libraryName: "Dart",
  dataFolder: "TheSnailDaten",
  dataFile: "thesnail-daten.json",
};
