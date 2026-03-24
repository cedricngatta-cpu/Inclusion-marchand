// Intégration LLM — Mistral Small (principal) + Groq Llama (fallback) + Whisper STT
import { Platform } from 'react-native';
import { supabase } from './supabase';
import { reportApiError } from './errorReporter';
import { mistralChat, isMistralAvailable } from './mistralAI';

const log = (...args: any[]) => { if (__DEV__) console.log(...args); };

const GROQ_API_KEY = process.env.EXPO_PUBLIC_GROQ_API_KEY ?? '';
const WHISPER_URL  = 'https://api.groq.com/openai/v1/audio/transcriptions';
const GROQ_CHAT_URL = 'https://api.groq.com/openai/v1/chat/completions';
const GROQ_CHAT_MODEL = 'llama-3.3-70b-versatile';

// ── Types ──────────────────────────────────────────────────────────────────
export interface GroqMessage {
    role: 'system' | 'user' | 'assistant';
    content: string;
}

export type VoiceActionType =
    | 'vendre' | 'vendre_multiple'
    | 'stock_ajout' | 'stock' | 'stock_nouveau'
    | 'check_stock' | 'check_stock_all' | 'stock_alerts'
    | 'commander'
    | 'dette_ajout' | 'dette_payee'
    | 'list_debts' | 'check_debt'
    | 'stats' | 'top_products'
    | 'show_notifications' | 'undo_last' | 'help'
    | 'publier' | 'produit_modifier'
    | 'commande_accepter' | 'commande_refuser' | 'livraison_statut'
    | 'enroler' | 'signaler'
    | 'enrolement_valider' | 'enrolement_rejeter'
    | 'achat_groupe'
    | 'compte_desactiver' | 'pin_reset' | 'changer_role'
    | 'navigate';

export interface VoiceAction {
    type: VoiceActionType;
    details: Record<string, unknown>;
}

// ── Types internes — lignes retournées par Supabase ────────────────────────
interface StockRow   { product_id: string; quantity: number; }
interface ProductRow { id: string; name: string; price: number; delivery_price?: number; }
interface TransRow   { price: number; quantity: number; product_name: string; product_id?: string; }
interface OrderRow   { total_amount?: number; product_name?: string; quantity?: number; status?: string; }

// ── STT : transcription audio via Groq Whisper ─────────────────────────────
export async function transcribeAudio(uri: string): Promise<string> {
    log('=== ENVOI WHISPER ===');
    log('URI reçue:', uri);
    log('Platform:', Platform.OS);

    // Sur iOS, le préfixe file:// peut bloquer le FormData — on le retire
    const fileUri = Platform.OS === 'ios' ? uri.replace('file://', '') : uri;
    log('URI après nettoyage:', fileUri);

    if (!GROQ_API_KEY) {
        log('ERREUR : GROQ_API_KEY manquante');
        throw new Error('Clé API Groq non configurée');
    }

    const formData = new FormData();
    formData.append('file', {
        uri: fileUri,
        type: 'audio/m4a',
        name: 'recording.m4a',
    } as any);
    formData.append('model', 'whisper-large-v3-turbo');
    formData.append('language', 'fr');

    let res: Response;
    try {
        res = await fetch(WHISPER_URL, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${GROQ_API_KEY}` },
            body: formData,
        });
    } catch (networkErr: any) {
        log('ERREUR RÉSEAU Whisper:', networkErr?.message ?? networkErr);
        reportApiError('Whisper', networkErr, 'groqAI.transcribeAudio');
        throw new Error(`Erreur réseau Whisper : ${networkErr?.message ?? 'connexion impossible'}`);
    }

    log('Réponse Whisper status:', res.status);

    if (!res.ok) {
        const errBody = await res.text();
        log('ERREUR Whisper body:', errBody);
        throw new Error(`Whisper ${res.status}: ${errBody}`);
    }

    const data = await res.json();
    const transcription = (data.text ?? '').trim();
    log('Transcription obtenue:', transcription || '(vide)');
    return transcription;
}

// ── Chat multi-tour : Mistral (principal) → Groq Llama (fallback) ─────────
export async function chatWithHistory(messages: GroqMessage[], maxTokens = 300): Promise<string> {
    // Essayer Mistral d'abord
    if (isMistralAvailable()) {
        try {
            const result = await mistralChat(messages, maxTokens);
            log('[LLM] Mistral OK');
            return result;
        } catch (err: any) {
            log('[LLM] Mistral échoué, fallback Groq:', err?.message);
            reportApiError('Mistral Chat', err, 'groqAI.chatWithHistory');
            // Continuer vers Groq fallback
        }
    }

    // Fallback Groq Llama
    return groqChatFallback(messages, maxTokens);
}

async function groqChatFallback(messages: GroqMessage[], maxTokens: number): Promise<string> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    try {
        const res = await fetch(GROQ_CHAT_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${GROQ_API_KEY}`,
            },
            body: JSON.stringify({
                model: GROQ_CHAT_MODEL,
                messages,
                temperature: 0.3,
                max_tokens: maxTokens,
            }),
            signal: controller.signal,
        });
        clearTimeout(timeoutId);

        if (!res.ok) throw new Error(`Groq Chat ${res.status}: ${await res.text()}`);
        const data = await res.json();
        log('[LLM] Groq fallback OK');
        return (data.choices?.[0]?.message?.content ?? '').trim();
    } catch (err: any) {
        clearTimeout(timeoutId);
        if (err.name === 'AbortError') {
            log('TIMEOUT Groq — trop long (10s)');
            reportApiError('Groq Chat', { message: 'Timeout 10s' }, 'groqAI.chatWithHistory');
            throw new Error('TIMEOUT');
        }
        reportApiError('Groq Chat', err, 'groqAI.chatWithHistory');
        throw err;
    }
}

