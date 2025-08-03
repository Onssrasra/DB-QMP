# 🚆 DB Produktdaten Vergleichstool mit Web-Scraping

Ein intelligentes Tool zur automatischen Analyse und zum Vergleich von Siemens-Produktdaten zwischen Deutsche Bahn Excel-Tabellen und MyMobase/SiemensMobility Website.

## ✨ Features

- **📊 Excel-Analyse**: Automatische Erkennung der DB SAP-Spaltenstruktur (Zeile 3 Header)
- **🔍 Intelligente Suche**: A2V-Nummern vs. Siemens Mobility Materialnummern
- **🌐 Live Web-Scraping**: Echte Daten von MyMobase mit JavaScript-Extraktion
- **⚖️ Intelligenter Vergleich**: Detaillierte Gegenüberstellung mit Abweichungsanalyse
- **🧠 Materialklassifizierung**: Automatische Umwandlung "Nicht Schweiss-/Guss/Klebe-/Schmiede relevant" → "OHNE/N/N/N/N"
- **📏 Abmessungs-Parser**: Intelligente Aufspaltung von "BT 3X30X107,3X228" in L×B×H
- **🎯 DB-spezifisch**: Optimiert für SAP-Felder (MATNM, Z7ARTNUM, Z7HERST, MAKTX)
- **🔗 Produktlinks**: Direkte Verlinkung zu MyMobase-Produktseiten

## 🚀 Installation & Setup

### Voraussetzungen
- Node.js (Version 14 oder höher)
- NPM oder Yarn

### 1. Abhängigkeiten installieren
```bash
npm install
```

### 2. Browser für Web-Scraping installieren
```bash
npm run install-browsers

# Für bessere Kompatibilität (Linux/macOS):
chmod +x deploy.sh
./deploy.sh
```

### 3. Server starten
```bash
# Produktions-Modus
npm start

# Entwicklungs-Modus mit Auto-Reload
npm run dev
```

### 4. Tool öffnen
Öffnen Sie Ihren Browser und gehen Sie zu:
```
http://localhost:3000
```

## 📋 Nutzung

### Schritt 1: Excel-Datei hochladen
- Klicken Sie auf den Upload-Bereich oder ziehen Sie Ihre DB Excel-Datei hinein
- Das Tool erkennt automatisch die SAP-Spaltenstruktur (Zeile 3 als Header)
- Unterstützte Formate: `.xlsx`, `.xls`

### Schritt 2: Produktsuche
Geben Sie eine Artikelnummer ein:

**A2V-Nummern** (z.B. `A2V00156009589`):
- Sucht direkt in der ZZARTNUM-Spalte

**Andere Nummern**:
- Sucht in der "Siemens Mobility Materialnummer"-Spalte
- Fallback-Suche in ähnlichen Spalten

### Schritt 3: Ergebnisse analysieren
- **Links**: Excel-Daten (12 Felder in DB-optimierter Reihenfolge)
- **Rechts**: Web-Daten (9 Felder mit Produktlink)
- **Unten**: Intelligente Vergleichstabelle mit 6 Kern-Vergleichen

## 📊 Intelligente Vergleichstabelle

Die Vergleichstabelle zeigt die wichtigsten Unterschiede zwischen DB- und Web-Daten:

| Vergleichsfeld | Beschreibung |
|---|---|
| **Siemens Mobility Materialnummer** | A2V-Nummer als eindeutige Referenz |
| **Material-Kurztext / Produktname** | Produktbeschreibung DB vs. Web |
| **Gewicht** | Numerischer Vergleich mit 5% Toleranz |
| **Abmessung** | Einheitliche L×B×H Formatierung für Vergleich |
| **Werkstoff** | Materialspezifikation und Standards |
| **Fert./Prüfhinweis / Materialklassifizierung** | Intelligente Umwandlung mit Erklärung |

### Materialklassifizierung-Konvertierung
```
🌐 Web: "Nicht Schweiss-/Guss/Klebe-/Schmiede relevant"
     ↓ Automatische Umwandlung ↓
📊 Excel: "OHNE/N/N/N/N"

Bedeutung:
• Keine Prüfklasse → OHNE
• Kein Abnahmeprüfzeugnis → N  
• Keine Schweiß-Zertifizierung → N
• Keine STBP notwendig → N
• Keine Klebeverbindung relevant → N
```

## 🔧 Erkannte DB-Felder

Das Tool erkennt automatisch folgende SAP-Felder (Zeile 3 als Header):

| Anzeigereihenfolge | Feld | Erkannte Spalten | Beschreibung |
|---|---|---|---|
| 1 | **Siemens Mobility Materialnummer** | `Siemens Mobility Materialnummer` | A2V-Nummer |
| 2 | **Material-Kurztext** | `Materialkurztext`, `MAKTX (DE)` | Deutsche Produktbeschreibung |
| 3 | **Herstellerartikelnummer** | `Her.-Artikelnummer`, `Z7ARTNUM` | Hersteller-Artikelnummer |
| 4 | **Länge** | `Länge` (+ Einheit) | Längenmaß mit automatischer Einheit |
| 5 | **Breite** | `Breite` (+ Einheit) | Breitenmaß mit automatischer Einheit |
| 6 | **Höhe** | `Höhe` (+ Einheit) | Höhenmaß mit automatischer Einheit |
| 7 | **Einheit für Abmasse** | `Einheit für Abmasse` | Maßeinheit (meist mm) |
| 8 | **Bruttogewicht** | `Bruttogewicht` | Bruttogewicht mit Einheit |
| 9 | **Nettogewicht** | `Nettogewicht` | Nettogewicht mit Einheit |
| 10 | **Einheit für Gewicht** | `Einheit für Gewicht` | Gewichtseinheit (meist kg) |
| 11 | **Fertigung und Prüfhinweis** | `Fert./Prüfhinweis` | Produktionshinweise |
| 12 | **Werkstoff** | `Werkstoff` (Spalte P) | Materialspezifikation |

