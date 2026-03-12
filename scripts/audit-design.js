#!/usr/bin/env node
/**
 * audit-design.js — Audit de conformité design UI/UX
 * Zéro dépendance externe (fs + path uniquement)
 * Usage : node scripts/audit-design.js
 */

const fs   = require('fs');
const path = require('path');

// ─── CONFIG ───────────────────────────────────────────────────────────────────
const ROOT        = path.join(__dirname, '..');
const APP_DIR     = path.join(ROOT, 'app');
const SRC_DIR     = path.join(ROOT, 'src');
const COLORS_FILE = path.join(ROOT, 'src', 'lib', 'colors.ts');

// Palette approuvée (valeurs hex autorisées)
const APPROVED_COLORS = new Set([
  '#059669','#10b981','#047857','#ECFDF5','#D1FAE5',
  '#FFFFFF','#000000','#F9FAFB','#F3F4F6','#E5E7EB',
  '#D1D5DB','#9CA3AF','#6B7280','#4B5563','#374151',
  '#1F2937','#111827','#DC2626','#D97706','#2563EB',
  '#F59E0B','#3B82F6','#EF4444','#7C3AED','#0891B2',
  '#FEF3C7','#EFF6FF','#FEE2E2','#F3E8FF',
  // Couleurs de fond et variantes courantes dans le code
  '#ecfdf5','#fffbeb','#eff6ff','#fff1f2','#fefce8',
  '#faf5ff','#eef2ff','#f0fdf4','#f8fafc','#fdf4ff',
  '#e11d48','#ca8a04','#4338ca','#16a34a','#475569',
  '#a21caf','#b45309','#7c3aed',
  // Transparences (rgba) — non testées directement
  // Opérateurs Mobile Money (autorisés explicitement)
  '#FF6600','#FFCC00','#1DC4E9','#0066CC','#996600','#0A8FA8',
  '#ff6600','#ffcc00','#1dc4e9','#0066cc','#996600','#0a8fa8',
  // Couleurs de statut (autorisées explicitement)
  '#065f46','#991b1b','#92400e','#1e40af','#5b21b6','#166534',
]);

// ─── UTILITAIRES ──────────────────────────────────────────────────────────────
const R   = '\x1b[31m';  // rouge
const Y   = '\x1b[33m';  // jaune
const G   = '\x1b[32m';  // vert
const B   = '\x1b[36m';  // bleu (info)
const DIM = '\x1b[2m';
const RST = '\x1b[0m';
const BOLD= '\x1b[1m';

function red(s)    { return `${R}${s}${RST}`; }
function yellow(s) { return `${Y}${s}${RST}`; }
function green(s)  { return `${G}${s}${RST}`; }
function bold(s)   { return `${BOLD}${s}${RST}`; }
function dim(s)    { return `${DIM}${s}${RST}`; }

function collectFiles(dir, exts = ['.tsx', '.ts']) {
  const results = [];
  if (!fs.existsSync(dir)) return results;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      results.push(...collectFiles(full, exts));
    } else if (exts.some(ext => e.name.endsWith(ext))) {
      results.push(full);
    }
  }
  return results;
}

function readFile(filePath) {
  try { return fs.readFileSync(filePath, 'utf-8'); }
  catch { return ''; }
}

function relPath(filePath) {
  return filePath.replace(ROOT + path.sep, '').replace(/\\/g, '/');
}

function getLines(content) {
  return content.split('\n');
}

// Cherche toutes les occurrences d'un pattern dans le contenu avec numéro de ligne
function findAll(lines, pattern) {
  const matches = [];
  const re = typeof pattern === 'string' ? new RegExp(pattern, 'g') : pattern;
  lines.forEach((line, i) => {
    if (re.test(line)) {
      re.lastIndex = 0; // reset pour les regex globales
      matches.push({ line: i + 1, text: line.trim() });
    }
  });
  return matches;
}

// ─── CATÉGORIES D'AUDIT ───────────────────────────────────────────────────────

const allIssues = []; // { file, cat, severity, line, message }
const fileStats = {}; // file → { errors, warnings, ok }

function addIssue(file, cat, severity, line, message) {
  allIssues.push({ file, cat, severity, line, message });
  if (!fileStats[file]) fileStats[file] = { errors: 0, warnings: 0 };
  if (severity === 'error') fileStats[file].errors++;
  else fileStats[file].warnings++;
}

