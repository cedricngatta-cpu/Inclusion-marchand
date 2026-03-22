// Composant PIN réutilisable — design moderne avec animations
// Utilisé dans login.tsx (étape PIN) et LockScreen.tsx (verrouillage auto)
import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
    View, Text, TouchableOpacity, StyleSheet,
    Animated, Vibration, Alert, ActivityIndicator,
    Platform, TextInput, useWindowDimensions,
} from 'react-native';
import { Delete, ChevronLeft, AlertCircle } from 'lucide-react-native';
import { colors } from '@/src/lib/colors';
import JulabaLogo from './JulabaLogo';

interface PinInputProps {
    mode: 'login' | 'lock';
    phoneNumber?: string;
    userName?: string;
    onVerify: (pin: string) => Promise<boolean>;
    onSuccess: () => void;
    onForgot?: () => void;
    onBack?: () => void;
}

function maskPhone(phone: string): string {
    if (!phone) return '';
    const digits = phone.replace(/\D/g, '');
    if (digits.length < 6) return `\u{1F4F1} ${phone}`;
    const first5 = digits.slice(0, 5);
    const last2 = digits.slice(-2);
    const formatted = first5.replace(/(\d{2})(?=\d)/g, '$1 ');
    return `\u{1F4F1} ${formatted}\u2022\u2022\u2022${last2}`;
}