// ── Contexte métier complet par rôle ──────────────────────────────────────
export async function fetchRoleContext(
    role: string,
    userId: string,
    storeId?: string,
): Promise<string> {
    const sections: string[] = [];

    try {
        log('[groqAI] fetchRoleContext — role:', role, 'storeId:', storeId, 'userId:', userId);

        // ── MARCHAND ──────────────────────────────────────────────────────
        if (role === 'MERCHANT' && storeId) {
            const today    = new Date().toISOString().split('T')[0];
            const firstDay = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();

            // Toutes les requêtes indépendantes en parallèle
            const [
                { data: stockRows },
                { data: ventesJour },
                { data: ventesMois },
                { data: cmdsEnCours },
                { data: dettes },
            ] = await Promise.all([
                supabase.from('stock').select('product_id, quantity').eq('store_id', storeId).limit(50),
                supabase.from('transactions').select('price, quantity, product_name')
                    .eq('store_id', storeId)
                    .gte('created_at', `${today}T00:00:00`)
                    .lte('created_at', `${today}T23:59:59`),
                supabase.from('transactions').select('price, product_id, quantity, product_name')
                    .eq('store_id', storeId).gte('created_at', firstDay),
                supabase.from('orders').select('product_name, quantity, total_amount, status')
                    .eq('buyer_store_id', storeId)
                    .in('status', ['PENDING', 'ACCEPTED', 'SHIPPED']).limit(5),
                supabase.from('credits_clients').select('client_nom, montant_du')
                    .eq('marchand_id', userId).neq('statut', 'paye').limit(10),
            ]);

            // Stock — requête produits dépend des résultats stock (2e round)
            if (stockRows?.length) {
                const rows       = stockRows as StockRow[];
                const productIds = rows.map(s => s.product_id).filter(Boolean);
                const { data: prodRows } = await supabase
                    .from('products').select('id, name, price').in('id', productIds);

                const prodMap: Record<string, { name: string; price: number }> = {};
                (prodRows as ProductRow[] ?? []).forEach(p => { prodMap[p.id] = { name: p.name, price: p.price }; });

                // Liste complete des produits pour le matching LLM
                const productList = rows
                    .map(s => {
                        const p = prodMap[s.product_id];
                        return p ? `${p.name} (${s.quantity} en stock, ${p.price} F/unité)` : null;
                    })
                    .filter(Boolean)
                    .join(', ');

                if (productList) {
                    sections.push(`TES PRODUITS EN STOCK : ${productList}`);
                    sections.push(`IMPORTANT : Quand l'utilisateur mentionne un produit, cherche dans CETTE LISTE. Si un mot RESSEMBLE a un produit de la liste, c'est CE produit. Utilise TOUJOURS le nom exact et le prix de la liste pour calculer le montant.`);
                }

                const enStock  = rows.filter(s => (s.quantity ?? 0) > 5);
                const stockBas = rows.filter(s => (s.quantity ?? 0) > 0 && (s.quantity ?? 0) <= 5);
                const rupture  = rows.filter(s => (s.quantity ?? 0) === 0);

                sections.push('STOCK ACTUEL :');
                enStock.forEach(s => {
                    const p = prodMap[s.product_id];
                    if (p) sections.push(`  - ${p.name.toUpperCase()} : ${p.price} F/unité, ${s.quantity} en stock`);
                });
                if (stockBas.length) sections.push(`STOCK BAS (<=5) : ${stockBas.map(s => prodMap[s.product_id]?.name ?? '?').join(', ')}`);
                if (rupture.length)  sections.push(`RUPTURE : ${rupture.map(s => prodMap[s.product_id]?.name ?? '?').join(', ')}`);
            } else {
                sections.push('STOCK ACTUEL : aucun produit enregistré');
            }

            // Ventes du jour
            const nbJour    = (ventesJour ?? []).length;
            const totalJour = (ventesJour as TransRow[] ?? []).reduce((a, v) => a + (v.price ?? 0), 0);
            sections.push(`VENTES AUJOURD'HUI : ${nbJour} vente(s) — ${totalJour.toLocaleString('fr-FR')} F`);

            // Ventes du mois
            const ventesM   = (ventesMois as TransRow[] ?? []);
            const totalMois = ventesM.reduce((a, v) => a + (v.price ?? 0), 0);
            sections.push(`CHIFFRE DU MOIS : ${totalMois.toLocaleString('fr-FR')} F (${ventesM.length} ventes)`);

            if (ventesM.length > 0) {
                const byProd: Record<string, { qte: number; nom: string }> = {};
                ventesM.forEach(v => {
                    if (v.product_id) {
                        if (!byProd[v.product_id]) byProd[v.product_id] = { qte: 0, nom: v.product_name ?? '?' };
                        byProd[v.product_id].qte += (v.quantity ?? 1);
                    }
                });
                const top = Object.values(byProd).sort((a, b) => b.qte - a.qte)[0];
                if (top) sections.push(`PRODUIT LE PLUS VENDU : ${top.nom} (${top.qte} unités ce mois)`);
            }

            // Commandes en cours
            sections.push(`COMMANDES EN COURS : ${(cmdsEnCours ?? []).length}`);
            (cmdsEnCours as OrderRow[] ?? []).forEach(c =>
                sections.push(`  - ${c.product_name ?? 'Produit'} x${c.quantity} (${c.status})`)
            );

            // Dettes clients
            const dettesRows  = (dettes ?? []) as Array<{ client_nom: string; montant_du: number }>;
            const totalDettes = dettesRows.reduce((a, d) => a + (d.montant_du ?? 0), 0);
            sections.push(`DETTES CLIENTS : ${dettesRows.length} client(s) — ${totalDettes.toLocaleString('fr-FR')} F`);
            dettesRows.forEach(d =>
                sections.push(`  - ${d.client_nom} : ${(d.montant_du ?? 0).toLocaleString('fr-FR')} F`)
            );

        // ── PRODUCTEUR ────────────────────────────────────────────────────
        } else if (role === 'PRODUCER' && storeId) {
            const firstDay = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();

            const [
                { data: produits },
                { data: toutes },
                { data: delivMois },
            ] = await Promise.all([
                supabase.from('products').select('name, price, delivery_price').eq('store_id', storeId).limit(15),
                supabase.from('orders').select('product_name, quantity, total_amount, status')
                    .eq('seller_store_id', storeId).order('created_at', { ascending: false }).limit(15),
                supabase.from('orders').select('total_amount')
                    .eq('seller_store_id', storeId).eq('status', 'DELIVERED').gte('created_at', firstDay),
            ]);

            sections.push(`PRODUITS PUBLIÉS : ${(produits ?? []).length}`);
            (produits as ProductRow[] ?? []).forEach(p =>
                sections.push(`  - ${(p.name ?? '?').toUpperCase()} : ${p.price ?? 0} F${p.delivery_price ? ` (livraison ${p.delivery_price} F)` : ''}`)
            );

            const toutesRows = (toutes as OrderRow[] ?? []);
            const pending   = toutesRows.filter(c => c.status === 'PENDING');
            const accepted  = toutesRows.filter(c => c.status === 'ACCEPTED');
            const shipped   = toutesRows.filter(c => c.status === 'SHIPPED');
            const delivered = toutesRows.filter(c => c.status === 'DELIVERED');

            sections.push(`COMMANDES : EN ATTENTE=${pending.length}, ACCEPTÉES=${accepted.length}, EN LIVRAISON=${shipped.length}, LIVRÉES=${delivered.length}`);
            if (pending.length) sections.push(`COMMANDES EN ATTENTE : ${pending.map(c => c.product_name ?? '?').join(', ')}`);

            const revenuMois = (delivMois as OrderRow[] ?? []).reduce((a, c) => a + (c.total_amount ?? 0), 0);
            sections.push(`REVENUS DU MOIS : ${revenuMois.toLocaleString('fr-FR')} F`);

        // ── AGENT TERRAIN ─────────────────────────────────────────────────
        } else if (role === 'FIELD_AGENT') {
            const firstDay = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();

            const [{ count: enrollMois }, { count: pending }, { count: valide }, { count: rejete }] = await Promise.all([
                supabase.from('demandes_enrolement').select('*', { count: 'exact', head: true }).eq('agent_id', userId).gte('date_demande', firstDay),
                supabase.from('demandes_enrolement').select('*', { count: 'exact', head: true }).eq('agent_id', userId).eq('statut', 'en_attente'),
                supabase.from('demandes_enrolement').select('*', { count: 'exact', head: true }).eq('agent_id', userId).eq('statut', 'valide'),
                supabase.from('demandes_enrolement').select('*', { count: 'exact', head: true }).eq('agent_id', userId).eq('statut', 'rejete'),
            ]);

            sections.push(`ENRÔLEMENTS CE MOIS : ${enrollMois ?? 0}`);
            sections.push(`EN ATTENTE DE VALIDATION : ${pending ?? 0}`);
            sections.push(`VALIDÉS AU TOTAL : ${valide ?? 0}`);
            sections.push(`REJETÉS AU TOTAL : ${rejete ?? 0}`);

        // ── COOPÉRATIVE ───────────────────────────────────────────────────
        } else if (role === 'COOPERATIVE') {
            const firstDay = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();

            const [{ count: pendingEnrol }, { count: membres }, { data: cmdsMois }, { data: derniersDemandes }] = await Promise.all([
                supabase.from('demandes_enrolement').select('*', { count: 'exact', head: true }).eq('statut', 'en_attente'),
                supabase.from('profiles').select('*', { count: 'exact', head: true }).in('role', ['MERCHANT', 'PRODUCER', 'merchant', 'producer', 'FIELD_AGENT', 'field_agent']),
                supabase.from('orders').select('total_amount').gte('created_at', firstDay),
                supabase.from('demandes_enrolement').select('nom, telephone, type, date_demande').eq('statut', 'en_attente').order('date_demande', { ascending: false }).limit(5),
            ]);

            const volume = (cmdsMois as OrderRow[] ?? []).reduce((a, c) => a + (c.total_amount ?? 0), 0);
            sections.push(`DEMANDES EN ATTENTE : ${pendingEnrol ?? 0}`);
            (derniersDemandes ?? []).forEach((d: { nom?: string; type?: string; telephone?: string }) =>
                sections.push(`  - ${d.nom} (${d.type ?? 'marchand'}) — ${d.telephone}`)
            );
            sections.push(`MEMBRES INSCRITS : ${membres ?? 0}`);
            sections.push(`VOLUME RÉSEAU CE MOIS : ${volume.toLocaleString('fr-FR')} F`);

        // ── ADMIN / SUPERVISEUR ───────────────────────────────────────────
        } else if (role === 'ADMIN' || role === 'SUPERVISOR') {
            const firstDay = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();

            const [
                { count: totalUsers },
                { count: totalMerchants },
                { count: totalProducers },
                { count: totalAgents },
                { count: pendingEnrol },
                { data: txMois },
                { data: cmdsMois },
            ] = await Promise.all([
                supabase.from('profiles').select('*', { count: 'exact', head: true }),
                supabase.from('profiles').select('*', { count: 'exact', head: true }).in('role', ['MERCHANT', 'merchant']),
                supabase.from('profiles').select('*', { count: 'exact', head: true }).in('role', ['PRODUCER', 'producer']),
                supabase.from('profiles').select('*', { count: 'exact', head: true }).in('role', ['FIELD_AGENT', 'field_agent']),
                supabase.from('demandes_enrolement').select('*', { count: 'exact', head: true }).eq('statut', 'en_attente'),
                supabase.from('transactions').select('price').gte('created_at', firstDay),
                supabase.from('orders').select('total_amount').gte('created_at', firstDay),
            ]);

            const volumeTx  = (txMois  as Array<{ price: number }> ?? []).reduce((a, t) => a + (t.price ?? 0), 0);
            const volumeCmd = (cmdsMois as OrderRow[] ?? []).reduce((a, c) => a + (c.total_amount ?? 0), 0);

            sections.push(`RÉSEAU : ${totalUsers ?? 0} utilisateurs (${totalMerchants ?? 0} marchands, ${totalProducers ?? 0} producteurs, ${totalAgents ?? 0} agents)`);
            sections.push(`ENRÔLEMENTS EN ATTENTE : ${pendingEnrol ?? 0}`);
            sections.push(`TRANSACTIONS CE MOIS : ${volumeTx.toLocaleString('fr-FR')} F`);
            sections.push(`COMMANDES B2B CE MOIS : ${volumeCmd.toLocaleString('fr-FR')} F`);
        }

    } catch (err: unknown) {
        console.warn('[groqAI] fetchRoleContext erreur:', (err as Error)?.message ?? err);
        reportApiError('Groq fetchRoleContext', err, 'groqAI.fetchRoleContext');
        sections.push('(certaines données non disponibles)');
    }

    return sections.join('\n') || 'Aucune donnée disponible.';
}

