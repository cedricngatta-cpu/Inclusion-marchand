// Fonctions utilitaires partagees entre voiceAssistant.ts et deepgramTTS.ts
// Extraites pour casser le cycle d'import

// ── Conversion nombre vers mots francais ─────────────────────────────────────
export function numberToFrenchWords(n: number): string {
    if (n === 0) return 'zero';
    if (n < 0)   return 'moins ' + numberToFrenchWords(-n);

    const units = ['', 'un', 'deux', 'trois', 'quatre', 'cinq', 'six', 'sept', 'huit', 'neuf',
                   'dix', 'onze', 'douze', 'treize', 'quatorze', 'quinze', 'seize'];
    const tens  = ['', 'dix', 'vingt', 'trente', 'quarante', 'cinquante', 'soixante',
                   'soixante', 'quatre-vingt', 'quatre-vingt'];

    if (n < 17)  return units[n];
    if (n < 20)  return 'dix-' + units[n - 10];
    if (n < 70) {
        const t = Math.floor(n / 10), u = n % 10;
        if (u === 0) return tens[t];
        if (u === 1 && t < 8) return tens[t] + ' et un';
        return tens[t] + '-' + units[u];
    }
    if (n < 80) {
        const u = n - 60;
        if (u === 1) return 'soixante et onze';
        return 'soixante-' + numberToFrenchWords(u);
    }
    if (n < 100) {
        const u = n - 80;
        if (u === 0) return 'quatre-vingts';
        return 'quatre-vingt-' + numberToFrenchWords(u);
    }
    if (n < 200) {
        if (n === 100) return 'cent';
        return 'cent ' + numberToFrenchWords(n - 100);
    }
    if (n < 1000) {
        const h = Math.floor(n / 100), rest = n % 100;
        if (rest === 0) return units[h] + ' cents';
        return units[h] + ' cent ' + numberToFrenchWords(rest);
    }
    if (n < 2000) {
        const rest = n % 1000;
        if (rest === 0) return 'mille';
        return 'mille ' + numberToFrenchWords(rest);
    }
    if (n < 1_000_000) {
        const t = Math.floor(n / 1000), rest = n % 1000;
        const prefix = numberToFrenchWords(t) + ' mille';
        if (rest === 0) return prefix;
        return prefix + ' ' + numberToFrenchWords(rest);
    }
    if (n < 2_000_000) {
        const rest = n % 1_000_000;
        if (rest === 0) return 'un million';
        return 'un million ' + numberToFrenchWords(rest);
    }
    const m = Math.floor(n / 1_000_000), rest = n % 1_000_000;
    const prefix = numberToFrenchWords(m) + ' millions';
    if (rest === 0) return prefix;
    return prefix + ' ' + numberToFrenchWords(rest);
}

// ── Nettoyage du texte avant TTS ─────────────────────────────────────────────
export function cleanTextForSpeech(text: string): string {
    let clean = text;

    // Supprimer les blocs ACTION:: (ne jamais lire le JSON)
    clean = clean.replace(/ACTION::[\s\S]*?(\}|\n|$)/g, '');

    // Convertir les montants "45 000 F" ou "45000F" ou "45 000 FCFA" en mots
    clean = clean.replace(/([\d][\d\s]*)\s*(?:F\s*CFA|FCFA|F\b)/g, (_match, nombre) => {
        const n = parseInt(nombre.replace(/\s/g, ''), 10);
        if (isNaN(n)) return _match;
        return numberToFrenchWords(n) + ' francs';
    });

    // Supprimer les caracteres speciaux qui cassent la voix
    clean = clean.replace(/[→←▶►◀◄•■▪▸★☆✓✗✅❌⚠️🔴🟡🟢]/g, '');

    // Supprimer les emojis (plage Unicode etendue)
    clean = clean.replace(/[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu, '');

    // Nettoyer le markdown
    clean = clean.replace(/\*\*(.*?)\*\*/g, '$1');
    clean = clean.replace(/\*(.*?)\*/g,     '$1');

    // Normaliser les sauts de ligne et tirets decoratifs
    clean = clean.replace(/---+/g, '.');
    clean = clean.replace(/\n{2,}/g, '. ');
    clean = clean.replace(/\n/g, '. ');

    // Supprimer les doubles espaces et points
    clean = clean.replace(/\.{2,}/g, '.');
    clean = clean.replace(/\s{2,}/g, ' ');

    return clean.trim();
}
