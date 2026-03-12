// Web Speech API — reconnaissance vocale navigateur (web uniquement)
// Sur mobile natif, ce fichier n'est jamais importé dans le flux actif.

const getSpeechRecognition = (): any | null => {
    if (typeof window === 'undefined') return null;
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    return SR ? new SR() : null;
};

/**
 * Lance la reconnaissance vocale via Web Speech API.
 * Retourne une fonction stop() à appeler pour interrompre manuellement.
 */
export function startWebSpeechRecognition(
    onResult: (text: string) => void,
    onError: (err: string) => void,
    lang: string = 'fr-FR',
): () => void {
    const recognition = getSpeechRecognition();
    if (!recognition) {
        onError('Reconnaissance vocale non supportée par ce navigateur');
        return () => {};
    }

    recognition.lang = lang;
    recognition.continuous = false;
    recognition.interimResults = false;

    recognition.onresult = (event: any) => {
        const text: string = event.results[0][0].transcript;
        onResult(text);
    };

    recognition.onerror = (event: any) => {
        onError(
            event.error === 'not-allowed'
                ? 'Microphone non autorisé. Vérifie les permissions du navigateur.'
                : event.error === 'no-speech'
                ? 'Aucune voix détectée. Réessayez.'
                : 'Erreur reconnaissance vocale',
        );
    };

    recognition.onend = () => {
        // Rien à faire — onresult ou onerror a déjà été appelé
    };

    recognition.start();

    return () => {
        try { recognition.stop(); } catch (_) {}
    };
}

/** Vérifie si Web Speech API est disponible dans ce navigateur */
export function isWebSpeechSupported(): boolean {
    if (typeof window === 'undefined') return false;
    return !!(window as any).SpeechRecognition || !!(window as any).webkitSpeechRecognition;
}
