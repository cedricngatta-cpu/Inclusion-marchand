// scripts/simulate.js — Équipe virtuelle de test
//
// Simule 5 utilisateurs (Producteur, 2 Marchands, Agent, Coopérative)
// qui font des actions réalistes pendant que toi tu observes en Admin.
//
// Usage PowerShell :
// $env:SUPABASE_SERVICE_KEY="ta_clé"; node scripts/simulate.js
//
// Usage Linux/Mac :
// SUPABASE_SERVICE_KEY=ta_clé node scripts/simulate.js

const { createClient } = require('@supabase/supabase-js');
const io = require('socket.io-client');

// ── Config ──
const SUPABASE_URL = process.env.SUPABASE_URL || process.env.EXPO_PUBLIC_SUPABASE_URL || 'https://lpowdjvxikqtorhadhyv.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;
const SOCKET_URL = process.env.SOCKET_URL || 'http://localhost:3001';

// Vitesse de simulation
// 5000 = normal (10 min), 2000 = rapide (4 min), 15000 = démo investisseur (25 min)
const DELAY = parseInt(process.env.DELAY) || 5000;

if (!SUPABASE_KEY) {
  console.error('❌ SUPABASE_SERVICE_KEY manquante !');
  console.error('Usage: $env:SUPABASE_SERVICE_KEY="..."; node scripts/simulate.js');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const socket = io(SOCKET_URL);

const wait = (ms) => new Promise(r => setTimeout(r, ms || DELAY));

// ── Utilisateurs et stores ──
let U = {};
let S = {}; // store IDs par utilisateur clé

const log = (emoji, role, action) => {
  const time = new Date().toLocaleTimeString('fr-FR');
  console.log(`  [${time}] ${emoji}  ${role.padEnd(14)} │ ${action}`);
};

const separator = (title) => {
  console.log(`\n  ${'─'.repeat(60)}`);
  console.log(`  🎬  ${title}`);
  console.log(`  ${'─'.repeat(60)}\n`);
};

// ── Charger les comptes de démo ──
async function loadUsers() {
  const { data, error } = await supabase.from('profiles').select('id, full_name, role, phone_number');
  if (error) {
    console.error('❌ Impossible de charger les profils:', error.message);
    process.exit(1);
  }

  for (const u of data) {
    if (u.phone_number === '0733445566') U.producteur = u;
    if (u.phone_number === '0711223344') U.marchand1 = u;
    if (u.phone_number === '0555667788') U.marchand2 = u;
    if (u.phone_number === '0722334455') U.agent = u;
    if (u.phone_number === '2722445566') U.cooperative = u;
    if (u.phone_number === '0544556677') U.marchand3 = u;
    if (u.phone_number === '0000')       U.admin = u;
  }

  const required = ['producteur', 'marchand1', 'marchand2', 'agent', 'cooperative'];
  const missing = required.filter(k => !U[k]);
  if (missing.length > 0) {
    console.error(`❌ Comptes manquants : ${missing.join(', ')}. Lance le seed d'abord.`);
    process.exit(1);
  }

  if (!U.admin) console.warn('  ⚠️  Compte admin (0000) non trouvé — notifications admin ignorées');

  console.log(`  👥 ${Object.keys(U).length} comptes chargés :`);
  console.log(`     🧑‍🌾 Producteur  : ${U.producteur.full_name}`);
  console.log(`     🏪 Marchand 1  : ${U.marchand1.full_name}`);
  console.log(`     🏪 Marchand 2  : ${U.marchand2.full_name}`);
  console.log(`     🕵️  Agent       : ${U.agent.full_name}`);
  console.log(`     🏛️  Coopérative : ${U.cooperative.full_name}`);
  if (U.marchand3) console.log(`     🏪 Marchand 3  : ${U.marchand3.full_name}`);
  if (U.admin)     console.log(`     👑 Admin       : ${U.admin.full_name}`);
}

// ── Charger les stores de chaque utilisateur ──
async function getStoreId(userId) {
  const { data } = await supabase.from('stores').select('id').eq('owner_id', userId).single();
  return data?.id;
}

async function loadStores() {
  for (const key of ['producteur', 'marchand1', 'marchand2']) {
    if (U[key]) {
      S[key] = await getStoreId(U[key].id);
      if (!S[key]) console.warn(`  ⚠️  Pas de store pour ${key} (${U[key].full_name}) — certaines actions pourraient échouer`);
    }
  }
  console.log(`  🏪 Stores chargés : producteur=${S.producteur?.slice(0,8)}... m1=${S.marchand1?.slice(0,8)}... m2=${S.marchand2?.slice(0,8)}...`);
}

// ── Insérer un log d'activité (visible dans "Activité récente" du dashboard admin) ──
async function logActivity(userId, userName, action, type, details = '') {
  const { error } = await supabase.from('activity_logs').insert({
    user_id: userId,
    user_name: userName,
    action,
    type,
    details,
  });
  if (error) console.log(`  ⚠️  activity_logs erreur (${action.slice(0, 40)}): ${error.message}`);
}

// ── Créer une notification ──
async function notify(userId, titre, message, type, route, extra = {}) {
  if (!userId) return;
  const { error } = await supabase.from('notifications').insert({
    user_id: userId,
    titre,
    message,
    type,
    data: JSON.stringify({ route, ...extra }),
    lu: false,
  });
  if (error) console.log(`  ⚠️  Notification erreur (${titre}): ${error.message}`);
}

// ── Notification admin ──
async function notifyAdmin(titre, message, type, route, extra = {}) {
  if (!U.admin) return;
  await notify(U.admin.id, titre, message, type, route, extra);
}

// ══════════════════════════════════════════════════════════════
// ACTE 1 — ENRÔLEMENT
// L'agent terrain va sur le marché et inscrit de nouveaux membres
// ══════════════════════════════════════════════════════════════
async function acte1_enrolement() {
  separator('ACTE 1 — ENRÔLEMENT (l\'agent inscrit des membres sur le terrain)');

  // 1. Agent enrôle un marchand
  log('🕵️', 'Agent', 'Se rend au marché de Treichville...');
  await wait(2000);
  log('🕵️', 'Agent', 'Enrôle Traoré Ibrahim (marchand, Chez Ibrahim)');

  const { data: e1, error: err_e1 } = await supabase.from('demandes_enrolement').insert({
    agent_id: U.agent.id,
    nom: 'Traoré Ibrahim',
    telephone: '0799001122',
    type: 'MERCHANT',
    adresse: 'Marché de Treichville, Abidjan',
    nom_boutique: 'Chez Ibrahim',
    statut: 'en_attente',
    date_demande: new Date().toISOString(),
  }).select().single();
  if (err_e1) console.log(`  ❌ INSERT demandes_enrolement (e1): ${err_e1.message}${err_e1.hint ? ' — ' + err_e1.hint : ''}`);
  await logActivity(U.agent.id, U.agent.full_name, 'Enrôlement soumis : Traoré Ibrahim (Marchand) — Marché Treichville', 'enrolement');

  socket.emit('nouvel-enrolement', {
    agentId: U.agent.id,
    agentName: U.agent.full_name,
    name: 'Traoré Ibrahim',
    type: 'MERCHANT',
    address: 'Marché de Treichville',
  });

  await notify(U.cooperative.id,
    'Nouveau membre à vérifier',
    `L'agent ${U.agent.full_name} a inscrit Traoré Ibrahim (Marchand) depuis Marché de Treichville.`,
    'enrolement', '/cooperative/demandes',
    { enrolement_id: e1?.id, agent_nom: U.agent.full_name, nom: 'Traoré Ibrahim', type: 'MERCHANT' }
  );
  await notifyAdmin(
    `Agent ${U.agent.full_name} a inscrit Traoré Ibrahim (Marchand)`,
    `L'agent ${U.agent.full_name} a inscrit Traoré Ibrahim (Marchand) au Marché de Treichville.`,
    'enrolement', '/admin/enrolements',
    { enrolement_id: e1?.id }
  );

  await wait();

  // 2. Agent enrôle un producteur
  log('🕵️', 'Agent', 'Enrôle Diallo Aminata (producteur, Ferme Aminata)');

  const { data: e2, error: err_e2 } = await supabase.from('demandes_enrolement').insert({
    agent_id: U.agent.id,
    nom: 'Diallo Aminata',
    telephone: '0788112233',
    type: 'PRODUCER',
    adresse: 'Zone agricole Bingerville',
    nom_boutique: 'Ferme Aminata',
    statut: 'en_attente',
    date_demande: new Date().toISOString(),
  }).select().single();
  if (err_e2) console.log(`  ❌ INSERT demandes_enrolement (e2): ${err_e2.message}${err_e2.hint ? ' — ' + err_e2.hint : ''}`);
  await logActivity(U.agent.id, U.agent.full_name, 'Enrôlement soumis : Diallo Aminata (Producteur) — Bingerville', 'enrolement');

  socket.emit('nouvel-enrolement', {
    agentId: U.agent.id,
    agentName: U.agent.full_name,
    name: 'Diallo Aminata',
    type: 'PRODUCER',
    address: 'Zone agricole Bingerville',
  });

  await notify(U.cooperative.id,
    'Nouveau membre à vérifier',
    `L'agent ${U.agent.full_name} a inscrit Diallo Aminata (Producteur) depuis Bingerville.`,
    'enrolement', '/cooperative/demandes',
    { enrolement_id: e2?.id }
  );
  await notifyAdmin(
    `Agent ${U.agent.full_name} a inscrit Diallo Aminata (Producteur)`,
    `L'agent ${U.agent.full_name} a inscrit Diallo Aminata (Producteur) à Zone agricole Bingerville.`,
    'enrolement', '/admin/enrolements',
    { enrolement_id: e2?.id }
  );

  await wait();

  // 3. Coopérative valide le premier
  if (e1) {
    log('🏛️', 'Coopérative', '✅ Valide Traoré Ibrahim — membre confirmé');
    await supabase.from('demandes_enrolement').update({ statut: 'valide' }).eq('id', e1.id);

    socket.emit('enrolement-valide', {
      agentId: U.agent.id,
      marchandName: 'Traoré Ibrahim',
      cooperativeName: 'AGRI-CI',
      demandId: e1.id,
    });

    await notify(U.agent.id,
      'Inscription validée ✓',
      'Traoré Ibrahim (Marchand) a été validé par la coopérative AGRI-CI.',
      'enrolement', '/agent/activites',
      { enrolement_id: e1.id, statut: 'valide' }
    );
    await notifyAdmin(
      'Coopérative a validé Traoré Ibrahim',
      'La Coopérative AGRI-CI a validé l\'inscription de Traoré Ibrahim (Marchand).',
      'enrolement', '/admin/enrolements',
      { enrolement_id: e1.id, statut: 'valide' }
    );
    await logActivity(U.cooperative.id, U.cooperative.full_name, 'Enrôlement validé : Traoré Ibrahim (Marchand)', 'enrolement');
  }

  await wait();

  // 4. Coopérative rejette le deuxième
  if (e2) {
    log('🏛️', 'Coopérative', '❌ Rejette Diallo Aminata — photo d\'identité floue');
    await supabase.from('demandes_enrolement').update({
      statut: 'rejete',
      motif_rejet: 'Photo d\'identité floue. Veuillez reprendre avec une photo nette.',
    }).eq('id', e2.id);

    socket.emit('enrolement-rejete', {
      agentId: U.agent.id,
      marchandName: 'Diallo Aminata',
      reason: 'Photo d\'identité floue',
      demandId: e2.id,
    });

    await notify(U.agent.id,
      'Inscription refusée',
      'Diallo Aminata a été refusée. Motif : Photo floue. Veuillez corriger et soumettre à nouveau.',
      'enrolement', '/agent/activites',
      { enrolement_id: e2.id, statut: 'rejete', motif: 'Photo floue' }
    );
    await notifyAdmin(
      'Coopérative a rejeté Diallo Aminata',
      'La Coopérative AGRI-CI a rejeté l\'inscription de Diallo Aminata (Producteur). Motif : Photo d\'identité floue.',
      'enrolement', '/admin/enrolements',
      { enrolement_id: e2.id, statut: 'rejete' }
    );
    await logActivity(U.cooperative.id, U.cooperative.full_name, 'Enrôlement rejeté : Diallo Aminata — Photo floue', 'enrolement');
  }

  await wait();
  console.log('  ✅ Acte 1 terminé : 2 enrôlements (1 validé, 1 rejeté)\n');
}

// ══════════════════════════════════════════════════════════════
// ACTE 2 — PUBLICATION DE RÉCOLTES
// Le producteur met ses produits en vente sur le Marché Virtuel
// ══════════════════════════════════════════════════════════════
async function acte2_publication() {
  separator('ACTE 2 — PUBLICATION (le producteur met ses récoltes en vente)');

  log('🧑‍🌾', 'Producteur', 'Ouvre l\'app et va sur "Publier une récolte"...');
  await wait(2000);

  // Produit 1 — store_id obligatoire (seed.js)
  log('🧑‍🌾', 'Producteur', 'Publie : Riz parfumé 25kg — 18 000 F CFA');

  const { data: p1, error: err_p1 } = await supabase.from('products').insert({
    store_id: S.producteur,
    name: 'Riz parfumé 25kg',
    price: 18000,
    category: 'Céréales',
    delivery_price: 1500,
    zone_livraison: 'Abidjan et banlieue',
    delai_livraison: '2-3 jours',
    description: 'Riz parfumé de qualité supérieure. Livreur : Koné Transport (0700112233).',
    audio_name: 'Riz parfumé 25kg',
    color: '#ecfdf5',
    icon_color: '#C47316',
  }).select().single();
  if (err_p1) console.log(`  ❌ INSERT products (p1): ${err_p1.message}${err_p1.hint ? ' — ' + err_p1.hint : ''}`);
  await logActivity(U.producteur.id, U.producteur.full_name, 'Publication : Riz parfumé 25kg → Marché Virtuel (18 000 F)', 'publication');

  socket.emit('nouveau-produit-marche', {
    productId: p1?.id,
    productName: 'Riz parfumé 25kg',
    price: 18000,
    producerName: U.producteur.full_name,
    producerId: U.producteur.id,
  });

  for (const m of [U.marchand1, U.marchand2]) {
    await notify(m.id,
      'Nouveau produit disponible',
      `${U.producteur.full_name} vend Riz parfumé 25kg à 18 000F sur le Marché Virtuel.`,
      'marche', '/(tabs)/marche',
      { produit_id: p1?.id, produit_nom: 'Riz parfumé 25kg', prix: 18000 }
    );
  }
  await notifyAdmin(
    `${U.producteur.full_name} publie Riz parfumé 25kg à 18 000F`,
    `${U.producteur.full_name} a publié "Riz parfumé 25kg" à 18 000F sur le Marché Virtuel.`,
    'marche', '/admin/produits',
    { produit_id: p1?.id, prix: 18000 }
  );

  await wait();

  // Produit 2
  log('🧑‍🌾', 'Producteur', 'Publie : Maïs frais 10kg — 5 000 F CFA');

  const { data: p2, error: err_p2 } = await supabase.from('products').insert({
    store_id: S.producteur,
    name: 'Maïs frais 10kg',
    price: 5000,
    category: 'Céréales',
    delivery_price: 800,
    zone_livraison: 'Abidjan',
    delai_livraison: '1-2 jours',
    description: 'Maïs frais, récolte récente. Livraison rapide sur Abidjan.',
    audio_name: 'Maïs frais 10kg',
    color: '#eff6ff',
    icon_color: '#2563eb',
  }).select().single();
  if (err_p2) console.log(`  ❌ INSERT products (p2): ${err_p2.message}${err_p2.hint ? ' — ' + err_p2.hint : ''}`);
  await logActivity(U.producteur.id, U.producteur.full_name, 'Publication : Maïs frais 10kg → Marché Virtuel (5 000 F)', 'publication');

  socket.emit('nouveau-produit-marche', {
    productId: p2?.id,
    productName: 'Maïs frais 10kg',
    price: 5000,
    producerName: U.producteur.full_name,
    producerId: U.producteur.id,
  });

  await notifyAdmin(
    `${U.producteur.full_name} publie Maïs frais 10kg à 5 000F`,
    `${U.producteur.full_name} a publié "Maïs frais 10kg" à 5 000F sur le Marché Virtuel.`,
    'marche', '/admin/produits',
    { produit_id: p2?.id, prix: 5000 }
  );

  await wait();
  console.log('  ✅ Acte 2 terminé : 2 produits publiés sur le Marché Virtuel\n');
  return { riz: p1, mais: p2 };
}

// ══════════════════════════════════════════════════════════════
// ACTE 3 — COMMANDES B2B
// Les marchands commandent chez le producteur via le Marché Virtuel
// ══════════════════════════════════════════════════════════════
async function acte3_commandes(produits) {
  separator('ACTE 3 — COMMANDES (les marchands commandent sur le Marché Virtuel)');

  // Commande 1 — Marchand Kouassi commande du riz
  log('🏪', 'Marchand 1', `${U.marchand1.full_name} commande 20 sacs de Riz parfumé`);

  const unitPrice1 = 18000;
  const total1 = 20 * unitPrice1 + 1500; // + livraison
  const { data: c1, error: err_c1 } = await supabase.from('orders').insert({
    buyer_store_id: S.marchand1,
    seller_store_id: S.producteur,
    product_id: produits.riz?.id,
    product_name: 'Riz parfumé 25kg',
    quantity: 20,
    unit_price: unitPrice1,
    total_amount: total1,
    status: 'PENDING',
  }).select().single();
  if (err_c1) console.log(`  ❌ INSERT orders (c1): ${err_c1.message}${err_c1.hint ? ' — ' + err_c1.hint : ''}`);
  await logActivity(U.marchand1.id, U.marchand1.full_name, `Commande passée : Riz parfumé 25kg × 20 → ${U.producteur.full_name} (${total1.toLocaleString('fr-FR')} F)`, 'commande');

  socket.emit('nouvelle-commande', {
    orderId: c1?.id,
    buyerId: U.marchand1.id,
    buyerName: U.marchand1.full_name,
    sellerId: U.producteur.id,
    productName: 'Riz parfumé 25kg',
    quantity: 20,
    totalAmount: total1,
  });

  await notify(U.producteur.id,
    'Nouvelle commande',
    `${U.marchand1.full_name} veut 20 sacs de Riz parfumé 25kg pour ${total1.toLocaleString('fr-FR')}F.`,
    'commande', '/producteur/commandes',
    { commande_id: c1?.id, marchand_nom: U.marchand1.full_name, produit_nom: 'Riz parfumé 25kg', quantite: 20, total: total1 }
  );
  await notifyAdmin(
    `${U.marchand1.full_name} commande 20 riz chez ${U.producteur.full_name} (${total1.toLocaleString('fr-FR')}F)`,
    `${U.marchand1.full_name} a passé une commande de 20 Riz parfumé 25kg chez ${U.producteur.full_name} pour ${total1.toLocaleString('fr-FR')}F.`,
    'commande', '/admin/commandes',
    { commande_id: c1?.id }
  );

  await wait();

  // Commande 2 — Marchand Adjoua commande du maïs
  log('🏪', 'Marchand 2', `${U.marchand2.full_name} commande 10 sacs de Maïs frais`);

  const unitPrice2 = 5000;
  const total2 = 10 * unitPrice2 + 800;
  const { data: c2, error: err_c2 } = await supabase.from('orders').insert({
    buyer_store_id: S.marchand2,
    seller_store_id: S.producteur,
    product_id: produits.mais?.id,
    product_name: 'Maïs frais 10kg',
    quantity: 10,
    unit_price: unitPrice2,
    total_amount: total2,
    status: 'PENDING',
  }).select().single();
  if (err_c2) console.log(`  ❌ INSERT orders (c2): ${err_c2.message}${err_c2.hint ? ' — ' + err_c2.hint : ''}`);
  await logActivity(U.marchand2.id, U.marchand2.full_name, `Commande passée : Maïs frais 10kg × 10 → ${U.producteur.full_name} (${total2.toLocaleString('fr-FR')} F)`, 'commande');

  socket.emit('nouvelle-commande', {
    orderId: c2?.id,
    buyerId: U.marchand2.id,
    buyerName: U.marchand2.full_name,
    sellerId: U.producteur.id,
    productName: 'Maïs frais 10kg',
    quantity: 10,
    totalAmount: total2,
  });

  await notify(U.producteur.id,
    'Nouvelle commande',
    `${U.marchand2.full_name} veut 10 sacs de Maïs frais 10kg pour ${total2.toLocaleString('fr-FR')}F.`,
    'commande', '/producteur/commandes',
    { commande_id: c2?.id }
  );
  await notifyAdmin(
    `${U.marchand2.full_name} commande 10 maïs chez ${U.producteur.full_name} (${total2.toLocaleString('fr-FR')}F)`,
    `${U.marchand2.full_name} a passé une commande de 10 Maïs frais 10kg chez ${U.producteur.full_name} pour ${total2.toLocaleString('fr-FR')}F.`,
    'commande', '/admin/commandes',
    { commande_id: c2?.id }
  );

  await wait();

  // Producteur accepte commande 1
  if (c1) {
    log('🧑‍🌾', 'Producteur', `✅ Accepte la commande de ${U.marchand1.full_name}`);
    await supabase.from('orders').update({ status: 'ACCEPTED' }).eq('id', c1.id);

    socket.emit('commande-acceptee', {
      orderId: c1.id,
      buyerId: U.marchand1.id,
      sellerName: U.producteur.full_name,
      productName: 'Riz parfumé 25kg',
    });

    await notify(U.marchand1.id,
      'Commande acceptée',
      `${U.producteur.full_name} a accepté votre commande de 20 Riz parfumé 25kg. Livraison sous 2-3 jours.`,
      'commande', '/(tabs)/marche',
      { commande_id: c1.id }
    );
    await notifyAdmin(
      `${U.producteur.full_name} accepte la commande de ${U.marchand1.full_name}`,
      `${U.producteur.full_name} a accepté la commande de ${U.marchand1.full_name} : 20 Riz parfumé 25kg. Livraison en cours.`,
      'commande', '/admin/commandes',
      { commande_id: c1.id }
    );
    await logActivity(U.producteur.id, U.producteur.full_name, `Commande acceptée : Riz parfumé 25kg × 20 → ${U.marchand1.full_name}`, 'commande');
  }

  await wait(3000);

  // Producteur annule commande 2 (statut CANCELLED, jamais REJECTED)
  if (c2) {
    log('🧑‍🌾', 'Producteur', `❌ Refuse la commande de ${U.marchand2.full_name} (rupture)`);
    await supabase.from('orders').update({ status: 'CANCELLED' }).eq('id', c2.id);

    socket.emit('commande-refusee', {
      orderId: c2.id,
      buyerId: U.marchand2.id,
      sellerName: U.producteur.full_name,
      productName: 'Maïs frais 10kg',
      reason: 'Rupture de stock temporaire',
    });

    await notify(U.marchand2.id,
      'Commande refusée',
      `${U.producteur.full_name} a refusé votre commande de Maïs frais 10kg. Raison : Rupture de stock.`,
      'commande_refusee', '/(tabs)/marche',
      { commande_id: c2.id, motif: 'Rupture de stock' }
    );
    await notifyAdmin(
      `${U.producteur.full_name} refuse la commande de ${U.marchand2.full_name}`,
      `${U.producteur.full_name} a annulé la commande de ${U.marchand2.full_name} : Maïs frais 10kg. Motif : Rupture de stock temporaire.`,
      'commande', '/admin/commandes',
      { commande_id: c2?.id }
    );
    await logActivity(U.producteur.id, U.producteur.full_name, `Commande annulée : Maïs frais 10kg × 10 → ${U.marchand2.full_name} (rupture stock)`, 'commande');
  }

  await wait();
  console.log('  ✅ Acte 3 terminé : 2 commandes (1 acceptée, 1 refusée)\n');
  return { c1, c2 };
}

// ══════════════════════════════════════════════════════════════
// ACTE 4 — LIVRAISON
// Le producteur expédie et le marchand reçoit sa commande
// ══════════════════════════════════════════════════════════════
async function acte4_livraison(commandes) {
  separator('ACTE 4 — LIVRAISON (le producteur livre la commande acceptée)');

  if (!commandes.c1) { console.log('  ⚠️ Pas de commande à livrer (c1 est null — vérifier l\'Acte 3)'); return; }

  // En livraison — statut SHIPPED (jamais SHIPPING)
  log('🧑‍🌾', 'Producteur', '🚚 Marque la commande "En livraison" — le livreur est parti');
  await supabase.from('orders').update({ status: 'SHIPPED' }).eq('id', commandes.c1.id);

  socket.emit('livraison-en-cours', {
    orderId: commandes.c1.id,
    buyerId: U.marchand1.id,
    productName: 'Riz parfumé 25kg',
  });

  await notify(U.marchand1.id,
    'Livraison en route',
    'Votre commande de 20 Riz parfumé 25kg est en route. Livreur : Koné Transport (0700112233).',
    'livraison', '/(tabs)/marche',
    { commande_id: commandes.c1.id }
  );
  await notifyAdmin(
    `Commande de ${U.marchand1.full_name} en livraison`,
    `La commande de ${U.marchand1.full_name} (20 Riz parfumé 25kg) est en route. Livreur : Koné Transport.`,
    'livraison', '/admin/commandes',
    { commande_id: commandes.c1.id }
  );
  await logActivity(U.producteur.id, U.producteur.full_name, `Livraison en cours : Riz parfumé 25kg × 20 → ${U.marchand1.full_name}`, 'livraison');

  await wait();

  // Livrée
  log('🧑‍🌾', 'Producteur', '📦 Marque "Livrée" — le marchand a reçu les 20 sacs');
  await supabase.from('orders').update({ status: 'DELIVERED' }).eq('id', commandes.c1.id);

  socket.emit('livraison-terminee', {
    orderId: commandes.c1.id,
    buyerId: U.marchand1.id,
    productName: 'Riz parfumé 25kg',
    quantity: 20,
  });

  await notify(U.marchand1.id,
    'Livraison reçue ✓',
    '20 sacs de Riz parfumé 25kg ont été livrés. Votre stock a été mis à jour.',
    'livraison', '/(tabs)/stock',
    { commande_id: commandes.c1.id, produit_nom: 'Riz parfumé 25kg', quantite: 20 }
  );
  await notifyAdmin(
    `Commande de ${U.marchand1.full_name} livrée — stock mis à jour`,
    `La commande de ${U.marchand1.full_name} (20 Riz parfumé 25kg) a été livrée avec succès. Stock mis à jour automatiquement.`,
    'livraison', '/admin/commandes',
    { commande_id: commandes.c1.id }
  );
  await logActivity(U.producteur.id, U.producteur.full_name, `Livraison terminée : Riz parfumé 25kg × 20 → ${U.marchand1.full_name}`, 'livraison');

  await wait();
  console.log('  ✅ Acte 4 terminé : 1 commande livrée, stock marchand mis à jour\n');
}

// ══════════════════════════════════════════════════════════════
// ACTE 5 — VENTES CLIENT FINAL
// Les marchands vendent aux clients qui viennent dans leur boutique
// ══════════════════════════════════════════════════════════════
async function acte5_ventes() {
  separator('ACTE 5 — VENTES (les marchands vendent à leurs clients)');

  const ventes = [
    { marchand: U.marchand1, store: S.marchand1, role: 'Marchand 1', client: 'Yao Michel',    produit: 'Riz parfumé 25kg',  qte: 5,  prix: 20000, mode: 'PAYÉ' },
    { marchand: U.marchand1, store: S.marchand1, role: 'Marchand 1', client: 'Fatou Bamba',   produit: 'Huile de palme 5L', qte: 2,  prix: 3500,  mode: 'MOMO' },
    { marchand: U.marchand1, store: S.marchand1, role: 'Marchand 1', client: 'Konan Pierre',  produit: 'Sucre 1kg',         qte: 10, prix: 800,   mode: 'PAYÉ' },
    { marchand: U.marchand2, store: S.marchand2, role: 'Marchand 2', client: 'Sarah Touré',   produit: 'Tomate 1kg',        qte: 3,  prix: 1200,  mode: 'PAYÉ' },
    { marchand: U.marchand2, store: S.marchand2, role: 'Marchand 2', client: 'Moussa Diarra', produit: 'Oignon 1kg',        qte: 5,  prix: 900,   mode: 'MOMO' },
  ];

  for (const v of ventes) {
    const total = v.qte * v.prix;
    const modeLabel = v.mode === 'PAYÉ' ? 'espèces' : 'Mobile Money';
    log('🏪', v.role, `Vend ${v.qte}× ${v.produit} à ${v.client} (${modeLabel}) → ${total.toLocaleString('fr-FR')}F`);

    // Colonnes réelles (seed.js) : store_id, type, product_name, quantity, price, client_name, status
    const { error: err_tx } = await supabase.from('transactions').insert({
      store_id: v.store,
      type: 'VENTE',
      product_name: v.produit,
      quantity: v.qte,
      price: total,
      client_name: v.client,
      status: v.mode,
    });
    if (err_tx) console.log(`  ❌ INSERT transactions (${v.produit}): ${err_tx.message}${err_tx.hint ? ' — ' + err_tx.hint : ''}`);

    socket.emit('nouvelle-vente', {
      sellerId: v.marchand.id,
      sellerName: v.marchand.full_name,
      productName: v.produit,
      quantity: v.qte,
      totalAmount: total,
      clientName: v.client,
    });

    await notifyAdmin(
      `${v.marchand.full_name} a vendu ${v.qte} ${v.produit} — ${total.toLocaleString('fr-FR')}F`,
      `${v.marchand.full_name} a vendu ${v.qte}× ${v.produit} à ${v.client} (${modeLabel}) — ${total.toLocaleString('fr-FR')}F.`,
      'vente', '/admin/transactions',
      { vendeur: v.marchand.full_name, produit: v.produit, montant: total, client: v.client }
    );
    await logActivity(v.marchand.id, v.marchand.full_name, `Vente : ${v.produit} × ${v.qte} → ${total.toLocaleString('fr-FR')} F (${v.client})`, 'vente');

    await wait(3000);
  }

  const totalVentes = ventes.reduce((sum, v) => sum + v.qte * v.prix, 0);
  console.log(`  ✅ Acte 5 terminé : ${ventes.length} ventes pour ${totalVentes.toLocaleString('fr-FR')}F total\n`);
}

// ══════════════════════════════════════════════════════════════
// ACTE 6 — ACHAT GROUPÉ
// La coopérative négocie un prix de gros avec le producteur
// ══════════════════════════════════════════════════════════════
async function acte6_achatGroupe(produits) {
  separator('ACTE 6 — ACHAT GROUPÉ (la coopérative négocie pour ses marchands)');

  // Phase 1 : Coopérative crée l'achat groupé — statut NEGOTIATION (contrainte SQL réelle)
  log('🏛️', 'Coopérative', 'Crée un achat groupé : Riz parfumé 25kg (objectif: 80 sacs, min: 40)');

  const { data: ag, error: err_ag } = await supabase.from('achats_groupes').insert({
    cooperative_id: U.cooperative.id,
    producteur_id: U.producteur.id,
    produit_id: produits.riz?.id,
    nom_produit: 'Riz parfumé 25kg',
    prix_normal: 18000,
    quantite_totale: 80,
    quantite_minimum: 40,
    quantite_actuelle: 0,
    statut: 'NEGOTIATION',
    date_limite: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    description: 'Achat groupé riz — 12 marchands intéressés. Prix normal 18 000F, négociation en cours.',
  }).select().single();
  if (err_ag) console.log(`  ❌ INSERT achats_groupes: ${err_ag?.message}${err_ag?.hint ? ' — ' + err_ag?.hint : ''}`);
  await logActivity(U.cooperative.id, U.cooperative.full_name, 'Achat groupé créé : Riz parfumé 25kg × 80 sacs (min 40) — prix en négociation', 'achat_groupe');

  socket.emit('demande-prix-groupe', {
    achatGroupeId: ag?.id,
    cooperativeId: U.cooperative.id,
    cooperativeName: U.cooperative.full_name,
    producerId: U.producteur.id,
    productName: 'Riz parfumé 25kg',
    targetQuantity: 80,
  });

  await notify(U.producteur.id,
    'Demande de prix groupé',
    `La coopérative ${U.cooperative.full_name} demande un prix pour 80 sacs de Riz parfumé 25kg.`,
    'achat_groupe', '/producteur/commandes',
    { achat_groupe_id: ag?.id }
  );
  await notifyAdmin(
    'Coopérative demande un prix groupé pour riz',
    `La ${U.cooperative.full_name} crée un achat groupé : Riz parfumé 25kg — 80 sacs (min 40). Demande envoyée à ${U.producteur.full_name}.`,
    'achat_groupe', '/admin/commandes',
    { achat_groupe_id: ag?.id }
  );

  await wait();

  // Phase 2 : Producteur propose un prix
  if (ag) {
    log('🧑‍🌾', 'Producteur', 'Propose 13 500F le sac (au lieu de 18 000F prix unitaire)');
    const { error: err_prix } = await supabase.from('achats_groupes').update({ prix_negocie: 13500 }).eq('id', ag.id);
    if (err_prix) console.log(`  ❌ UPDATE achats_groupes (prix_negocie): ${err_prix.message}`);
    await logActivity(U.producteur.id, U.producteur.full_name, 'Prix groupé proposé : Riz parfumé 25kg à 13 500 F/sac (au lieu de 18 000 F)', 'achat_groupe');

    socket.emit('prix-groupe-propose', {
      achatGroupeId: ag.id,
      producerId: U.producteur.id,
      producerName: U.producteur.full_name,
      cooperativeId: U.cooperative.id,
      price: 13500,
      productName: 'Riz parfumé 25kg',
    });

    await notify(U.cooperative.id,
      'Prix groupé reçu',
      `${U.producteur.full_name} propose 13 500F/sac pour Riz parfumé 25kg. Accepter ?`,
      'achat_groupe', '/cooperative/achats',
      { achat_groupe_id: ag.id, prix: 13500 }
    );
    await notifyAdmin(
      `${U.producteur.full_name} propose 13 500F/sac`,
      `${U.producteur.full_name} propose 13 500F/sac pour l'achat groupé Riz parfumé 25kg (au lieu de 18 000F).`,
      'achat_groupe', '/admin/commandes',
      { achat_groupe_id: ag.id, prix: 13500 }
    );
  }

  await wait();

  // Phase 3 : Coopérative accepte le prix → ouvert aux marchands
  if (ag) {
    log('🏛️', 'Coopérative', '✅ Accepte le prix de 13 500F — l\'achat est ouvert aux marchands');
    await supabase.from('achats_groupes').update({ statut: 'OPEN' }).eq('id', ag.id);

    socket.emit('prix-groupe-accepte', {
      achatGroupeId: ag.id,
      cooperativeId: U.cooperative.id,
      producerId: U.producteur.id,
      productName: 'Riz parfumé 25kg',
      price: 13500,
    });

    for (const m of [U.marchand1, U.marchand2]) {
      socket.emit('achat-groupe-cree', {
        achatGroupeId: ag.id,
        productName: 'Riz parfumé 25kg',
        price: 13500,
        targetQuantity: 80,
      });
      await notify(m.id,
        'Achat groupé ouvert',
        'Riz parfumé 25kg à 13 500F (au lieu de 18 000F). Rejoignez avant la date limite !',
        'achat_groupe', '/(tabs)/marche',
        { achat_groupe_id: ag.id, produit_nom: 'Riz parfumé 25kg', prix: 13500 }
      );
    }
    await notifyAdmin(
      'Prix accepté — achat groupé ouvert aux marchands',
      `La ${U.cooperative.full_name} accepte 13 500F/sac. L'achat groupé Riz parfumé 25kg est désormais ouvert aux marchands.`,
      'achat_groupe', '/admin/commandes',
      { achat_groupe_id: ag.id }
    );
    await logActivity(U.cooperative.id, U.cooperative.full_name, 'Prix groupé accepté → achat ouvert : Riz parfumé 25kg à 13 500 F/sac', 'achat_groupe');
  }

  await wait();

  // Phase 4 : Marchands rejoignent
  if (ag) {
    log('🏪', 'Marchand 1', `${U.marchand1.full_name} rejoint l'achat groupé (30 sacs)`);
    const { error: err_part1 } = await supabase.from('achats_groupes_participants').insert({
      achat_groupe_id: ag.id,
      marchand_id: U.marchand1.id,
      marchand_nom: U.marchand1.full_name,
      quantite: 30,
      date_inscription: new Date().toISOString(),
    });
    if (err_part1) console.log(`  ❌ INSERT achats_groupes_participants (m1): ${err_part1.message}${err_part1.hint ? ' — ' + err_part1.hint : ''}`);

    const { error: err_upd1 } = await supabase.from('achats_groupes').update({ quantite_actuelle: 30 }).eq('id', ag.id);
    if (err_upd1) console.log(`  ❌ UPDATE achats_groupes (quantite_actuelle 30): ${err_upd1.message}`);

    socket.emit('achat-groupe-rejoint', {
      achatGroupeId: ag.id,
      marchandId: U.marchand1.id,
      marchandName: U.marchand1.full_name,
      quantity: 30,
      currentTotal: 30,
      targetQuantity: 80,
    });

    await notifyAdmin(
      `${U.marchand1.full_name} rejoint l'achat groupé — 30 sacs`,
      `${U.marchand1.full_name} participe à l'achat groupé Riz parfumé 25kg avec 30 sacs. Total actuel : 30/80.`,
      'achat_groupe', '/admin/commandes',
      { achat_groupe_id: ag.id, marchand: U.marchand1.full_name, quantite: 30 }
    );
    await logActivity(U.marchand1.id, U.marchand1.full_name, 'Rejoint achat groupé : Riz parfumé 25kg × 30 sacs (économie 135 000 F)', 'achat_groupe');

    await wait(3000);

    log('🏪', 'Marchand 2', `${U.marchand2.full_name} rejoint l'achat groupé (25 sacs)`);
    const { error: err_part2 } = await supabase.from('achats_groupes_participants').insert({
      achat_groupe_id: ag.id,
      marchand_id: U.marchand2.id,
      marchand_nom: U.marchand2.full_name,
      quantite: 25,
      date_inscription: new Date().toISOString(),
    });
    if (err_part2) console.log(`  ❌ INSERT achats_groupes_participants (m2): ${err_part2.message}${err_part2.hint ? ' — ' + err_part2.hint : ''}`);

    const { error: err_upd2 } = await supabase.from('achats_groupes').update({ quantite_actuelle: 55 }).eq('id', ag.id);
    if (err_upd2) console.log(`  ❌ UPDATE achats_groupes (quantite_actuelle 55): ${err_upd2.message}`);

    socket.emit('achat-groupe-rejoint', {
      achatGroupeId: ag.id,
      marchandId: U.marchand2.id,
      marchandName: U.marchand2.full_name,
      quantity: 25,
      currentTotal: 55,
      targetQuantity: 80,
    });

    await notifyAdmin(
      `${U.marchand2.full_name} rejoint l'achat groupé — 25 sacs`,
      `${U.marchand2.full_name} participe à l'achat groupé Riz parfumé 25kg avec 25 sacs. Total actuel : 55/80.`,
      'achat_groupe', '/admin/commandes',
      { achat_groupe_id: ag.id, marchand: U.marchand2.full_name, quantite: 25 }
    );
    await logActivity(U.marchand2.id, U.marchand2.full_name, 'Rejoint achat groupé : Riz parfumé 25kg × 25 sacs (économie 112 500 F)', 'achat_groupe');
  }

  await wait();
  console.log('  ✅ Acte 6 terminé : 1 achat groupé négocié, 2 participants (55/80 sacs)\n');
}

// ══════════════════════════════════════════════════════════════
// ACTE 7 — SIGNALEMENT
// L'agent signale un membre non conforme
// ══════════════════════════════════════════════════════════════
async function acte7_signalement() {
  separator('ACTE 7 — SIGNALEMENT (l\'agent contrôle un marchand)');

  if (U.marchand3) {
    log('🕵️', 'Agent', `Contrôle la boutique de ${U.marchand3.full_name}...`);
    await wait(2000);
    log('🕵️', 'Agent', `⚠️ Signale ${U.marchand3.full_name} — produits périmés en vente`);

    // Colonnes réelles (app/agent/conformite.tsx) : reporter_id, member_name, problem_type, description, status
    const { error: err_rep } = await supabase.from('reports').insert({
      reporter_id: U.agent.id,
      member_name: U.marchand3.full_name,
      problem_type: 'NON_CONFORMITE',
      description: 'Produits périmés encore en vente. Conditions d\'hygiène insuffisantes. Étiquetage manquant sur 5 produits.',
      status: 'PENDING',
    });
    if (err_rep) console.log(`  ❌ INSERT reports: ${err_rep.message}${err_rep.hint ? ' — ' + err_rep.hint : ''}`);
    await logActivity(U.agent.id, U.agent.full_name, `Signalement : ${U.marchand3.full_name} — produits périmés, hygiène insuffisante`, 'signalement');

    socket.emit('signalement-conformite', {
      agentId: U.agent.id,
      agentName: U.agent.full_name,
      memberName: U.marchand3.full_name,
      reason: 'Produits périmés, hygiène insuffisante',
    });

    await notify(U.cooperative.id,
      'Nouveau signalement',
      `L'agent ${U.agent.full_name} signale ${U.marchand3.full_name} : produits périmés en vente.`,
      'signalement', '/cooperative/membres',
      { agent_nom: U.agent.full_name, membre_nom: U.marchand3.full_name, motif: 'Produits périmés' }
    );
    await notifyAdmin(
      `Agent signale ${U.marchand3.full_name} — produits périmés`,
      `L'agent ${U.agent.full_name} signale ${U.marchand3.full_name} : produits périmés en vente, conditions d'hygiène insuffisantes.`,
      'signalement', '/admin/signalements',
      { agent_nom: U.agent.full_name, membre_nom: U.marchand3.full_name }
    );
  } else {
    console.log('  ⚠️ Marchand 3 (0544556677) non trouvé — acte 7 ignoré');
  }

  await wait();
  console.log('  ✅ Acte 7 terminé : 1 signalement de non-conformité\n');
}

// ══════════════════════════════════════════════════════════════
// MAIN — Lance tout
// ══════════════════════════════════════════════════════════════
async function main() {
  console.log('\n  ╔═══════════════════════════════════════════════════════════╗');
  console.log('  ║                                                           ║');
  console.log('  ║   🎬  SIMULATION — ÉQUIPE VIRTUELLE DE TEST              ║');
  console.log('  ║                                                           ║');
  console.log('  ║   5 bots vont simuler des actions réalistes :            ║');
  console.log('  ║   🧑‍🌾 Producteur  🏪 2 Marchands  🕵️ Agent  🏛️ Coopérative ║');
  console.log('  ║                                                           ║');
  console.log('  ║   Toi → connecte-toi en ADMIN (0000/0000) et observe     ║');
  console.log(`  ║   Vitesse : ${DELAY}ms entre chaque action                   ║`);
  console.log('  ║                                                           ║');
  console.log('  ╚═══════════════════════════════════════════════════════════╝\n');

  await loadUsers();
  await loadStores();

  console.log('\n  ⏳ La simulation démarre dans 10 secondes...');
  console.log('  📱 Ouvre ton app en Admin MAINTENANT !\n');
  await wait(10000);

  await acte1_enrolement();
  const produits = await acte2_publication();
  const commandes = await acte3_commandes(produits);
  await acte4_livraison(commandes);
  await acte5_ventes();
  await acte6_achatGroupe(produits);
  await acte7_signalement();

  console.log('  ╔═══════════════════════════════════════════════════════════╗');
  console.log('  ║                                                           ║');
  console.log('  ║   ✅  SIMULATION TERMINÉE — 21 actions en 7 actes        ║');
  console.log('  ║                                                           ║');
  console.log('  ║   Résumé :                                               ║');
  console.log('  ║   • 2 enrôlements (1 validé ✓, 1 rejeté ✗)              ║');
  console.log('  ║   • 2 produits publiés sur le Marché Virtuel             ║');
  console.log('  ║   • 2 commandes B2B (1 acceptée+livrée, 1 annulée)      ║');
  console.log('  ║   • 5 ventes clients finaux                              ║');
  console.log('  ║   • 1 achat groupé (négocié + 2 participants)            ║');
  console.log('  ║   • 1 signalement non-conformité                         ║');
  console.log('  ║   • ~20 notifications admin envoyées                     ║');
  console.log('  ║                                                           ║');
  console.log('  ║   📱 Vérifie le dashboard Admin sur ton téléphone !      ║');
  console.log('  ║                                                           ║');
  console.log('  ╚═══════════════════════════════════════════════════════════╝\n');

  socket.disconnect();
  process.exit(0);
}

main().catch((err) => {
  console.error('\n❌ Erreur simulation:', err.message);
  socket.disconnect();
  process.exit(1);
});
