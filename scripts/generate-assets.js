// ─────────────────────────────────────────────────────────────────────────────
// Génération des assets visuels — Inclusion Marchand Mobile
// ─────────────────────────────────────────────────────────────────────────────
//
// Prérequis : npm install --save-dev jimp@0.22.12
// Usage     : node scripts/generate-assets.js
//
// Génère dans assets/ :
//   icon.png                     1024×1024  icône iOS / web (fond vert + logo)
//   splash-icon.png               512×512   logo centré sur fond transparent
//   android-icon-foreground.png  1024×1024  calque avant icône adaptive
//   android-icon-monochrome.png  1024×1024  version monochrome (notifications)
//   favicon.png                   196×196   favicon web
// ─────────────────────────────────────────────────────────────────────────────
'use strict';

const Jimp = require('jimp');
const path = require('path');

const ASSETS = path.join(__dirname, '..', 'assets');

// ── Couleurs (RGBA int) ────────────────────────────────────────────────────
const GREEN       = 0x059669FF;  // vert principal
const WHITE       = 0xFFFFFFFF;
const TRANSPARENT = 0x00000000;

// ── Helpers ────────────────────────────────────────────────────────────────

/**
 * Dessine un rectangle arrondi en blanc semi-transparent sur l'image.
 * Simule un badge "IM" en dessinant une zone avec les coins arrondis.
 */
function drawRoundedRect(img, x, y, w, h, r, colorInt) {
    // Remplissage du rectangle central (sans coins)
    for (let px = x + r; px < x + w - r; px++) {
        for (let py = y; py < y + h; py++) {
            img.setPixelColor(colorInt, px, py);
        }
    }
    // Côtés gauche et droit
    for (let px = x; px < x + r; px++) {
        for (let py = y + r; py < y + h - r; py++) {
            img.setPixelColor(colorInt, px, py);
            img.setPixelColor(colorInt, x + w - 1 - (px - x), py);
        }
    }
    // Coins (quart de cercle)
    for (let cx = 0; cx < r; cx++) {
        for (let cy = 0; cy < r; cy++) {
            if ((cx - r + 0.5) ** 2 + (cy - r + 0.5) ** 2 < r * r) {
                img.setPixelColor(colorInt, x + cx, y + cy);
                img.setPixelColor(colorInt, x + w - 1 - cx, y + cy);
                img.setPixelColor(colorInt, x + cx, y + h - 1 - cy);
                img.setPixelColor(colorInt, x + w - 1 - cx, y + h - 1 - cy);
            }
        }
    }
}

/**
 * Dessine une maison stylisée (symbole commerce) en pixel art.
 * - base (magasin) : rectangle
 * - toit (triangle) : lignes diagonales
 */
function drawShopSymbol(img, centerX, centerY, size, colorInt) {
    const half  = Math.floor(size / 2);
    const bw    = Math.floor(size * 0.65);  // largeur base
    const bh    = Math.floor(size * 0.45);  // hauteur base
    const bx    = centerX - Math.floor(bw / 2);
    const by    = centerY - Math.floor(bh / 2) + Math.floor(size * 0.08);
    const thick = Math.max(1, Math.floor(size * 0.06));

    // ── Base (rectangle plein) ────────────────────────────────────────────
    for (let px = bx; px < bx + bw; px++) {
        for (let py = by; py < by + bh; py++) {
            img.setPixelColor(colorInt, px, py);
        }
    }

    // ── Porte (rectangle foncé soustrait / inversé) ──────────────────────
    // On "creuse" la porte en la laissant transparente — on dessine juste un
    // contour pour simuler une porte
    const dw = Math.floor(bw * 0.28);
    const dh = Math.floor(bh * 0.55);
    const dx = centerX - Math.floor(dw / 2);
    const dy = by + bh - dh;
    for (let px = dx; px < dx + dw; px++) {
        for (let py = dy; py < dy + dh; py++) {
            img.setPixelColor(TRANSPARENT, px, py);
        }
    }

    // ── Toit (triangle via lignes horizontales) ───────────────────────────
    const roofHeight = Math.floor(size * 0.30);
    const roofTop    = by - roofHeight;
    const roofHalfW  = Math.floor(bw * 0.60);

    for (let row = 0; row < roofHeight; row++) {
        const rowRatio = row / roofHeight;           // 0 → sommet, 1 → base
        const rowHalf  = Math.floor(rowRatio * roofHalfW);
        const rowY     = roofTop + row;
        for (let t = 0; t < thick; t++) {
            img.setPixelColor(colorInt, centerX - rowHalf + t, rowY);
            img.setPixelColor(colorInt, centerX + rowHalf - t, rowY);
        }
    }
    // Ligne faîtière (sommet du toit)
    for (let t = -thick; t <= thick; t++) {
        img.setPixelColor(colorInt, centerX + t, roofTop);
    }

    // ── Lettres "IM" sous le toit — encodées en segments ─────────────────
    // (On ne les dessine pas ici — le badge sera ajouté séparément si besoin)
}

// ── Générateurs ────────────────────────────────────────────────────────────

