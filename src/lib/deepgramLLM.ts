// LLM wrapper — Intent parsing intelligent pour commandes vocales Julaba
// Utilise Mistral Small (principal) / Groq Llama (fallback) via chatWithHistory
// Historique conversationnel pour comprendre le contexte (raccourcis, corrections)
import { chatWithHistory, GroqMessage, parseAction, VoiceAction } from './groqAI';
import { reportApiError } from './errorReporter';

const log = (...args: any[]) => { if (__DEV__) console.log('[DeepgramLLM]', ...args); };

// ══════════════════════════════════════════════════════════════════════════════
// PROMPT SYSTEME JULABA — Personnalite + Actions + Raccourcis + Intelligence
// ══════════════════════════════════════════════════════════════════════════════

const JULABA_SYSTEM_PROMPT = `Tu es Julaba, l'assistante vocale intelligente des marchands et commercants de Cote d'Ivoire.

PERSONNALITE :
- Tu es une femme ivoirienne chaleureuse, professionnelle et efficace
- Tu parles un francais simple et naturel, avec des touches ivoiriennes
- Tu tutoies le marchand comme une collegue de confiance
- Tu es proactive : tu donnes des conseils sans qu'on te demande
- Tu es encourageante : tu felicites les bonnes performances
- Tu es concise : reponses courtes et directes, maximum 1-2 phrases. JAMAIS plus.

LANGAGE IVOIRIEN :
Tu comprends parfaitement ces expressions courantes :
- "dje" ou "wari" = argent
- "go" = aller, partir
- "dja" = deja
- "c'est comment ?" = comment ca va ? / quel est le statut ?
- "ca va aller" = expression de reconfort
- "on dit quoi ?" = quoi de neuf ?
- "gbe" = probleme
- "kpakpa" = beaucoup, en grande quantite
- "faire les comptes" = voir le bilan/stats
- "carnet" = registre de dettes
- "ma clientele" = mes clients reguliers
- "c'est fini sur" = en rupture de stock
- "y'en a encore ?" = verifier le stock
- "mets ca sur son compte" = ajouter une dette
- "il/elle a paye" = marquer une dette comme payee
- "combien j'ai fait ?" = chiffre d'affaires du jour
- "ca marche comment aujourd'hui ?" = resume du jour

ACTIONS DISPONIBLES :
Quand le marchand donne une commande, retourne ta reponse en texte PUIS l'action sur une nouvelle ligne avec le prefixe ACTION:: :

VENDRE :
Declencheurs : "vends", "vendre", "vente", "vendu", "fait la vente", "j'ai vendu"
ACTION::{"type":"vendre","details":{"produit":"tomates","quantite":3,"client":"Awa","paiement":"especes"}}
- Si "a credit" → paiement: "dette"
- Si "par Mobile Money" ou "par Wave" ou "par Orange" → paiement: "momo"
- Si pas precise → paiement: "especes"
- Calcule le montant si prix unitaire donne : "3 kilos a 550" → quantite:3

VENDRE PLUSIEURS PRODUITS :
Declencheurs : "vends 3 kilos de tomates et 2 kilos de riz"
ACTION::{"type":"vendre_multiple","details":{"produits":[{"nom":"tomates","quantite":3},{"nom":"riz","quantite":2}],"client":null,"paiement":"especes"}}

VERIFIER STOCK :
Declencheurs : "stock", "reste", "combien", "il reste", "y'en a encore", "c'est fini sur"
ACTION::{"type":"check_stock","details":{"produit":"riz"}}
Si pas de produit precise → ACTION::{"type":"check_stock_all","details":{}}

AJOUTER AU STOCK :
Declencheurs : "ajoute", "ajout", "ajouter", "rajoute", "j'ai recu", "livraison de"
ACTION::{"type":"stock_ajout","details":{"produit":"riz","quantite":50}}

DETTES - VOIR :
Declencheurs : "dette", "dettes", "qui me doit", "carnet", "credit", "les credits"
ACTION::{"type":"list_debts","details":{}}
Pour un client specifique : ACTION::{"type":"check_debt","details":{"client":"Awa"}}

DETTES - AJOUTER :
Declencheurs : "doit", "me doit", "mets sur son compte", "a credit pour"
ACTION::{"type":"dette_ajout","details":{"client":"Awa","montant":3000}}

DETTES - MARQUER PAYEE :
Declencheurs : "a paye", "a rembourse", "a donne l'argent", "dette payee"
ACTION::{"type":"dette_payee","details":{"client":"Awa"}}

STATISTIQUES :
Declencheurs : "combien j'ai fait", "chiffre", "bilan", "total", "recette", "stats", "resume"
ACTION::{"type":"stats","details":{"period":"today"}}
- "aujourd'hui" → "today", "cette semaine" → "week", "ce mois" → "month", "hier" → "yesterday"

PRODUITS LES PLUS VENDUS :
Declencheurs : "qu'est-ce qui marche", "meilleure vente", "produit star"
ACTION::{"type":"top_products","details":{"period":"week","limit":5}}

ALERTES STOCK :
Declencheurs : "alertes", "rupture", "qu'est-ce qui manque", "stock bas"
ACTION::{"type":"stock_alerts","details":{}}

NOTIFICATIONS :
Declencheurs : "notifications", "quoi de neuf", "messages"
ACTION::{"type":"show_notifications","details":{}}

ANNULER DERNIERE ACTION :
Declencheurs : "annule", "annuler", "pas ca", "c'est pas bon", "erreur"
ACTION::{"type":"undo_last","details":{}}

AIDE :
Declencheurs : "aide", "help", "tu fais quoi", "comment ca marche"
ACTION::{"type":"help","details":{}}

NAVIGATION :
ACTION::{"type":"navigate","details":{"route":"/(tabs)/stock"}}
(routes : /(tabs)/stock, /(tabs)/marche, /(tabs)/carnet, /(tabs)/bilan, /(tabs)/revenus, /(tabs)/scanner, /(tabs)/notifications)

QUESTIONS GENERALES :
Si le marchand pose une question generale (pas une commande), reponds en texte normal (pas d'ACTION::) :
- Sois concise (1-2 phrases max)
- Donne des conseils pratiques de commerce
- Si tu ne sais pas, dis-le honnetement

RACCOURCIS INTELLIGENTS :
- "2 tomates" sans verbe → comprends "vends 2 tomates" (action par defaut = SELL)
- "le riz ?" → comprends "combien il reste de riz" (CHECK_STOCK)
- "Awa 3000" → comprends "Awa me doit 3000" (ADD_DEBT)
- "tout" ou "resume" → comprends "stats today" (STATS)

INTELLIGENCE CONTEXTUELLE :
- Si le marchand dit juste un chiffre apres une vente ("encore 2"), comprends que c'est le meme produit
- Si le marchand dit "la meme chose", repete la derniere action
- Si le marchand dit "non, 5 pas 3", corrige la quantite de la derniere action
- Si le marchand dit "pour Awa", ajoute le client a la derniere vente sans client

INDICATEUR DE CONFIANCE :
Ajoute un champ "confidence" (0.0 a 1.0) dans le JSON de chaque action :
ACTION::{"type":"vendre","details":{...},"confidence":0.95}
Si confidence < 0.7, commence ta reponse par une demande de confirmation.

REGLES STRICTES :
- Le JSON ACTION:: doit TOUJOURS etre sur une seule ligne a la fin de ta reponse
- Jamais de backticks, de markdown ou de formatage autour du JSON
- Ne dis jamais "en tant qu'IA" ou "je suis un programme"
- 1-2 phrases max dans ta reponse texte. JAMAIS plus.
- JAMAIS commencer par "Je vais verifier..." ou "Bien sur..." ou "Avec plaisir..."
- Va DROIT AU BUT.
- Pas d'emojis, pas de listes a puces, pas de formatage special
- TOUJOURS les accents francais : e avec accent, a avec accent, c cedille
- "trois" = 3, JAMAIS 23. "deux" = 2, JAMAIS 22. Toujours le nombre simple.
- montant = quantite x prix unitaire du produit en stock. Ne JAMAIS inventer un prix.`;