## 🌐 Web-Scraping Details

### Unterstützte Website
- **MyMobase**: `https://www.mymobase.com/de/p/{artikelnummer}`

### Extrahierte Web-Daten (in dieser Reihenfolge)
1. **Siemens Mobility Materialnummer (A2V)** - Eindeutige Produktkennung
2. **Produktname** - Offizielle Produktbezeichnung
3. **Weitere Artikelnummer** - Alternative Herstellernummern
4. **Abmessungen** - Maße im Format "BT 3X30X107,3X228"
5. **Gewicht** - Produktgewicht mit Einheit
6. **Materialklassifizierung** - Prüf- und Zertifizierungshinweise
7. **Werkstoff** - Materialspezifikation (z.B. "X10CrNi18-8")
8. **Statistische Warennummer** - Zollnummer für Export/Import
9. **Produktlink** - Direkter Link zur MyMobase-Produktseite

### Fallback-Mechanismus
Bei Scraping-Fehlern:
- Anzeige von Fehlermeldungen
- Fallback auf Excel-Daten
- Hinweise zur Problemlösung

## 📁 Projektstruktur

```
├── index.html              # Haupt-Frontend mit vollständiger Funktionalität
├── index-standalone.html   # Standalone-Version ohne Backend
├── server.js               # Node.js Backend mit Playwright Web-Scraping
├── package.json            # NPM-Konfiguration und Dependencies
├── deploy.sh               # Deployment-Script für Playwright Browser
└── README.md              # Diese Dokumentation
```

## 🛠️ Technische Details

### Frontend-Features
- **JavaScript-Extraktion**: Direkte Datenentnahme aus `window.initialData` 
- **Abmessungs-Parser**: `parseDimensions()` - Aufspaltung von Web-Dimensionen
- **Excel-Kombinierer**: `combineExcelDimensions()` - L×B×H Formatierung
- **Material-Konverter**: `convertMaterialClassification()` - Intelligente Umwandlung
- **Responsives Design**: Optimiert für Desktop und Tablet

### Backend-Features  
- **Playwright Integration**: Echte Browser-Automatisierung für Web-Scraping
- **Robuste Error-Handling**: Automatische Browser-Installation bei Fehlern
- **CORS-Support**: Cross-Origin Requests für Frontend-Integration
- **Health-Endpoint**: Monitoring und Status-Checks

## 🔧 API Endpoints

### POST /api/scrape
Startet Web-Scraping für eine Artikelnummer.

**Request:**
```json
{
  "articleNumber": "A2V00156009589"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "Artikelnummer": "A2V00156009589",
    "Produkttitel": "Siemens Komponente",
    "Gewicht": "1.2 kg",
    "Abmessung": "L×B×H: 100×50×30 mm",
    "Status": "Erfolgreich",
    "URL": "https://www.mymobase.com/de/p/A2V00156009589"
  },
  "timestamp": "2024-01-20T10:30:00.000Z"
}
```

### GET /api/health
Server-Status prüfen.

## ⚠️ Wichtige Hinweise

### Excel-Format
- **Spaltennamen in Zeile 3**: Das Tool ist speziell für DB SAP-Exporte optimiert
- **Datenzeilen ab Zeile 4**: Automatische Erkennung der Datenstruktur

### Web-Scraping Limitierungen
- **Rate Limiting**: Vermeiden Sie zu viele gleichzeitige Anfragen
- **Website-Änderungen**: Scraping kann bei Layout-Änderungen fehlschlagen
- **Rechtliche Aspekte**: Beachten Sie die Nutzungsbedingungen von MyMobase

### Performance
- **Browser-Ressourcen**: Playwright startet echte Browser-Instanzen
- **Netzwerk**: Scraping benötigt stabile Internetverbindung
- **Timeout**: Standard-Timeout von 30 Sekunden pro Anfrage

## 🐛 Problembehandlung

### "Spalte nicht erkannt"
1. Prüfen Sie, ob Spaltennamen in Zeile 3 stehen
2. Suchen Sie nach ZZARTNUM/ZZHERST in den Spalten
3. Kontrollieren Sie das Excel-Format

### "Web-Scraping fehlgeschlagen"
1. Prüfen Sie Internetverbindung
2. Testen Sie die MyMobase-URL manuell
3. Starten Sie den Server neu

### "Backend nicht erreichbar"
1. Stellen Sie sicher, dass `npm start` läuft
2. Prüfen Sie Port 3000 auf Konflikte
3. Kontrollieren Sie die Browser-Konsole

### "Browser-Installation fehlgeschlagen" (Playwright)
1. **Manuell installieren:**
   ```bash
   npx playwright install chromium
   ```
2. **Bei Deployment-Problemen:**
   ```bash
   # Deployment-Script ausführen
   chmod +x deploy.sh
   ./deploy.sh
   ```
3. **Permissions-Problem (Linux):**
   ```bash
   chmod -R 755 ~/.cache/ms-playwright/
   ```
4. **Alternative Browser-Installation:**
   ```bash
   npm uninstall playwright
   npm install playwright
   npx playwright install chromium --force
   ```

## 📞 Support

Bei Problemen oder Fragen:
1. Prüfen Sie die Browser-Entwicklertools (F12)
2. Kontrollieren Sie die Server-Logs
3. Testen Sie mit bekannten Artikelnummern

## 🔄 Updates

Für Updates des Tools:
```bash
git pull origin main
npm install
npm run install-browsers
```

---

**Entwickelt für die Deutsche Bahn** - Optimiert für SAP-Produktdaten und Siemens-Komponenten.