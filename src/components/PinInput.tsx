// Composant PIN réutilisable — design minimaliste
// Utilisé dans login.tsx (étape PIN) et LockScreen.tsx (verrouillage auto)
import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
    View, Text, TouchableOpacity, StyleSheet, Image,
    Animated, Vibration, Alert, ActivityIndicator,
} from 'react-native';
import { Delete } from 'lucide-react-native';

interface PinInputProps {
    mode: 'login' | 'lock';
    phoneNumber?: string;
    userName?: string;
    onVerify: (pin: string) => Promise<boolean>;
    onSuccess: () => void;
    onForgot?: () => void;
}

function maskPhone(phone: string): string {
    if (!phone) return '';
    const digits = phone.replace(/\D/g, '');
    if (digits.length < 6) return `📱 ${phone}`;
    const first5 = digits.slice(0, 5);
    const last2 = digits.slice(-2);
    // Format first5 avec espaces : "07112" → "07 11 2"
    const formatted = first5.replace(/(\d{2})(?=\d)/g, '$1 ');
    return `📱 ${formatted}•••${last2}`;
}

export default function PinInput({
    mode,
    phoneNumber,
    onVerify,
    onSuccess,
    onForgot,
}: PinInputProps) {
    const [pin, setPin] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const [pressedKey, setPressedKey] = useState<string | null>(null);
    const [dotState, setDotState] = useState<'normal' | 'error'>('normal');

    const shakeAnim  = useRef(new Animated.Value(0)).current;
    const dotScales  = useRef([0, 1, 2, 3].map(() => new Animated.Value(1))).current;
    const resetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Nettoyage des timers au démontage
    useEffect(() => () => {
        if (resetTimer.current) clearTimeout(resetTimer.current);
        if (flashTimer.current) clearTimeout(flashTimer.current);
    }, []);

    const shake = useCallback(() => {
        Animated.sequence([
            Animated.timing(shakeAnim, { toValue: 10, duration: 50, useNativeDriver: true }),
            Animated.timing(shakeAnim, { toValue: -10, duration: 50, useNativeDriver: true }),
            Animated.timing(shakeAnim, { toValue: 8, duration: 55, useNativeDriver: true }),
            Animated.timing(shakeAnim, { toValue: -8, duration: 55, useNativeDriver: true }),
            Animated.timing(shakeAnim, { toValue: 0, duration: 50, useNativeDriver: true }),
        ]).start();
    }, [shakeAnim]);

    const animateDot = useCallback((index: number) => {
        Animated.sequence([
            Animated.timing(dotScales[index], { toValue: 1.35, duration: 100, useNativeDriver: true }),
            Animated.timing(dotScales[index], { toValue: 1.0, duration: 100, useNativeDriver: true }),
        ]).start();
    }, [dotScales]);

    const handleDigit = useCallback(async (digit: string) => {
        if (loading || pin.length >= 4) return;

        // Flash visuel sur le chiffre pressé (200ms)
        setPressedKey(digit);
        flashTimer.current = setTimeout(() => setPressedKey(null), 200);

        const newPin = pin + digit;
        setPin(newPin);
        setError('');
        setDotState('normal');
        animateDot(pin.length);
        Vibration.vibrate(20);

        if (newPin.length === 4) {
            setLoading(true);
            const ok = await onVerify(newPin);
            setLoading(false);
            if (ok) {
                onSuccess();
            } else {
                setDotState('error');
                shake();
                Vibration.vibrate(200);
                setError('Code incorrect');
                resetTimer.current = setTimeout(() => {
                    setPin('');
                    setDotState('normal');
                    setError('');
                }, 2000);
            }
        }
    }, [pin, loading, onVerify, onSuccess, shake, animateDot]);

    const handleDelete = useCallback(() => {
        if (pin.length === 0 || loading) return;
        setPin(prev => prev.slice(0, -1));
        setError('');
        setDotState('normal');
    }, [pin, loading]);

    const handleForgot = () => {
        if (onForgot) {
            onForgot();
        } else {
            Alert.alert(
                'Code oublié',
                'Contactez votre administrateur pour réinitialiser votre code secret.'
            );
        }
    };

    const titleText = mode === 'lock'
        ? 'Votre code secret est requis'
        : 'Saisissez votre code PIN';
    const subtitleText = mode === 'lock'
        ? 'pour déverrouiller'
        : 'pour continuer';

    return (
        <View style={styles.container}>

            {/* Numéro partiellement masqué — haut droite */}
            {phoneNumber ? (
                <View style={styles.phoneTopRight}>
                    <Text style={styles.phoneText}>{maskPhone(phoneNumber)}</Text>
                </View>
            ) : null}

            {/* Zone principale — logo + texte + points */}
            <View style={styles.mainContent}>
                <Image
                    source={require('../../assets/icon.png')}
                    style={styles.logo}
                    resizeMode="cover"
                />

                <View style={styles.titleBlock}>
                    <Text style={styles.title}>{titleText}</Text>
                    <Text style={styles.subtitle}>{subtitleText}</Text>
                </View>

                {/* 4 points PIN */}
                <Animated.View
                    style={[styles.dotsRow, { transform: [{ translateX: shakeAnim }] }]}
                >
                    {[0, 1, 2, 3].map(i => (
                        <Animated.View
                            key={i}
                            style={[
                                styles.dot,
                                i < pin.length && (dotState === 'error' ? styles.dotError : styles.dotFilled),
                                { transform: [{ scale: dotScales[i] }] },
                            ]}
                        />
                    ))}
                </Animated.View>

                {/* Slot erreur — hauteur fixe pour éviter les sauts de layout */}
                <View style={styles.errorSlot}>
                    {error ? <Text style={styles.errorText}>{error}</Text> : null}
                    {loading ? <ActivityIndicator color="#059669" size="small" /> : null}
                </View>
            </View>

            {/* Clavier numérique minimaliste */}
            <View style={styles.numpad}>

                {/* Lignes 1, 2, 3 */}
                {([[1,2,3],[4,5,6],[7,8,9]] as number[][]).map((row, ri) => (
                    <View key={ri} style={styles.row}>
                        {row.map(num => (
                            <TouchableOpacity
                                key={num}
                                style={styles.key}
                                onPress={() => handleDigit(String(num))}
                                disabled={loading || pin.length >= 4}
                                activeOpacity={1}
                            >
                                <Text style={[
                                    styles.keyText,
                                    pressedKey === String(num) && styles.keyTextPressed,
                                ]}>
                                    {num}
                                </Text>
                            </TouchableOpacity>
                        ))}
                    </View>
                ))}

                {/* Ligne 4 : OUBLIÉ? | 0 | ⌫ */}
                <View style={styles.row}>
                    <TouchableOpacity style={styles.key} onPress={handleForgot} activeOpacity={0.7}>
                        <Text style={styles.forgotText}>OUBLIÉ?</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                        style={styles.key}
                        onPress={() => handleDigit('0')}
                        disabled={loading || pin.length >= 4}
                        activeOpacity={1}
                    >
                        <Text style={[
                            styles.keyText,
                            pressedKey === '0' && styles.keyTextPressed,
                        ]}>0</Text>
                    </TouchableOpacity>

                    <TouchableOpacity style={styles.key} onPress={handleDelete} activeOpacity={0.7}>
                        <Delete size={24} color="#1F2937" />
                    </TouchableOpacity>
                </View>

            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#FFFFFF',
    },

    // Numéro haut droite
    phoneTopRight: {
        position: 'absolute',
        top: 16,
        right: 16,
        zIndex: 1,
    },
    phoneText: {
        fontSize: 13,
        color: '#6B7280',
    },

    // Zone logo + titre + points
    mainContent: {
        flex: 1,
        alignItems: 'center',
    },
    logo: {
        width: 80,
        height: 80,
        borderRadius: 16,
        marginTop: 40,
    },
    titleBlock: {
        marginTop: 40,
        alignItems: 'center',
    },
    title: {
        fontSize: 17,
        fontWeight: '500',
        color: '#1F2937',
        textAlign: 'center',
    },
    subtitle: {
        fontSize: 17,
        fontWeight: '500',
        color: '#1F2937',
        textAlign: 'center',
        marginTop: 4,
    },

    // Points PIN
    dotsRow: {
        flexDirection: 'row',
        marginTop: 50,
        gap: 20,
        alignItems: 'center',
    },
    dot: {
        width: 20,
        height: 20,
        borderRadius: 4,
        backgroundColor: '#D1D5DB',
    },
    dotFilled: {
        backgroundColor: '#059669',
    },
    dotError: {
        backgroundColor: '#DC2626',
    },

    // Slot texte erreur (hauteur fixe pour stabiliser le layout)
    errorSlot: {
        height: 28,
        alignItems: 'center',
        justifyContent: 'center',
        marginTop: 14,
    },
    errorText: {
        fontSize: 13,
        color: '#DC2626',
        fontWeight: '500',
    },

    // Clavier
    numpad: {
        alignItems: 'center',
        gap: 20,
        paddingBottom: 40,
    },
    row: {
        flexDirection: 'row',
    },
    key: {
        width: 80,
        height: 60,
        alignItems: 'center',
        justifyContent: 'center',
    },
    keyText: {
        fontSize: 32,
        fontWeight: '300',
        color: '#1F2937',
    },
    keyTextPressed: {
        color: '#059669',
    },
    forgotText: {
        fontSize: 12,
        fontWeight: '600',
        color: '#6B7280',
        letterSpacing: 1,
    },
});
