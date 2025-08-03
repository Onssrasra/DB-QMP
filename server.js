const express = require('express');
const { chromium } = require('playwright');
const cors = require('cors');
const helmet = require('helmet');
const path = require('path');
const { execSync } = require('child_process');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(helmet({
    contentSecurityPolicy: false, // Für lokale Entwicklung deaktiviert
}));
app.use(cors());
app.use(express.json());
app.use(express.static(__dirname)); // Serve static files

class SiemensProductScraper {
    constructor() {
        this.baseUrl = "https://www.mymobase.com/de/p/";
        this.browser = null;
    }

    async initBrowser() {
        if (!this.browser) {
            console.log('🚀 Starte Browser...');
            try {
                this.browser = await chromium.launch({
                    headless: true,
                    args: [
                        '--no-sandbox', 
                        '--disable-setuid-sandbox',
                        '--disable-dev-shm-usage',
                        '--disable-web-security',
                        '--disable-features=VizDisplayCompositor'
                    ]
                });
            } catch (error) {
                console.error('❌ Browser-Start fehlgeschlagen:', error.message);
                
                // Versuche Browser zu installieren und erneut zu starten
                console.log('🔄 Versuche Browser-Installation...');
                try {
                    execSync('npx playwright install chromium', { stdio: 'inherit' });
                    
                    this.browser = await chromium.launch({
                        headless: true,
                        args: [
                            '--no-sandbox', 
                            '--disable-setuid-sandbox',
                            '--disable-dev-shm-usage',
                            '--disable-web-security',
                            '--disable-features=VizDisplayCompositor'
                        ]
                    });
                    console.log('✅ Browser erfolgreich installiert und gestartet');
                } catch (installError) {
                    console.error('❌ Browser-Installation fehlgeschlagen:', installError.message);
                    throw new Error('Browser konnte nicht installiert werden. Bitte führen Sie "npm run install-browsers" manuell aus.');
                }
            }
        }
        return this.browser;
    }

    async closeBrowser() {
        if (this.browser) {
            await this.browser.close();
            this.browser = null;
        }
    }

