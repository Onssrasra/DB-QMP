#!/bin/bash
echo "🚀 Deploying DB Produktvergleich Tool..."

# Install dependencies
echo "📦 Installing dependencies..."
npm install

# Install Playwright browsers
echo "🌐 Installing browsers for web scraping..."
npx playwright install chromium

# Set executable permissions for browsers
echo "🔧 Setting browser permissions..."
chmod -R 755 ~/.cache/ms-playwright/ 2>/dev/null || true

echo "✅ Deployment complete!"
echo "🎯 Start the server with: npm start"