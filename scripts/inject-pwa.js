// Post-build : injecte les meta PWA dans dist/index.html
// et copie les fichiers PWA (sw.js, manifest, icones) dans dist/
const fs = require('fs');
const path = require('path');

const distDir = path.join(__dirname, '..', 'dist');
const publicDir = path.join(__dirname, '..', 'public');

// 1. Verifier que dist/index.html existe
const htmlPath = path.join(distDir, 'index.html');
if (!fs.existsSync(htmlPath)) {
    console.log('dist/index.html introuvable — lancez expo export d\'abord');
    process.exit(1);
}

// 2. Copier TOUS les fichiers public/ dans dist/
const publicFiles = [
    'sw.js',
    'manifest.json',
    'offline.html',
    'pwa-icon-192.png',
    'pwa-icon-512.png',
    'pwa-icon-maskable-192.png',
    'pwa-icon-maskable-512.png',
    'screenshot-mobile.png',
    'screenshot-wide.png',
];

let copied = 0;
for (const file of publicFiles) {
    const src = path.join(publicDir, file);
    const dest = path.join(distDir, file);
    if (fs.existsSync(src)) {
        fs.copyFileSync(src, dest);
        copied++;
    }
}
console.log(`${copied} fichiers PWA copies dans dist/`);

// 3. Injecter les meta PWA dans index.html
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
    // Corriger lang="en" -> lang="fr"
    html = html.replace('lang="en"', 'lang="fr"');
    fs.writeFileSync(htmlPath, html);
    console.log('PWA tags injectes dans dist/index.html');
}
