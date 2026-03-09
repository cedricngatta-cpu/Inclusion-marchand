// Intégration Groq API — STT (Whisper) + IA conversationnelle (Llama 3.3 70B)
import { supabase } from './supabase';

const GROQ_API_KEY = process.env.EXPO_PUBLIC_GROQ_API_KEY ?? '';
const WHISPER_URL  = 'https://api.groq.com/openai/v1/audio/transcriptions';
const CHAT_URL     = 'https://api.groq.com/openai/v1/chat/completions';
const CHAT_MODEL   = 'llama-3.3-70b-versatile';

// ── Types ──────────────────────────────────────────────────────────────────
export interface GroqMessage {
    role: 'system' | 'user' | 'assistant';
    content: string;
}

// ── STT : transcription audio via Groq Whisper ─────────────────────────────
export async function transcribeAudio(uri: string): Promise<string> {
    const formData = new FormData();
    formData.append('file', {
        uri,
        type: 'audio/m4a',
        name: 'recording.m4a',
    } as any);
    formData.append('model', 'whisper-large-v3-turbo');
    formData.append('language', 'fr');

    const res = await fetch(WHISPER_URL, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${GROQ_API_KEY}` },
        body: formData,
    });

    if (!res.ok) throw new Error(`Whisper ${res.status}: ${await res.text()}`);
    const data = await res.json();
    return (data.text ?? '').trim();
}

// ── Chat multi-tour : toute l'histoire est envoyée à Groq ─────────────────
export async function chatWithHistory(messages: GroqMessage[]): Promise<string> {
    const res = await fetch(CHAT_URL, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${GROQ_API_KEY}`,
        },
        body: JSON.stringify({
            model: CHAT_MODEL,
            messages,
            temperature: 0.7,
            max_tokens: 500,
        }),
    });

    if (!res.ok) throw new Error(`Groq Chat ${res.status}: ${await res.text()}`);
    const data = await res.json();
    return (data.choices?.[0]?.message?.content ?? '').trim();
}

