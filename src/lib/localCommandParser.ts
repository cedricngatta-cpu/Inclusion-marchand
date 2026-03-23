// Parser local offline — detecte les commandes vocales par mots-cles
// Retourne le meme format JSON que le LLM pour compatibilite
import type { VoiceAction } from './groqAI';

const log = (...args: any[]) => { if (__DEV__) console.log('[LocalParser]', ...args); };

export interface LocalParseResult {
    action: VoiceAction | null;
    responseText: string;
}

// Normalise le texte : minuscules, sans accents
function normalize(text: string): string {
    return text.toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '');
}

// Extrait le premier nombre du texte
function extractNumber(text: string): number | null {
    const match = text.match(/(\d+)/);
    return match ? parseInt(match[1], 10) : null;
}

// Mots de liaison et unites a ignorer pour trouver le produit
const FILLER_WORDS = new Set([
    'de', 'du', 'des', 'la', 'le', 'les', 'un', 'une', 'mon', 'ma', 'mes',
    'kg', 'kilo', 'kilos', 'kilogramme', 'kilogrammes',
    'unite', 'unites', 'piece', 'pieces', 'sac', 'sacs',
    'tas', 'lot', 'lots', 'paquet', 'paquets', 'boite', 'boites',
    'litre', 'litres', 'bouteille', 'bouteilles',
    'je', 'veux', 'fait', 'fais', 'faire',
]);

// Extrait le nom du produit apres le nombre + unites/fillers
// Ex: "vends 3 kilos de tomates fraiches" → "tomates fraiches"
function extractProductAfterNumber(text: string): string | null {
    const normalized = normalize(text);
    // Trouver la position du nombre
    const numMatch = normalized.match(/(\d+)/);
    if (!numMatch || numMatch.index === undefined) return null;

    // Prendre tout apres le nombre
    const afterNum = normalized.slice(numMatch.index + numMatch[0].length).trim();
    const words = afterNum.split(/\s+/);

    // Sauter les mots de liaison/unites
    let startIdx = 0;
    while (startIdx < words.length && FILLER_WORDS.has(words[startIdx])) {
        startIdx++;
    }

    const productWords = words.slice(startIdx).filter(w => w.length > 1);
    return productWords.length > 0 ? productWords.join(' ') : null;
}

// Extrait le nom du produit en cherchant apres les mots-cles d'action
function extractProductAfterKeyword(text: string, keywords: string[]): string | null {
    const normalized = normalize(text);

    for (const kw of keywords) {
        const idx = normalized.indexOf(kw);
        if (idx < 0) continue;

        const afterKw = normalized.slice(idx + kw.length).trim();
        const words = afterKw.split(/\s+/);

        // Sauter nombre + fillers
        let startIdx = 0;
        while (startIdx < words.length && (/^\d+$/.test(words[startIdx]) || FILLER_WORDS.has(words[startIdx]))) {
            startIdx++;
        }

        const productWords = words.slice(startIdx).filter(w => w.length > 1);
        if (productWords.length > 0) return productWords.join(' ');
    }
    return null;
}

// Extrait le nom d'un client (tout apres "pour", "a", "client")
function extractClientName(text: string): string | null {
    const normalized = normalize(text);
    const triggers = ['pour ', 'a ', 'client '];
    for (const t of triggers) {
        const idx = normalized.lastIndexOf(t);
        if (idx >= 0) {
            const after = normalized.slice(idx + t.length).trim();
            const words = after.split(/\s+/).filter(w => w.length > 1 && !/^\d+$/.test(w));
            if (words.length > 0) return words.join(' ');
        }
    }
    return null;
}

// ── Mots-cles enrichis pour chaque type d'action ─────────────────────────────
const SELL_KEYWORDS = [
    'vends', 'vend', 'vente', 'vendre', 'vendu', 'vendez',
    'je vends', 'fait la vente', 'fais la vente', 'faire la vente',
    'je veux vendre', 'fais une vente',
];
// Mots atomiques pour la detection rapide (inclus dans les phrases ci-dessus)
const SELL_ATOMS = ['vends', 'vend', 'vente', 'vendre', 'vendu', 'vendez'];