    async scrapeProduct(articleNumber) {
        const url = `${this.baseUrl}${articleNumber}`;
        const result = {
            Herstellerartikelnummer: articleNumber, // A2V number for display
            Artikelnummer: articleNumber,
            URL: url,
            Produkttitel: "Nicht gefunden",
            Produktbeschreibung: "Nicht gefunden",
            Werkstoff: "Nicht gefunden",
            "Weitere Artikelnummer": "Nicht gefunden",
            Abmessung: "Nicht gefunden",
            Gewicht: "Nicht gefunden",
            Materialklassifizierung: "Nicht gefunden",
            "Materialklassifizierung Bewertung": "Nicht bewertet",
            "Statistische Warennummer": "Nicht gefunden",
            Produktlink: url,
            Ursprungsland: "Nicht gefunden",
            Plattformen: "Nicht gefunden",
            Verfügbarkeit: "Unbekannt",
            Status: "Wird verarbeitet...",
            scrapeTime: new Date().toISOString()
        };

        try {
            const browser = await this.initBrowser();
            const page = await browser.newPage();
            
            // Set user agent to appear more like a real browser
            await page.setExtraHTTPHeaders({
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
            });

            console.log(`🔍 Lade Seite: ${url}`);
            
            const response = await page.goto(url, { 
                waitUntil: 'domcontentloaded', 
                timeout: 45000 
            });

            if (!response) {
                result.Status = "Keine Antwort vom Server";
                return result;
            }

            if (response.status() === 404) {
                result.Status = "Produkt nicht gefunden (404)";
                return result;
            } else if (response.status() !== 200) {
                result.Status = `HTTP-Fehler: ${response.status()}`;
                return result;
            }

            // Wait for page to load
            await page.waitForTimeout(1000);

            // Extract page title
            try {
                const title = await page.title();
                if (title && !title.includes('404') && !title.includes('Not Found')) {
                    result.Produkttitel = title.replace(" | MoBase", "").trim();
                }
            } catch (e) {
                console.log('⚠️ Titel nicht gefunden:', e.message);
            }

            // Extract meta description
            try {
                const metaDesc = await page.getAttribute('meta[name="description"]', 'content');
                if (metaDesc) {
                    result.Produktbeschreibung = metaDesc;
                }
            } catch (e) {
                console.log('⚠️ Meta-Beschreibung nicht gefunden');
            }

            // PRIMARY METHOD: Table-based extraction (wie dein Python Code)
            console.log('🔄 Starte robuste Table-basierte Extraktion...');
            await this.extractTechnicalData(page, result);

            // SECONDARY METHOD: Extract data from JavaScript initialData object (NUR wenn Felder fehlen)
            if (result.Werkstoff === "Nicht gefunden" || result.Materialklassifizierung === "Nicht gefunden" || result['Statistische Warennummer'] === "Nicht gefunden") {
                console.log('🔄 Ergänze fehlende Felder mit JavaScript initialData...');
                await this.extractFromInitialData(page, result);
            } else {
                console.log('✅ Table-Extraktion vollständig - Skip initialData');
            }

            // TERTIARY METHOD: HTML fallback extraction
            if (result.Werkstoff === "Nicht gefunden" || result.Materialklassifizierung === "Nicht gefunden") {
                console.log('🔄 Verwende erweiterte HTML-Extraktion...');
                await this.extractFromHTML(page, result);
            }

            // Extract product details from various selectors
            await this.extractProductDetails(page, result);

            // Check if we got meaningful data
            const hasData = result.Werkstoff !== "Nicht gefunden" || 
                          result.Materialklassifizierung !== "Nicht gefunden" ||
                          result.Gewicht !== "Nicht gefunden" ||
                          result.Abmessung !== "Nicht gefunden";
            
            if (hasData) {
                result.Status = "Erfolgreich";
                console.log('✅ Scraping erfolgreich - Daten gefunden');
            } else {
                result.Status = "Teilweise erfolgreich - Wenig Daten gefunden";
                console.log('⚠️ Scraping unvollständig - Wenig Daten extrahiert');
                
                // Try to get at least the page title if nothing else worked
                try {
                    const pageTitle = await page.title();
                    if (pageTitle && !pageTitle.includes('404')) {
                        result.Produkttitel = pageTitle.replace(" | MoBase", "").trim();
                    }
                } catch (titleError) {
                    console.log('⚠️ Auch Titel-Extraktion fehlgeschlagen');
                }
            }
            
            await page.close();
            
        } catch (error) {
            console.error('❌ Scraping Fehler:', error.message);
            console.error('📋 Error stack:', error.stack);
            console.error('🔧 Error type:', error.constructor.name);
            console.error('🌐 URL war:', result.URL || 'unknown');
            
            result.Status = `Fehler: ${error.message}`;
            result.Produkttitel = "Scraping fehlgeschlagen";
            result.ErrorType = error.constructor.name;
        }

        return result;
    }

    async extractTechnicalData(page, result) {
        try {
            // Look for tables with technical data
            const tables = await page.$$('table');
            
            for (const table of tables) {
                const rows = await table.$$('tr');
                
                for (const row of rows) {
                    const cells = await row.$$('td, th');
                    
                    if (cells.length >= 2) {
                        const keyElement = cells[0];
                        const valueElement = cells[1];
                        
                        const key = (await keyElement.innerText()).trim().toLowerCase();
                        const value = (await valueElement.innerText()).trim();
                        
                        if (key && value) {
                            this.mapTechnicalField(key, value, result);
                        }
                    }
                }
            }

            // Look for product specifications in div elements
            const specDivs = await page.$$('[class*="spec"], [class*="detail"], [class*="info"]');
            for (const div of specDivs) {
                try {
                    const text = await div.innerText();
                    this.parseSpecificationText(text, result);
                } catch (e) {
                    // Continue if this div fails
                }
            }

        } catch (error) {
            console.log('⚠️ Technische Daten Extraktion Fehler:', error.message);
        }
    }

