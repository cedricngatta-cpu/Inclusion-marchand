// Écran de connexion — migré depuis Next.js /login/page.tsx
// framer-motion → Animated/react-native, HTML → composants React Native
import React, { useState, useEffect, useRef } from 'react';
import {
    View, Text, TextInput, TouchableOpacity, StyleSheet,
    KeyboardAvoidingView, Platform, ScrollView, Animated, BackHandler,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Phone, Lock, ChevronRight, AlertCircle } from 'lucide-react-native';
import { useAuth } from '@/src/context/AuthContext';
import { colors } from '@/src/lib/colors';
import { SafeAreaView } from 'react-native-safe-area-context';
import PinInput from '@/src/components/PinInput';

export default function LoginScreen() {
    const router = useRouter();
    const { login, isAuthenticated, user } = useAuth();

    const [phoneNumber, setPhoneNumber] = useState('');
    const [error, setError]             = useState('');
    const [step, setStep]               = useState<'PHONE' | 'PIN'>('PHONE');

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

    // Bouton retour Android sur la page login → quitter l'app (pas revenir au dashboard)
    useEffect(() => {
        const backHandler = BackHandler.addEventListener('hardwareBackPress', () => {
            BackHandler.exitApp();
            return true;
        });
        return () => backHandler.remove();
    }, []);

    const animateTransition = (callback: () => void) => {
        Animated.sequence([
            Animated.timing(fadeAnim, { toValue: 0, duration: 150, useNativeDriver: true }),
            Animated.timing(fadeAnim, { toValue: 1, duration: 150, useNativeDriver: true }),
        ]).start();
        transTimer.current = setTimeout(callback, 150);
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

    return (
        <SafeAreaView style={styles.safe}>
            {step === 'PIN' ? (
                // ── Étape PIN : délégué entièrement à PinInput ──
                <PinInput
                    mode="login"
                    phoneNumber={phoneNumber}
                    onVerify={(pin) => login(phoneNumber, pin)}
                    onSuccess={() => { /* redirect géré par useEffect isAuthenticated */ }}
                    onForgot={() => animateTransition(() => { setStep('PHONE'); setError(''); })}
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
                        {/* Logo / Header */}
                        <View style={styles.header}>
                            <View style={styles.logoBox}>
                                <Lock color={colors.white} size={32} />
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
    input: { flex: 1, fontSize: 18, fontWeight: '800', color: colors.slate900 },

    // Boutons
    btnPrimary: {
        backgroundColor: colors.slate900,
        borderRadius: 10, paddingVertical: 18,
        flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    },
    btnPrimaryText: { color: colors.white, fontSize: 15, fontWeight: '900', letterSpacing: 2, textTransform: 'uppercase' },
    linkBtn:     { alignItems: 'center', paddingVertical: 12 },
    linkBtnText: { fontSize: 11, fontWeight: '900', color: colors.slate400, letterSpacing: 3, textTransform: 'uppercase' },

    // Erreur
    errorBox: {
        flexDirection: 'row', alignItems: 'center', gap: 8,
        backgroundColor: '#fff1f2', borderRadius: 10,
        paddingHorizontal: 16, paddingVertical: 12,
    },
    errorText: { color: colors.error, fontWeight: '700', fontSize: 13 },
});