// ── Contexte métier complet par rôle ──────────────────────────────────────
export async function fetchRoleContext(
    role: string,
    userId: string,
    storeId?: string,
): Promise<string> {
    const sections: string[] = [];

    try {
        console.log('[groqAI] fetchRoleContext — role:', role, 'storeId:', storeId, 'userId:', userId);

        if (role === 'MERCHANT' && storeId) {
            // Requête stock séparée (évite les joins Supabase qui échouent silencieusement)
            const { data: stockRows, error: stockErr } = await supabase
                .from('stock')
                .select('product_id, quantity')
                .eq('store_id', storeId)
                .limit(50);
            console.log('[groqAI] stock rows:', stockRows?.length ?? 0, stockErr?.message ?? 'ok');

            if (stockRows?.length) {
                const productIds = stockRows.map((s: any) => s.product_id).filter(Boolean);
                const { data: prodRows } = await supabase
                    .from('products')
                    .select('id, name, price')
                    .in('id', productIds);

                const prodMap: Record<string, { name: string; price: number }> = {};
                (prodRows ?? []).forEach((p: any) => { prodMap[p.id] = { name: p.name, price: p.price }; });

                const inStock    = stockRows.filter((s: any) => (s.quantity ?? 0) > 0);
                const outOfStock = stockRows.filter((s: any) => (s.quantity ?? 0) === 0);

                sections.push('STOCK ACTUEL :');
                inStock.forEach((s: any) => {
                    const p = prodMap[s.product_id];
                    if (p) sections.push(`- ${p.name.toUpperCase()} : ${p.price}F l'unité, ${s.quantity} en stock`);
                });
                sections.push(
                    outOfStock.length > 0
                        ? `PRODUITS EN RUPTURE : ${outOfStock.map((s: any) => prodMap[s.product_id]?.name ?? '?').join(', ')}`
                        : 'PRODUITS EN RUPTURE : aucun'
                );
            } else {
                sections.push('STOCK ACTUEL : aucun produit enregistré');
            }

            // Ventes du jour — colonne "price" (pas total_amount)
            const today = new Date().toISOString().split('T')[0];
            const { data: ventesJour, error: vjErr } = await supabase
                .from('transactions')
                .select('price, quantity, product_id')
                .eq('store_id', storeId)
                .gte('created_at', `${today}T00:00:00`)
                .lte('created_at', `${today}T23:59:59`);
            console.log('[groqAI] ventesJour:', ventesJour?.length ?? 0, vjErr?.message ?? 'ok');

            const nbJour    = (ventesJour ?? []).length;
            const totalJour = (ventesJour ?? []).reduce((a: number, v: any) => a + (v.price ?? 0), 0);
            sections.push(`VENTES AUJOURD'HUI : ${nbJour} vente(s), total ${totalJour.toLocaleString('fr-FR')}F`);

            // Ventes du mois
            const firstDay = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();
            const { data: ventesMois, error: vmErr } = await supabase
                .from('transactions')
                .select('price, product_id, quantity')
                .eq('store_id', storeId)
                .gte('created_at', firstDay);
            console.log('[groqAI] ventesMois:', ventesMois?.length ?? 0, vmErr?.message ?? 'ok');

            const nbMois    = (ventesMois ?? []).length;
            const totalMois = (ventesMois ?? []).reduce((a: number, v: any) => a + (v.price ?? 0), 0);
            sections.push(`CHIFFRE DU MOIS : ${totalMois.toLocaleString('fr-FR')}F (${nbMois} ventes)`);

            // Produit le plus vendu
            if ((ventesMois ?? []).length > 0) {
                const byProd: Record<string, number> = {};
                (ventesMois ?? []).forEach((v: any) => {
                    if (v.product_id) byProd[v.product_id] = (byProd[v.product_id] ?? 0) + (v.quantity ?? 1);
                });
                const topId = Object.entries(byProd).sort((a, b) => b[1] - a[1])[0]?.[0];
                if (topId) {
                    const { data: topProd } = await supabase.from('products').select('name').eq('id', topId).maybeSingle();
                    if (topProd?.name) sections.push(`PRODUIT LE PLUS VENDU : ${topProd.name} (${byProd[topId]} unités ce mois)`);
                }
            }

        } else if (role === 'PRODUCER' && storeId) {
            // Produits du producteur dans la table products
            const { data: produits, error: pErr } = await supabase
                .from('products')
                .select('name, price')
                .eq('store_id', storeId)
                .limit(20);
            console.log('[groqAI] produits producteur:', produits?.length ?? 0, pErr?.message ?? 'ok');

            sections.push('PRODUITS PUBLIÉS SUR LE MARCHÉ :');
            (produits ?? []).forEach((p: any) =>
                sections.push(`- ${(p.name ?? '?').toUpperCase()} : ${p.price ?? 0}F`)
            );

            // Commandes en attente (sans join)
            const { data: cmdPending } = await supabase
                .from('orders')
                .select('quantity, total_price, note')
                .eq('seller_store_id', storeId)
                .eq('status', 'PENDING')
                .limit(10);

            sections.push(`COMMANDES EN ATTENTE : ${(cmdPending ?? []).length}`);
            (cmdPending ?? []).forEach((c: any) =>
                sections.push(`  → ${c.note ?? 'Produit'} x${c.quantity} (${c.total_price ?? 0}F)`)
            );

            // Revenus du mois
            const firstDay = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();
            const { data: delivered } = await supabase
                .from('orders').select('total_price').eq('seller_store_id', storeId)
                .eq('status', 'DELIVERED').gte('created_at', firstDay);
            const revenuMois = (delivered ?? []).reduce((a: number, c: any) => a + (c.total_price ?? 0), 0);
            sections.push(`REVENUS DU MOIS : ${revenuMois.toLocaleString('fr-FR')}F`);

        } else if (role === 'FIELD_AGENT' || role === 'AGENT') {
            const firstDay = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();
            const { count: enrollMois } = await supabase.from('enrollments')
                .select('*', { count: 'exact', head: true }).eq('agent_id', userId).gte('created_at', firstDay);
            sections.push(`ENRÔLEMENTS CE MOIS : ${enrollMois ?? 0}`);

            const { count: pending } = await supabase.from('enrollments')
                .select('*', { count: 'exact', head: true }).eq('agent_id', userId).eq('status', 'PENDING');
            sections.push(`EN ATTENTE DE VALIDATION : ${pending ?? 0}`);

            const { count: valide } = await supabase.from('enrollments')
                .select('*', { count: 'exact', head: true }).eq('agent_id', userId).eq('status', 'VALIDATED');
            sections.push(`ENRÔLEMENTS VALIDÉS AU TOTAL : ${valide ?? 0}`);

        } else if (role === 'COOPERATIVE') {
            const { count: pendingEnrol } = await supabase.from('enrollments')
                .select('*', { count: 'exact', head: true }).eq('status', 'PENDING');
            sections.push(`DEMANDES D'ENRÔLEMENT EN ATTENTE : ${pendingEnrol ?? 0}`);

            const { count: membres } = await supabase.from('profiles')
                .select('*', { count: 'exact', head: true }).neq('role', null);
            sections.push(`MEMBRES INSCRITS : ${membres ?? 0}`);

            const firstDay = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();
            const { data: cmdsMois } = await supabase.from('orders').select('total_price').gte('created_at', firstDay);
            const volume = (cmdsMois ?? []).reduce((a: number, c: any) => a + (c.total_price ?? 0), 0);
            sections.push(`VOLUME DE VENTES RÉSEAU CE MOIS : ${volume.toLocaleString('fr-FR')}F`);

        } else if (role === 'ADMIN' || role === 'SUPERVISOR') {
            const { count: totalUsers } = await supabase.from('profiles').select('*', { count: 'exact', head: true });
            sections.push(`UTILISATEURS TOTAL : ${totalUsers ?? 0}`);

            const { count: totalMerchants } = await supabase.from('profiles')
                .select('*', { count: 'exact', head: true }).eq('role', 'merchant');
            sections.push(`COMMERÇANTS : ${totalMerchants ?? 0}`);

            const { count: totalAgents } = await supabase.from('profiles')
                .select('*', { count: 'exact', head: true }).eq('role', 'field_agent');
            sections.push(`AGENTS DE TERRAIN : ${totalAgents ?? 0}`);

            const { count: pendingEnrol } = await supabase.from('enrollments')
                .select('*', { count: 'exact', head: true }).eq('status', 'PENDING');
            sections.push(`ENRÔLEMENTS EN ATTENTE : ${pendingEnrol ?? 0}`);

            const firstDay = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();
            const { data: txMois } = await supabase.from('transactions').select('price').gte('created_at', firstDay);
            const volumeTx = (txMois ?? []).reduce((a: number, t: any) => a + (t.price ?? 0), 0);
            sections.push(`VOLUME TRANSACTIONS CE MOIS : ${volumeTx.toLocaleString('fr-FR')}F`);

            const { data: cmdsMois } = await supabase.from('orders').select('total_price').gte('created_at', firstDay);
            const volumeCmd = (cmdsMois ?? []).reduce((a: number, c: any) => a + (c.total_price ?? 0), 0);
            sections.push(`VOLUME COMMANDES CE MOIS : ${volumeCmd.toLocaleString('fr-FR')}F`);
        }
    } catch {
        sections.push('(certaines données non disponibles)');
    }

    return sections.join('\n') || 'Aucune donnée disponible.';
}