    async extractProductDetails(page, result) {
        // Common selectors for product information
        const selectors = {
            title: ['h1', '.product-title', '.title', '[data-testid="product-title"]'],
            description: ['.description', '.product-description', '.details'],
            weight: ['[data-testid="weight"]', '.weight', '[class*="weight"]'],
            dimensions: ['[data-testid="dimensions"]', '.dimensions', '[class*="dimension"]'],
            material: ['.material', '[data-testid="material"]', '[class*="material"]'],
            availability: ['.availability', '.stock', '[data-testid="availability"]']
        };

        for (const [field, selectorList] of Object.entries(selectors)) {
            for (const selector of selectorList) {
                try {
                    const element = await page.$(selector);
                    if (element) {
                        const text = await element.innerText();
                        if (text && text.trim()) {
                            this.mapProductField(field, text.trim(), result);
                            break; // Found content for this field
                        }
                    }
                } catch (e) {
                    // Continue to next selector
                }
            }
        }
    }

    mapTechnicalField(key, value, result) {
        console.log(`🔍 Table-Field Mapping: "${key}" = "${value}"`);
        
        // EXAKTE REIHENFOLGE WIE IN DEINEM PYTHON CODE - Spezifische Felder ZUERST!
        if (key.includes('abmessung') || key.includes('größe') || key.includes('dimension')) {
            result.Abmessung = this.interpretDimensions(value);
            console.log(`✅ Abmessung aus Tabelle zugeordnet: ${value}`);
        } else if (key.includes('gewicht') && !key.includes('einheit')) {
            result.Gewicht = value;
            console.log(`✅ Gewicht aus Tabelle zugeordnet: ${value}`);
        } else if (key.includes('werkstoff') && !key.includes('klassifizierung')) {
            // NUR exakte "werkstoff" Übereinstimmung, NICHT bei "materialklassifizierung"
            result.Werkstoff = value;
            console.log(`✅ Werkstoff aus Tabelle zugeordnet: ${value}`);
        } else if (key.includes('weitere artikelnummer') || key.includes('additional article number') || key.includes('part number')) {
            result["Weitere Artikelnummer"] = value;
            console.log(`✅ Weitere Artikelnummer aus Tabelle zugeordnet: ${value}`);
        } else if (key.includes('materialklassifizierung') || key.includes('material classification')) {
            result.Materialklassifizierung = value;
            console.log(`✅ Materialklassifizierung aus Tabelle zugeordnet: ${value}`);
            if (value.toLowerCase().includes('nicht schweiss')) {
                result["Materialklassifizierung Bewertung"] = "OHNE/N/N/N/N";
            }
        } else if (key.includes('statistische warennummer') || key.includes('statistical') || key.includes('import')) {
            result["Statistische Warennummer"] = value;
            console.log(`✅ Statistische Warennummer aus Tabelle zugeordnet: ${value}`);
        } else if (key.includes('ursprungsland') || key.includes('origin')) {
            result.Ursprungsland = value;
            console.log(`✅ Ursprungsland aus Tabelle zugeordnet: ${value}`);
        } else if (key.includes('verfügbar') || key.includes('stock') || key.includes('lager')) {
            result.Verfügbarkeit = value;
        } else {
            console.log(`❓ Unbekannter Table-Schlüssel: "${key}" = "${value}"`);
        }
    }

    mapProductField(field, value, result) {
        switch (field) {
            case 'title':
                if (!result.Produkttitel || result.Produkttitel === "Nicht gefunden") {
                    result.Produkttitel = value;
                }
                break;
            case 'description':
                if (!result.Produktbeschreibung || result.Produktbeschreibung === "Nicht gefunden") {
                    result.Produktbeschreibung = value;
                }
                break;
            case 'weight':
                result.Gewicht = value;
                break;
            case 'dimensions':
                result.Abmessung = this.interpretDimensions(value);
                break;
            case 'material':
                result.Werkstoff = value;
                break;
            case 'availability':
                result.Verfügbarkeit = value;
                break;
        }
    }

    parseSpecificationText(text, result) {
        const lines = text.split('\n');
        
        for (const line of lines) {
            const colonIndex = line.indexOf(':');
            if (colonIndex > 0) {
                const key = line.substring(0, colonIndex).trim().toLowerCase();
                const value = line.substring(colonIndex + 1).trim();
                
                if (key && value) {
                    this.mapTechnicalField(key, value, result);
                }
            }
        }
    }

