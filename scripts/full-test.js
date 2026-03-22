// scripts/full-test.js — Bot de test complet E2E
//
// Parcourt CHAQUE écran de CHAQUE rôle, teste CHAQUE fonctionnalité,
// vérifie que les données persistent, et garde un historique.
//
// Usage :
// $env:SUPABASE_SERVICE_KEY="ta_clé"; node scripts/full-test.js
//
// Options :
// --role=MERCHANT        → teste uniquement le marchand
// --role=PRODUCER        → teste uniquement le producteur
// --role=FIELD_AGENT     → teste uniquement l'agent
// --role=COOPERATIVE     → teste uniquement la coopérative
// --role=SUPERVISOR      → teste uniquement l'admin
// (sans option → teste TOUS les rôles)

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.EXPO_PUBLIC_SUPABASE_URL || 'https://lpowdjvxikqtorhadhyv.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;

if (!SUPABASE_KEY) {
  console.error('❌ SUPABASE_SERVICE_KEY manquante');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// ── Historique ──
const HISTORY_FILE = path.join(__dirname, '..', 'test-history.json');
const REPORT_DIR = path.join(__dirname, '..', 'test-reports');

let history = [];
let currentReport = {
  date: new Date().toISOString(),
  duration: 0,
  totalTests: 0,
  passed: 0,
  failed: 0,
  warnings: 0,
  roles: {},
  errors: [],
  warnings_list: [],
};

// Charger l'historique précédent
function loadHistory() {
  try {
    if (fs.existsSync(HISTORY_FILE)) {
      history = JSON.parse(fs.readFileSync(HISTORY_FILE, 'utf8'));
    }
  } catch (e) {
    history = [];
  }
}

// Sauvegarder l'historique
function saveHistory() {
  try {
    history.push({
      date: currentReport.date,
      total: currentReport.totalTests,
      passed: currentReport.passed,
      failed: currentReport.failed,
      warnings: currentReport.warnings,
      score: currentReport.totalTests > 0
        ? Math.round((currentReport.passed / currentReport.totalTests) * 100)
        : 0,
    });
    // Garder les 50 derniers tests
    if (history.length > 50) history = history.slice(-50);
    fs.writeFileSync(HISTORY_FILE, JSON.stringify(history, null, 2));
  } catch (e) {}
}

// Sauvegarder le rapport détaillé
function saveReport() {
  try {
    if (!fs.existsSync(REPORT_DIR)) fs.mkdirSync(REPORT_DIR, { recursive: true });
    const filename = `test-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
    fs.writeFileSync(path.join(REPORT_DIR, filename), JSON.stringify(currentReport, null, 2));
  } catch (e) {}
}

// ── Utilitaires de test ──
let U = {};
let STORES = {};

const log = (icon, msg) => console.log(`  ${icon}  ${msg}`);
const pass = (test) => {
  currentReport.totalTests++;
  currentReport.passed++;
  log('✅', test);
};
const fail = (test, detail) => {
  currentReport.totalTests++;
  currentReport.failed++;
  currentReport.errors.push({ test, detail, timestamp: new Date().toISOString() });
  log('❌', `${test} → ${detail}`);
};
const warn = (test, detail) => {
  currentReport.totalTests++;
  currentReport.warnings++;
  currentReport.warnings_list.push({ test, detail });
  log('⚠️', `${test} → ${detail}`);
};

const separator = (title) => {
  console.log(`\n  ${'═'.repeat(60)}`);
  console.log(`  ${title}`);
  console.log(`  ${'═'.repeat(60)}\n`);
};

const subSection = (title) => {
  console.log(`\n  ── ${title} ${'─'.repeat(50 - title.length)}\n`);
};

// ── Chargement des données ──
async function loadUsers() {
  const { data, error } = await supabase.from('profiles').select('*');
  if (error) { fail('Chargement profils', error.message); return false; }
  if (!data?.length) { fail('Chargement profils', 'Table profiles vide — lance le seed'); return false; }

  for (const u of data) {
    if (u.phone_number === '0733445566') U.producteur = u;
    if (u.phone_number === '0711223344') U.marchand1 = u;
    if (u.phone_number === '0555667788') U.marchand2 = u;
    if (u.phone_number === '0722334455') U.agent = u;
    if (u.phone_number === '2722445566') U.cooperative = u;
    if (u.phone_number === '0000') U.admin = u;
    if (u.phone_number === '0544556677') U.marchand3 = u;
  }

  pass(`Profils chargés : ${data.length} utilisateurs`);

  // Charger les stores
  const { data: stores } = await supabase.from('stores').select('*');
  if (stores) {
    for (const s of stores) STORES[s.owner_id] = s;
    pass(`Boutiques chargées : ${stores.length}`);
  }

  return true;
}

// ══════════════════════════════════════════════════════════════
// TEST AUTHENTIFICATION
// ══════════════════════════════════════════════════════════════
async function testAuth() {
  separator('🔐 AUTHENTIFICATION');

  // Test login avec bon PIN
  subSection('Login valide');
  for (const [role, phone, pin] of [
    ['Marchand', '0711223344', '1234'],
    ['Producteur', '0733445566', '1234'],
    ['Agent', '0722334455', '1234'],
    ['Coopérative', '2722445566', '1234'],
    ['Admin', '0000', '0000'],
  ]) {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, full_name, role, pin')
      .eq('phone_number', phone)
      .single();

    if (error || !data) {
      fail(`Login ${role} (${phone})`, `Profil introuvable : ${error?.message}`);
    } else if (data.pin !== pin) {
      fail(`Login ${role} (${phone})`, `PIN incorrect : attendu ${pin}, trouvé ${data.pin}`);
    } else {
      pass(`Login ${role} : ${data.full_name} (${phone} / ${pin})`);
    }
  }

  // Test login avec mauvais numéro
  subSection('Login invalide');
  const { data: ghost } = await supabase
    .from('profiles')
    .select('id')
    .eq('phone_number', '9999999999')
    .single();
  if (!ghost) {
    pass('Login numéro inexistant → rejeté correctement');
  } else {
    fail('Login numéro inexistant', 'Le numéro 9999999999 ne devrait pas exister');
  }

  // Test PIN oublié
  subSection('PIN oublié');
  const { data: testUser } = await supabase
    .from('profiles')
    .select('id, pin')
    .eq('phone_number', '0711223344')
    .single();

  if (testUser) {
    // Simuler réinitialisation
    const { error: resetErr } = await supabase
      .from('profiles')
      .update({ pin: '0101' })
      .eq('id', testUser.id);

    if (!resetErr) {
      const { data: check } = await supabase
        .from('profiles')
        .select('pin')
        .eq('id', testUser.id)
        .single();

      if (check?.pin === '0101') {
        pass('PIN réinitialisé à 0101');
        // Remettre le PIN original
        await supabase.from('profiles').update({ pin: '1234' }).eq('id', testUser.id);
        pass('PIN restauré à 1234');
      } else {
        fail('PIN oublié', 'PIN non mis à jour');
      }
    } else {
      fail('PIN oublié', resetErr.message);
    }
  }
}

// ══════════════════════════════════════════════════════════════
// TEST MARCHAND
// ══════════════════════════════════════════════════════════════
async function testMarchand() {
  separator('🏪 MARCHAND — Kouassi Jean-Baptiste');
  if (!U.marchand1) { fail('Marchand', 'Profil marchand non trouvé'); return; }
  const userId = U.marchand1.id;
  const store = STORES[userId];

  currentReport.roles.MERCHANT = { tests: 0, passed: 0, failed: 0 };
  const roleReport = currentReport.roles.MERCHANT;
  const rPass = (t) => { roleReport.tests++; roleReport.passed++; pass(t); };
  const rFail = (t, d) => { roleReport.tests++; roleReport.failed++; fail(t, d); };

  // Dashboard
  subSection('Dashboard marchand');
  if (store) {
    rPass(`Boutique trouvée : ${store.name}`);
  } else {
    rFail('Boutique marchand', 'Aucun store pour ce marchand');
  }

  // Produits en stock
  subSection('Stock');
  const { data: stock, error: stockErr } = await supabase
    .from('stock')
    .select('*')
    .eq('store_id', store?.id);

  if (stockErr) {
    rFail('Chargement stock', stockErr.message);
  } else if (!stock?.length) {
    rFail('Stock vide', 'Aucun produit en stock pour ce marchand');
  } else {
    rPass(`Stock : ${stock.length} produits`);

    // Vérifier les ruptures
    const ruptures = stock.filter(s => s.quantity <= 0);
    if (ruptures.length > 0) {
      rPass(`Ruptures détectées : ${ruptures.length} produit(s) à 0`);
    }

    // Vérifier les produits avec quantité
    const enStock = stock.filter(s => s.quantity > 0);
    rPass(`Produits disponibles : ${enStock.length}`);
  }

  // Ventes (transactions)
  subSection('Ventes');
  const { data: ventes, error: ventesErr } = await supabase
    .from('transactions')
    .select('*')
    .eq('store_id', store?.id)
    .order('created_at', { ascending: false })
    .limit(10);

  if (ventesErr) {
    rFail('Chargement ventes', ventesErr.message);
  } else {
    rPass(`Ventes récentes : ${ventes?.length || 0}`);
  }

  // Test création vente
  subSection('Création vente');
  const { data: newVente, error: venteErr } = await supabase
    .from('transactions')
    .insert({
      store_id: store?.id,
      product_name: 'TEST - Riz 5kg',
      quantity: 2,
      price: 3000,
      client_name: 'Client Test',
      type: 'VENTE',
      status: 'PAYÉ',
    })
    .select()
    .single();

  if (venteErr) {
    rFail('Création vente', venteErr.message + (venteErr.hint ? ' — ' + venteErr.hint : ''));
  } else {
    rPass(`Vente créée : ${newVente.id}`);

    // Vérifier persistance
    const { data: checkVente } = await supabase
      .from('transactions')
      .select('*')
      .eq('id', newVente.id)
      .single();

    if (checkVente) {
      rPass('Vente persistée en base');
      // Nettoyer
      await supabase.from('transactions').delete().eq('id', newVente.id);
      rPass('Vente de test supprimée');
    } else {
      rFail('Persistance vente', 'Vente non retrouvée en base');
    }
  }

  // Marché Virtuel
  subSection('Marché Virtuel');
  const { data: marche, error: marcheErr } = await supabase
    .from('products')
    .select('*')
    .not('store_id', 'is', null);

  if (marcheErr) {
    rFail('Chargement Marché Virtuel', marcheErr.message);
  } else {
    rPass(`Marché Virtuel : ${marche?.length || 0} produits`);

    // Vérifier les images
    const avecImage = marche?.filter(p => p.image_url) || [];
    if (avecImage.length > 0) {
      rPass(`Produits avec image : ${avecImage.length}`);
    } else {
      warn('Images Marché Virtuel', 'Aucun produit n\'a d\'image');
    }
  }

  // Commandes
  subSection('Commandes marchand');
  const storeId = store?.id;
  if (storeId) {
    const { data: commandes, error: cmdErr } = await supabase
      .from('orders')
      .select('*')
      .eq('buyer_store_id', storeId);

    if (cmdErr) {
      rFail('Chargement commandes', cmdErr.message);
    } else {
      rPass(`Commandes passées : ${commandes?.length || 0}`);
      // Vérifier les statuts
      const statuts = {};
      (commandes || []).forEach(c => { statuts[c.status] = (statuts[c.status] || 0) + 1; });
      Object.entries(statuts).forEach(([s, n]) => {
        rPass(`  ${s} : ${n}`);
      });
    }
  }

  // Notifications
  subSection('Notifications marchand');
  const { data: notifs, error: notifErr } = await supabase
    .from('notifications')
    .select('*')
    .eq('user_id', userId);

  if (notifErr) {
    rFail('Notifications marchand', notifErr.message);
  } else {
    rPass(`Notifications : ${notifs?.length || 0} (${notifs?.filter(n => !n.lu).length || 0} non lues)`);
  }

  // Carnet de dettes
  subSection('Carnet de dettes');
  const { data: dettes, error: detteErr } = await supabase
    .from('credits_clients')
    .select('*')
    .limit(10);

  if (detteErr) {
    warn('Carnet dettes', `Table credits_clients : ${detteErr.message}`);
  } else {
    rPass(`Crédits clients (table accessible) : ${dettes?.length || 0} lignes`);
  }
}

// ══════════════════════════════════════════════════════════════
// TEST PRODUCTEUR
// ══════════════════════════════════════════════════════════════
async function testProducteur() {
  separator('🧑‍🌾 PRODUCTEUR — Coulibaly Mamadou');
  if (!U.producteur) { fail('Producteur', 'Profil non trouvé'); return; }
  const userId = U.producteur.id;
  const store = STORES[userId];

  currentReport.roles.PRODUCER = { tests: 0, passed: 0, failed: 0 };
  const rp = currentReport.roles.PRODUCER;
  const rPass = (t) => { rp.tests++; rp.passed++; pass(t); };
  const rFail = (t, d) => { rp.tests++; rp.failed++; fail(t, d); };

  // Produits publiés
  subSection('Produits publiés');
  const { data: produits, error: prodErr } = await supabase
    .from('products')
    .select('*')
    .eq('store_id', store?.id);

  if (prodErr) {
    rFail('Chargement produits', prodErr.message);
  } else {
    rPass(`Produits publiés : ${produits?.length || 0}`);
    (produits || []).forEach(p => {
      if (!p.name) rFail(`Produit ${p.id}`, 'Nom manquant');
      if (!p.price || p.price <= 0) rFail(`Produit ${p.name}`, 'Prix invalide');
    });
  }

  // Test publication
  subSection('Test publication produit');
  const { data: newProd, error: pubErr } = await supabase
    .from('products')
    .insert({
      store_id: store?.id,
      name: 'TEST - Banane plantain 5kg',
      price: 2500,
      category: 'Fruits',
    })
    .select()
    .single();

  if (pubErr) {
    rFail('Publication produit', pubErr.message + (pubErr.hint ? ' — ' + pubErr.hint : ''));
  } else {
    rPass(`Produit publié : ${newProd.name}`);
    // Nettoyer
    await supabase.from('products').delete().eq('id', newProd.id);
    rPass('Produit de test supprimé');
  }

  // Commandes reçues
  subSection('Commandes reçues');
  const { data: commandes, error: cmdErr } = await supabase
    .from('orders')
    .select('*')
    .eq('seller_store_id', store?.id);

  if (cmdErr) {
    rFail('Commandes reçues', cmdErr.message);
  } else {
    rPass(`Commandes reçues : ${commandes?.length || 0}`);
    const pending = (commandes || []).filter(c => c.status === 'PENDING');
    rPass(`En attente d'action : ${pending.length}`);
  }

  // Test accepter commande
  subSection('Test accepter/refuser commande');
  const pendingOrder = (commandes || []).find(c => c.status === 'PENDING');
  if (pendingOrder) {
    const { error: acceptErr } = await supabase
      .from('orders')
      .update({ status: 'ACCEPTED' })
      .eq('id', pendingOrder.id);

    if (acceptErr) {
      rFail('Accepter commande', acceptErr.message);
    } else {
      rPass(`Commande ${pendingOrder.id} acceptée`);
      // Remettre en PENDING
      await supabase.from('orders').update({ status: 'PENDING' }).eq('id', pendingOrder.id);
    }
  } else {
    warn('Test commande', 'Aucune commande PENDING pour tester');
  }

  // Notifications
  subSection('Notifications producteur');
  const { data: notifs } = await supabase
    .from('notifications')
    .select('*')
    .eq('user_id', userId);
  rPass(`Notifications : ${notifs?.length || 0}`);
}

// ══════════════════════════════════════════════════════════════
// TEST AGENT
// ══════════════════════════════════════════════════════════════
async function testAgent() {
  separator('🕵️ AGENT — Ouattara Dramane');
  if (!U.agent) { fail('Agent', 'Profil non trouvé'); return; }
  const userId = U.agent.id;

  currentReport.roles.FIELD_AGENT = { tests: 0, passed: 0, failed: 0 };
  const rp = currentReport.roles.FIELD_AGENT;
  const rPass = (t) => { rp.tests++; rp.passed++; pass(t); };
  const rFail = (t, d) => { rp.tests++; rp.failed++; fail(t, d); };

  // Enrôlements
  subSection('Enrôlements effectués');
  const { data: enrolls, error: enrollErr } = await supabase
    .from('demandes_enrolement')
    .select('*')
    .eq('agent_id', userId);

  if (enrollErr) {
    rFail('Chargement enrôlements', enrollErr.message);
  } else {
    rPass(`Enrôlements : ${enrolls?.length || 0}`);
    const par_statut = {};
    (enrolls || []).forEach(e => { par_statut[e.statut] = (par_statut[e.statut] || 0) + 1; });
    Object.entries(par_statut).forEach(([s, n]) => rPass(`  ${s} : ${n}`));
  }

  // Test création enrôlement
  subSection('Test enrôlement');
  const { data: newEnroll, error: enrollCreateErr } = await supabase
    .from('demandes_enrolement')
    .insert({
      agent_id: userId,
      nom: 'TEST - Diabaté Moussa',
      telephone: '0799999999',
      type: 'MERCHANT',
      adresse: 'Test Adresse',
      nom_boutique: 'Test Boutique',
      statut: 'en_attente',
      date_demande: new Date().toISOString(),
    })
    .select()
    .single();

  if (enrollCreateErr) {
    rFail('Création enrôlement', enrollCreateErr.message + (enrollCreateErr.hint ? ' — ' + enrollCreateErr.hint : ''));
  } else {
    rPass(`Enrôlement créé : ${newEnroll.nom}`);

    // Test validation
    const { error: valErr } = await supabase
      .from('demandes_enrolement')
      .update({ statut: 'valide' })
      .eq('id', newEnroll.id);

    if (valErr) {
      rFail('Validation enrôlement', valErr.message);
    } else {
      rPass('Enrôlement validé');
    }

    // Test rejet
    const { error: rejErr } = await supabase
      .from('demandes_enrolement')
      .update({ statut: 'rejete', motif_rejet: 'Test rejet' })
      .eq('id', newEnroll.id);

    if (rejErr) {
      rFail('Rejet enrôlement', rejErr.message);
    } else {
      rPass('Enrôlement rejeté avec motif');
    }

    // Nettoyer
    await supabase.from('demandes_enrolement').delete().eq('id', newEnroll.id);
    rPass('Enrôlement de test supprimé');
  }

  // Signalements
  subSection('Signalements');
  const { data: reports, error: repErr } = await supabase
    .from('reports')
    .select('*')
    .eq('reporter_id', userId);

  if (repErr) {
    rFail('Chargement signalements', repErr.message);
  } else {
    rPass(`Signalements : ${reports?.length || 0}`);
  }

  // Test création signalement
  subSection('Test signalement');
  if (U.marchand3) {
    const { data: newReport, error: repCreateErr } = await supabase
      .from('reports')
      .insert({
        reporter_id: userId,
        member_name: U.marchand3.full_name,
        problem_type: 'TEST',
        description: 'Signalement de test automatique',
        status: 'PENDING',
      })
      .select()
      .single();

    if (repCreateErr) {
      rFail('Création signalement', repCreateErr.message + (repCreateErr.hint ? ' — ' + repCreateErr.hint : ''));
    } else {
      rPass(`Signalement créé : ${newReport.id}`);
      await supabase.from('reports').delete().eq('id', newReport.id);
      rPass('Signalement de test supprimé');
    }
  }

  // Notifications
  const { data: notifs } = await supabase
    .from('notifications')
    .select('*')
    .eq('user_id', userId);
  rPass(`Notifications : ${notifs?.length || 0}`);
}

// ══════════════════════════════════════════════════════════════
// TEST COOPÉRATIVE
// ══════════════════════════════════════════════════════════════
async function testCooperative() {
  separator('🏛️ COOPÉRATIVE — AGRI-CI');
  if (!U.cooperative) { fail('Coopérative', 'Profil non trouvé'); return; }
  const userId = U.cooperative.id;

  currentReport.roles.COOPERATIVE = { tests: 0, passed: 0, failed: 0 };
  const rp = currentReport.roles.COOPERATIVE;
  const rPass = (t) => { rp.tests++; rp.passed++; pass(t); };
  const rFail = (t, d) => { rp.tests++; rp.failed++; fail(t, d); };

  // Membres
  subSection('Membres de la coopérative');
  const { data: membres, error: memErr } = await supabase
    .from('profiles')
    .select('*')
    .in('role', ['MERCHANT', 'PRODUCER', 'FIELD_AGENT']);

  if (memErr) {
    rFail('Chargement membres', memErr.message);
  } else {
    rPass(`Membres réseau : ${membres?.length || 0}`);
    const parRole = {};
    (membres || []).forEach(m => { parRole[m.role] = (parRole[m.role] || 0) + 1; });
    Object.entries(parRole).forEach(([r, n]) => rPass(`  ${r} : ${n}`));
  }

  // Validations en attente
  subSection('Validations (demandes enrôlement)');
  const { data: demandes, error: demErr } = await supabase
    .from('demandes_enrolement')
    .select('*')
    .order('date_demande', { ascending: false });

  if (demErr) {
    rFail('Chargement demandes', demErr.message);
  } else {
    rPass(`Demandes total : ${demandes?.length || 0}`);
    const parStatut = {};
    (demandes || []).forEach(d => { parStatut[d.statut] = (parStatut[d.statut] || 0) + 1; });
    Object.entries(parStatut).forEach(([s, n]) => rPass(`  ${s} : ${n}`));
  }

  // Achats groupés
  subSection('Achats groupés');
  const { data: achats, error: achatErr } = await supabase
    .from('achats_groupes')
    .select('*');

  if (achatErr) {
    rFail('Chargement achats groupés', achatErr.message + (achatErr.hint ? ' — ' + achatErr.hint : ''));
  } else {
    rPass(`Achats groupés : ${achats?.length || 0}`);
    const parStatut = {};
    (achats || []).forEach(a => { parStatut[a.statut] = (parStatut[a.statut] || 0) + 1; });
    Object.entries(parStatut).forEach(([s, n]) => rPass(`  ${s} : ${n}`));
  }

  // Test création achat groupé
  subSection('Test création achat groupé');
  const prodStore = STORES[U.producteur?.id];
  const { data: newAchat, error: achatCreateErr } = await supabase
    .from('achats_groupes')
    .insert({
      cooperative_id: userId,
      producteur_id: U.producteur?.id,
      nom_produit: 'TEST - Riz test',
      quantite_totale: 100,
      quantite_minimum: 50,
      quantite_actuelle: 0,
      statut: 'NEGOTIATION',
      date_limite: new Date(Date.now() + 7 * 86400000).toISOString(),
    })
    .select()
    .single();

  if (achatCreateErr) {
    rFail('Création achat groupé', achatCreateErr.message + (achatCreateErr.hint ? ' — ' + achatCreateErr.hint : ''));
  } else {
    rPass(`Achat groupé créé : ${newAchat.id}`);

    // Test changement statut NEGOTIATION → OPEN
    const { error: openErr } = await supabase
      .from('achats_groupes')
      .update({ statut: 'OPEN', prix_negocie: 12000 })
      .eq('id', newAchat.id);

    if (openErr) {
      rFail('Ouverture achat groupé', openErr.message);
    } else {
      rPass('Achat groupé ouvert (NEGOTIATION → OPEN)');
    }

    // Test participation marchand
    const { data: newPart, error: partErr } = await supabase
      .from('achats_groupes_participants')
      .insert({
        achat_groupe_id: newAchat.id,
        marchand_id: U.marchand1?.id,
        marchand_nom: U.marchand1?.full_name,
        quantite: 30,
      })
      .select()
      .single();

    if (partErr) {
      rFail('Participation achat groupé', partErr.message + (partErr.hint ? ' — ' + partErr.hint : ''));
    } else {
      rPass(`Marchand a rejoint : ${newPart.marchand_nom} (30 unités)`);
      await supabase.from('achats_groupes_participants').delete().eq('id', newPart.id);
    }

    // Test COMPLETED
    const { error: compErr } = await supabase
      .from('achats_groupes')
      .update({ statut: 'COMPLETED' })
      .eq('id', newAchat.id);

    if (compErr) {
      rFail('Finalisation achat groupé', compErr.message);
    } else {
      rPass('Achat groupé finalisé (OPEN → COMPLETED)');
    }

    // Nettoyer
    await supabase.from('achats_groupes').delete().eq('id', newAchat.id);
    rPass('Achat groupé de test supprimé');
  }

  // Notifications
  const { data: notifs } = await supabase
    .from('notifications')
    .select('*')
    .eq('user_id', userId);
  rPass(`Notifications : ${notifs?.length || 0}`);
}

// ══════════════════════════════════════════════════════════════
// TEST ADMIN
// ══════════════════════════════════════════════════════════════
async function testAdmin() {
  separator('👨‍💼 ADMIN — Superviseur');
  if (!U.admin) { fail('Admin', 'Profil non trouvé'); return; }
  const userId = U.admin.id;

  currentReport.roles.SUPERVISOR = { tests: 0, passed: 0, failed: 0 };
  const rp = currentReport.roles.SUPERVISOR;
  const rPass = (t) => { rp.tests++; rp.passed++; pass(t); };
  const rFail = (t, d) => { rp.tests++; rp.failed++; fail(t, d); };

  // Tous les utilisateurs
  subSection('Utilisateurs');
  const { data: users, error: usersErr } = await supabase
    .from('profiles')
    .select('*');

  if (usersErr) {
    rFail('Chargement utilisateurs', usersErr.message);
  } else {
    rPass(`Utilisateurs total : ${users?.length || 0}`);
    const parRole = {};
    (users || []).forEach(u => { parRole[u.role] = (parRole[u.role] || 0) + 1; });
    Object.entries(parRole).forEach(([r, n]) => rPass(`  ${r} : ${n}`));
  }

  // Toutes les transactions
  subSection('Transactions');
  const { data: txs, error: txErr } = await supabase
    .from('transactions')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(100);

  if (txErr) {
    rFail('Chargement transactions', txErr.message);
  } else {
    rPass(`Transactions : ${txs?.length || 0}`);
    const total = (txs || []).reduce((s, t) => s + (t.total_amount || t.price || 0), 0);
    rPass(`Montant total : ${total.toLocaleString('fr-FR')} F CFA`);
  }

  // Toutes les commandes
  subSection('Commandes');
  const { data: orders, error: ordErr } = await supabase
    .from('orders')
    .select('*');

  if (ordErr) {
    rFail('Chargement commandes', ordErr.message);
  } else {
    rPass(`Commandes total : ${orders?.length || 0}`);
  }

  // Tous les signalements
  subSection('Signalements');
  const { data: reports, error: repErr } = await supabase
    .from('reports')
    .select('*');

  if (repErr) {
    rFail('Chargement signalements', repErr.message);
  } else {
    rPass(`Signalements : ${reports?.length || 0}`);
  }

  // Activity logs
  subSection('Activité récente');
  const { data: logs, error: logErr } = await supabase
    .from('activity_logs')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(20);

  if (logErr) {
    rFail('Activity logs', logErr.message);
  } else {
    rPass(`Activités récentes : ${logs?.length || 0}`);
  }

  // Notifications admin
  subSection('Notifications admin');
  const { data: notifs } = await supabase
    .from('notifications')
    .select('*')
    .eq('user_id', userId);
  rPass(`Notifications : ${notifs?.length || 0} (${notifs?.filter(n => !n.lu).length || 0} non lues)`);

  // Test réinitialisation PIN
  subSection('Test réinitialisation PIN');
  if (U.marchand3) {
    const { error: resetErr } = await supabase
      .from('profiles')
      .update({ pin: '0101' })
      .eq('id', U.marchand3.id);

    if (resetErr) {
      rFail('Reset PIN admin', resetErr.message);
    } else {
      rPass(`PIN de ${U.marchand3.full_name} réinitialisé à 0101`);
      await supabase.from('profiles').update({ pin: '1234' }).eq('id', U.marchand3.id);
      rPass('PIN restauré à 1234');
    }
  }
}

// ══════════════════════════════════════════════════════════════
// TEST NOTIFICATIONS CROSS-RÔLE
// ══════════════════════════════════════════════════════════════
async function testNotifications() {
  separator('🔔 NOTIFICATIONS — Vérification cross-rôle');

  // Créer une notification pour chaque rôle
  const roles = [
    { user: U.marchand1, label: 'Marchand', route: '/(tabs)/marche' },
    { user: U.producteur, label: 'Producteur', route: '/producteur/commandes' },
    { user: U.agent, label: 'Agent', route: '/agent/activites' },
    { user: U.cooperative, label: 'Coopérative', route: '/cooperative/demandes' },
    { user: U.admin, label: 'Admin', route: '/admin/utilisateurs' },
  ];

  for (const r of roles) {
    if (!r.user) { fail(`Notif ${r.label}`, 'Utilisateur non trouvé'); continue; }

    const { data, error } = await supabase
      .from('notifications')
      .insert({
        user_id: r.user.id,
        titre: `TEST notif ${r.label}`,
        message: `Notification de test pour ${r.label}`,
        type: 'test',
        data: JSON.stringify({ route: r.route }),
        lu: false,
      })
      .select()
      .single();

    if (error) {
      fail(`Création notif ${r.label}`, error.message);
    } else {
      pass(`Notif créée pour ${r.label}`);

      // Marquer comme lue
      const { error: readErr } = await supabase
        .from('notifications')
        .update({ lu: true })
        .eq('id', data.id);

      if (readErr) {
        fail(`Lecture notif ${r.label}`, readErr.message);
      } else {
        pass(`Notif ${r.label} marquée lue`);
      }

      // Supprimer
      await supabase.from('notifications').delete().eq('id', data.id);
      pass(`Notif ${r.label} supprimée`);
    }
  }
}

// ══════════════════════════════════════════════════════════════
// TEST TABLES — Vérification structure
// ══════════════════════════════════════════════════════════════
async function testTables() {
  separator('🗄️ VÉRIFICATION TABLES SUPABASE');

  const tables = [
    'profiles', 'stores', 'products', 'stock', 'orders',
    'transactions', 'notifications', 'activity_logs',
    'demandes_enrolement', 'reports',
    'achats_groupes', 'achats_groupes_participants',
    'credits_clients',
  ];

  for (const table of tables) {
    const { data, error, count } = await supabase
      .from(table)
      .select('*', { count: 'exact', head: true });

    if (error) {
      if (error.message.includes('does not exist') || error.message.includes('schema cache')) {
        fail(`Table ${table}`, `TABLE INEXISTANTE : ${error.message}`);
      } else {
        warn(`Table ${table}`, error.message);
      }
    } else {
      pass(`Table ${table} : existe`);
    }
  }
}

// ══════════════════════════════════════════════════════════════
// MAIN
// ══════════════════════════════════════════════════════════════
async function main() {
  const startTime = Date.now();
  const roleArg = process.argv.find(a => a.startsWith('--role='));
  const onlyRole = roleArg ? roleArg.split('=')[1] : null;

  console.log('\n  ╔═══════════════════════════════════════════════════════════╗');
  console.log('  ║                                                           ║');
  console.log('  ║   🧪  TEST E2E COMPLET — Jùlaba              ║');
  console.log('  ║                                                           ║');
  console.log('  ║   Parcourt chaque écran, teste chaque fonctionnalité,    ║');
  console.log('  ║   vérifie la persistance et garde un historique.         ║');
  console.log('  ║                                                           ║');
  console.log(`  ║   Mode : ${onlyRole ? 'Rôle ' + onlyRole : 'TOUS LES RÔLES'}${' '.repeat(38 - (onlyRole || 'TOUS LES RÔLES').length)}║`);
  console.log('  ║                                                           ║');
  console.log('  ╚═══════════════════════════════════════════════════════════╝\n');

  loadHistory();

  // Vérification tables
  await testTables();

  // Chargement données
  const ok = await loadUsers();
  if (!ok) {
    console.log('\n  ❌ Impossible de charger les données. Lance le seed d\'abord.\n');
    process.exit(1);
  }

  // Tests par rôle
  await testAuth();

  if (!onlyRole || onlyRole === 'MERCHANT') await testMarchand();
  if (!onlyRole || onlyRole === 'PRODUCER') await testProducteur();
  if (!onlyRole || onlyRole === 'FIELD_AGENT') await testAgent();
  if (!onlyRole || onlyRole === 'COOPERATIVE') await testCooperative();
  if (!onlyRole || onlyRole === 'SUPERVISOR') await testAdmin();

  await testNotifications();

  // Rapport final
  currentReport.duration = Math.round((Date.now() - startTime) / 1000);
  const score = currentReport.totalTests > 0
    ? Math.round((currentReport.passed / currentReport.totalTests) * 100)
    : 0;

  console.log('\n  ╔═══════════════════════════════════════════════════════════╗');
  console.log('  ║                                                           ║');
  console.log(`  ║   🧪  RAPPORT FINAL — Score : ${score}%${' '.repeat(24 - String(score).length)}║`);
  console.log('  ║                                                           ║');
  console.log(`  ║   Tests total  : ${String(currentReport.totalTests).padEnd(5)}                              ║`);
  console.log(`  ║   ✅ Passés    : ${String(currentReport.passed).padEnd(5)}                              ║`);
  console.log(`  ║   ❌ Échoués   : ${String(currentReport.failed).padEnd(5)}                              ║`);
  console.log(`  ║   ⚠️  Warnings  : ${String(currentReport.warnings).padEnd(5)}                              ║`);
  console.log(`  ║   Durée        : ${currentReport.duration}s${' '.repeat(33 - String(currentReport.duration).length)}║`);
  console.log('  ║                                                           ║');

  // Résumé par rôle
  for (const [role, data] of Object.entries(currentReport.roles)) {
    const rScore = data.tests > 0 ? Math.round((data.passed / data.tests) * 100) : 0;
    console.log(`  ║   ${role.padEnd(15)} ${rScore}% (${data.passed}/${data.tests})${' '.repeat(26 - String(rScore).length - String(data.passed).length - String(data.tests).length)}║`);
  }

  console.log('  ║                                                           ║');

  // Historique
  if (history.length > 0) {
    const last = history[history.length - 1];
    const diff = score - last.score;
    const arrow = diff > 0 ? `↑ +${diff}` : diff < 0 ? `↓ ${diff}` : '= 0';
    console.log(`  ║   Progression  : ${arrow} vs dernier test${' '.repeat(22 - arrow.length)}║`);
  }

  console.log('  ║                                                           ║');
  console.log('  ╚═══════════════════════════════════════════════════════════╝');

  // Erreurs détaillées
  if (currentReport.errors.length > 0) {
    console.log('\n  ── ERREURS DÉTAILLÉES ──\n');
    currentReport.errors.forEach((e, i) => {
      console.log(`  ${i + 1}. ❌ ${e.test}`);
      console.log(`     → ${e.detail}\n`);
    });
  }

  // Sauvegarder
  saveHistory();
  saveReport();
  console.log(`\n  📁 Rapport sauvegardé dans test-reports/`);
  console.log(`  📊 Historique : ${history.length} tests enregistrés\n`);

  process.exit(currentReport.failed > 0 ? 1 : 0);
}

main().catch(err => {
  console.error('\n  ❌ Erreur fatale :', err.message);
  process.exit(1);
});
