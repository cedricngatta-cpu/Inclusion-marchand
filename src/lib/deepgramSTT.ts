// Deepgram STT (Nova-3) — transcription audio francais
// Web : passe par le proxy serveur Express (evite CORS)
// Mobile : appel direct Deepgram (pas de CORS)
// Fallback mobile : expo-speech-recognition | Fallback web : Web Speech API
import { Platform } from 'react-native';
import { reportApiError } from './errorReporter';

const log = (...args: any[]) => { if (__DEV__) console.log('[DeepgramSTT]', ...args); };

// Cle API pour mobile uniquement (sur web, le serveur proxy gere la cle)
const DEEPGRAM_API_KEY = process.env.EXPO_PUBLIC_DEEPGRAM_API_KEY ?? '';
const DEEPGRAM_STT_URL = 'https://api.deepgram.com/v1/listen?model=nova-3&language=fr&smart_format=true';

// URL du serveur proxy (meme serveur que Socket.io)
const PROXY_BASE_URL = process.env.EXPO_PUBLIC_SOCKET_URL || 'https://inclusion-marchand.onrender.com';
const PROXY_STT_URL = `${PROXY_BASE_URL}/api/deepgram/stt`;

const isWeb = Platform.OS === 'web';

export interface DeepgramSTTResult {
    text: string;
    source: 'deepgram' | 'native' | 'web';
    confidence?: number;
}

// ── Transcription mobile (fichier URI -> FormData -> Deepgram direct) ────────
export async function deepgramTranscribe(audioUri: string): Promise<DeepgramSTTResult> {
    if (!DEEPGRAM_API_KEY) {
        log('Pas de cle API Deepgram, fallback natif');
        return fallbackNativeSTT();
    }

    try {
        log('[Voice] 3. Sending to Deepgram STT (mobile direct)...');

        const fileUri = Platform.OS === 'ios' ? audioUri.replace('file://', '') : audioUri;

        const formData = new FormData();
        formData.append('file', {
            uri: fileUri,
            type: 'audio/m4a',
            name: 'recording.m4a',
        } as any);

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000);

        const res = await fetch(DEEPGRAM_STT_URL, {
            method: 'POST',
            headers: {
                'Authorization': `Token ${DEEPGRAM_API_KEY}`,
            },
            body: formData,
            signal: controller.signal,
        });
        clearTimeout(timeoutId);

        if (!res.ok) {
            const errBody = await res.text();
            log('Erreur Deepgram (mobile):', res.status, errBody);
            throw new Error(`Deepgram STT ${res.status}: ${errBody}`);
        }

        const data = await res.json();
        const result = parseDeepgramResponse(data);

        if (!result.text) {
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

// ── Transcription web (Blob -> proxy serveur Express -> Deepgram) ────────────
export async function deepgramTranscribeWeb(audioBlob: Blob): Promise<DeepgramSTTResult> {
    log('[Voice] 3. Sending to proxy STT (web), size:', audioBlob.size, 'type:', audioBlob.type);

    // Blob trop petit = pas de voix capturee
    if (audioBlob.size < 1000) {
        log('Audio blob trop petit (<1KB), pas assez de donnees audio');
        return { text: '', source: 'deepgram', confidence: 0 };
    }

    try {
        const contentType = audioBlob.type || 'audio/webm';

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000);

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
            log('Erreur proxy STT:', res.status, errBody);
            throw new Error(`Proxy STT ${res.status}: ${errBody}`);
        }

        const data = await res.json();
        const transcript = parseDeepgramResponse(data);

        log('[Voice] 4. STT result:', transcript.text || '(vide)', 'confidence:', transcript.confidence);

        // Transcript vide = pas de voix detectee
        if (!transcript.text) {
            return { text: '', source: 'deepgram', confidence: 0 };
        }

        return transcript;
    } catch (err: any) {
        log('Erreur STT web:', err?.message ?? err);
        reportApiError('Deepgram STT Web', err, 'deepgramSTT.deepgramTranscribeWeb');

        if (err?.name === 'AbortError') {
            throw new Error('La transcription a pris trop de temps. Reessayez.');
        }
        throw err;
    }
}

// ── Helpers communs ──────────────────────────────────────────────────────────

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
