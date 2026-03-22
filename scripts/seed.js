// ─────────────────────────────────────────────────────────────────────────────
// SEED — Données de démo réalistes — Jùlaba Mobile
// Produits vivriers ivoiriens — Marchés d'Abidjan
// ─────────────────────────────────────────────────────────────────────────────
//
// Prérequis :
//   La clé service_role se trouve dans :
//   Supabase Dashboard → Settings → API → service_role (secret)
//
// Usage :
//   SUPABASE_SERVICE_KEY=<clé_service> node scripts/seed.js
//   SUPABASE_SERVICE_KEY=<clé_service> node scripts/seed.js --reset
//
// --reset vide toutes les tables avant d'insérer (pour un seed propre).
// ─────────────────────────────────────────────────────────────────────────────
'use strict';

const { createClient } = require('@supabase/supabase-js');
const fs   = require('fs');
const path = require('path');

const SUPABASE_URL  = process.env.SUPABASE_URL || process.env.EXPO_PUBLIC_SUPABASE_URL || 'https://lpowdjvxikqtorhadhyv.supabase.co';
const SERVICE_KEY   = process.env.SUPABASE_SERVICE_KEY;
const RESET         = process.argv.includes('--reset');

if (!SERVICE_KEY) {
    console.error('\n❌  SUPABASE_SERVICE_KEY manquant.\n');
    console.error('   Récupère-la dans : Supabase Dashboard → Settings → API → service_role');
    console.error('   Puis relance : SUPABASE_SERVICE_KEY=<clé> node scripts/seed.js\n');
    process.exit(1);
}

const sb = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
});

// ── Helpers ───────────────────────────────────────────────────────────────────
const uid = () =>
    'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
        const r = (Math.random() * 16) | 0;
        return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
    });

const daysAgo = (maxDays, minDays = 0) => {
    const d = new Date();
    d.setDate(d.getDate() - (minDays + Math.floor(Math.random() * (maxDays - minDays + 1))));
    d.setHours(7 + Math.floor(Math.random() * 11), Math.floor(Math.random() * 60));
    return d.toISOString();
};

const daysFromNow = (n) => {
    const d = new Date();
    d.setDate(d.getDate() + n);
    return d.toISOString().split('T')[0];
};

const daysAgoDate = (n) => {
    const d = new Date();
    d.setDate(d.getDate() - n);
    return d.toISOString().split('T')[0];
};

const today = (hourOffset = 0) => {
    const d = new Date();
    d.setHours(7 + hourOffset, Math.floor(Math.random() * 59));
    return d.toISOString();
};

const pick    = (arr) => arr[Math.floor(Math.random() * arr.length)];
const rnd     = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;

// Couleurs par catégorie de produit
const catCol = {
    TUBERCULE:   { color: '#FFF7ED', icon_color: '#92400E' },
    LEGUME:      { color: '#ECFDF5', icon_color: '#059669' },
    FRUIT:       { color: '#FEF3C7', icon_color: '#EA580C' },
    CEREALE:     { color: '#FFFBEB', icon_color: '#D97706' },
    VIANDE:      { color: '#FEF2F2', icon_color: '#DC2626' },
    MANUFACTURE: { color: '#EFF6FF', icon_color: '#2563EB' },
};

// Prix marchand : prix référence × variation aléatoire [0.9 – 1.15]
const marchPrice = (ref) => Math.round(ref * (0.9 + Math.random() * 0.25));