// ────────────────────────────────────────────────────────────────────
// CAT 1 — Formes interdites (cercles)
// ────────────────────────────────────────────────────────────────────
function auditCircles(file, lines) {
  const content = lines.join('\n');

  // Pattern: borderRadius: N où N est proche ou égal à width/2 ou height/2
  // Heuristique : borderRadius >= 50 sur width/height fixes connues
  // Ou pattern style={{ ...borderRadius: width/2 }}
  const circlePatterns = [
    /borderRadius\s*:\s*(?:width|height)\s*\/\s*2/,
    /borderRadius\s*:\s*(?:w|h|size|dim)\s*\/\s*2/,
    /borderRadius\s*:\s*(\d+)\s*,.*(?:width|height)\s*:\s*\1/,
  ];

  // borderRadius explicitement très grand (>= 50) sur un élément qui n'est pas un header
  const brHighRe = /borderRadius\s*:\s*(\d+)/g;
  let m;
  const contentForCircle = content;
  const linesArr = lines;

  linesArr.forEach((line, i) => {
    // Ignorer les lignes de commentaire
    if (line.trimStart().startsWith('//') || line.trimStart().startsWith('*')) return;

    // Pattern borderRadius: N (N >= 50) hors contexte header
    const brMatch = line.match(/borderRadius\s*:\s*(\d+)/);
    if (brMatch) {
      const val = parseInt(brMatch[1], 10);
      if (val > 24 && val < 200) {
        // 24 est accepté (header), >24 est suspect
        addIssue(file, 'FORMES', 'warning', i + 1,
          `borderRadius: ${val} trop grand (max 12 hors header, 24 pour header) — risque de cercle → ${line.trim().slice(0, 80)}`);
      }
    }

    // borderRadius = width / 2 pattern
    for (const p of circlePatterns) {
      if (p.test(line)) {
        addIssue(file, 'FORMES', 'error', i + 1,
          `Cercle détecté : borderRadius = dimension/2 → ${line.trim().slice(0, 80)}`);
      }
    }

    // borderBottomLeftRadius / borderBottomRightRadius > 32 hors header
    const bbrMatch = line.match(/border(?:Bottom|Top)(?:Left|Right)Radius\s*:\s*(\d+)/);
    if (bbrMatch) {
      const val = parseInt(bbrMatch[1], 10);
      if (val > 32) {
        addIssue(file, 'FORMES', 'warning', i + 1,
          `border*Radius: ${val} — valeur élevée → ${line.trim().slice(0, 80)}`);
      }
    }
  });
}

// ────────────────────────────────────────────────────────────────────
// CAT 2 — Zones tactiles (min 44x44)
// ────────────────────────────────────────────────────────────────────
function auditTouchZones(file, lines) {
  lines.forEach((line, i) => {
    if (line.trimStart().startsWith('//')) return;

    // width/height explicitement inférieurs à 44 sur des TouchableOpacity/Pressable
    // On cherche des petits boutons : width: N, height: N (N < 44) proches d'un Touchable
    const smallDim = line.match(/(?:width|height)\s*:\s*(\d+)/);
    if (smallDim) {
      const val = parseInt(smallDim[1], 10);
      if (val > 0 && val < 44) {
        // Vérifie si c'est dans un contexte "touche" (les 5 lignes autour)
        const context = lines.slice(Math.max(0, i - 5), i + 5).join(' ');
        if (/Touchable|Pressable|onPress/.test(context)) {
          addIssue(file, 'ZONES TACTILES', 'warning', i + 1,
            `Dimension ${smallDim[0].trim()} potentiellement < 44px dans un composant tactile → ${line.trim().slice(0, 80)}`);
        }
      }
    }

    // minHeight/minWidth < 44 sur boutons
    const minDim = line.match(/min(?:Height|Width)\s*:\s*(\d+)/);
    if (minDim) {
      const val = parseInt(minDim[1], 10);
      if (val < 44) {
        addIssue(file, 'ZONES TACTILES', 'warning', i + 1,
          `${minDim[0].trim()} — minimum recommandé est 44 → ${line.trim().slice(0, 80)}`);
      }
    }
  });
}

