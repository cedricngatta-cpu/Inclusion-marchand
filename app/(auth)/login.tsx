// Écran de connexion — migré depuis Next.js /login/page.tsx
// framer-motion → Animated/react-native, HTML → composants React Native
import React, { useState, useEffect, useRef } from 'react';
import {
    View, Text, TextInput, TouchableOpacity, StyleSheet,
    KeyboardAvoidingView, Platform, ScrollView, Animated, BackHandler,
    Modal, ActivityIndicator, useWindowDimensions,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Phone, Lock, ChevronRight, AlertCircle, X, ArrowLeft } from 'lucide-react-native';
import { useAuth } from '@/src/context/AuthContext';
import { colors } from '@/src/lib/colors';
import { SafeAreaView } from 'react-native-safe-area-context';
import PinInput from '@/src/components/PinInput';
import JulabaLogo from '@/src/components/JulabaLogo';
import { supabase } from '@/src/lib/supabase';

// Limiteur de tentatives : max 3 réinitialisations par numéro
const forgotAttempts: Record<string, number> = {};

export default function LoginScreen() {
    const router = useRouter();
    const { login, isAuthenticated, isLoading, user } = useAuth();
    const { width } = useWindowDimensions();
    const isDesktop = Platform.OS === 'web' && width > 768;

    const [phoneNumber, setPhoneNumber] = useState('');
    const [error, setError]             = useState('');
    const [step, setStep]               = useState<'PHONE' | 'PIN'>('PHONE');

    // État modal "PIN oublié"
    const [forgotVisible, setForgotVisible] = useState(false);
    const [forgotPhone, setForgotPhone]     = useState('');
    const [forgotLoading, setForgotLoading] = useState(false);
    const [forgotError, setForgotError]     = useState('');
    const [forgotDone, setForgotDone]       = useState(false);

    const fadeAnim   = React.useRef(new Animated.Value(1)).current;
    const transTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Nettoyage du timer de transition au démontage
    useEffect(() => () => { if (transTimer.current) clearTimeout(transTimer.current); }, []);

    // Après login : l'index.tsx gère la redirection vers le bon dashboard selon le rôle
    useEffect(() => {
        if (isAuthenticated && user) {
            router.replace('/');
        }
    }, [isAuthenticated, user]);

    // Bouton retour Android : si étape PIN → revenir au téléphone, sinon quitter l'app
    // IMPORTANT : ce useEffect DOIT être AVANT le early return pour respecter les Rules of Hooks
    useEffect(() => {
        if (isAuthenticated && user) return; // pas de BackHandler si on est en train de rediriger
        const backHandler = BackHandler.addEventListener('hardwareBackPress', () => {
            if (step === 'PIN') {
                animateTransition(() => { setStep('PHONE'); });
            } else {
                BackHandler.exitApp();
            }
            return true;
        });
        return () => backHandler.remove();
    }, [step, isAuthenticated, user]);

    // Écran de chargement pendant la vérification auth, ou si déjà connecté (évite le flash)
    if (isLoading || (isAuthenticated && user)) {
        return (
            <View style={{ flex: 1, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' }}>
                <JulabaLogo width={120} />
                <ActivityIndicator color="#fff" size="large" style={{ marginTop: 24 }} />
            </View>
        );
    }

    const animateTransition = (callback: () => void) => {
        Animated.sequence([
            Animated.timing(fadeAnim, { toValue: 0, duration: 150, useNativeDriver: Platform.OS !== 'web' }),
            Animated.timing(fadeAnim, { toValue: 1, duration: 150, useNativeDriver: Platform.OS !== 'web' }),
        ]).start();
        transTimer.current = setTimeout(callback, 150);
    };

    const handleForgot = () => {
        setForgotPhone(phoneNumber); // pré-remplir avec le numéro déjà saisi
        setForgotError('');
        setForgotDone(false);
        setForgotVisible(true);
    };

    const handleForgotSubmit = async () => {
        const phone = forgotPhone.trim();
        if (phone.length < 4) {
            setForgotError('Numéro de téléphone invalide.');
            return;
        }
        // Limiteur de tentatives
        const attempts = forgotAttempts[phone] ?? 0;
        if (attempts >= 3) {
            setForgotError('Trop de tentatives. Contactez votre administrateur.');
            return;
        }
        setForgotLoading(true);
        setForgotError('');
        try {
            // Vérifier que le compte existe
            const { data: profile } = await supabase
                .from('profiles')
                .select('id, full_name')
                .eq('phone_number', phone)
                .single();

            if (!profile) {
                setForgotError('Aucun compte associé à ce numéro.');
                setForgotLoading(false);
                return;
            }

            // Réinitialiser le PIN à '0101'
            await supabase.from('profiles').update({ pin: '0101' }).eq('id', profile.id);

            // Incrémenter le compteur de tentatives
            forgotAttempts[phone] = (forgotAttempts[phone] ?? 0) + 1;

            // Notifier les admins
            const { data: admins } = await supabase
                .from('profiles')
                .select('id')
                .eq('role', 'SUPERVISOR');

            if (admins && admins.length > 0) {
                const notifs = admins.map((a: { id: string }) => ({
                    user_id: a.id,
                    titre: 'Réinitialisation PIN',
                    message: `${profile.full_name} (${phone}) a demandé une réinitialisation de PIN.`,
                    type: 'signalement',
                    data: { phone, user_id: profile.id },
                    lu: false,
                }));
                await supabase.from('notifications').insert(notifs);
            }

            setForgotDone(true);
        } catch {
            setForgotError('Erreur réseau. Réessayez.');
        } finally {
            setForgotLoading(false);
        }
    };

    const handlePhoneSubmit = () => {
        if (phoneNumber.length >= 4) {
            animateTransition(() => {
                setStep('PIN');
                setError('');
            });
        } else {
            setError('Numéro de téléphone invalide');
        }
    };

    // ── Layout desktop : split screen ─────────────────────────────────────
    if (isDesktop) {
        return (
            <View style={dt.container}>
                {/* Panneau gauche — branding vert */}
                <View style={dt.left}>
                    <JulabaLogo width={120} />
                    <Text style={dt.brandSlogan}>
                        Plateforme d'inclusion financière{'\n'}pour les commerçants informels
                    </Text>
                    <Text style={dt.copyright}>© 2026 Jùlaba — Côte d'Ivoire</Text>
                </View>

                {/* Panneau droit — formulaire */}
                <View style={dt.right}>
                    <TouchableOpacity style={dt.backBtn} onPress={() => router.push('/' as any)} activeOpacity={0.8}>
                        <ArrowLeft color={colors.slate600} size={20} />
                    </TouchableOpacity>
                    <View style={dt.formCard}>
                        {step === 'PIN' ? (
                            <PinInput
                                mode="login"
                                phoneNumber={phoneNumber}
                                onVerify={(pin) => login(phoneNumber, pin)}
                                onSuccess={() => {}}
                                onForgot={handleForgot}
                                onBack={() => animateTransition(() => { setStep('PHONE'); })}
                            />
                        ) : (
                            <KeyboardAvoidingView behavior="padding">
                                <Text style={dt.formTitle}>Bienvenue</Text>
                                <Text style={dt.formSub}>CONNECTEZ-VOUS POUR CONTINUER</Text>
                                <Animated.View style={{ opacity: fadeAnim }}>
                                    <View style={{ marginTop: 28, gap: 16 }}>
                                        <Text style={dt.label}>NUMÉRO DE TÉLÉPHONE</Text>
                                        <View style={dt.inputWrapper}>
                                            <View style={dt.inputIconBox}>
                                                <Phone color="#9CA3AF" size={18} />
                                            </View>
                                            <TextInput
                                                style={dt.inputField}
                                                placeholder="0102030405"
                                                placeholderTextColor="#9CA3AF"
                                                value={phoneNumber}
                                                onChangeText={setPhoneNumber}
                                                keyboardType="phone-pad"
                                                autoFocus
                                                returnKeyType="next"
                                                onSubmitEditing={handlePhoneSubmit}
                                            />
                                        </View>
                                        {error ? <ErrorBox message={error} /> : null}
                                        <TouchableOpacity style={dt.btnPrimary} onPress={handlePhoneSubmit} activeOpacity={0.85}>
                                            <Text style={dt.btnPrimaryText}>SUIVANT</Text>
                                            <ChevronRight color="#fff" size={24} />
                                        </TouchableOpacity>
                                        <TouchableOpacity onPress={() => router.push('/(auth)/signup' as any)} style={styles.linkBtn}>
                                            <Text style={dt.linkBtnText}>CRÉER UN NOUVEAU COMPTE</Text>
                                        </TouchableOpacity>
                                    </View>
                                </Animated.View>
                            </KeyboardAvoidingView>
                        )}
                    </View>
                </View>

                {/* Modal PIN oublié — identique au mobile */}
                <Modal
                    visible={forgotVisible}
                    transparent
                    animationType="fade"
                    onRequestClose={() => { if (!forgotLoading) setForgotVisible(false); }}
                >
                    <View style={dt.modalOverlay}>
                        <View style={dt.modalCard}>
                            <View style={styles.forgotHeader}>
                                <Text style={styles.forgotTitle}>PIN oublié</Text>
                                <TouchableOpacity style={styles.forgotClose} onPress={() => { if (!forgotLoading) { setForgotVisible(false); setForgotDone(false); setForgotError(''); } }}>
                                    <X color="#64748b" size={20} />
                                </TouchableOpacity>
                            </View>
                            {forgotDone ? (
                                <View style={styles.forgotSuccess}>
                                    <Text style={styles.forgotSuccessIcon}>✓</Text>
                                    <Text style={styles.forgotSuccessTitle}>PIN réinitialisé</Text>
                                    <Text style={styles.forgotSuccessText}>
                                        Votre PIN temporaire est <Text style={{ fontWeight: '900', color: colors.primary }}>0101</Text>.{'\n'}
                                        Connectez-vous et créez un nouveau PIN.
                                    </Text>
                                    <TouchableOpacity style={styles.forgotBtn} onPress={() => { setForgotVisible(false); setForgotDone(false); setPhoneNumber(forgotPhone); animateTransition(() => { setStep('PIN'); setError(''); }); }}>
                                        <Text style={styles.forgotBtnText}>SE CONNECTER MAINTENANT</Text>
                                    </TouchableOpacity>
                                </View>
                            ) : (
                                <>
                                    <Text style={styles.forgotHint}>Entrez votre numéro de téléphone. Votre PIN sera réinitialisé à un code temporaire.</Text>
                                    <View style={styles.forgotInput}>
                                        <Phone color="#94a3b8" size={18} />
                                        <TextInput
                                            style={styles.forgotTextInput}
                                            placeholder="Votre numéro de téléphone"
                                            placeholderTextColor="#94a3b8"
                                            value={forgotPhone}
                                            onChangeText={t => { setForgotPhone(t); setForgotError(''); }}
                                            keyboardType="phone-pad"
                                            autoFocus
                                        />
                                    </View>
                                    {forgotError ? <Text style={styles.forgotErrorText}>{forgotError}</Text> : null}
                                    <TouchableOpacity
                                        style={[styles.forgotBtn, (forgotLoading || forgotPhone.length < 4) && styles.forgotBtnDisabled]}
                                        onPress={handleForgotSubmit}
                                        disabled={forgotLoading || forgotPhone.length < 4}
                                    >
                                        {forgotLoading
                                            ? <ActivityIndicator color="#fff" size="small" />
                                            : <Text style={styles.forgotBtnText}>RÉINITIALISER MON PIN</Text>}
                                    </TouchableOpacity>
                                </>
                            )}
                        </View>
                    </View>
                </Modal>
            </View>
        );
    }

    // ── Layout mobile (inchangé) ────────────────────────────────────────────
    return (
        <SafeAreaView style={styles.safe}>
            {step === 'PIN' ? (
                // ── Étape PIN : délégué entièrement à PinInput ──
                <PinInput
                    mode="login"
                    phoneNumber={phoneNumber}
                    onVerify={(pin) => login(phoneNumber, pin)}
                    onSuccess={() => { /* redirect géré par useEffect isAuthenticated */ }}
                    onForgot={handleForgot}
                    onBack={() => animateTransition(() => { setStep('PHONE'); })}
                />
            ) : (
                // ── Étape TÉLÉPHONE ──
                <KeyboardAvoidingView
                    behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                    style={styles.kav}
                >
                    <ScrollView
                        contentContainerStyle={styles.scroll}
                        keyboardShouldPersistTaps="handled"
                        showsVerticalScrollIndicator={false}
                    >
                        {/* Bouton retour */}
                        <TouchableOpacity style={styles.backBtn} onPress={() => router.push('/' as any)} activeOpacity={0.8}>
                            <ArrowLeft color={colors.primary} size={20} />
                        </TouchableOpacity>

                        {/* Logo / Header */}
                        <View style={styles.header}>
                            <View style={styles.logoBox}>
                                <JulabaLogo width={48} />
                            </View>
                            <Text style={styles.title}>Bienvenue</Text>
                            <Text style={styles.subtitle}>CONNECTEZ-VOUS POUR CONTINUER</Text>
                        </View>

                        <Animated.View style={{ opacity: fadeAnim, width: '100%' }}>
                            <View style={styles.form}>
                                <Text style={styles.label}>NUMÉRO DE TÉLÉPHONE</Text>
                                <View style={styles.inputWrapper}>
                                    <View style={styles.inputIcon}><Phone color={colors.slate300} size={20} /></View>
                                    <TextInput
                                        style={styles.input}
                                        placeholder="0102030405"
                                        placeholderTextColor={colors.slate300}
                                        value={phoneNumber}
                                        onChangeText={setPhoneNumber}
                                        keyboardType="phone-pad"
                                        autoFocus
                                        returnKeyType="next"
                                        onSubmitEditing={handlePhoneSubmit}
                                    />
                                </View>

                                {error ? <ErrorBox message={error} /> : null}

                                <TouchableOpacity
                                    style={styles.btnPrimary}
                                    onPress={handlePhoneSubmit}
                                    activeOpacity={0.85}
                                >
                                    <Text style={styles.btnPrimaryText}>SUIVANT</Text>
                                    <ChevronRight color={colors.white} size={24} />
                                </TouchableOpacity>

                                <TouchableOpacity
                                    onPress={() => router.push('/(auth)/signup' as any)}
                                    style={styles.linkBtn}
                                >
                                    <Text style={styles.linkBtnText}>CRÉER UN NOUVEAU COMPTE</Text>
                                </TouchableOpacity>
                            </View>
                        </Animated.View>
                    </ScrollView>
                </KeyboardAvoidingView>
            )}

            {/* Modal PIN oublié — toujours monté, contrôlé par visible={forgotVisible} */}
            <Modal
                    visible={forgotVisible}
                    transparent
                    animationType="slide"
                    statusBarTranslucent
                    onRequestClose={() => { if (!forgotLoading) setForgotVisible(false); }}
                >
                    <KeyboardAvoidingView
                        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                        style={{ flex: 1 }}
                    >
                    <View style={styles.forgotOverlay}>
                        <View style={styles.forgotSheet}>
                            {/* Handle */}
                            <View style={styles.sheetHandle} />

                            {/* Header */}
                            <View style={styles.forgotHeader}>
                                <Text style={styles.forgotTitle}>PIN oublié</Text>
                                <TouchableOpacity
                                    style={styles.forgotClose}
                                    onPress={() => { if (!forgotLoading) { setForgotVisible(false); setForgotDone(false); setForgotError(''); } }}
                                >
                                    <X color="#64748b" size={20} />
                                </TouchableOpacity>
                            </View>

                            {forgotDone ? (
                                <View style={styles.forgotSuccess}>
                                    <Text style={styles.forgotSuccessIcon}>✓</Text>
                                    <Text style={styles.forgotSuccessTitle}>PIN réinitialisé</Text>
                                    <Text style={styles.forgotSuccessText}>
                                        Votre PIN temporaire est <Text style={{ fontWeight: '900', color: colors.primary }}>0101</Text>.{'\n'}
                                        Connectez-vous et créez un nouveau PIN.
                                    </Text>
                                    <TouchableOpacity
                                        style={styles.forgotBtn}
                                        onPress={() => {
                                            setForgotVisible(false);
                                            setForgotDone(false);
                                            setPhoneNumber(forgotPhone);
                                            animateTransition(() => { setStep('PIN'); setError(''); });
                                        }}
                                    >
                                        <Text style={styles.forgotBtnText}>SE CONNECTER MAINTENANT</Text>
                                    </TouchableOpacity>
                                </View>
                            ) : (
                                <>
                                    <Text style={styles.forgotHint}>
                                        Entrez votre numéro de téléphone. Votre PIN sera réinitialisé à un code temporaire.
                                    </Text>
                                    <View style={styles.forgotInput}>
                                        <Phone color="#94a3b8" size={18} />
                                        <TextInput
                                            style={styles.forgotTextInput}
                                            placeholder="Votre numéro de téléphone"
                                            placeholderTextColor="#94a3b8"
                                            value={forgotPhone}
                                            onChangeText={t => { setForgotPhone(t); setForgotError(''); }}
                                            keyboardType="phone-pad"
                                            autoFocus
                                        />
                                    </View>
                                    {forgotError ? <Text style={styles.forgotErrorText}>{forgotError}</Text> : null}
                                    <TouchableOpacity
                                        style={[styles.forgotBtn, (forgotLoading || forgotPhone.length < 4) && styles.forgotBtnDisabled]}
                                        onPress={handleForgotSubmit}
                                        disabled={forgotLoading || forgotPhone.length < 4}
                                    >
                                        {forgotLoading
                                            ? <ActivityIndicator color="#fff" size="small" />
                                            : <Text style={styles.forgotBtnText}>RÉINITIALISER MON PIN</Text>
                                        }
                                    </TouchableOpacity>
                                </>
                            )}
                        </View>
                    </View>
                    </KeyboardAvoidingView>
                </Modal>
        </SafeAreaView>
    );
}

function ErrorBox({ message }: { message: string }) {
    return (
        <View style={styles.errorBox}>
            <AlertCircle color={colors.error} size={18} />
            <Text style={styles.errorText}>{message}</Text>
        </View>
    );
}

const styles = StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.white },
    kav:  { flex: 1 },
    scroll: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24, paddingVertical: 40 },
    backBtn: {
        position: 'absolute', top: 16, left: 0,
        width: 40, height: 40, borderRadius: 10,
        backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center',
        shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 6, elevation: 3,
        zIndex: 10,
    },

    // Header
    header: { alignItems: 'center', marginBottom: 40 },
    logoBox: {
        width: 80, height: 80,
        backgroundColor: colors.primary,
        borderRadius: 10,
        alignItems: 'center', justifyContent: 'center',
        marginBottom: 20,
        shadowColor: colors.primary, shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.3, shadowRadius: 16,
        elevation: 10,
    },
    title:    { fontSize: 28, fontWeight: '900', color: colors.slate900, letterSpacing: -1, textTransform: 'uppercase' },
    subtitle: { fontSize: 11, fontWeight: '700', color: colors.slate400, letterSpacing: 3, marginTop: 6, textTransform: 'uppercase' },

    // Formulaire téléphone
    form:  { width: '100%', gap: 16 },
    label: { fontSize: 11, fontWeight: '900', color: colors.slate400, letterSpacing: 4, textTransform: 'uppercase', marginLeft: 4, marginBottom: 4 },
    inputWrapper: {
        flexDirection: 'row', alignItems: 'center',
        backgroundColor: colors.slate50,
        borderWidth: 2, borderColor: colors.slate100,
        borderRadius: 10, paddingHorizontal: 16, paddingVertical: 14,
    },
    inputIcon: { marginRight: 12 },
    input: { flex: 1, fontSize: 18, fontWeight: '800', color: colors.slate900, outlineWidth: 0 } as any,

    // Boutons
    btnPrimary: {
        backgroundColor: colors.slate900,
        borderRadius: 10, paddingVertical: 18,
        flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    },
    btnPrimaryText: { color: colors.white, fontSize: 15, fontWeight: '900', letterSpacing: 2, textTransform: 'uppercase' },
    linkBtn:     { alignItems: 'center', paddingVertical: 12 },
    linkBtnText: { fontSize: 11, fontWeight: '900', color: colors.slate400, letterSpacing: 3, textTransform: 'uppercase' },

    // Modal PIN oublié
    forgotOverlay: {
        flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end',
    },
    forgotSheet: {
        backgroundColor: '#fff',
        borderTopLeftRadius: 20, borderTopRightRadius: 20,
        paddingHorizontal: 24, paddingBottom: Platform.OS === 'ios' ? 40 : 24, paddingTop: 8,
    },
    sheetHandle: {
        width: 40, height: 4, borderRadius: 2, backgroundColor: '#e2e8f0',
        alignSelf: 'center', marginBottom: 16,
    },
    forgotHeader: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12,
    },
    forgotTitle: { fontSize: 18, fontWeight: '800', color: '#1e293b' },
    forgotClose: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
    forgotHint: { fontSize: 13, color: '#64748b', marginBottom: 16, lineHeight: 20 },
    forgotInput: {
        flexDirection: 'row', alignItems: 'center', gap: 10,
        backgroundColor: '#f8fafc', borderWidth: 1.5, borderColor: '#e2e8f0',
        borderRadius: 10, paddingHorizontal: 14, paddingVertical: 14, marginBottom: 8,
    },
    forgotTextInput: { flex: 1, fontSize: 16, fontWeight: '700', color: '#1e293b', outlineWidth: 0 } as any,
    forgotErrorText: { fontSize: 12, color: colors.error, marginBottom: 12 },
    forgotBtn: {
        height: 52, borderRadius: 10, backgroundColor: colors.primary,
        alignItems: 'center', justifyContent: 'center', marginTop: 8,
    },
    forgotBtnDisabled: { backgroundColor: colors.primaryBg2 },
    forgotBtnText: { fontSize: 13, fontWeight: '800', color: '#fff', letterSpacing: 1 },
    forgotSuccess: { alignItems: 'center', paddingVertical: 16 },
    forgotSuccessIcon: { fontSize: 48, color: colors.primary, marginBottom: 8 },
    forgotSuccessTitle: { fontSize: 20, fontWeight: '800', color: colors.primary, marginBottom: 8 },
    forgotSuccessText: { fontSize: 14, color: '#64748b', textAlign: 'center', lineHeight: 22, marginBottom: 20 },

    // Erreur (mobile)
    errorBox: {
        flexDirection: 'row', alignItems: 'center', gap: 8,
        backgroundColor: '#fff1f2', borderRadius: 10,
        paddingHorizontal: 16, paddingVertical: 12,
    },
    errorText: { color: colors.error, fontWeight: '700', fontSize: 13 },
});