function removeAccents(str) {
    return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

// ── Catalogue de référence — prix FCFA/kg ─────────────────────────────────────
const CATALOGUE = {
    // TUBERCULES
    'Igname Kponan':                  { ref: 700,  cat: 'TUBERCULE' },
    'Igname Assawa':                  { ref: 300,  cat: 'TUBERCULE' },
    'Patate douce':                   { ref: 300,  cat: 'TUBERCULE' },
    'Banane plantain':                { ref: 250,  cat: 'TUBERCULE' },
    'Manioc':                         { ref: 250,  cat: 'TUBERCULE' },
    'Pomme de terre':                 { ref: 500,  cat: 'TUBERCULE' },
    // LEGUMES
    'Carotte':                        { ref: 800,  cat: 'LEGUME' },
    'Chou':                           { ref: 350,  cat: 'LEGUME' },
    'Oignon violet':                  { ref: 550,  cat: 'LEGUME' },
    'Oignon blanc':                   { ref: 600,  cat: 'LEGUME' },
    'Piment':                         { ref: 750,  cat: 'LEGUME' },
    'Gombo Baoulé':                   { ref: 500,  cat: 'LEGUME' },
    'Gombo Dioula':                   { ref: 500,  cat: 'LEGUME' },
    "Aubergine N'drowa":              { ref: 250,  cat: 'LEGUME' },
    'Aubergine violette':             { ref: 350,  cat: 'LEGUME' },
    'Haricot vert':                   { ref: 600,  cat: 'LEGUME' },
    'Haricot Niébé blanc':            { ref: 400,  cat: 'LEGUME' },
    'Graine de palme':                { ref: 250,  cat: 'LEGUME' },
    'Tomate salade':                  { ref: 550,  cat: 'LEGUME' },
    'Courgette':                      { ref: 350,  cat: 'LEGUME' },
    'Navet':                          { ref: 650,  cat: 'LEGUME' },
    'Poivron':                        { ref: 500,  cat: 'LEGUME' },
    'Concombre':                      { ref: 400,  cat: 'LEGUME' },
    'Gingembre':                      { ref: 400,  cat: 'LEGUME' },
    // FRUITS
    'Citron':                         { ref: 400,  cat: 'FRUIT' },
    'Citron Meyer':                   { ref: 700,  cat: 'FRUIT' },
    'Avocat':                         { ref: 300,  cat: 'FRUIT' },
    'Papaye solo':                    { ref: 400,  cat: 'FRUIT' },
    'Ananas':                         { ref: 350,  cat: 'FRUIT' },
    'Banane douce':                   { ref: 600,  cat: 'FRUIT' },
    'Orange':                         { ref: 250,  cat: 'FRUIT' },
    'Corossol':                       { ref: 1000, cat: 'FRUIT' },
    'Pamplemousse':                   { ref: 300,  cat: 'FRUIT' },
    'Goyave':                         { ref: 900,  cat: 'FRUIT' },
    'Tangelo':                        { ref: 800,  cat: 'FRUIT' },
    'Mangues':                        { ref: 400,  cat: 'FRUIT' },
    // CEREALES
    'Mil':                            { ref: 400,  cat: 'CEREALE' },
    'Fonio':                          { ref: 800,  cat: 'CEREALE' },
    'Arachide décortiquée':           { ref: 600,  cat: 'CEREALE' },
    'Riz 25% brisure':                { ref: 312,  cat: 'CEREALE' },
    'Riz 5-100% brisure':             { ref: 350,  cat: 'CEREALE' },
    // VIANDE / BOUCHERIE
    'Viande boeuf avec os':           { ref: 2300, cat: 'VIANDE' },
    'Viande boeuf sans os':           { ref: 2750, cat: 'VIANDE' },
    'Viande mouton':                  { ref: 3400, cat: 'VIANDE' },
    'Poulet de chair':                { ref: 2000, cat: 'VIANDE' },
    // MANUFACTURES
    'Huile raffinée 0.9L':            { ref: 875,  cat: 'MANUFACTURE' },
    'Tomate concentrée locale 370g':  { ref: 450,  cat: 'MANUFACTURE' },
    'Tomate concentrée importée 70g': { ref: 100,  cat: 'MANUFACTURE' },
    'Sucre poudre sachet':            { ref: 750,  cat: 'MANUFACTURE' },
    'Sucre poudre blanc':             { ref: 700,  cat: 'MANUFACTURE' },
    'Sucre morceaux':                 { ref: 850,  cat: 'MANUFACTURE' },
};

// ── Attribution marchands ─────────────────────────────────────────────────────
// Kouassi : généraliste 18 | Adjoua : fruits & légumes 15
// Konaté : céréales & épicerie 12 | Bamba : vivriers traditionnels 12 | Tra Bi : mini-marché 10
const MERCHANT_ASSORTMENTS = {
    sm1: [
        'Igname Kponan', 'Banane plantain', 'Manioc', 'Patate douce',
        'Oignon violet', 'Piment', 'Tomate salade', 'Gombo Baoulé', 'Carotte',
        'Avocat', 'Orange', 'Mangues',
        'Poulet de chair', 'Viande boeuf avec os',
        'Riz 25% brisure', 'Huile raffinée 0.9L', 'Sucre poudre blanc', 'Tomate concentrée locale 370g',
    ],
    sm2: [
        'Carotte', 'Chou', 'Oignon blanc', 'Piment', 'Gombo Dioula',
        "Aubergine N'drowa", 'Haricot vert', 'Tomate salade', 'Courgette', 'Poivron', 'Concombre',
        'Citron', 'Papaye solo', 'Ananas', 'Banane douce',
    ],
    sm3: [
        'Riz 25% brisure', 'Riz 5-100% brisure', 'Mil', 'Fonio', 'Arachide décortiquée',
        'Huile raffinée 0.9L', 'Tomate concentrée locale 370g', 'Tomate concentrée importée 70g',
        'Sucre poudre sachet', 'Sucre poudre blanc', 'Sucre morceaux',
        'Gingembre',
    ],
    sm4: [
        'Igname Kponan', 'Igname Assawa', 'Manioc', 'Banane plantain', 'Patate douce', 'Pomme de terre',
        'Gombo Baoulé', 'Gombo Dioula', "Aubergine N'drowa", 'Aubergine violette', 'Graine de palme', 'Piment',
    ],
    sm5: [
        'Igname Assawa', 'Banane plantain',
        'Oignon violet', 'Tomate salade', 'Piment',
        'Orange', 'Mangues',
        'Riz 25% brisure', 'Huile raffinée 0.9L',
        'Poulet de chair',
    ],
};

// ── Attribution producteurs (prix = ref × 0.7 × batch) ───────────────────────
const PRODUCER_CATALOGUE = {
    sp1: [
        { name: 'Riz brisé 25% - sac 25kg',       ref: 312, batch: 25, cat: 'CEREALE',   delivery: 1500, zone: 'Tout le pays', delai: '3-5 jours', desc: 'Riz brisé de qualité supérieure, cultivé dans la région de Bouaké. Sac de 25kg soigneusement trié.' },
        { name: 'Mil grain - sac 25kg',             ref: 400, batch: 25, cat: 'CEREALE',   delivery: 1000, zone: 'Tout le pays', delai: '3-5 jours', desc: 'Mil en grain séché au soleil, idéal pour le tô et les bouillies. Récolte de la saison sèche.' },
        { name: 'Fonio précuit - sac 5kg',          ref: 800, batch: 5,  cat: 'CEREALE',   delivery: 500,  zone: 'Abidjan',      delai: '1-2 jours', desc: 'Fonio premium lavé et précuit, prêt à cuire en 10 min. Céréale ancestrale riche en nutriments.' },
        { name: 'Arachide décortiquée - sac 10kg',  ref: 600, batch: 10, cat: 'CEREALE',   delivery: 800,  zone: 'Tout le pays', delai: '3-5 jours', desc: "Arachides décortiquées et triées, idéales pour la pâte d'arachide et les sauces." },
    ],
    sp2: [
        { name: 'Tomate fraîche - caisse 10kg',     ref: 550, batch: 10, cat: 'LEGUME',    delivery: 500,  zone: 'Abidjan',      delai: 'Sous 24h',  desc: 'Tomates fraîches cultivées sans pesticides, récoltées ce matin. Fermes et rouges.' },
        { name: "Aubergine N'drowa - caisse 5kg",   ref: 250, batch: 5,  cat: 'LEGUME',    delivery: 300,  zone: 'Abidjan',      delai: 'Sous 24h',  desc: 'Aubergines locales fraîches, calibre moyen, idéales pour les sauces.' },
        { name: 'Gombo Baoulé frais - panier 3kg',  ref: 500, batch: 3,  cat: 'LEGUME',    delivery: 300,  zone: 'Abidjan',      delai: 'Sous 24h',  desc: 'Gombo frais et ferme, cultivé sans produits chimiques.' },
        { name: 'Piment frais - panier 2kg',        ref: 750, batch: 2,  cat: 'LEGUME',    delivery: 200,  zone: 'Abidjan',      delai: 'Sous 24h',  desc: 'Piment frais très piquant, variété locale. Récolte du jour.' },
        { name: 'Haricot vert - caisse 5kg',        ref: 600, batch: 5,  cat: 'LEGUME',    delivery: 300,  zone: 'Abidjan',      delai: 'Sous 24h',  desc: 'Haricots verts frais et croquants, cueillis le matin même.' },
        { name: 'Concombre - caisse 10kg',          ref: 400, batch: 10, cat: 'LEGUME',    delivery: 400,  zone: 'Abidjan',      delai: 'Sous 24h',  desc: 'Concombres frais de plein champ, calibre uniforme.' },
        { name: 'Courgette - caisse 5kg',           ref: 350, batch: 5,  cat: 'LEGUME',    delivery: 300,  zone: 'Abidjan',      delai: 'Sous 24h',  desc: 'Courgettes vertes cultivées en maraîchage péri-urbain.' },
        { name: 'Chou pommé - lot 5 pièces',        ref: 350, batch: 5,  cat: 'LEGUME',    delivery: 300,  zone: 'Abidjan',      delai: 'Sous 24h',  desc: 'Choux pommés bien formés, cultivés à Yamoussoukro.' },
    ],
    sp3: [
        { name: 'Igname Kponan - tas 10kg',         ref: 700, batch: 10, cat: 'TUBERCULE', delivery: 1000, zone: 'Tout le pays', delai: '3-5 jours', desc: 'Igname Kponan de Bondoukou, qualité premium. Variété la plus appréciée pour le foutou.' },
        { name: 'Igname Assawa - tas 10kg',          ref: 300, batch: 10, cat: 'TUBERCULE', delivery: 1000, zone: 'Tout le pays', delai: '3-5 jours', desc: 'Igname Assawa, chair blanche et tendre. Idéale bouillie ou en ragoût.' },
        { name: 'Manioc frais - sac 15kg',           ref: 250, batch: 15, cat: 'TUBERCULE', delivery: 800,  zone: 'Bouaké',       delai: '1-2 jours', desc: "Manioc doux frais, idéal pour l'attiéké maison. Récolte hebdomadaire." },
        { name: 'Patate douce - sac 10kg',           ref: 300, batch: 10, cat: 'TUBERCULE', delivery: 500,  zone: 'Tout le pays', delai: '3-5 jours', desc: 'Patates douces à chair orange, riches en vitamines. Cultivées à Korhogo.' },
        { name: 'Banane plantain - régime 12kg',     ref: 250, batch: 12, cat: 'TUBERCULE', delivery: 500,  zone: 'Tout le pays', delai: '2-3 jours', desc: 'Régime de banane plantain mûr à point, parfait pour alloco et foutou banane.' },
    ],
};

// ── Mapping nom produit → image réelle dans assets/products/ ─────────────────
const PRODUCT_IMAGE_MAP = {
    'Igname Kponan':                  'igname_kponan.png',
    'Igname Assawa':                  null, // pas d'image réelle
    'Patate douce':                   'patate_douce.png',
    'Banane plantain':                'banane_plantain.png',
    'Manioc':                         'manioc.png',
    'Pomme de terre':                 'pomme_de_terre.png',
    'Carotte':                        'carotte.png',
    'Chou':                           'chou.png',
    'Oignon violet':                  'oignon_violet.png',
    'Oignon blanc':                   'oignon_blanc.png',
    'Piment':                         'piment.png',
    'Gombo Baoulé':                   'gombo_baoule.png',
    'Gombo Dioula':                   'gombo_dioula.png',
    "Aubergine N'drowa":              'aubergine_ndrowa.png',
    'Aubergine violette':             'aubergine_violette.png',
    'Haricot vert':                   'haricot_vert.png',
    'Haricot Niébé blanc':            'haricot_niebe_blanc.png',
    'Graine de palme':                'graine_de_palme.png',
    'Tomate salade':                  'tomate_salade.png',
    'Courgette':                      'courgette.png',
    'Navet':                          'navet.png',
    'Poivron':                        'poivron.png',
    'Concombre':                      'concombre.png',
    'Gingembre':                      'gingembre.png',
    'Citron':                         'citron.png',
    'Citron Meyer':                   'citron_meyer.png',
    'Avocat':                         'avocat.png',
    'Papaye solo':                    'papaye_solo.png',
    'Ananas':                         'ananas.png',
    'Banane douce':                   'banane_douce.png',
    'Orange':                         'orange.png',
    'Corossol':                       'corossol.png',
    'Pamplemousse':                   'pamplemousse.png',
    'Goyave':                         'goyave.png',
    'Tangelo':                        'tangelo.png',
    'Mangues':                        'mangue.png',
    'Mil':                            'mil.png',
    'Fonio':                          'fonio.png',
    'Arachide décortiquée':           'arachide_decortiquee.png',
    'Riz 25% brisure':                'riz_25_brisure.png',
    'Riz 5-100% brisure':             'riz_5_100_brisure.png',
    'Viande boeuf avec os':           'viande_boeuf_avec_os.png',
    'Viande boeuf sans os':           'viande_boeuf_sans_os.png',
    'Viande mouton':                  'viande_mouton.png',
    'Poulet de chair':                'poulet_de_chair.png',
    'Huile raffinée 0.9L':            'huile_raffinee.png',
    'Tomate concentrée locale 370g':  'tomate_concentree_locale.png',
    'Tomate concentrée importée 70g': 'tomate_concentree_importee.png',
    'Sucre poudre sachet':            'sucre_poudre_sachet.png',
    'Sucre poudre blanc':             'sucre_poudre_blanc.png',
    'Sucre morceaux':                 'sucre_morceaux.png',
};

// Mapping partiel pour les produits producteurs (nom long → image de base)
const PRODUCER_IMAGE_KEYWORDS = [
    ['riz',        'riz_25_brisure.png'],
    ['mil',        'mil.png'],
    ['fonio',      'fonio.png'],
    ['arachide',   'arachide_decortiquee.png'],
    ['tomate',     'tomate_salade.png'],
    ['aubergine',  'aubergine_ndrowa.png'],
    ['gombo',      'gombo_baoule.png'],
    ['piment',     'piment.png'],
    ['haricot',    'haricot_vert.png'],
    ['concombre',  'concombre.png'],
    ['courgette',  'courgette.png'],
    ['chou',       'chou.png'],
    ['igname',     'igname_kponan.png'],
    ['manioc',     'manioc.png'],
    ['patate',     'patate_douce.png'],
    ['banane',     'banane_plantain.png'],
];

function findImageFile(productName) {
    // 1. Correspondance directe (produits marchands)
    const direct = PRODUCT_IMAGE_MAP[productName];
    if (direct) return direct;

    // 2. Recherche par mot-clé (produits producteurs avec noms longs)
    const lower = productName.toLowerCase();
    for (const [keyword, file] of PRODUCER_IMAGE_KEYWORDS) {
        if (lower.includes(keyword)) return file;
    }

    return null; // pas d'image réelle → fallback SVG
}

// ── Couleurs d'image par catégorie ─────────────────────────────────────────────
const IMAGE_BG = {
    TUBERCULE:   '#8B6914',
    LEGUME:      '#2D7D3A',
    FRUIT:       '#E87C1E',
    CEREALE:     '#C49B1A',
    VIANDE:      '#B22222',
    MANUFACTURE: '#3366AA',
};

// ── Génération SVG → PNG (via sharp) + Upload Supabase Storage ────────────────
function buildProductSVG(prod) {
    const W = 400, H = 400;
    const bgColor = IMAGE_BG[prod.category] || '#666666';

    // Découper le nom en lignes (~20 chars max par ligne)
    const words = prod.name.split(' ');
    const lines = [];
    let line = '';
    for (const word of words) {
        if ((line + ' ' + word).trim().length > 20 && line) {
            lines.push(line);
            line = word;
        } else {
            line = line ? line + ' ' + word : word;
        }
    }
    if (line) lines.push(line);

    const lineHeight = 36;
    const nameBlockY = (H - 80) / 2 - ((lines.length - 1) * lineHeight) / 2;
    const tspans = lines.map((l, i) => {
        const escaped = l.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/'/g, '&apos;');
        const y = nameBlockY + i * lineHeight;
        return `<text x="${W / 2}" y="${y}" text-anchor="middle" dominant-baseline="middle" font-family="Arial,Helvetica,sans-serif" font-weight="bold" font-size="28" fill="white">${escaped}</text>`;
    }).join('\n  ');

    const priceStr = prod.price.toLocaleString('fr-FR') + ' F CFA';

    return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
  <rect width="${W}" height="${H}" rx="16" fill="${bgColor}"/>
  <rect y="${H - 80}" width="${W}" height="80" rx="0" fill="rgba(0,0,0,0.2)"/>
  ${tspans}
  <text x="${W / 2}" y="${H - 40}" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-size="16" fill="rgba(255,255,255,0.85)">${priceStr}</text>
  <text x="${W / 2}" y="${H - 18}" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-size="13" fill="rgba(255,255,255,0.5)">${prod.category}</text>
</svg>`;
}

async function uploadProductImages(allProducts) {
    console.log(`\n🖼️  Upload de ${allProducts.length} images produits...`);

    const ASSETS_DIR = path.join(__dirname, '..', 'assets', 'products');

    let sharp;
    try {
        sharp = require('sharp');
    } catch {
        console.log('  ⚠️  Module sharp non installé — images réelles uniquement (pas de fallback SVG)');
        sharp = null;
    }

    let realImages = 0;
    let svgFallbacks = 0;
    let errors = 0;

    // Traiter par lots de 5 pour ne pas surcharger Supabase
    const BATCH = 5;
    for (let i = 0; i < allProducts.length; i += BATCH) {
        const batch = allProducts.slice(i, i + BATCH);
        const results = await Promise.allSettled(batch.map(async (prod) => {
            let imageBuffer;
            let isReal = false;
            let contentType = 'image/png';
            let ext = 'png';

            // 1. Chercher une image réelle dans assets/products/
            const imageFile = findImageFile(prod.name);
            if (imageFile) {
                const localPath = path.join(ASSETS_DIR, imageFile);
                if (fs.existsSync(localPath)) {
                    const rawBuffer = fs.readFileSync(localPath);

                    if (sharp) {
                        // Compression : 400x400 max, JPEG qualité 80%
                        imageBuffer = await sharp(rawBuffer)
                            .resize(400, 400, { fit: 'inside', withoutEnlargement: true })
                            .jpeg({ quality: 80 })
                            .toBuffer();
                        contentType = 'image/jpeg';
                        ext = 'jpg';
                    } else if (rawBuffer.length <= 4 * 1024 * 1024) {
                        // Sans sharp : upload tel quel si < 4MB
                        imageBuffer = rawBuffer;
                    }
                    // Si > 4MB sans sharp → imageBuffer reste null → fallback SVG

                    if (imageBuffer) isReal = true;
                }
            }

            // 2. Fallback : générer un SVG placeholder (si sharp disponible)
            if (!imageBuffer && sharp) {
                const svg = buildProductSVG(prod);
                imageBuffer = await sharp(Buffer.from(svg)).png().toBuffer();
            }

            if (!imageBuffer) {
                throw new Error(`Pas d'image pour ${prod.name} (fichier > 4MB et sharp non disponible)`);
            }

            const storagePath = `${prod.id}.${ext}`;
            const { error: uploadError } = await sb.storage
                .from('products')
                .upload(storagePath, imageBuffer, { contentType, upsert: true });

            if (uploadError) throw new Error(`Upload ${prod.name}: ${uploadError.message}`);

            const publicUrl = `${SUPABASE_URL}/storage/v1/object/public/products/${storagePath}`;
            const { error: updateError } = await sb
                .from('products')
                .update({ image_url: publicUrl })
                .eq('id', prod.id);

            if (updateError) throw new Error(`Update ${prod.name}: ${updateError.message}`);
            return { name: prod.name, isReal };
        }));

        for (const r of results) {
            if (r.status === 'fulfilled') {
                if (r.value.isReal) realImages++;
                else svgFallbacks++;
            } else {
                errors++;
                console.error(`  ❌ ${r.reason.message}`);
            }
        }

        // Afficher la progression tous les 20 produits
        if ((i + BATCH) % 20 < BATCH) {
            console.log(`  📤 ${Math.min(i + BATCH, allProducts.length)}/${allProducts.length}...`);
        }
    }

    const total = realImages + svgFallbacks;
    console.log(`  ✅ ${total}/${allProducts.length} image(s) uploadée(s) — 📷 ${realImages} réelles, 🎨 ${svgFallbacks} SVG${errors ? ` (${errors} erreur(s))` : ''}`);
}

