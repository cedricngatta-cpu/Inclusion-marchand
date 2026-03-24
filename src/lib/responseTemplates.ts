// Templates de réponses variées pour l'assistant vocal Julaba
// Chaque catégorie a plusieurs variantes pour un rendu naturel et humain

function pick<T>(arr: T[]): T {
    return arr[Math.floor(Math.random() * arr.length)];
}

function fill(template: string, vars: Record<string, string | number | null | undefined>): string {
    return template.replace(/\{(\w+)\}/g, (_, key) => {
        const v = vars[key];
        return v != null ? String(v) : '';
    }).replace(/\s{2,}/g, ' ').trim();
}

export function getResponse(category: string, vars: Record<string, string | number | null | undefined> = {}): string {
    const templates = TEMPLATES[category];
    if (!templates?.length) return '';
    return fill(pick(templates), vars);
}

// ── Templates par catégorie ─────────────────────────────────────────────────

const TEMPLATES: Record<string, string[]> = {

    // Vente simple (sans client)
    sell: [
        "C'est fait ! {quantity} {product} pour {amount} francs. {payment}",
        "Vente enregistrée. {quantity} {product}, {amount} francs. {payment}",
        "OK ! {product}, {quantity}, {amount} francs. C'est noté.",
        "Parfait ! {quantity} {product} à {amount} francs. {payment}",
    ],

    // Vente avec client
    sell_client: [
        "C'est fait ! {quantity} {product} pour {client}, {amount} francs. {payment}",
        "Vente pour {client} enregistrée. {quantity} {product}, {amount} francs. {payment}",
        "OK ! {product} pour {client}, {quantity}, {amount} francs. C'est noté.",
    ],

    // Vente multiple
    sell_multiple: [
        "J'ai enregistré {count} ventes : {items}. Total : {amount} francs{client}. {payment}",
        "C'est fait ! {items}. Total : {amount} francs{client}.",
        "Tout est noté : {items}. Ça fait {amount} francs{client}.",
    ],

    // Stock vérifié (produit spécifique)
    check_stock: [
        "Il te reste {quantity} {unit} de {product} en stock.",
        "{product} : {quantity} {unit} en stock.",
        "Tu as encore {quantity} {unit} de {product}.",
    ],

    // Stock bas
    stock_low: [
        "Attention, il reste que {quantity} {unit} de {product}. Pense à commander.",
        "{product} est bientôt en rupture : {quantity} {unit} restants.",
        "Alerte ! Seulement {quantity} {unit} de {product}. Commande vite.",
    ],

    // Stock tout
    check_stock_all: [
        "Tu as {total} produits en stock. Les plus bas : {lowItems}.",
        "Ton stock : {total} produits. Attention sur : {lowItems}.",
    ],

    // Stock ajout
    stock_add: [
        "Stock mis à jour ! {product} : plus {quantity} unités, total {newQty}.",
        "C'est fait ! {quantity} {product} ajoutés. Nouveau stock : {newQty}.",
        "OK ! {product} réapprovisionné, maintenant {newQty} en stock.",
    ],

    // Alertes stock
    stock_alerts: [
        "Attention, {count} produits en alerte : {items}. Tu devrais commander.",
        "{count} produits bas : {items}. Pense à te réapprovisionner.",
        "Alerte stock ! {items}. Il faut réapprovisionner.",
    ],

    stock_alerts_none: [
        "Ton stock est bon, rien en alerte pour le moment.",
        "Tout est bon côté stock, pas d'alerte.",
        "RAS sur le stock, tout est en ordre.",
    ],

    // Stats
    stats_today: [
        "Aujourd'hui tu as fait {amount} francs avec {count} ventes. Beau travail ! {topLine}",
        "{count} ventes pour {amount} francs aujourd'hui. Ca marche bien ! {topLine}",
        "Ton chiffre du jour : {amount} francs, {count} ventes. Continue ! {topLine}",
    ],

    stats_period: [
        "{period} : {amount} francs avec {count} ventes. {topLine}",
        "Sur {period} : {count} ventes pour {amount} francs. {topLine}",
    ],

    // Top produits
    top_products: [
        "Tes meilleures ventes {period} : {items}.",
        "Top ventes {period} : {items}.",
    ],

    // Dettes
    debt_list: [
        "{count} clients te doivent {amount} francs au total. {details}",
        "Ton carnet : {count} dettes pour {amount} francs. {details}",
    ],

    debt_none: [
        "Aucune dette en cours. Ton carnet est vide.",
        "Personne ne te doit rien. C'est propre !",
    ],

    debt_check: [
        "{client} te doit {amount} francs.",
        "La dette de {client} : {amount} francs.",
    ],

    debt_add: [
        "C'est noté. {client} te doit {amount} francs.",
        "Dette de {amount} francs ajoutée pour {client}.",
        "OK, {client} doit maintenant {amount} francs.",
    ],

    debt_paid: [
        "Parfait ! La dette de {client} est réglée. {details}",
        "C'est bon, {client} a payé. Solde à zéro. {details}",
        "Dette de {client} marquée comme payée. {details}",
    ],

    debt_not_found: [
        "Aucune dette en cours trouvée pour {client}.",
        "Je ne trouve pas de dette pour {client}.",
    ],

    // Undo
    undo_success: [
        "J'ai annulé la dernière action : {description}.",
        "C'est annulé : {description}.",
        "Action annulée : {description}.",
    ],

    undo_nothing: [
        "Rien à annuler pour le moment.",
        "Il n'y a pas d'action récente à annuler.",
    ],

    // Aide
    help: [
        "Tu peux me dire : vends, stock, dettes, bilan, alertes, annule. Par exemple : vends 3 kilos de tomates à Awa.",
        "Dis-moi ce que tu veux : vendre, vérifier le stock, voir les dettes, faire le bilan. Je comprends aussi les raccourcis comme '2 tomates' ou 'le riz ?'.",
    ],

    // Notifications
    notifications: [
        "Tu as {count} notifications non lues. {summary}",
        "{count} nouvelles notifications. {summary}",
    ],

    notifications_none: [
        "Pas de nouvelle notification. Tout est calme.",
        "Aucune notification non lue.",
    ],

    // Erreurs
    not_understood: [
        "Excuse-moi, j'ai pas bien compris. Tu peux répéter ?",
        "Pardon, tu peux dire ça autrement ?",
        "J'ai pas saisi. Essaie de reformuler.",
    ],

    no_audio: [
        "Je t'écoute, mais j'ai rien entendu. Appuie sur le micro et parle.",
        "J'ai pas entendu. Rapproche-toi du micro et réessaie.",
    ],

    // Confirmation demandée (confiance basse)
    confirm_action: [
        "Tu veux {description} ? Dis oui pour confirmer.",
        "J'ai compris : {description}. C'est bien ça ?",
        "Je fais {description} ? Confirme.",
    ],

    // Greeting
    greeting_with_stats: [
        "{timeGreeting} {name} ! Tu as déjà fait {amount} francs aujourd'hui. Comment je peux t'aider ?",
        "{timeGreeting} {name} ! {count} ventes aujourd'hui pour {amount} francs. Qu'est-ce que je peux faire pour toi ?",
    ],

    greeting_simple: [
        "{timeGreeting} {name} ! Comment je peux t'aider ?",
        "{timeGreeting} {name} ! Qu'est-ce que je peux faire pour toi ?",
        "{timeGreeting} {name} ! Je suis là. Dis-moi.",
    ],
};
