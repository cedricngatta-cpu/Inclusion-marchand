// Logique audio de l'assistant vocal + exécution des actions métier
// Web : MediaRecorder + Deepgram | Mobile : expo-audio + Deepgram
import { Platform } from 'react-native';
import { fetchRoleContext, buildSystemPrompt, GroqMessage, VoiceAction, isOnline } from './groqAI';
import { supabase } from './supabase';
import { emitEvent } from './socket';
import { reportApiError } from './errorReporter';
import { deepgramSpeak, stopDeepgramSpeaking } from './deepgramTTS';
import { deepgramTranscribe, deepgramTranscribeWeb } from './deepgramSTT';
import { parseLocalCommand } from './localCommandParser';
import {
    startWebRecording, stopWebRecording, cancelWebRecording,
    isMediaRecorderAvailable,
} from './webAudioRecorder';
import { offlineQueue } from './offlineQueue';
import { offlineCache, CACHE_KEYS, CACHE_TTL } from './offlineCache';

const log = (...args: any[]) => { if (__DEV__) console.log(...args); };

const isWebPlatform = Platform.OS === 'web';

const generateUUID = (): string =>
    'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
        const r = Math.random() * 16 | 0;
        return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
    });

export type AssistantState =
    | 'idle'
    | 'welcome'
    | 'listening'
    | 'processing'
    | 'speaking'
    | 'confirming'
    | 'error';

// Mode audio lecture — haut-parleur iOS (utilise par les fonctions mobile)
const AUDIO_MODE_PLAYBACK = {
    allowsRecording: false,
    playsInSilentMode: true,
    shouldPlayInBackground: false,
    interruptionMode: 'duckOthers' as const,
    shouldRouteThroughEarpiece: false,
};

// ── Blob web stocke entre start et stop ──────────────────────────────────────
let lastWebBlob: Blob | null = null;

// ── Enregistrement mobile (expo-audio) ───────────────────────────────────────
let recorderInstance: any = null; // AudioRecorder (import dynamique mobile)

async function startMobileRecording(): Promise<void> {
    const { AudioModule, setAudioModeAsync, requestRecordingPermissionsAsync, RecordingPresets } = await import('expo-audio');

    const { status } = await requestRecordingPermissionsAsync();
    if (status !== 'granted') throw new Error('Permission microphone refusée');

    await setAudioModeAsync({
        allowsRecording: true,
        playsInSilentMode: true,
        interruptionMode: 'doNotMix',
        shouldRouteThroughEarpiece: false,
    });

    const RECORDING_OPTIONS = {
        ...RecordingPresets.HIGH_QUALITY,
        numberOfChannels: 1,
        extension: '.m4a',
        android: {
            ...RecordingPresets.HIGH_QUALITY.android,
            outputFormat: 'mpeg4' as const,
            audioEncoder: 'aac' as const,
        },
        ios: {
            ...RecordingPresets.HIGH_QUALITY.ios,
            numberOfChannels: 1,
        },
    };

    const recorder = new AudioModule.AudioRecorder(RECORDING_OPTIONS);
    await recorder.prepareToRecordAsync();
    recorder.record();
    recorderInstance = recorder;
}

async function stopMobileRecording(): Promise<string | null> {
    if (!recorderInstance) return null;
    await recorderInstance.stop();
    const uri = recorderInstance.uri;
    recorderInstance = null;

    const { setAudioModeAsync } = await import('expo-audio');
    await setAudioModeAsync(AUDIO_MODE_PLAYBACK);

    return uri ?? null;
}

async function cancelMobileRecording(): Promise<void> {
    if (!recorderInstance) return;
    try { await recorderInstance.stop(); } catch { /* ignore */ }
    recorderInstance = null;
    try {
        const { setAudioModeAsync } = await import('expo-audio');
        await setAudioModeAsync(AUDIO_MODE_PLAYBACK);
    } catch { /* ignore */ }
}

// ── API publique unifiée (web + mobile) ──────────────────────────────────────

export async function startRecording(): Promise<void> {
    log('=== DEBUT ENREGISTREMENT ===', 'Platform:', Platform.OS);
    lastWebBlob = null;

    if (isWebPlatform) {
        await startWebRecording();
    } else {
        await startMobileRecording();
    }
    log('Enregistrement demarre');
}

/** Arrete l'enregistrement. Retourne un URI (mobile) ou '__web_blob__' (web). */
export async function stopRecording(): Promise<string | null> {
    log('=== FIN ENREGISTREMENT ===');

    if (isWebPlatform) {
        lastWebBlob = await stopWebRecording();
        if (!lastWebBlob) return null;
        return '__web_blob__'; // Marqueur — le vrai blob est dans lastWebBlob
    }

    return stopMobileRecording();
}

export async function cancelRecording(): Promise<void> {
    if (isWebPlatform) {
        cancelWebRecording();
        lastWebBlob = null;
    } else {
        await cancelMobileRecording();
    }
}

// ── Transcription intelligente (web + mobile, online + offline) ──────────────

export type TranscribeSource = 'deepgram' | 'native' | 'web' | 'groq';

export async function transcribeRecording(
    uri: string,
): Promise<{ text: string; source: TranscribeSource }> {
    const online = await isOnline();

    // ── WEB ──────────────────────────────────────────────────────────────
    if (isWebPlatform) {
        if (!lastWebBlob) {
            log('Pas de blob audio web enregistre');
            return { text: '', source: 'web' };
        }

        if (online) {
            // Envoyer le blob a Deepgram — timeout et erreurs gerees dans deepgramSTT
            const blob = lastWebBlob;
            lastWebBlob = null;
            const result = await deepgramTranscribeWeb(blob);
            return { text: result.text, source: result.source };
        }

        // Offline web : on ne peut pas reenvoyer le blob, retourner vide
        // (le parser local gerera la commande si l'utilisateur reparle)
        lastWebBlob = null;
        return { text: '', source: 'web' };
    }

    // ── MOBILE ───────────────────────────────────────────────────────────
    if (online) {
        const result = await deepgramTranscribe(uri);
        return { text: result.text, source: result.source };
    }

    // Fallback mobile offline : expo-speech-recognition
    const { nativeSpeechRecognition } = await import('./speechRecognition');
    const result = await nativeSpeechRecognition();
    return { text: result.text, source: 'native' };
}

