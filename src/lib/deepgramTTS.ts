// Deepgram TTS (Aura-2 Agathe) — synthese vocale francaise haute qualite
// Web : passe par le proxy serveur Express (evite CORS)
// Mobile : appel direct Deepgram (pas de CORS)
// Fallback mobile : expo-speech | Fallback web : Web Speech Synthesis
import { Platform } from 'react-native';
import { cleanTextForSpeech } from './voiceAssistant';
import { reportApiError } from './errorReporter';

const log = (...args: any[]) => { if (__DEV__) console.log('[DeepgramTTS]', ...args); };

// Cle API pour mobile uniquement (sur web, le serveur proxy gere la cle)
const DEEPGRAM_API_KEY = process.env.EXPO_PUBLIC_DEEPGRAM_API_KEY ?? '';
const DEEPGRAM_TTS_URL = 'https://api.deepgram.com/v1/speak?model=aura-2-agathe-fr';

// URL du serveur proxy (meme serveur que Socket.io)
const PROXY_BASE_URL = process.env.EXPO_PUBLIC_SOCKET_URL || 'https://inclusion-marchand.onrender.com';
const PROXY_TTS_URL = `${PROXY_BASE_URL}/api/deepgram/tts`;

const isWeb = Platform.OS === 'web';

// ── Reference au player actif (mobile : AudioPlayer, web : HTMLAudioElement) ─
let activeMobilePlayer: any = null;
let activeWebAudio: HTMLAudioElement | null = null;
let activeWebObjectUrl: string | null = null;

// ══════════════════════════════════════════════════════════════════════════════
// POINT D'ENTREE PRINCIPAL
// ══════════════════════════════════════════════════════════════════════════════

