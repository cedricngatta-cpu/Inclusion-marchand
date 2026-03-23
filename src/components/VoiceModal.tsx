// Modal assistant vocal conversationnel — Deepgram STT/TTS + Groq LLM + fallback offline
import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
    Modal, View, Text, TouchableOpacity, StyleSheet,
    Animated, ActivityIndicator, ScrollView, KeyboardAvoidingView, Platform,
} from 'react-native';
import { Mic, MicOff, X, Check, XCircle, Wifi, WifiOff, Zap } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '@/src/context/AuthContext';
import { useProfileContext } from '@/src/context/ProfileContext';
import { colors } from '@/src/lib/colors';
import { isWeb } from '@/src/lib/platform';
import {
    startRecording, stopRecording, cancelRecording,
    stopSpeaking, speakText, initConversation,
    isVoiceConfirmation, isVoiceCancellation,
    getLocalRoute, isLogoutCommand, isLocalCommand, getLocalConfirmation,
    executeVoiceAction, transcribeRecording,
    AssistantState,
} from '@/src/lib/voiceAssistant';
import {
    GroqMessage, VoiceAction,
    chatWithHistory, parseAction, isOnline, fetchScreenDebrief,
} from '@/src/lib/groqAI';
import { parseLocalCommand } from '@/src/lib/localCommandParser';
import { processVoiceCommand, generateSmartGreeting, clearConversationMemory } from '@/src/lib/deepgramLLM';
import type { LLMResult, GreetingStats } from '@/src/lib/deepgramLLM';
import { offlineCache, CACHE_KEYS } from '@/src/lib/offlineCache';

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
                Animated.timing(b, { toValue: 1,   duration: 300, useNativeDriver: Platform.OS !== 'web' }),
                Animated.timing(b, { toValue: 0.4, duration: 300, useNativeDriver: Platform.OS !== 'web' }),
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
    const [sttSource,     setSttSource]    = useState<'deepgram' | 'native' | 'groq' | 'web' | null>(null);
    const [error,         setError]        = useState('');

    const scrollRef = useRef<ScrollView>(null);
    const timerRef  = useRef<ReturnType<typeof setTimeout> | null>(null);

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
        clearConversationMemory();

        generateWelcome();
    }, [visible]);

    const generateWelcome = useCallback(async () => {
        setState('welcome');

        // Charger les stats depuis le cache offline pour un greeting contextuel
        let greetingStats: GreetingStats | null = null;
        try {
            const cacheKey = storeId ? CACHE_KEYS.transactions(storeId) : null;
            const cached = cacheKey ? await offlineCache.get<any[]>(cacheKey) : null;
            if (cached?.data && Array.isArray(cached.data)) {
                const today = new Date().toISOString().slice(0, 10);
                const todayTx = cached.data.filter((tx: any) =>
                    tx.created_at?.startsWith(today) && tx.type === 'VENTE'
                );
                if (todayTx.length > 0) {
                    greetingStats = {
                        todaySales: todayTx.length,
                        todayAmount: todayTx.reduce((s: number, tx: any) => s + (tx.price || 0) * (tx.quantity || 1), 0),
                        lowStockCount: 0,
                        pendingOrders: 0,
                        unreadNotifs: 0,
                    };
                }
            }
        } catch { /* pas grave — greeting simple */ }

        const quickGreeting = generateSmartGreeting(userName, greetingStats);

        // Etape 1 : Greeting instantane (local, pas d'API)
        addAssistantMessage(quickGreeting, { isWelcome: true });
        setState('speaking');

        // Utiliser Web Speech Synthesis (instantane) pour le greeting
        // au lieu de Deepgram TTS qui necessite un appel API
        if (isWeb && typeof window !== 'undefined' && window.speechSynthesis) {
            window.speechSynthesis.cancel();
            const utterance = new SpeechSynthesisUtterance(quickGreeting);
            utterance.lang = 'fr-FR';
            utterance.rate = 1.0;
            utterance.onend = () => setState('idle');
            utterance.onerror = () => setState('idle');
            setTimeout(() => window.speechSynthesis.speak(utterance), 50);
        } else {
            // Mobile : fallback expo-speech (local, rapide)
            speakText(quickGreeting, () => setState('idle'));
        }

        // Etape 2 : Charger le contexte IA en background (pour les prochaines interactions)
        try {
            const online = await isOnline();

            if (!online) {
                setMode('offline');
                return;
            }

            setMode('ai');

            // Charger le system prompt en background — pret pour la prochaine question
            const systemMsg = await initConversation(role, userId, userName, storeId).catch(() => null);
            if (systemMsg) {
                groqHistoryRef.current = [systemMsg];
            }
        } catch {
            // Pas grave si ca echoue — le greeting est deja affiche
        }
    }, [role, userId, userName, storeId]);

    // ── Traitement commun après obtention du transcript ───────────────────
    // Appelé aussi bien depuis le chemin mobile (Whisper) que web (Web Speech)
    const processTranscript = useCallback(async (transcript: string) => {
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

            const route        = getLocalRoute(transcript, role);
            const confirmation = getLocalConfirmation(transcript, role) ?? 'Compris.';
            addAssistantMessage(confirmation);
            setMode('ai');

            if (route) router.push(route as any);

            speakText(confirmation, async () => {
                if (!route) { setState('idle'); return; }
                setState('processing');
                try {
                    const debrief = await fetchScreenDebrief(route, role, userId, storeId);
                    if (!debrief) { setState('idle'); return; }

                    await new Promise(r => setTimeout(r, 700));
                    addAssistantMessage(debrief);

                    groqHistoryRef.current = [
                        ...groqHistoryRef.current,
                        { role: 'user',      content: transcript },
                        { role: 'assistant', content: `${confirmation} ${debrief}` },
                    ];

                    setState('speaking');
                    speakText(debrief, () => setState('idle'));
                } catch {
                    setState('idle');
                }
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
            // Utiliser processVoiceCommand avec historique conversationnel et confiance
            const llmResult: LLMResult = await processVoiceCommand(
                transcript,
                groqHistoryRef.current,
            );

            const replyText = llmResult.text;
            const action = llmResult.action;
            const confidence = llmResult.confidence;

            // Mettre a jour l'historique Groq
            groqHistoryRef.current = [
                ...groqHistoryRef.current,
                { role: 'user', content: transcript },
                { role: 'assistant', content: replyText },
            ];

            addAssistantMessage(replyText);

            if (action) {
                if (confidence >= 0.7) {
                    // Confiance haute : executer directement
                    await executeAction(action);
                } else {
                    // Confiance basse : demander confirmation
                    setPendingAction(action);
                    setState('confirming');
                    speakText(replyText);
                }
            } else {
                setState('speaking');
                speakText(replyText, () => setState('idle'));
            }
        } catch (err: any) {
            console.log('ERREUR processVoiceCommand:', err?.message ?? err);
            // Fallback : essayer le parser local
            const localResult = parseLocalCommand(transcript);
            if (localResult.action) {
                addAssistantMessage(localResult.responseText);
                setPendingAction(localResult.action);
                setState('confirming');
                speakText(localResult.responseText);
                return;
            }
            const errTxt = err?.message === 'TIMEOUT'
                ? 'Connexion lente. Reessayez ou utilisez des commandes directes.'
                : "Desole, je n'ai pas pu traiter votre demande. Reessayez.";
            addAssistantMessage(errTxt);
            speakText(errTxt, () => setState('idle'));
        }
    }, [pendingAction, role, userId, userName, storeId]);

    // ── Enregistrement (flux unifie web + mobile) ─────────────────────────
    const handleStartListening = useCallback(async () => {
        try {
            setError('');
            setState('listening');

            // startRecording() gere web (MediaRecorder) et mobile (expo-audio)
            await startRecording();
            timerRef.current = setTimeout(async () => {
                await handleStopListening();
            }, 10_000);
        } catch (err: any) {
            console.log('ERREUR startRecording:', err?.message ?? err);
            const msg = err?.message?.includes('refusée') || err?.message?.includes('not-allowed') || err?.message?.includes('Permission')
                ? isWeb
                    ? 'Microphone non autorise. Autorisez l\'acces au microphone dans les parametres du navigateur.'
                    : 'Permission microphone refusee. Activez-la dans Reglages > Confidentialite.'
                : `Erreur micro : ${err?.message ?? 'inconnue'}`;
            setError(msg);
            setState('error');
        }
    }, [processTranscript]);

    const handleStopListening = useCallback(async () => {
        if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
        setState('processing');

        // Timeout de securite global : si tout le pipeline prend > 25s, on abandonne
        const globalSafety = setTimeout(() => {
            setError('Le traitement a pris trop de temps. Reessayez.');
            setState('error');
        }, 25000);

        try {
        // stopRecording() retourne un URI (mobile) ou '__web_blob__' (web)
        const uri = await stopRecording();
        if (!uri) {
            setError("Aucun audio capture. Verifiez que le micro est autorise.");
            setState('error');
            return;
        }

        let transcript = '';
        try {
            const result = await transcribeRecording(uri);
            transcript = result.text;
            setSttSource(result.source);
            if (result.source === 'native' || result.source === 'web') setMode('offline');
            if (result.source === 'deepgram') setMode('ai');
        } catch (err: any) {
            console.log('ERREUR STT dans VoiceModal:', err?.message ?? err);
            const msg = err?.message?.includes('trop de temps') || err?.name === 'AbortError'
                ? 'La transcription a pris trop de temps. Reessayez.'
                : err?.message?.includes('reseau') || err?.message?.includes('network')
                    ? 'Erreur de connexion. Verifiez votre internet.'
                    : err?.message?.includes('401') || err?.message?.includes('403')
                        ? 'Cle API invalide. Contactez le support.'
                        : `Erreur de transcription : ${err?.message ?? 'inconnue'}`;
            setError(msg);
            setState('error');
            return;
        }

        // Transcript vide = aucune voix detectee
        if (!transcript.trim()) {
            setError("Je n'ai pas entendu de voix. Parlez plus fort ou plus pres du micro.");
            setState('error');
            return;
        }

        await processTranscript(transcript);
        } finally {
            clearTimeout(globalSafety);
        }
    }, [processTranscript]);

    const handleMicPress = useCallback(async () => {
        stopSpeaking();
        if (state === 'speaking') { setState('idle'); return; }

        if (state === 'listening') {
            await handleStopListening();
        } else if (state !== 'processing' && state !== 'welcome') {
            await handleStartListening();
        }
    }, [state, handleStopListening, handleStartListening]);

    // ── Exécution d'une action confirmée ──────────────────────────────────
    const executeAction = useCallback(async (action: VoiceAction) => {
        setState('processing');
        setPendingAction(null);

        const confirmText = await executeVoiceAction(
            action,
            { storeId, userId, role },
            (route: string) => { onClose(); router.push(route as any); },
        );

        groqHistoryRef.current = [
            ...groqHistoryRef.current,
            { role: 'assistant', content: confirmText },
        ];
        addAssistantMessage(confirmText);
        speakText(confirmText, () => setState('idle'));
    }, [storeId, userId, role, onClose]);

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
        welcome:    'Chargement… (max 20 secondes)',
        listening:  'Je vous écoute…',
        processing: 'Je réfléchis…',
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
                                <><Zap color={colors.success} size={12} /><Text style={[styles.modeText, { color: colors.success }]}>
                                    {sttSource === 'deepgram' ? 'Deepgram' : 'IA active'}
                                </Text></>
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
const webOverlay = Platform.OS === 'web' ? {
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
    // @ts-ignore — propriete web uniquement
    backdropFilter: 'blur(8px)',
    WebkitBackdropFilter: 'blur(8px)',
} : {};

const webSheet = Platform.OS === 'web' ? {
    maxWidth: 500,
    width: '94%' as any,
    borderRadius: 12,
    maxHeight: '85%' as any,
    // @ts-ignore — proprietes web
    boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
} : {};

const styles = StyleSheet.create({
    overlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.6)',
        justifyContent: 'flex-end',
        ...webOverlay,
    },
    overlayTouch: {
        flex: Platform.OS === 'web' ? 0 : 1,
        ...(Platform.OS === 'web' ? { position: 'absolute' as const, top: 0, left: 0, right: 0, bottom: 0 } : {}),
    },

    sheet: {
        backgroundColor: '#fff',
        borderTopLeftRadius: 12, borderTopRightRadius: 12,
        paddingTop: 16, paddingHorizontal: 16, paddingBottom: 32,
        maxHeight: '82%',
        gap: 10,
        ...webSheet,
    },

    // Header
    sheetHeader: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    },
    modeRow:    { flexDirection: 'row', alignItems: 'center', gap: 4 },
    modeText:   { fontSize: 11, fontWeight: '700', color: '#94a3b8' },
    sheetTitle: { fontSize: 14, fontWeight: '900', color: '#1e293b' },
    closeBtn: {
        width: 44, height: 44, borderRadius: 10,
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
    micActive:   { backgroundColor: colors.error },
    micSpeaking: { backgroundColor: colors.purple },
    micHint:     { fontSize: 11, color: '#94a3b8', fontWeight: '600' },
});
