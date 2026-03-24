// Mistral AI — LLM principal (remplace Groq Llama)
// Appel direct depuis le client (CORS autorisé par Mistral)

const log = (...args: any[]) => { if (__DEV__) console.log('[MistralAI]', ...args); };

const MISTRAL_API_KEY = process.env.EXPO_PUBLIC_MISTRAL_API_KEY || '';
const MISTRAL_CHAT_URL = 'https://api.mistral.ai/v1/chat/completions';
const MISTRAL_MODEL = 'mistral-small-latest';

export function isMistralAvailable(): boolean {
    return !!MISTRAL_API_KEY;
}

export async function mistralChat(
    messages: Array<{ role: string; content: string }>,
    maxTokens = 300,
): Promise<string> {
    if (!MISTRAL_API_KEY) throw new Error('Clé Mistral manquante');

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 12000);

    try {
        const res = await fetch(MISTRAL_CHAT_URL, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${MISTRAL_API_KEY}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                model: MISTRAL_MODEL,
                messages,
                temperature: 0.3,
                max_tokens: maxTokens,
                top_p: 0.9,
            }),
            signal: controller.signal,
        });
        clearTimeout(timeoutId);

        if (!res.ok) {
            const errBody = await res.text();
            log('Erreur Mistral', res.status, errBody);
            throw new Error(`Mistral ${res.status}: ${errBody}`);
        }

        const data = await res.json();
        return (data.choices?.[0]?.message?.content ?? '').trim();
    } catch (err: any) {
        clearTimeout(timeoutId);
        if (err.name === 'AbortError') {
            log('TIMEOUT Mistral (12s)');
            throw new Error('TIMEOUT');
        }
        throw err;
    }
}
