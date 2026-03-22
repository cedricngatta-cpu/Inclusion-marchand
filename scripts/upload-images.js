// ─────────────────────────────────────────────────────────────────────────────
// UPLOAD IMAGES — Supabase Storage → UPDATE image_url des produits producteurs
// ─────────────────────────────────────────────────────────────────────────────
//
// Ce script uploade les 8 images de assets/products/ dans le bucket "products"
// de Supabase Storage, puis met à jour la colonne image_url des produits.
//
// Il utilise le téléphone du producteur pour retrouver son store_id, puis
// matche les produits par nom — donc fonctionne même après un --reset.
//
// Usage :
//   SUPABASE_SERVICE_KEY=<clé_service> node scripts/upload-images.js
//
// ─────────────────────────────────────────────────────────────────────────────
'use strict';

const { createClient } = require('@supabase/supabase-js');
const fs   = require('fs');
const path = require('path');

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.EXPO_PUBLIC_SUPABASE_URL || 'https://lpowdjvxikqtorhadhyv.supabase.co';
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_KEY;

if (!SERVICE_KEY) {
    console.error('\n❌  SUPABASE_SERVICE_KEY manquant.\n');
    console.error('   SUPABASE_SERVICE_KEY=<clé> node scripts/upload-images.js\n');
    process.exit(1);
}

const sb = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
});

const IMAGES_DIR = path.join(__dirname, '..', 'assets', 'products');
const BUCKET     = 'products';

// Supprime les accents (Supabase Storage refuse les clés avec caractères spéciaux)
function removeAccents(str) {
    return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

// Correspondance : nom exact du produit dans la BDD → fichier image (sans accents sur disque)
const IMAGE_MAP = [
    { productName: 'Riz local brisé 50kg',    filename: 'Riz_local_brise_50kg.png'   },
    { productName: 'Maïs sec 50kg',            filename: 'Mais_sec_50kg.png'          },
    { productName: 'Riz étuvé 25kg',           filename: 'Riz_etuve_25kg.png'         },
    { productName: 'Tomates fraîches 10kg',    filename: 'Tomates_Fraiches_10kg.png'  },
    { productName: 'Aubergines locales 5kg',   filename: 'Aubergines_locales_5kg.png' },
    { productName: 'Gombo frais 3kg',          filename: 'Gombo_frais_3kg.png'        },
    { productName: 'Igname belé 10kg',         filename: 'Igname_Bele_10kg.png'       },
    { productName: 'Manioc frais 15kg',        filename: 'Manioc_frais_15kg.png'      },
];

async function main() {
    console.log('\n🖼️  Upload images → Supabase Storage\n');

    // 1. Vérifier que le bucket "products" est accessible
    const { data: buckets, error: bucketErr } = await sb.storage.listBuckets();
    if (bucketErr) {
        console.error('❌  Impossible de lister les buckets :', bucketErr.message);
        console.error('   → Vérifie que ta clé est bien la clé service_role (pas anon).\n');
        process.exit(1);
    }
    const bucket = buckets.find(b => b.name === BUCKET);
    if (!bucket) {
        console.error(`❌  Bucket "${BUCKET}" introuvable dans Supabase Storage.`);
        console.error('   → Crée-le dans : Storage → New bucket → nom "products" → Public ✅\n');
        process.exit(1);
    }
    if (!bucket.public) {
        console.warn(`⚠️  Bucket "${BUCKET}" n'est PAS public.`);
        console.warn('   → Les images ne s\'afficheront pas dans l\'app.');
        console.warn('   → Storage → products → Edit → Public ✅\n');
    } else {
        console.log(`✅  Bucket "${BUCKET}" public trouvé.\n`);
    }

    // 2. Récupérer tous les produits producteurs (stores de type PRODUCER)
    const { data: stores, error: storeErr } = await sb
        .from('stores')
        .select('id')
        .eq('store_type', 'PRODUCER');

    if (storeErr || !stores?.length) {
        console.error('❌  Aucune ferme producteur trouvée. Lance d\'abord le seed.\n');
        process.exit(1);
    }

    const storeIds = stores.map(s => s.id);
    const { data: products, error: prodErr } = await sb
        .from('products')
        .select('id, name')
        .in('store_id', storeIds);

    if (prodErr || !products?.length) {
        console.error('❌  Aucun produit producteur trouvé. Lance d\'abord le seed.\n');
        process.exit(1);
    }

    console.log(`   ${products.length} produit(s) producteur(s) trouvé(s) en base.\n`);

    // Index : nom normalisé → id
    const productIndex = {};
    for (const p of products) {
        productIndex[p.name.toLowerCase().trim()] = p.id;
    }

    let ok = 0, warn = 0;

    // 3. Upload + UPDATE pour chaque image
    for (const { productName, filename } of IMAGE_MAP) {
        // Sécurité : normalise même si un accent résiduel
        const cleanFilename = removeAccents(filename);
        const filePath = path.join(IMAGES_DIR, cleanFilename);

        // Vérifier fichier local
        if (!fs.existsSync(filePath)) {
            console.warn(`  ⚠️  Fichier absent : assets/products/${cleanFilename}`);
            warn++;
            continue;
        }

        // Matcher avec la BDD
        const productId = productIndex[productName.toLowerCase().trim()];
        if (!productId) {
            console.warn(`  ⚠️  Produit introuvable en BDD : "${productName}"`);
            warn++;
            continue;
        }

        // Upload dans Storage
        // Path = nom de fichier directement dans le bucket (pas de sous-dossier)
        // → URL : .../storage/v1/object/public/products/<cleanFilename>
        const fileBuffer  = fs.readFileSync(filePath);
        const storagePath = cleanFilename;

        const { error: uploadErr } = await sb.storage
            .from(BUCKET)
            .upload(storagePath, fileBuffer, { contentType: 'image/png', upsert: true });

        if (uploadErr) {
            console.error(`  ❌ Upload "${cleanFilename}" : ${uploadErr.message}`);
            warn++;
            continue;
        }

        // URL publique
        const { data: urlData } = sb.storage.from(BUCKET).getPublicUrl(storagePath);
        const publicUrl = urlData.publicUrl;

        // UPDATE products.image_url
        const { error: updateErr } = await sb
            .from('products')
            .update({ image_url: publicUrl })
            .eq('id', productId);

        if (updateErr) {
            console.error(`  ❌ UPDATE image_url "${productName}" : ${updateErr.message}`);
            warn++;
        } else {
            console.log(`  ✅ ${productName.padEnd(28)} ← ${cleanFilename}`);
            ok++;
        }
    }

    // 4. Résumé
    console.log('\n' + '─'.repeat(60));
    console.log(`🎉  ${ok} image(s) uploadée(s) et liée(s).`);
    if (warn) console.log(`⚠️   ${warn} avertissement(s) — voir ci-dessus.`);
    console.log('');
    console.log('   Relance l\'app (r dans le terminal Expo) pour voir les images.');
    console.log('─'.repeat(60) + '\n');
}

main().catch(err => {
    console.error('\n❌  Erreur fatale :', err.message);
    process.exit(1);
});
