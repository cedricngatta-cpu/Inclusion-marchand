// ─────────────────────────────────────────────────────────────────────────────
// SEED — Données de démo réalistes — Inclusion Marchand Mobile
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

const SUPABASE_URL  = 'https://dinocjmwktrxqupyjsqn.supabase.co';
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
    return d.toISOString().split('T')[0]; // date only (YYYY-MM-DD)
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
const c       = (i) => ({
    color:      ['#ecfdf5','#eff6ff','#fff7ed','#fdf4ff','#fef2f2','#f0fdf4'][i % 6],
    icon_color: ['#059669','#2563eb','#ea580c','#7c3aed','#dc2626','#16a34a'][i % 6],
});

// ── Supprime les accents d'un nom de fichier ──────────────────────────────────
function removeAccents(str) {
    return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

// ── Upload images produits vers Supabase Storage ──────────────────────────────
// Mappe chaque produit producteur à son image, upload dans le bucket "products",
// puis UPDATE la colonne image_url du produit avec l'URL publique.
async function uploadProductImages(PP) {
    console.log('\n🖼️  Upload images produits producteurs...');

    const IMAGES_DIR = path.join(__dirname, '..', 'assets', 'products');

    // Correspondance produit → fichier image (noms déjà sans accents sur disque)
    const imageMap = [
        { productId: PP.sp1[0], filename: 'Riz_local_brise_50kg.png'   },
        { productId: PP.sp1[1], filename: 'Mais_sec_50kg.png'          },
        { productId: PP.sp1[2], filename: 'Riz_etuve_25kg.png'         },
        { productId: PP.sp2[0], filename: 'Tomates_Fraiches_10kg.png'  },
        { productId: PP.sp2[1], filename: 'Aubergines_locales_5kg.png' },
        { productId: PP.sp2[2], filename: 'Gombo_frais_3kg.png'        },
        { productId: PP.sp3[0], filename: 'Igname_Bele_10kg.png'       },
        { productId: PP.sp3[2], filename: 'Manioc_frais_15kg.png'      },
    ];

    for (const { productId, filename } of imageMap) {
        // Sécurité : normalise le nom même si un accent s'était glissé
        const cleanFilename = removeAccents(filename);
        const filePath = path.join(IMAGES_DIR, cleanFilename);

        if (!fs.existsSync(filePath)) {
            console.warn(`  ⚠️  Image absente : assets/products/${cleanFilename} — ignorée`);
            continue;
        }

        const fileBuffer  = fs.readFileSync(filePath);
        // Path dans le bucket : directement le nom de fichier (pas de sous-dossier)
        // → URL finale : .../storage/v1/object/public/products/<cleanFilename>
        const storagePath = cleanFilename;

        // Upload (upsert = écrase si déjà présent)
        const { error: uploadError } = await sb.storage
            .from('products')
            .upload(storagePath, fileBuffer, { contentType: 'image/png', upsert: true });

        if (uploadError) {
            console.error(`  ❌ Upload ${cleanFilename} : ${uploadError.message}`);
            continue;
        }

        // URL publique
        const { data: urlData } = sb.storage
            .from('products')
            .getPublicUrl(storagePath);

        const publicUrl = urlData.publicUrl;

        // UPDATE image_url dans la table products
        const { error: updateError } = await sb
            .from('products')
            .update({ image_url: publicUrl })
            .eq('id', productId);

        if (updateError) {
            console.error(`  ❌ Update image_url ${cleanFilename} : ${updateError.message}`);
        } else {
            const shortUrl = publicUrl.split('/storage/v1/object/public/')[1] ?? publicUrl;
            console.log(`  ✅ ${cleanFilename.padEnd(32)} → .../${shortUrl}`);
        }
    }
}

async function ins(table, rows, label) {
    if (!rows.length) return;
    const { error } = await sb.from(table).insert(rows);
    if (error) console.error(`  ❌ ${label}: ${error.message}`);
    else       console.log(`  ✅ ${label}: ${rows.length} ligne(s)`);
}

// ── Reset optionnel ───────────────────────────────────────────────────────────
async function reset() {
    if (!RESET) return;
    console.log('🗑️  Remise à zéro des tables...\n');
    const FAKE = '00000000-0000-0000-0000-000000000000';
    // Ordre : dépendances d'abord
    for (const [table, col] of [
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

// Produits marchands — IDs pour les transactions
const PM = {
    sm1: Array.from({ length: 6 }, uid),
    sm2: Array.from({ length: 5 }, uid),
    sm3: Array.from({ length: 5 }, uid),
    sm4: Array.from({ length: 4 }, uid),
    sm5: Array.from({ length: 5 }, uid),
};

// Produits producteurs — IDs pour les commandes
const PP = {
    sp1: Array.from({ length: 3 }, uid),
    sp2: Array.from({ length: 3 }, uid),
    sp3: Array.from({ length: 3 }, uid),
};

// ═════════════════════════════════════════════════════════════════════════════
async function main() {
    console.log('\n🌱  Seed — Inclusion Marchand Mobile\n');

    await reset();

    // ── 1. PROFILS ────────────────────────────────────────────────────────────
    console.log('👤  Profils...');
    await ins('profiles', [
        // ── Marchands ──
        { id: ID.m1, full_name: 'Kouassi Jean-Baptiste', phone_number: '0711223344', pin: '1234', role: 'MERCHANT'   },
        { id: ID.m2, full_name: 'Adjoua Marie Koné',     phone_number: '0555667788', pin: '1234', role: 'MERCHANT'   },
        { id: ID.m3, full_name: 'Konaté Issouf',         phone_number: '0123456789', pin: '1234', role: 'MERCHANT'   },
        { id: ID.m4, full_name: 'Bamba Fatoumata',       phone_number: '0788990011', pin: '1234', role: 'MERCHANT'   },
        { id: ID.m5, full_name: 'Tra Bi Emmanuel',       phone_number: '0544556677', pin: '1234', role: 'MERCHANT'   },
        // ── Producteurs ──
        { id: ID.p1, full_name: 'Coulibaly Mamadou',     phone_number: '0733445566', pin: '1234', role: 'PRODUCER'   },
        { id: ID.p2, full_name: 'Koffi Née Adjoua',      phone_number: '0577889900', pin: '1234', role: 'PRODUCER'   },
        { id: ID.p3, full_name: 'Diabaté Seydou',        phone_number: '0166778899', pin: '1234', role: 'PRODUCER'   },
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

    // ── 3. PRODUITS MARCHANDS ─────────────────────────────────────────────────
    console.log('\n🛒  Produits marchands...');
    const merchantProducts = [
        // ── sm1 : Boutique Chez Jean (épicerie générale) ──
        { id: PM.sm1[0], store_id: ID.sm1, name: 'Riz importé 25kg',      price: 5500, category: 'Alimentation', audio_name: 'Riz importé 25kg',      ...c(0) },
        { id: PM.sm1[1], store_id: ID.sm1, name: 'Huile végétale 5L',     price: 3500, category: 'Alimentation', audio_name: 'Huile végétale 5L',     ...c(1) },
        { id: PM.sm1[2], store_id: ID.sm1, name: 'Sucre cristallisé 1kg', price:  800, category: 'Alimentation', audio_name: 'Sucre cristallisé 1kg', ...c(2) },
        { id: PM.sm1[3], store_id: ID.sm1, name: 'Lait Gloria 400g',      price: 1800, category: 'Alimentation', audio_name: 'Lait Gloria 400g',      ...c(3) },
        { id: PM.sm1[4], store_id: ID.sm1, name: 'Café Nescafé 50g',      price: 1200, category: 'Alimentation', audio_name: 'Café Nescafé 50g',      ...c(4) },
        { id: PM.sm1[5], store_id: ID.sm1, name: 'Savon labo 200g',       price:  200, category: 'Hygiène',      audio_name: 'Savon labo 200g',       ...c(5) },
        // ── sm2 : Alimentation Marie ──
        { id: PM.sm2[0], store_id: ID.sm2, name: 'Sardines en boîte',     price:  700, category: 'Alimentation', audio_name: 'Sardines en boîte',     ...c(1) },
        { id: PM.sm2[1], store_id: ID.sm2, name: 'Tomates pelées 400g',   price:  900, category: 'Alimentation', audio_name: 'Tomates pelées 400g',   ...c(2) },
        { id: PM.sm2[2], store_id: ID.sm2, name: 'Biscuits Patadou',      price:  350, category: 'Alimentation', audio_name: 'Biscuits Patadou',      ...c(3) },
        { id: PM.sm2[3], store_id: ID.sm2, name: 'Cube Maggi 24pcs',      price:  800, category: 'Alimentation', audio_name: 'Cube Maggi 24pcs',      ...c(4) },
        { id: PM.sm2[4], store_id: ID.sm2, name: 'Spaghetti 500g',        price:  500, category: 'Alimentation', audio_name: 'Spaghetti 500g',        ...c(5) },
        // ── sm3 : Épicerie Konaté ──
        { id: PM.sm3[0], store_id: ID.sm3, name: 'Riz local 10kg',        price: 4000, category: 'Alimentation', audio_name: 'Riz local 10kg',        ...c(2) },
        { id: PM.sm3[1], store_id: ID.sm3, name: 'Huile de palme 1L',     price:  800, category: 'Alimentation', audio_name: 'Huile de palme 1L',     ...c(3) },
        { id: PM.sm3[2], store_id: ID.sm3, name: 'Piment séché 100g',     price:  300, category: 'Alimentation', audio_name: 'Piment séché 100g',     ...c(4) },
        { id: PM.sm3[3], store_id: ID.sm3, name: 'Oignon 1kg',            price:  600, category: 'Alimentation', audio_name: 'Oignon 1kg',            ...c(5) },
        { id: PM.sm3[4], store_id: ID.sm3, name: 'Bouillon Maggi 1kg',    price: 1500, category: 'Alimentation', audio_name: 'Bouillon Maggi 1kg',    ...c(0) },
        // ── sm4 : Magasin Fatou (boissons) ──
        { id: PM.sm4[0], store_id: ID.sm4, name: 'Coca-Cola 1.5L',        price: 1000, category: 'Boissons',     audio_name: 'Coca-Cola 1.5L',        ...c(3) },
        { id: PM.sm4[1], store_id: ID.sm4, name: 'Eau minérale 1.5L',     price:  500, category: 'Boissons',     audio_name: 'Eau minérale 1.5L',     ...c(4) },
        { id: PM.sm4[2], store_id: ID.sm4, name: 'Jus de goyave 1L',      price: 1200, category: 'Boissons',     audio_name: 'Jus de goyave 1L',      ...c(5) },
        { id: PM.sm4[3], store_id: ID.sm4, name: 'Savon Lux',             price:  500, category: 'Hygiène',      audio_name: 'Savon Lux',             ...c(0) },
        // ── sm5 : Boutique Emmanuel ──
        { id: PM.sm5[0], store_id: ID.sm5, name: 'Chips 100g',            price:  500, category: 'Alimentation', audio_name: 'Chips 100g',            ...c(4) },
        { id: PM.sm5[1], store_id: ID.sm5, name: 'Chocolat tablette',     price: 1200, category: 'Alimentation', audio_name: 'Chocolat tablette',     ...c(5) },
        { id: PM.sm5[2], store_id: ID.sm5, name: 'Eau minérale 0.5L',     price:  200, category: 'Boissons',     audio_name: 'Eau minérale 0.5L',     ...c(0) },
        { id: PM.sm5[3], store_id: ID.sm5, name: 'Lessive OMO 1kg',       price: 2000, category: 'Hygiène',      audio_name: 'Lessive OMO 1kg',       ...c(1) },
        { id: PM.sm5[4], store_id: ID.sm5, name: 'Allumettes 10 boîtes',  price:  300, category: 'Autre',        audio_name: 'Allumettes 10 boîtes',  ...c(2) },
    ];
    await ins('products', merchantProducts, 'produits marchands (25)');

    // ── 4. PRODUITS PRODUCTEURS ───────────────────────────────────────────────
    console.log('\n🌾  Produits producteurs (marché virtuel)...');
    const producerProducts = [
        // ── sp1 : Ferme Coulibaly (Céréales) ──
        {
            id: PP.sp1[0], store_id: ID.sp1,
            name: 'Riz local brisé 50kg', price: 15000, delivery_price: 2000,
            category: 'Céréales', zone_livraison: 'Tout le pays', delai_livraison: '3-5 jours',
            description: 'Riz brisé de qualité supérieure, cultivé dans la région de Bouaké. Sac de 50kg soigneusement trié.',
            audio_name: 'Riz local brisé 50kg', ...c(0),
        },
        {
            id: PP.sp1[1], store_id: ID.sp1,
            name: 'Maïs sec 50kg', price: 12000, delivery_price: 1500,
            category: 'Céréales', zone_livraison: 'Tout le pays', delai_livraison: '3-5 jours',
            description: 'Maïs séché et trié, idéal pour la farine de maïs et la pâte. Récolte de la saison sèche.',
            audio_name: 'Maïs sec 50kg', ...c(1),
        },
        {
            id: PP.sp1[2], store_id: ID.sp1,
            name: 'Riz étuvé 25kg', price: 9000, delivery_price: 1500,
            category: 'Céréales', zone_livraison: 'Abidjan', delai_livraison: '1-2 jours',
            description: 'Riz étuvé premium, grain long. Livraison rapide sur Abidjan.',
            audio_name: 'Riz étuvé 25kg', ...c(2),
        },
        // ── sp2 : Exploitation Koffi (Légumes) ──
        {
            id: PP.sp2[0], store_id: ID.sp2,
            name: 'Tomates fraîches 10kg', price: 4500, delivery_price: 500,
            category: 'Légumes', zone_livraison: 'Abidjan', delai_livraison: 'Sous 24h',
            description: 'Tomates fraîches cultivées sans pesticides, récoltées ce matin à Yamoussoukro. Fermes et rouges.',
            audio_name: 'Tomates fraîches 10kg', ...c(3),
        },
        {
            id: PP.sp2[1], store_id: ID.sp2,
            name: 'Aubergines locales 5kg', price: 2000, delivery_price: 300,
            category: 'Légumes', zone_livraison: 'Abidjan', delai_livraison: 'Sous 24h',
            description: 'Aubergines locales fraîches, calibre moyen, idéales pour les sauces et grillades.',
            audio_name: 'Aubergines locales 5kg', ...c(4),
        },
        {
            id: PP.sp2[2], store_id: ID.sp2,
            name: 'Gombo frais 3kg', price: 1500, delivery_price: 300,
            category: 'Légumes', zone_livraison: 'Abidjan', delai_livraison: 'Sous 24h',
            description: 'Gombo frais et ferme, cultivé sans produits chimiques. Livraison le jour même.',
            audio_name: 'Gombo frais 3kg', ...c(5),
        },
        // ── sp3 : Ferme Diabaté (Tubercules) ──
        {
            id: PP.sp3[0], store_id: ID.sp3,
            name: 'Igname belé 10kg', price: 5000, delivery_price: 1000,
            category: 'Tubercules', zone_livraison: 'Tout le pays', delai_livraison: '3-5 jours',
            description: "Igname belé de Daloa, qualité export, calibre uniforme. Variété la plus appréciée.",
            audio_name: 'Igname belé 10kg', ...c(0),
        },
        {
            id: PP.sp3[1], store_id: ID.sp3,
            name: 'Igname florido 20kg', price: 9000, delivery_price: 1500,
            category: 'Tubercules', zone_livraison: 'Tout le pays', delai_livraison: '3-5 jours',
            description: "Igname florido, variété premium chair blanche et ferme. Idéale pour le foutou.",
            audio_name: 'Igname florido 20kg', ...c(1),
        },
        {
            id: PP.sp3[2], store_id: ID.sp3,
            name: 'Manioc frais 15kg', price: 3500, delivery_price: 800,
            category: 'Tubercules', zone_livraison: 'Bouaké', delai_livraison: '1-2 jours',
            description: "Manioc doux frais, idéal pour l'attiéké maison. Récolte hebdomadaire.",
            audio_name: 'Manioc frais 15kg', ...c(2),
        },
    ];
    await ins('products', producerProducts, 'produits producteurs (9)');

    // ── 4b. IMAGES PRODUITS PRODUCTEURS ──────────────────────────────────────
    await uploadProductImages(PP);

    // ── 5. STOCK ──────────────────────────────────────────────────────────────
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
                quantity:   rnd(8, 120),
                updated_at: daysAgo(3),
            });
        }
    }
    // Quelques ruptures de stock pour le réalisme
    stockRows[2].quantity  = 2;  // Sucre presque épuisé chez Jean
    stockRows[7].quantity  = 0;  // Tomates pelées rupture chez Marie
    stockRows[17].quantity = 1;  // Eau presque épuisée chez Fatou
    await ins('stock', stockRows, `stock (${stockRows.length} produits)`);

    // ── 6. TRANSACTIONS (ventes sur 30 jours) ─────────────────────────────────
    console.log('\n💰  Transactions (ventes 30 jours)...');
    const clients = [
        'Konan Serge', 'Aya Brigitte', 'Kouakou Denis', 'Amoin Claire',
        'Fofana Moussa', 'Soro Drissa', 'Touré Ibrahim', 'Pélagie N.',
        null, null, null,
    ];
    const txStatuses = ['PAYÉ','PAYÉ','PAYÉ','PAYÉ','PAYÉ','PAYÉ','MOMO','MOMO','MOMO','DETTE'];
    const momoOperators = ['ORANGE','ORANGE','ORANGE','MTN','WAVE'];
    function pickTx() {
        const status = pick(txStatuses);
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

    // Ventes étalées sur les 30 derniers jours
    for (const { storeId, prods } of marchStores) {
        const count = rnd(18, 28);
        for (let i = 0; i < count; i++) {
            const prod = pick(prods);
            const qty  = rnd(1, 6);
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

    // Ventes d'aujourd'hui pour remplir le dashboard (caisse du jour)
    const todayProds = [
        { storeId: ID.sm1, prods: merchantProducts.filter(p => p.store_id === ID.sm1) },
        { storeId: ID.sm2, prods: merchantProducts.filter(p => p.store_id === ID.sm2) },
        { storeId: ID.sm3, prods: merchantProducts.filter(p => p.store_id === ID.sm3) },
    ];
    let h = 0;
    for (const { storeId, prods } of todayProds) {
        for (let i = 0; i < rnd(4, 7); i++) {
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
                client_name:  pick(clients),
                ...(() => { const s = pick(['PAYÉ','PAYÉ','MOMO']); return { status: s, operator: s === 'MOMO' ? pick(momoOperators) : null }; })(),
                created_at:   today(h++),
            });
        }
    }

    // Quelques dettes (carnet client) pour sm1 et sm2
    const debtClients = ['Konan Serge', 'Aya Brigitte', 'Fofana Moussa'];
    for (const client of debtClients) {
        const storeId = pick([ID.sm1, ID.sm2]);
        const prods   = merchantProducts.filter(p => p.store_id === storeId);
        for (let i = 0; i < rnd(2, 4); i++) {
            const prod = pick(prods);
            transactions.push({
                id:           uid(),
                store_id:     storeId,
                type:         'VENTE',
                product_id:   prod.id,
                product_name: prod.name,
                quantity:     rnd(1, 3),
                price:        prod.price * rnd(1, 3),
                client_name:  client,
                status:       'DETTE',
                created_at:   daysAgo(15, 1),
            });
        }
    }

    await ins('transactions', transactions, `transactions (${transactions.length})`);

    // ── 7. COMMANDES (marchands → producteurs) ────────────────────────────────
    console.log('\n🛒  Commandes marché virtuel...');
    await ins('orders', [
        {
            id: uid(), status: 'DELIVERED',
            seller_store_id: ID.sp1, buyer_store_id: ID.sm1,
            product_id: PP.sp1[0], product_name: 'Riz local brisé 50kg',
            quantity: 3, unit_price: 15000, total_amount: 45000,
            notes: 'Livraison urgente pour réapprovisionnement',
            created_at: daysAgo(9, 6),
        },
        {
            id: uid(), status: 'DELIVERED',
            seller_store_id: ID.sp2, buyer_store_id: ID.sm2,
            product_id: PP.sp2[0], product_name: 'Tomates fraîches 10kg',
            quantity: 5, unit_price: 4500, total_amount: 22500,
            notes: 'Pour la semaine, merci de livrer le matin',
            created_at: daysAgo(7, 4),
        },
        {
            id: uid(), status: 'DELIVERED',
            seller_store_id: ID.sp3, buyer_store_id: ID.sm3,
            product_id: PP.sp3[0], product_name: 'Igname belé 10kg',
            quantity: 2, unit_price: 5000, total_amount: 10000,
            notes: null,
            created_at: daysAgo(5, 2),
        },
        {
            id: uid(), status: 'SHIPPED',
            seller_store_id: ID.sp1, buyer_store_id: ID.sm3,
            product_id: PP.sp1[1], product_name: 'Maïs sec 50kg',
            quantity: 2, unit_price: 12000, total_amount: 24000,
            notes: 'Merci d\'appeler à l\'arrivée',
            created_at: daysAgo(4, 2),
        },
        {
            id: uid(), status: 'ACCEPTED',
            seller_store_id: ID.sp3, buyer_store_id: ID.sm4,
            product_id: PP.sp3[0], product_name: 'Igname belé 10kg',
            quantity: 4, unit_price: 5000, total_amount: 20000,
            notes: 'Commande pour la fête du quartier',
            created_at: daysAgo(2, 1),
        },
        {
            id: uid(), status: 'PENDING',
            seller_store_id: ID.sp2, buyer_store_id: ID.sm5,
            product_id: PP.sp2[0], product_name: 'Tomates fraîches 10kg',
            quantity: 2, unit_price: 4500, total_amount: 9000,
            notes: null,
            created_at: daysAgo(1),
        },
        {
            id: uid(), status: 'PENDING',
            seller_store_id: ID.sp1, buyer_store_id: ID.sm2,
            product_id: PP.sp1[2], product_name: 'Riz étuvé 25kg',
            quantity: 5, unit_price: 9000, total_amount: 45000,
            notes: 'Livrer avant le weekend de préférence',
            created_at: daysAgo(1),
        },
        {
            id: uid(), status: 'CANCELLED',
            seller_store_id: ID.sp3, buyer_store_id: ID.sm1,
            product_id: PP.sp3[1], product_name: 'Igname florido 20kg',
            quantity: 1, unit_price: 9000, total_amount: 9000,
            notes: 'Stock insuffisant au moment de la commande',
            created_at: daysAgo(10, 7),
        },
    ], 'commandes (8)');

    // ── 7b. ACHATS GROUPÉS ────────────────────────────────────────────────────
    console.log('\n🤝  Achats groupés...');

    // Achat 1 : Riz brisé OUVERT — 7/10 sacs atteints, date limite dans 5 jours
    // Achat 2 : Tomates OUVERT   — 8/20 caisses, urgent (3 jours restants)
    // Achat 3 : Igname FERME     — objectif atteint (18/15), finalisé
    // Achat 4 : Maïs ANNULE      — annulé faute de participants (5/20)
    await ins('achats_groupes', [
        {
            id: ID.ag1,
            cooperative_id:   ID.coop,
            produit_id:       PP.sp1[0],
            producteur_id:    ID.p1,
            nom_produit:      'Riz local brisé 50kg',
            prix_normal:      15000,
            prix_negocie:     12000,
            quantite_minimum: 10,
            quantite_totale:  30,
            quantite_actuelle: 7,
            statut:           'OPEN',
            date_limite:      daysFromNow(5),
            description:      'Achat groupé de riz brisé Ferme Coulibaly. Prix négocié : -20%. Rejoignez avant la date limite !',
            created_at:       daysAgo(4),
        },
        {
            id: ID.ag2,
            cooperative_id:   ID.coop,
            produit_id:       PP.sp2[0],
            producteur_id:    ID.p2,
            nom_produit:      'Tomates fraîches 10kg',
            prix_normal:      4500,
            prix_negocie:     3500,
            quantite_minimum: 20,
            quantite_totale:  50,
            quantite_actuelle: 8,
            statut:           'OPEN',
            date_limite:      daysFromNow(3),
            description:      'Tomates fraîches Exploitation Koffi, récolte de la semaine. Livraison Abidjan sous 24h.',
            created_at:       daysAgo(2),
        },
        {
            id: ID.ag3,
            cooperative_id:   ID.coop,
            produit_id:       PP.sp3[0],
            producteur_id:    ID.p3,
            nom_produit:      'Igname belé 10kg',
            prix_normal:      5000,
            prix_negocie:     4000,
            quantite_minimum: 15,
            quantite_totale:  18,
            quantite_actuelle: 18,
            statut:           'COMPLETED',
            date_limite:      daysAgoDate(2),
            description:      'Igname belé Ferme Diabaté — objectif atteint ! Commandes créées pour tous les participants.',
            created_at:       daysAgo(12),
        },
        {
            id: ID.ag4,
            cooperative_id:   ID.coop,
            produit_id:       PP.sp1[1],
            producteur_id:    ID.p1,
            nom_produit:      'Maïs sec 50kg',
            prix_normal:      12000,
            prix_negocie:     9500,
            quantite_minimum: 20,
            quantite_totale:  5,
            quantite_actuelle: 5,
            statut:           'CANCELLED',
            date_limite:      daysAgoDate(8),
            description:      'Maïs sec Ferme Coulibaly — annulé (objectif non atteint dans les délais).',
            created_at:       daysAgo(20),
        },
    ], 'achats_groupes (4)');

    // Participants : ag1 (OUVERT), ag2 (OUVERT), ag3 (FERME)
    await ins('achats_groupes_participants', [
        // ag1 — Riz brisé : 3 marchands, total 7
        { id: uid(), achat_groupe_id: ID.ag1, marchand_id: ID.m1, marchand_nom: 'Kouassi Jean-Baptiste', quantite: 3, date_inscription: daysAgo(3) },
        { id: uid(), achat_groupe_id: ID.ag1, marchand_id: ID.m2, marchand_nom: 'Adjoua Marie Koné',     quantite: 2, date_inscription: daysAgo(3) },
        { id: uid(), achat_groupe_id: ID.ag1, marchand_id: ID.m3, marchand_nom: 'Konaté Issouf',         quantite: 2, date_inscription: daysAgo(2) },
        // ag2 — Tomates : 2 marchands, total 8
        { id: uid(), achat_groupe_id: ID.ag2, marchand_id: ID.m4, marchand_nom: 'Bamba Fatoumata',       quantite: 5, date_inscription: daysAgo(1) },
        { id: uid(), achat_groupe_id: ID.ag2, marchand_id: ID.m5, marchand_nom: 'Tra Bi Emmanuel',       quantite: 3, date_inscription: daysAgo(1) },
        // ag3 — Igname (FERME) : 4 marchands, total 18
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
            agent_id: ID.a1,
            date_demande: daysAgo(28, 24), date_traitement: daysAgo(26, 22),
        },
        {
            id: uid(), statut: 'valide',
            nom: 'Tra Bi Emmanuel', telephone: '0544556677',
            type: 'MERCHANT', nom_boutique: 'Boutique Emmanuel', adresse: 'Treichville Zone 4, Abidjan',
            agent_id: ID.a1,
            date_demande: daysAgo(22, 18), date_traitement: daysAgo(20, 16),
        },
        {
            id: uid(), statut: 'valide',
            nom: 'Konaté Issouf', telephone: '0123456789',
            type: 'MERCHANT', nom_boutique: 'Épicerie Konaté', adresse: 'Yopougon Niangon, Abidjan',
            agent_id: ID.a2,
            date_demande: daysAgo(30, 26), date_traitement: daysAgo(28, 24),
        },
        {
            id: uid(), statut: 'valide',
            nom: 'Adjoua Marie Koné', telephone: '0555667788',
            type: 'MERCHANT', nom_boutique: 'Alimentation Marie', adresse: 'Abobo PK 18, Abidjan',
            agent_id: ID.a2,
            date_demande: daysAgo(35, 30), date_traitement: daysAgo(33, 28),
        },
        {
            id: uid(), statut: 'en_attente',
            nom: 'Diallo Aminata', telephone: '0599887766',
            type: 'MERCHANT', nom_boutique: 'Chez Aminata', adresse: 'Abobo Gare, Abidjan',
            agent_id: ID.a2,
            date_demande: daysAgo(2, 1),
        },
        {
            id: uid(), statut: 'en_attente',
            nom: 'Touré Bakary', telephone: '0744332211',
            type: 'PRODUCER', nom_boutique: 'Ferme Touré', adresse: 'Bouaké Nord, Bouaké',
            agent_id: ID.a1,
            date_demande: daysAgo(1),
        },
        {
            id: uid(), statut: 'rejete',
            nom: 'Yao Sylvestre', telephone: '0511223399',
            type: 'MERCHANT', nom_boutique: 'Boutique Sylvestre', adresse: 'Port-Bouët, Abidjan',
            agent_id: ID.a2,
            motif_rejet: 'Dossier incomplet',
            date_demande: daysAgo(15, 10), date_traitement: daysAgo(12, 8),
        },
    ], 'enrôlements (7)');

    // ── 9. ACTIVITY LOGS ──────────────────────────────────────────────────────
    console.log('\n📋  Logs d\'activité...');
    await ins('activity_logs', [
        { id: uid(), user_id: ID.m1,   user_name: 'Kouassi Jean-Baptiste', action: 'Vente : Riz importé 25kg × 2 → 11 000 F',                          type: 'vente',       details: '', created_at: today(1)        },
        { id: uid(), user_id: ID.m2,   user_name: 'Adjoua Marie Koné',     action: 'Vente : Sardines en boîte × 5 → 3 500 F',                          type: 'vente',       details: '', created_at: today(2)        },
        { id: uid(), user_id: ID.m3,   user_name: 'Konaté Issouf',         action: 'Vente : Oignon 1kg × 3 → 1 800 F',                                 type: 'vente',       details: '', created_at: today(3)        },
        { id: uid(), user_id: ID.p1,   user_name: 'Coulibaly Mamadou',     action: 'Publication : Riz local brisé 50kg → Marché Virtuel',               type: 'publication', details: '', created_at: daysAgo(1)      },
        { id: uid(), user_id: ID.p2,   user_name: 'Koffi Née Adjoua',      action: 'Publication : Tomates fraîches 10kg → Marché Virtuel',              type: 'publication', details: '', created_at: daysAgo(1)      },
        { id: uid(), user_id: ID.m3,   user_name: 'Konaté Issouf',         action: 'Commande passée : Maïs sec 50kg × 2 → Ferme Coulibaly (24 000 F)', type: 'commande',    details: '', created_at: daysAgo(2)      },
        { id: uid(), user_id: ID.a1,   user_name: 'Ouattara Dramane',      action: 'Enrôlement soumis : Touré Bakary (Producteur)',                     type: 'enrolement',  details: '', created_at: daysAgo(2)      },
        { id: uid(), user_id: ID.p1,   user_name: 'Coulibaly Mamadou',     action: 'Livraison terminée : Maïs sec 50kg × 2 → Épicerie Konaté',         type: 'livraison',   details: '', created_at: daysAgo(3)      },
        { id: uid(), user_id: ID.m4,   user_name: 'Bamba Fatoumata',       action: 'Vente : Coca-Cola 1.5L × 4 → 4 000 F',                             type: 'vente',       details: '', created_at: daysAgo(3)      },
        { id: uid(), user_id: null,    user_name: 'Coopérative',           action: 'Enrôlement validé : Adjoua Marie Koné',                             type: 'enrolement',  details: '', created_at: daysAgo(4)      },
        { id: uid(), user_id: ID.m2,   user_name: 'Adjoua Marie Koné',     action: 'Commande passée : Tomates fraîches 10kg × 5 → Exploitation Koffi', type: 'commande',    details: '', created_at: daysAgo(5)      },
        { id: uid(), user_id: ID.p2,   user_name: 'Koffi Née Adjoua',      action: 'Livraison terminée : Tomates fraîches 10kg × 5 → Alimentation Marie', type: 'livraison', details: '', created_at: daysAgo(6)    },
        { id: uid(), user_id: ID.p3,   user_name: 'Diabaté Seydou',        action: 'Publication : Igname belé 10kg → Marché Virtuel',                   type: 'publication', details: '', created_at: daysAgo(6)      },
        { id: uid(), user_id: ID.a2,   user_name: "N'Guessan Eléonore",    action: 'Enrôlement validé : Konaté Issouf',                                 type: 'enrolement',  details: '', created_at: daysAgo(7)      },
        { id: uid(), user_id: null,    user_name: 'Coopérative',           action: 'Enrôlement rejeté : Yao Sylvestre — Dossier incomplet',             type: 'enrolement',  details: '', created_at: daysAgo(8)      },
        { id: uid(), user_id: ID.m1,   user_name: 'Kouassi Jean-Baptiste', action: 'Livraison reçue : Riz local brisé 50kg × 3 → Ferme Coulibaly',     type: 'livraison',   details: '', created_at: daysAgo(10)     },
        { id: uid(), user_id: ID.m5,   user_name: 'Tra Bi Emmanuel',       action: 'Vente : Chocolat tablette × 2 → 2 400 F',                          type: 'vente',       details: '', created_at: daysAgo(10)     },
        { id: uid(), user_id: ID.a1,   user_name: 'Ouattara Dramane',      action: 'Enrôlement validé : Bamba Fatoumata',                               type: 'enrolement',  details: '', created_at: daysAgo(12)     },
        { id: uid(), user_id: ID.p1,   user_name: 'Coulibaly Mamadou',     action: 'Publication : Maïs sec 50kg → Marché Virtuel',                      type: 'publication', details: '', created_at: daysAgo(14)     },
        { id: uid(), user_id: ID.m3,   user_name: 'Konaté Issouf',         action: 'Commande passée : Igname belé 10kg × 2 → Ferme Diabaté (10 000 F)',type: 'commande',    details: '', created_at: daysAgo(15)     },
        { id: uid(), user_id: ID.coop, user_name: 'Coopérative AGRI-CI',  action: 'Achat groupé créé : Riz local brisé 50kg × 10 min. (prix négocié 12 000 F)', type: 'achat_groupe', details: '', created_at: daysAgo(4) },
        { id: uid(), user_id: ID.m1,   user_name: 'Kouassi Jean-Baptiste', action: 'Rejoint achat groupé : Riz local brisé 50kg × 3 (économie 9 000 F)',        type: 'achat_groupe', details: '', created_at: daysAgo(3) },
        { id: uid(), user_id: ID.m2,   user_name: 'Adjoua Marie Koné',     action: 'Rejoint achat groupé : Riz local brisé 50kg × 2 (économie 6 000 F)',        type: 'achat_groupe', details: '', created_at: daysAgo(3) },
        { id: uid(), user_id: ID.coop, user_name: 'Coopérative AGRI-CI',  action: 'Achat groupé finalisé : Igname belé 10kg — 18 sacs livrés à 4 marchands',    type: 'achat_groupe', details: '', created_at: daysAgo(2) },
    ], 'activity_logs (24)');

    // ── Résumé final ──────────────────────────────────────────────────────────
    console.log('\n' + '═'.repeat(60));
    console.log('🎉  Seed terminé avec succès !');
    console.log('═'.repeat(60));
    console.log('\n📱  Comptes de connexion (PIN par défaut : 1234)\n');
    console.log('  MARCHANDS');
    console.log('  ├─ 0711223344 / 1234  →  Kouassi Jean-Baptiste');
    console.log('  ├─ 0555667788 / 1234  →  Adjoua Marie Koné');
    console.log('  ├─ 0123456789 / 1234  →  Konaté Issouf');
    console.log('  ├─ 0788990011 / 1234  →  Bamba Fatoumata');
    console.log('  └─ 0544556677 / 1234  →  Tra Bi Emmanuel');
    console.log('\n  PRODUCTEURS');
    console.log('  ├─ 0733445566 / 1234  →  Coulibaly Mamadou   (Riz, Maïs)');
    console.log('  ├─ 0577889900 / 1234  →  Koffi Née Adjoua    (Légumes)');
    console.log('  └─ 0166778899 / 1234  →  Diabaté Seydou      (Tubercules)');
    console.log('\n  AGENTS DE TERRAIN');
    console.log("  ├─ 0722334455 / 1234  →  Ouattara Dramane");
    console.log("  └─ 0511334466 / 1234  →  N'Guessan Eléonore");
    console.log('\n  COOPÉRATIVE & ADMIN');
    console.log('  ├─ 2722445566 / 1234  →  Coopérative AGRI-CI');
    console.log('  └─ 0000       / 0000  →  Superviseur (démo admin)');
    console.log('\n📊  Données insérées :');
    console.log('  • 25 produits marchands  (5 boutiques × ~5 produits)');
    console.log('  • 9 produits producteurs (3 fermes × 3 récoltes)');
    console.log('  • 8 images produits      (bucket "products" Supabase Storage)');
    console.log('  • Stock avec 3 ruptures  (sucre, tomates pelées, eau)');
    console.log(`  • ~130 transactions      (30 derniers jours + aujourd\'hui)`);
    console.log('  • 8 commandes            (PENDING × 2, ACCEPTED, SHIPPED, DELIVERED × 3, CANCELLED)');
    console.log('  • 7 enrôlements          (VALIDATED × 4, PENDING × 2, REJECTED × 1)');
    console.log('  • 4 achats groupés       (OPEN × 2, COMPLETED × 1, CANCELLED × 1)');
    console.log('  • 9 participants         (ag1 : 3 marchands, ag2 : 2, ag3 finalisé : 4)');
    console.log('  • 24 logs d\'activité     (dont 4 achat groupé)');
    console.log('\n');
}

main().catch(err => {
    console.error('\n❌  Erreur fatale :', err.message);
    process.exit(1);
});
