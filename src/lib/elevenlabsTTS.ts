// ElevenLabs TTS — synthese vocale haute qualite
// Mobile : appel direct ElevenLabs (pas de CORS) + playback expo-audio
// Web : passe par le proxy serveur Render (evite CORS) + playback Audio API
// Fallback : expo-speech (mobile) / Web Speech Synthesis (web)
import { Platform } from 'react-native';
import { cleanTextForSpeech } from './voiceUtils';
import { formatForSpeech } from './ttsFormatter';
import { reportApiError } from './errorReporter';

const log = (...args: any[]) => { if (__DEV__) console.log('[ElevenLabsTTS]', ...args); };

const ELEVENLABS_API_KEY = process.env.EXPO_PUBLIC_ELEVENLABS_API_KEY || '';
// Aria — voix multilingue, fonctionne bien en francais
const VOICE_ID = 'EXAVITQu4vr4xnSDxMaL';
const ELEVENLABS_TTS_URL = `https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}`;

// URL du serveur proxy (meme serveur que Socket.io)
const PROXY_BASE_URL = process.env.EXPO_PUBLIC_SOCKET_URL || 'https://inclusion-marchand.onrender.com';
const PROXY_TTS_URL = `${PROXY_BASE_URL}/api/elevenlabs/tts`;

const isWeb = Platform.OS === 'web';

// ── Reference au player actif ────────────────────────────────────────────────
let activeMobilePlayer: any = null;
let activeWebAudio: HTMLAudioElement | null = null;
let activeWebObjectUrl: string | null = null;

// Tronque intelligemment le texte long pour le TTS
function truncateForSpeech(text: string, maxLen = 250): string {
    if (text.length <= maxLen) return text;
    const cut = text.slice(0, maxLen);
    const lastSentence = Math.max(cut.lastIndexOf('.'), cut.lastIndexOf('!'), cut.lastIndexOf('?'));
    if (lastSentence > maxLen * 0.4) return cut.slice(0, lastSentence + 1);
    const lastSpace = cut.lastIndexOf(' ');
    return lastSpace > 0 ? cut.slice(0, lastSpace) + '.' : cut + '.';
}

// ══════════════════════════════════════════════════════════════════════════════
// POINT D'ENTREE PRINCIPAL
// ══════════════════════════════════════════════════════════════════════════════

export async function elevenlabsSpeak(text: string, onDone?: () => void): Promise<void> {
    const cleanText = cleanTextForSpeech(text);

    // Sur mobile : besoin de la cle API. Sur web : le proxy gere la cle.
    const canCallAPI = isWeb || !!ELEVENLABS_API_KEY;

    if (!canCallAPI || !cleanText) {
        fallbackSpeak(formatForSpeech(cleanText || text), onDone);
        return;
    }

    // Tronquer + formater les nombres en mots francais
    const ttsText = formatForSpeech(truncateForSpeech(cleanText));

    try {
        log('[Voice] 7. Sending to ElevenLabs TTS...');

        const controller = new AbortController();
        const timeout = isWeb ? 8000 : 15000;
        const timeoutId = setTimeout(() => controller.abort(), timeout);

        let res: Response;

        if (isWeb) {
            // Web : passer par le proxy serveur (evite CORS)
            res = await fetch(PROXY_TTS_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text: ttsText, voice_id: VOICE_ID }),
                signal: controller.signal,
            });
        } else {
            // Mobile : appel direct ElevenLabs
            res = await fetch(ELEVENLABS_TTS_URL, {
                method: 'POST',
                headers: {
                    'xi-api-key': ELEVENLABS_API_KEY,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    text: ttsText,
                    model_id: 'eleven_flash_v2_5',
                    voice_settings: {
                        stability: 0.5,
                        similarity_boost: 0.75,
                        style: 0.3,
                    },
                }),
                signal: controller.signal,
            });
        }
        clearTimeout(timeoutId);

        if (!res.ok) {
            const errBody = await res.text();
            log('Erreur ElevenLabs TTS:', res.status, errBody);
            throw new Error(`ElevenLabs TTS ${res.status}: ${errBody}`);
        }

        log('[Voice] 8. TTS playing');

        if (isWeb) {
            await playOnWeb(res, onDone);
        } else {
            await playOnMobile(res, onDone);
        }
    } catch (err: any) {
        log('Erreur ElevenLabs TTS, fallback:', err?.message ?? err);
        reportApiError('ElevenLabs TTS', err, 'elevenlabsTTS.elevenlabsSpeak');
        fallbackSpeak(ttsText, onDone);
    }
}

export function stopElevenlabsSpeaking(): void {
    // Web Audio
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

    stopElevenlabsSpeaking();

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
    const filePath = `${Paths.cache.uri}elevenlabs_tts_${Date.now()}.mp3`;
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
    stopElevenlabsSpeaking();
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

// ── Cache voix feminine francaise ────────────────────────────────────────────
let cachedFrFemaleVoice: SpeechSynthesisVoice | null = null;
let voiceCacheReady = false;

function getFrenchFemaleVoice(): SpeechSynthesisVoice | null {
    if (voiceCacheReady) return cachedFrFemaleVoice;
    if (typeof window === 'undefined' || !window.speechSynthesis) return null;

    const voices = window.speechSynthesis.getVoices();
    if (!voices.length) return null;

    cachedFrFemaleVoice =
        voices.find(v => v.lang.startsWith('fr') && /female|femme|féminin/i.test(v.name)) ??
        voices.find(v => v.lang.startsWith('fr') && /amelie|aurelie|marie|celine|lea|virginie|agathe/i.test(v.name)) ??
        voices.find(v => v.lang.startsWith('fr')) ??
        null;

    voiceCacheReady = true;
    log('Voix selectionnee:', cachedFrFemaleVoice?.name ?? 'defaut');
    return cachedFrFemaleVoice;
}

if (isWeb && typeof window !== 'undefined' && window.speechSynthesis) {
    window.speechSynthesis.onvoiceschanged = () => {
        voiceCacheReady = false;
        getFrenchFemaleVoice();
    };
    getFrenchFemaleVoice();
}

function fallbackWebSpeechSynthesis(text: string, onDone?: () => void): void {
    log('Utilisation Web Speech Synthesis (fallback web)');

    if (typeof window === 'undefined' || !window.speechSynthesis) {
        log('Web Speech Synthesis non disponible');
        onDone?.();
        return;
    }

    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'fr-FR';
    utterance.rate = 0.9;

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

    setTimeout(() => {
        window.speechSynthesis.speak(utterance);
    }, 50);
}

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
