// Feedback scanner : bip sonore (AudioContext) + vibration + animation CSS scanline
import { Platform, Vibration } from 'react-native';

// ── Bip sonore via Web AudioContext (aucun fichier MP3 requis) ──────────────
let audioCtx: AudioContext | null = null;

export function playBeepSound() {
    if (Platform.OS !== 'web') return;
    try {
        if (!audioCtx) {
            audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
        }
        const oscillator = audioCtx.createOscillator();
        const gainNode = audioCtx.createGain();

        oscillator.connect(gainNode);
        gainNode.connect(audioCtx.destination);

        oscillator.type = 'sine';
        oscillator.frequency.setValueAtTime(1200, audioCtx.currentTime);
        gainNode.gain.setValueAtTime(0.3, audioCtx.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.2);

        oscillator.start(audioCtx.currentTime);
        oscillator.stop(audioCtx.currentTime + 0.2);
    } catch (e) {
        console.log('[Scanner] Beep error:', e);
    }
}

// ── Vibration (mobile natif + navigateurs web supportes) ────────────────────
export function triggerVibration(durationMs = 200) {
    if (Platform.OS === 'web') {
        if (typeof navigator !== 'undefined' && navigator.vibrate) {
            navigator.vibrate(durationMs);
        }
    } else {
        Vibration.vibrate(durationMs);
    }
}

// ── Feedback complet au scan (bip + vibration) ─────────────────────────────
export function onScanFeedback() {
    playBeepSound();
    triggerVibration(200);
}

// ── Injection CSS pour l'animation de la ligne de scan (web uniquement) ────
let cssInjected = false;

export function injectScanLineCSS() {
    if (Platform.OS !== 'web' || cssInjected) return;
    if (typeof document === 'undefined') return;

    const style = document.createElement('style');
    style.textContent = `
@keyframes scanLineMove {
    0%   { top: 0%; opacity: 0; }
    10%  { opacity: 1; }
    90%  { opacity: 1; }
    100% { top: 100%; opacity: 0; }
}
@keyframes scanFlashGreen {
    0%   { border-color: #C47316; }
    50%  { border-color: #059669; }
    100% { border-color: #C47316; }
}
`;
    document.head.appendChild(style);
    cssInjected = true;
}
