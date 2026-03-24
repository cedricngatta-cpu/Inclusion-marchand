// Groq Whisper STT — transcription audio francais
// Mobile : appel direct Groq (pas de CORS)
// Web : passe par le proxy serveur Render (evite CORS)
// Fallback : speechRecognition natif (offline)
import { Platform } from 'react-native';
import { reportApiError } from './errorReporter';

const log = (...args: any[]) => { if (__DEV__) console.log('[GroqSTT]', ...args); };

const GROQ_API_KEY = process.env.EXPO_PUBLIC_GROQ_API_KEY || '';
const GROQ_STT_URL = 'https://api.groq.com/openai/v1/audio/transcriptions';

// Prompt Whisper (<896 chars) — vocabulaire marche ivoirien
const WHISPER_PROMPT = "Marchand vivrier Côte d'Ivoire. Produits : tomates riz oignons igname manioc banane plantain aubergine piment gombo avocat papaye ananas huile sucre mil fonio arachide patate douce carotte chou. Unités : kilos grammes unités sacs litres bouteilles. Monnaie : francs FCFA. Actions : vends vendre stock reste combien dette crédit bilan recette ajoute. Noms : Awa Kouassi Adjoua Konaté Bamba Traoré Diallo Coulibaly Koffi Yao. Titres : madame monsieur mademoiselle.";

// URL du serveur proxy (meme serveur que Socket.io)
const PROXY_BASE_URL = process.env.EXPO_PUBLIC_SOCKET_URL || 'https://inclusion-marchand.onrender.com';
const PROXY_STT_URL = `${PROXY_BASE_URL}/api/groq/stt`;

const isWeb = Platform.OS === 'web';

export interface GroqSTTResult {
    text: string;
    source: 'groq' | 'native' | 'web';
    confidence?: number;
}

// ── Transcription mobile (fichier URI -> FormData -> Groq direct) ────────────
export async function groqTranscribe(audioUri: string): Promise<GroqSTTResult> {
    if (!GROQ_API_KEY) {
        log('Pas de cle API Groq, fallback natif');
        return fallbackNativeSTT();
    }

    try {
        log('[Voice] 3. Sending to Groq Whisper (mobile direct)...');

        const fileUri = Platform.OS === 'ios' ? audioUri.replace('file://', '') : audioUri;

        const formData = new FormData();
        formData.append('file', {
            uri: fileUri,
            type: 'audio/m4a',
            name: 'audio.m4a',
        } as any);
        formData.append('model', 'whisper-large-v3-turbo');
        formData.append('language', 'fr');
        formData.append('response_format', 'json');
        formData.append('prompt', WHISPER_PROMPT);

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 15000);

        const res = await fetch(GROQ_STT_URL, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${GROQ_API_KEY}`,
            },
            body: formData,
            signal: controller.signal,
        });
        clearTimeout(timeoutId);

        if (!res.ok) {
            const errBody = await res.text();
            log('Erreur Groq STT (mobile):', res.status, errBody);
            throw new Error(`Groq STT ${res.status}: ${errBody}`);
        }

        const data = await res.json();
        const text = (data.text ?? '').trim();

        if (!text) {
            log('Transcription Groq vide, fallback natif');
            return fallbackNativeSTT();
        }

        log('[Voice] 4. STT result:', text);
        return { text, source: 'groq' };
    } catch (err: any) {
        log('Erreur Groq STT mobile:', err?.message ?? err);
        reportApiError('Groq STT', err, 'groqSTT.groqTranscribe');
        return fallbackNativeSTT();
    }
}

// ── Transcription web (Blob -> proxy serveur Render -> Groq) ────────────────
export async function groqTranscribeWeb(audioBlob: Blob): Promise<GroqSTTResult> {
    log('[Voice] 3. Sending blob to proxy Groq STT:', {
        size: audioBlob.size,
        type: audioBlob.type,
        sizeKB: Math.round(audioBlob.size / 1024),
    });

    // Blob trop petit = pas de voix capturee (1.5s minimum = ~3KB)
    if (audioBlob.size < 3000) {
        log('Audio blob trop petit (<3KB), pas assez de donnees audio');
        return { text: '', source: 'groq', confidence: 0 };
    }

    try {
        const contentType = audioBlob.type || 'audio/webm';

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 15000);

        // Passer par le proxy serveur pour eviter CORS
        const res = await fetch(PROXY_STT_URL, {
            method: 'POST',
            headers: {
                'Content-Type': contentType,
            },
            body: audioBlob,
            signal: controller.signal,
        });
        clearTimeout(timeoutId);

        if (!res.ok) {
            const errBody = await res.text();
            log('Erreur proxy Groq STT:', res.status, errBody);
            throw new Error(`Proxy Groq STT ${res.status}: ${errBody}`);
        }

        const data = await res.json();
        const text = (data.text ?? '').trim();

        log('[Voice] 4. STT result:', text || '(vide)');

        if (!text) {
            return { text: '', source: 'groq', confidence: 0 };
        }

        return { text, source: 'groq' };
    } catch (err: any) {
        log('Erreur Groq STT web:', err?.message ?? err);
        reportApiError('Groq STT Web', err, 'groqSTT.groqTranscribeWeb');

        if (err?.name === 'AbortError') {
            throw new Error('La transcription a pris trop de temps. Reessayez.');
        }
        throw err;
    }
}

// ── Fallback mobile : expo-speech-recognition ────────────────────────────────
async function fallbackNativeSTT(): Promise<GroqSTTResult> {
    log('Utilisation du STT natif (fallback mobile)');
    try {
        const { nativeSpeechRecognition } = await import('./speechRecognition');
        const result = await nativeSpeechRecognition();
        return {
            text: result.text,
            source: 'native',
            confidence: result.confidence,
        };
    } catch (err: any) {
        log('Erreur STT natif:', err?.message ?? err);
        throw new Error(`STT indisponible : ${err?.message ?? 'erreur inconnue'}`);
    }
}