async function ins(table, rows, label) {
    if (!rows.length) return;
    const { error } = await sb.from(table).insert(rows);
    if (error) console.error(`  ❌ ${label}: ${error.message}`);
    else       console.log(`  ✅ ${label}: ${rows.length} ligne(s)`);
}

async function ups(table, rows, label) {
    if (!rows.length) return;
    const { error } = await sb.from(table).upsert(rows, { onConflict: 'id' });
    if (error) console.error(`  ❌ ${label}: ${error.message}`);
    else       console.log(`  ✅ ${label}: ${rows.length} ligne(s) (upsert)`);
}

// ── Nettoyage (toujours exécuté) ──────────────────────────────────────────────
async function reset() {
    console.log('🗑️  Nettoyage des tables existantes...\n');
    const FAKE = '00000000-0000-0000-0000-000000000000';
    for (const [table, col] of [
        ['notifications',                'id'],
        ['reports',                      'id'],
        ['credits_clients',              'id'],
        ['activity_logs',                'id'],
        ['demandes_enrolement',          'id'],
        ['achats_groupes_participants',  'id'],
        ['achats_groupes',               'id'],
        ['orders',              'id'],
        ['transactions',  'id'],
        ['stock',         'product_id'],
        ['products',      'id'],
        ['stores',        'id'],
        ['profiles',      'id'],
    ]) {
        const { error } = await sb.from(table).delete().neq(col, FAKE);
        if (error) console.warn(`  ⚠️  Reset ${table}: ${error.message}`);
        else       console.log(`  🗑️  ${table} vidée`);
    }
    console.log();
}