const STOCK_KEYWORDS = [
    'stock', 'reste', 'combien', 'inventaire', 'quantite',
    'il reste', 'y a combien', 'il y a combien',
];
const STOCK_ATOMS = ['stock', 'reste', 'combien', 'inventaire', 'quantite'];

const ADD_STOCK_KEYWORDS = [
    'ajoute', 'ajout', 'ajouter', 'rajoute', 'rajouter',
    'reapprovisionne', 'approvisionne',
    'met', 'mettre', 'met en stock',
];
const ADD_STOCK_ATOMS = ['ajoute', 'ajout', 'ajouter', 'rajoute', 'rajouter', 'approvisionne', 'reapprovisionne'];

const DEBT_LIST_KEYWORDS = [
    'dette', 'dettes', 'carnet', 'qui me doit', 'doivent', 'credits',
];
const DEBT_LIST_ATOMS = ['dette', 'dettes', 'carnet', 'doivent', 'credits'];

const ADD_DEBT_KEYWORDS = [
    'doit', 'me doit', 'credit de', 'dette de',
];
const ADD_DEBT_ATOMS = ['doit'];

const STATS_KEYWORDS = [
    'bilan', 'statistiques', 'stats', 'chiffre', 'chiffres',
    'revenus', 'recette', 'recettes', 'total',
    "combien j'ai fait", "combien j'ai vendu",
    "aujourd'hui", 'resume',
];
const STATS_ATOMS = ['bilan', 'statistiques', 'stats', 'chiffre', 'chiffres', 'revenus', 'recette', 'recettes', 'resume'];

const NOTIFICATION_KEYWORDS = ['notification', 'notifications', 'alerte', 'alertes', 'messages'];

// Mots exclus pour l'extraction de produit
const ALL_ACTION_ATOMS = [
    ...SELL_ATOMS, ...STOCK_ATOMS, ...ADD_STOCK_ATOMS,
    ...DEBT_LIST_ATOMS, ...ADD_DEBT_ATOMS, ...STATS_ATOMS,
    ...NOTIFICATION_KEYWORDS,
];

// ── Detection helper : teste si le texte contient un mot-cle ─────────────────
function containsKeyword(normalized: string, keywords: string[]): boolean {
    return keywords.some(kw => normalized.includes(kw));
}

// ══════════════════════════════════════════════════════════════════════════════
// PARSER PRINCIPAL
// ══════════════════════════════════════════════════════════════════════════════

