// STT hybride : Groq Whisper (online) + STT natif (offline)
// Switch automatique selon la connectivite reseau
//
// IMPORTANT : expo-speech-recognition necessite un dev build (APK).
// Sur Expo Go, le module natif ExpoSpeechRecognition n'existe pas et
// require('expo-speech-recognition') crashe au TOP-LEVEL (requireNativeModule).
// On verifie d'abord via expo-modules-core AVANT d'importer le package.
import { Platform } from 'react-native';
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

// ── Helper : charger ExpoSpeechRecognitionModule en toute securite ────────
// On ne fait JAMAIS require('expo-speech-recognition') sans avoir d'abord
// verifie que le module natif existe via expo-modules-core.
let _esrModule: any = null;
let _esrChecked = false;

function getESR(): any {
    if (_esrChecked) return _esrModule;
    _esrChecked = true;

    // Sur web ou iOS, pas de STT natif Android
    if (isWeb) {
        log('Web detecte, STT natif desactive');
        return null;
    }

    try {
        // Etape 1 : verifier que le module natif existe AVANT d'importer le package
        const expoModulesCore = require('expo-modules-core');
        // requireNativeModule throw si le module n'est pas dans le bundle natif
        expoModulesCore.requireNativeModule('ExpoSpeechRecognition');
        log('Module natif ExpoSpeechRecognition detecte');
    } catch {
        // Module natif absent = Expo Go, pas de dev build
        log('Module natif ExpoSpeechRecognition absent (Expo Go). STT natif desactive.');
        _esrModule = null;
        return null;
    }

    try {
        // Etape 2 : le module natif existe, on peut importer le package en securite
        const mod = require('expo-speech-recognition');
        _esrModule = mod?.ExpoSpeechRecognitionModule ?? null;
        if (_esrModule) log('ExpoSpeechRecognitionModule charge avec succes');
        else log('ExpoSpeechRecognitionModule non trouve dans le package');
    } catch (err: any) {
        log('Erreur import expo-speech-recognition:', err?.message ?? err);
        _esrModule = null;
    }
    return _esrModule;
}

// ── Trigger du telechargement offline au premier lancement ─────────────────
let offlineModelRequested = false;

export function triggerOfflineModelDownload(): void {
    if (offlineModelRequested || isWeb || Platform.OS !== 'android') return;
    offlineModelRequested = true;
    const esr = getESR();
    if (!esr) return;
    try {
        esr.androidTriggerOfflineModelDownload({ locale: 'fr-FR' });
        log('Telechargement modele offline fr-FR declenche');
    } catch (err) {
        log('Impossible de declencher le telechargement offline:', err);
    }
}

// ── STT natif (offline) via expo-speech-recognition ────────────────────────
export function nativeSpeechRecognition(): Promise<STTResult> {
    const esr = getESR();
    if (!esr) {
        log('STT natif non disponible. Utilisez un dev build ou le STT Deepgram.');
        return Promise.reject(new Error('STT natif indisponible en Expo Go. Utilisez un dev build.'));
    }

    return new Promise((resolve, reject) => {
        let finalText = '';
        let resolved = false;

        const timeout = setTimeout(() => {
            if (!resolved) {
                resolved = true;
                try { esr.abort(); } catch { /* ignore */ }
                if (finalText) {
                    resolve({ text: finalText, mode: 'offline' });
                } else {
                    reject(new Error('STT natif : timeout sans resultat'));
                }
            }
        }, 15000);

        const cleanup = () => { clearTimeout(timeout); };

        const resultSub = esr.addListener('result', (event: any) => {
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
                    finalText = transcript;
                }
            }
        });

        const errorSub = esr.addListener('error', (event: any) => {
            if (!resolved) {
                resolved = true;
                cleanup();
                resultSub.remove();
                errorSub.remove();
                endSub.remove();
                reject(new Error(event?.error ?? 'Erreur STT natif'));
            }
        });

        const endSub = esr.addListener('end', () => {
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

        try {
            esr.start({
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
    const esr = getESR();
    if (!esr) return;
    try { esr.stop(); } catch { /* ignore */ }
}

export function abortNativeSpeechRecognition(): void {
    const esr = getESR();
    if (!esr) return;
    try { esr.abort(); } catch { /* ignore */ }
}

// ── STT online (Groq Whisper) ──────────────────────────────────────────────
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
    const esr = getESR();
    if (!esr) return false;
    try {
        return esr.isRecognitionAvailable();
    } catch {
        return false;
    }
}

export function supportsOfflineRecognition(): boolean {
    if (isWeb) return false;
    const esr = getESR();
    if (!esr) return false;
    try {
        return esr.supportsOnDeviceRecognition();
    } catch {
        return false;
    }
}

// ── Permissions ────────────────────────────────────────────────────────────
export async function requestSTTPermissions(): Promise<boolean> {
    const esr = getESR();
    if (!esr) return false;
    try {
        const result = await esr.requestPermissionsAsync();
        return result.granted;
    } catch {
        return false;
    }
}
