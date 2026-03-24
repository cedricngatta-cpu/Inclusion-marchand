// Matching intelligent entre mots prononces et produits reels en stock
// Gere les variantes ivoiriennes, erreurs de prononciation et transcription STT

export interface MatchableProduct {
    id: string;
    name: string;
    price: number;
    quantity: number;
}

// Dictionnaire des variantes ivoiriennes et erreurs de prononciation courantes
const PRODUCT_ALIASES: Record<string, string[]> = {
    'manioc': ['maniok', 'mannioc', 'cassave', 'cassava', 'placali'],
    'igname': ['ignam', 'yam', 'nyam', 'igname kponan', 'igname assawa'],
    'banane plantain': ['plantin', 'plantain', 'banann', 'banane', 'alloco'],
    'tomate': ['tomatte', 'tomat', 'tomaate', 'tomate salade'],
    'tomate salade': ['tomatte salade', 'tomat salade', 'salade'],
    'riz': ['ri', 'rii', 'ris'],
    'oignon': ['ognon', 'oyon', 'onyon', 'oignons'],
    'aubergine': ['obergin', 'aubergin', 'aubergines'],
    'piment': ['piman', 'pimen', 'piments'],
    'gombo': ['gonbo'],
    'avocat': ['avoca', 'avokat', 'avocats'],
    'papaye': ['papay', 'papayes'],
    'ananas': ['anana', 'annanas'],
    'patate douce': ['patat', 'patate', 'patates'],
    'pomme de terre': ['pom de ter'],
    'carotte': ['carot', 'carotes', 'carottes'],
    'chou': ['shou', 'choux'],
    'huile': ['huil', 'lwil', 'lhuile'],
    'sucre': ['sukre', 'sucr'],
    'mil': ['mille'],
    'fonio': ['fonyo'],
    'arachide': ['arachid', 'arachides', 'pistache'],
    'gingembre': ['gingembr', 'ginger', 'djinja'],
    'pamplemousse': ['pamplmous'],
    'corossol': ['corosol'],
    'poivron': ['poivrons'],
    'concombre': ['concombr', 'concombres'],
    'navet': ['nave', 'navets'],
    'mangue': ['mang', 'mangues'],
    'orange': ['orang', 'oranges'],
    'citron': ['citrons', 'sitron'],
    'goyave': ['goyav', 'goyaves'],
    'boeuf': ['bœuf', 'viande boeuf', 'bef'],
    'mouton': ['moutons'],
    'poulet': ['poule', 'poulets', 'poulé'],
    'tomate concentree': ['concentre', 'tomate boite'],
    'attieke': ['attieke', 'attiéké', 'acheke'],
};

// Noms locaux ivoiriens → produit reel
const IVORIAN_NAMES: Record<string, string> = {
    'attieke': 'manioc',
    'attiéké': 'manioc',
    'alloco': 'banane plantain',
    'placali': 'manioc',
    'foutou': 'banane plantain',
    'graine': 'graine de palme',
    'degue': 'mil',
    'dégué': 'mil',
};

// Normalise un texte (supprime accents, lowercase, trim)
function normalize(text: string): string {
    return text.toLowerCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9\s]/g, '')
        .trim();
}

// Score de similarite entre deux chaines
function similarity(a: string, b: string): number {
    const na = normalize(a);
    const nb = normalize(b);
    if (na === nb) return 1;
    if (na.includes(nb) || nb.includes(na)) return 0.9;

    // Caracteres communs / longueur max
    const longer = na.length > nb.length ? na : nb;
    const shorter = na.length > nb.length ? nb : na;
    if (shorter.length === 0) return 0;
    let matches = 0;
    const used = new Set<number>();
    for (let i = 0; i < shorter.length; i++) {
        for (let j = 0; j < longer.length; j++) {
            if (!used.has(j) && shorter[i] === longer[j]) {
                matches++;
                used.add(j);
                break;
            }
        }
    }
    return matches / longer.length;
}

export function matchProduct(spokenWord: string, products: MatchableProduct[]): MatchableProduct | null {
    if (!spokenWord || !products?.length) return null;
    const spoken = normalize(spokenWord);
    if (!spoken) return null;

    // 1. Match exact par nom
    const exact = products.find(p => normalize(p.name) === spoken);
    if (exact) return exact;

    // 2. Match par inclusion (le mot est dans le nom du produit ou inversement)
    const includes = products.find(p =>
        normalize(p.name).includes(spoken) || spoken.includes(normalize(p.name))
    );
    if (includes) return includes;

    // 3. Match par nom local ivoirien
    const ivorianCanonical = IVORIAN_NAMES[spoken] || IVORIAN_NAMES[spokenWord.toLowerCase().trim()];
    if (ivorianCanonical) {
        const matched = products.find(p =>
            normalize(p.name).includes(normalize(ivorianCanonical))
        );
        if (matched) return matched;
    }

    // 4. Match par alias
    for (const [canonical, aliases] of Object.entries(PRODUCT_ALIASES)) {
        if (aliases.some(a => normalize(a) === spoken || spoken.includes(normalize(a)) || normalize(a).includes(spoken))) {
            const matched = products.find(p => normalize(p.name).includes(normalize(canonical)));
            if (matched) return matched;
        }
    }

    // 5. Match par similarite (> 0.65)
    let bestMatch: MatchableProduct | null = null;
    let bestScore = 0;
    for (const p of products) {
        const score = similarity(spoken, p.name);
        if (score > bestScore && score > 0.65) {
            bestScore = score;
            bestMatch = p;
        }
    }

    return bestMatch;
}