export function parseLocalCommand(
    transcript: string,
    cachedProducts?: Array<{ name: string }>,
): LocalParseResult {
    const text = transcript.trim();
    const normalized = normalize(text);
    const quantity = extractNumber(text);

    log('Parse local:', text, '→ normalized:', normalized);

    // ── VENTE ───────────────────────────────────────────────────────────
    if (containsKeyword(normalized, SELL_ATOMS)) {
        const productName =
            matchCachedProduct(normalized, cachedProducts)
            || extractProductAfterNumber(text)
            || extractProductAfterKeyword(text, SELL_ATOMS);

        if (productName) {
            const client = extractClientName(text);
            log('Vente detectee:', productName, 'x', quantity ?? 1, client ? `client: ${client}` : '');
            return {
                action: {
                    type: 'vendre',
                    details: {
                        produit: productName,
                        quantite: quantity ?? 1,
                        ...(client ? { client } : {}),
                    },
                },
                responseText: `Vente de ${quantity ?? 1} ${productName}${client ? ` pour ${client}` : ''}. Confirmez ?`,
            };
        }
        return {
            action: null,
            responseText: "Quel produit voulez-vous vendre ?",
        };
    }

    // ── AJOUTER STOCK (doit etre avant CHECK STOCK) ─────────────────────
    if (containsKeyword(normalized, ADD_STOCK_ATOMS) && !normalized.includes('dette')) {
        const productName =
            matchCachedProduct(normalized, cachedProducts)
            || extractProductAfterNumber(text)
            || extractProductAfterKeyword(text, ADD_STOCK_ATOMS);

        if (productName && quantity) {
            log('Ajout stock detecte:', productName, '+', quantity);
            return {
                action: {
                    type: 'stock_ajout',
                    details: {
                        produit: productName,
                        quantite: quantity,
                    },
                },
                responseText: `Ajout de ${quantity} ${productName} au stock. Confirmez ?`,
            };
        }
        return {
            action: null,
            responseText: "Quel produit et quelle quantite ajouter au stock ?",
        };
    }

    // ── CHECK STOCK ─────────────────────────────────────────────────────
    if (containsKeyword(normalized, STOCK_ATOMS)) {
        const productName = matchCachedProduct(normalized, cachedProducts)
            || extractProductAfterKeyword(text, STOCK_ATOMS);

        if (productName) {
            log('Verif stock detectee:', productName);
            return {
                action: {
                    type: 'stock',
                    details: { produit: productName },
                },
                responseText: `Verification du stock de ${productName}...`,
            };
        }
        return {
            action: { type: 'navigate', details: { route: '/(tabs)/stock' } },
            responseText: "Voici votre stock.",
        };
    }

    // ── AJOUTER DETTE ───────────────────────────────────────────────────
    if (containsKeyword(normalized, ADD_DEBT_ATOMS) && !containsKeyword(normalized, SELL_ATOMS)) {
        const amount = quantity;
        const clientName = extractClientName(text)
            || extractProductAfterKeyword(text, ADD_DEBT_ATOMS);

        if (clientName && amount && amount > 0) {
            log('Ajout dette detecte:', clientName, amount);
            return {
                action: {
                    type: 'dette_ajout',
                    details: { client: clientName, montant: amount },
                },
                responseText: `Dette de ${amount} F pour ${clientName}. Confirmez ?`,
            };
        }
        // Pas assez d'info → navigation carnet
        return {
            action: { type: 'navigate', details: { route: '/(tabs)/carnet' } },
            responseText: "Voici votre carnet de dettes.",
        };
    }

    // ── LISTE DETTES / CARNET ───────────────────────────────────────────
    if (containsKeyword(normalized, DEBT_LIST_ATOMS)) {
        log('Navigation carnet detectee');
        return {
            action: { type: 'navigate', details: { route: '/(tabs)/carnet' } },
            responseText: "Voici votre carnet de dettes.",
        };
    }

    // ── STATS / BILAN ───────────────────────────────────────────────────
    if (containsKeyword(normalized, STATS_ATOMS) || normalized.includes("aujourd'hui") || normalized.includes('aujourdhui')) {
        log('Navigation bilan detectee');
        return {
            action: { type: 'navigate', details: { route: '/(tabs)/bilan' } },
            responseText: "Voici votre bilan.",
        };
    }

    // ── NOTIFICATIONS ───────────────────────────────────────────────────
    if (containsKeyword(normalized, NOTIFICATION_KEYWORDS)) {
        log('Navigation notifications detectee');
        return {
            action: { type: 'navigate', details: { route: '/(tabs)/notifications' } },
            responseText: "Vos notifications.",
        };
    }

    // ── RIEN DETECTE ────────────────────────────────────────────────────
    log('Aucune commande locale detectee');
    return {
        action: null,
        responseText: "Mode hors ligne. Commandes disponibles : vendre, stock, bilan, dettes.",
    };
}

// ── Match produit en cache ───────────────────────────────────────────────────
function matchCachedProduct(
    normalizedText: string,
    products?: Array<{ name: string }>,
): string | null {
    if (!products?.length) return null;

    for (const p of products) {
        const normalizedName = normalize(p.name);
        if (normalizedText.includes(normalizedName)) {
            return p.name;
        }
        // Essayer sans le "s" final (pluriel)
        const sansS = normalizedName.replace(/s$/, '');
        if (sansS.length > 2 && normalizedText.includes(sansS)) {
            return p.name;
        }
    }
    return null;
}