    interpretDimensions(text) {
        if (!text) return "Nicht gefunden";
        
        console.log(`🔍 Dimension Input: "${text}"`);
        
        const cleanText = text.replace(/\s+/g, '').toLowerCase();
        
        // Special handling for complex formats like "BT 3X30X107,3X228"
        if (cleanText.includes('bt') || cleanText.includes(',')) {
            // Remove prefixes like "BT" and split by comma
            let processedText = cleanText.replace(/^[a-z]+/g, ''); // Remove letter prefixes
            const parts = processedText.split(',');
            
            console.log(`🔍 Complex dimension parts: ${JSON.stringify(parts)}`);
            
            let dimensionParts = [];
            parts.forEach(part => {
                // Extract all dimension patterns from each part
                const dimensionMatches = part.match(/(\d+(?:[,.]\d+)?)[x×](\d+(?:[,.]\d+)?)[x×]?(\d+(?:[,.]\d+)?)?/g);
                if (dimensionMatches) {
                    dimensionMatches.forEach(match => {
                        const dimensions = match.match(/(\d+(?:[,.]\d+)?)/g);
                        if (dimensions) {
                            dimensionParts.push(dimensions.join('×'));
                        }
                    });
                }
            });
            
            if (dimensionParts.length > 0) {
                const result = `${dimensionParts.join(' + ')} mm`;
                console.log(`✅ Complex dimensions parsed: "${result}"`);
                return result;
            }
        }
        
        // Check for diameter x height pattern
        if (cleanText.includes('⌀') || cleanText.includes('ø')) {
            const match = cleanText.match(/[⌀ø]?(\d+(?:[,.]\d+)?)[x×](\d+(?:[,.]\d+)?)/);
            if (match) {
                return `Durchmesser×Höhe: ${match[1]}×${match[2]} mm`;
            }
        }
        
        // Check for L x B x H pattern (support decimals)
        const lbhMatch = cleanText.match(/(\d+(?:[,.]\d+)?)[x×](\d+(?:[,.]\d+)?)[x×](\d+(?:[,.]\d+)?)/);
        if (lbhMatch) {
            return `${lbhMatch[1]}×${lbhMatch[2]}×${lbhMatch[3]} mm`;
        }
        
        // Check for L x B pattern (support decimals)
        const lbMatch = cleanText.match(/(\d+(?:[,.]\d+)?)[x×](\d+(?:[,.]\d+)?)/);
        if (lbMatch) {
            return `${lbMatch[1]}×${lbMatch[2]} mm`;
        }
        
        console.log(`⚠️ No dimension pattern matched for: "${text}"`);
        return text;
    }