export default function PinInput({
    mode,
    phoneNumber,
    onVerify,
    onSuccess,
    onForgot,
    onBack,
}: PinInputProps) {
    const [pin, setPin] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const [pressedKey, setPressedKey] = useState<string | null>(null);
    const [dotState, setDotState] = useState<'normal' | 'error' | 'success'>('normal');

    const shakeAnim = useRef(new Animated.Value(0)).current;
    const dotScales = useRef([0, 1, 2, 3].map(() => new Animated.Value(1))).current;
    const errorOpacity = useRef(new Animated.Value(0)).current;
    const resetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Animations d'entrée staggerées
    const entranceLogo = useRef(new Animated.Value(0)).current;
    const entranceText = useRef(new Animated.Value(0)).current;
    const entranceDots = useRef(new Animated.Value(0)).current;
    const entranceNumpad = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        Animated.stagger(100, [
            Animated.timing(entranceLogo, { toValue: 1, duration: 400, useNativeDriver: Platform.OS !== 'web' }),
            Animated.timing(entranceText, { toValue: 1, duration: 400, useNativeDriver: Platform.OS !== 'web' }),
            Animated.timing(entranceDots, { toValue: 1, duration: 400, useNativeDriver: Platform.OS !== 'web' }),
            Animated.timing(entranceNumpad, { toValue: 1, duration: 400, useNativeDriver: Platform.OS !== 'web' }),
        ]).start();
    }, []);

    // Nettoyage des timers au démontage
    useEffect(() => () => {
        if (resetTimer.current) clearTimeout(resetTimer.current);
        if (flashTimer.current) clearTimeout(flashTimer.current);
    }, []);

    const shake = useCallback(() => {
        Animated.sequence([
            Animated.timing(shakeAnim, { toValue: 10, duration: 50, useNativeDriver: Platform.OS !== 'web' }),
            Animated.timing(shakeAnim, { toValue: -10, duration: 50, useNativeDriver: Platform.OS !== 'web' }),
            Animated.timing(shakeAnim, { toValue: 8, duration: 55, useNativeDriver: Platform.OS !== 'web' }),
            Animated.timing(shakeAnim, { toValue: -8, duration: 55, useNativeDriver: Platform.OS !== 'web' }),
            Animated.timing(shakeAnim, { toValue: 0, duration: 50, useNativeDriver: Platform.OS !== 'web' }),
        ]).start();
    }, [shakeAnim]);

    const bounceDot = useCallback((index: number) => {
        Animated.sequence([
            Animated.timing(dotScales[index], { toValue: 1.5, duration: 120, useNativeDriver: Platform.OS !== 'web' }),
            Animated.timing(dotScales[index], { toValue: 1.0, duration: 120, useNativeDriver: Platform.OS !== 'web' }),
        ]).start();
    }, [dotScales]);

    const successAnimation = useCallback(() => {
        setDotState('success');
        Animated.stagger(80, dotScales.map(scale =>
            Animated.sequence([
                Animated.timing(scale, { toValue: 1.4, duration: 150, useNativeDriver: Platform.OS !== 'web' }),
                Animated.timing(scale, { toValue: 1.0, duration: 150, useNativeDriver: Platform.OS !== 'web' }),
            ])
        )).start();
    }, [dotScales]);

    const showError = useCallback((msg: string) => {
        setError(msg);
        errorOpacity.setValue(0);
        Animated.timing(errorOpacity, { toValue: 1, duration: 200, useNativeDriver: Platform.OS !== 'web' }).start();
    }, [errorOpacity]);

    const handleDigit = useCallback(async (digit: string) => {
        if (loading || pin.length >= 4) return;

        setPressedKey(digit);
        flashTimer.current = setTimeout(() => setPressedKey(null), 200);

        const newPin = pin + digit;
        setPin(newPin);
        setError('');
        setDotState('normal');
        bounceDot(pin.length);
        Vibration.vibrate(20);

        if (newPin.length === 4) {
            setLoading(true);
            const ok = await onVerify(newPin);
            setLoading(false);
            if (ok) {
                successAnimation();
                setTimeout(() => onSuccess(), 400);
            } else {
                setDotState('error');
                shake();
                Vibration.vibrate(200);
                showError('Code incorrect');
                resetTimer.current = setTimeout(() => {
                    setPin('');
                    setDotState('normal');
                    setError('');
                    errorOpacity.setValue(0);
                }, 500);
            }
        }
    }, [pin, loading, onVerify, onSuccess, shake, bounceDot, successAnimation, showError, errorOpacity]);

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
                'Code oublie',
                'Contactez votre administrateur pour reinitialiser votre code secret.'
            );
        }
    };

    const titleText = mode === 'lock'
        ? 'Votre code secret est requis'
        : 'Saisissez votre code PIN';
    const subtitleText = mode === 'lock'
        ? 'pour deverrouiller'
        : 'pour continuer';

    const dotColor = dotState === 'error' ? colors.error
        : dotState === 'success' ? colors.success
        : colors.primary;

    // -- Rendu des dots circulaires --
    const renderDots = () => (
        <Animated.View style={[styles.dotsRow, { transform: [{ translateX: shakeAnim }] }]}>
            {[0, 1, 2, 3].map(i => (
                <Animated.View
                    key={i}
                    style={[
                        styles.dot,
                        i < pin.length && { backgroundColor: dotColor },
                        { transform: [{ scale: dotScales[i] }] },
                    ]}
                />
            ))}
        </Animated.View>
    );

    // -- Rendu du numpad circulaire --
    const renderNumpad = () => (
        <View style={styles.numpad}>
            {([[1, 2, 3], [4, 5, 6], [7, 8, 9]] as number[][]).map((row, ri) => (
                <View key={ri} style={styles.row}>
                    {row.map(num => (
                        <TouchableOpacity
                            key={num}
                            style={[
                                styles.key,
                                pressedKey === String(num) && styles.keyPressed,
                            ]}
                            onPress={() => handleDigit(String(num))}
                            disabled={loading || pin.length >= 4}
                            activeOpacity={0.7}
                        >
                            <Text style={styles.keyText}>{num}</Text>
                        </TouchableOpacity>
                    ))}
                </View>
            ))}
            <View style={styles.row}>
                <TouchableOpacity style={styles.key} onPress={handleForgot} activeOpacity={0.7}>
                    <Text style={styles.forgotText}>Oublie?</Text>
                </TouchableOpacity>
                <TouchableOpacity
                    style={[styles.key, pressedKey === '0' && styles.keyPressed]}
                    onPress={() => handleDigit('0')}
                    disabled={loading || pin.length >= 4}
                    activeOpacity={0.7}
                >
                    <Text style={styles.keyText}>0</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.key} onPress={handleDelete} activeOpacity={0.7}>
                    <Delete size={24} color="#1F2937" />
                </TouchableOpacity>
            </View>
        </View>
    );

    // -- Layout desktop --
    const { width } = useWindowDimensions();
    const isDesktop = Platform.OS === 'web' && width > 768;

    const handleDesktopChange = useCallback(async (text: string) => {
        const digits = text.replace(/[^0-9]/g, '').slice(0, 4);
        if (digits.length > pin.length) {
            bounceDot(digits.length - 1);
        }
        setPin(digits);
        setError('');
        setDotState('normal');
        if (digits.length === 4) {
            setLoading(true);
            const ok = await onVerify(digits);
            setLoading(false);
            if (ok) {
                successAnimation();
                setTimeout(() => onSuccess(), 400);
            } else {
                setDotState('error');
                shake();
                showError('Code incorrect');
                resetTimer.current = setTimeout(() => {
                    setPin('');
                    setDotState('normal');
                    setError('');
                    errorOpacity.setValue(0);
                }, 500);
            }
        }
    }, [pin, onVerify, onSuccess, bounceDot, successAnimation, shake, showError, errorOpacity]);

    const hiddenInputRef = useRef<TextInput>(null);

    if (isDesktop) {
        return (
            <View style={dt.overlay}>
                <Animated.View style={[dt.card, {
                    opacity: entranceLogo,
                    transform: [{ translateY: entranceLogo.interpolate({
                        inputRange: [0, 1], outputRange: [20, 0],
                    }) }],
                }]}>
                    <Text style={dt.title}>{titleText}</Text>
                    <Text style={dt.subtitle}>{subtitleText}</Text>

                    {/* Numero masque + modifier */}
                    {onBack && phoneNumber && (
                        <TouchableOpacity onPress={onBack} activeOpacity={0.7} style={dt.phoneRow}>
                            <Text style={dt.phoneFlag}>🇨🇮</Text>
                            <Text style={dt.phoneText}>{phoneNumber}</Text>
                            <Text style={dt.phoneChange}>Modifier</Text>
                        </TouchableOpacity>
                    )}

                    {/* Dots — clic refocus le champ cache */}
                    <TouchableOpacity activeOpacity={1} onPress={() => hiddenInputRef.current?.focus()}>
                        <Animated.View style={[dt.dotsRow, { transform: [{ translateX: shakeAnim }] }]}>
                            {[0, 1, 2, 3].map(i => (
                                <Animated.View
                                    key={i}
                                    style={[
                                        dt.dot,
                                        i < pin.length && { backgroundColor: dotColor, borderColor: dotColor },
                                        { transform: [{ scale: dotScales[i] }] },
                                    ]}
                                />
                            ))}
                        </Animated.View>
                    </TouchableOpacity>

                    {/* Indication clavier */}
                    <Text style={dt.hint}>Tapez votre code au clavier</Text>

                    {/* TextInput invisible pour capture clavier */}
                    <TextInput
                        ref={hiddenInputRef}
                        value={pin}
                        onChangeText={handleDesktopChange}
                        maxLength={4}
                        autoFocus={true}
                        keyboardType="numeric"
                        editable={!loading}
                        style={{ position: 'absolute', opacity: 0, height: 0, width: 0, outlineStyle: 'none', outlineWidth: 0 } as any}
                    />

                    {/* Erreur / loading */}
                    <View style={dt.errorSlot}>
                        {loading ? (
                            <ActivityIndicator color={colors.primary} size="small" />
                        ) : error ? (
                            <Animated.View style={[dt.errorRow, { opacity: errorOpacity }]}>
                                <AlertCircle size={14} color={colors.error} />
                                <Text style={dt.errorText}>{error}</Text>
                            </Animated.View>
                        ) : null}
                    </View>

                    {/* Code oublie */}
                    {onForgot && (
                        <TouchableOpacity onPress={handleForgot} activeOpacity={0.7}>
                            <Text style={dt.forgot}>Code oublié ?</Text>
                        </TouchableOpacity>
                    )}
                </Animated.View>
            </View>
        );
    }

    // -- Layout mobile --
    return (
        <View style={styles.container}>
            {/* Bouton retour + numero masque */}
            {onBack && phoneNumber ? (
                <TouchableOpacity style={styles.backRow} onPress={onBack} activeOpacity={0.7}>
                    <ChevronLeft color={colors.primary} size={18} />
                    <Text style={styles.backText}>{maskPhone(phoneNumber)}</Text>
                    <Text style={styles.backChange}>Modifier</Text>
                </TouchableOpacity>
            ) : phoneNumber ? (
                <View style={styles.phoneTopRight}>
                    <Text style={styles.phoneText}>{maskPhone(phoneNumber)}</Text>
                </View>
            ) : null}

            {/* Zone principale */}
            <View style={styles.mainContent}>
                <Animated.View style={{
                    opacity: entranceLogo,
                    transform: [{ translateY: entranceLogo.interpolate({
                        inputRange: [0, 1], outputRange: [15, 0],
                    }) }],
                }}>
                    <View style={styles.logo}>
                        <JulabaLogo width={60} />
                    </View>
                </Animated.View>

                <Animated.View style={[styles.titleBlock, {
                    opacity: entranceText,
                    transform: [{ translateY: entranceText.interpolate({
                        inputRange: [0, 1], outputRange: [15, 0],
                    }) }],
                }]}>
                    <Text style={styles.title}>{titleText}</Text>
                    <Text style={styles.subtitle}>{subtitleText}</Text>
                </Animated.View>

                <Animated.View style={{
                    opacity: entranceDots,
                    transform: [{ translateY: entranceDots.interpolate({
                        inputRange: [0, 1], outputRange: [15, 0],
                    }) }],
                }}>
                    {renderDots()}
                </Animated.View>

                {/* Slot erreur */}
                <View style={styles.errorSlot}>
                    {loading ? (
                        <ActivityIndicator color={colors.primary} size="small" />
                    ) : error ? (
                        <Animated.View style={[styles.errorRow, { opacity: errorOpacity }]}>
                            <AlertCircle size={14} color={colors.error} />
                            <Text style={styles.errorText}>{error}</Text>
                        </Animated.View>
                    ) : null}
                </View>
            </View>

            {/* Numpad avec animation d'entree */}
            <Animated.View style={{
                opacity: entranceNumpad,
                transform: [{ translateY: entranceNumpad.interpolate({
                    inputRange: [0, 1], outputRange: [30, 0],
                }) }],
            }}>
                {renderNumpad()}
            </Animated.View>
        </View>
    );
}

