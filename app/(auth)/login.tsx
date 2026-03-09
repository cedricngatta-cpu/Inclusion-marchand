// Écran de connexion — migré depuis Next.js /login/page.tsx
// framer-motion → Animated/react-native, HTML → composants React Native
import React, { useState, useEffect } from 'react';
import {
    View, Text, TextInput, TouchableOpacity, StyleSheet,
    KeyboardAvoidingView, Platform, ScrollView, Animated, BackHandler,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Phone, Lock, ChevronRight, AlertCircle, Delete } from 'lucide-react-native';
import { useAuth } from '@/src/context/AuthContext';
import { colors } from '@/src/lib/colors';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function LoginScreen() {
    const router = useRouter();
    const { login, isAuthenticated, user } = useAuth();

    const [phoneNumber, setPhoneNumber] = useState('');
    const [pin, setPin] = useState('');
    const [error, setError] = useState('');
    const [step, setStep] = useState<'PHONE' | 'PIN'>('PHONE');
    const [isLoading, setIsLoading] = useState(false);

    // Animation de transition entre étapes
    const fadeAnim = React.useRef(new Animated.Value(1)).current;

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
        setTimeout(callback, 150);
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

    const handlePinPress = async (num: string) => {
        if (isLoading) return;
        const newPin = pin + num;
        setPin(newPin);

        if (newPin.length === 4) {
            setIsLoading(true);
            const success = await login(phoneNumber, newPin);
            if (!success) {
                setError('PIN incorrect ou compte inexistant');
                setPin('');
            }
            setIsLoading(false);
        }
    };

    const handleDelete = () => setPin(prev => prev.slice(0, -1));

    return (
        <SafeAreaView style={styles.safe}>
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
                        {step === 'PHONE' ? (
                            <View style={styles.form}>
                                {/* Champ numéro */}
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
                        ) : (
                            <View style={styles.pinContainer}>
                                <Text style={styles.label}>ENTREZ VOTRE PIN SECRET</Text>

                                {/* Points PIN */}
                                <View style={styles.pinDots}>
                                    {[0, 1, 2, 3].map(i => (
                                        <View
                                            key={i}
                                            style={[styles.dot, pin.length > i && styles.dotFilled]}
                                        />
                                    ))}
                                </View>

                                {error ? <ErrorBox message={error} /> : null}

                                {/* Clavier numérique */}
                                <View style={styles.numpad}>
                                    {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(num => (
                                        <TouchableOpacity
                                            key={num}
                                            style={styles.numKey}
                                            onPress={() => handlePinPress(num.toString())}
                                            activeOpacity={0.7}
                                        >
                                            <Text style={styles.numKeyText}>{num}</Text>
                                        </TouchableOpacity>
                                    ))}

                                    {/* Retour */}
                                    <TouchableOpacity
                                        style={styles.numKeyGhost}
                                        onPress={() => animateTransition(() => { setStep('PHONE'); setPin(''); setError(''); })}
                                    >
                                        <View style={{ transform: [{ rotate: '180deg' }] }}><ChevronRight color={colors.slate400} size={22} /></View>
                                    </TouchableOpacity>

                                    {/* 0 */}
                                    <TouchableOpacity
                                        style={styles.numKey}
                                        onPress={() => handlePinPress('0')}
                                        activeOpacity={0.7}
                                    >
                                        <Text style={styles.numKeyText}>0</Text>
                                    </TouchableOpacity>

                                    {/* Supprimer */}
                                    <TouchableOpacity
                                        style={styles.numKeyGhost}
                                        onPress={handleDelete}
                                    >
                                        <Delete color={colors.slate400} size={24} />
                                    </TouchableOpacity>
                                </View>
                            </View>
                        )}
                    </Animated.View>
                </ScrollView>
            </KeyboardAvoidingView>
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
    kav: { flex: 1 },
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
    title: { fontSize: 28, fontWeight: '900', color: colors.slate900, letterSpacing: -1, textTransform: 'uppercase' },
    subtitle: { fontSize: 10, fontWeight: '700', color: colors.slate400, letterSpacing: 3, marginTop: 6, textTransform: 'uppercase' },

    // Formulaire
    form: { width: '100%', gap: 16 },
    label: { fontSize: 9, fontWeight: '900', color: colors.slate400, letterSpacing: 4, textTransform: 'uppercase', marginLeft: 4, marginBottom: 4 },
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
    linkBtn: { alignItems: 'center', paddingVertical: 12 },
    linkBtnText: { fontSize: 9, fontWeight: '900', color: colors.slate400, letterSpacing: 3, textTransform: 'uppercase' },

    // Erreur
    errorBox: {
        flexDirection: 'row', alignItems: 'center', gap: 8,
        backgroundColor: '#fff1f2', borderRadius: 10,
        paddingHorizontal: 16, paddingVertical: 12,
    },
    errorText: { color: colors.error, fontWeight: '700', fontSize: 13 },

    // PIN
    pinContainer: { width: '100%', alignItems: 'center', gap: 24 },
    pinDots: { flexDirection: 'row', gap: 20 },
    dot: { width: 18, height: 18, borderRadius: 4, borderWidth: 3, borderColor: colors.slate200, backgroundColor: 'transparent' },
    dotFilled: { backgroundColor: colors.primary, borderColor: colors.primary, transform: [{ scale: 1.2 }] },

    // Clavier
    numpad: { width: '100%', maxWidth: 280, flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
    numKey: {
        width: '30%', aspectRatio: 1,
        backgroundColor: colors.white, borderWidth: 2, borderColor: colors.slate100,
        borderRadius: 10, alignItems: 'center', justifyContent: 'center',
        shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 3,
    },
    numKeyText: { fontSize: 26, fontWeight: '900', color: colors.slate900 },
    numKeyGhost: { width: '30%', aspectRatio: 1, alignItems: 'center', justifyContent: 'center' },
});