// ── Prompt système intelligent par rôle ────────────────────────────────────
export function buildSystemPrompt(nom: string, role: string, donneesContext: string): string {
    const prenom = nom.split(' ')[0];
    const base = `Réponds TOUJOURS en français courant (naturel, pas formel). Sois concis (2-4 phrases max) sauf si résumé demandé. Utilise le franc CFA (F). Appelle l'utilisateur par son prénom "${prenom}" de temps en temps. Si "merci"/"ok"/"c'est bon" → réponse brève + propose autre chose. Comprends le langage familier ivoirien. Si l'utilisateur confirme ("oui", "ok", "vas-y") → exécute la dernière action. Si annule ("non", "annule", "laisse") → annule et propose autre chose.`;

    const actionsBase = `Pour les actions, utilise UNIQUEMENT quand l'utilisateur demande CLAIREMENT une action.
Format EXACT à respecter (les noms de champs sont OBLIGATOIRES tels quels) :

- Publier un produit :
ACTION::{"type":"publier","details":{"nom":"NOM_DU_PRODUIT","prix":500,"quantite":100,"categorie":"Céréales","description":""}}

- Enregistrer une vente :
ACTION::{"type":"vendre","details":{"produit_nom":"NOM_PRODUIT","quantite":2,"client_nom":""}}

- Passer une commande :
ACTION::{"type":"commander","details":{"produit_nom":"NOM_PRODUIT","quantite":5}}

- Mettre à jour le stock :
ACTION::{"type":"stock","details":{"produit_nom":"NOM_PRODUIT","quantite":50}}

IMPORTANT : Utilise TOUJOURS "nom" pour le nom d'un produit publié, et "produit_nom" pour les autres actions. Ne change PAS ces noms de champs. Sinon, ne mets PAS de ACTION::`;

    if (role === 'MERCHANT') {
        return `Tu es KOFFI, l'assistant commercial de ${nom.toUpperCase()}, commerçant sur l'application Inclusion Marchand en Côte d'Ivoire. Tu es son bras droit : chaleureux, direct, efficace.

DONNÉES EN TEMPS RÉEL DE SA BOUTIQUE :
${donneesContext}

TON RÔLE :
- Tu gères sa caisse, ses ventes, son stock, ses dettes clients (carnet)
- Tu l'aides à décider quoi commander, quand réapprovisionner, quels produits poussent bien
- Tu enregistres des ventes à sa demande et tu gères son stock

INTELLIGENCE PROACTIVE :
- Si un produit a moins de 5 unités en stock → mentionne-le spontanément
- Si un produit se vend bien → suggère de commander plus
- Si chiffre du jour est bon → félicite-le chaleureusement
- "résumé"/"comment ça va"/"les chiffres" → donne bilan ventes + stock critique
- "bonjour"/"salut" → accueil chaleureux + chiffres du jour en 2 phrases
- Produit en rupture demandé → préviens + suggère alternative

${base}
${actionsBase}`;
    }

    if (role === 'PRODUCER') {
        return `Tu es FELIX, l'assistant marché de ${nom.toUpperCase()}, producteur sur l'application Inclusion Marchand en Côte d'Ivoire. Tu l'aides à vendre sa production agricole.

DONNÉES EN TEMPS RÉEL :
${donneesContext}

TON RÔLE :
- Tu gères ses produits publiés sur le Marché Virtuel, ses commandes reçues, ses livraisons
- Tu l'aides à fixer les bons prix, à gérer ses stocks de production, à suivre ses revenus
- Tu publies des produits et traites des commandes à sa demande

INTELLIGENCE PROACTIVE :
- Commandes en attente → mentionne-les spontanément, propose d'accepter
- Stock épuisé d'un produit → suggère de republier avec nouveau stock
- "résumé"/"ça va"/"les commandes" → bilan commandes + revenus du mois
- "bonjour"/"salut" → accueil + nb commandes en attente + revenus mois

${base}
${actionsBase}`;
    }

    if (role === 'FIELD_AGENT' || role === 'AGENT') {
        return `Tu es ISSA, l'assistant terrain de ${nom.toUpperCase()}, agent de terrain sur l'application Inclusion Marchand en Côte d'Ivoire. Tu l'aides dans sa mission d'enrôlement.

DONNÉES EN TEMPS RÉEL :
${donneesContext}

TON RÔLE :
- Tu suis ses enrôlements (validés, en attente, refusés), ses objectifs mensuels
- Tu l'aides à gérer son secteur, à identifier les marchands actifs/inactifs
- Tu l'informes sur les validations de la coopérative

INTELLIGENCE PROACTIVE :
- Enrôlements en attente → mentionne le nb spontanément
- Bon score ce mois → motive-le, félicite-le
- "résumé"/"ça va"/"mon mois" → bilan enrôlements + taux de validation
- "bonjour"/"salut" → accueil + nb enrôlements ce mois + en attente

${base}
Pas d'ACTION:: pour ce rôle — tu informes et conseilles uniquement.`;
    }

    if (role === 'COOPERATIVE') {
        return `Tu es ADJOA, l'assistante coopérative pour ${nom.toUpperCase()} sur l'application Inclusion Marchand en Côte d'Ivoire. Tu gères le réseau de la coopérative.

DONNÉES EN TEMPS RÉEL :
${donneesContext}

TON RÔLE :
- Tu suis les demandes d'enrôlement en attente, les membres du réseau, les achats groupés
- Tu analyses les performances du réseau (ventes, agents actifs, marchands)
- Tu aides à valider/rejeter les enrôlements et à piloter les achats groupés

INTELLIGENCE PROACTIVE :
- Demandes en attente → mentionne spontanément, propose de les traiter
- Volume réseau en hausse → commente positivement
- "résumé"/"ça va"/"le réseau" → bilan demandes + volume ventes + membres
- "bonjour"/"salut" → accueil + nb demandes en attente + stats réseau

${base}
${actionsBase}`;
    }

    if (role === 'ADMIN' || role === 'SUPERVISOR') {
        return `Tu es ORACLE, l'assistant superviseur pour ${nom.toUpperCase()} sur la plateforme Inclusion Marchand en Côte d'Ivoire. Tu as une vue globale sur tout le réseau.

DONNÉES EN TEMPS RÉEL :
${donneesContext}

TON RÔLE :
- Tu surveilles tous les indicateurs : utilisateurs, transactions, enrôlements, signalements
- Tu analyses les performances globales du réseau (commerçants, producteurs, agents)
- Tu alertes sur les anomalies, les pics d'activité, les problèmes à traiter
- Tu prépares des synthèses pour les décisions stratégiques

INTELLIGENCE PROACTIVE :
- Enrôlements en attente → mentionne spontanément
- Volume transactions anormal → alerte
- "résumé"/"tableau de bord"/"les stats" → bilan complet en 4-5 points clés
- "bonjour"/"salut" → accueil professionnel + KPIs clés du moment

${base}
Pas d'ACTION:: pour ce rôle — tu analyses et conseilles uniquement.`;
    }

    // Fallback générique
    return `Tu es un assistant intelligent pour ${nom.toUpperCase()} sur l'application Inclusion Marchand en Côte d'Ivoire.

${donneesContext}

${base}
${actionsBase}`;
}

// ── Parser d'action ────────────────────────────────────────────────────────
export interface VoiceAction {
    type: 'publier' | 'vendre' | 'commander' | 'stock';
    details: Record<string, any>;
}

export function parseAction(response: string): { text: string; action: VoiceAction | null } {
    const idx = response.indexOf('ACTION::');
    if (idx === -1) return { text: response, action: null };

    const text = response.slice(0, idx).trim();
    const json = response.slice(idx + 'ACTION::'.length).trim();
    try {
        return { text, action: JSON.parse(json) as VoiceAction };
    } catch {
        return { text, action: null };
    }
}

// ── Vérification connectivité ──────────────────────────────────────────────
export async function isOnline(): Promise<boolean> {
    try {
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), 3000);
        await fetch('https://api.groq.com', { method: 'HEAD', signal: ctrl.signal });
        clearTimeout(timer);
        return true;
    } catch {
        return false;
    }
}
