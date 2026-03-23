// Formatage du texte pour le TTS — convertit les chiffres en mots francais
// pour que le moteur de synthese vocale lise correctement les montants, quantites, etc.

export function formatForSpeech(text: string): string {
    let formatted = text;

    // Formater les montants en FCFA lisibles
    // "1650 FCFA" ou "1650 F" ou "1650 francs" → "mille six cent cinquante francs"
    formatted = formatted.replace(/(\d[\d\s]*)\s*(FCFA|F CFA|francs CFA|francs|F)\b/gi, (_match, num) => {
        const n = parseInt(num.replace(/\s/g, ''));
        return numberToFrenchWords(n) + ' francs';
    });

    // Les nombres avec unites (quantites, poids, etc.)
    formatted = formatted.replace(/\b(\d+)\s*(kg|kilos?|unites?|unités?|litres?|sacs?)\b/gi, (_match, num, unit) => {
        const n = parseInt(num);
        const unitMap: Record<string, string> = {
            'kg': 'kilos', 'kilo': 'kilos', 'kilos': 'kilos',
            'unite': 'unites', 'unites': 'unites',
            'unité': 'unites', 'unités': 'unites',
            'litre': 'litres', 'litres': 'litres',
            'sac': 'sacs', 'sacs': 'sacs',
        };
        return numberToFrenchWords(n) + ' ' + (unitMap[unit.toLowerCase()] || unit);
    });

    // Pourcentages
    formatted = formatted.replace(/(\d+)\s*%/g, (_match, num) => {
        return numberToFrenchWords(parseInt(num)) + ' pourcent';
    });

    // Heures "14h30" ou "14:30"
    formatted = formatted.replace(/(\d{1,2})[h:](\d{2})/g, (_match, h, m) => {
        const hours = numberToFrenchWords(parseInt(h)) + ' heures';
        const mins = parseInt(m) > 0 ? ' ' + numberToFrenchWords(parseInt(m)) : '';
        return hours + mins;
    });

    // Dates "23/03/2026"
    formatted = formatted.replace(/(\d{1,2})\/(\d{1,2})\/(\d{4})/g, (_match, d, m, y) => {
        const months = ['', 'janvier', 'fevrier', 'mars', 'avril', 'mai', 'juin', 'juillet', 'aout', 'septembre', 'octobre', 'novembre', 'decembre'];
        return numberToFrenchWords(parseInt(d)) + ' ' + months[parseInt(m)] + ' ' + y;
    });

    // Numeros de telephone : "0711223344" → "zero sept onze vingt-deux trente-trois quarante-quatre"
    formatted = formatted.replace(/\b(0\d{9})\b/g, (match) => {
        return match.match(/.{2}/g)!.map(pair => numberToFrenchWords(parseInt(pair))).join(' ');
    });

    return formatted;
}

function numberToFrenchWords(n: number): string {
    if (n === 0) return 'zero';
    if (n < 0) return 'moins ' + numberToFrenchWords(-n);

    const units = ['', 'un', 'deux', 'trois', 'quatre', 'cinq', 'six', 'sept', 'huit', 'neuf', 'dix', 'onze', 'douze', 'treize', 'quatorze', 'quinze', 'seize', 'dix-sept', 'dix-huit', 'dix-neuf'];
    const tens = ['', '', 'vingt', 'trente', 'quarante', 'cinquante', 'soixante', 'soixante', 'quatre-vingt', 'quatre-vingt'];

    if (n < 20) return units[n];

    if (n < 70) {
        const t = Math.floor(n / 10);
        const u = n % 10;
        if (u === 0) return tens[t];
        if (u === 1 && t !== 8) return tens[t] + ' et un';
        return tens[t] + '-' + units[u];
    }

    if (n < 80) {
        const u = n - 60;
        if (u === 1) return 'soixante et onze';
        return 'soixante-' + units[u];
    }

    if (n < 100) {
        const u = n - 80;
        if (u === 0) return 'quatre-vingts';
        return 'quatre-vingt-' + units[u];
    }

    if (n < 1000) {
        const h = Math.floor(n / 100);
        const rest = n % 100;
        const prefix = h === 1 ? 'cent' : units[h] + ' cent';
        if (rest === 0) return h > 1 ? prefix + 's' : prefix;
        return prefix + ' ' + numberToFrenchWords(rest);
    }

    if (n < 1000000) {
        const k = Math.floor(n / 1000);
        const rest = n % 1000;
        const prefix = k === 1 ? 'mille' : numberToFrenchWords(k) + ' mille';
        if (rest === 0) return prefix;
        return prefix + ' ' + numberToFrenchWords(rest);
    }

    if (n < 1000000000) {
        const m = Math.floor(n / 1000000);
        const rest = n % 1000000;
        const prefix = m === 1 ? 'un million' : numberToFrenchWords(m) + ' millions';
        if (rest === 0) return prefix;
        return prefix + ' ' + numberToFrenchWords(rest);
    }

    return n.toString();
}