// ── Prompts système complets par rôle ─────────────────────────────────────
export function buildSystemPrompt(nom: string, role: string, donneesContext: string): string {
    const nomSafe = nom?.trim() || 'Utilisateur';
    const prenom = nomSafe.split(' ')[0];

    const styleCommun = `
RÈGLES ABSOLUES (à suivre sans exception) :

CONCISION :
- Maximum 1 à 2 phrases par réponse. JAMAIS plus de 2 phrases.
- JAMAIS de paragraphe. JAMAIS d'explication longue.
- JAMAIS commencer par "Je vais vérifier..." ou "Bien sûr..." ou "Avec plaisir..."
- Va DROIT AU BUT.

NOMBRES :
- Les marchands vendent entre 1 et 20 kg maximum par vente.
- Si tu vois un grand nombre supérieur à 20, c'est probablement une erreur de transcription.
- "trois" = 3. "deux" = 2. "cinq" = 5. Toujours le nombre simple.
- Ne JAMAIS transformer un petit nombre en grand nombre.

ORTHOGRAPHE :
- TOUJOURS les accents : é, è, ê, à, ù, ô, î, ç
- "noté" pas "note". "enregistré" pas "enregistre". "vérifié" pas "verifie".

CONTEXTE IVOIRIEN :
- "Madame" seul = nom du client est "Madame". "Madame Awa" = client est "Awa".
- "Monsieur Konaté" = client est "Konaté".
- Prix courants : tomates 300 à 700 francs le kilo, riz 400 à 800, oignons 500 à 1000.
- Si le calcul semble faux, utilise le prix réel du produit en base.

CALCULS :
- montant = quantité multiplié par prix unitaire du produit en stock.
- Ne JAMAIS inventer un prix. Utilise le prix de la base de données.

EXEMPLES DE BONNES RÉPONSES :
- "C'est fait ! 3 kg de tomates pour Awa, mille six cent cinquante francs."
- "Il reste 12 kg de riz."
- "Awa te doit trois mille francs."
- "Aujourd'hui : quarante-sept mille cinq cents francs, 12 ventes."

EXEMPLES DE RÉPONSES INTERDITES :
- "Je vais vérifier si nous avons suffisamment de tomates..." = INTERDIT (trop long)
- "Bien sûr ! La vente de vingt-trois kilos sera facturée selon..." = INTERDIT (trop long + nombre faux)

CONTEXTE GÉOGRAPHIQUE :
Tu es en Côte d'Ivoire, Afrique de l'Ouest. La monnaie est le Franc CFA.

RÈGLES DE PRONONCIATION VOCALE — TRÈS IMPORTANT :
Tes réponses seront lues à voix haute par un moteur de synthèse vocale. Tu dois écrire comme si tu PARLAIS, pas comme si tu écrivais.

1. MONTANTS EN TOUTES LETTRES :
   Écris toujours les montants en toutes lettres, jamais en chiffres seuls.
   Exemples : "quarante-cinq mille francs", "mille cinq cents francs", "cent sept mille cinquante francs".
   Ne jamais écrire : "45 000 F", "1 500 F", "107 050 F".

2. NUMÉROS DE TÉLÉPHONE par groupes de deux :
   "0711223344" se dit "zéro sept, onze, vingt-deux, trente-trois, quarante-quatre".
   Ne lis jamais les chiffres un par un.

3. NOMS IVOIRIENS :
   Les prénoms et noms sont ivoiriens : Kouassi, Adjoua, Konaté, Bamba, Coulibaly, Diabaté, Koné, Ouattara, N'Guessan, Tra Bi, Yao, Akissi, Amoin.
   Prononce-les naturellement, ne les épelle pas lettre par lettre.

4. INTERDICTIONS ABSOLUES — ces caractères cassent le moteur vocal :
   - Flèches : → ← ▶ ► ◀ ◄
   - Puces : • ■ ▪ ▸
   - Étoiles : ★ ☆
   - Cases : ✓ ✗ ✅ ❌
   - Alertes : ⚠️ 🔴 🟡 🟢
   - Gras markdown : **texte**
   - Listes à tirets décoratifs
   - Emojis de toute sorte
   - Le sigle "F" ou "FCFA" seuls après un chiffre

5. FORMAT RÉPONSE :
   Texte naturel parlé uniquement. Pas de listes, pas de formatage, pas de tirets décoratifs.
   Maximum 1 à 2 phrases. Sois ultra-concise.

INTELLIGENCE DE COMPRÉHENSION :

Tu es un assistant ULTRA-INTELLIGENT. Même si la transcription vocale est mauvaise, tu DOIS deviner ce que l'utilisateur veut dire.

RÈGLES ABSOLUES :
1. NE JAMAIS dire "je n'ai pas compris" si tu peux deviner même à 30%
2. Si des mots ressemblent à des produits, c'est une vente
3. Si des mots ressemblent à des chiffres, c'est une quantité
4. Si un nom propre apparaît, c'est un client
5. Corrige automatiquement les erreurs courantes de transcription
6. "Madame X" ou "Monsieur X" ou "Mademoiselle X", le client = X
7. "la dame" / "le monsieur" / "la cliente", demande le nom
8. Si l'utilisateur dit juste un produit ("tomates"), comprends "combien de tomates en stock ?"
9. Si l'utilisateur dit un chiffre + produit ("3 tomates"), comprends "vends 3 tomates"

CORRECTION AUTOMATIQUE DES MOTS :
- Tout mot qui ressemble à un produit du marché = ce produit
  Ex: "tomatt", "tomat", "tomaate" = tomates
  Ex: "onyon", "ognon", "oyon" = oignons
  Ex: "ri", "rii", "ris" = riz
  Ex: "ignam", "yam" = igname
  Ex: "maniok", "cassav" = manioc
  Ex: "banann", "plantin" = banane plantain
  Ex: "obergin", "aubergin" = aubergine
  Ex: "piman", "pimen" = piment
  Ex: "avoca", "avokat" = avocat
  Ex: "papay" = papaye
  Ex: "anana" = ananas

- Tout mot qui ressemble à un nombre :
  "un" = 1, "deux" = 2, "trois" ou "troua" = 3, "quatre" ou "kat" = 4
  "cinq" ou "sank" = 5, "six" ou "sis" = 6, "sept" ou "set" = 7
  "huit" ou "uit" = 8, "neuf" = 9, "dix" ou "dis" = 10
  "vingt" = 20, "trente" = 30, "cent" = 100, "mille" ou "mil" = 1000

- Tout mot qui ressemble à une action :
  "ven", "vend", "vends", "vendu", "vendre", "vente", "fais vente" = VENDRE
  "stok", "stock", "rest", "reste", "konbien", "combien" = CHECK_STOCK
  "ajout", "ajoute", "ajouter", "rajoute", "met", "mettre" = ADD_STOCK
  "det", "dette", "dèt", "kredi", "crédit", "doi", "doit" = DEBT
  "bilan", "recett", "recette", "total", "chiffre", "stat" = STATS

- Titres et noms de clients :
  "madame" / "monsieur" / "mademoiselle" + nom = client
  "pour" + nom = client
  "de" + nom = client (contexte dette)
  Corrige la casse : "awa" = "Awa", "kouassi" = "Kouassi"

QUAND TU HÉSITES :
- Propose l'action la plus probable avec confidence 0.6
- Le système demandera confirmation à l'utilisateur
- Ex: transcription bizarre "tomato tri kil" = tu proposes vendre 3 kg de tomates, confidence 0.6
- L'utilisateur verra "Vendre 3 kg de tomates ?" avec Confirmer / Annuler

STYLE DE CONVERSATION :
- Réponds TOUJOURS en français naturel et chaleureux (pas soutenu, langage ivoirien ok)
- 1 à 2 phrases max sauf si résumé demandé explicitement
- Appelle l'utilisateur par son prénom "${prenom}" de temps en temps
- Si "merci"/"ok"/"c'est bon" = réponse brève + propose une autre aide
- Si "bonjour"/"salut" = accueil chaleureux + résumé court de l'activité
- Si "oui"/"ok"/"vas-y"/"confirme" = confirmation (sera traitée automatiquement)
- Si "non"/"annule" = annule et propose autre chose`;

    // ── MARCHAND ──────────────────────────────────────────────────────────
    if (role === 'MERCHANT') {
        return `Tu es Julaba, l'assistante vocale intelligente de ${nom.toUpperCase()}, commercant sur Julaba en Cote d'Ivoire.

PERSONNALITE :
- Tu es une femme ivoirienne chaleureuse, professionnelle et efficace
- Tu tutoies le marchand comme une collegue de confiance
- Tu es proactive : tu donnes des conseils sans qu'on te demande
- Tu es encourageante : tu felicites les bonnes performances
- Tu es concise : reponses courtes et directes, maximum 1-2 phrases

LANGAGE IVOIRIEN :
Tu comprends parfaitement ces expressions :
- "dje" ou "wari" = argent
- "go" = aller, partir
- "dja" = deja
- "c'est comment ?" = comment ca va ? / quel est le statut ?
- "on dit quoi ?" = quoi de neuf ?
- "gbe" = probleme
- "kpakpa" = beaucoup, en grande quantite
- "faire les comptes" = voir le bilan/stats
- "carnet" = registre de dettes
- "ma clientele" = mes clients reguliers
- "c'est fini sur" = en rupture de stock
- "y'en a encore ?" = verifier le stock
- "mets ca sur son compte" = ajouter une dette
- "il/elle a paye" = marquer une dette comme payee
- "combien j'ai fait ?" = chiffre d'affaires du jour
- "ya" ou "il y a" = il y a / il reste
- "y'en a" = il en reste
- "c'est combien" = quel est le prix
- "c'est fini" ou "y'en a plus" = rupture de stock
- "donne-moi" ou "je veux" = je veux acheter/vendre
- "mets ca" = ajoute au stock ou enregistre
- "enleve" ou "retire" = soustrais du stock
- "ca va aller" = OK / confirmation
- "hein" en fin de phrase = confirmation / question rhetorique (ignore)
- "deh" ou "dèh" = exclamation (ignore)
- Les marchands TUTOIENT l'assistant — tutoie-les aussi
- Reponds comme une collegue ivoirienne, pas comme un robot

PRODUITS LOCAUX IVOIRIENS :
- "attieke" = semoule de manioc (le produit est "manioc" ou "attieke")
- "alloco" = banane plantain frite (le produit est "banane plantain")
- "placali" = pate de manioc (le produit est "manioc")
- "foutou" = pate de banane plantain ou igname
- "garba" = attieke + thon (pas un produit unique)
- "degue" = yaourt + mil (cherche "mil")
- "graine" = graine de palme

DONNEES EN TEMPS REEL DE SA BOUTIQUE :
${donneesContext}

TU PEUX EXECUTER CES ACTIONS (mets ACTION:: a la fin de ta reponse, sur une seule ligne) :

VENTES :
ACTION::{"type":"vendre","details":{"produit":"tomates","quantite":3,"client":"Awa","paiement":"especes"}}
ACTION::{"type":"vendre_multiple","details":{"produits":[{"nom":"riz","quantite":2},{"nom":"sucre","quantite":1}],"client":null,"paiement":"especes"}}
- "a credit" = paiement:"dette", "par Mobile Money/Wave/Orange" = paiement:"momo", sinon "especes"

VERIFIER STOCK :
ACTION::{"type":"check_stock","details":{"produit":"riz"}}
ACTION::{"type":"check_stock_all","details":{}}

AJOUTER AU STOCK :
ACTION::{"type":"stock_ajout","details":{"produit":"lait","quantite":20}}
ACTION::{"type":"stock_nouveau","details":{"nom":"sardine","prix":350,"categorie":"alimentation","quantite":50}}

ALERTES STOCK :
ACTION::{"type":"stock_alerts","details":{}}

COMMANDES CHEZ PRODUCTEUR :
ACTION::{"type":"commander","details":{"produit":"riz","quantite":50}}

CARNET DE DETTES :
ACTION::{"type":"dette_ajout","details":{"client":"Fatou","montant":5000}}
ACTION::{"type":"dette_payee","details":{"client":"Fatou"}}
ACTION::{"type":"list_debts","details":{}}
ACTION::{"type":"check_debt","details":{"client":"Awa"}}

STATISTIQUES :
ACTION::{"type":"stats","details":{"period":"today"}}
- "aujourd'hui"="today", "cette semaine"="week", "ce mois"="month", "hier"="yesterday"
ACTION::{"type":"top_products","details":{"period":"week","limit":5}}

NOTIFICATIONS :
ACTION::{"type":"show_notifications","details":{}}

ANNULER :
ACTION::{"type":"undo_last","details":{}}

AIDE :
ACTION::{"type":"help","details":{}}

NAVIGATION :
ACTION::{"type":"navigate","details":{"route":"/(tabs)/stock"}}
(routes : /(tabs)/stock, /(tabs)/marche, /(tabs)/carnet, /(tabs)/bilan, /(tabs)/revenus, /(tabs)/scanner, /(tabs)/notifications)

RACCOURCIS INTELLIGENTS :
- "2 tomates" sans verbe = "vends 2 tomates" (vendre)
- "le riz ?" = "combien il reste de riz" (check_stock)
- "Awa 3000" = "Awa me doit 3000" (dette_ajout)
- "tout" ou "resume" = "stats today" (stats)

INTELLIGENCE CONTEXTUELLE :
- Si juste un chiffre apres une vente ("encore 2"), c'est le meme produit
- Si "la meme chose", repete la derniere action
- Si "non, 5 pas 3", corrige la quantite de la derniere action
- Si "pour Awa", ajoute le client a la derniere vente sans client

INDICATEUR DE CONFIANCE :
Ajoute un champ "confidence" (0.0 a 1.0) dans le JSON de chaque action :
ACTION::{"type":"vendre","details":{...},"confidence":0.95}
Si confidence < 0.7, commence ta reponse par une demande de confirmation.

INTELLIGENCE PROACTIVE :
- Stock <= 5 unites = signale spontanement, suggere reapprovisionnement
- Produit en rupture demande = previens + suggere alternative
${styleCommun}`;
    }

    // ── PRODUCTEUR ────────────────────────────────────────────────────────
    if (role === 'PRODUCER') {
        return `Tu es l'assistant de ${nomSafe.toUpperCase()}, producteur agricole sur Jùlaba en Côte d'Ivoire. Tu l'aides à vendre sa production au meilleur prix.

DONNÉES EN TEMPS RÉEL :
${donneesContext}

TU PEUX EXÉCUTER CES ACTIONS :

PUBLICATION :
ACTION::{"type":"publier","details":{"nom":"Riz brisé","prix":15000,"quantite":100,"categorie":"Céréales","description":"","prix_livraison":2000,"livreur_nom":"Koné","livreur_telephone":"0712345678","zone_livraison":"Tout le pays","delai_livraison":"3-5 jours"}}
ACTION::{"type":"produit_modifier","details":{"produit":"riz","prix":16000}}

COMMANDES :
ACTION::{"type":"commande_accepter","details":{"marchand":"adjoua"}}
ACTION::{"type":"commande_refuser","details":{"marchand":"konate","motif":"stock insuffisant"}}

LIVRAISONS :
ACTION::{"type":"livraison_statut","details":{"marchand":"adjoua","statut":"en_livraison"}}
ACTION::{"type":"livraison_statut","details":{"marchand":"adjoua","statut":"livree"}}

NAVIGATION :
ACTION::{"type":"navigate","details":{"route":"/producteur/commandes"}}
(routes : /producteur, /producteur/commandes, /producteur/livraisons, /producteur/publier, /producteur/stock, /producteur/revenus)

ANALYSE (sans ACTION) : tendances ventes, revenus, qui a commandé chez moi

INTELLIGENCE PROACTIVE : commandes en attente → signale immédiatement, propose d'accepter
${styleCommun}`;
    }

    // ── AGENT TERRAIN ─────────────────────────────────────────────────────
    if (role === 'FIELD_AGENT') {
        return `Tu es l'assistant de ${nomSafe.toUpperCase()}, agent de terrain sur Jùlaba en Côte d'Ivoire. Tu l'aides dans sa mission d'inclusion économique.

DONNÉES EN TEMPS RÉEL :
${donneesContext}

TU PEUX EXÉCUTER CES ACTIONS :

ENRÔLEMENT :
ACTION::{"type":"enroler","details":{"nom":"Bakary Touré","telephone":"0711223344","type":"marchand","boutique":"Chez Bakary","adresse":"Adjamé Abidjan"}}
(type : "marchand" ou "producteur")

SIGNALEMENT :
ACTION::{"type":"signaler","details":{"cible":"Konaté","motif":"non-conformite","details":"Produits non étiquetés"}}

NAVIGATION :
ACTION::{"type":"navigate","details":{"route":"/agent/enrolement"}}
(routes : /agent, /agent/enrolement, /agent/secteur, /agent/activites, /agent/conformite)

ANALYSE (sans ACTION) : stats enrôlements, taux validation, membres actifs/inactifs

INTELLIGENCE PROACTIVE : enrôlements en attente → mentionne combien spontanément
${styleCommun}`;
    }

    // ── COOPÉRATIVE ───────────────────────────────────────────────────────
    if (role === 'COOPERATIVE') {
        return `Tu es l'assistante de ${nomSafe.toUpperCase()}, coopérative sur Jùlaba en Côte d'Ivoire. Tu gères le réseau et pilotes les opérations groupées.

DONNÉES EN TEMPS RÉEL :
${donneesContext}

TU PEUX EXÉCUTER CES ACTIONS :

ENRÔLEMENTS :
ACTION::{"type":"enrolement_valider","details":{"nom":"bakary"}}
ACTION::{"type":"enrolement_rejeter","details":{"nom":"moussa","motif":"photo floue"}}

ACHATS GROUPÉS :
ACTION::{"type":"achat_groupe","details":{"produit":"riz","producteur":"coulibaly","quantite_min":200,"prix_negocie":13000}}

NAVIGATION :
ACTION::{"type":"navigate","details":{"route":"/cooperative/demandes"}}
(routes : /cooperative, /cooperative/demandes, /cooperative/membres, /cooperative/achats, /cooperative/performances, /cooperative/analyses)

ANALYSE (sans ACTION) : performances réseau, marchand top, tendances

INTELLIGENCE PROACTIVE : demandes en attente → mentionne immédiatement, propose de traiter
${styleCommun}`;
    }

    // ── ADMIN / SUPERVISEUR ───────────────────────────────────────────────
    if (role === 'ADMIN' || role === 'SUPERVISOR') {
        return `Tu es l'assistant du super administrateur ${nomSafe.toUpperCase()} sur Jùlaba en Côte d'Ivoire. Tu as accès à toutes les données du réseau.

DONNÉES EN TEMPS RÉEL :
${donneesContext}

TU PEUX EXÉCUTER CES ACTIONS :

GESTION COMPTES :
ACTION::{"type":"compte_desactiver","details":{"nom":"moussa"}}
ACTION::{"type":"pin_reset","details":{"nom":"konate"}}
ACTION::{"type":"changer_role","details":{"nom":"bakary","nouveau_role":"PRODUCER"}}
(rôles valides : MERCHANT, PRODUCER, FIELD_AGENT, COOPERATIVE, SUPERVISOR)

NAVIGATION :
ACTION::{"type":"navigate","details":{"route":"/admin"}}
(routes : /admin, /admin/commandes)

ANALYSE (sans ACTION) : résumé réseau, signalements ouverts, KPIs globaux

INTELLIGENCE PROACTIVE : enrôlements en attente → signale le nombre spontanément
${styleCommun}`;
    }

    // ── Fallback générique ────────────────────────────────────────────────
    return `Tu es un assistant intelligent pour ${nomSafe.toUpperCase()} sur l'application Jùlaba en Côte d'Ivoire.

DONNÉES :
${donneesContext}
${styleCommun}`;
}

