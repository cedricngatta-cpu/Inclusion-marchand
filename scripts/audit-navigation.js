#!/usr/bin/env node
/**
 * audit-navigation.js — Audit de conformité navigation expo-router
 * Zéro dépendance externe (fs + path uniquement)
 * Usage : node scripts/audit-navigation.js
 */

const fs   = require('fs');
const path = require('path');

// ─── CONFIG ───────────────────────────────────────────────────────────────────
const ROOT    = path.join(__dirname, '..');
const APP_DIR = path.join(ROOT, 'app');
const SRC_DIR = path.join(ROOT, 'src');

// ─── COULEURS CONSOLE ─────────────────────────────────────────────────────────
const R   = '\x1b[31m';
const Y   = '\x1b[33m';
const G   = '\x1b[32m';
const B   = '\x1b[36m';
const DIM = '\x1b[2m';
const RST = '\x1b[0m';
const BOLD= '\x1b[1m';

function red(s)    { return `${R}${s}${RST}`; }
function yellow(s) { return `${Y}${s}${RST}`; }
function green(s)  { return `${G}${s}${RST}`; }
function cyan(s)   { return `${B}${s}${RST}`; }
function bold(s)   { return `${BOLD}${s}${RST}`; }
function dim(s)    { return `${DIM}${s}${RST}`; }

// ─── UTILITAIRES ──────────────────────────────────────────────────────────────
function readFile(p) {
  try { return fs.readFileSync(p, 'utf-8'); }
  catch { return ''; }
}

function relPath(p) {
  return p.replace(ROOT + path.sep, '').replace(/\\/g, '/');
}

function collectFiles(dir, exts = ['.tsx', '.ts', '.js']) {
  const results = [];
  if (!fs.existsSync(dir)) return results;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) results.push(...collectFiles(full, exts));
    else if (exts.some(ext => e.name.endsWith(ext))) results.push(full);
  }
  return results;
}

// ─── ÉTAPE 1 : CARTOGRAPHIER LES ROUTES ──────────────────────────────────────
/**
 * expo-router dérive les routes depuis la structure de fichiers de app/.
 * Règles :
 *  - app/index.tsx          → /
 *  - app/(tabs)/foo.tsx     → /(tabs)/foo
 *  - app/(tabs)/_layout.tsx → layout (pas une route)
 *  - app/admin/bar.tsx      → /admin/bar
 *  - app/+not-found.tsx     → (route spéciale expo-router, pas navigable)
 */
function buildRouteMap() {
  const routes = {}; // normalizedRoute → filePath

  function walk(dir, prefix) {
    if (!fs.existsSync(dir)) return;
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const e of entries) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) {
        // Les groupes de route (parenthèses) gardent le même préfixe visible
        // ex: (tabs) → pas de segment dans la route
        const segName  = e.name;
        const isGroup  = segName.startsWith('(') && segName.endsWith(')');
        const nextPfx  = isGroup ? prefix : `${prefix}/${segName}`;
        walk(full, nextPfx);
      } else if (e.name.endsWith('.tsx') || e.name.endsWith('.ts')) {
        // Ignorer les fichiers spéciaux
        if (e.name.startsWith('+')) continue;         // +not-found
        if (e.name === '_layout.tsx' || e.name === '_layout.ts') continue; // layouts

        const base = e.name.replace(/\.(tsx|ts)$/, '');
        const route = base === 'index' ? (prefix || '/') : `${prefix}/${base}`;

        // Normaliser : éviter double slash
        const normalized = route.replace(/\/+/g, '/') || '/';
        routes[normalized] = relPath(full);
      }
    }
  }

  walk(APP_DIR, '');
  return routes;
}

// ─── ÉTAPE 2 : EXTRAIRE TOUS LES PUSH/REPLACE ─────────────────────────────────
/**
 * Cherche tous les appels de navigation dans le code source :
 *  - router.push('...')
 *  - router.replace('...')
 *  - router.navigate('...')
 *  - Link href="..."
 *  - Tabs screen dans les layouts
 *  - data.route dans les notifications
 */