const dt = StyleSheet.create({
    overlay: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    card: {
        width: 360,
        backgroundColor: '#FFFFFF',
        borderRadius: 12,
        borderWidth: 0,
        padding: 32,
        alignItems: 'center',
        outlineStyle: 'none',
        outlineWidth: 0,
        ...(Platform.OS === 'web'
            ? { boxShadow: '0 4px 16px rgba(0,0,0,0.08)' }
            : { shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.08, shadowRadius: 16, elevation: 6 }),
    } as any,
    title: {
        fontSize: 22,
        fontWeight: '800',
        color: '#1E1E1E',
        marginBottom: 4,
    },
    subtitle: {
        fontSize: 14,
        color: '#9CA3AF',
        marginBottom: 16,
    },
    phoneRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 20,
        backgroundColor: '#F3F4F6',
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 12,
        gap: 6,
    },
    phoneFlag: {
        fontSize: 14,
    },
    phoneText: {
        fontSize: 13,
        fontWeight: '500',
        color: '#6B7280',
    },
    phoneChange: {
        fontSize: 12,
        color: colors.primary,
        fontWeight: '600',
        marginLeft: 4,
    },
    dotsRow: {
        flexDirection: 'row',
        gap: 20,
        alignItems: 'center',
    },
    dot: {
        width: 14,
        height: 14,
        borderRadius: 7,
        backgroundColor: 'transparent',
        borderWidth: 2,
        borderColor: '#D1D5DB',
    },
    errorSlot: {
        height: 24,
        alignItems: 'center',
        justifyContent: 'center',
        marginTop: 8,
    },
    errorRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
    errorText: {
        fontSize: 13,
        color: colors.error,
        fontWeight: '500',
    },
    hint: {
        fontSize: 12,
        color: '#9CA3AF',
        marginTop: 12,
    },
    forgot: {
        fontSize: 13,
        color: colors.primary,
        fontWeight: '700',
        marginTop: 20,
    },
});

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#FFFFFF',
    },
    backRow: {
        flexDirection: 'row',
        alignItems: 'center',
        alignSelf: 'flex-start',
        paddingHorizontal: 16,
        paddingTop: 16,
        paddingBottom: 4,
        gap: 4,
    },
    backText: {
        fontSize: 13,
        fontWeight: '600',
        color: colors.primary,
    },
    backChange: {
        fontSize: 13,
        fontWeight: '400',
        color: '#94a3b8',
        marginLeft: 4,
    },
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
    mainContent: {
        flex: 1,
        alignItems: 'center',
    },
    logo: {
        marginTop: 40,
    },
    titleBlock: {
        marginTop: 32,
        alignItems: 'center',
    },
    title: {
        fontSize: 17,
        fontWeight: '600',
        color: '#1F2937',
        textAlign: 'center',
    },
    subtitle: {
        fontSize: 15,
        fontWeight: '400',
        color: '#6B7280',
        textAlign: 'center',
        marginTop: 4,
    },
    dotsRow: {
        flexDirection: 'row',
        marginTop: 40,
        gap: 20,
        alignItems: 'center',
    },
    dot: {
        width: 16,
        height: 16,
        borderRadius: 8,
        backgroundColor: '#D1D5DB',
    },
    errorSlot: {
        height: 28,
        alignItems: 'center',
        justifyContent: 'center',
        marginTop: 14,
    },
    errorRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
    errorText: {
        fontSize: 13,
        color: colors.error,
        fontWeight: '500',
    },
    numpad: {
        alignItems: 'center',
        gap: 12,
        paddingBottom: 40,
    },
    row: {
        flexDirection: 'row',
        gap: 24,
    },
    key: {
        width: 64,
        height: 64,
        borderRadius: 12,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'transparent',
    },
    keyPressed: {
        backgroundColor: colors.primaryBg,
    },
    keyText: {
        fontSize: 28,
        fontWeight: '300',
        color: '#1F2937',
    },
    forgotText: {
        fontSize: 11,
        fontWeight: '600',
        color: colors.primary,
        letterSpacing: 0.5,
    },
});
