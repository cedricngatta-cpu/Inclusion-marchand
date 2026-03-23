// Deepgram LLM — Intent parsing pour commandes vocales marchands
// Utilise Groq Llama 3.3 (gratuit, rapide) comme moteur LLM
// Le prompt est optimise pour les commandes vocales Julaba
import { chatWithHistory, GroqMessage, parseAction, VoiceAction } from './groqAI';
import { reportApiError } from './errorReporter';

const log = (...args: any[]) => { if (__DEV__) console.log('[DeepgramLLM]', ...args); };

// Prompt systeme optimise pour le parsing de commandes vocales
const VOICE_COMMAND_SYSTEM_PROMPT = `Tu es Julaba, l'assistant vocal des marchands et commercants en Cote d'Ivoire.
Tu comprends le francais, le francais ivoirien informel (dje=argent, wari=argent, go=aller, dja=deja).
Quand le marchand donne une commande, retourne UNIQUEMENT un JSON structure :
- Vente : ACTION::{"type":"vendre","details":{"produit":"...","quantite":X,"client":"...","montant":X}}
- Stock : ACTION::{"type":"stock","details":{"produit":"..."}}
- Ajouter stock : ACTION::{"type":"stock_ajout","details":{"produit":"...","quantite":X}}
- Dettes : ACTION::{"type":"dette_ajout","details":{"client":"...","montant":X}}
- Stats : ACTION::{"type":"navigate","details":{"route":"/(tabs)/bilan"}}
- Notifications : ACTION::{"type":"navigate","details":{"route":"/(tabs)/notifications"}}
Quand c'est une question generale, reponds en texte normal en francais simple et court.`;

export interface LLMResult {
    text: string;
    action: VoiceAction | null;
    source: 'groq';
}

/**
 * Traite une commande vocale transcrite via le LLM (Groq Llama 3.3).
 * Retourne le texte de reponse et l'action structuree si detectee.
 */
export async function processVoiceCommand(
    transcript: string,
    conversationHistory: GroqMessage[],
): Promise<LLMResult> {
    log('Traitement commande:', transcript);

    try {
        // Construire les messages avec l'historique existant
        const messages: GroqMessage[] = [
            ...conversationHistory,
            { role: 'user', content: transcript },
        ];

        // Si pas de system prompt dans l'historique, ajouter le prompt commande vocale
        if (!messages.some(m => m.role === 'system')) {
            messages.unshift({ role: 'system', content: VOICE_COMMAND_SYSTEM_PROMPT });
        }

        const rawReply = await chatWithHistory(messages);
        const { text, action } = parseAction(rawReply);

        log('Reponse LLM:', text?.slice(0, 80));
        if (action) log('Action detectee:', action.type);

        return {
            text: text || rawReply,
            action,
            source: 'groq',
        };
    } catch (err: any) {
        log('Erreur LLM:', err?.message ?? err);
        reportApiError('LLM', err, 'deepgramLLM.processVoiceCommand');

        if (err?.message === 'TIMEOUT') {
            return { text: 'Connexion lente. Reessayez.', action: null, source: 'groq' };
        }
        return { text: "Desole, je n'ai pas pu traiter votre demande.", action: null, source: 'groq' };
    }
}

/**
 * Genere un message d'accueil personnalise.
 */
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
            source: 'groq',
        };
    } catch (err: any) {
        log('Erreur welcome LLM:', err?.message ?? err);
        reportApiError('LLM Welcome', err, 'deepgramLLM.generateWelcomeMessage');
        throw err;
    }
}
