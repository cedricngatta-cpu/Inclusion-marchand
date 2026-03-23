// Enregistrement audio web via MediaRecorder API
// Produit un Blob audio pour envoi a Groq Whisper STT
// Utilise uniquement sur Platform.OS === 'web'

const log = (...args: any[]) => { if (__DEV__) console.log('[WebAudioRecorder]', ...args); };

let mediaRecorder: MediaRecorder | null = null;
let audioChunks: Blob[] = [];
let audioStream: MediaStream | null = null;
let recordingStartTime: number = 0;

// Volume metering via Web Audio API
let audioContext: AudioContext | null = null;
let analyserNode: AnalyserNode | null = null;
let currentVolume: number = 0;
let volumeInterval: ReturnType<typeof setInterval> | null = null;

// Delai minimum d'enregistrement (ms) — evite les blobs vides
const MIN_RECORDING_MS = 2000;

// MIME types supportes par les navigateurs, par ordre de preference
// webm/opus en premier : bien supporte par Whisper, meilleur codec navigateur
function getSupportedMimeType(): string {
    if (typeof MediaRecorder === 'undefined') return 'audio/webm';
    const types = [
        'audio/webm;codecs=opus',
        'audio/webm',
        'audio/ogg;codecs=opus',
        'audio/mp4',
    ];
    for (const type of types) {
        if (MediaRecorder.isTypeSupported(type)) return type;
    }
    return 'audio/webm';
}

/** Demande la permission micro et retourne true si accordee */
export async function requestWebMicPermission(): Promise<boolean> {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        // Arreter immediatement le stream de test
        stream.getTracks().forEach(t => t.stop());
        return true;
    } catch (err: any) {
        log('Permission micro refusee:', err?.message ?? err);
        return false;
    }
}

/** Verifie si MediaRecorder est disponible */
export function isMediaRecorderAvailable(): boolean {
    return typeof window !== 'undefined'
        && typeof navigator !== 'undefined'
        && !!navigator.mediaDevices?.getUserMedia
        && typeof MediaRecorder !== 'undefined';
}

/** Demarre l'enregistrement audio via MediaRecorder */
export async function startWebRecording(): Promise<void> {
    if (!isMediaRecorderAvailable()) {
        throw new Error('MediaRecorder non disponible dans ce navigateur');
    }

    // Arreter tout enregistrement precedent
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
        try { mediaRecorder.stop(); } catch { /* ignore */ }
    }
    audioChunks = [];
    cleanupStream();

    log('[Voice] 1. Start recording...');

    audioStream = await navigator.mediaDevices.getUserMedia({
        audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
            channelCount: 1,
            sampleRate: { ideal: 16000 },
        },
    });

    log('Micro OK, tracks:', audioStream.getAudioTracks().map(t => `${t.label} (${t.readyState})`));

    // Volume metering via AnalyserNode
    setupVolumeMeter(audioStream);

    const mimeType = getSupportedMimeType();
    log('MIME type:', mimeType);

    mediaRecorder = new MediaRecorder(audioStream, { mimeType, audioBitsPerSecond: 128000 });

    mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
            audioChunks.push(event.data);
        }
    };

    mediaRecorder.onerror = (event: any) => {
        log('MediaRecorder error:', event?.error?.message ?? event);
    };

    // Collecter les chunks toutes les 250ms
    mediaRecorder.start(250);
    recordingStartTime = Date.now();
    log('Enregistrement web demarre, state:', mediaRecorder.state);
}

/** Arrete l'enregistrement et retourne le Blob audio.
 *  Attend au minimum MIN_RECORDING_MS depuis le debut pour eviter les blobs vides. */
export async function stopWebRecording(): Promise<Blob | null> {
    // Attendre le delai minimum si necessaire
    if (recordingStartTime > 0) {
        const elapsed = Date.now() - recordingStartTime;
        if (elapsed < MIN_RECORDING_MS) {
            const wait = MIN_RECORDING_MS - elapsed;
            log(`Attente ${wait}ms pour atteindre le minimum d'enregistrement`);
            await new Promise(resolve => setTimeout(resolve, wait));
        }
    }

    return new Promise((resolve) => {
        if (!mediaRecorder || mediaRecorder.state === 'inactive') {
            log('MediaRecorder inactif, pas de blob');
            cleanupStream();
            resolve(null);
            return;
        }

        // Timeout de securite : si onstop ne fire pas en 3s, on resolve null
        const safetyTimeout = setTimeout(() => {
            log('stopWebRecording safety timeout');
            cleanupStream();
            resolve(null);
        }, 3000);

        mediaRecorder.onstop = () => {
            clearTimeout(safetyTimeout);
            const mimeType = mediaRecorder?.mimeType ?? getSupportedMimeType();
            const blob = new Blob(audioChunks, { type: mimeType });
            log('[Voice] 2. Stop recording, blob size:', blob.size, 'bytes, type:', blob.type, 'chunks:', audioChunks.length);
            audioChunks = [];
            recordingStartTime = 0;
            cleanupStream();

            if (blob.size < 100) {
                log('Blob trop petit (<100 bytes), considere comme vide');
                resolve(null);
                return;
            }

            resolve(blob);
        };

        mediaRecorder.stop();
    });
}

/** Annule l'enregistrement en cours */
export function cancelWebRecording(): void {
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
        try { mediaRecorder.stop(); } catch { /* ignore */ }
    }
    audioChunks = [];
    recordingStartTime = 0;
    cleanupStream();
}

/** Initialise le volume meter via AudioContext + AnalyserNode */
function setupVolumeMeter(stream: MediaStream): void {
    try {
        const AC = window.AudioContext || (window as any).webkitAudioContext;
        if (!AC) return;
        audioContext = new AC();
        const source = audioContext.createMediaStreamSource(stream);
        analyserNode = audioContext.createAnalyser();
        analyserNode.fftSize = 256;
        analyserNode.smoothingTimeConstant = 0.5;
        source.connect(analyserNode);

        const dataArray = new Uint8Array(analyserNode.frequencyBinCount);
        volumeInterval = setInterval(() => {
            if (!analyserNode) return;
            analyserNode.getByteFrequencyData(dataArray);
            let sum = 0;
            for (let i = 0; i < dataArray.length; i++) sum += dataArray[i];
            currentVolume = sum / dataArray.length / 255; // 0.0 - 1.0
        }, 100);
    } catch (err) {
        log('Volume meter setup error:', err);
    }
}

/** Nettoie le volume meter */
function cleanupVolumeMeter(): void {
    if (volumeInterval) { clearInterval(volumeInterval); volumeInterval = null; }
    if (audioContext && audioContext.state !== 'closed') {
        audioContext.close().catch(() => {});
    }
    audioContext = null;
    analyserNode = null;
    currentVolume = 0;
}

/** Retourne le niveau de volume actuel (0.0 - 1.0) */
export function getVolume(): number {
    return currentVolume;
}

/** Libere le flux micro */
function cleanupStream(): void {
    cleanupVolumeMeter();
    if (audioStream) {
        audioStream.getTracks().forEach(track => track.stop());
        audioStream = null;
    }
    mediaRecorder = null;
}

/** Retourne true si un enregistrement est en cours */
export function isWebRecording(): boolean {
    return mediaRecorder !== null && mediaRecorder.state === 'recording';
}