// ── Styles desktop uniquement ─────────────────────────────────────────────
const dt = StyleSheet.create({
    container: { flex: 1, flexDirection: 'row' },

    // Panneau gauche vert
    left: {
        flex: 1,
        backgroundColor: colors.primary,
        alignItems: 'center',
        justifyContent: 'center',
        padding: 48,
        gap: 16,
    },
    brandName: {
        fontSize: 36, fontWeight: '900', color: '#fff',
        textAlign: 'center',
    },
    brandSlogan: {
        fontSize: 16, color: 'rgba(255,255,255,0.8)',
        textAlign: 'center', lineHeight: 24,
    },
    separator: {
        width: 60, height: 2,
        backgroundColor: 'rgba(255,255,255,0.3)',
        marginVertical: 8,
    },
    statsRow: {
        flexDirection: 'row', alignItems: 'center', gap: 12,
    },
    statText: { fontSize: 14, color: 'rgba(255,255,255,0.6)' },
    statDot:  { fontSize: 14, color: 'rgba(255,255,255,0.3)' },
    copyright: {
        position: 'absolute', bottom: 30,
        fontSize: 11, color: 'rgba(255,255,255,0.4)',
        textAlign: 'center',
    },

    // Panneau droit blanc
    right: {
        flex: 1,
        backgroundColor: '#fff',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 48,
    },
    backBtn: {
        position: 'absolute', top: 24, left: 24,
        width: 40, height: 40, borderRadius: 10,
        backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center',
        shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 6, elevation: 3,
        zIndex: 10,
    },
    formCard:  { width: '100%', maxWidth: 400 },
    formTitle: { fontSize: 28, fontWeight: '900', color: colors.textPrimary, letterSpacing: -0.5 },
    formSub:   { fontSize: 13, color: colors.textSecondary, letterSpacing: 1, marginTop: 6 },
    label:     { fontSize: 12, fontWeight: '700', color: colors.textSecondary },

    // Champ de saisie desktop
    inputWrapper: {
        flexDirection: 'row', alignItems: 'center',
        borderWidth: 1.5, borderColor: colors.slate200,
        borderRadius: 10, backgroundColor: colors.slate50,
        paddingHorizontal: 12,
    },
    inputIconBox: {
        width: 34, height: 34, borderRadius: 8,
        backgroundColor: colors.slate100,
        alignItems: 'center', justifyContent: 'center',
        marginRight: 10,
    },
    inputField: {
        flex: 1, fontSize: 16, fontWeight: '600',
        color: colors.textPrimary, paddingVertical: 14,
        outlineWidth: 0,
        outlineColor: 'transparent',
        outlineStyle: 'none',
    } as any,

    // Bouton SUIVANT desktop
    btnPrimary: {
        backgroundColor: colors.primary, borderRadius: 10,
        paddingVertical: 16,
        flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    },
    btnPrimaryText: { color: '#fff', fontSize: 14, fontWeight: '900', letterSpacing: 2 },

    // Lien compte
    linkBtnText: { fontSize: 12, fontWeight: '700', color: colors.primary, letterSpacing: 2, textTransform: 'uppercase' },

    // Modal desktop (centré, pas bottom-sheet)
    modalOverlay: {
        flex: 1, backgroundColor: 'rgba(0,0,0,0.55)',
        alignItems: 'center', justifyContent: 'center',
    },
    modalCard: {
        width: '100%', maxWidth: 460,
        backgroundColor: '#fff',
        borderRadius: 12, padding: 28,
    },
});
