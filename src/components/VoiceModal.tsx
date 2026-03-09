// Modal assistant vocal conversationnel — historique multi-tour, chat UI
import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
    Modal, View, Text, TouchableOpacity, StyleSheet,
    Animated, ActivityIndicator, ScrollView, KeyboardAvoidingView, Platform,
} from 'react-native';
import { Mic, MicOff, X, Check, XCircle, Wifi, WifiOff } from 'lucide-react-native';
import * as Speech from 'expo-speech';
import { useRouter } from 'expo-router';
import { useAuth } from '@/src/context/AuthContext';
import { useProfileContext } from '@/src/context/ProfileContext';
import { colors } from '@/src/lib/colors';
import {
    startRecording, stopRecording, cancelRecording,
    stopSpeaking, speakText, initConversation,
    isVoiceConfirmation, isVoiceCancellation,
    getLocalRoute, isLogoutCommand, isLocalCommand, getLocalConfirmation,
    AssistantState,
} from '@/src/lib/voiceAssistant';
import {
    GroqMessage, VoiceAction, transcribeAudio,
    chatWithHistory, parseAction, isOnline,
} from '@/src/lib/groqAI';
import { supabase } from '@/src/lib/supabase';
import { emitEvent } from '@/src/lib/socket';

// ── Types UI ───────────────────────────────────────────────────────────────
interface DisplayMsg {
    role: 'user' | 'assistant';
    text: string;
    isWelcome?: boolean;
}

interface Props {
    visible: boolean;
    onClose: () => void;
}

// ── Barres de pulse ────────────────────────────────────────────────────────
function PulsingBars({ active }: { active: boolean }) {
    const bars = [
        useRef(new Animated.Value(0.4)).current,
        useRef(new Animated.Value(0.4)).current,
        useRef(new Animated.Value(0.4)).current,
    ];

    useEffect(() => {
        if (!active) { bars.forEach(b => b.setValue(0.4)); return; }
        const anims = bars.map((b, i) =>
            Animated.loop(Animated.sequence([
                Animated.delay(i * 120),
                Animated.timing(b, { toValue: 1,   duration: 300, useNativeDriver: true }),
                Animated.timing(b, { toValue: 0.4, duration: 300, useNativeDriver: true }),
            ]))
        );
        anims.forEach(a => a.start());
        return () => anims.forEach(a => a.stop());
    }, [active]);

    return (
        <View style={styles.barsRow}>
            {bars.map((b, i) => (
                <Animated.View key={i} style={[styles.bar, { transform: [{ scaleY: b }] }]} />
            ))}
        </View>
    );
}

