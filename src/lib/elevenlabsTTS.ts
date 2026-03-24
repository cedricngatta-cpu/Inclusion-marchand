// TTS Julaba — Web Speech Synthesis (web) / expo-speech (mobile) en principal
// ElevenLabs conserve en option (cle payante) — desactive par defaut
import { Platform } from 'react-native';
import { cleanTextForSpeech } from './voiceUtils';
import { formatForSpeech } from './ttsFormatter';

const log = (...args: any[]) => { if (__DEV__) console.log('[TTS]', ...args); };

const isWeb = Platform.OS === 'web';

// Tronque intelligemment le texte long pour le TTS
function truncateForSpeech(text: string, maxLen = 300): string {
    if (text.length <= maxLen) return text;
    const lastSpace = text.lastIndexOf(' ', maxLen);
    return lastSpace > 0 ? text.slice(0, lastSpace) : text.slice(0, maxLen);
}

// ======================================================================
// POINT D'ENTREE PRINCIPAL
// ======================================================================

export async function elevenlabsSpeak(text: string, onDone?: () => void): Promise<void> {
    const cleanText = cleanTextForSpeech(text);
    const formatted = formatForSpeech(cleanText || text);
    const truncated = truncateForSpeech(formatted);

    if (!truncated) { onDone?.(); return; }

    try {
        if (isWeb) {
            await webSpeechSpeak(truncated);
        } else {
            await mobileSpeechSpeak(truncated);
        }
        onDone?.();
    } catch (err) {
        log('Erreur TTS:', err);
        onDone?.();
    }
}

export function stopElevenlabsSpeaking(): void {
    // Web Speech Synthesis
    if (isWeb && typeof window !== 'undefined' && window.speechSynthesis) {
        try { window.speechSynthesis.cancel(); } catch { /* ignore */ }
    }

    // Mobile expo-speech
    if (!isWeb) {
        try { require('expo-speech').stop(); } catch { /* ignore */ }
    }
}

// ======================================================================
// WEB : Web Speech Synthesis avec voix francaise fixe
// ======================================================================

let cachedVoice: SpeechSynthesisVoice | null = null;
let voiceCacheReady = false;

function getFixedFrenchVoice(): SpeechSynthesisVoice | null {
    if (voiceCacheReady) return cachedVoice;
    if (typeof window === 'undefined' || !window.speechSynthesis) return null;

    const voices = window.speechSynthesis.getVoices();
    if (!voices.length) return null;

    // Chercher une voix francaise de qualite (ordre de preference)
    const preferred = ['Google français', 'Microsoft Denise', 'Amelie', 'Marie', 'Thomas', 'French'];
    for (const name of preferred) {
        const v = voices.find(voice => voice.name.includes(name) && voice.lang.startsWith('fr'));
        if (v) { cachedVoice = v; voiceCacheReady = true; return v; }
    }

    // Fallback : n'importe quelle voix francaise
    cachedVoice = voices.find(v => v.lang.startsWith('fr')) ?? null;
    voiceCacheReady = true;
    log('Voix selectionnee:', cachedVoice?.name ?? 'defaut navigateur');
    return cachedVoice;
}

// Pre-charger les voix (Chrome les charge en async)
if (isWeb && typeof window !== 'undefined' && window.speechSynthesis) {
    window.speechSynthesis.onvoiceschanged = () => {
        voiceCacheReady = false;
        getFixedFrenchVoice();
    };
    getFixedFrenchVoice();
}

function webSpeechSpeak(text: string): Promise<void> {
    return new Promise((resolve, reject) => {
        if (typeof window === 'undefined' || !window.speechSynthesis) {
            log('Web Speech Synthesis non disponible');
            resolve();
            return;
        }

        window.speechSynthesis.cancel();

        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = 'fr-FR';
        utterance.rate = 0.95;
        utterance.pitch = 1.1;

        const voice = getFixedFrenchVoice();
        if (voice) utterance.voice = voice;

        utterance.onend = () => {
            log('TTS Web Speech termine');
            resolve();
        };
        utterance.onerror = (e) => {
            log('TTS Web Speech erreur:', e);
            reject(e);
        };

        // Petit delai pour Chrome qui peut ignorer speak() appele trop tot
        setTimeout(() => {
            window.speechSynthesis.speak(utterance);
        }, 50);
    });
}

// ======================================================================
// MOBILE : expo-speech
// ======================================================================

async function mobileSpeechSpeak(text: string): Promise<void> {
    // Basculer en mode haut-parleur avant de parler
    try {
        const { setAudioModeAsync } = await import('expo-audio');
        await setAudioModeAsync({
            allowsRecording: false,
            playsInSilentMode: true,
            shouldPlayInBackground: false,
            interruptionMode: 'duckOthers' as const,
            shouldRouteThroughEarpiece: false,
        });
        // Petit delai pour laisser le mode audio se stabiliser
        await new Promise<void>(r => setTimeout(r, 300));
    } catch {
        // Pas grave si le mode audio echoue
    }

    const Speech = require('expo-speech');
    return new Promise<void>((resolve) => {
        Speech.speak(text, {
            language: 'fr-FR',
            pitch: 1.1,
            rate: 0.9,
            onDone: () => { log('TTS expo-speech termine'); resolve(); },
            onError: () => { log('TTS expo-speech erreur'); resolve(); },
        });
    });
}

// ======================================================================
// ELEVENLABS — OPTION DESACTIVEE (cle payante requise)
// Decommenter elevenlabsSpeakPremium() et l'appeler dans elevenlabsSpeak()
// si le tier payant est actif.
// ======================================================================

/*
const ELEVENLABS_API_KEY = process.env.EXPO_PUBLIC_ELEVENLABS_API_KEY || '';
const VOICE_ID = 'EXAVITQu4vr4xnSDxMaL'; // Aria
const ELEVENLABS_TTS_URL = `https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}`;
const PROXY_BASE_URL = process.env.EXPO_PUBLIC_SOCKET_URL || 'https://inclusion-marchand.onrender.com';
const PROXY_TTS_URL = `${PROXY_BASE_URL}/api/elevenlabs/tts`;

async function elevenlabsSpeakPremium(text: string, onDone?: () => void): Promise<void> {
    const controller = new AbortController();
    const timeout = isWeb ? 8000 : 15000;
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    let res: Response;
    if (isWeb) {
        res = await fetch(PROXY_TTS_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text, voice_id: VOICE_ID }),
            signal: controller.signal,
        });
    } else {
        res = await fetch(ELEVENLABS_TTS_URL, {
            method: 'POST',
            headers: { 'xi-api-key': ELEVENLABS_API_KEY, 'Content-Type': 'application/json' },
            body: JSON.stringify({
                text,
                model_id: 'eleven_flash_v2_5',
                voice_settings: { stability: 0.5, similarity_boost: 0.75, style: 0.3 },
            }),
            signal: controller.signal,
        });
    }
    clearTimeout(timeoutId);

    if (!res.ok) throw new Error(`ElevenLabs ${res.status}`);

    // Playback selon la plateforme...
    // (voir code original pour playOnWeb / playOnMobile)
}
*/