// ═════════════════════════════════════════════════════════════════════════════
// IDs — générés une seule fois pour cohérence entre les tables
// ═════════════════════════════════════════════════════════════════════════════
const ID = {
    // Profils — marchands
    m1: uid(), m2: uid(), m3: uid(), m4: uid(), m5: uid(),
    // Profils — producteurs
    p1: uid(), p2: uid(), p3: uid(),
    // Profils — agents
    a1: uid(), a2: uid(),
    // Profil — coopérative
    coop: uid(),
    // Profil — admin/superviseur
    admin: uid(),
    // Stores marchands
    sm1: uid(), sm2: uid(), sm3: uid(), sm4: uid(), sm5: uid(),
    // Stores producteurs
    sp1: uid(), sp2: uid(), sp3: uid(),
    // Achats groupés
    ag1: uid(), ag2: uid(), ag3: uid(), ag4: uid(),
};

// Produits marchands — IDs (67 total)
const PM = {
    sm1: Array.from({ length: 18 }, uid),
    sm2: Array.from({ length: 15 }, uid),
    sm3: Array.from({ length: 12 }, uid),
    sm4: Array.from({ length: 12 }, uid),
    sm5: Array.from({ length: 10 }, uid),
};

// Produits producteurs — IDs (17 total)
const PP = {
    sp1: Array.from({ length: 4 }, uid),
    sp2: Array.from({ length: 8 }, uid),
    sp3: Array.from({ length: 5 }, uid),
};