// ── Composant principal ────────────────────────────────────────────────────
export default function VoiceModal({ visible, onClose }: Props) {
    const router = useRouter();
    const { user, logout } = useAuth() as any;
    const { activeProfile } = useProfileContext();

    // ── État conversation ──────────────────────────────────────────────────
    // Ref pour l'historique Groq (mutable, évite les stale closures)
    const groqHistoryRef = useRef<GroqMessage[]>([]);
    const [displayMessages, setDisplayMessages] = useState<DisplayMsg[]>([]);

    // ── État UI ────────────────────────────────────────────────────────────
    const [state,         setState]        = useState<AssistantState>('idle');
    const [pendingAction, setPendingAction] = useState<VoiceAction | null>(null);
    const [mode,          setMode]         = useState<'local' | 'ai' | 'offline'>('local');
    const [error,         setError]        = useState('');

    const scrollRef  = useRef<ScrollView>(null);
    const timerRef   = useRef<ReturnType<typeof setTimeout> | null>(null);

    // ── Helpers ────────────────────────────────────────────────────────────
    const role     = (user?.role as string) ?? 'MERCHANT';
    const userName = (user?.name as string) || activeProfile?.name || (user?.email as string) || 'Utilisateur';
    const storeId  = activeProfile?.id as string | undefined;
    const userId   = (user?.id as string) ?? '';

    function addMessage(msg: DisplayMsg) {
        setDisplayMessages(prev => [...prev, msg]);
        setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 80);
    }

    function addAssistantMessage(text: string, opts?: Partial<DisplayMsg>) {
        addMessage({ role: 'assistant', text, ...opts });
    }

    function addUserMessage(text: string) {
        addMessage({ role: 'user', text });
    }

    // ── Initialisation au premier affichage ───────────────────────────────
    useEffect(() => {
        if (!visible) {
            // Nettoyage
            stopSpeaking();
            cancelRecording();
            if (timerRef.current) clearTimeout(timerRef.current);
            return;
        }

        // Reset complet
        groqHistoryRef.current = [];
        setDisplayMessages([]);
        setPendingAction(null);
        setError('');
        setMode('local');

        generateWelcome();
    }, [visible]);

    const generateWelcome = useCallback(async () => {
        setState('welcome');

        try {
            const online = await isOnline();

            if (!online) {
                const txt = `Bonjour ${userName.split(' ')[0]} ! Je suis en mode hors ligne. Vous pouvez me donner des commandes directes comme "vendre", "stock" ou "bilan".`;
                setMode('offline');
                addAssistantMessage(txt, { isWelcome: true });
                speakText(txt, () => setState('idle'));
                return;
            }

            setMode('ai');
            const systemMsg = await initConversation(role, userId, userName, storeId);
            const welcomePrompt: GroqMessage = { role: 'user', content: 'Donne-moi un accueil chaleureux et un résumé rapide de mon activité.' };
            const msgs = [systemMsg, welcomePrompt];
            const welcomeReply = await chatWithHistory(msgs);
            const { text } = parseAction(welcomeReply);
            const welcomeText = text || welcomeReply;

            // Historique Groq initialisé avec system + welcome exchange
            groqHistoryRef.current = [...msgs, { role: 'assistant', content: welcomeReply }];

            addAssistantMessage(welcomeText, { isWelcome: true });
            setState('speaking');
            speakText(welcomeText, () => setState('idle'));
        } catch {
            const fallback = `Bonjour ${userName.split(' ')[0]} ! Comment puis-je vous aider ?`;
            addAssistantMessage(fallback, { isWelcome: true });
            speakText(fallback, () => setState('idle'));
        }
    }, [role, userId, userName, storeId]);

    // ── Enregistrement ─────────────────────────────────────────────────────
    const handleMicPress = useCallback(async () => {
        // Interrompre le TTS si en cours (speaking ou autre)
        Speech.stop();
        if (state === 'speaking') { setState('idle'); return; }

        if (state === 'listening') {
            await handleStopListening();
        } else if (state !== 'processing' && state !== 'welcome') {
            await handleStartListening();
        }
    }, [state, handleStopListening, handleStartListening]);

    const handleStartListening = useCallback(async () => {
        try {
            setError('');
            setState('listening');
            await startRecording();

            timerRef.current = setTimeout(async () => {
                await handleStopListening();
            }, 10_000);
        } catch {
            setError('Permission micro refusée. Activez-la dans les paramètres.');
            setState('error');
        }
    }, []);

    const handleStopListening = useCallback(async () => {
        if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
        setState('processing');

        const uri = await stopRecording();
        if (!uri) {
            setError("Impossible d'accéder au micro.");
            setState('error');
            return;
        }

        let transcript = '';
        try {
            transcript = await transcribeAudio(uri);
        } catch {
            setError("Je n'ai pas compris. Pouvez-vous répéter ?");
            setState('idle');
            return;
        }

        if (!transcript.trim()) {
            setState('idle');
            return;
        }

        addUserMessage(transcript);

        // ── Confirmation/annulation vocale d'une action en attente ────────
        if (pendingAction) {
            if (isVoiceConfirmation(transcript)) {
                await executeAction(pendingAction);
                return;
            }
            if (isVoiceCancellation(transcript)) {
                const txt = 'Action annulée.';
                addAssistantMessage(txt);
                speakText(txt, () => setState('idle'));
                setPendingAction(null);
                return;
            }
        }

        // ── Commande locale (courte phrase ≤ 4 mots) ──────────────────────
        if (isLocalCommand(transcript, role)) {
            if (isLogoutCommand(transcript, role)) {
                const txt = 'Déconnexion en cours.';
                addAssistantMessage(txt);
                speakText(txt, () => { onClose(); logout?.(); });
                return;
            }

            const route = getLocalRoute(transcript, role);
            const confirmation = getLocalConfirmation(transcript, role) ?? 'Compris.';
            addAssistantMessage(confirmation);
            setMode('local');
            speakText(confirmation, () => {
                onClose();
                if (route) router.push(route as any);
            });
            return;
        }

        // ── Mode IA ────────────────────────────────────────────────────────
        const online = await isOnline();
        if (!online) {
            const txt = "Je suis hors ligne. Essayez : 'stock', 'vendre', 'bilan'…";
            addAssistantMessage(txt);
            speakText(txt, () => setState('idle'));
            setMode('offline');
            return;
        }

        setMode('ai');
        try {
            const newHistory: GroqMessage[] = [
                ...groqHistoryRef.current,
                { role: 'user', content: transcript },
            ];

            const rawReply = await chatWithHistory(newHistory);
            const { text, action } = parseAction(rawReply);
            const replyText = text || rawReply;

            // Mettre à jour l'historique Groq
            groqHistoryRef.current = [...newHistory, { role: 'assistant', content: rawReply }];

            addAssistantMessage(replyText);
            setPendingAction(action);
            if (action) {
                setState('confirming');
                speakText(replyText);
            } else {
                setState('speaking');
                speakText(replyText, () => setState('idle'));
            }
        } catch {
            const errTxt = "Désolé, je n'ai pas pu traiter votre demande.";
            addAssistantMessage(errTxt);
            speakText(errTxt, () => setState('idle'));
        }
    }, [pendingAction, role, userId, userName, storeId]);

    // ── Recherche flexible d'un produit (insensible à la casse + pluriel) ──
    const findProductFuzzy = useCallback(async (
        nomRecherche: string,
        fields: string = 'id, name, price',
    ): Promise<{ data: any | null; listeDisponibles: string }> => {
        if (!storeId) return { data: null, listeDisponibles: '' };

        // Normalise : minuscules, sans ponctuation superflue
        const normalize = (s: string) => s.toLowerCase().trim();

        // Variantes à essayer dans l'ordre
        const base = normalize(nomRecherche);
        const sansS = base.replace(/s$/i, '');          // "bonnets rouges" → "bonnet rouge"
        const sansSFinal = sansS.replace(/s\s/gi, ' '); // "bonnets rouges" → "bonnet rouge" (milieu)
        const motsCles = base.split(/\s+/).filter(w => w.length > 2); // mots significatifs

        const trySearch = async (pattern: string) => {
            const { data } = await supabase
                .from('products').select(fields)
                .eq('store_id', storeId)
                .ilike('name', `%${pattern}%`)
                .limit(1);
            return data?.[0] ?? null;
        };

        // 1. Essai direct
        let prod = await trySearch(base);
        // 2. Sans pluriel final
        if (!prod && sansS !== base) prod = await trySearch(sansS);
        // 3. Sans pluriel au milieu
        if (!prod && sansSFinal !== sansS) prod = await trySearch(sansSFinal);
        // 4. Mot-clé le plus long
        if (!prod && motsCles.length > 0) {
            const motLong = motsCles.sort((a, b) => b.length - a.length)[0];
            prod = await trySearch(motLong);
        }

        // Liste des produits dispo pour le message d'erreur
        let listeDisponibles = '';
        if (!prod) {
            const { data: tous } = await supabase
                .from('products').select('name').eq('store_id', storeId).limit(10);
            listeDisponibles = (tous ?? []).map((p: any) => p.name).join(', ');
        }

        return { data: prod, listeDisponibles };
    }, [storeId]);

    // ── Exécution d'une action confirmée ──────────────────────────────────
    const executeAction = useCallback(async (action: VoiceAction) => {
        setState('processing');
        setPendingAction(null);
        let confirmText = "C'est fait !";

        try {
            if (action.type === 'publier' && storeId) {
                const d = action.details;

                // Extraction robuste du nom — le LLM peut varier les noms de champs
                const nomProduit: string = (
                    d.nom ?? d.name ?? d.produit ?? d.titre ?? d.product_name ?? ''
                ).toString().trim();

                const prixProduit: number = parseFloat(
                    String(d.prix ?? d.price ?? d.prix_unitaire ?? 0)
                ) || 0;

                console.log('[VoiceModal] ACTION publier — details bruts:', JSON.stringify(d));
                console.log('[VoiceModal] nom extrait:', nomProduit);
                console.log('[VoiceModal] prix extrait:', prixProduit);

                // Validation — refus si nom vide
                if (!nomProduit) {
                    confirmText = "Je n'ai pas compris le nom du produit. Dites par exemple : « Publie du maïs à 500 francs, 100 kilos ».";
                    addAssistantMessage(confirmText);
                    speakText(confirmText, () => setState('idle'));
                    return;
                }

                const insertPayload = {
                    store_id:    storeId,
                    name:        nomProduit,
                    price:       prixProduit,
                    category:    (d.categorie ?? d.category ?? 'Autre').toString(),
                    description: d.description ? String(d.description) : null,
                };
                console.log('[VoiceModal] INSERT products payload:', JSON.stringify(insertPayload));

                const { data: newProd, error } = await supabase
                    .from('products')
                    .insert([insertPayload])
                    .select()
                    .single();

                console.log('[VoiceModal] INSERT products résultat:', newProd?.id ?? null);
                console.log('[VoiceModal] INSERT products erreur:', error?.message ?? null);

                if (error) throw error;

                const quantite = parseInt(String(d.quantite ?? d.quantity ?? 0), 10);
                if (newProd && quantite > 0) {
                    const { error: stockErr } = await supabase.from('stock').upsert({
                        product_id: newProd.id, store_id: storeId, quantity: quantite,
                    });
                    console.log('[VoiceModal] UPSERT stock erreur:', stockErr?.message ?? null);
                }

                emitEvent('nouveau-produit-marche', { storeId, name: nomProduit, productId: newProd?.id });
                console.log('[VoiceModal] Socket emit nouveau-produit-marche');

                confirmText = `C'est fait ! ${nomProduit} est maintenant publié sur le marché${prixProduit > 0 ? ` à ${prixProduit.toLocaleString('fr-FR')} F` : ''}.`;

            } else if (action.type === 'vendre' && storeId) {
                const d = action.details;
                const { data: prod, listeDisponibles } = await findProductFuzzy(
                    d.produit_nom ?? '', 'id, name, price',
                );

                if (prod) {
                    const qte   = d.quantite ?? 1;
                    const total = (prod.price ?? 0) * qte;
                    // Colonne "price" dans transactions (pas total_amount)
                    await supabase.from('transactions').insert([{
                        store_id: storeId, product_id: prod.id,
                        quantity: qte, price: total,
                        client_name: d.client_nom ?? null,
                    }]);
                    // Décrémenter le stock
                    const { data: st } = await supabase.from('stock').select('id, quantity')
                        .eq('store_id', storeId).eq('product_id', prod.id).maybeSingle();
                    if (st) {
                        await supabase.from('stock')
                            .update({ quantity: Math.max(0, st.quantity - qte) })
                            .eq('id', st.id);
                    }
                    confirmText = `Vente enregistrée ! ${qte} ${prod.name} pour ${total.toLocaleString('fr-FR')}F.`;
                } else {
                    confirmText = listeDisponibles
                        ? `Je n'ai pas trouvé "${d.produit_nom}". Vos produits disponibles : ${listeDisponibles}.`
                        : `Je n'ai pas trouvé "${d.produit_nom}" dans votre stock.`;
                }

            } else if (action.type === 'commander' && storeId) {
                const d = action.details;
                await supabase.from('orders').insert([{
                    buyer_store_id: storeId, quantity: d.quantite ?? 1,
                    status: 'PENDING', note: d.produit_nom ?? '',
                }]);
                emitEvent('nouvelle-commande', { buyerStoreId: storeId });
                confirmText = `Commande passée ! ${d.quantite ?? 1} ${d.produit_nom} commandé(s).`;

            } else if (action.type === 'stock' && storeId) {
                const d = action.details;
                const { data: prod, listeDisponibles } = await findProductFuzzy(d.produit_nom ?? '', 'id, name');
                if (prod) {
                    const { data: st } = await supabase.from('stock').select('id, quantity')
                        .eq('store_id', storeId).eq('product_id', prod.id).maybeSingle();
                    if (st) {
                        await supabase.from('stock')
                            .update({ quantity: st.quantity + (d.quantite ?? 0) }).eq('id', st.id);
                        confirmText = `Stock mis à jour ! +${d.quantite} ${prod.name}.`;
                    } else {
                        confirmText = `Produit trouvé mais aucun stock enregistré pour ${prod.name}.`;
                    }
                } else {
                    confirmText = listeDisponibles
                        ? `Je n'ai pas trouvé "${d.produit_nom}". Vos produits : ${listeDisponibles}.`
                        : `Je n'ai pas trouvé "${d.produit_nom}".`;
                }
            }
        } catch {
            confirmText = "Une erreur est survenue. Réessayez.";
        }

        // Ajouter la confirmation à l'historique et à l'affichage
        groqHistoryRef.current = [
            ...groqHistoryRef.current,
            { role: 'assistant', content: confirmText },
        ];
        addAssistantMessage(confirmText);
        speakText(confirmText, () => setState('idle'));
    }, [storeId, findProductFuzzy]);

    const handleConfirmAction = useCallback(() => {
        if (pendingAction) executeAction(pendingAction);
    }, [pendingAction, executeAction]);

    const handleCancelAction = useCallback(() => {
        const txt = 'Action annulée.';
        addAssistantMessage(txt);
        speakText(txt, () => setState('idle'));
        setPendingAction(null);
    }, []);

    // ── UI helpers ─────────────────────────────────────────────────────────
    const isListening  = state === 'listening';
    const isSpeaking   = state === 'speaking';
    const isProcessing = state === 'processing' || state === 'welcome';

    const stateLabel: Record<string, string> = {
        idle:       'Appuyez sur le micro pour parler',
        welcome:    'Chargement de votre contexte…',
        listening:  'Je vous écoute…',
        processing: 'Traitement…',
        speaking:   'En train de répondre… (appuyez pour interrompre)',
        confirming: 'Confirmez-vous cette action ?',
        error:      '',
    };

    return (
        <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
            <KeyboardAvoidingView
                style={styles.overlay}
                behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            >
                {/* Zone semi-transparente au-dessus — ferme le modal */}
                <TouchableOpacity style={styles.overlayTouch} activeOpacity={1} onPress={onClose} />

                <View style={styles.sheet}>
                    {/* ── Header ── */}
                    <View style={styles.sheetHeader}>
                        <View style={styles.modeRow}>
                            {mode === 'offline' ? (
                                <><WifiOff color="#94a3b8" size={12} /><Text style={styles.modeText}>Hors ligne</Text></>
                            ) : mode === 'ai' ? (
                                <><Wifi color={colors.primary} size={12} /><Text style={[styles.modeText, { color: colors.primary }]}>IA active</Text></>
                            ) : (
                                <><Wifi color="#64748b" size={12} /><Text style={styles.modeText}>Mode local</Text></>
                            )}
                        </View>
                        <Text style={styles.sheetTitle}>Assistant</Text>
                        <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
                            <X color="#64748b" size={18} />
                        </TouchableOpacity>
                    </View>

                    {/* ── Historique de conversation ── */}
                    <ScrollView
                        ref={scrollRef}
                        style={styles.chatScroll}
                        contentContainerStyle={styles.chatContent}
                        showsVerticalScrollIndicator={false}
                    >
                        {displayMessages.length === 0 && isProcessing && (
                            <ActivityIndicator color={colors.primary} style={{ marginTop: 20 }} />
                        )}
                        {displayMessages.map((msg, idx) => (
                            <View
                                key={idx}
                                style={[
                                    styles.bubble,
                                    msg.role === 'user' ? styles.bubbleUser : styles.bubbleAssistant,
                                ]}
                            >
                                <Text style={msg.role === 'user' ? styles.bubbleUserText : styles.bubbleAssistantText}>
                                    {msg.text}
                                </Text>
                            </View>
                        ))}
                        {/* Indicateur "en train de répondre" */}
                        {isProcessing && displayMessages.length > 0 && (
                            <View style={[styles.bubble, styles.bubbleAssistant]}>
                                <ActivityIndicator color={colors.primary} size="small" />
                            </View>
                        )}
                    </ScrollView>

                    {/* ── Barres de pulse + label ── */}
                    <PulsingBars active={isListening} />
                    {stateLabel[state] ? (
                        <Text style={styles.stateLabel}>{stateLabel[state]}</Text>
                    ) : null}

                    {/* ── Erreur ── */}
                    {error !== '' && (
                        <View style={styles.errorBox}>
                            <Text style={styles.errorText}>{error}</Text>
                        </View>
                    )}

                    {/* ── Boutons de confirmation action ── */}
                    {state === 'confirming' && pendingAction && (
                        <View style={styles.confirmRow}>
                            <TouchableOpacity style={styles.confirmBtn} onPress={handleConfirmAction}>
                                <Check color="#fff" size={16} />
                                <Text style={styles.confirmBtnText}>Confirmer</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={styles.cancelBtn} onPress={handleCancelAction}>
                                <XCircle color={colors.error} size={16} />
                                <Text style={styles.cancelBtnText}>Annuler</Text>
                            </TouchableOpacity>
                        </View>
                    )}

                    {/* ── Bouton micro ── */}
                    <View style={styles.micRow}>
                        <TouchableOpacity
                            style={[
                                styles.micBtn,
                                isListening && styles.micActive,
                                isSpeaking && styles.micSpeaking,
                            ]}
                            onPress={handleMicPress}
                            disabled={isProcessing}
                            activeOpacity={0.85}
                        >
                            {isListening
                                ? <MicOff color="#fff" size={26} />
                                : <Mic color="#fff" size={26} />
                            }
                        </TouchableOpacity>
                        <Text style={styles.micHint}>
                            {isListening ? 'Appuyez pour envoyer' : isSpeaking ? 'Appuyez pour interrompre' : 'Parlez'}
                        </Text>
                    </View>
                </View>
            </KeyboardAvoidingView>
        </Modal>
    );
}