    async extractFromInitialData(page, result) {
        try {
            console.log('🔍 Extrahiere Daten aus window.initialData...');
            
            // Extract data from window.initialData JavaScript object
            const productData = await page.evaluate(() => {
                try {
                    const initialData = window.initialData;
                    if (!initialData || !initialData['product/dataProduct']) {
                        return null;
                    }
                    
                    const productInfo = initialData['product/dataProduct'].data.product;
                    
                    // Extract basic product info
                    const extractedData = {
                        name: productInfo.name || '',
                        description: productInfo.description || '',
                        code: productInfo.code || '',
                        url: productInfo.url || '',
                        technicalSpecs: []
                    };
                    
                                    // Extract technical specifications from multiple possible locations
                if (productInfo.localizations && productInfo.localizations.technicalSpecifications) {
                    extractedData.technicalSpecs = productInfo.localizations.technicalSpecifications;
                }
                
                // Also extract direct product properties as backup
                extractedData.directProperties = {
                    weight: productInfo.weight || '',
                    dimensions: productInfo.dimensions || '',
                    basicMaterial: productInfo.basicMaterial || '',
                    materialClassification: productInfo.materialClassification || '',
                    importCodeNumber: productInfo.importCodeNumber || '',
                    additionalMaterialNumbers: productInfo.additionalMaterialNumbers || ''
                };
                    
                    return extractedData;
                } catch (e) {
                    console.log('JavaScript extraction error:', e);
                    return null;
                }
            });

            if (productData) {
                console.log('✅ Produktdaten aus initialData gefunden');
                
                // Map basic product information
                if (productData.name) {
                    result.Produkttitel = productData.name;
                }
                
                if (productData.description) {
                    result.Produktbeschreibung = productData.description;
                }
                
                if (productData.url) {
                    result.Produktlink = `https://www.mymobase.com${productData.url}`;
                }
                
                // Map technical specifications with improved key matching
                if (productData.technicalSpecs && productData.technicalSpecs.length > 0) {
                    // Debug: Show all available keys
                    console.log('📋 Alle verfügbaren technische Spezifikationen:');
                    productData.technicalSpecs.forEach(spec => {
                        console.log(`   "${spec.key}" = "${spec.value}"`);
                    });
                    productData.technicalSpecs.forEach(spec => {
                        const key = spec.key.toLowerCase().trim();
                        const value = spec.value;
                        
                        console.log(`🔍 Mapping spec: "${key}" = "${value}"`);
                        
                        // KRITISCH: NUR fehlende Felder ergänzen, nicht überschreiben!
                        if (key.includes('materialklassifizierung') || key.includes('material classification')) {
                            if (!result.Materialklassifizierung || result.Materialklassifizierung === "Nicht gefunden") {
                                result.Materialklassifizierung = value;
                                console.log(`✅ InitialData Materialklassifizierung ergänzt: ${value}`);
                            }
                        } else if (key.includes('statistische warennummer') || key.includes('statistical') || key.includes('import')) {
                            if (!result['Statistische Warennummer'] || result['Statistische Warennummer'] === "Nicht gefunden") {
                                result['Statistische Warennummer'] = value;
                                console.log(`✅ InitialData Statistische Warennummer ergänzt: ${value}`);
                            }
                        } else if (key.includes('weitere artikelnummer') || key.includes('additional material')) {
                            if (!result['Weitere Artikelnummer'] || result['Weitere Artikelnummer'] === "Nicht gefunden") {
                                result['Weitere Artikelnummer'] = value;
                                console.log(`✅ InitialData Weitere Artikelnummer ergänzt: ${value}`);
                            }
                        } else if (key.includes('abmessungen') || key.includes('dimension')) {
                            if (!result.Abmessung || result.Abmessung === "Nicht gefunden") {
                                result.Abmessung = value;
                                console.log(`✅ InitialData Abmessung ergänzt: ${value}`);
                            }
                        } else if (key.includes('gewicht') || key.includes('weight')) {
                            if (!result.Gewicht || result.Gewicht === "Nicht gefunden") {
                                result.Gewicht = value;
                                console.log(`✅ InitialData Gewicht ergänzt: ${value}`);
                            }
                        } else if (key.includes('werkstoff') && !key.includes('klassifizierung')) {
                            // NUR ergänzen wenn Werkstoff fehlt
                            if (!result.Werkstoff || result.Werkstoff === "Nicht gefunden") {
                                result.Werkstoff = value;
                                console.log(`✅ InitialData Werkstoff ergänzt: ${value}`);
                            }
                        } else {
                            console.log(`🔄 InitialData Skip: "${key}" = "${value}"`);
                        }
                    });
                }
                
                // Fallback: Use direct properties if technical specs didn't provide everything
                if (productData.directProperties) {
                    if (result.Gewicht === "Nicht gefunden" && productData.directProperties.weight) {
                        result.Gewicht = productData.directProperties.weight.toString();
                        console.log(`🔄 Fallback Gewicht: ${result.Gewicht}`);
                    }
                    if (result.Abmessung === "Nicht gefunden" && productData.directProperties.dimensions) {
                        result.Abmessung = productData.directProperties.dimensions;
                        console.log(`🔄 Fallback Abmessung: ${result.Abmessung}`);
                    }
                    if (result.Werkstoff === "Nicht gefunden" && productData.directProperties.basicMaterial) {
                        result.Werkstoff = productData.directProperties.basicMaterial;
                        console.log(`🔄 Fallback Werkstoff: ${result.Werkstoff}`);
                    }
                    if (result.Materialklassifizierung === "Nicht gefunden" && productData.directProperties.materialClassification) {
                        result.Materialklassifizierung = productData.directProperties.materialClassification;
                        console.log(`🔄 Fallback Materialklassifizierung: ${result.Materialklassifizierung}`);
                    }
                    if (result['Statistische Warennummer'] === "Nicht gefunden" && productData.directProperties.importCodeNumber) {
                        result['Statistische Warennummer'] = productData.directProperties.importCodeNumber;
                        console.log(`🔄 Fallback Statistische Warennummer: ${result['Statistische Warennummer']}`);
                    }
                    if (result['Weitere Artikelnummer'] === "Nicht gefunden" && productData.directProperties.additionalMaterialNumbers) {
                        result['Weitere Artikelnummer'] = productData.directProperties.additionalMaterialNumbers;
                        console.log(`🔄 Fallback Weitere Artikelnummer: ${result['Weitere Artikelnummer']}`);
                    }
                }
                
                console.log('📊 Extrahierte Daten:', {
                    titel: result.Produkttitel,
                    weitere_artikelnummer: result['Weitere Artikelnummer'],
                    abmessung: result.Abmessung,
                    gewicht: result.Gewicht,
                    werkstoff: result.Werkstoff,
                    materialklassifizierung: result.Materialklassifizierung,
                    statistische_warennummer: result['Statistische Warennummer']
                });
                
            } else {
                console.log('⚠️ Keine initialData gefunden, verwende Fallback-Methode');
            }
            
        } catch (error) {
            console.log('⚠️ Fehler bei initialData Extraktion:', error.message);
        }
    }