// ═════════════════════════════════════════════════════════════════════════════
async function main() {
    console.log('\n🌱  Seed — Jùlaba Mobile — Produits vivriers ivoiriens\n');

    await reset();

    // ── 1. PROFILS ────────────────────────────────────────────────────────────
    console.log('👤  Profils...');
    await ups('profiles', [
        // ── Marchands ──
        { id: ID.m1, full_name: 'Kouassi Jean-Baptiste', phone_number: '0711223344', pin: '1234', role: 'MERCHANT',   cooperative_id: ID.coop },
        { id: ID.m2, full_name: 'Adjoua Marie Koné',     phone_number: '0555667788', pin: '1234', role: 'MERCHANT',   cooperative_id: ID.coop },
        { id: ID.m3, full_name: 'Konaté Issouf',         phone_number: '0123456789', pin: '1234', role: 'MERCHANT',   cooperative_id: ID.coop },
        { id: ID.m4, full_name: 'Bamba Fatoumata',       phone_number: '0788990011', pin: '1234', role: 'MERCHANT',   cooperative_id: ID.coop },
        { id: ID.m5, full_name: 'Tra Bi Emmanuel',       phone_number: '0544556677', pin: '1234', role: 'MERCHANT',   cooperative_id: ID.coop },
        // ── Producteurs ──
        { id: ID.p1, full_name: 'Coulibaly Mamadou',     phone_number: '0733445566', pin: '1234', role: 'PRODUCER',   cooperative_id: ID.coop },
        { id: ID.p2, full_name: 'Koffi Née Adjoua',      phone_number: '0577889900', pin: '1234', role: 'PRODUCER',   cooperative_id: ID.coop },
        { id: ID.p3, full_name: 'Diabaté Seydou',        phone_number: '0166778899', pin: '1234', role: 'PRODUCER',   cooperative_id: ID.coop },
        // ── Agents ──
        { id: ID.a1, full_name: 'Ouattara Dramane',      phone_number: '0722334455', pin: '1234', role: 'FIELD_AGENT'},
        { id: ID.a2, full_name: "N'Guessan Eléonore",    phone_number: '0511334466', pin: '1234', role: 'FIELD_AGENT'},
        // ── Coopérative ──
        { id: ID.coop,  full_name: 'Coopérative AGRI-CI', phone_number: '2722445566', pin: '1234', role: 'COOPERATIVE'},
        // ── Admin / démo ──
        { id: ID.admin, full_name: 'Superviseur',          phone_number: '0000',       pin: '0000', role: 'SUPERVISOR' },
    ], 'profiles (12)');

    // ── 2. STORES ─────────────────────────────────────────────────────────────
    console.log('\n🏪  Boutiques & fermes...');
    await ins('stores', [
        // Marchands
        { id: ID.sm1, owner_id: ID.m1, name: 'Boutique Chez Jean',  store_type: 'RETAILER', status: 'ACTIVE' },
        { id: ID.sm2, owner_id: ID.m2, name: 'Alimentation Marie',  store_type: 'RETAILER', status: 'ACTIVE' },
        { id: ID.sm3, owner_id: ID.m3, name: 'Épicerie Konaté',     store_type: 'RETAILER', status: 'ACTIVE' },
        { id: ID.sm4, owner_id: ID.m4, name: 'Magasin Fatou',       store_type: 'RETAILER', status: 'ACTIVE' },
        { id: ID.sm5, owner_id: ID.m5, name: 'Boutique Emmanuel',   store_type: 'RETAILER', status: 'ACTIVE' },
        // Producteurs
        { id: ID.sp1, owner_id: ID.p1, name: 'Ferme Coulibaly',     store_type: 'PRODUCER', status: 'ACTIVE' },
        { id: ID.sp2, owner_id: ID.p2, name: 'Exploitation Koffi',  store_type: 'PRODUCER', status: 'ACTIVE' },
        { id: ID.sp3, owner_id: ID.p3, name: 'Ferme Diabaté',       store_type: 'PRODUCER', status: 'ACTIVE' },
    ], 'stores (8)');

    // ── 3. PRODUITS MARCHANDS (67 produits vivriers ivoiriens) ───────────────
    console.log('\n🛒  Produits marchands (vivriers ivoiriens)...');
    const merchantProducts = [];
    for (const [storeKey, names] of Object.entries(MERCHANT_ASSORTMENTS)) {
        const storeId = ID[storeKey];
        const pids    = PM[storeKey];
        names.forEach((name, i) => {
            const info = CATALOGUE[name];
            merchantProducts.push({
                id:         pids[i],
                store_id:   storeId,
                name,
                price:      marchPrice(info.ref),
                category:   info.cat,
                audio_name: name,
                ...catCol[info.cat],
            });
        });
    }
    await ins('products', merchantProducts, `produits marchands (${merchantProducts.length})`);

    // ── 4. PRODUITS PRODUCTEURS (17 produits marché virtuel) ─────────────────
    console.log('\n🌾  Produits producteurs (marché virtuel)...');
    const producerProducts = [];
    for (const [storeKey, defs] of Object.entries(PRODUCER_CATALOGUE)) {
        const storeId = ID[storeKey];
        const pids    = PP[storeKey];
        defs.forEach((def, i) => {
            producerProducts.push({
                id:              pids[i],
                store_id:        storeId,
                name:            def.name,
                price:           Math.round(def.ref * 0.7 * def.batch),
                delivery_price:  def.delivery,
                category:        def.cat,
                zone_livraison:  def.zone,
                delai_livraison: def.delai,
                description:     def.desc,
                audio_name:      def.name,
                ...catCol[def.cat],
            });
        });
    }
    await ins('products', producerProducts, `produits producteurs (${producerProducts.length})`);

    // ── 4b. IMAGES PRODUITS (marchands + producteurs = 84 images) ──────────
    await uploadProductImages([...merchantProducts, ...producerProducts]);

    // ── 5. STOCK (84 lignes, 7 en rupture) ──────────────────────────────────
    console.log('\n📊  Niveaux de stock...');
    const stockRows = [];
    const storeProductMap = [
        [ID.sm1, PM.sm1], [ID.sm2, PM.sm2], [ID.sm3, PM.sm3],
        [ID.sm4, PM.sm4], [ID.sm5, PM.sm5],
        [ID.sp1, PP.sp1], [ID.sp2, PP.sp2], [ID.sp3, PP.sp3],
    ];
    for (const [storeId, pids] of storeProductMap) {
        for (const pid of pids) {
            stockRows.push({
                product_id: pid,
                store_id:   storeId,
                quantity:   rnd(15, 180),
                updated_at: daysAgo(3),
            });
        }
    }
    // 7 produits en stock bas / rupture (alertes)
    // sm1[3]=Patate douce, sm1[9]=Avocat, sm2[5]=Aubergine N'drowa,
    // sm3[2]=Mil, sm4[5]=Pomme de terre, sm5[3]=Tomate salade, sp2[2]=Gombo
    stockRows[3].quantity  = 2;   // Patate douce chez Kouassi
    stockRows[9].quantity  = 3;   // Avocat chez Kouassi
    stockRows[23].quantity = 1;   // Aubergine N'drowa chez Adjoua
    stockRows[35].quantity = 4;   // Mil chez Konaté
    stockRows[50].quantity = 0;   // Pomme de terre chez Bamba — rupture
    stockRows[60].quantity = 2;   // Tomate salade chez Tra Bi
    stockRows[73].quantity = 3;   // Gombo Baoulé chez Koffi (producteur)
    await ins('stock', stockRows, `stock (${stockRows.length} produits, 7 en alerte)`);

    // ── 6. TRANSACTIONS (250+ ventes sur 30 jours) ──────────────────────────
    console.log('\n💰  Transactions (ventes 30 jours)...');
    const clients = [
        'Konan Serge', 'Aya Brigitte', 'Kouakou Denis', 'Amoin Claire',
        'Fofana Moussa', 'Soro Drissa', 'Touré Ibrahim', 'Pélagie N.',
        'Ouédraogo Awa', 'Diomandé Sekou',
        null, null, null,
    ];
    const txStatuses    = ['PAYÉ','PAYÉ','PAYÉ','PAYÉ','PAYÉ','PAYÉ','MOMO','MOMO','MOMO','DETTE'];
    const momoOperators = ['ORANGE','ORANGE','ORANGE','MTN','WAVE'];
    function pickTx() {
        const status   = pick(txStatuses);
        const operator = status === 'MOMO' ? pick(momoOperators) : null;
        return { status, operator };
    }
    const transactions = [];

    const marchStores = [
        { storeId: ID.sm1, prods: merchantProducts.filter(p => p.store_id === ID.sm1) },
        { storeId: ID.sm2, prods: merchantProducts.filter(p => p.store_id === ID.sm2) },
        { storeId: ID.sm3, prods: merchantProducts.filter(p => p.store_id === ID.sm3) },
        { storeId: ID.sm4, prods: merchantProducts.filter(p => p.store_id === ID.sm4) },
        { storeId: ID.sm5, prods: merchantProducts.filter(p => p.store_id === ID.sm5) },
    ];

    // Ventes étalées sur les 30 derniers jours (~235 transactions)
    for (const { storeId, prods } of marchStores) {
        const count = rnd(40, 55);
        for (let i = 0; i < count; i++) {
            const prod = pick(prods);
            const qty  = rnd(1, 8);
            transactions.push({
                id:           uid(),
                store_id:     storeId,
                type:         'VENTE',
                product_id:   prod.id,
                product_name: prod.name,
                quantity:     qty,
                price:        prod.price * qty,
                client_name:  pick(clients),
                ...pickTx(),
                created_at:   daysAgo(30, 2),
            });
        }
    }

    // Ventes d'aujourd'hui pour remplir le dashboard (caisse du jour, toutes boutiques)
    let h = 0;
    for (const { storeId, prods } of marchStores) {
        for (let i = 0; i < rnd(3, 6); i++) {
            const prod = pick(prods);
            const qty  = rnd(1, 4);
            transactions.push({
                id:           uid(),
                store_id:     storeId,
                type:         'VENTE',
                product_id:   prod.id,
                product_name: prod.name,
                quantity:     qty,
                price:        prod.price * qty,
                client_name:  pick(clients),
                ...(() => { const s = pick(['PAYÉ','PAYÉ','MOMO']); return { status: s, operator: s === 'MOMO' ? pick(momoOperators) : null }; })(),
                created_at:   today(h++),
            });
        }
    }

    // Dettes (carnet client) — 4 clients × 2-4 achats
    const debtClients = ['Konan Serge', 'Aya Brigitte', 'Fofana Moussa', 'Soro Drissa'];
    for (const client of debtClients) {
        const storeId = pick([ID.sm1, ID.sm2, ID.sm3]);
        const prods   = merchantProducts.filter(p => p.store_id === storeId);
        for (let i = 0; i < rnd(2, 4); i++) {
            const prod = pick(prods);
            const qty  = rnd(1, 3);
            transactions.push({
                id:           uid(),
                store_id:     storeId,
                type:         'VENTE',
                product_id:   prod.id,
                product_name: prod.name,
                quantity:     qty,
                price:        prod.price * qty,
                client_name:  client,
                status:       'DETTE',
                created_at:   daysAgo(15, 1),
            });
        }
    }

    await ins('transactions', transactions, `transactions (${transactions.length})`);

    // ── 7. COMMANDES (marchands → producteurs, 10 commandes) ────────────────
    console.log('\n🛒  Commandes marché virtuel...');
    await ins('orders', [
        // DELIVERED (4)
        {
            id: uid(), status: 'DELIVERED',
            seller_store_id: ID.sp1, buyer_store_id: ID.sm1,
            product_id: PP.sp1[0], product_name: 'Riz brisé 25% - sac 25kg',
            quantity: 3, unit_price: 5460, total_amount: 16380,
            notes: 'Livraison urgente pour réapprovisionnement',
            created_at: daysAgo(9, 6),
        },
        {
            id: uid(), status: 'DELIVERED',
            seller_store_id: ID.sp2, buyer_store_id: ID.sm2,
            product_id: PP.sp2[0], product_name: 'Tomate fraîche - caisse 10kg',
            quantity: 5, unit_price: 3850, total_amount: 19250,
            notes: 'Pour la semaine, merci de livrer le matin',
            created_at: daysAgo(7, 4),
        },
        {
            id: uid(), status: 'DELIVERED',
            seller_store_id: ID.sp3, buyer_store_id: ID.sm3,
            product_id: PP.sp3[0], product_name: 'Igname Kponan - tas 10kg',
            quantity: 2, unit_price: 4900, total_amount: 9800,
            notes: null,
            created_at: daysAgo(5, 2),
        },
        {
            id: uid(), status: 'DELIVERED',
            seller_store_id: ID.sp2, buyer_store_id: ID.sm4,
            product_id: PP.sp2[3], product_name: 'Piment frais - panier 2kg',
            quantity: 3, unit_price: 1050, total_amount: 3150,
            notes: null,
            created_at: daysAgo(8, 5),
        },
        // SHIPPED (2)
        {
            id: uid(), status: 'SHIPPED',
            seller_store_id: ID.sp1, buyer_store_id: ID.sm3,
            product_id: PP.sp1[1], product_name: 'Mil grain - sac 25kg',
            quantity: 2, unit_price: 7000, total_amount: 14000,
            notes: "Merci d'appeler à l'arrivée",
            created_at: daysAgo(4, 2),
        },
        {
            id: uid(), status: 'SHIPPED',
            seller_store_id: ID.sp3, buyer_store_id: ID.sm2,
            product_id: PP.sp3[3], product_name: 'Patate douce - sac 10kg',
            quantity: 3, unit_price: 2100, total_amount: 6300,
            notes: 'Livrer avant midi',
            created_at: daysAgo(3, 1),
        },
        // ACCEPTED (1)
        {
            id: uid(), status: 'ACCEPTED',
            seller_store_id: ID.sp3, buyer_store_id: ID.sm4,
            product_id: PP.sp3[4], product_name: 'Banane plantain - régime 12kg',
            quantity: 4, unit_price: 2100, total_amount: 8400,
            notes: 'Commande pour la fête du quartier',
            created_at: daysAgo(2, 1),
        },
        // PENDING (2)
        {
            id: uid(), status: 'PENDING',
            seller_store_id: ID.sp2, buyer_store_id: ID.sm5,
            product_id: PP.sp2[0], product_name: 'Tomate fraîche - caisse 10kg',
            quantity: 2, unit_price: 3850, total_amount: 7700,
            notes: null,
            created_at: daysAgo(1),
        },
        {
            id: uid(), status: 'PENDING',
            seller_store_id: ID.sp1, buyer_store_id: ID.sm2,
            product_id: PP.sp1[2], product_name: 'Fonio précuit - sac 5kg',
            quantity: 5, unit_price: 2800, total_amount: 14000,
            notes: 'Livrer avant le weekend de préférence',
            created_at: daysAgo(1),
        },
        // CANCELLED (1)
        {
            id: uid(), status: 'CANCELLED',
            seller_store_id: ID.sp3, buyer_store_id: ID.sm1,
            product_id: PP.sp3[1], product_name: 'Igname Assawa - tas 10kg',
            quantity: 2, unit_price: 2100, total_amount: 4200,
            notes: 'Stock insuffisant au moment de la commande',
            created_at: daysAgo(10, 7),
        },
    ], 'commandes (10)');

    // ── 7b. ACHATS GROUPÉS ────────────────────────────────────────────────────
    console.log('\n🤝  Achats groupés...');
    await ins('achats_groupes', [
        {
            id: ID.ag1, cooperative_id: ID.coop,
            produit_id: PP.sp1[0], producteur_id: ID.p1,
            nom_produit: 'Riz brisé 25% - sac 25kg',
            prix_normal: 5460, prix_negocie: 4368,
            quantite_minimum: 10, quantite_totale: 30, quantite_actuelle: 7,
            statut: 'OPEN', date_limite: daysFromNow(5),
            description: 'Achat groupé de riz brisé Ferme Coulibaly. Prix négocié : -20%. Rejoignez avant la date limite !',
            created_at: daysAgo(4),
        },
        {
            id: ID.ag2, cooperative_id: ID.coop,
            produit_id: PP.sp2[0], producteur_id: ID.p2,
            nom_produit: 'Tomate fraîche - caisse 10kg',
            prix_normal: 3850, prix_negocie: 2900,
            quantite_minimum: 20, quantite_totale: 50, quantite_actuelle: 8,
            statut: 'OPEN', date_limite: daysFromNow(3),
            description: 'Tomates fraîches Exploitation Koffi, récolte de la semaine. Livraison Abidjan sous 24h.',
            created_at: daysAgo(2),
        },
        {
            id: ID.ag3, cooperative_id: ID.coop,
            produit_id: PP.sp3[0], producteur_id: ID.p3,
            nom_produit: 'Igname Kponan - tas 10kg',
            prix_normal: 4900, prix_negocie: 3920,
            quantite_minimum: 15, quantite_totale: 18, quantite_actuelle: 18,
            statut: 'COMPLETED', date_limite: daysAgoDate(2),
            description: 'Igname Kponan Ferme Diabaté — objectif atteint ! Commandes créées pour tous les participants.',
            created_at: daysAgo(12),
        },
        {
            id: ID.ag4, cooperative_id: ID.coop,
            produit_id: PP.sp1[2], producteur_id: ID.p1,
            nom_produit: 'Fonio précuit - sac 5kg',
            prix_normal: 2800, prix_negocie: 2240,
            quantite_minimum: 20, quantite_totale: 5, quantite_actuelle: 5,
            statut: 'CANCELLED', date_limite: daysAgoDate(8),
            description: 'Fonio Ferme Coulibaly — annulé (objectif non atteint dans les délais).',
            created_at: daysAgo(20),
        },
    ], 'achats_groupes (4)');

    // Participants : ag1 (OPEN), ag2 (OPEN), ag3 (COMPLETED)
    await ins('achats_groupes_participants', [
        // ag1 — Riz brisé : 3 marchands, total 7
        { id: uid(), achat_groupe_id: ID.ag1, marchand_id: ID.m1, marchand_nom: 'Kouassi Jean-Baptiste', quantite: 3, date_inscription: daysAgo(3) },
        { id: uid(), achat_groupe_id: ID.ag1, marchand_id: ID.m2, marchand_nom: 'Adjoua Marie Koné',     quantite: 2, date_inscription: daysAgo(3) },
        { id: uid(), achat_groupe_id: ID.ag1, marchand_id: ID.m3, marchand_nom: 'Konaté Issouf',         quantite: 2, date_inscription: daysAgo(2) },
        // ag2 — Tomates : 2 marchands, total 8
        { id: uid(), achat_groupe_id: ID.ag2, marchand_id: ID.m4, marchand_nom: 'Bamba Fatoumata',       quantite: 5, date_inscription: daysAgo(1) },
        { id: uid(), achat_groupe_id: ID.ag2, marchand_id: ID.m5, marchand_nom: 'Tra Bi Emmanuel',       quantite: 3, date_inscription: daysAgo(1) },
        // ag3 — Igname (COMPLETED) : 4 marchands, total 18
        { id: uid(), achat_groupe_id: ID.ag3, marchand_id: ID.m1, marchand_nom: 'Kouassi Jean-Baptiste', quantite: 5, date_inscription: daysAgo(10) },
        { id: uid(), achat_groupe_id: ID.ag3, marchand_id: ID.m2, marchand_nom: 'Adjoua Marie Koné',     quantite: 6, date_inscription: daysAgo(10) },
        { id: uid(), achat_groupe_id: ID.ag3, marchand_id: ID.m3, marchand_nom: 'Konaté Issouf',         quantite: 4, date_inscription: daysAgo(9)  },
        { id: uid(), achat_groupe_id: ID.ag3, marchand_id: ID.m4, marchand_nom: 'Bamba Fatoumata',       quantite: 3, date_inscription: daysAgo(8)  },
    ], 'achats_groupes_participants (9)');

    // ── 8. ENRÔLEMENTS ────────────────────────────────────────────────────────
    console.log('\n📝  Enrôlements...');
    await ins('demandes_enrolement', [
        {
            id: uid(), statut: 'valide',
            nom: 'Bamba Fatoumata', telephone: '0788990011',
            type: 'MERCHANT', nom_boutique: 'Magasin Fatou', adresse: 'Cocody Angré, Abidjan',
            agent_id: ID.a1, cooperative_id: ID.coop,
            date_demande: daysAgo(28, 24), date_traitement: daysAgo(26, 22),
        },
        {
            id: uid(), statut: 'valide',
            nom: 'Tra Bi Emmanuel', telephone: '0544556677',
            type: 'MERCHANT', nom_boutique: 'Boutique Emmanuel', adresse: 'Treichville Zone 4, Abidjan',
            agent_id: ID.a1, cooperative_id: ID.coop,
            date_demande: daysAgo(22, 18), date_traitement: daysAgo(20, 16),
        },
        {
            id: uid(), statut: 'valide',
            nom: 'Konaté Issouf', telephone: '0123456789',
            type: 'MERCHANT', nom_boutique: 'Épicerie Konaté', adresse: 'Yopougon Niangon, Abidjan',
            agent_id: ID.a2, cooperative_id: ID.coop,
            date_demande: daysAgo(30, 26), date_traitement: daysAgo(28, 24),
        },
        {
            id: uid(), statut: 'valide',
            nom: 'Adjoua Marie Koné', telephone: '0555667788',
            type: 'MERCHANT', nom_boutique: 'Alimentation Marie', adresse: 'Abobo PK 18, Abidjan',
            agent_id: ID.a2, cooperative_id: ID.coop,
            date_demande: daysAgo(35, 30), date_traitement: daysAgo(33, 28),
        },
        {
            id: uid(), statut: 'en_attente',
            nom: 'Diallo Aminata', telephone: '0599887766',
            type: 'MERCHANT', nom_boutique: 'Chez Aminata', adresse: 'Abobo Gare, Abidjan',
            agent_id: ID.a2, cooperative_id: ID.coop,
            date_demande: daysAgo(2, 1),
        },
        {
            id: uid(), statut: 'en_attente',
            nom: 'Touré Bakary', telephone: '0744332211',
            type: 'PRODUCER', nom_boutique: 'Ferme Touré', adresse: 'Bouaké Nord, Bouaké',
            agent_id: ID.a1, cooperative_id: ID.coop,
            date_demande: daysAgo(1),
        },
        {
            id: uid(), statut: 'rejete',
            nom: 'Yao Sylvestre', telephone: '0511223399',
            type: 'MERCHANT', nom_boutique: 'Boutique Sylvestre', adresse: 'Port-Bouët, Abidjan',
            agent_id: ID.a2, cooperative_id: ID.coop,
            motif_rejet: 'Dossier incomplet',
            date_demande: daysAgo(15, 10), date_traitement: daysAgo(12, 8),
        },
    ], 'enrôlements (7)');

    // ── 9. ACTIVITY LOGS ──────────────────────────────────────────────────────
    console.log('\n📋  Logs d\'activité...');
    await ins('activity_logs', [
        { id: uid(), user_id: ID.m1,   user_name: 'Kouassi Jean-Baptiste', action: 'Vente : Igname Kponan × 3 → 2 100 F',                                         type: 'vente',       details: '', created_at: today(1)        },
        { id: uid(), user_id: ID.m2,   user_name: 'Adjoua Marie Koné',     action: 'Vente : Carotte × 2 → 1 600 F',                                                type: 'vente',       details: '', created_at: today(2)        },
        { id: uid(), user_id: ID.m3,   user_name: 'Konaté Issouf',         action: 'Vente : Riz 25% brisure × 5 → 1 560 F',                                        type: 'vente',       details: '', created_at: today(3)        },
        { id: uid(), user_id: ID.m4,   user_name: 'Bamba Fatoumata',       action: 'Vente : Gombo Baoulé × 4 → 2 000 F',                                           type: 'vente',       details: '', created_at: today(4)        },
        { id: uid(), user_id: ID.m5,   user_name: 'Tra Bi Emmanuel',       action: 'Vente : Banane plantain × 5 → 1 250 F',                                        type: 'vente',       details: '', created_at: today(5)        },
        { id: uid(), user_id: ID.p1,   user_name: 'Coulibaly Mamadou',     action: 'Publication : Riz brisé 25% - sac 25kg → Marché Virtuel',                       type: 'publication', details: '', created_at: daysAgo(1)      },
        { id: uid(), user_id: ID.p2,   user_name: 'Koffi Née Adjoua',      action: 'Publication : Tomate fraîche - caisse 10kg → Marché Virtuel',                   type: 'publication', details: '', created_at: daysAgo(1)      },
        { id: uid(), user_id: ID.p3,   user_name: 'Diabaté Seydou',        action: 'Publication : Igname Kponan - tas 10kg → Marché Virtuel',                       type: 'publication', details: '', created_at: daysAgo(2)      },
        { id: uid(), user_id: ID.m3,   user_name: 'Konaté Issouf',         action: 'Commande passée : Mil grain 25kg × 2 → Ferme Coulibaly (14 000 F)',             type: 'commande',    details: '', created_at: daysAgo(2)      },
        { id: uid(), user_id: ID.a1,   user_name: 'Ouattara Dramane',      action: 'Enrôlement soumis : Touré Bakary (Producteur)',                                  type: 'enrolement',  details: '', created_at: daysAgo(2)      },
        { id: uid(), user_id: ID.p1,   user_name: 'Coulibaly Mamadou',     action: 'Livraison terminée : Riz brisé 25% × 3 → Boutique Chez Jean',                   type: 'livraison',   details: '', created_at: daysAgo(3)      },
        { id: uid(), user_id: null,    user_name: 'Coopérative',           action: 'Enrôlement validé : Adjoua Marie Koné',                                          type: 'enrolement',  details: '', created_at: daysAgo(4)      },
        { id: uid(), user_id: ID.m2,   user_name: 'Adjoua Marie Koné',     action: 'Commande passée : Tomate fraîche 10kg × 5 → Exploitation Koffi (19 250 F)',     type: 'commande',    details: '', created_at: daysAgo(5)      },
        { id: uid(), user_id: ID.p2,   user_name: 'Koffi Née Adjoua',      action: 'Livraison terminée : Tomate fraîche 10kg × 5 → Alimentation Marie',             type: 'livraison',   details: '', created_at: daysAgo(6)      },
        { id: uid(), user_id: ID.a2,   user_name: "N'Guessan Eléonore",    action: 'Enrôlement validé : Konaté Issouf',                                              type: 'enrolement',  details: '', created_at: daysAgo(7)      },
        { id: uid(), user_id: null,    user_name: 'Coopérative',           action: 'Enrôlement rejeté : Yao Sylvestre — Dossier incomplet',                           type: 'enrolement',  details: '', created_at: daysAgo(8)      },
        { id: uid(), user_id: ID.m1,   user_name: 'Kouassi Jean-Baptiste', action: 'Livraison reçue : Riz brisé 25% × 3 → Ferme Coulibaly',                         type: 'livraison',   details: '', created_at: daysAgo(10)     },
        { id: uid(), user_id: ID.a1,   user_name: 'Ouattara Dramane',      action: 'Enrôlement validé : Bamba Fatoumata',                                            type: 'enrolement',  details: '', created_at: daysAgo(12)     },
        { id: uid(), user_id: ID.p1,   user_name: 'Coulibaly Mamadou',     action: 'Publication : Mil grain - sac 25kg → Marché Virtuel',                            type: 'publication', details: '', created_at: daysAgo(14)     },
        { id: uid(), user_id: ID.m3,   user_name: 'Konaté Issouf',         action: 'Commande passée : Igname Kponan 10kg × 2 → Ferme Diabaté (9 800 F)',            type: 'commande',    details: '', created_at: daysAgo(15)     },
        { id: uid(), user_id: ID.coop, user_name: 'Coopérative AGRI-CI',   action: 'Achat groupé créé : Riz brisé 25% × 10 min. (prix négocié 4 368 F)',             type: 'achat_groupe', details: '', created_at: daysAgo(4) },
        { id: uid(), user_id: ID.m1,   user_name: 'Kouassi Jean-Baptiste', action: 'Rejoint achat groupé : Riz brisé 25% × 3 (économie 3 276 F)',                    type: 'achat_groupe', details: '', created_at: daysAgo(3) },
        { id: uid(), user_id: ID.m2,   user_name: 'Adjoua Marie Koné',     action: 'Rejoint achat groupé : Riz brisé 25% × 2 (économie 2 184 F)',                    type: 'achat_groupe', details: '', created_at: daysAgo(3) },
        { id: uid(), user_id: ID.coop, user_name: 'Coopérative AGRI-CI',   action: 'Achat groupé finalisé : Igname Kponan — 18 tas livrés à 4 marchands',            type: 'achat_groupe', details: '', created_at: daysAgo(2) },
    ], 'activity_logs (24)');

    // ── 10. CREDITS CLIENTS (carnet de dettes) ──────────────────────────────
    console.log('\n📒  Crédits clients (carnet de dettes)...');
    await ins('credits_clients', [
        // sm1 — Kouassi Jean-Baptiste
        { id: uid(), marchand_id: ID.m1, client_nom: 'Konan Serge',     client_telephone: '0701020304', montant_du: 3500,  date_credit: daysAgo(12), date_echeance: daysFromNow(5),  statut: 'en_cours' },
        { id: uid(), marchand_id: ID.m1, client_nom: 'Aya Brigitte',    client_telephone: '0705060708', montant_du: 8200,  date_credit: daysAgo(8),  date_echeance: daysFromNow(10), statut: 'en_cours' },
        { id: uid(), marchand_id: ID.m1, client_nom: 'Fofana Moussa',   client_telephone: '0709101112', montant_du: 1500,  date_credit: daysAgo(20), date_echeance: daysAgoDate(3),  statut: 'en_retard' },
        { id: uid(), marchand_id: ID.m1, client_nom: 'Touré Ibrahim',   client_telephone: '0713141516', montant_du: 5000,  date_credit: daysAgo(30), date_echeance: daysAgoDate(10), statut: 'rembourse' },
        // sm2 — Adjoua Marie Koné
        { id: uid(), marchand_id: ID.m2, client_nom: 'Kouakou Denis',   client_telephone: '0717181920', montant_du: 4200,  date_credit: daysAgo(5),  date_echeance: daysFromNow(8),  statut: 'en_cours' },
        { id: uid(), marchand_id: ID.m2, client_nom: 'Amoin Claire',    client_telephone: '0721222324', montant_du: 2800,  date_credit: daysAgo(15), date_echeance: daysAgoDate(1),  statut: 'en_retard' },
        { id: uid(), marchand_id: ID.m2, client_nom: 'Soro Drissa',     client_telephone: '0725262728', montant_du: 6500,  date_credit: daysAgo(25), date_echeance: daysAgoDate(8),  statut: 'rembourse' },
        // sm3 — Konaté Issouf
        { id: uid(), marchand_id: ID.m3, client_nom: 'Pélagie N.',      client_telephone: '0729303132', montant_du: 1800,  date_credit: daysAgo(3),  date_echeance: daysFromNow(12), statut: 'en_cours' },
    ], 'credits_clients (8)');

    // ── 11. NOTIFICATIONS ───────────────────────────────────────────────────
    console.log('\n🔔  Notifications...');
    await ins('notifications', [
        // Marchands — commandes acceptées, livraisons
        { id: uid(), user_id: ID.m1, titre: 'Commande acceptée',          message: 'Coulibaly Mamadou a accepté votre commande de Riz brisé 25% × 3 sacs.',                              type: 'commande',      data: {}, lu: true,  created_at: daysAgo(8)  },
        { id: uid(), user_id: ID.m1, titre: 'Livraison en route',         message: 'Votre commande de Riz brisé 25% est en cours de livraison.',                                          type: 'livraison',     data: {}, lu: true,  created_at: daysAgo(7)  },
        { id: uid(), user_id: ID.m1, titre: 'Livraison reçue',            message: 'Livraison confirmée — 3 sacs Riz brisé 25% ajoutés au stock.',                                        type: 'livraison',     data: {}, lu: true,  created_at: daysAgo(6)  },
        { id: uid(), user_id: ID.m1, titre: 'Achat groupé ouvert',        message: "Riz brisé 25% à 4 368 F — Rejoignez l'achat groupé avant la date limite !",                           type: 'achat_groupe',  data: {}, lu: false, created_at: daysAgo(4)  },
        { id: uid(), user_id: ID.m2, titre: 'Commande acceptée',          message: 'Koffi Née Adjoua a accepté votre commande de Tomate fraîche × 5 caisses.',                            type: 'commande',      data: {}, lu: true,  created_at: daysAgo(6)  },
        { id: uid(), user_id: ID.m2, titre: 'Livraison reçue',            message: 'Livraison confirmée — 5 caisses Tomate fraîche ajoutées au stock.',                                    type: 'livraison',     data: {}, lu: true,  created_at: daysAgo(4)  },
        { id: uid(), user_id: ID.m2, titre: 'Achat groupé ouvert',        message: 'Tomate fraîche à 2 900 F — Achat groupé en cours.',                                                   type: 'achat_groupe',  data: {}, lu: false, created_at: daysAgo(2)  },
        { id: uid(), user_id: ID.m3, titre: 'Commande acceptée',          message: "Diabaté Seydou a accepté votre commande d'Igname Kponan × 2 tas.",                                    type: 'commande',      data: {}, lu: true,  created_at: daysAgo(4)  },
        { id: uid(), user_id: ID.m5, titre: 'Nouveau produit disponible', message: 'Fonio précuit 5kg disponible sur le Marché Virtuel à 2 800 F.',                                       type: 'marche',        data: {}, lu: false, created_at: daysAgo(1)  },
        // Producteurs — nouvelles commandes
        { id: uid(), user_id: ID.p1, titre: 'Nouvelle commande',          message: 'Konaté Issouf veut 2 sacs Mil grain 25kg — 14 000 F.',                                                type: 'commande',      data: {}, lu: true,  created_at: daysAgo(4)  },
        { id: uid(), user_id: ID.p2, titre: 'Nouvelle commande',          message: 'Tra Bi Emmanuel veut 2 caisses Tomate fraîche — 7 700 F.',                                            type: 'commande',      data: {}, lu: false, created_at: daysAgo(1)  },
        { id: uid(), user_id: ID.p2, titre: 'Demande de prix groupé',     message: 'Coopérative AGRI-CI demande un prix groupé pour Tomate fraîche 10kg.',                                type: 'achat_groupe',  data: {}, lu: true,  created_at: daysAgo(3)  },
        { id: uid(), user_id: ID.p3, titre: 'Nouvelle commande',          message: 'Bamba Fatoumata veut 4 régimes Banane plantain — 8 400 F.',                                           type: 'commande',      data: {}, lu: false, created_at: daysAgo(2)  },
        // Agent — enrôlements validés/rejetés
        { id: uid(), user_id: ID.a1, titre: 'Inscription validée',        message: 'Bamba Fatoumata (Marchand) validée par la coopérative AGRI-CI.',                                       type: 'enrolement',    data: {}, lu: true,  created_at: daysAgo(22) },
        { id: uid(), user_id: ID.a1, titre: 'Inscription validée',        message: 'Tra Bi Emmanuel (Marchand) validé par la coopérative AGRI-CI.',                                       type: 'enrolement',    data: {}, lu: true,  created_at: daysAgo(16) },
        { id: uid(), user_id: ID.a2, titre: 'Inscription validée',        message: 'Adjoua Marie Koné (Marchand) validée par la coopérative AGRI-CI.',                                    type: 'enrolement',    data: {}, lu: true,  created_at: daysAgo(28) },
        { id: uid(), user_id: ID.a2, titre: 'Inscription rejetée',        message: 'Yao Sylvestre a été rejeté — Dossier incomplet. Veuillez vérifier.',                                  type: 'enrolement',    data: {}, lu: true,  created_at: daysAgo(8)  },
        // Coopérative — demandes d'enrôlement
        { id: uid(), user_id: ID.coop, titre: 'Nouveau membre à vérifier', message: "L'agent Ouattara Dramane a inscrit Diallo Aminata (Marchand). Vérifiez.",                            type: 'enrolement',    data: {}, lu: false, created_at: daysAgo(2)  },
        { id: uid(), user_id: ID.coop, titre: 'Nouveau membre à vérifier', message: "L'agent Ouattara Dramane a inscrit Touré Bakary (Producteur). Vérifiez.",                            type: 'enrolement',    data: {}, lu: false, created_at: daysAgo(1)  },
        { id: uid(), user_id: ID.coop, titre: 'Prix groupé proposé',       message: 'Koffi Née Adjoua propose 2 900 F pour les Tomates fraîches 10kg.',                                   type: 'achat_groupe',  data: {}, lu: true,  created_at: daysAgo(2)  },
        // Admin — fil d'activité
        { id: uid(), user_id: ID.admin, titre: 'Nouvelle vente',           message: 'Kouassi Jean-Baptiste a vendu Igname Kponan × 3 pour 2 100 F.',                                      type: 'vente',         data: {}, lu: false, created_at: today(1)    },
        { id: uid(), user_id: ID.admin, titre: 'Signalement',              message: "L'agent Ouattara a signalé un problème de conformité.",                                               type: 'signalement',   data: {}, lu: false, created_at: daysAgo(1)  },
        { id: uid(), user_id: ID.admin, titre: 'Nouvel enrôlement',        message: "Touré Bakary inscrit par l'agent Ouattara Dramane — en attente.",                                     type: 'enrolement',    data: {}, lu: false, created_at: daysAgo(1)  },
    ], 'notifications (23)');

    // ── Résumé final ──────────────────────────────────────────────────────────
    console.log('\n' + '═'.repeat(60));
    console.log('🎉  Seed terminé avec succès !');
    console.log('═'.repeat(60));
    console.log('\n📱  Comptes de connexion (PIN par défaut : 1234)\n');
    console.log('  MARCHANDS');
    console.log('  ├─ 0711223344 / 1234  →  Kouassi Jean-Baptiste  (Généraliste, 18 produits)');
    console.log('  ├─ 0555667788 / 1234  →  Adjoua Marie Koné      (Fruits & légumes, 15 produits)');
    console.log('  ├─ 0123456789 / 1234  →  Konaté Issouf          (Céréales & épicerie, 12 produits)');
    console.log('  ├─ 0788990011 / 1234  →  Bamba Fatoumata        (Vivriers traditionnels, 12 produits)');
    console.log('  └─ 0544556677 / 1234  →  Tra Bi Emmanuel        (Mini-marché, 10 produits)');
    console.log('\n  PRODUCTEURS');
    console.log('  ├─ 0733445566 / 1234  →  Coulibaly Mamadou   (Céréales : riz, mil, fonio, arachide)');
    console.log('  ├─ 0577889900 / 1234  →  Koffi Née Adjoua    (Maraîchage : tomate, gombo, piment...)');
    console.log('  └─ 0166778899 / 1234  →  Diabaté Seydou      (Tubercules : igname, manioc, plantain)');
    console.log('\n  AGENTS DE TERRAIN');
    console.log("  ├─ 0722334455 / 1234  →  Ouattara Dramane");
    console.log("  └─ 0511334466 / 1234  →  N'Guessan Eléonore");
    console.log('\n  COOPÉRATIVE & ADMIN');
    console.log('  ├─ 2722445566 / 1234  →  Coopérative AGRI-CI');
    console.log('  └─ 0000       / 0000  →  Superviseur (démo admin)');
    console.log('\n📊  Données insérées :');
    console.log(`  • ${merchantProducts.length} produits marchands   (5 boutiques — vivriers ivoiriens)`);
    console.log(`  • ${producerProducts.length} produits producteurs  (3 fermes — céréales, maraîchage, tubercules)`);
    console.log(`  • ${stockRows.length} lignes de stock     (dont 7 en alerte de rupture)`);
    console.log(`  • ${transactions.length} transactions      (30 derniers jours + aujourd'hui + dettes)`);
    console.log('  • 10 commandes B2B      (PENDING×2, ACCEPTED, SHIPPED×2, DELIVERED×4, CANCELLED)');
    console.log('  • 7 enrôlements          (validé×4, en_attente×2, rejeté×1)');
    console.log('  • 4 achats groupés       (OPEN×2, COMPLETED×1, CANCELLED×1)');
    console.log('  • 9 participants         (ag1:3, ag2:2, ag3:4)');
    console.log('  • 24 logs d\'activité');
    console.log('  • 8 crédits clients');
    console.log('  • 23 notifications');
    console.log('\n  Catégories produits : TUBERCULE, LEGUME, FRUIT, CEREALE, VIANDE, MANUFACTURE');
    console.log('  Prix marchand = référence × [0.9–1.15] | Prix producteur = référence × 0.7 × batch');
    console.log('\n');
}

main().catch(err => {
    console.error('\n❌  Erreur fatale :', err.message);
    process.exit(1);
});