async function generateIcon() {
    const S   = 1024;
    const img = new Jimp(S, S, GREEN);

    // Badge blanc arrondi centré (zone logo)
    const bw = Math.floor(S * 0.56);
    const bh = Math.floor(S * 0.56);
    const bx = Math.floor((S - bw) / 2);
    const by = Math.floor((S - bh) / 2) - Math.floor(S * 0.04);
    drawRoundedRect(img, bx, by, bw, bh, 40, 0xFFFFFF30); // blanc 19%

    // Symbole maison / commerce centré
    drawShopSymbol(img, S / 2, S / 2 - 20, Math.floor(S * 0.38), WHITE);

    // Bande "IM" en bas : texte simulé en pixels (bitmap 7×9)
    const font = await Jimp.loadFont(Jimp.FONT_SANS_64_WHITE);
    img.print(
        font,
        0,
        Math.floor(S * 0.71),
        { text: 'Inclusion Marchand', alignmentX: Jimp.HORIZONTAL_ALIGN_CENTER },
        S,
        80,
    );

    await img.writeAsync(path.join(ASSETS, 'icon.png'));
    console.log('✅  icon.png (1024×1024)');
}

async function generateSplash() {
    // Image transparente — Expo affiche `backgroundColor` (#059669) en fond
    const S   = 512;
    const img = new Jimp(S, S, TRANSPARENT);

    // Symbole blanc centré
    drawShopSymbol(img, S / 2, S / 2 - 40, Math.floor(S * 0.50), WHITE);

    // Texte en dessous
    const font32 = await Jimp.loadFont(Jimp.FONT_SANS_32_WHITE);
    img.print(
        font32,
        0,
        Math.floor(S * 0.68),
        { text: 'Inclusion Marchand', alignmentX: Jimp.HORIZONTAL_ALIGN_CENTER },
        S,
        48,
    );

    const font16 = await Jimp.loadFont(Jimp.FONT_SANS_16_WHITE);
    img.print(
        font16,
        0,
        Math.floor(S * 0.79),
        { text: 'Commerce inclusif en Afrique', alignmentX: Jimp.HORIZONTAL_ALIGN_CENTER },
        S,
        28,
    );

    await img.writeAsync(path.join(ASSETS, 'splash-icon.png'));
    console.log('✅  splash-icon.png (512×512 transparent)');
}

async function generateAndroidForeground() {
    const S   = 1024;
    const img = new Jimp(S, S, TRANSPARENT);

    // Zone sécurisée adaptive icon = cercle central ≈ 66% → on centre le dessin
    drawShopSymbol(img, S / 2, S / 2 - 30, Math.floor(S * 0.42), WHITE);

    const font = await Jimp.loadFont(Jimp.FONT_SANS_64_WHITE);
    img.print(
        font,
        0,
        Math.floor(S * 0.68),
        { text: 'Inclusion Marchand', alignmentX: Jimp.HORIZONTAL_ALIGN_CENTER },
        S,
        80,
    );

    await img.writeAsync(path.join(ASSETS, 'android-icon-foreground.png'));
    console.log('✅  android-icon-foreground.png (1024×1024 transparent)');
}

async function generateAndroidMonochrome() {
    // Identique foreground — Android colore lui-même selon le thème
    const S   = 1024;
    const img = new Jimp(S, S, TRANSPARENT);

    drawShopSymbol(img, S / 2, S / 2 - 30, Math.floor(S * 0.42), WHITE);

    const font = await Jimp.loadFont(Jimp.FONT_SANS_64_WHITE);
    img.print(
        font,
        0,
        Math.floor(S * 0.68),
        { text: 'Inclusion Marchand', alignmentX: Jimp.HORIZONTAL_ALIGN_CENTER },
        S,
        80,
    );

    await img.writeAsync(path.join(ASSETS, 'android-icon-monochrome.png'));
    console.log('✅  android-icon-monochrome.png (1024×1024 transparent)');
}

async function generateFavicon() {
    const S   = 196;
    const img = new Jimp(S, S, GREEN);

    drawShopSymbol(img, S / 2, S / 2 - 8, Math.floor(S * 0.50), WHITE);

    await img.writeAsync(path.join(ASSETS, 'favicon.png'));
    console.log('✅  favicon.png (196×196)');
}

// ── Entrée ─────────────────────────────────────────────────────────────────

async function main() {
    console.log('\n🎨  Génération des assets visuels — Inclusion Marchand\n');
    await generateIcon();
    await generateSplash();
    await generateAndroidForeground();
    await generateAndroidMonochrome();
    await generateFavicon();
    console.log('\n🎉  Terminé ! Tous les assets sont dans assets/');
    console.log('    → Relance : npx expo start --clear\n');
}

main().catch(err => {
    if (err.code === 'MODULE_NOT_FOUND') {
        console.error('\n❌  jimp manquant. Installe-le d\'abord :');
        console.error('   npm install --save-dev jimp@0.22.12\n');
    } else {
        console.error('❌  Erreur :', err.message);
    }
    process.exit(1);
});
