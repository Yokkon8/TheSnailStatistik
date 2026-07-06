# The Snail – Dart-Statistik 🎯

Persönliche App zum Zusammenführen aller Dart-Statistiken an einem Ort:
180er, 171+, 140+, High Finishes und Short Legs (11- bis 20-Darter) – mit
Jahresübersicht und Quellen-Zuordnung.

## Was ist das technisch?

Eine **PWA (Progressive Web App)** – eine echte, installierbare App ohne App-Store:

- **Windows-PC:** In Edge/Chrome öffnen → Installations-Symbol in der Adressleiste
  klicken → läuft als eigenständiges Programm mit Icon im Startmenü.
- **iPhone/iPad:** In Safari öffnen → „Teilen" → „Zum Home-Bildschirm" → läuft
  im Vollbild wie eine normale App.
- Funktioniert nach der Installation auch **offline**.
- Keine Installation von Node.js o. Ä. nötig – reine HTML/CSS/JavaScript-App
  ohne Abhängigkeiten (bewusst so gewählt, u. a. weil der Ordner auf
  SharePoint/OneDrive synchronisiert wird).

## Lokal starten (am PC)

Rechtsklick auf `tools\serve.ps1` → „Mit PowerShell ausführen", oder im Terminal:

```powershell
powershell -ExecutionPolicy Bypass -File tools\serve.ps1
```

Dann im Browser öffnen: <http://localhost:4173/>

## Aufbau

| Datei/Ordner           | Zweck                                              |
| ---------------------- | -------------------------------------------------- |
| `index.html`           | App-Gerüst und Navigation                          |
| `css/app.css`          | Design (dunkles Theme, responsiv für Handy/PC)     |
| `js/app.js`            | Seiten: Übersicht, Highlights, Erfassen, Quellen, Mehr |
| `js/store.js`          | Datenhaltung (aktuell localStorage im Browser)     |
| `sw.js`                | Service Worker (offline-Fähigkeit)                 |
| `manifest.webmanifest` | App-Manifest (Name, Icons, Installierbarkeit)      |
| `icons/`               | App-Icons (Dartboard-Design)                       |
| `tools/serve.ps1`      | Lokaler Testserver (PowerShell, ohne Installation) |

## Datenmodell

Ein Highlight-Eintrag:

```json
{
  "id": "…",
  "type": "180 | 171 | 140 | highfinish | shortleg",
  "value": 121,
  "date": "2026-04-14",
  "source": "scolia | godartspro | russbray | manuell",
  "note": "Ligaspiel – Doppel 14 raus"
}
```

`value` = Checkout-Punkte bei High Finish bzw. Anzahl Darts bei Short Leg, sonst `null`.

## Roadmap

1. ✅ Grundgerüst: Übersicht, Highlights-Liste, manuelle Erfassung, Export/Import
2. ⬜ Hosting (z. B. GitHub Pages, kostenlos), damit iPhone/iPad die App laden können
3. ⬜ Automatische Synchronisation zwischen Geräten (Cloud-Datenbank)
4. ⬜ Schnittstellen: **Scolia** (Auto-Scoring-Kamera), **GoDartsPro**
   (Trainingsplattform), **Russ Bray Darts Scorer** (iPad-App)
5. ⬜ Adressen/Kontakte hinterlegen (Vereine, Spielorte, Mitspieler)
6. ⬜ Erweiterte Statistiken (Averages, Verlaufsdiagramme)
