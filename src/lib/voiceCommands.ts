// Commandes locales par rôle — matching par mots-clés, aucune IA requise
import { Vibration } from 'react-native';

export interface LocalCommand {
    keywords: string[];
    route: string;
    confirmation: string;
}

// ── Commandes par rôle ─────────────────────────────────────────────────────
const COMMANDS: Record<string, LocalCommand[]> = {
    MERCHANT: [
        { keywords: ['vendre', 'nouvelle vente', 'vente'],              route: '/(tabs)/vendre',        confirmation: "J'ouvre la vente." },
        { keywords: ['stock', 'mon stock', 'inventaire'],               route: '/(tabs)/stock',         confirmation: 'Voici votre stock.' },
        { keywords: ['bilan', 'mon bilan'],                             route: '/(tabs)/bilan',         confirmation: 'Voici votre bilan.' },
        { keywords: ['scanner', 'scan', 'code barre', 'code-barre'],   route: '/(tabs)/scanner',       confirmation: 'Scanner prêt.' },
        { keywords: ['notification', 'alerte', 'alertes'],             route: '/(tabs)/notifications', confirmation: 'Vos notifications.' },
        { keywords: ['profil', 'mon profil', 'compte'],                route: '/(tabs)/profil',        confirmation: 'Votre profil.' },
        { keywords: ['marché', 'marche', 'fournisseurs', 'virtuel'],   route: '/(tabs)/marche',        confirmation: 'Marché virtuel.' },
        { keywords: ['carnet', 'dettes', 'crédit client', 'credit'],   route: '/(tabs)/carnet',        confirmation: 'Votre carnet.' },
        { keywords: ['revenus', 'mes revenus', 'chiffre', 'gains'],    route: '/(tabs)/revenus',       confirmation: 'Vos revenus.' },
    ],
    PRODUCER: [
        { keywords: ['publier', 'nouveau produit', 'poster', 'annonce'],   route: '/producteur/publier',    confirmation: 'Publiez votre produit.' },
        { keywords: ['commandes', 'mes commandes', 'commande'],            route: '/producteur/commandes',  confirmation: 'Vos commandes.' },
        { keywords: ['livraisons', 'mes livraisons', 'livraison'],         route: '/producteur/livraisons', confirmation: 'Vos livraisons.' },
        { keywords: ['stock', 'mon stock', 'inventaire'],                  route: '/producteur/stock',      confirmation: 'Votre stock.' },
        { keywords: ['revenus', 'mes revenus', 'gains'],                   route: '/producteur/revenus',    confirmation: 'Vos revenus.' },
    ],
    AGENT: [
        { keywords: ['enrôler', 'inscrire', 'nouveau marchand', 'enrôlement', 'enrollement', 'enrolement'], route: '/agent/enrolement', confirmation: "Formulaire d'inscription." },
        { keywords: ['secteur', 'mon secteur', 'zone'],                route: '/agent/secteur',     confirmation: 'Votre secteur.' },
        { keywords: ['activités', 'historique', 'activites'],          route: '/agent/activites',   confirmation: 'Vos activités.' },
        { keywords: ['signaler', 'conformité', 'problème', 'conformite', 'probleme'], route: '/agent/conformite', confirmation: 'Signaler un problème.' },
    ],
    COOPERATIVE: [
        { keywords: ['demandes', 'en attente', 'validation'],                     route: '/cooperative/demandes',     confirmation: 'Demandes en attente.' },
        { keywords: ['membres', 'liste membres', 'liste des membres'],            route: '/cooperative/membres',      confirmation: 'Liste des membres.' },
        { keywords: ['achats', 'achats groupés', 'achats groupes', 'groupé'],    route: '/cooperative/achats',       confirmation: 'Achats groupés.' },
        { keywords: ['performances', 'stats', 'statistiques', 'réseau'],         route: '/cooperative/performances', confirmation: 'Performances du réseau.' },
        { keywords: ['analyses', 'tendances', 'marché analyse'],                 route: '/cooperative/analyses',     confirmation: 'Analyses de marché.' },
    ],
    ADMIN: [
        { keywords: ['tableau de bord', 'accueil', 'dashboard'],  route: '/admin', confirmation: 'Tableau de bord.' },
        { keywords: ['membres', 'utilisateurs'],                  route: '/admin', confirmation: 'Section membres.' },
    ],
};

// Mots déclenchant une déconnexion (tous rôles)
const LOGOUT_KEYWORDS = ['déconnexion', 'deconnexion', 'déconnecter', 'deconnecter', 'sortir', 'se déconnecter'];

// ── Matching ───────────────────────────────────────────────────────────────
function normalize(text: string): string {
    return text.toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, ''); // enlève les accents
}

export interface MatchResult {
    type: 'navigation' | 'logout' | 'none';
    command?: LocalCommand;
    confirmation?: string;
}

export function matchLocalCommand(phrase: string, role: string): MatchResult {
    const normalized = normalize(phrase);

    // Si la phrase est longue (> 4 mots) → commande complexe pour l'IA, pas la navigation
    const wordCount = phrase.trim().split(/\s+/).length;
    if (wordCount > 4) return { type: 'none' };

    // Logout — tous rôles
    if (LOGOUT_KEYWORDS.some(kw => normalized.includes(normalize(kw)))) {
        return { type: 'logout', confirmation: 'Déconnexion en cours.' };
    }

    const commands = COMMANDS[role] ?? [];
    for (const cmd of commands) {
        const hit = cmd.keywords.some(kw => normalized.includes(normalize(kw)));
        if (hit) {
            Vibration.vibrate(50);
            return { type: 'navigation', command: cmd, confirmation: cmd.confirmation };
        }
    }

    return { type: 'none' };
}