// ── Styles ─────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
    overlay:      { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
    overlayTouch: { flex: 1 },

    sheet: {
        backgroundColor: '#fff',
        borderTopLeftRadius: 20, borderTopRightRadius: 20,
        paddingTop: 16, paddingHorizontal: 16, paddingBottom: 32,
        maxHeight: '82%',
        gap: 10,
    },

    // Header
    sheetHeader: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    },
    modeRow:    { flexDirection: 'row', alignItems: 'center', gap: 4 },
    modeText:   { fontSize: 11, fontWeight: '700', color: '#94a3b8' },
    sheetTitle: { fontSize: 14, fontWeight: '900', color: '#1e293b' },
    closeBtn: {
        width: 32, height: 32, borderRadius: 8,
        backgroundColor: '#f1f5f9', alignItems: 'center', justifyContent: 'center',
    },

    // Chat
    chatScroll:  { flexGrow: 0, maxHeight: 280 },
    chatContent: { gap: 8, paddingVertical: 4 },

    bubble: {
        maxWidth: '82%', borderRadius: 10,
        paddingHorizontal: 12, paddingVertical: 8,
    },
    bubbleUser: {
        alignSelf: 'flex-end',
        backgroundColor: '#dcfce7',
    },
    bubbleAssistant: {
        alignSelf: 'flex-start',
        backgroundColor: '#f1f5f9',
    },
    bubbleUserText:      { fontSize: 14, color: '#14532d', lineHeight: 20 },
    bubbleAssistantText: { fontSize: 14, color: '#1e293b', lineHeight: 20 },

    // Pulse bars
    barsRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, height: 44 },
    bar:     { width: 6, height: 32, borderRadius: 4, backgroundColor: colors.primary },

    stateLabel: { textAlign: 'center', fontSize: 12, fontWeight: '700', color: '#94a3b8' },

    errorBox:  { backgroundColor: '#fef2f2', borderRadius: 10, padding: 10, borderWidth: 1, borderColor: '#fecaca' },
    errorText: { fontSize: 13, color: '#991b1b' },

    // Confirmation
    confirmRow: { flexDirection: 'row', gap: 8 },
    confirmBtn: {
        flex: 1, flexDirection: 'row', gap: 6,
        backgroundColor: colors.primary, borderRadius: 10, paddingVertical: 11,
        alignItems: 'center', justifyContent: 'center',
    },
    confirmBtnText: { fontSize: 12, fontWeight: '900', color: '#fff' },
    cancelBtn: {
        flex: 1, flexDirection: 'row', gap: 6,
        borderWidth: 1.5, borderColor: colors.error,
        borderRadius: 10, paddingVertical: 11,
        alignItems: 'center', justifyContent: 'center',
    },
    cancelBtnText: { fontSize: 12, fontWeight: '900', color: colors.error },

    // Micro
    micRow:  { alignItems: 'center', gap: 6 },
    micBtn: {
        width: 60, height: 60, borderRadius: 10,
        backgroundColor: colors.primary,
        alignItems: 'center', justifyContent: 'center',
        elevation: 4,
        shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.2, shadowRadius: 4,
    },
    micActive:   { backgroundColor: '#dc2626' },
    micSpeaking: { backgroundColor: '#7c3aed' },
    micHint:     { fontSize: 11, color: '#94a3b8', fontWeight: '600' },
});
