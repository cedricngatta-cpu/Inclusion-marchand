// Deepgram STT (Nova-3) — transcription audio francais
// Mobile : envoie fichier m4a via FormData
// Web : envoie Blob webm directement
// Fallback mobile : expo-speech-recognition | Fallback web : Web Speech API
import { Platform } from 'react-native';
import { reportApiError } from './errorReporter';

const log = (...args: any[]) => { if (__DEV__) console.log('[DeepgramSTT]', ...args); };

const DEEPGRAM_API_KEY = process.env.EXPO_PUBLIC_DEEPGRAM_API_KEY ?? '';
const DEEPGRAM_STT_URL = 'https://api.deepgram.com/v1/listen?model=nova-3&language=fr&smart_format=true';

export interface DeepgramSTTResult {
    text: string;
    source: 'deepgram' | 'native' | 'web';
    confidence?: number;
}

// ── Transcription mobile (fichier URI -> FormData) ────────────────────────────
export async function deepgramTranscribe(audioUri: string): Promise<DeepgramSTTResult> {
    if (!DEEPGRAM_API_KEY) {
        log('Pas de cle API Deepgram, fallback natif');
        return fallbackNativeSTT();
    }

    try {
        log('[Voice] 3. Sending to Deepgram STT (mobile)...');

        const fileUri = Platform.OS === 'ios' ? audioUri.replace('file://', '') : audioUri;

        const formData = new FormData();
        formData.append('file', {
            uri: fileUri,
            type: 'audio/m4a',
            name: 'recording.m4a',
        } as any);

        const result = await sendToDeepgram(formData);
        if (!result) {
            log('Transcription Deepgram vide, fallback natif');
            return fallbackNativeSTT();
        }
        log('[Voice] 4. STT result:', result.text);
        return result;
    } catch (err: any) {
        log('Erreur Deepgram STT mobile:', err?.message ?? err);
        reportApiError('Deepgram STT', err, 'deepgramSTT.deepgramTranscribe');
        return fallbackNativeSTT();
    }
}

// ── Transcription web (Blob webm -> binary body) ─────────────────────────────
export async function deepgramTranscribeWeb(audioBlob: Blob): Promise<DeepgramSTTResult> {
    log('[Voice] 3. Sending to Deepgram STT (web), size:', audioBlob.size, 'type:', audioBlob.type);
    log('Deepgram key present:', !!DEEPGRAM_API_KEY);

    if (!DEEPGRAM_API_KEY) {
        log('Pas de cle API Deepgram, fallback Web Speech');
        return fallbackWebSTT();
    }

    // Blob trop petit = pas de voix capturee
    if (audioBlob.size < 1000) {
        log('Audio blob trop petit (<1KB), pas assez de donnees audio');
        return { text: '', source: 'deepgram', confidence: 0 };
    }

    try {
        // Deepgram accepte le binaire brut avec Content-Type explicite
        const contentType = audioBlob.type || 'audio/webm';

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000);

        const res = await fetch(DEEPGRAM_STT_URL, {
            method: 'POST',
            headers: {
                'Authorization': `Token ${DEEPGRAM_API_KEY}`,
                'Content-Type': contentType,
            },
            body: audioBlob,
            signal: controller.signal,
        });
        clearTimeout(timeoutId);

        if (!res.ok) {
            const errBody = await res.text();
            log('Erreur Deepgram (web):', res.status, errBody);
            throw new Error(`Deepgram STT ${res.status}: ${errBody}`);
        }

        const data = await res.json();
        const transcript = parseDeepgramResponse(data);

        log('[Voice] 4. STT result:', transcript.text || '(vide)', 'confidence:', transcript.confidence);

        // Transcript vide = pas de voix detectee, retourne vide au lieu de fallback
        // (le fallback Web Speech ne peut pas reecouter un audio deja enregistre)
        if (!transcript.text) {
            return { text: '', source: 'deepgram', confidence: 0 };
        }

        return transcript;
    } catch (err: any) {
        log('Erreur Deepgram STT web:', err?.message ?? err);
        reportApiError('Deepgram STT Web', err, 'deepgramSTT.deepgramTranscribeWeb');

        // Sur erreur reseau/timeout, propager l'erreur (pas de fallback car le micro est ferme)
        if (err?.name === 'AbortError') {
            throw new Error('La transcription a pris trop de temps. Reessayez.');
        }
        throw err;
    }
}

// ── Helpers communs ──────────────────────────────────────────────────────────

async function sendToDeepgram(body: FormData): Promise<DeepgramSTTResult | null> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    const res = await fetch(DEEPGRAM_STT_URL, {
        method: 'POST',
        headers: {
            'Authorization': `Token ${DEEPGRAM_API_KEY}`,
        },
        body,
        signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (!res.ok) {
        const errBody = await res.text();
        log('Erreur Deepgram:', res.status, errBody);
        throw new Error(`Deepgram STT ${res.status}: ${errBody}`);
    }

    const data = await res.json();
    const result = parseDeepgramResponse(data);
    return result.text ? result : null;
}

function parseDeepgramResponse(data: any): DeepgramSTTResult {
    const channel = data?.results?.channels?.[0];
    const alternative = channel?.alternatives?.[0];
    const transcript = (alternative?.transcript ?? '').trim();
    const confidence = alternative?.confidence;

    log('Transcription Deepgram:', transcript || '(vide)', 'confidence:', confidence);

    return { text: transcript, source: 'deepgram', confidence };
}

// ── Fallback mobile : expo-speech-recognition ────────────────────────────────
async function fallbackNativeSTT(): Promise<DeepgramSTTResult> {
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

// ── Fallback web : Web Speech API ────────────────────────────────────────────
function fallbackWebSTT(): Promise<DeepgramSTTResult> {
    log('Utilisation du Web Speech API (fallback web)');
    return new Promise((resolve, reject) => {
        if (typeof window === 'undefined') {
            reject(new Error('Web Speech API non disponible'));
            return;
        }

        const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
        if (!SR) {
            reject(new Error('Web Speech API non supportee par ce navigateur'));
            return;
        }

        const recognition = new SR();
        recognition.lang = 'fr-FR';
        recognition.continuous = false;
        recognition.interimResults = false;

        const timeout = setTimeout(() => {
            try { recognition.abort(); } catch { /* ignore */ }
            reject(new Error('Web Speech API : timeout'));
        }, 10000);

        recognition.onresult = (event: any) => {
            clearTimeout(timeout);
            const text = event.results?.[0]?.[0]?.transcript ?? '';
            const confidence = event.results?.[0]?.[0]?.confidence;
            resolve({ text, source: 'web', confidence });
        };

        recognition.onerror = (event: any) => {
            clearTimeout(timeout);
            const errMsg = event.error === 'not-allowed'
                ? 'Microphone non autorise'
                : event.error === 'no-speech'
                    ? 'Aucune voix detectee'
                    : `Erreur Web Speech: ${event.error}`;
            reject(new Error(errMsg));
        };

        recognition.onend = () => {
            clearTimeout(timeout);
        };

        recognition.start();
    });
}
