// Écran d'inscription — migré depuis Next.js /signup/page.tsx
import React, { useState, useEffect, useRef } from 'react';
import {
    View, Text, TextInput, TouchableOpacity, StyleSheet,
    ScrollView, KeyboardAvoidingView, Platform, Animated,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Phone, User, ArrowLeft, Lock, AlertCircle, Delete, ChevronRight } from 'lucide-react-native';
import { useAuth } from '@/src/context/AuthContext';
import { colors } from '@/src/lib/colors';
import { SafeAreaView } from 'react-native-safe-area-context';

type Step = 'PHONE' | 'PIN';

const ROLES = [
    { value: 'MERCHANT' as const, label: 'Commerçant' },
    { value: 'PRODUCER' as const, label: 'Producteur' },
    { value: 'COOPERATIVE' as const, label: 'Coopérative' },
    { value: 'FIELD_AGENT' as const, label: 'Agent' },
];

export default function SignupScreen() {
    const router = useRouter();
    const { signup, isAuthenticated, user } = useAuth();

    const [step, setStep] = useState<Step>('PHONE');
    const [name, setName] = useState('');
    const [phone, setPhone] = useState('');
    const [role, setRole] = useState<typeof ROLES[number]['value']>('MERCHANT');
    const [pin, setPin] = useState('');
    const [error, setError] = useState('');
    const [isLoading, setIsLoading] = useState(false);

    const fadeAnim = useRef(new Animated.Value(1)).current;

    useEffect(() => {
        if (isAuthenticated && user) {
            // Laisser index.tsx gérer la redirection selon le rôle
            router.replace('/' as any);
        }
    }, [isAuthenticated, user]);

    const animateTransition = (callback: () => void) => {
        Animated.sequence([
            Animated.timing(fadeAnim, { toValue: 0, duration: 120, useNativeDriver: true }),
            Animated.timing(fadeAnim, { toValue: 1, duration: 120, useNativeDriver: true }),
        ]).start();
        setTimeout(callback, 120);
    };

    const handlePhoneSubmit = () => {
        setError('');
        if (name.trim().length < 2) { setError('Veuillez entrer votre nom complet.'); return; }
        if (phone.replace(/\D/g, '').length < 4) { setError('Numéro de téléphone invalide.'); return; }
        animateTransition(() => setStep('PIN'));
    };

    const handlePinPress = async (num: string) => {
        if (isLoading) return;
        const newPin = pin + num;
        setPin(newPin);

        if (newPin.length === 4) {
            setIsLoading(true);
            const fullPhone = `+225${phone.replace(/\D/g, '')}`;
            const success = await signup(name.trim(), fullPhone, newPin, role);
            if (!success) {
                setError('Ce numéro est déjà utilisé ou une erreur est survenue.');
                setPin('');
                setStep('PHONE');
            }
            setIsLoading(false);
        }
    };

    const stepIndex = step === 'PHONE' ? 0 : 1;

    return (
        <SafeAreaView style={styles.safe}>
            <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
                <ScrollView
                    contentContainerStyle={styles.scroll}
                    keyboardShouldPersistTaps="handled"
                    showsVerticalScrollIndicator={false}
                >
                    {/* Header */}
                    <View style={styles.header}>
                        <View style={styles.logoBox}>
                            <User color={colors.primary} size={30} />
                        </View>
                        <Text style={styles.title}>NOUVEAU COMPTE</Text>
                        <Text style={styles.subtitle}>REJOIGNEZ L'ÉCOSYSTÈME MARCHAND</Text>
                    </View>

                    {/* Progress */}
                    <View style={styles.progress}>
                        {[0, 1].map(i => (
                            <View
                                key={i}
                                style={[styles.progressDot, i <= stepIndex && styles.progressDotActive, i === stepIndex && styles.progressDotCurrent]}
                            />
                        ))}
                    </View>

                    <Animated.View style={{ opacity: fadeAnim, width: '100%' }}>
                        {step === 'PHONE' ? (
                            <View style={styles.form}>
                                {/* Nom */}
                                <View>
                                    <Text style={styles.label}>VOTRE NOM</Text>
                                    <View style={styles.inputWrapper}>
                                        <View style={{ marginRight: 10 }}><User color={colors.slate300} size={16} /></View>
                                        <TextInput
                                            style={styles.input}
                                            placeholder="Nom complet"
                                            placeholderTextColor={colors.slate300}
                                            value={name}
                                            onChangeText={setName}
                                            autoFocus
                                            returnKeyType="next"
                                        />
                                    </View>
                                </View>

                                {/* Téléphone */}
                                <View>
                                    <Text style={styles.label}>NUMÉRO DE TÉLÉPHONE</Text>
                                    <View style={styles.phoneRow}>
                                        <View style={styles.countryCode}>
                                            <Text style={styles.flag}>🇨🇮</Text>
                                            <Text style={styles.codeText}>+225</Text>
                                        </View>
                                        <View style={[styles.inputWrapper, { flex: 1 }]}>
                                            <View style={{ marginRight: 10 }}><Phone color={colors.slate300} size={16} /></View>
                                            <TextInput
                                                style={styles.input}
                                                placeholder="07 00 00 00 00"
                                                placeholderTextColor={colors.slate300}
                                                value={phone}
                                                onChangeText={setPhone}
                                                keyboardType="phone-pad"
                                            />
                                        </View>
                                    </View>
                                </View>

                                {/* Rôle */}
                                <View>
                                    <Text style={styles.label}>VOTRE RÔLE</Text>
                                    <View style={styles.rolesGrid}>
                                        {ROLES.map(r => (
                                            <TouchableOpacity
                                                key={r.value}
                                                style={[styles.roleBtn, role === r.value && styles.roleBtnActive]}
                                                onPress={() => setRole(r.value)}
                                                activeOpacity={0.8}
                                            >
                                                <Text style={[styles.roleBtnText, role === r.value && styles.roleBtnTextActive]}>
                                                    {r.label}
                                                </Text>
                                            </TouchableOpacity>
                                        ))}
                                    </View>
                                </View>

                                {error ? (
                                    <View style={styles.errorBox}>
                                        <AlertCircle color={colors.error} size={16} />
                                        <Text style={styles.errorText}>{error}</Text>
                                    </View>
                                ) : null}

                                <TouchableOpacity style={styles.btnPrimary} onPress={handlePhoneSubmit} activeOpacity={0.85}>
                                    <Text style={styles.btnPrimaryText}>CONTINUER</Text>
                                    <ChevronRight color={colors.white} size={18} />
                                </TouchableOpacity>

                                <TouchableOpacity onPress={() => router.push('/(auth)/login' as any)} style={styles.linkBtn}>
                                    <Text style={styles.linkBtnText}>J'AI DÉJÀ UN COMPTE</Text>
                                </TouchableOpacity>
                            </View>
                        ) : (
                            <View style={styles.pinContainer}>
                                <View style={styles.pinIconBox}>
                                    <Lock color={colors.primary} size={24} />
                                </View>
                                <Text style={styles.pinTitle}>CODE PIN SECRET</Text>
                                <Text style={styles.pinSubtitle}>CHOISISSEZ 4 CHIFFRES POUR SÉCURISER VOTRE COMPTE</Text>

                                {/* Points PIN */}
                                <View style={styles.pinDots}>
                                    {[0, 1, 2, 3].map(i => (
                                        <View key={i} style={[styles.dot, pin.length > i && styles.dotFilled]} />
                                    ))}
                                </View>

                                {error ? (
                                    <View style={styles.errorBox}>
                                        <AlertCircle color={colors.error} size={16} />
                                        <Text style={styles.errorText}>{error}</Text>
                                    </View>
                                ) : null}

                                <View style={styles.numpad}>
                                    {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(num => (
                                        <TouchableOpacity key={num} style={styles.numKey} onPress={() => handlePinPress(num.toString())} activeOpacity={0.7}>
                                            <Text style={styles.numKeyText}>{num}</Text>
                                        </TouchableOpacity>
                                    ))}
                                    <TouchableOpacity style={styles.numKeyGhost} onPress={() => animateTransition(() => { setStep('PHONE'); setPin(''); setError(''); })}>
                                        <ArrowLeft color={colors.slate400} size={22} />
                                    </TouchableOpacity>
                                    <TouchableOpacity style={styles.numKey} onPress={() => handlePinPress('0')} activeOpacity={0.7}>
                                        <Text style={styles.numKeyText}>0</Text>
                                    </TouchableOpacity>
                                    <TouchableOpacity style={styles.numKeyGhost} onPress={() => setPin(p => p.slice(0, -1))}>
                                        <Delete color={colors.slate400} size={22} />
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

const styles = StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.white },
    scroll: { flexGrow: 1, alignItems: 'center', paddingHorizontal: 24, paddingVertical: 32 },

    header: { alignItems: 'center', marginBottom: 28 },
    logoBox: {
        width: 72, height: 72, backgroundColor: colors.primary,
        borderRadius: 10, alignItems: 'center', justifyContent: 'center',
        marginBottom: 16,
        shadowColor: colors.primary, shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.25, shadowRadius: 12, elevation: 8,
    },
    title: { fontSize: 22, fontWeight: '900', color: colors.slate900, letterSpacing: -0.5, textTransform: 'uppercase' },
    subtitle: { fontSize: 11, fontWeight: '700', color: colors.slate400, letterSpacing: 3, marginTop: 4, textTransform: 'uppercase', textAlign: 'center' },

    progress: { flexDirection: 'row', gap: 8, marginBottom: 28 },
    progressDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.slate200 },
    progressDotActive: { backgroundColor: colors.primary },
    progressDotCurrent: { width: 24 },

    form: { width: '100%', gap: 16 },
    label: { fontSize: 11, fontWeight: '900', color: colors.slate400, letterSpacing: 4, textTransform: 'uppercase', marginBottom: 6, marginLeft: 4 },
    inputWrapper: {
        flexDirection: 'row', alignItems: 'center',
        backgroundColor: colors.slate50, borderWidth: 2, borderColor: colors.slate100,
        borderRadius: 10, paddingHorizontal: 14, paddingVertical: 14,
    },
    input: { flex: 1, fontSize: 15, fontWeight: '700', color: colors.slate900, outlineWidth: 0 } as any,

    phoneRow: { flexDirection: 'row', gap: 8 },
    countryCode: {
        flexDirection: 'row', alignItems: 'center', gap: 6,
        backgroundColor: colors.slate50, borderWidth: 2, borderColor: colors.slate100,
        borderRadius: 10, paddingHorizontal: 12, paddingVertical: 14,
    },
    flag: { fontSize: 18 },
    codeText: { fontWeight: '900', fontSize: 13, color: colors.slate500 },

    rolesGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    roleBtn: {
        width: '47%', paddingVertical: 12, borderRadius: 10,
        borderWidth: 2, borderColor: colors.slate100,
        backgroundColor: colors.white, alignItems: 'center',
    },
    roleBtnActive: { backgroundColor: colors.primary, borderColor: colors.primary },
    roleBtnText: { fontSize: 12, fontWeight: '900', color: colors.slate500, textTransform: 'uppercase', letterSpacing: 0.5 },
    roleBtnTextActive: { color: colors.white },

    errorBox: {
        flexDirection: 'row', alignItems: 'center', gap: 8,
        backgroundColor: '#fff1f2', borderRadius: 10,
        paddingHorizontal: 14, paddingVertical: 10,
    },
    errorText: { color: colors.error, fontWeight: '700', fontSize: 12, flex: 1 },

    btnPrimary: {
        backgroundColor: colors.primary, borderRadius: 10,
        paddingVertical: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    },
    btnPrimaryText: { color: colors.white, fontSize: 13, fontWeight: '900', letterSpacing: 2, textTransform: 'uppercase' },
    linkBtn: { alignItems: 'center', paddingVertical: 10 },
    linkBtnText: { fontSize: 11, fontWeight: '900', color: colors.slate400, letterSpacing: 3, textTransform: 'uppercase' },

    pinContainer: { width: '100%', alignItems: 'center', gap: 20 },
    pinIconBox: { width: 64, height: 64, backgroundColor: colors.primaryBg, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
    pinTitle: { fontSize: 18, fontWeight: '900', color: colors.slate900, letterSpacing: -0.5, textTransform: 'uppercase' },
    pinSubtitle: { fontSize: 11, fontWeight: '700', color: colors.slate400, letterSpacing: 2, textTransform: 'uppercase', textAlign: 'center' },
    pinDots: { flexDirection: 'row', gap: 18 },
    dot: { width: 18, height: 18, borderRadius: 4, borderWidth: 3, borderColor: colors.slate200 },
    dotFilled: { backgroundColor: colors.primary, borderColor: colors.primary, transform: [{ scale: 1.2 }] },

    numpad: { width: '100%', maxWidth: 280, flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
    numKey: {
        width: '30%', aspectRatio: 1,
        backgroundColor: colors.white, borderWidth: 2, borderColor: colors.slate100,
        borderRadius: 10, alignItems: 'center', justifyContent: 'center',
        shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 6, elevation: 2,
    },
    numKeyText: { fontSize: 24, fontWeight: '900', color: colors.slate900 },
    numKeyGhost: { width: '30%', aspectRatio: 1, alignItems: 'center', justifyContent: 'center' },
});