export async function deepgramSpeak(text: string, onDone?: () => void): Promise<void> {
    const cleanText = cleanTextForSpeech(text);

    // Sur mobile : besoin de la cle API. Sur web : le proxy gere la cle.
    const canCallAPI = isWeb || !!DEEPGRAM_API_KEY;

    if (!canCallAPI || !cleanText) {
        fallbackSpeak(cleanText || text, onDone);
        return;
    }

    try {
        log('[Voice] 7. Sending to TTS...');

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000);

        let res: Response;

        if (isWeb) {
            // Web : passer par le proxy serveur (evite CORS)
            res = await fetch(PROXY_TTS_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text: cleanText }),
                signal: controller.signal,
            });
        } else {
            // Mobile : appel direct Deepgram
            res = await fetch(DEEPGRAM_TTS_URL, {
                method: 'POST',
                headers: {
                    'Authorization': `Token ${DEEPGRAM_API_KEY}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ text: cleanText }),
                signal: controller.signal,
            });
        }
        clearTimeout(timeoutId);

        if (!res.ok) {
            const errBody = await res.text();
            log('Erreur TTS:', res.status, errBody);
            throw new Error(`TTS ${res.status}: ${errBody}`);
        }

        log('[Voice] 8. TTS playing');

        if (isWeb) {
            await playOnWeb(res, onDone);
        } else {
            await playOnMobile(res, onDone);
        }
    } catch (err: any) {
        log('Erreur TTS, fallback:', err?.message ?? err);
        reportApiError('Deepgram TTS', err, 'deepgramTTS.deepgramSpeak');
        fallbackSpeak(cleanText, onDone);
    }
}

export function stopDeepgramSpeaking(): void {
    // Web
    if (activeWebAudio) {
        try { activeWebAudio.pause(); activeWebAudio.currentTime = 0; } catch { /* ignore */ }
        activeWebAudio = null;
    }
    if (activeWebObjectUrl) {
        try { URL.revokeObjectURL(activeWebObjectUrl); } catch { /* ignore */ }
        activeWebObjectUrl = null;
    }

    // Web Speech Synthesis
    if (isWeb && typeof window !== 'undefined' && window.speechSynthesis) {
        try { window.speechSynthesis.cancel(); } catch { /* ignore */ }
    }

    // Mobile expo-audio player
    if (activeMobilePlayer) {
        try { activeMobilePlayer.pause(); } catch { /* ignore */ }
        activeMobilePlayer = null;
    }

    // Mobile expo-speech
    if (!isWeb) {
        try {
            const Speech = require('expo-speech');
            Speech.stop();
        } catch { /* ignore */ }
    }
}

// ══════════════════════════════════════════════════════════════════════════════
// WEB : Audio API navigateur
// ══════════════════════════════════════════════════════════════════════════════

async function playOnWeb(res: Response, onDone?: () => void): Promise<void> {
    const audioBlob = await res.blob();
    log('Audio recu, taille:', audioBlob.size, 'type:', audioBlob.type);

    // Arreter tout audio en cours
    stopDeepgramSpeaking();

    const url = URL.createObjectURL(audioBlob);
    activeWebObjectUrl = url;

    const audio = new Audio(url);
    activeWebAudio = audio;

    audio.onended = () => {
        log('TTS termine (web)');
        URL.revokeObjectURL(url);
        activeWebAudio = null;
        activeWebObjectUrl = null;
        onDone?.();
    };

    audio.onerror = () => {
        log('Erreur lecture audio web, fallback');
        URL.revokeObjectURL(url);
        activeWebAudio = null;
        activeWebObjectUrl = null;
        fallbackSpeak('', onDone);
    };

    await audio.play();
}

// ══════════════════════════════════════════════════════════════════════════════
// MOBILE : expo-audio + expo-file-system
// ══════════════════════════════════════════════════════════════════════════════

async function playOnMobile(res: Response, onDone?: () => void): Promise<void> {
    const { createAudioPlayer, setAudioModeAsync } = await import('expo-audio');
    const { Paths } = await import('expo-file-system');
    const { writeAsStringAsync, deleteAsync } = await import('expo-file-system');

    // Convertir la reponse en base64
    const arrayBuffer = await res.arrayBuffer();
    const bytes = new Uint8Array(arrayBuffer);
    let binary = '';
    for (let i = 0; i < bytes.length; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    const base64 = btoa(binary);

    // Sauvegarder en fichier temporaire
    const filePath = `${Paths.cache.uri}deepgram_tts_${Date.now()}.mp3`;
    await writeAsStringAsync(filePath, base64, { encoding: 'base64' });
    log('Audio sauvegarde:', filePath);

    // Basculer en mode lecture haut-parleur
    await setAudioModeAsync({
        allowsRecording: false,
        playsInSilentMode: true,
        shouldPlayInBackground: false,
        interruptionMode: 'duckOthers' as const,
        shouldRouteThroughEarpiece: false,
    });

    // Jouer l'audio
    stopDeepgramSpeaking();
    const player = createAudioPlayer(filePath);
    activeMobilePlayer = player;

    player.addListener('playbackStatusUpdate', (status: any) => {
        if (status.didJustFinish) {
            log('TTS termine (mobile)');
            activeMobilePlayer = null;
            deleteAsync(filePath, { idempotent: true }).catch(() => {});
            onDone?.();
        }
    });

    player.play();
}

// ══════════════════════════════════════════════════════════════════════════════
// FALLBACKS
// ══════════════════════════════════════════════════════════════════════════════

function fallbackSpeak(text: string, onDone?: () => void): void {
    if (isWeb) {
        fallbackWebSpeechSynthesis(text, onDone);
    } else {
        fallbackExpoSpeech(text, onDone);
    }
}

// ── Cache voix feminine francaise (evite de recalculer a chaque appel) ────────
let cachedFrFemaleVoice: SpeechSynthesisVoice | null = null;
let voiceCacheReady = false;

function getFrenchFemaleVoice(): SpeechSynthesisVoice | null {
    if (voiceCacheReady) return cachedFrFemaleVoice;
    if (typeof window === 'undefined' || !window.speechSynthesis) return null;

    const voices = window.speechSynthesis.getVoices();
    if (!voices.length) return null;

    // Priorite : voix feminine francaise explicite
    cachedFrFemaleVoice =
        voices.find(v => v.lang.startsWith('fr') && /female|femme|féminin/i.test(v.name)) ??
        voices.find(v => v.lang.startsWith('fr') && /amelie|aurelie|marie|celine|lea|virginie|agathe/i.test(v.name)) ??
        voices.find(v => v.lang.startsWith('fr')) ??
        null;

    voiceCacheReady = true;
    log('Voix selectionnee:', cachedFrFemaleVoice?.name ?? 'defaut');
    return cachedFrFemaleVoice;
}

// Pre-charger les voix (Chrome les charge de maniere asynchrone)
if (isWeb && typeof window !== 'undefined' && window.speechSynthesis) {
    window.speechSynthesis.onvoiceschanged = () => {
        voiceCacheReady = false;
        getFrenchFemaleVoice();
    };
    getFrenchFemaleVoice();
}

// ── Web : SpeechSynthesis API ────────────────────────────────────────────────
function fallbackWebSpeechSynthesis(text: string, onDone?: () => void): void {
    log('Utilisation Web Speech Synthesis (fallback web)');

    if (typeof window === 'undefined' || !window.speechSynthesis) {
        log('Web Speech Synthesis non disponible');
        onDone?.();
        return;
    }

    // Annuler tout TTS en cours
    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'fr-FR';
    utterance.rate = 0.9;

    // Forcer la voix feminine francaise
    const voice = getFrenchFemaleVoice();
    if (voice) utterance.voice = voice;

    utterance.onend = () => {
        log('TTS Web Speech Synthesis termine');
        onDone?.();
    };

    utterance.onerror = () => {
        log('TTS Web Speech Synthesis erreur');
        onDone?.();
    };

    // Workaround Chrome : speechSynthesis.speak() doit etre appele
    // dans un contexte utilisateur ou apres un petit delai
    setTimeout(() => {
        window.speechSynthesis.speak(utterance);
    }, 50);
}

// ── Mobile : expo-speech ─────────────────────────────────────────────────────
function fallbackExpoSpeech(text: string, onDone?: () => void): void {
    log('Utilisation expo-speech (fallback mobile)');

    import('expo-audio').then(({ setAudioModeAsync }) => {
        return setAudioModeAsync({
            allowsRecording: false,
            playsInSilentMode: true,
            shouldPlayInBackground: false,
            interruptionMode: 'duckOthers' as const,
            shouldRouteThroughEarpiece: false,
        });
    })
    .then(() => new Promise<void>(resolve => setTimeout(resolve, 500)))
    .then(() => {
        const Speech = require('expo-speech');
        Speech.speak(text, {
            language: 'fr-FR',
            rate: 0.9,
            pitch: 1.1,
            onDone: () => { log('TTS expo-speech termine'); onDone?.(); },
            onError: () => { log('TTS expo-speech erreur'); onDone?.(); },
        });
    })
    .catch(() => {
        try {
            const Speech = require('expo-speech');
            Speech.speak(text, {
                language: 'fr-FR',
                rate: 0.9,
                pitch: 1.1,
                onDone: () => onDone?.(),
                onError: () => onDone?.(),
            });
        } catch {
            onDone?.();
        }
    });
}