// ── Parser local offline ─────────────────────────────────────────────────
export { parseLocalCommand } from './localCommandParser';

// ── Conversion nombre → mots français ─────────────────────────────────────
function numberToFrenchWords(n: number): string {
    if (n === 0) return 'zéro';
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

// ── Nettoyage du texte avant TTS ───────────────────────────────────────────
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

    // Supprimer les caractères spéciaux qui cassent la voix
    clean = clean.replace(/[→←▶►◀◄•■▪▸★☆✓✗✅❌⚠️🔴🟡🟢]/g, '');

    // Supprimer les emojis (plage Unicode étendue)
    clean = clean.replace(/[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu, '');

    // Nettoyer le markdown
    clean = clean.replace(/\*\*(.*?)\*\*/g, '$1'); // **gras** → gras
    clean = clean.replace(/\*(.*?)\*/g,     '$1'); // *italique* → italique

    // Normaliser les sauts de ligne et tirets décoratifs
    clean = clean.replace(/---+/g, '.');
    clean = clean.replace(/\n{2,}/g, '. ');
    clean = clean.replace(/\n/g, '. ');

    // Supprimer les doubles espaces et points
    clean = clean.replace(/\.{2,}/g, '.');
    clean = clean.replace(/\s{2,}/g, ' ');

    return clean.trim();
}

// ── TTS ────────────────────────────────────────────────────────────────────
export function stopSpeaking(): void {
    stopDeepgramSpeaking();
}

export function speakText(text: string, onDone?: () => void): void {
    log('TTS → parle:', text.slice(0, 60));
    // Deepgram TTS gere le fallback vers expo-speech automatiquement
    deepgramSpeak(text, onDone);
}

// ── Initialisation de la conversation ─────────────────────────────────────
export async function initConversation(
    role: string,
    userId: string,
    userName: string,
    storeId?: string,
): Promise<GroqMessage> {
    const donneesContext = await fetchRoleContext(role, userId, storeId);
    const content        = buildSystemPrompt(userName, role, donneesContext);
    return { role: 'system', content };
}

// ── Helpers de confirmation vocale ────────────────────────────────────────
const YES = ['oui', 'ok', 'vas-y', 'confirme', 'valide', 'accord', 'yes', 'ouais', 'bonne'];
const NO  = ['non', 'annule', 'laisse', 'no', 'annuler', 'pas', 'arrête', 'stop', 'arrete'];

function normalizeText(t: string) {
    return t.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

export function isVoiceConfirmation(text: string): boolean {
    const n = normalizeText(text);
    return text.trim().split(/\s+/).length <= 3 && YES.some(w => n.includes(w));
}

export function isVoiceCancellation(text: string): boolean {
    const n = normalizeText(text);
    return text.trim().split(/\s+/).length <= 3 && NO.some(w => n.includes(w));
}

// ── Helpers de navigation locale ──────────────────────────────────────────
import { matchLocalCommand } from './voiceCommands';

export function getLocalRoute(transcript: string, role: string): string | null {
    const result = matchLocalCommand(transcript, role);
    return result.type === 'navigation' ? (result.command?.route ?? null) : null;
}

export function isLogoutCommand(transcript: string, role: string): boolean {
    return matchLocalCommand(transcript, role).type === 'logout';
}

export function isLocalCommand(transcript: string, role: string): boolean {
    return matchLocalCommand(transcript, role).type !== 'none';
}

export function getLocalConfirmation(transcript: string, role: string): string | null {
    const result = matchLocalCommand(transcript, role);
    return result.type !== 'none' ? (result.confirmation ?? null) : null;
}

// ═════════════════════════════════════════════════════════════════════════════
// HELPERS DE RECHERCHE (ILIKE insensible à la casse)
// ═════════════════════════════════════════════════════════════════════════════

// Recherche flexible : essaie plusieurs variantes du nom jusqu'à trouver
async function findProductInStore(
    nom: string,
    storeId: string,
    fields = 'id, name, price',
): Promise<any | null> {
    const base     = nom.toLowerCase().trim();
    const sansS    = base.replace(/s$/i, '');
    const motsCles = base.split(/\s+/).filter((w: string) => w.length > 2);

    const tryIlike = async (pattern: string) => {
        const { data } = await supabase
            .from('products').select(fields)
            .eq('store_id', storeId)
            .ilike('name', `%${pattern}%`)
            .limit(1);
        return data?.[0] ?? null;
    };

    return (
        await tryIlike(base) ??
        (sansS !== base ? await tryIlike(sansS) : null) ??
        (motsCles.length > 0 ? await tryIlike(motsCles.sort((a: string, b: string) => b.length - a.length)[0]) : null)
    );
}

// Recherche d'un produit sur le marché (stores PRODUCER)
async function findProductMarche(nom: string, fields = 'id, name, price, store_id'): Promise<any | null> {
    const { data: stores } = await supabase.from('stores').select('id').eq('store_type', 'PRODUCER');
    if (!stores?.length) return null;
    const storeIds = stores.map((s: any) => s.id);

    const base     = nom.toLowerCase().trim();
    const motsCles = base.split(/\s+/).filter((w: string) => w.length > 2);
    const variants = [...new Set([base, base.replace(/s$/i, ''), ...motsCles])];

    for (const v of variants) {
        const { data } = await supabase
            .from('products').select(fields)
            .in('store_id', storeIds)
            .ilike('name', `%${v}%`)
            .limit(1);
        if (data?.[0]) return data[0];
    }
    return null;
}

// Recherche d'un profil par nom
async function findProfileByName(nom: string, fields = 'id, full_name, role, phone_number'): Promise<any | null> {
    const base = nom.toLowerCase().trim();
    const { data } = await supabase
        .from('profiles').select(fields)
        .ilike('full_name', `%${base}%`)
        .limit(1);
    return data?.[0] ?? null;
}

// Recherche d'une commande en attente pour un producteur
async function findPendingOrderBySeller(
    sellerStoreId: string,
    marchandNom?: string,
): Promise<any | null> {
    let query = supabase
        .from('orders')
        .select('id, status, quantity, total_amount, product_name, buyer_store_id')
        .eq('seller_store_id', sellerStoreId)
        .in('status', ['PENDING', 'ACCEPTED', 'SHIPPED'])
        .order('created_at', { ascending: false })
        .limit(10);

    const { data: orders } = await query;
    if (!orders?.length) return null;

    if (marchandNom) {
        const n = marchandNom.toLowerCase();
        // Chercher le store du marchand mentionné
        const { data: profiles } = await supabase
            .from('profiles').select('id').ilike('full_name', `%${n}%`).limit(5);
        if (profiles?.length) {
            const profIds = profiles.map((p: any) => p.id);
            const { data: stores } = await supabase
                .from('stores').select('id').in('owner_id', profIds).limit(5);
            if (stores?.length) {
                const storeIds = stores.map((s: any) => s.id);
                const found = orders.find((o: any) => storeIds.includes(o.buyer_store_id));
                if (found) return found;
            }
        }
    }
    return orders[0]; // Retourne la plus récente
}

// Recherche d'une demande d'enrôlement par nom
async function findDemande(nom: string, statuts?: string[]): Promise<any | null> {
    let q = supabase
        .from('demandes_enrolement')
        .select('id, nom, telephone, type, adresse, nom_boutique, statut, agent_id')
        .ilike('nom', `%${nom.toLowerCase()}%`);
    if (statuts?.length) q = q.in('statut', statuts);
    const { data } = await q.limit(1);
    return data?.[0] ?? null;
}

// ═════════════════════════════════════════════════════════════════════════════
// EXÉCUTION DE TOUTES LES ACTIONS VOCALES
// ═════════════════════════════════════════════════════════════════════════════

export interface ActionContext {
    storeId?: string;
    userId?: string;
    role?: string;
}

export async function executeVoiceAction(
    action: VoiceAction,
    ctx: ActionContext,
    navigate: (route: string) => void,
): Promise<string> {
    const { storeId, userId } = ctx;
    const d = action.details ?? {};

    try {
        switch (action.type) {

            // ── VENDRE ─────────────────────────────────────────────────────
            case 'vendre': {
                if (!storeId) return "Aucun store trouvé.";
                const nomProduit = String(d.produit ?? d.produit_nom ?? d.product ?? '').trim();
                if (!nomProduit) return "Je n'ai pas compris le nom du produit.";

                // Chercher le produit en ligne OU dans le cache offline
                const online = await isOnline();
                let prod: any = null;

                if (online) {
                    prod = await findProductInStore(nomProduit, storeId, 'id, name, price');
                } else {
                    // Chercher dans le cache produits local
                    const cached = await offlineCache.get<any[]>(CACHE_KEYS.products(storeId));
                    if (cached?.data) {
                        const norm = nomProduit.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
                        prod = cached.data.find((p: any) => {
                            const pn = (p.name ?? '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
                            return pn.includes(norm) || pn.includes(norm.replace(/s$/, ''));
                        }) ?? null;
                    }
                }

                if (!prod) {
                    if (online) {
                        const { data: tous } = await supabase.from('products').select('name').eq('store_id', storeId).limit(8);
                        const liste = (tous ?? []).map((p: any) => p.name).join(', ');
                        return liste
                            ? `Je n'ai pas trouvé "${nomProduit}". Produits disponibles : ${liste}.`
                            : `Je n'ai pas trouvé "${nomProduit}" dans votre stock.`;
                    }
                    return `Je n'ai pas trouvé "${nomProduit}" dans le cache local.`;
                }

                const qte   = Math.max(1, parseInt(String(d.quantite ?? 1), 10));
                const total = (prod.price ?? 0) * qte;
                const client = String(d.client ?? d.client_nom ?? '').trim() || null;
                const paiement = String(d.paiement ?? 'especes').trim();
                const statusVal = paiement === 'dette' ? 'DETTE' : paiement === 'momo' ? 'MOMO' : 'PAYÉ';
                const txId  = generateUUID();
                const now   = new Date().toISOString();

                const txData = {
                    id:           txId,
                    store_id:     storeId,
                    product_id:   prod.id,
                    product_name: prod.name,
                    type:         'VENTE',
                    quantity:     qte,
                    price:        total,
                    client_name:  client,
                    status:       statusVal,
                    source:       online ? 'voice' : 'voice_offline',
                    created_at:   now,
                };

                if (online) {
                    const { error } = await supabase.from('transactions').insert([txData]);
                    if (error) throw error;

                    // Décrémenter le stock en ligne
                    const { data: st } = await supabase.from('stock')
                        .select('product_id, quantity')
                        .eq('store_id', storeId).eq('product_id', prod.id).maybeSingle();
                    const newQty = st ? Math.max(0, (st.quantity ?? 0) - qte) : 0;
                    if (st) {
                        await supabase.from('stock')
                            .update({ quantity: newQty, updated_at: new Date().toISOString() })
                            .eq('store_id', storeId).eq('product_id', prod.id);
                    }

                    emitEvent('nouvelle-vente', {
                        storeId,
                        transaction: {
                            id: txId, type: 'VENTE', productId: prod.id, productName: prod.name,
                            quantity: qte, price: total, timestamp: new Date(now).getTime(),
                            clientName: client ?? undefined, status: statusVal,
                        },
                    });
                    emitEvent('stock-update', { storeId, productId: prod.id, newQty });
                } else {
                    // OFFLINE : ajouter à la queue + mettre à jour le cache local
                    await offlineQueue.addTransaction(storeId, txData as any);

                    // Mettre à jour le cache transactions local
                    const cachedTx = await offlineCache.get<any[]>(CACHE_KEYS.transactions(storeId));
                    const txList = cachedTx?.data ?? [];
                    txList.unshift(txData);
                    await offlineCache.set(CACHE_KEYS.transactions(storeId), txList, CACHE_TTL.IMPORTANT);

                    // Mettre à jour le cache stock local
                    const cachedStock = await offlineCache.get<any[]>(CACHE_KEYS.stock(storeId));
                    if (cachedStock?.data) {
                        const stockList = cachedStock.data;
                        const idx = stockList.findIndex((s: any) => s.product_id === prod.id);
                        if (idx >= 0) {
                            stockList[idx].quantity = Math.max(0, (stockList[idx].quantity ?? 0) - qte);
                            stockList[idx].updated_at = now;
                        }
                        await offlineCache.set(CACHE_KEYS.stock(storeId), stockList);
                    }

                    // Ajouter la mise à jour stock à la queue offline
                    const cachedSt = await offlineCache.get<any[]>(CACHE_KEYS.stock(storeId));
                    const currentQty = cachedSt?.data?.find((s: any) => s.product_id === prod.id)?.quantity ?? 0;
                    await offlineQueue.setStockUpdate(storeId, prod.id, currentQty);

                    log('[Offline] Vente ajoutée à la queue:', txId);
                }
                const prixUnit = prod.price ?? 0;
                const paiementLabel = statusVal === 'DETTE' ? 'à crédit' : statusVal === 'MOMO' ? 'par Mobile Money' : 'en espèces';
                return `Vente enregistrée : ${qte} ${prod.name} à ${prixUnit.toLocaleString('fr-FR')} francs${qte > 1 ? ' l\'unité' : ''}${client ? ` pour ${client}` : ''}. Total : ${total.toLocaleString('fr-FR')} francs CFA. Paiement ${paiementLabel}.`;
            }

            // ── VENDRE MULTIPLE ────────────────────────────────────────────
            case 'vendre_multiple': {
                if (!storeId) return "Aucun store trouvé.";
                const produits: Array<{ nom: string; quantite: number }> = Array.isArray(d.produits) ? d.produits : [];
                if (!produits.length) return "Aucun produit spécifié.";

                const online = await isOnline();
                const client  = String(d.client ?? d.client_nom ?? '').trim() || null;
                const paiement = String(d.paiement ?? 'especes').trim();
                const resultats: string[] = [];
                let totalGeneral = 0;

                const statusVal = paiement === 'dette' ? 'DETTE' : paiement === 'momo' ? 'MOMO' : 'PAYÉ';
                const transactions: any[] = [];
                const stockUpdates: Array<{ productId: string; newQty: number }> = [];

                // Charger le cache produits pour mode offline
                let cachedProducts: any[] | null = null;
                if (!online) {
                    const cached = await offlineCache.get<any[]>(CACHE_KEYS.products(storeId));
                    cachedProducts = cached?.data ?? null;
                }

                for (const item of produits) {
                    let prod: any = null;
                    if (online) {
                        prod = await findProductInStore(String(item.nom), storeId, 'id, name, price');
                    } else if (cachedProducts) {
                        const norm = String(item.nom).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
                        prod = cachedProducts.find((p: any) => {
                            const pn = (p.name ?? '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
                            return pn.includes(norm) || pn.includes(norm.replace(/s$/, ''));
                        }) ?? null;
                    }
                    if (!prod) { resultats.push(`"${item.nom}" non trouvé`); continue; }

                    const qte   = Math.max(1, parseInt(String(item.quantite ?? 1), 10));
                    const total = (prod.price ?? 0) * qte;
                    totalGeneral += total;
                    const txId = generateUUID();
                    const now  = new Date().toISOString();

                    const txData = {
                        id: txId, store_id: storeId, product_id: prod.id, product_name: prod.name,
                        type: 'VENTE', quantity: qte, price: total,
                        client_name: client, status: statusVal, source: online ? 'voice' : 'voice_offline', created_at: now,
                    };

                    if (online) {
                        await supabase.from('transactions').insert([txData]);
                        const { data: st } = await supabase.from('stock')
                            .select('quantity').eq('store_id', storeId).eq('product_id', prod.id).maybeSingle();
                        const newQty = st ? Math.max(0, (st.quantity ?? 0) - qte) : 0;
                        if (st) {
                            await supabase.from('stock')
                                .update({ quantity: newQty, updated_at: new Date().toISOString() })
                                .eq('store_id', storeId).eq('product_id', prod.id);
                        }
                        stockUpdates.push({ productId: prod.id, newQty });
                    } else {
                        await offlineQueue.addTransaction(storeId, txData as any);
                    }

                    transactions.push({
                        id: txId, type: 'VENTE', productId: prod.id, productName: prod.name,
                        quantity: qte, price: total, timestamp: new Date(now).getTime(),
                        clientName: client ?? undefined, status: statusVal,
                    });
                    resultats.push(`${qte} ${prod.name}`);
                }

                if (online) {
                    if (transactions.length > 0) {
                        emitEvent('nouvelle-vente', { storeId, transaction: transactions[transactions.length - 1] });
                    }
                    stockUpdates.forEach(u => emitEvent('stock-update', { storeId, productId: u.productId, newQty: u.newQty }));
                } else if (transactions.length > 0) {
                    // Mettre à jour le cache transactions + stock en offline
                    const cachedTx = await offlineCache.get<any[]>(CACHE_KEYS.transactions(storeId));
                    const txList = cachedTx?.data ?? [];
                    for (const t of transactions) {
                        txList.unshift({ id: t.id, store_id: storeId, product_id: t.productId, product_name: t.productName, type: 'VENTE', quantity: t.quantity, price: t.price, client_name: t.clientName ?? null, status: t.status, created_at: new Date(t.timestamp).toISOString() });
                    }
                    await offlineCache.set(CACHE_KEYS.transactions(storeId), txList, CACHE_TTL.IMPORTANT);

                    const cachedStock = await offlineCache.get<any[]>(CACHE_KEYS.stock(storeId));
                    if (cachedStock?.data) {
                        const stockList = cachedStock.data;
                        for (const t of transactions) {
                            const idx = stockList.findIndex((s: any) => s.product_id === t.productId);
                            if (idx >= 0) {
                                stockList[idx].quantity = Math.max(0, (stockList[idx].quantity ?? 0) - t.quantity);
                            }
                        }
                        await offlineCache.set(CACHE_KEYS.stock(storeId), stockList);
                    }
                    log('[Offline] Ventes multiples ajoutées à la queue:', transactions.length);
                }
                const paiementLabelMulti = statusVal === 'DETTE' ? 'à crédit' : statusVal === 'MOMO' ? 'par Mobile Money' : 'en espèces';
                return `Vente enregistrée : ${resultats.join(', ')}${client ? ` pour ${client}` : ''}. Total : ${totalGeneral.toLocaleString('fr-FR')} francs CFA. Paiement ${paiementLabelMulti}.`;
            }

            // ── STOCK AJOUT ────────────────────────────────────────────────
            case 'stock_ajout':
            case 'stock': {
                if (!storeId) return "Aucun store trouvé.";
                const nomProduit = String(d.produit ?? d.produit_nom ?? '').trim();
                if (!nomProduit) return "Quel produit voulez-vous réapprovisionner ?";

                const prod = await findProductInStore(nomProduit, storeId, 'id, name');
                if (!prod) return `Je n'ai pas trouvé "${nomProduit}" dans votre catalogue.`;

                const ajout = Math.max(1, parseInt(String(d.quantite ?? 1), 10));
                const { data: st } = await supabase.from('stock')
                    .select('quantity').eq('store_id', storeId).eq('product_id', prod.id).maybeSingle();

                if (st !== null) {
                    const nouvelleQte = (st.quantity ?? 0) + ajout;
                    await supabase.from('stock')
                        .update({ quantity: nouvelleQte, updated_at: new Date().toISOString() })
                        .eq('store_id', storeId).eq('product_id', prod.id);
                    emitEvent('stock-update', { storeId, productId: prod.id });
                    return `Stock mis à jour ! ${prod.name} : +${ajout} unités (total : ${nouvelleQte}).`;
                } else {
                    // Insérer l'entrée stock si elle n'existe pas
                    await supabase.from('stock').insert([{
                        product_id: prod.id, store_id: storeId,
                        quantity: ajout, updated_at: new Date().toISOString(),
                    }]);
                    emitEvent('stock-update', { storeId, productId: prod.id });
                    return `Stock enregistré ! ${prod.name} : ${ajout} unités.`;
                }
            }

            // ── STOCK NOUVEAU PRODUIT ──────────────────────────────────────
            case 'stock_nouveau': {
                if (!storeId) return "Aucun store trouvé.";
                const nom = String(d.nom ?? d.name ?? d.produit ?? '').trim();
                if (!nom) return "Je n'ai pas compris le nom du nouveau produit.";

                const prix     = parseFloat(String(d.prix ?? d.price ?? 0)) || 0;
                const categorie = String(d.categorie ?? d.category ?? 'Autre').trim();
                const quantite  = parseInt(String(d.quantite ?? d.quantity ?? 0), 10);

                const { data: newProd, error } = await supabase
                    .from('products')
                    .insert([{ store_id: storeId, name: nom, price: prix, category: categorie, audio_name: nom }])
                    .select().single();
                if (error) throw error;

                if (newProd && quantite > 0) {
                    await supabase.from('stock').insert([{
                        product_id: newProd.id, store_id: storeId,
                        quantity: quantite, updated_at: new Date().toISOString(),
                    }]);
                }

                emitEvent('stock-update', { storeId });
                return `Produit créé ! "${nom}" à ${prix.toLocaleString('fr-FR')} F${quantite > 0 ? `, ${quantite} en stock` : ''}.`;
            }

            // ── COMMANDER ─────────────────────────────────────────────────
            case 'commander': {
                if (!storeId) return "Aucun store trouvé.";
                const nomProduit = String(d.produit ?? d.produit_nom ?? '').trim();
                const qte        = Math.max(1, parseInt(String(d.quantite ?? 1), 10));

                // Chercher le produit sur le marché producteur
                const prodMarche = await findProductMarche(nomProduit, 'id, name, price, store_id');
                if (!prodMarche) {
                    return `Je n'ai pas trouvé "${nomProduit}" sur le marché. Essayez d'ouvrir le marché virtuel pour chercher.`;
                }

                const prixTotal = (prodMarche.price ?? 0) * qte;
                const { error } = await supabase.from('orders').insert([{
                    buyer_store_id:  storeId,
                    seller_store_id: prodMarche.store_id,
                    product_id:      prodMarche.id,
                    product_name:    prodMarche.name,
                    quantity:        qte,
                    unit_price:      prodMarche.price ?? 0,
                    total_amount:    prixTotal,
                    status:          'PENDING',
                    notes:           d.notes ?? null,
                }]);
                if (error) throw error;

                emitEvent('nouvelle-commande', { buyerStoreId: storeId, sellerStoreId: prodMarche.store_id });
                return `Commande passée ! ${qte} × ${prodMarche.name} pour ${prixTotal.toLocaleString('fr-FR')} F. Le producteur va être notifié.`;
            }

            // ── DETTE AJOUT ────────────────────────────────────────────────
            case 'dette_ajout': {
                if (!userId) return "Erreur utilisateur.";
                const client  = String(d.client ?? d.client_nom ?? '').trim();
                const montant = parseFloat(String(d.montant ?? 0)) || 0;
                if (!client) return "Je n'ai pas compris le nom du client.";
                if (montant <= 0) return "Je n'ai pas compris le montant de la dette.";

                const { error } = await supabase.from('credits_clients').insert([{
                    marchand_id:     userId,
                    client_nom:      client,
                    client_telephone: String(d.telephone ?? '').trim() || null,
                    montant_du:      montant,
                    date_credit:     new Date().toISOString(),
                    statut:          'en_attente',
                }]);
                if (error) throw error;

                return `Dette enregistrée ! ${client} vous doit ${montant.toLocaleString('fr-FR')} F.`;
            }

            // ── DETTE PAYÉE ────────────────────────────────────────────────
            case 'dette_payee': {
                if (!userId) return "Erreur utilisateur.";
                const client = String(d.client ?? d.client_nom ?? '').trim();
                if (!client) return "Je n'ai pas compris le nom du client.";

                const { data: dettes } = await supabase
                    .from('credits_clients')
                    .select('id, montant_du')
                    .eq('marchand_id', userId)
                    .ilike('client_nom', `%${client}%`)
                    .neq('statut', 'paye')
                    .limit(5);

                if (!dettes?.length) return `Aucune dette en cours trouvée pour "${client}".`;

                // Marquer toutes ses dettes comme payées
                const ids = dettes.map((d: any) => d.id);
                await supabase.from('credits_clients')
                    .update({ statut: 'paye' })
                    .in('id', ids);

                const totalPaye = dettes.reduce((a: number, d: any) => a + (d.montant_du ?? 0), 0);
                return `C'est enregistré ! ${client} a payé ses dettes (${totalPaye.toLocaleString('fr-FR')} F au total).`;
            }

            // ── PUBLIER PRODUIT (PRODUCTEUR) ───────────────────────────────
            case 'publier': {
                if (!storeId) return "Aucun store trouvé.";
                const nom = String(d.nom ?? d.name ?? d.produit ?? '').trim();
                if (!nom) return "Je n'ai pas compris le nom du produit à publier.";

                const prix           = parseFloat(String(d.prix ?? d.price ?? 0)) || 0;
                const quantite       = parseInt(String(d.quantite ?? d.quantity ?? 0), 10);
                const categorie      = String(d.categorie ?? d.category ?? 'Autre').trim();
                const prixLivraison  = parseFloat(String(d.prix_livraison ?? d.delivery_price ?? 0)) || 0;
                const livreurNom     = String(d.livreur_nom ?? '').trim() || null;
                const livreurTel     = String(d.livreur_telephone ?? '').trim() || null;
                const zoneLivraison  = String(d.zone_livraison ?? '').trim() || null;
                const delaiLivraison = String(d.delai_livraison ?? '').trim() || null;
                const description    = String(d.description ?? '').trim() || null;

                const { data: newProd, error } = await supabase
                    .from('products')
                    .insert([{
                        store_id:        storeId,
                        name:            nom,
                        price:           prix,
                        category:        categorie,
                        audio_name:      nom,
                        delivery_price:  prixLivraison > 0 ? prixLivraison : null,
                        description,
                        zone_livraison:  zoneLivraison,
                        delai_livraison: delaiLivraison,
                        livreur_nom:     livreurNom,
                        livreur_telephone: livreurTel,
                    }])
                    .select().single();
                if (error) throw error;

                if (newProd && quantite > 0) {
                    await supabase.from('stock').upsert([{
                        product_id: newProd.id, store_id: storeId,
                        quantity: quantite, updated_at: new Date().toISOString(),
                    }]);
                }

                emitEvent('nouveau-produit-marche', { storeId, name: nom, productId: newProd?.id });
                return `C'est fait ! "${nom}" est publié sur le Marché Virtuel à ${prix.toLocaleString('fr-FR')} F${quantite > 0 ? ` (${quantite} unités disponibles)` : ''}.`;
            }

            // ── MODIFIER PRODUIT ───────────────────────────────────────────
            case 'produit_modifier': {
                if (!storeId) return "Aucun store trouvé.";
                const nomProduit = String(d.produit ?? d.nom ?? '').trim();
                if (!nomProduit) return "Je n'ai pas compris quel produit modifier.";

                const prod = await findProductInStore(nomProduit, storeId, 'id, name');
                if (!prod) return `Je n'ai pas trouvé "${nomProduit}" dans vos produits.`;

                const updates: Record<string, any> = {};
                if (d.prix != null)        updates.price        = parseFloat(String(d.prix));
                if (d.quantite != null)    updates.quantity     = parseInt(String(d.quantite), 10);
                if (d.description != null) updates.description  = String(d.description);
                if (d.categorie != null)   updates.category     = String(d.categorie);

                if (!Object.keys(updates).length) return "Je n'ai pas compris ce que vous voulez modifier.";

                await supabase.from('products').update(updates).eq('id', prod.id);

                // Mettre à jour le stock si quantite spécifiée
                if (d.quantite != null) {
                    await supabase.from('stock')
                        .upsert([{ product_id: prod.id, store_id: storeId, quantity: updates.quantity, updated_at: new Date().toISOString() }]);
                }

                emitEvent('produit-modifie', { storeId, productId: prod.id });
                const desc = Object.entries(updates).map(([k, v]) => {
                    if (k === 'price') return `prix → ${Number(v).toLocaleString('fr-FR')} F`;
                    if (k === 'quantity') return `quantité → ${v}`;
                    return `${k} modifié`;
                }).join(', ');
                return `C'est fait ! ${prod.name} mis à jour : ${desc}.`;
            }

            // ── ACCEPTER COMMANDE ──────────────────────────────────────────
            case 'commande_accepter': {
                if (!storeId) return "Aucun store trouvé.";
                const marchand = String(d.marchand ?? d.client ?? '').trim();
                const order    = await findPendingOrderBySeller(storeId, marchand || undefined);

                if (!order) return marchand
                    ? `Aucune commande en attente de "${marchand}" trouvée.`
                    : "Aucune commande en attente trouvée.";

                await supabase.from('orders').update({ status: 'ACCEPTED' }).eq('id', order.id);
                emitEvent('commande-acceptee', {
                    orderId: order.id,
                    buyerStoreId: order.buyer_store_id,
                    sellerStoreId: storeId,
                });
                return `Commande acceptée ! ${order.product_name ?? ''} × ${order.quantity} → ${(order.total_amount ?? 0).toLocaleString('fr-FR')} F.`;
            }

            // ── REFUSER COMMANDE ───────────────────────────────────────────
            case 'commande_refuser': {
                if (!storeId) return "Aucun store trouvé.";
                const marchand = String(d.marchand ?? d.client ?? '').trim();
                const order    = await findPendingOrderBySeller(storeId, marchand || undefined);

                if (!order) return marchand
                    ? `Aucune commande de "${marchand}" trouvée.`
                    : "Aucune commande en attente trouvée.";

                await supabase.from('orders').update({ status: 'CANCELLED' }).eq('id', order.id);
                emitEvent('commande-refusee', {
                    orderId: order.id,
                    buyerStoreId: order.buyer_store_id,
                    motif: d.motif ?? '',
                });
                return `Commande refusée${d.motif ? ` (${d.motif})` : ''}. Le marchand sera notifié.`;
            }

            // ── STATUT LIVRAISON ───────────────────────────────────────────
            case 'livraison_statut': {
                if (!storeId) return "Aucun store trouvé.";
                const marchand  = String(d.marchand ?? d.client ?? '').trim();
                const statutRaw = String(d.statut ?? '').toLowerCase();

                // Mapper les valeurs françaises vers les valeurs Supabase
                const statutMap: Record<string, string> = {
                    'en_livraison': 'SHIPPED',
                    'en livraison': 'SHIPPED',
                    'expediee':     'SHIPPED',
                    'expédié':      'SHIPPED',
                };
                const newStatut = statutMap[statutRaw] ?? (statutRaw === 'shipped' ? 'SHIPPED' : 'DELIVERED');

                const order = await findPendingOrderBySeller(storeId, marchand || undefined);
                if (!order) return `Aucune commande active${marchand ? ` de "${marchand}"` : ''} trouvée.`;

                await supabase.from('orders').update({ status: newStatut }).eq('id', order.id);

                const eventName = newStatut === 'SHIPPED' ? 'livraison-en-cours' : 'livraison-terminee';
                emitEvent(eventName, { orderId: order.id, buyerStoreId: order.buyer_store_id });

                const label = newStatut === 'SHIPPED' ? 'en livraison' : 'livrée';
                return `Statut mis à jour ! La commande ${order.product_name ?? ''} est maintenant ${label}.`;
            }

            // ── ENRÔLER ────────────────────────────────────────────────────
            case 'enroler': {
                if (!userId) return "Erreur utilisateur.";
                const nom       = String(d.nom ?? d.name ?? '').trim();
                const telephone = String(d.telephone ?? d.phone ?? '').trim();
                const type      = String(d.type ?? d.role ?? 'marchand').toLowerCase();
                if (!nom)       return "Je n'ai pas compris le nom de la personne à enrôler.";
                if (!telephone) return "Je n'ai pas compris le numéro de téléphone.";

                const { error } = await supabase.from('demandes_enrolement').insert([{
                    agent_id:    userId,
                    nom,
                    telephone,
                    type:        type.includes('producteur') || type.includes('producer') ? 'PRODUCER' : 'MERCHANT',
                    adresse:     String(d.adresse ?? d.adresse ?? '').trim() || null,
                    nom_boutique: String(d.boutique ?? d.nom_boutique ?? d.shop_name ?? '').trim() || null,
                    statut:      'en_attente',
                    date_demande: new Date().toISOString(),
                }]);
                if (error) throw error;

                emitEvent('nouvel-enrolement', { agentId: userId, nom, telephone });
                return `Enrôlement soumis ! La demande de ${nom} (${telephone}) est envoyée à la coopérative pour validation.`;
            }

            // ── SIGNALEMENT ────────────────────────────────────────────────
            case 'signaler': {
                if (!userId) return "Erreur utilisateur.";
                const cibleNom = String(d.cible ?? d.nom ?? '').trim();
                const motif    = String(d.motif ?? '').trim();
                if (!cibleNom) return "Je n'ai pas compris qui signaler.";

                const profil = await findProfileByName(cibleNom, 'id, full_name');

                const { error } = await supabase.from('reports').insert([{
                    reporter_id:  userId,
                    member_name:  profil?.full_name ?? cibleNom,
                    problem_type: motif || 'non-conformite',
                    description:  String(d.details ?? cibleNom).trim(),
                    status:       'PENDING',
                }]);
                if (error) throw error;

                emitEvent('signalement-conformite', { agentId: userId, cibleNom, motif });
                return `Signalement enregistré ! ${profil?.full_name ?? cibleNom} a été signalé pour "${motif || 'non-conformité'}".`;
            }

            // ── VALIDER ENRÔLEMENT ─────────────────────────────────────────
            case 'enrolement_valider': {
                if (ctx.role !== 'COOPERATIVE') return 'Action réservée à la coopérative.';
                const nom = String(d.nom ?? '').trim();
                if (!nom) return "Je n'ai pas compris le nom de la personne à valider.";

                const demande = await findDemande(nom, ['en_attente']);
                if (!demande) return `Aucune demande en attente trouvée pour "${nom}".`;

                // 1. Mettre à jour le statut de la demande
                await supabase.from('demandes_enrolement').update({
                    statut: 'valide',
                    date_traitement: new Date().toISOString(),
                }).eq('id', demande.id);

                // 2. Créer le profil si pas déjà créé
                const roleEnrolement = (demande.type ?? 'MERCHANT').toUpperCase() as string;
                const { data: existingProf } = await supabase
                    .from('profiles').select('id').eq('phone_number', demande.telephone).maybeSingle();

                if (!existingProf) {
                    const { data: newProf } = await supabase.from('profiles').insert([{
                        full_name:    demande.nom,
                        phone_number: demande.telephone,
                        role:         roleEnrolement,
                        address:      demande.adresse ?? null,
                        pin:          '0101',
                        agent_id:     demande.agent_id ?? null,
                    }]).select().single();

                    // Créer le store associé si marchand ou producteur (vérif doublon)
                    if (newProf && (roleEnrolement === 'MERCHANT' || roleEnrolement === 'PRODUCER')) {
                        const { data: existStore } = await supabase
                            .from('stores')
                            .select('id')
                            .eq('owner_id', newProf.id)
                            .maybeSingle();

                        if (!existStore) {
                            await supabase.from('stores').insert([{
                                owner_id:   newProf.id,
                                name:       demande.nom_boutique ?? demande.nom,
                                store_type: roleEnrolement === 'MERCHANT' ? 'RETAILER' : 'PRODUCER',
                                status:     'ACTIVE',
                            }]);
                        }
                    }
                }

                emitEvent('enrolement-valide', { nom: demande.nom, agentId: demande.agent_id });
                return `Enrôlement validé ! ${demande.nom} peut maintenant se connecter avec le PIN par défaut 1234.`;
            }

            // ── REJETER ENRÔLEMENT ─────────────────────────────────────────
            case 'enrolement_rejeter': {
                if (ctx.role !== 'COOPERATIVE') return 'Action réservée à la coopérative.';
                const nom   = String(d.nom ?? '').trim();
                const motif = String(d.motif ?? '').trim();
                if (!nom) return "Je n'ai pas compris le nom de la personne à rejeter.";

                const demande = await findDemande(nom, ['en_attente']);
                if (!demande) return `Aucune demande en attente trouvée pour "${nom}".`;

                await supabase.from('demandes_enrolement').update({
                    statut:          'rejete',
                    motif_rejet:     motif || 'Dossier incomplet',
                    date_traitement: new Date().toISOString(),
                }).eq('id', demande.id);

                emitEvent('enrolement-rejete', { nom: demande.nom, agentId: demande.agent_id, motif });
                return `Demande de ${demande.nom} rejetée${motif ? ` : ${motif}` : ''}. L'agent sera notifié.`;
            }

            // ── ACHAT GROUPÉ ───────────────────────────────────────────────
            case 'achat_groupe': {
                if (!userId) return "Erreur utilisateur.";
                const nomProduit = String(d.produit ?? '').trim();
                const qteMin     = parseInt(String(d.quantite_min ?? d.quantite ?? 0), 10);

                // Chercher le produit sur le marché
                const prod = await findProductMarche(nomProduit, 'id, name, price, store_id');
                const prixNegocie = parseFloat(String(d.prix_negocie ?? prod?.price ?? 0)) || 0;

                const { error } = await supabase.from('achats_groupes').insert([{
                    cooperative_id:   userId,
                    produit_id:       prod?.id ?? null,
                    producteur_id:    prod?.store_id ?? null,
                    quantite_minimum: qteMin || 1,
                    quantite_totale:  0,
                    prix_negocie:     prixNegocie,
                    statut:           'NEGOTIATION',
                    date_limite:      new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
                }]);
                if (error) throw error;

                emitEvent('achat-groupe-cree', { cooperativeId: userId, produit: nomProduit });
                return `Achat groupé créé pour "${nomProduit}"${qteMin > 0 ? ` (minimum ${qteMin} unités)` : ''}. Les marchands peuvent maintenant rejoindre !`;
            }

            // ── DÉSACTIVER COMPTE ──────────────────────────────────────────
            case 'compte_desactiver': {
                if (ctx.role !== 'SUPERVISOR') return 'Action réservée aux administrateurs.';
                const nom = String(d.nom ?? '').trim();
                if (!nom) return "Je n'ai pas compris quel compte désactiver.";

                const profil = await findProfileByName(nom, 'id, full_name');
                if (!profil) return `Aucun compte trouvé pour "${nom}".`;

                // Désactiver le store (la table profiles n'a pas de colonne status)
                await supabase.from('stores').update({ status: 'INACTIVE' }).eq('owner_id', profil.id);

                return `Compte de ${profil.full_name} désactivé. Ses boutiques ne sont plus visibles sur le réseau.`;
            }

            // ── RÉINITIALISER PIN ──────────────────────────────────────────
            case 'pin_reset': {
                if (ctx.role !== 'SUPERVISOR') return 'Action réservée aux administrateurs.';
                const nom = String(d.nom ?? '').trim();
                if (!nom) return "Je n'ai pas compris quel compte réinitialiser.";

                const profil = await findProfileByName(nom, 'id, full_name');
                if (!profil) return `Aucun compte trouvé pour "${nom}".`;

                await supabase.from('profiles').update({ pin: '0101' }).eq('id', profil.id);
                return `PIN réinitialisé ! ${profil.full_name} peut se connecter avec le PIN temporaire 1234.`;
            }

            // ── CHANGER RÔLE ───────────────────────────────────────────────
            case 'changer_role': {
                if (ctx.role !== 'SUPERVISOR') return 'Action réservée aux administrateurs.';
                const nom        = String(d.nom ?? '').trim();
                const nouveauRole = String(d.nouveau_role ?? d.role ?? '').toUpperCase().trim();
                if (!nom)         return "Je n'ai pas compris quel compte modifier.";
                if (!nouveauRole) return "Je n'ai pas compris le nouveau rôle.";

                const rolesValides: Record<string, string> = {
                    'MERCHANT': 'MERCHANT', 'MARCHAND': 'MERCHANT', 'COMMERCANT': 'MERCHANT',
                    'PRODUCER': 'PRODUCER', 'PRODUCTEUR': 'PRODUCER',
                    'FIELD_AGENT': 'FIELD_AGENT', 'AGENT': 'FIELD_AGENT',
                    'COOPERATIVE': 'COOPERATIVE',
                    'SUPERVISOR': 'SUPERVISOR', 'ADMIN': 'SUPERVISOR',
                };
                const roleNormalise = rolesValides[nouveauRole] ?? nouveauRole;

                const profil = await findProfileByName(nom, 'id, full_name');
                if (!profil) return `Aucun compte trouvé pour "${nom}".`;

                await supabase.from('profiles').update({ role: roleNormalise }).eq('id', profil.id);
                return `Rôle mis à jour ! ${profil.full_name} est maintenant "${roleNormalise}".`;
            }

            // ── NAVIGATION ─────────────────────────────────────────────────
            case 'navigate': {
                const route = String(d.route ?? d.screen ?? '').trim();
                if (!route) return "Je ne sais pas vers quel écran naviguer.";
                navigate(route);
                return "Navigation en cours…";
            }

            default:
                return "Je n'ai pas compris cette action.";
        }
    } catch (err: any) {
        console.error('[VoiceAction] Erreur:', action.type, err?.message ?? err);
        reportApiError('VoiceAction', { message: `[${action.type}] ${err?.message ?? err}` }, 'voiceAssistant.executeVoiceAction');
        return `Une erreur est survenue lors de l'exécution. Réessayez.`;
    }
}