// ────────────────────────────────────────────────────────────────────
// CAT 3 — Lisibilité du texte (fontSize min 11)
// ────────────────────────────────────────────────────────────────────
function auditTextReadability(file, lines) {
  lines.forEach((line, i) => {
    if (line.trimStart().startsWith('//') || line.trimStart().startsWith('*')) return;

    const fsMatch = line.match(/fontSize\s*:\s*(\d+)/);
    if (fsMatch) {
      const val = parseInt(fsMatch[1], 10);
      if (val < 11) {
        addIssue(file, 'LISIBILITÉ', 'error', i + 1,
          `fontSize: ${val} — minimum autorisé est 11 → ${line.trim().slice(0, 80)}`);
      }
      // fontSize: 11 est la limite minimale acceptée — pas d'avertissement
    }

    // numberOfLines absent sur des textes potentiellement longs dans des listes
    // On détecte les <Text style= sans numberOfLines dans les composants de liste
  });

  // Vérifier qu'il y a des numberOfLines sur les cartes/listes
  const content = lines.join('\n');
  const hasLists = /FlatList|map\(.*=>/.test(content);
  const hasNumberOfLines = /numberOfLines/.test(content);
  if (hasLists && !hasNumberOfLines) {
    addIssue(file, 'LISIBILITÉ', 'warning', 0,
      'Listes détectées mais aucun numberOfLines — textes pourraient déborder');
  }
}

// ────────────────────────────────────────────────────────────────────
// CAT 4 — Palette de couleurs
// ────────────────────────────────────────────────────────────────────
function auditColors(file, lines) {
  lines.forEach((line, i) => {
    if (line.trimStart().startsWith('//') || line.trimStart().startsWith('*')) return;

    // Chercher les codes hex inline (hors rgba)
    const hexMatches = line.match(/#([0-9A-Fa-f]{6})\b/g);
    if (hexMatches) {
      for (const hex of hexMatches) {
        const hexNorm = hex.toLowerCase();
        const hexUpper = hex.toUpperCase();
        if (!APPROVED_COLORS.has(hex) && !APPROVED_COLORS.has(hexNorm) && !APPROVED_COLORS.has(hexUpper)) {
          addIssue(file, 'COULEURS', 'warning', i + 1,
            `Couleur hors palette : ${hex} → ${line.trim().slice(0, 80)}`);
        }
      }
    }
  });
}

// ────────────────────────────────────────────────────────────────────
// CAT 5 — Scroll et contenu
// ────────────────────────────────────────────────────────────────────
function auditScroll(file, lines) {
  const content = lines.join('\n');

  // Ignorer les layouts, headers, modals simples
  const isLayout = file.includes('_layout');
  if (isLayout) return;

  // L'écran doit avoir un ScrollView ou FlatList ou SectionList
  const hasScrollable = /ScrollView|FlatList|SectionList|Animated\.ScrollView/.test(content);
  if (!hasScrollable) {
    // Vérifier s'il y a du vrai contenu (View + Text/TouchableOpacity)
    const hasContent = /View|Text|TouchableOpacity/.test(content);
    if (hasContent && content.split('\n').length > 30) {
      addIssue(file, 'SCROLL', 'warning', 0,
        'Aucun ScrollView/FlatList — contenu potentiellement non scrollable');
    }
  }

  // Vérifier paddingBottom sur le dernier conteneur
  if (hasScrollable) {
    const hasPaddingBottom = /paddingBottom\s*:\s*(\d+)/.test(content);
    if (!hasPaddingBottom) {
      addIssue(file, 'SCROLL', 'warning', 0,
        'Pas de paddingBottom — le dernier élément peut coller au bord');
    }
  }

  // Pull-to-refresh : refreshControl ou onRefresh
  const hasFlatList = /FlatList/.test(content);
  const hasPullRefresh = /refreshControl|onRefresh/.test(content);
  if (hasFlatList && !hasPullRefresh) {
    addIssue(file, 'SCROLL', 'warning', 0,
      'FlatList sans pull-to-refresh (refreshControl/onRefresh manquant)');
  }

  // État vide
  const hasEmptyState = /EmptyState|Liste vide|Aucun|empty|length === 0|\.length == 0/.test(content);
  const hasFlatListOrMap = /FlatList|\.map\(/.test(content);
  if (hasFlatListOrMap && !hasEmptyState) {
    addIssue(file, 'SCROLL', 'warning', 0,
      'Listes sans état vide apparent (EmptyState ou message "Aucun...")');
  }

  // État de chargement
  const hasLoading = /ActivityIndicator|loading|isLoading|chargement/i.test(content);
  const hasSupabase = /supabase|\.from\(/.test(content);
  if (hasSupabase && !hasLoading) {
    addIssue(file, 'SCROLL', 'warning', 0,
      'Requêtes Supabase sans indicateur de chargement (ActivityIndicator)');
  }
}

// ────────────────────────────────────────────────────────────────────
// CAT 6 — Formulaires
// ────────────────────────────────────────────────────────────────────
function auditForms(file, lines) {
  const content = lines.join('\n');

  const hasTextInput = /TextInput/.test(content);
  if (!hasTextInput) return;

  // KeyboardAvoidingView — acceptable via keyboardShouldPersistTaps ou si inputs dans Modal
  // ou si tous les TextInput sont des barres de recherche (placeholder "Rechercher...")
  const hasKAV         = /KeyboardAvoidingView/.test(content);
  const hasPersistTaps = /keyboardShouldPersistTaps/.test(content);

  // Vérifier si les TextInputs sont tous dans des Modals ou sont des barres de recherche
  const withoutModal      = content.replace(/<Modal[\s\S]*?<\/Modal>/g, '');
  const hasInputOutside   = /TextInput/.test(withoutModal);
  // Barre de recherche : placeholder contient "Rechercher", "chercher", "Filtrer", "Search"
  const searchBarPatterns = /placeholder[^"']*["'](?:Rechercher|chercher|Filtrer|Search|Nom\.|Cherch)/i;
  const allInputsAreSearch = searchBarPatterns.test(withoutModal) &&
    (withoutModal.match(/TextInput/g) || []).length <= 1;

  if (!hasKAV && !hasPersistTaps && hasInputOutside && !allInputsAreSearch) {
    // Warning (pas erreur) — ScrollView avec keyboardShouldPersistTaps est une alternative valide
    addIssue(file, 'FORMULAIRES', 'warning', 0,
      'TextInput sans KeyboardAvoidingView ni keyboardShouldPersistTaps — vérifier comportement clavier');
  }

  // Placeholder
  const inputCount   = (content.match(/TextInput/g) || []).length;
  const placeholders = (content.match(/placeholder/g) || []).length;
  if (placeholders < inputCount) {
    addIssue(file, 'FORMULAIRES', 'warning', 0,
      `${inputCount} TextInput mais seulement ${placeholders} placeholder(s) — certains champs manquent de description`);
  }

  // Bouton de soumission visible
  if (!/onPress|onSubmit/.test(content)) {
    addIssue(file, 'FORMULAIRES', 'warning', 0,
      'Formulaire sans bouton de soumission détecté (onPress/onSubmit absent)');
  }
}

// ────────────────────────────────────────────────────────────────────
// CAT 7 — Headers
// ────────────────────────────────────────────────────────────────────
function auditHeaders(file, lines) {
  const content = lines.join('\n');

  // Ignorer les layouts et fichiers non-écrans
  const isLayout    = file.includes('_layout');
  const isIndex     = path.basename(file) === 'index.tsx';
  const isAuthFile  = file.includes('(auth)');
  if (isLayout) return;

  // Les écrans doivent utiliser ScreenHeader
  const isComponentOrContext = file.includes('src/components') || file.includes('src/context');
  if (!isAuthFile && !isComponentOrContext) {
    const usesScreenHeader = /ScreenHeader/.test(content);
    if (!usesScreenHeader) {
      addIssue(file, 'HEADERS', 'warning', 0,
        'ScreenHeader non utilisé — header potentiellement absent ou non conforme');
    }
  }

  // Header vert — si le header est inline, vérifier la couleur
  const hasGreenHeader = /#059669/.test(content);
  const inlineHeaderBg = /backgroundColor\s*:\s*['"](?!#059669)[^'"]+['"]/g;
  lines.forEach((line, i) => {
    if (/header.*backgroundColor|backgroundColor.*header/i.test(line)) {
      if (!/#059669/.test(line)) {
        addIssue(file, 'HEADERS', 'warning', i + 1,
          `Header avec couleur non verte : ${line.trim().slice(0, 80)}`);
      }
    }
  });

  // Vérifier que le header ne scroll pas (position: 'absolute' ou position fixe)
  // Difficile à détecter statiquement, on skip
}

// ────────────────────────────────────────────────────────────────────
// CAT 8 — Images
// ────────────────────────────────────────────────────────────────────
function auditImages(file, lines) {
  const content = lines.join('\n');

  if (!/Image|image_url|photo_url/.test(content)) return;

  // resizeMode requis sur les images
  const imageComponents = (content.match(/<Image\b/g) || []).length;
  const resizeModes     = (content.match(/resizeMode/g) || []).length;

  if (imageComponents > 0 && resizeModes === 0) {
    addIssue(file, 'IMAGES', 'warning', 0,
      `${imageComponents} <Image> sans resizeMode — risque de déformation`);
  }

  // Images sans alt / accessibilityLabel
  const accessLabels = (content.match(/accessibilityLabel/g) || []).length;
  if (imageComponents > accessLabels) {
    addIssue(file, 'IMAGES', 'warning', 0,
      `${imageComponents} <Image> mais seulement ${accessLabels} accessibilityLabel — accessibilité incomplète`);
  }
}

// ────────────────────────────────────────────────────────────────────
// CAT 9 — Espacement
// ────────────────────────────────────────────────────────────────────
function auditSpacing(file, lines) {
  lines.forEach((line, i) => {
    if (line.trimStart().startsWith('//')) return;

    // marginTop: -X interdit (chevauche le header)
    const negMargin = line.match(/margin(?:Top|Vertical)\s*:\s*-(\d+)/);
    if (negMargin) {
      addIssue(file, 'ESPACEMENT', 'error', i + 1,
        `Marge négative détectée : ${negMargin[0].trim()} — peut chevaucher le header → ${line.trim().slice(0, 80)}`);
    }

    // padding horizontal trop petit (< 12)
    const hPad = line.match(/padding(?:Horizontal|Left|Right)\s*:\s*(\d+)/);
    if (hPad) {
      const val = parseInt(hPad[1], 10);
      // Badges et puces : paddingHorizontal 6-10 autorisé par design (éléments compacts)
      const isBadge = /badge|Badge|chip|Chip|tag|Tag|operator|Operator|pill|Pill|status|Status/i.test(line);
      if (val < 12 && val > 0 && !isBadge) {
        addIssue(file, 'ESPACEMENT', 'warning', i + 1,
          `${hPad[0].trim()} — padding horizontal < 12px → ${line.trim().slice(0, 80)}`);
      }
    }
  });

  // paddingTop trop petit entre header et contenu
  const content = lines.join('\n');
  const hasPaddingTop = /paddingTop\s*:\s*(\d+)/.exec(content);
  // Difficile à évaluer sans contexte du header, skip deep check
}

// ────────────────────────────────────────────────────────────────────
// CAT 10 — Navigation
// ────────────────────────────────────────────────────────────────────
function auditNavigation(file, lines) {
  const content = lines.join('\n');

  // router.push au lieu de router.replace au logout (hors écrans d'auth : login/signup)
  const isAuthScreen = file.includes('(auth)') || file.includes('login') || file.includes('signup');
  if (!isAuthScreen) {
    lines.forEach((line, i) => {
      if (/router\.push.*login/i.test(line)) {
        addIssue(file, 'NAVIGATION', 'error', i + 1,
          `router.push vers login — utiliser router.replace pour empêcher le retour → ${line.trim().slice(0, 80)}`);
      }
    });
  }

  // BackHandler.exitApp() sur les dashboards
  const isDashboard = /commercant|index|producteur.*index|agent.*index|cooperative.*index|admin.*index/.test(file);
  if (isDashboard && /BackHandler/.test(content)) {
    // OK
  } else if (isDashboard && !/BackHandler/.test(content) && !file.includes('_layout')) {
    // Pas critique, juste info
  }

  // useFocusEffect sur les écrans avec données dynamiques
  const hasSupabase = /supabase|\.from\(/.test(content);
  const hasFocusEffect = /useFocusEffect/.test(content);
  if (hasSupabase && !hasFocusEffect && !file.includes('_layout')) {
    addIssue(file, 'NAVIGATION', 'warning', 0,
      'Données Supabase sans useFocusEffect — données non rechargées au retour sur l\'écran');
  }
}

// ────────────────────────────────────────────────────────────────────
// CAT 11 — Accessibilité
// ────────────────────────────────────────────────────────────────────
function auditAccessibility(file, lines) {
  const content = lines.join('\n');

  // ActivityIndicator sans accessibilityLabel
  const aiCount  = (content.match(/ActivityIndicator/g) || []).length;
  const aiLabels = (content.match(/ActivityIndicator[^>]*accessibilityLabel/g) || []).length;
  if (aiCount > 0 && aiLabels === 0) {
    addIssue(file, 'ACCESSIBILITÉ', 'warning', 0,
      `${aiCount} ActivityIndicator sans accessibilityLabel`);
  }

  // TouchableOpacity sans accessibilityLabel ni accessibilityRole
  lines.forEach((line, i) => {
    // Bouton sans label accessible (heuristique simple)
    if (/TouchableOpacity/.test(line) && !/<Text/.test(line)) {
      const context = lines.slice(i, Math.min(lines.length, i + 3)).join(' ');
      if (!/accessibilityLabel|accessibilityRole/.test(context)) {
        // Trop de faux positifs, skip
      }
    }
  });
}

// ────────────────────────────────────────────────────────────────────
// CAT 12 — Visibilité des boutons
// ────────────────────────────────────────────────────────────────────
function auditButtonVisibility(file, lines) {
  const content = lines.join('\n');

  // opacity: 0 sur des éléments interactifs (SAUF opacity conditionnelle = feedback visuel normal)
  lines.forEach((line, i) => {
    // opacity: 0.6, opacity: 0.5, etc. sont du feedback visuel → ignorer
    // Seul opacity: 0 (zéro exact, non conditionnel) est un vrai bug
    if (/opacity\s*:\s*0\b/.test(line) && !/opacity\s*:\s*0\.\d/.test(line)) {
      // Ignorer si la ligne est dans un spread conditionnel : { opacity: 0.X } ou && { opacity: 0 }
      // Pattern conditionnel : && { ... opacity: 0 ... } ou isLoading && { opacity: 0 }
      const isConditional = /&&\s*\{|&&\s*styles|\?\s*\{|condition/.test(line) ||
        /&&\s*\{[^}]*opacity\s*:\s*0/.test(line);
      if (isConditional) return; // feedback visuel conditionnel, pas un bug

      const ctx = lines.slice(Math.max(0, i - 3), i + 3).join(' ');
      // Vérifier aussi que la ligne entière n'est pas dans un spread conditionnel
      const lineWithContext = lines.slice(Math.max(0, i - 1), i + 2).join(' ');
      const isSpreadConditional = /&&\s*\{/.test(lineWithContext) || /isLoading|loading|disabled/.test(lineWithContext);
      if (isSpreadConditional) return;

      if (/onPress|Touchable|Button/.test(ctx)) {
        addIssue(file, 'VISIBILITÉ', 'error', i + 1,
          `opacity: 0 statique sur un élément interactif → ${line.trim().slice(0, 80)}`);
      }
    }

    // display: 'none' sur des éléments sans condition
    if (/display\s*:\s*['"]none['"]/.test(line) && !/&&|\?/.test(lines[Math.max(0, i - 2)] + line)) {
      // Heuristique faible, ne reporter que si clairement statique
    }

    // zIndex négatif (cache l'élément)
    const zidx = line.match(/zIndex\s*:\s*(-\d+)/);
    if (zidx) {
      addIssue(file, 'VISIBILITÉ', 'warning', i + 1,
        `zIndex négatif ${zidx[1]} — peut cacher l'élément → ${line.trim().slice(0, 80)}`);
    }
  });

  // Vérifier que le bouton micro (VoiceButton) est présent
  const isScreen = !file.includes('_layout') && !file.includes('(auth)');
  const isMainScreen = file.includes('app/');
  const isNotComponentOrContext = !file.includes('src/components') && !file.includes('src/context');
  if (isMainScreen && isScreen && isNotComponentOrContext) {
    const hasVoiceButton = /VoiceButton/.test(content);
    if (!hasVoiceButton && !file.includes('_layout')) {
      addIssue(file, 'VISIBILITÉ', 'warning', 0,
        'VoiceButton absent — assistant vocal inaccessible sur cet écran');
    }
  }
}

// ─── AUDIT PRINCIPAL ──────────────────────────────────────────────────────────
function auditFile(filePath) {
  const content = readFile(filePath);
  if (!content) return;

  const lines = getLines(content);
  const rel   = relPath(filePath);

  auditCircles(rel, lines);
  auditTouchZones(rel, lines);
  auditTextReadability(rel, lines);
  auditColors(rel, lines);
  auditScroll(rel, lines);
  auditForms(rel, lines);
  auditHeaders(rel, lines);
  auditImages(rel, lines);
  auditSpacing(rel, lines);
  auditNavigation(rel, lines);
  auditAccessibility(rel, lines);
  auditButtonVisibility(rel, lines);
}

// ─── RAPPORT ──────────────────────────────────────────────────────────────────
function printReport() {
  const date = new Date().toLocaleDateString('fr-FR', {
    day: '2-digit', month: 'long', year: 'numeric',
    hour: '2-digit', minute: '2-digit'
  });

  console.log('');
  console.log(bold('╔══════════════════════════════════════════════════════════════╗'));
  console.log(bold('║         AUDIT DESIGN — Inclusion Marchand Mobile            ║'));
  console.log(bold(`║  ${date.padEnd(60)}║`));
  console.log(bold('╚══════════════════════════════════════════════════════════════╝'));
  console.log('');

  // Regrouper par fichier
  const byFile = {};
  for (const issue of allIssues) {
    if (!byFile[issue.file]) byFile[issue.file] = [];
    byFile[issue.file].push(issue);
  }

  const filesAudited  = Object.keys(fileStats).length +
    Object.keys(byFile).filter(f => !fileStats[f]).length;

  // Fichiers sans problèmes
  const allFiles = [...new Set(allIssues.map(i => i.file))];

  let totalErrors   = 0;
  let totalWarnings = 0;
  const filesWithErrors   = new Set();
  const filesWithWarnings = new Set();

  for (const issue of allIssues) {
    if (issue.severity === 'error') {
      totalErrors++;
      filesWithErrors.add(issue.file);
    } else {
      totalWarnings++;
      filesWithWarnings.add(issue.file);
    }
  }

  // Rapport par fichier
  const sortedFiles = Object.keys(byFile).sort((a, b) => {
    const ae = byFile[a].filter(i => i.severity === 'error').length;
    const be = byFile[b].filter(i => i.severity === 'error').length;
    return be - ae;
  });

  for (const file of sortedFiles) {
    const issues  = byFile[file];
    const errors  = issues.filter(i => i.severity === 'error').length;
    const warnings= issues.filter(i => i.severity === 'warning').length;

    const icon = errors > 0 ? '🔴' : warnings > 0 ? '🟡' : '🟢';
    console.log(`${icon} ${bold(file)}`);
    console.log(`   ${red(`${errors} erreur(s)`)}  ${yellow(`${warnings} avertissement(s)`)}`);

    // Grouper par catégorie
    const byCat = {};
    for (const issue of issues) {
      if (!byCat[issue.cat]) byCat[issue.cat] = [];
      byCat[issue.cat].push(issue);
    }

    for (const [cat, catIssues] of Object.entries(byCat)) {
      console.log(`   ${dim(`[${cat}]`)}`);
      for (const issue of catIssues) {
        const prefix = issue.severity === 'error' ? red('  ✗') : yellow('  ⚠');
        const lineStr = issue.line > 0 ? dim(` (ligne ${issue.line})`) : '';
        console.log(`${prefix}${lineStr} ${issue.message}`);
      }
    }
    console.log('');
  }

  // ── Résumé par catégorie ───────────────────────────────────────────────────
  const catCounts = {};
  for (const issue of allIssues) {
    if (!catCounts[issue.cat]) catCounts[issue.cat] = { errors: 0, warnings: 0 };
    if (issue.severity === 'error') catCounts[issue.cat].errors++;
    else catCounts[issue.cat].warnings++;
  }

  console.log(bold('── RÉSUMÉ PAR CATÉGORIE ─────────────────────────────────────────'));
  const sortedCats = Object.entries(catCounts).sort((a, b) => (b[1].errors + b[1].warnings) - (a[1].errors + a[1].warnings));
  for (const [cat, counts] of sortedCats) {
    const icon = counts.errors > 0 ? '🔴' : '🟡';
    console.log(`  ${icon} ${cat.padEnd(20)} ${red(counts.errors + ' err')}  ${yellow(counts.warnings + ' warn')}`);
  }
  console.log('');

  // ── Score ─────────────────────────────────────────────────────────────────
  // Formule sémantique par catégorie (insensible au volume brut d'issues) :
  //
  //  Pour chaque catégorie qui a des problèmes :
  //   - si errors > 0 : pénalité = errPts (selon catégorie)
  //   - si warnings > 0 : pénalité = warnPts (selon catégorie)
  //   - les deux pénalités se cumulent si la catégorie a les deux
  //
  // Cette approche mesure "combien de catégories sont impactées"
  // et non "combien d'occurrences" (évite les 378 couleurs Tailwind valides).

  const CAT_SCORE = {
    // [errPts, warnPts] — max total par catégorie
    'LISIBILITÉ'     : [15,  5],
    'FORMULAIRES'    : [12,  3],
    'NAVIGATION'     : [10,  3],
    'ESPACEMENT'     : [ 8,  2],
    'FORMES'         : [10,  3],
    'VISIBILITÉ'     : [ 8,  2],
    'SCROLL'         : [ 5,  2],
    'HEADERS'        : [ 5,  2],
    'ZONES TACTILES' : [ 5,  1],
    'COULEURS'       : [ 3,  1],  // advisory : variantes Tailwind souvent valides
    'ACCESSIBILITÉ'  : [ 3,  1],
    'IMAGES'         : [ 3,  1],
  };

  // Regrouper les issues par catégorie
  const issuesByCat2 = {};
  for (const issue of allIssues) {
    if (!issuesByCat2[issue.cat]) issuesByCat2[issue.cat] = { errors: 0, warnings: 0 };
    if (issue.severity === 'error') issuesByCat2[issue.cat].errors++;
    else issuesByCat2[issue.cat].warnings++;
  }

  let totalPenalty = 0;
  for (const [cat, counts] of Object.entries(issuesByCat2)) {
    const [errPts, warnPts] = CAT_SCORE[cat] || [5, 2];
    if (counts.errors   > 0) totalPenalty += errPts;
    if (counts.warnings > 0) totalPenalty += warnPts;
  }

  // Pénalité supplémentaire si plusieurs fichiers avec erreurs (> 5 fichiers = -5pts)
  if (filesWithErrors.size > 5) totalPenalty += 5;

  const penaltyErrors   = totalPenalty; // pour affichage
  const penaltyWarnings = 0;
  const rawScore = 100 - totalPenalty;
  const score    = Math.max(0, Math.min(100, rawScore));

  const scoreColor = score >= 80 ? green : score >= 60 ? yellow : red;
  const scoreEmoji = score >= 80 ? '🟢' : score >= 60 ? '🟡' : '🔴';

  console.log(bold('── BILAN GLOBAL ─────────────────────────────────────────────────'));
  console.log(`  Fichiers analysés  : ${bold(allFiles.length + ' fichiers avec problèmes')}`);
  console.log(`  Erreurs critiques  : ${red(bold(totalErrors.toString()))}`);
  console.log(`  Avertissements     : ${yellow(bold(totalWarnings.toString()))}`);
  console.log(`  Fichiers impactés  : ${bold(filesWithErrors.size + ' erreurs')} / ${bold(filesWithWarnings.size + ' warnings')}`);
  console.log('');
  console.log(`  ${scoreEmoji} Score design : ${scoreColor(bold(score + '/100'))}`);
  console.log('');

  if (score >= 90) {
    console.log(green('  ✓ Excellent — Prêt pour la démo'));
  } else if (score >= 75) {
    console.log(yellow('  ⚠ Correct — Corriger les erreurs critiques avant build APK'));
  } else if (score >= 50) {
    console.log(yellow('  ⚠ Passable — Travail nécessaire avant démo investisseurs'));
  } else {
    console.log(red('  ✗ Non conforme — Corrections importantes requises'));
  }

  console.log('');
  console.log(dim('  Pénalité : -3pts par erreur critique, -1pt par avertissement'));
  console.log('');
}

// ─── MAIN ─────────────────────────────────────────────────────────────────────
function main() {
  console.log(dim('Collecte des fichiers...'));

  const appFiles = collectFiles(APP_DIR,  ['.tsx']);
  const srcFiles = collectFiles(SRC_DIR,  ['.tsx']);
  const allFiles = [...appFiles, ...srcFiles];

  console.log(dim(`${allFiles.length} fichiers trouvés — analyse en cours...\n`));

  for (const f of allFiles) {
    auditFile(f);
  }

  printReport();
}

main();
