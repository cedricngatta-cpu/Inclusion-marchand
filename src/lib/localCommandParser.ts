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

// Extrait un mot apres un mot-cle (ex: "vends 3 tomates" → "tomates")
function extractWordAfterNumber(text: string): string | null {
    const match = text.match(/\d+\s+(\w+)/);
    return match ? match[1] : null;
}

// Extrait le dernier mot significatif (> 2 chars) comme nom de produit potentiel
function extractProductName(text: string, excludeWords: string[]): string | null {
    const words = text.split(/\s+/).filter(w => w.length > 2);
    const filtered = words.filter(w => !excludeWords.includes(normalize(w)));
    return filtered.length > 0 ? filtered[filtered.length - 1] : null;
}

// Mots-cles pour chaque type d'action
const SELL_KEYWORDS = ['vends', 'vend', 'vente', 'vendre', 'vendu'];
const STOCK_KEYWORDS = ['stock', 'reste', 'combien', 'inventaire'];
const ADD_STOCK_KEYWORDS = ['ajoute', 'ajout', 'ajouter', 'reapprovisionne', 'approvisionne', 'rajoute'];
const DEBT_KEYWORDS = ['dette', 'doit', 'credit', 'dettes'];
const ADD_DEBT_KEYWORDS = ['dette', 'doit'];
const STATS_KEYWORDS = ['bilan', 'statistiques', 'stats', 'chiffre', 'revenus'];
const NOTIFICATION_KEYWORDS = ['notification', 'notifications', 'alerte', 'alertes'];

const EXCLUDED_WORDS = [
    ...SELL_KEYWORDS, ...STOCK_KEYWORDS, ...ADD_STOCK_KEYWORDS,
    ...DEBT_KEYWORDS, ...STATS_KEYWORDS, ...NOTIFICATION_KEYWORDS,
    'de', 'du', 'la', 'le', 'les', 'un', 'une', 'des', 'mon', 'ma', 'mes',
    'kg', 'kilo', 'kilos', 'unite', 'unites', 'piece', 'pieces',
];

/**
 * Parse une commande vocale en local (offline) par detection de mots-cles.
 * Retourne une action structuree compatible avec executeVoiceAction.
 */
export function parseLocalCommand(
    transcript: string,
    cachedProducts?: Array<{ name: string }>,
): LocalParseResult {
    const text = transcript.trim();
    const normalized = normalize(text);
    const quantity = extractNumber(text);

    log('Parse local:', text, '→ normalized:', normalized);

    // ── VENTE ───────────────────────────────────────────────────────────
    if (SELL_KEYWORDS.some(kw => normalized.includes(kw))) {
        const productAfterNumber = extractWordAfterNumber(text);
        const productName = productAfterNumber
            || matchCachedProduct(normalized, cachedProducts)
            || extractProductName(text, EXCLUDED_WORDS);

        if (productName) {
            log('Vente detectee:', productName, 'x', quantity ?? 1);
            return {
                action: {
                    type: 'vendre',
                    details: {
                        produit: productName,
                        quantite: quantity ?? 1,
                    },
                },
                responseText: `Vente de ${quantity ?? 1} ${productName}. Confirmez ?`,
            };
        }
        return {
            action: null,
            responseText: "Quel produit voulez-vous vendre ?",
        };
    }

    // ── AJOUTER STOCK (doit etre avant CHECK STOCK) ─────────────────────
    if (ADD_STOCK_KEYWORDS.some(kw => normalized.includes(kw)) &&
        !normalized.includes('dette')) {
        const productAfterNumber = extractWordAfterNumber(text);
        const productName = productAfterNumber
            || matchCachedProduct(normalized, cachedProducts)
            || extractProductName(text, EXCLUDED_WORDS);

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
    if (STOCK_KEYWORDS.some(kw => normalized.includes(kw))) {
        const productName = matchCachedProduct(normalized, cachedProducts)
            || extractProductName(text, EXCLUDED_WORDS);

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
        // Navigation vers l'ecran stock
        return {
            action: { type: 'navigate', details: { route: '/(tabs)/stock' } },
            responseText: "Voici votre stock.",
        };
    }

    // ── AJOUTER DETTE ───────────────────────────────────────────────────
    if (ADD_DEBT_KEYWORDS.some(kw => normalized.includes(kw))) {
        const amount = quantity;
        // Extraire le nom du client (mots entre "dette" et le nombre, ou apres)
        const clientName = extractProductName(text, [...EXCLUDED_WORDS, String(amount)]);

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
        return {
            action: { type: 'navigate', details: { route: '/(tabs)/carnet' } },
            responseText: "Voici votre carnet de dettes.",
        };
    }

    // ── STATS / BILAN ───────────────────────────────────────────────────
    if (STATS_KEYWORDS.some(kw => normalized.includes(kw))) {
        log('Navigation bilan detectee');
        return {
            action: { type: 'navigate', details: { route: '/(tabs)/bilan' } },
            responseText: "Voici votre bilan.",
        };
    }

    // ── NOTIFICATIONS ───────────────────────────────────────────────────
    if (NOTIFICATION_KEYWORDS.some(kw => normalized.includes(kw))) {
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

/**
 * Compare le texte normalise avec les noms de produits en cache.
 * Retourne le nom du produit le plus proche, ou null.
 */
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