// ══════════════════════════════════════════════════════════════════════════════
// HISTORIQUE DE CONVERSATION (garde les derniers echanges pour le contexte)
// ══════════════════════════════════════════════════════════════════════════════

let conversationMemory: GroqMessage[] = [];

export function addToConversationMemory(role: 'user' | 'assistant', content: string): void {
    conversationMemory.push({ role, content });
    // Garder max 10 messages (5 echanges) pour ne pas depasser les limites de tokens
    if (conversationMemory.length > 10) {
        conversationMemory = conversationMemory.slice(-10);
    }
}

export function clearConversationMemory(): void {
    conversationMemory = [];
}

export function getConversationMemory(): GroqMessage[] {
    return [...conversationMemory];
}

// ══════════════════════════════════════════════════════════════════════════════
// TYPES
// ══════════════════════════════════════════════════════════════════════════════

export interface LLMResult {
    text: string;
    action: VoiceAction | null;
    confidence: number;
    source: 'mistral' | 'groq';
}

// ══════════════════════════════════════════════════════════════════════════════
// TRAITEMENT DE COMMANDE VOCALE
// ══════════════════════════════════════════════════════════════════════════════

export async function processVoiceCommand(
    transcript: string,
    conversationHistory: GroqMessage[],
): Promise<LLMResult> {
    log('Traitement commande:', transcript);

    try {
        // Construire les messages : system + historique Groq existant + memoire conversationnelle recente + message courant
        const messages: GroqMessage[] = [];

        // 1. System prompt (toujours en premier)
        const hasSystem = conversationHistory.some(m => m.role === 'system');
        if (!hasSystem) {
            messages.push({ role: 'system', content: JULABA_SYSTEM_PROMPT });
        }

        // 2. Historique principal (inclut le system prompt si deja present)
        messages.push(...conversationHistory);

        // 3. Memoire conversationnelle recente (3 derniers echanges pour le contexte)
        const recentMemory = conversationMemory.slice(-6);
        for (const m of recentMemory) {
            // Eviter les doublons avec l'historique principal
            if (!messages.some(existing => existing.role === m.role && existing.content === m.content)) {
                messages.push(m);
            }
        }

        // 4. Message courant
        messages.push({ role: 'user', content: transcript });

        const rawReply = await chatWithHistory(messages);
        const { text, action } = parseAction(rawReply);

        // Extraire la confiance du JSON si presente
        let confidence = 0.9; // defaut
        if (action && (action as any).confidence != null) {
            confidence = parseFloat(String((action as any).confidence)) || 0.9;
            delete (action as any).confidence; // nettoyer le champ du VoiceAction
        }

        // Sauvegarder dans la memoire conversationnelle
        addToConversationMemory('user', transcript);
        addToConversationMemory('assistant', rawReply);

        log('Reponse LLM:', text?.slice(0, 80));
        if (action) log('Action detectee:', action.type, 'confiance:', confidence);

        return {
            text: text || rawReply,
            action,
            confidence,
            source: 'mistral',
        };
    } catch (err: any) {
        log('Erreur LLM:', err?.message ?? err);
        reportApiError('LLM', err, 'deepgramLLM.processVoiceCommand');

        if (err?.message === 'TIMEOUT') {
            return { text: 'Connexion lente. Reessaye.', action: null, confidence: 0, source: 'mistral' };
        }
        return { text: "Desole, j'ai pas pu traiter ta demande.", action: null, confidence: 0, source: 'mistral' };
    }
}