// ── Parser d'action ────────────────────────────────────────────────────────
export function parseAction(response: string): { text: string; action: VoiceAction | null } {
    // Cherche ACTION:: n'importe où dans la réponse (même après saut de ligne)
    const idx = response.indexOf('ACTION::');
    if (idx === -1) return { text: response.trim(), action: null };

    const text = response.slice(0, idx).trim();
    const raw  = response.slice(idx + 'ACTION::'.length).trim();

    // Extraire l'objet JSON complet (s'arrête au premier objet fermé)
    let depth = 0;
    let end   = -1;
    for (let i = 0; i < raw.length; i++) {
        if (raw[i] === '{') depth++;
        if (raw[i] === '}') { depth--; if (depth === 0) { end = i + 1; break; } }
    }

    const json = end > 0 ? raw.slice(0, end) : raw;
    try {
        return { text, action: JSON.parse(json) as VoiceAction };
    } catch {
        return { text: response.trim(), action: null };
    }
}

// ── Débrief contextuel par écran — données réelles Supabase ───────────────
export async function fetchScreenDebrief(
    route: string,
    role: string,
    userId: string,
    storeId?: string,
): Promise<string> {
    try {
        const today    = new Date().toISOString().split('T')[0];
        const firstDay = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();
        const lastFirstDay = new Date(new Date().getFullYear(), new Date().getMonth() - 1, 1).toISOString();

        // ── BILAN ─────────────────────────────────────────────────────────
        if (route.includes('bilan') && storeId) {
            const [{ data: ventesJour }, { data: ventesMois }] = await Promise.all([
                supabase.from('transactions').select('price')
                    .eq('store_id', storeId)
                    .gte('created_at', `${today}T00:00:00`)
                    .lte('created_at', `${today}T23:59:59`),
                supabase.from('transactions').select('price, product_name, quantity, product_id')
                    .eq('store_id', storeId).gte('created_at', firstDay),
            ]);
            const totalJour = (ventesJour ?? []).reduce((a: number, v: any) => a + (v.price ?? 0), 0);
            const totalMois = (ventesMois ?? []).reduce((a: number, v: any) => a + (v.price ?? 0), 0);
            const nbJour    = (ventesJour ?? []).length;

            let text = `Aujourd'hui tu as fait ${nbJour} vente${nbJour > 1 ? 's' : ''} pour ${totalJour.toLocaleString('fr-FR')} francs.`;
            text += ` Ce mois, ton chiffre est de ${totalMois.toLocaleString('fr-FR')} francs.`;

            const byProd: Record<string, number> = {};
            (ventesMois as TransRow[] ?? []).forEach(v => {
                if (v.product_name) byProd[v.product_name] = (byProd[v.product_name] ?? 0) + (v.quantity ?? 1);
            });
            const top = Object.entries(byProd).sort((a, b) => b[1] - a[1])[0];
            if (top) text += ` Ton produit phare ce mois : ${top[0]}.`;
            return text;
        }

        // ── STOCK ─────────────────────────────────────────────────────────
        if (route.includes('stock') && storeId) {
            const { data: stockRows } = await supabase
                .from('stock').select('quantity').eq('store_id', storeId).limit(100);
            const rows    = (stockRows ?? []) as Array<{ quantity: number }>;
            const total   = rows.length;
            const rupture = rows.filter(r => (r.quantity ?? 0) === 0).length;
            const bas     = rows.filter(r => (r.quantity ?? 0) > 0 && (r.quantity ?? 0) <= 5).length;

            let text = `Tu as ${total} produit${total > 1 ? 's' : ''} enregistré${total > 1 ? 's' : ''}.`;
            if (rupture > 0) text += ` ${rupture} en rupture de stock.`;
            if (bas > 0)     text += ` ${bas} avec un stock bas, pense à réapprovisionner.`;
            if (rupture === 0 && bas === 0 && total > 0) text += ' Tout est bien approvisionné.';
            return text;
        }

        // ── CARNET ────────────────────────────────────────────────────────
        if (route.includes('carnet')) {
            const { data: dettes } = await supabase
                .from('credits_clients').select('client_nom, montant_du')
                .eq('marchand_id', userId).neq('statut', 'paye').limit(20);
            const rows  = (dettes ?? []) as Array<{ client_nom: string; montant_du: number }>;
            const total = rows.reduce((a, d) => a + (d.montant_du ?? 0), 0);
            if (rows.length === 0) return 'Aucune dette en cours, tous tes clients sont à jour.';
            const noms = rows.slice(0, 3).map(d => d.client_nom).join(', ');
            return `${rows.length} client${rows.length > 1 ? 's' : ''} te doivent de l'argent : ${noms}${rows.length > 3 ? ' et d\'autres' : ''}. Total : ${total.toLocaleString('fr-FR')} francs.`;
        }

        // ── REVENUS MARCHAND ──────────────────────────────────────────────
        if (route.includes('revenus') && role === 'MERCHANT' && storeId) {
            const [{ data: ventesMois }, { data: ventesLastMonth }] = await Promise.all([
                supabase.from('transactions').select('price').eq('store_id', storeId).gte('created_at', firstDay),
                supabase.from('transactions').select('price').eq('store_id', storeId)
                    .gte('created_at', lastFirstDay).lt('created_at', firstDay),
            ]);
            const totalMois      = (ventesMois ?? []).reduce((a: number, v: any) => a + (v.price ?? 0), 0);
            const totalLastMonth = (ventesLastMonth ?? []).reduce((a: number, v: any) => a + (v.price ?? 0), 0);
            let text = `Ce mois tu as encaissé ${totalMois.toLocaleString('fr-FR')} francs.`;
            if (totalLastMonth > 0) {
                const pct = Math.round(((totalMois - totalLastMonth) / totalLastMonth) * 100);
                if (pct > 0)       text += ` C'est ${pct}% de plus que le mois dernier.`;
                else if (pct < 0)  text += ` C'est ${Math.abs(pct)}% de moins que le mois dernier.`;
                else               text += ' Même niveau que le mois dernier.';
            }
            return text;
        }

        // ── REVENUS PRODUCTEUR ────────────────────────────────────────────
        if (route.includes('revenus') && role === 'PRODUCER' && storeId) {
            const { data: livraisons } = await supabase
                .from('orders').select('total_amount')
                .eq('seller_store_id', storeId).eq('status', 'DELIVERED').gte('created_at', firstDay);
            const total = (livraisons ?? []).reduce((a: number, v: any) => a + (v.total_amount ?? 0), 0);
            const nb    = (livraisons ?? []).length;
            return `Ce mois tu as livré ${nb} commande${nb > 1 ? 's' : ''} pour ${total.toLocaleString('fr-FR')} francs encaissés.`;
        }

        // ── COMMANDES PRODUCTEUR ──────────────────────────────────────────
        if (route.includes('commandes') && role === 'PRODUCER' && storeId) {
            const { data: cmds } = await supabase
                .from('orders').select('status, product_name')
                .eq('seller_store_id', storeId)
                .in('status', ['PENDING', 'ACCEPTED', 'SHIPPED']).limit(10);
            const rows    = (cmds ?? []) as Array<{ status: string; product_name?: string }>;
            const pending = rows.filter(c => c.status === 'PENDING').length;
            const shipped = rows.filter(c => c.status === 'SHIPPED').length;
            if (rows.length === 0) return 'Aucune commande active pour le moment.';
            let text = `Tu as ${rows.length} commande${rows.length > 1 ? 's' : ''} active${rows.length > 1 ? 's' : ''}.`;
            if (pending > 0) text += ` ${pending} en attente de ta réponse.`;
            if (shipped > 0) text += ` ${shipped} en livraison.`;
            return text;
        }

        // ── MARCHÉ ────────────────────────────────────────────────────────
        if (route.includes('marche')) {
            const [{ count }, { data: recents }] = await Promise.all([
                supabase.from('products').select('*', { count: 'exact', head: true }),
                supabase.from('products').select('name').order('created_at', { ascending: false }).limit(3),
            ]);
            let text = `Le marché virtuel a ${count ?? 0} produit${(count ?? 0) > 1 ? 's' : ''} disponibles.`;
            if (recents?.length) text += ` Récents : ${recents.map((p: any) => p.name).join(', ')}.`;
            return text;
        }

        // ── DEMANDES ENRÔLEMENT (COOPERATIVE / AGENT) ─────────────────────
        if (route.includes('demandes') || (route.includes('enrolement') && role !== 'MERCHANT')) {
            const { data: demandes } = await supabase
                .from('demandes_enrolement').select('nom, type').eq('statut', 'en_attente').limit(5);
            const nb = (demandes ?? []).length;
            if (nb === 0) return 'Aucune demande en attente pour le moment.';
            const noms = (demandes ?? []).slice(0, 3).map((d: any) => d.nom).join(', ');
            return `${nb} demande${nb > 1 ? 's' : ''} en attente : ${noms}${nb > 3 ? ' et d\'autres' : ''}.`;
        }

        // ── SECTEUR AGENT ─────────────────────────────────────────────────
        if (route.includes('secteur')) {
            const { count } = await supabase
                .from('profiles').select('*', { count: 'exact', head: true })
                .in('role', ['MERCHANT', 'PRODUCER']).eq('agent_id', userId);
            return `Ton secteur compte ${count ?? 0} membre${(count ?? 0) > 1 ? 's' : ''} enregistré${(count ?? 0) > 1 ? 's' : ''}.`;
        }

        // ── MEMBRES COOPERATIVE ───────────────────────────────────────────
        if (route.includes('membres')) {
            const { count } = await supabase
                .from('profiles').select('*', { count: 'exact', head: true })
                .in('role', ['MERCHANT', 'PRODUCER', 'FIELD_AGENT']);
            return `Le réseau compte ${count ?? 0} membre${(count ?? 0) > 1 ? 's' : ''} au total.`;
        }

        // ── VENDRE ────────────────────────────────────────────────────────
        if (route.includes('vendre') && storeId) {
            const { data: dispo } = await supabase
                .from('stock').select('quantity').eq('store_id', storeId).gt('quantity', 0);
            const nb = (dispo ?? []).length;
            if (nb === 0) return 'Attention, tous tes produits sont en rupture de stock.';
            return `${nb} produit${nb > 1 ? 's' : ''} disponible${nb > 1 ? 's' : ''} à vendre. Appuie sur un produit pour l'ajouter au panier.`;
        }

        // ── SCANNER ───────────────────────────────────────────────────────
        if (route.includes('scanner')) {
            return 'Le scanner est prêt. Pointe la caméra vers un code-barres pour enregistrer une vente rapidement.';
        }

        // ── NOTIFICATIONS ─────────────────────────────────────────────────
        if (route.includes('notification')) {
            const { count } = await supabase
                .from('notifications').select('*', { count: 'exact', head: true })
                .eq('user_id', userId).eq('lu', false);
            const nb = count ?? 0;
            if (nb === 0) return 'Aucune nouvelle notification. Tu es à jour.';
            return `Tu as ${nb} notification${nb > 1 ? 's' : ''} non lue${nb > 1 ? 's' : ''}.`;
        }

        // ── PROFIL ────────────────────────────────────────────────────────
        if (route.includes('profil')) {
            const { data: profil } = await supabase
                .from('profiles').select('full_name, role, phone_number, boutique_name')
                .eq('id', userId).single();
            if (!profil) return '';
            const boutique = (profil as any).boutique_name ? `, boutique ${(profil as any).boutique_name}` : '';
            return `Profil de ${(profil as any).full_name}${boutique}. Téléphone : ${(profil as any).phone_number ?? 'non renseigné'}.`;
        }

        // ── PUBLIER (PRODUCTEUR) ──────────────────────────────────────────
        if (route.includes('publier') && storeId) {
            const { count } = await supabase
                .from('products').select('*', { count: 'exact', head: true }).eq('store_id', storeId);
            return `Tu as déjà ${count ?? 0} produit${(count ?? 0) > 1 ? 's' : ''} publié${(count ?? 0) > 1 ? 's' : ''} sur le marché. Remplis le formulaire pour en ajouter un nouveau.`;
        }

        // ── LIVRAISONS (PRODUCTEUR) ───────────────────────────────────────
        if (route.includes('livraison') && storeId) {
            const { data: livs } = await supabase
                .from('orders').select('status, product_name')
                .eq('seller_store_id', storeId)
                .in('status', ['ACCEPTED', 'SHIPPED']).limit(10);
            const rows     = (livs ?? []) as Array<{ status: string; product_name?: string }>;
            const toSend   = rows.filter(l => l.status === 'ACCEPTED').length;
            const enRoute  = rows.filter(l => l.status === 'SHIPPED').length;
            if (rows.length === 0) return 'Aucune livraison en cours pour le moment.';
            let text = `${rows.length} livraison${rows.length > 1 ? 's' : ''} active${rows.length > 1 ? 's' : ''}.`;
            if (toSend  > 0) text += ` ${toSend} à expédier.`;
            if (enRoute > 0) text += ` ${enRoute} en route.`;
            return text;
        }

        // ── ACTIVITÉS (AGENT) ─────────────────────────────────────────────
        if (route.includes('activites')) {
            const [{ count: nbMois }, { data: recents }] = await Promise.all([
                supabase.from('demandes_enrolement').select('*', { count: 'exact', head: true })
                    .eq('agent_id', userId).gte('date_demande', firstDay),
                supabase.from('demandes_enrolement').select('nom, statut')
                    .eq('agent_id', userId).order('date_demande', { ascending: false }).limit(3),
            ]);
            let text = `Ce mois tu as soumis ${nbMois ?? 0} enrôlement${(nbMois ?? 0) > 1 ? 's' : ''}.`;
            if ((recents ?? []).length > 0) {
                const noms = (recents ?? []).map((d: any) => d.nom).join(', ');
                text += ` Dernières demandes : ${noms}.`;
            }
            return text;
        }

        // ── CONFORMITÉ (AGENT) ────────────────────────────────────────────
        if (route.includes('conformite')) {
            const { data: sigs } = await supabase
                .from('reports').select('member_name, status')
                .eq('reporter_id', userId).eq('status', 'PENDING').limit(5);
            const nb = (sigs ?? []).length;
            if (nb === 0) return 'Aucun signalement en attente de traitement de ta part.';
            return `${nb} signalement${nb > 1 ? 's' : ''} en attente de traitement.`;
        }

        // ── ACHATS GROUPÉS (COOPERATIVE) ──────────────────────────────────
        if (route.includes('achat')) {
            const { data: achats } = await supabase
                .from('achats_groupes').select('statut').in('statut', ['OPEN', 'NEGOTIATION']);
            const nb = (achats ?? []).length;
            if (nb === 0) return 'Aucun achat groupé en cours. Tu peux en créer un nouveau.';
            return `${nb} achat${nb > 1 ? 's' : ''} groupé${nb > 1 ? 's' : ''} ouvert${nb > 1 ? 's' : ''}, les marchands peuvent encore rejoindre.`;
        }

        // ── PERFORMANCES (COOPERATIVE) ────────────────────────────────────
        if (route.includes('performances')) {
            const [{ count: nbMerchants }, { count: nbOrders }, { data: txMois }] = await Promise.all([
                supabase.from('profiles').select('*', { count: 'exact', head: true }).in('role', ['MERCHANT', 'merchant']),
                supabase.from('orders').select('*', { count: 'exact', head: true }).gte('created_at', firstDay),
                supabase.from('transactions').select('price').gte('created_at', firstDay),
            ]);
            const volume = (txMois ?? []).reduce((a: number, v: any) => a + (v.price ?? 0), 0);
            return `Le réseau compte ${nbMerchants ?? 0} marchands. Ce mois : ${nbOrders ?? 0} commandes B2B et ${volume.toLocaleString('fr-FR')} francs de ventes.`;
        }

        // ── ANALYSES (COOPERATIVE) ────────────────────────────────────────
        if (route.includes('analyses')) {
            const { data: topProduits } = await supabase
                .from('orders').select('product_name, total_amount')
                .gte('created_at', firstDay)
                .order('total_amount', { ascending: false }).limit(3);
            const rows = (topProduits ?? []) as Array<{ product_name?: string; total_amount?: number }>;
            if (rows.length === 0) return 'Pas encore assez de données ce mois pour les analyses.';
            const noms = rows.map(p => p.product_name ?? '?').filter(Boolean).join(', ');
            return `Les produits les plus commandés ce mois : ${noms}.`;
        }

        // ── ADMIN DASHBOARD ───────────────────────────────────────────────
        if (route === '/admin' || route.includes('/admin')) {
            const [{ count: nbUsers }, { count: nbPending }, { data: txMois }] = await Promise.all([
                supabase.from('profiles').select('*', { count: 'exact', head: true }),
                supabase.from('demandes_enrolement').select('*', { count: 'exact', head: true }).eq('statut', 'en_attente'),
                supabase.from('transactions').select('price').gte('created_at', firstDay),
            ]);
            const volume = (txMois ?? []).reduce((a: number, v: any) => a + (v.price ?? 0), 0);
            return `Le réseau compte ${nbUsers ?? 0} utilisateurs. ${nbPending ?? 0} enrôlement${(nbPending ?? 0) > 1 ? 's' : ''} en attente. Volume ce mois : ${volume.toLocaleString('fr-FR')} francs.`;
        }

        return '';
    } catch (err) {
        console.warn('[groqAI] fetchScreenDebrief error:', (err as Error)?.message);
        reportApiError('Groq fetchScreenDebrief', err, 'groqAI.fetchScreenDebrief');
        return '';
    }
}

// ── Vérification connectivité (synchrone, sans requête HTTP) ──────────────
let _mobileOnline = true;
export function setOnlineStatus(status: boolean) { _mobileOnline = status; }
export function isOnline(): boolean {
    if (Platform.OS === 'web') {
        return typeof navigator !== 'undefined' ? navigator.onLine : true;
    }
    return _mobileOnline;
}