function extractNavigationCalls(files) {
  const calls = []; // { file, line, route, type }

  // Patterns
  const patterns = [
    // router.push / replace / navigate avec string littérale
    { re: /router\.(push|replace|navigate)\(\s*['"`]([^'"`]+)['"`]/g, type: 'router' },
    // href prop sur Link
    { re: /href\s*=\s*\{?\s*['"`]([^'"`]+)['"`]/g, type: 'href' },
    // data.route dans les notifications (JSON)
    { re: /['"]route['"]\s*:\s*['"`]([^'"`]+)['"`]/g, type: 'notification_route' },
    // path/route/pathname: '...' dans des tableaux de données (quickActions, gridItems, etc.)
    // Navigation dynamique : router.push(item.path) / router.push({ pathname: '...' })
    { re: /(?:path|route|pathname)\s*:\s*['"`](\/[^'"`]+)['"`]/g, type: 'data_path' },
    // Expo Router <Stack.Screen name="..." /> dans les layouts
    { re: /name\s*=\s*['"`]([^'"`]+)['"`]/g, type: 'stack_screen' },
  ];

  for (const filePath of files) {
    const content = readFile(filePath);
    if (!content) continue;
    const lines   = content.split('\n');
    const rel     = relPath(filePath);

    lines.forEach((line, i) => {
      // Ignorer les commentaires
      if (line.trimStart().startsWith('//') || line.trimStart().startsWith('*')) return;

      for (const { re, type } of patterns) {
        re.lastIndex = 0;
        let m;
        const freshRe = new RegExp(re.source, re.flags);
        while ((m = freshRe.exec(line)) !== null) {
          // m[1] peut être le type (push/replace) ou la route selon le pattern
          let route = '';
          if (type === 'router') {
            route = m[2]; // groupe 2 = la route
          } else {
            route = m[1]; // groupe 1 = la route
          }

          // Filtrer les non-routes (chemins asset, URL http, variables)
          if (!route) continue;
          if (route.startsWith('http')) continue;
          if (route.startsWith('$')) continue;
          if (!route.startsWith('/') && !route.startsWith('(')) continue;
          // Filtrer les noms de groupes expo-router purs : '(auth)', '(tabs)' sans slash
          if (/^\([^)]+\)$/.test(route)) continue;

          calls.push({
            file  : rel,
            line  : i + 1,
            route : route,
            type  : type,
          });
        }
      }
    });
  }

  return calls;
}

// ─── ÉTAPE 3 : NORMALISER UNE ROUTE CIBLE POUR COMPARAISON ───────────────────
/**
 * Normalise une route appelée dans le code pour la comparer au routeMap.
 * ex: '/(tabs)/marche' → '/(tabs)/marche' (groupe visible)
 *     '/admin/index'   → '/admin' (index est optionnel)
 *     '/producteur'    → '/producteur' (cherche index.tsx)
 */
function normalizeCallRoute(route) {
  // Supprimer les paramètres dynamiques
  let r = route.split('?')[0];

  // Supprimer le hash
  r = r.split('#')[0];

  // Normaliser double slash
  r = r.replace(/\/+/g, '/');

  // Expo-router : /(tabs)/marche → /marche dans l'URL visible
  // Mais dans le code on utilise /(tabs)/marche
  return r;
}

/**
 * Vérifie si une route appelée existe dans le routeMap.
 * Gère les cas :
 *  1. Match exact
 *  2. Route avec groupe : /(tabs)/marche → chercher aussi /marche
 *  3. Route vers dossier (implicitement index) : /admin → /admin
 */
function routeExists(routeMap, route) {
  const normalized = normalizeCallRoute(route);

  // Match exact
  if (routeMap[normalized]) return { found: true, match: normalized };

  // Essai sans les groupes de route (parenthèses)
  const stripped = normalized.replace(/\/\([^)]+\)/g, '');
  if (routeMap[stripped]) return { found: true, match: stripped };

  // Essai en cherchant comme index d'un dossier
  for (const [r] of Object.entries(routeMap)) {
    if (r === normalized || r.startsWith(normalized + '/')) {
      return { found: true, match: r };
    }
  }

  // Routes système expo-router
  const systemRoutes = ['/', '/login', '/(auth)/login', '/(auth)/signup'];
  if (systemRoutes.includes(normalized)) {
    // Vérifier dans le routeMap
    if (routeMap[normalized] || routeMap[stripped]) return { found: true, match: normalized };
  }

  return { found: false };
}

// ─── ÉTAPE 4 : ROUTES ORPHELINES ─────────────────────────────────────────────
/**
 * Une route est orpheline si aucun fichier source ne contient un push/replace/href vers elle.
 * Exceptions :
 *  - La route '/' (index)
 *  - Les routes dans les groupes expo-router : (tabs), (auth) — accessibles via grille ou tab bar
 *  - Les routes dont le segment sans groupe est référencé (/(tabs)/marche ↔ /marche)
 */
function findOrphanRoutes(routeMap, calls) {
  const calledRoutes = new Set();

  for (const call of calls) {
    const normalized = normalizeCallRoute(call.route);
    calledRoutes.add(normalized);

    // Ajouter aussi la version sans groupes expo-router
    const stripped = normalized.replace(/\/\([^)]+\)/g, '');
    calledRoutes.add(stripped);

    // Ajouter aussi la version avec le groupe (tabs) préfixé (pour matcher les appels /(tabs)/X)
    if (!normalized.includes('(tabs)') && !normalized.includes('(auth)')) {
      calledRoutes.add('/(tabs)' + normalized);
      calledRoutes.add('/(auth)' + normalized);
    }
  }

  const orphans = [];
  for (const [route, file] of Object.entries(routeMap)) {
    if (route === '/' || route === '') continue;

    // Les routes de groupes expo-router (tabs)/(auth) sont normales :
    // le dashboard marchand les référence via path '/(tabs)/X' dans quickActions
    // donc si la route sans groupe est référencée → pas orpheline
    const routeWithoutGroup = route.replace(/\/\([^)]+\)/g, '');

    let referenced = calledRoutes.has(route) || calledRoutes.has(routeWithoutGroup);

    if (!referenced) {
      // Essai de correspondance partielle (suffixe)
      for (const called of calledRoutes) {
        const calledStripped = called.replace(/\/\([^)]+\)/g, '');
        if (calledStripped === routeWithoutGroup || called === route) {
          referenced = true;
          break;
        }
        // Route param : /agent/enrolement?id=X → /agent/enrolement
        if (called.startsWith(route + '?') || called.startsWith(route + '/')) {
          referenced = true;
          break;
        }
      }
    }

    if (!referenced) {
      orphans.push({ route, file });
    }
  }

  return orphans;
}

// ─── ÉTAPE 5 : ROUTES DE NOTIFICATIONS ───────────────────────────────────────
/**
 * Vérifie les routes définies dans NotificationContext et CLAUDE.md :
 * chaque type de notification doit avoir une route cible valide.
 */
function auditNotificationRoutes(routeMap, files) {
  const issues = [];

  // Routes attendues dans NotificationContext (depuis CLAUDE.md)
  const expectedRoutes = [
    { type: 'marchand - commande acceptée',    route: '/(tabs)/marche' },
    { type: 'marchand - livraison terminée',   route: '/(tabs)/stock' },
    { type: 'marchand - achat-groupe-cree',    route: '/(tabs)/marche' },
    { type: 'producteur - nouvelle-commande',  route: '/producteur/commandes' },
    { type: 'producteur - demande-prix',       route: '/producteur/commandes' },
    { type: 'agent - enrolement-valide',       route: '/agent/activites' },
    { type: 'cooperative - nouvel-enrolement', route: '/cooperative/demandes' },
    { type: 'cooperative - prix-groupe',       route: '/cooperative/achats' },
    { type: 'admin - nouvelle-vente',          route: '/admin/transactions' },
    { type: 'admin - cooperative-inconnue',    route: '/admin/utilisateurs' },
    { type: 'admin - commandes',               route: '/admin/commandes' },
    { type: 'admin - signalements',            route: '/admin/signalements' },
    { type: 'admin - enrolements',             route: '/admin/enrolements' },
  ];

  for (const { type, route } of expectedRoutes) {
    const result = routeExists(routeMap, route);
    if (!result.found) {
      issues.push({
        type,
        route,
        severity: 'error',
        message : `Route de notification introuvable : ${route} (type: ${type})`,
      });
    } else {
      issues.push({
        type,
        route,
        severity: 'ok',
        message : `${route} → ${routeMap[result.match] || result.match}`,
      });
    }
  }

  // Chercher aussi les routes dans les fichiers de notification
  const notifFiles = files.filter(f =>
    f.includes('Notification') || f.includes('notification')
  );

  const dynamicRoutes = new Set();
  for (const filePath of notifFiles) {
    const content = readFile(filePath);
    const re = /route\s*:\s*['"`]([^'"`]+)['"`]/g;
    let m;
    while ((m = re.exec(content)) !== null) {
      dynamicRoutes.add(m[1]);
    }
  }

  for (const route of dynamicRoutes) {
    const result = routeExists(routeMap, route);
    if (!result.found) {
      issues.push({
        type    : 'dynamique (NotificationContext)',
        route,
        severity: 'error',
        message : `Route dynamique de notification introuvable : ${route}`,
      });
    }
  }

  return issues;
}

// ─── RAPPORT ──────────────────────────────────────────────────────────────────
function printReport(routeMap, calls, brokenLinks, orphans, notifIssues) {
  const date = new Date().toLocaleDateString('fr-FR', {
    day: '2-digit', month: 'long', year: 'numeric',
    hour: '2-digit', minute: '2-digit'
  });

  console.log('');
  console.log(bold('╔══════════════════════════════════════════════════════════════╗'));
  console.log(bold('║       AUDIT NAVIGATION — Jùlaba Mobile          ║'));
  console.log(bold(`║  ${date.padEnd(60)}║`));
  console.log(bold('╚══════════════════════════════════════════════════════════════╝'));
  console.log('');

  // ── Section 1 : Carte des routes ─────────────────────────────────────────
  console.log(bold('── 1. ROUTES ENREGISTRÉES (expo-router) ─────────────────────────'));
  const sortedRoutes = Object.entries(routeMap).sort((a, b) => a[0].localeCompare(b[0]));
  for (const [route, file] of sortedRoutes) {
    console.log(`  🟢 ${cyan(route.padEnd(40))} ${dim(file)}`);
  }
  console.log(`\n  Total : ${bold(sortedRoutes.length + ' routes')}\n`);

  // ── Section 2 : Liens brisés ──────────────────────────────────────────────
  console.log(bold('── 2. LIENS BRISÉS (push/replace vers route inexistante) ────────'));
  if (brokenLinks.length === 0) {
    console.log(green('  ✓ Aucun lien brisé détecté'));
  } else {
    for (const link of brokenLinks) {
      console.log(`  🔴 ${red(link.route.padEnd(40))} ${dim(link.file + ':' + link.line)}`);
      console.log(`     ${dim('Type: ' + link.type)}`);
    }
  }
  console.log('');

  // ── Section 3 : Routes orphelines ────────────────────────────────────────
  console.log(bold('── 3. ROUTES ORPHELINES (aucun lien entrant) ────────────────────'));
  if (orphans.length === 0) {
    console.log(green('  ✓ Aucune route orpheline'));
  } else {
    for (const { route, file } of orphans) {
      console.log(`  🟡 ${yellow(route.padEnd(40))} ${dim(file)}`);
    }
  }
  console.log('');

  // ── Section 4 : Routes de notifications ──────────────────────────────────
  console.log(bold('── 4. ROUTES DE NOTIFICATIONS ───────────────────────────────────'));
  const notifOk     = notifIssues.filter(i => i.severity === 'ok');
  const notifErrors = notifIssues.filter(i => i.severity === 'error');

  for (const issue of notifErrors) {
    console.log(`  🔴 ${red(issue.route.padEnd(40))} ${dim('(' + issue.type + ')')}`);
  }
  for (const issue of notifOk) {
    console.log(`  🟢 ${green(issue.route.padEnd(40))} ${dim('(' + issue.type + ')')}`);
  }
  console.log('');

  // ── Section 5 : Toutes les navigations ───────────────────────────────────
  console.log(bold('── 5. TOUTES LES NAVIGATIONS DÉTECTÉES ──────────────────────────'));
  const byType = {};
  for (const call of calls) {
    if (!byType[call.type]) byType[call.type] = [];
    byType[call.type].push(call);
  }
  for (const [type, typeCalls] of Object.entries(byType)) {
    console.log(`  ${dim('[' + type + '] ' + typeCalls.length + ' appels')}`);
    const uniq = [...new Set(typeCalls.map(c => c.route))];
    for (const r of uniq.sort()) {
      const exists  = routeExists(routeMap, r).found;
      const icon    = exists ? green('  ✓') : red('  ✗');
      const count   = typeCalls.filter(c => c.route === r).length;
      console.log(`  ${icon} ${r.padEnd(44)} ${dim('×' + count)}`);
    }
  }
  console.log('');

  // ── Score ─────────────────────────────────────────────────────────────────
  const errCount  = brokenLinks.length + notifErrors.length;
  const warnCount = orphans.length;

  const score = Math.max(0, Math.min(100, 100 - errCount * 5 - warnCount * 2));
  const scoreColor = score >= 80 ? green : score >= 60 ? yellow : red;
  const scoreEmoji = score >= 80 ? '🟢' : score >= 60 ? '🟡' : '🔴';

  console.log(bold('── BILAN ────────────────────────────────────────────────────────'));
  console.log(`  Routes enregistrées  : ${bold(sortedRoutes.length.toString())}`);
  console.log(`  Navigations détectées: ${bold(calls.length.toString())}`);
  console.log(`  Liens brisés         : ${brokenLinks.length > 0 ? red(bold(brokenLinks.length.toString())) : green('0')}`);
  console.log(`  Routes orphelines    : ${orphans.length > 0 ? yellow(bold(orphans.length.toString())) : green('0')}`);
  console.log(`  Erreurs notifications: ${notifErrors.length > 0 ? red(bold(notifErrors.length.toString())) : green('0')}`);
  console.log('');
  console.log(`  ${scoreEmoji} Score navigation : ${scoreColor(bold(score + '/100'))}`);
  console.log('');

  if (score === 100) {
    console.log(green('  ✓ Navigation parfaite — Aucun lien brisé'));
  } else if (brokenLinks.length === 0 && notifErrors.length === 0) {
    console.log(yellow('  ⚠ Routes orphelines à examiner (aucun lien brisé)'));
  } else {
    console.log(red('  ✗ Liens brisés détectés — corriger avant build APK'));
  }

  console.log('');
  console.log(dim('  Pénalité : -5pts par lien brisé/route notif manquante, -2pts par orpheline'));
  console.log('');
}

// ─── MAIN ─────────────────────────────────────────────────────────────────────
function main() {
  console.log(dim('Construction de la carte des routes...'));
  const routeMap = buildRouteMap();

  console.log(dim('Collecte des fichiers sources...'));
  const appFiles = collectFiles(APP_DIR, ['.tsx', '.ts']);
  const srcFiles = collectFiles(SRC_DIR, ['.tsx', '.ts']);
  const allFiles = [...appFiles, ...srcFiles];

  console.log(dim(`Analyse de ${allFiles.length} fichiers...\n`));

  // Extraire les appels de navigation
  const calls = extractNavigationCalls(allFiles);

  // Trouver les liens brisés
  const brokenLinks = calls.filter(call => {
    // Les routes dynamiques (variables) sont ignorées
    if (call.type === 'dynamic_route') return false;
    // Ignorer les routes avec variables
    if (call.route.includes('${') || call.route.includes('+')) return false;
    return !routeExists(routeMap, call.route).found;
  });

  // Auditer les routes de notifications (avant orphans pour enrichir calls)
  const notifIssues = auditNotificationRoutes(routeMap, allFiles);

  // Ajouter les routes de notifications aux calls connus (pour éviter faux-orphelins)
  for (const issue of notifIssues) {
    if (issue.severity === 'ok') {
      calls.push({ file: 'notifications', line: 0, route: issue.route, type: 'notification_route' });
    }
  }

  // Trouver les routes orphelines (maintenant enrichi des routes notif)
  const orphans = findOrphanRoutes(routeMap, calls);

  // Rapport
  printReport(routeMap, calls, brokenLinks, orphans, notifIssues);
}

main();