// ══════════════════════════════════════════════════════════════════════════════
// GREETING INTELLIGENT
// ══════════════════════════════════════════════════════════════════════════════

export interface GreetingStats {
    todaySales: number;
    todayAmount: number;
    lowStockCount: number;
    pendingOrders: number;
    unreadNotifs: number;
}

export function generateSmartGreeting(userName: string, stats?: GreetingStats | null): string {
    const hour = new Date().getHours();
    let timeGreeting = 'Bonjour';
    if (hour >= 12 && hour < 18) timeGreeting = 'Bon apres-midi';
    else if (hour >= 18) timeGreeting = 'Bonsoir';

    const firstName = (userName || 'Utilisateur').split(' ')[0];

    if (stats && stats.todaySales > 0) {
        const amount = stats.todayAmount.toLocaleString('fr-FR');
        return `${timeGreeting} ${firstName} ! Tu as deja fait ${amount} francs aujourd'hui avec ${stats.todaySales} ventes. Comment je peux t'aider ?`;
    }

    return `${timeGreeting} ${firstName} ! Comment je peux t'aider ?`;
}

// ══════════════════════════════════════════════════════════════════════════════
// WELCOME MESSAGE (via LLM — utilise seulement si stats non disponibles)
// ══════════════════════════════════════════════════════════════════════════════

export async function generateWelcomeMessage(
    conversationHistory: GroqMessage[],
): Promise<LLMResult> {
    const welcomePrompt: GroqMessage = {
        role: 'user',
        content: 'Accueil chaleureux et resume rapide de mon activite en 2 phrases max.',
    };

    const messages = [...conversationHistory, welcomePrompt];

    try {
        const rawReply = await chatWithHistory(messages, 300);
        const { text } = parseAction(rawReply);

        return {
            text: text || rawReply,
            action: null,
            confidence: 1,
            source: 'mistral',
        };
    } catch (err: any) {
        log('Erreur welcome LLM:', err?.message ?? err);
        reportApiError('LLM Welcome', err, 'deepgramLLM.generateWelcomeMessage');
        throw err;
    }
}
