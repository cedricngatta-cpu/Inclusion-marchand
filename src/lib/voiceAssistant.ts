// Logique audio de l'assistant vocal (enregistrement + TTS)
// La gestion de la conversation est dans VoiceModal
import { Audio } from 'expo-av';
import * as Speech from 'expo-speech';
import { fetchRoleContext, buildSystemPrompt, GroqMessage } from './groqAI';

export type AssistantState =
    | 'idle'
    | 'welcome'
    | 'listening'
    | 'processing'
    | 'speaking'
    | 'confirming'
    | 'error';

// ── Enregistrement audio ───────────────────────────────────────────────────
let recordingInstance: Audio.Recording | null = null;

export async function startRecording(): Promise<void> {
    await Audio.requestPermissionsAsync();
    await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
    const { recording } = await Audio.Recording.createAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
    recordingInstance = recording;
}

export async function stopRecording(): Promise<string | null> {
    if (!recordingInstance) return null;
    await recordingInstance.stopAndUnloadAsync();
    const uri = recordingInstance.getURI();
    recordingInstance = null;
    await Audio.setAudioModeAsync({ allowsRecordingIOS: false });
    return uri;
}

export async function cancelRecording(): Promise<void> {
    if (!recordingInstance) return;
    try { await recordingInstance.stopAndUnloadAsync(); } catch { /* ignore */ }
    recordingInstance = null;
    await Audio.setAudioModeAsync({ allowsRecordingIOS: false });
}

// ── TTS ────────────────────────────────────────────────────────────────────
export function stopSpeaking(): void {
    Speech.stop();
}

export function speakText(text: string, onDone?: () => void): void {
    Speech.speak(text, {
        language: 'fr-FR',
        rate: 0.9,
        onDone:  onDone ?? (() => {}),
        onError: onDone ?? (() => {}),
    });
}

// ── Initialisation de la conversation ─────────────────────────────────────
// Retourne le message système à mettre en tête de groqHistory
export async function initConversation(
    role: string,
    userId: string,
    userName: string,
    storeId?: string,
): Promise<GroqMessage> {
    const donneesContext = await fetchRoleContext(role, userId, storeId);
    const content        = buildSystemPrompt(userName, role, donneesContext);
    return { role: 'system', content };
}

// ── Helpers de confirmation vocale ────────────────────────────────────────
const YES = ['oui', 'ok', 'vas-y', 'confirme', 'valide', 'accord', 'yes', 'ouais'];
const NO  = ['non', 'annule', 'laisse', 'no', 'annuler', 'pas', 'arrête'];

function normalize(t: string) {
    return t.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

export function isVoiceConfirmation(text: string): boolean {
    const n = normalize(text);
    // Courte phrase (≤ 3 mots) avec un mot oui
    return text.trim().split(/\s+/).length <= 3 && YES.some(w => n.includes(w));
}

export function isVoiceCancellation(text: string): boolean {
    const n = normalize(text);
    return text.trim().split(/\s+/).length <= 3 && NO.some(w => n.includes(w));
}

// ── Helpers de navigation locale ──────────────────────────────────────────
import { matchLocalCommand } from './voiceCommands';

export function getLocalRoute(transcript: string, role: string): string | null {
    const result = matchLocalCommand(transcript, role);
    return result.type === 'navigation' ? (result.command?.route ?? null) : null;
}

export function isLogoutCommand(transcript: string, role: string): boolean {
    return matchLocalCommand(transcript, role).type === 'logout';
}

export function isLocalCommand(transcript: string, role: string): boolean {
    return matchLocalCommand(transcript, role).type !== 'none';
}

export function getLocalConfirmation(transcript: string, role: string): string | null {
    const result = matchLocalCommand(transcript, role);
    return result.type !== 'none' ? (result.confirmation ?? null) : null;
}
