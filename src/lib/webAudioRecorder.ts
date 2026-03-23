// Enregistrement audio web via MediaRecorder API
// Produit un Blob webm/opus pour envoi direct a Deepgram
// Utilise uniquement sur Platform.OS === 'web'

const log = (...args: any[]) => { if (__DEV__) console.log('[WebAudioRecorder]', ...args); };

let mediaRecorder: MediaRecorder | null = null;
let audioChunks: Blob[] = [];
let audioStream: MediaStream | null = null;
let recordingStartTime: number = 0;

// Delai minimum d'enregistrement (ms) — evite les blobs vides
const MIN_RECORDING_MS = 1000;

// MIME types supportes par les navigateurs, par ordre de preference
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
        },
    });

    log('Micro OK, tracks:', audioStream.getAudioTracks().map(t => `${t.label} (${t.readyState})`));

    const mimeType = getSupportedMimeType();
    log('MIME type:', mimeType);

    mediaRecorder = new MediaRecorder(audioStream, { mimeType });

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

/** Libere le flux micro */
function cleanupStream(): void {
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
