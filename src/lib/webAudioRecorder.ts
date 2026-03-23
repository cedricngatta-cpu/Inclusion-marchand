// Enregistrement audio web via MediaRecorder API
// Produit un Blob webm/opus pour envoi direct a Deepgram
// Utilise uniquement sur Platform.OS === 'web'

const log = (...args: any[]) => { if (__DEV__) console.log('[WebAudioRecorder]', ...args); };

let mediaRecorder: MediaRecorder | null = null;
let audioChunks: Blob[] = [];
let audioStream: MediaStream | null = null;

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
    await stopWebRecording();

    log('Demarrage enregistrement web...');

    audioStream = await navigator.mediaDevices.getUserMedia({
        audio: {
            echoCancellation: true,
            noiseSuppression: true,
            sampleRate: 16000,
        },
    });

    audioChunks = [];
    const mimeType = getSupportedMimeType();
    log('MIME type:', mimeType);

    mediaRecorder = new MediaRecorder(audioStream, { mimeType });

    mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
            audioChunks.push(event.data);
        }
    };

    // Collecter les chunks toutes les 250ms pour le streaming futur
    mediaRecorder.start(250);
    log('Enregistrement web demarre');
}

/** Arrete l'enregistrement et retourne le Blob audio */
export function stopWebRecording(): Promise<Blob | null> {
    return new Promise((resolve) => {
        if (!mediaRecorder || mediaRecorder.state === 'inactive') {
            cleanupStream();
            resolve(null);
            return;
        }

        mediaRecorder.onstop = () => {
            const mimeType = mediaRecorder?.mimeType ?? getSupportedMimeType();
            const blob = new Blob(audioChunks, { type: mimeType });
            log('Enregistrement termine, taille:', blob.size, 'bytes, type:', blob.type);
            audioChunks = [];
            cleanupStream();
            resolve(blob.size > 0 ? blob : null);
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