    async extractFromHTML(page, result) {
        try {
            console.log('🔍 Extrahiere Daten direkt aus HTML DOM...');
            
            // Extract technical specifications from HTML tables/divs
            const htmlData = await page.evaluate(() => {
                const data = {};
                
                // Look for various table structures
                const tables = document.querySelectorAll('table');
                tables.forEach(table => {
                    const rows = table.querySelectorAll('tr');
                    rows.forEach(row => {
                        const cells = row.querySelectorAll('td, th');
                        if (cells.length >= 2) {
                            const key = cells[0].textContent.trim().toLowerCase();
                            const value = cells[1].textContent.trim();
                            
                            if (key && value && value !== '-' && value !== '') {
                                data[key] = value;
                            }
                        }
                    });
                });
                
                // Look for definition lists
                const dls = document.querySelectorAll('dl');
                dls.forEach(dl => {
                    const dts = dl.querySelectorAll('dt');
                    const dds = dl.querySelectorAll('dd');
                    
                    for (let i = 0; i < Math.min(dts.length, dds.length); i++) {
                        const key = dts[i].textContent.trim().toLowerCase();
                        const value = dds[i].textContent.trim();
                        
                        if (key && value && value !== '-' && value !== '') {
                            data[key] = value;
                        }
                    }
                });
                
                // Look for specific classes or data attributes
                const specElements = document.querySelectorAll('[class*="spec"], [class*="detail"], [data-spec]');
                specElements.forEach(element => {
                    const text = element.textContent;
                    if (text.includes(':')) {
                        const parts = text.split(':');
                        if (parts.length >= 2) {
                            const key = parts[0].trim().toLowerCase();
                            const value = parts.slice(1).join(':').trim();
                            if (key && value && value !== '-' && value !== '') {
                                data[key] = value;
                            }
                        }
                    }
                });
                
                return data;
            });
            
            console.log('📊 HTML-Extraktion gefunden:', Object.keys(htmlData));
            
            // Map HTML data to result fields
            Object.entries(htmlData).forEach(([key, value]) => {
                if (key.includes('weitere artikelnummer') && !result['Weitere Artikelnummer']) {
                    result['Weitere Artikelnummer'] = value;
                } else if (key.includes('abmess') && !result.Abmessung) {
                    result.Abmessung = value;
                } else if (key.includes('gewicht') && !result.Gewicht) {
                    result.Gewicht = value;
                } else if (key.includes('werkstoff') && !result.Werkstoff) {
                    result.Werkstoff = value;
                } else if (key.includes('materialklassifizierung') && !result.Materialklassifizierung) {
                    result.Materialklassifizierung = value;
                } else if (key.includes('statistische warennummer') && !result['Statistische Warennummer']) {
                    result['Statistische Warennummer'] = value;
                }
            });
            
        } catch (error) {
            console.log('⚠️ Fehler bei HTML-Extraktion:', error.message);
        }
    }

