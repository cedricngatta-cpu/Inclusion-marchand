// STT hybride : Groq Whisper (online) + STT natif (offline)
// Switch automatique selon la connectivite reseau
import { Platform } from 'react-native';
import { ExpoSpeechRecognitionModule } from 'expo-speech-recognition';
import { isOnline, transcribeAudio } from './groqAI';
import { startRecording, stopRecording } from './voiceAssistant';
import { isWeb } from './platform';

const log = (...args: any[]) => { if (__DEV__) console.log('[STT]', ...args); };

// ── Types ──────────────────────────────────────────────────────────────────
export type STTMode = 'online' | 'offline';

export interface STTResult {
    text: string;
    mode: STTMode;
    confidence?: number;
}

// ── Trigger du telechargement offline au premier lancement ─────────────────
let offlineModelRequested = false;

export function triggerOfflineModelDownload(): void {
    if (offlineModelRequested || isWeb || Platform.OS !== 'android') return;
    offlineModelRequested = true;
    try {
        ExpoSpeechRecognitionModule.androidTriggerOfflineModelDownload({ locale: 'fr-FR' });
        log('Telechargement modele offline fr-FR declenche');
    } catch (err) {
        log('Impossible de declencher le telechargement offline:', err);
    }
}

// ── STT natif (offline) via expo-speech-recognition ────────────────────────
export function nativeSpeechRecognition(): Promise<STTResult> {
    return new Promise((resolve, reject) => {
        let finalText = '';
        let resolved = false;

        // Timeout de securite : 15s max
        const timeout = setTimeout(() => {
            if (!resolved) {
                resolved = true;
                try { ExpoSpeechRecognitionModule.abort(); } catch { /* ignore */ }
                if (finalText) {
                    resolve({ text: finalText, mode: 'offline' });
                } else {
                    reject(new Error('STT natif : timeout sans resultat'));
                }
            }
        }, 15000);

        const cleanup = () => {
            clearTimeout(timeout);
        };

        // Ecouter les resultats
        const resultSub = ExpoSpeechRecognitionModule.addListener('result', (event: any) => {
            const results = event?.results;
            if (results && results.length > 0) {
                const best = results[0];
                const transcript = best?.transcript ?? '';
                const isFinal = event?.isFinal ?? false;
                const confidence = best?.confidence;

                if (isFinal && transcript && !resolved) {
                    resolved = true;
                    cleanup();
                    resultSub.remove();
                    errorSub.remove();
                    endSub.remove();
                    resolve({ text: transcript, mode: 'offline', confidence });
                } else if (transcript) {
                    finalText = transcript; // stocker le partiel
                }
            }
        });

        // Ecouter les erreurs
        const errorSub = ExpoSpeechRecognitionModule.addListener('error', (event: any) => {
            if (!resolved) {
                resolved = true;
                cleanup();
                resultSub.remove();
                errorSub.remove();
                endSub.remove();
                reject(new Error(event?.error ?? 'Erreur STT natif'));
            }
        });

        // Ecouter la fin
        const endSub = ExpoSpeechRecognitionModule.addListener('end', () => {
            if (!resolved) {
                resolved = true;
                cleanup();
                resultSub.remove();
                errorSub.remove();
                endSub.remove();
                if (finalText) {
                    resolve({ text: finalText, mode: 'offline' });
                } else {
                    reject(new Error('STT natif : aucun texte reconnu'));
                }
            }
        });

        // Demarrer la reconnaissance
        try {
            ExpoSpeechRecognitionModule.start({
                lang: 'fr-FR',
                interimResults: true,
                requiresOnDeviceRecognition: true,
            });
        } catch (err: any) {
            if (!resolved) {
                resolved = true;
                cleanup();
                resultSub.remove();
                errorSub.remove();
                endSub.remove();
                reject(new Error(`Impossible de demarrer le STT natif : ${err?.message ?? err}`));
            }
        }
    });
}

export function stopNativeSpeechRecognition(): void {
    try {
        ExpoSpeechRecognitionModule.stop();
    } catch { /* ignore */ }
}

export function abortNativeSpeechRecognition(): void {
    try {
        ExpoSpeechRecognitionModule.abort();
    } catch { /* ignore */ }
}

// ── STT online (Groq Whisper) ──────────────────────────────────────────────
async function onlineSTT(): Promise<STTResult> {
    await startRecording();
    // L'appelant doit appeler stopOnlineSTT() apres un delai ou un evenement utilisateur
    // On retourne une promesse qui sera resolue par stopOnlineSTT
    throw new Error('Utilisez startOnlineRecording() + stopOnlineRecording() a la place');
}

export async function startOnlineRecording(): Promise<void> {
    await startRecording();
}

export async function stopOnlineRecording(): Promise<STTResult> {
    const uri = await stopRecording();
    if (!uri) throw new Error("Impossible d'acceder au micro.");
    const text = await transcribeAudio(uri);
    return { text, mode: 'online' };
}

// ── Detecteur de mode automatique ──────────────────────────────────────────
let currentMode: STTMode = 'online';
let forceMode: STTMode | null = null;

export function getSTTMode(): STTMode {
    return forceMode ?? currentMode;
}

export function setForceSTTMode(mode: STTMode | null): void {
    forceMode = mode;
    log('Mode STT force:', mode ?? 'auto');
}

export async function detectSTTMode(): Promise<STTMode> {
    if (forceMode) {
        currentMode = forceMode;
        return forceMode;
    }
    const online = await isOnline();
    currentMode = online ? 'online' : 'offline';
    log('Mode STT detecte:', currentMode);
    return currentMode;
}

// ── Verifier disponibilite STT natif ───────────────────────────────────────
export function isNativeSTTAvailable(): boolean {
    if (isWeb) return false;
    try {
        return ExpoSpeechRecognitionModule.isRecognitionAvailable();
    } catch {
        return false;
    }
}

export function supportsOfflineRecognition(): boolean {
    if (isWeb) return false;
    try {
        return ExpoSpeechRecognitionModule.supportsOnDeviceRecognition();
    } catch {
        return false;
    }
}

// ── Permissions ────────────────────────────────────────────────────────────
export async function requestSTTPermissions(): Promise<boolean> {
    try {
        const result = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
        return result.granted;
    } catch {
        return false;
    }
}
