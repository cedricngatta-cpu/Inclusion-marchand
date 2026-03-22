// Post-build : injecte les meta PWA dans dist/index.html
const fs = require('fs');
const path = require('path');

const htmlPath = path.join(__dirname, '..', 'dist', 'index.html');
if (!fs.existsSync(htmlPath)) {
    console.log('dist/index.html introuvable — lancez expo export d\'abord');
    process.exit(1);
}

let html = fs.readFileSync(htmlPath, 'utf8');

const pwaTags = [
    '<link rel="manifest" href="/manifest.json" />',
    '<link rel="apple-touch-icon" href="/pwa-icon-192.png" />',
    '<meta name="apple-mobile-web-app-capable" content="yes" />',
    '<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />',
    '<meta name="apple-mobile-web-app-title" content="Julaba" />',
].join('\n');

if (html.includes('rel="manifest"')) {
    console.log('PWA tags deja presents');
} else {
    html = html.replace('</head>', pwaTags + '\n</head>');
    // Corriger lang="en" → lang="fr"
    html = html.replace('lang="en"', 'lang="fr"');
    fs.writeFileSync(htmlPath, html);
    console.log('PWA tags injectes dans dist/index.html');
}