    interpretMaterialClassification(classification) {
        if (!classification) return "Nicht bewertet";
        
        const lower = classification.toLowerCase();
        
        if (lower.includes('nicht schweiss') && lower.includes('guss') && lower.includes('klebe') && lower.includes('schmiede')) {
            return "OHNE/N/N/N/N - Material ist nicht schweißbar, gießbar, klebbar oder schmiedbar";
        }
        
        if (lower.includes('nicht schweiss')) {
            return "Nicht schweißbar - Material kann nicht geschweißt werden";
        }
        
        return classification; // Return original if no specific interpretation found
    }
}

// Global scraper instance
const scraper = new SiemensProductScraper();

// Routes
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.post('/api/scrape', async (req, res) => {
    try {
        const { articleNumber } = req.body;
        
        if (!articleNumber) {
            return res.status(400).json({ 
                error: 'Artikelnummer ist erforderlich',
                status: 'error'
            });
        }

        console.log(`📦 Starte Scraping für Artikelnummer: ${articleNumber}`);
        
        const result = await scraper.scrapeProduct(articleNumber);
        
        console.log(`✅ Scraping abgeschlossen für: ${articleNumber}`);
        console.log(`📊 Status: ${result.Status}`);
        
        res.json({
            success: true,
            data: result,
            timestamp: new Date().toISOString()
        });
        
    } catch (error) {
        console.error('❌ API Fehler:', error);
        res.status(500).json({ 
            error: error.message,
            status: 'error',
            timestamp: new Date().toISOString()
        });
    }
});

app.get('/api/health', (req, res) => {
    res.json({ 
        status: 'OK', 
        service: 'DB Produktvergleich API',
        browser: scraper.browser ? 'Bereit' : 'Nicht initialisiert',
        timestamp: new Date().toISOString()
    });
});

// Debug endpoint to check page content for troubleshooting
app.get('/api/debug/:articleNumber', async (req, res) => {
    try {
        const { articleNumber } = req.params;
        const url = `https://www.mymobase.com/de/p/${articleNumber}`;
        
        console.log(`🔍 Debug-Request für: ${articleNumber}`);
        
        const browser = await scraper.initBrowser();
        const page = await browser.newPage();
        
        await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
        
        const debugInfo = await page.evaluate(() => {
            return {
                title: document.title,
                hasInitialData: !!window.initialData,
                initialDataKeys: window.initialData ? Object.keys(window.initialData) : [],
                productDataExists: !!(window.initialData && window.initialData['product/dataProduct']),
                tables: document.querySelectorAll('table').length,
                divs: document.querySelectorAll('div').length,
                url: window.location.href,
                bodyText: document.body.textContent.substring(0, 500) + '...'
            };
        });
        
        await page.close();
        
        res.json({
            success: true,
            articleNumber,
            url,
            debugInfo,
            timestamp: new Date().toISOString()
        });
        
    } catch (error) {
        console.error('❌ Debug-Fehler:', error);
        res.status(500).json({
            success: false,
            error: error.message,
            articleNumber: req.params.articleNumber,
            timestamp: new Date().toISOString()
        });
    }
});

// Graceful shutdown
process.on('SIGINT', async () => {
    console.log('\n🛑 Server wird heruntergefahren...');
    await scraper.closeBrowser();
    process.exit(0);
});

process.on('SIGTERM', async () => {
    console.log('\n🛑 Server wird beendet...');
    await scraper.closeBrowser();
    process.exit(0);
});

// Start server
app.listen(PORT, () => {
    console.log(`
🚀 DB Produktvergleich Tool Server gestartet!

📍 Server läuft auf: http://localhost:${PORT}
🌐 Frontend: http://localhost:${PORT}
🔧 API Health: http://localhost:${PORT}/api/health

📘 API Endpoints:
   POST /api/scrape - Web-Scraping für Artikelnummer
   GET  /api/health - Server Status
   
💡 Zum Stoppen: Ctrl+C drücken
    `);
});

module.exports = app;
