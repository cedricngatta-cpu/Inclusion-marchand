// Modal de changement de PIN — bloquant (mustChangePin) ou optionnel (profil)
import React, { useState } from 'react';
import {
    Modal, View, Text, StyleSheet, TouchableOpacity,
    ActivityIndicator, Platform,
} from 'react-native';
import { Lock, X, ChevronLeft } from 'lucide-react-native';
import { useAuth } from '@/src/context/AuthContext';

const BLOCKED_PINS = ['0101', '0000', '1234', '1111', '0000'];

interface Props {
    visible: boolean;
    canCancel?: boolean;     // false = bloquant (PIN oublié), true = optionnel (profil)
    onClose?: () => void;    // appelé seulement si canCancel=true
}

type Step = 'current' | 'new' | 'confirm';

export const ChangePinModal: React.FC<Props> = ({ visible, canCancel = false, onClose }) => {
    const { updatePin, setMustChangePin } = useAuth();

    const [step, setStep]           = useState<Step>(canCancel ? 'current' : 'new');
    const [currentPin, setCurrentPin] = useState('');
    const [newPin, setNewPin]       = useState('');
    const [confirmPin, setConfirmPin] = useState('');
    const [error, setError]         = useState('');
    const [loading, setLoading]     = useState(false);
    const [success, setSuccess]     = useState(false);

    const activeValue = step === 'current' ? currentPin
        : step === 'new' ? newPin : confirmPin;

    const setActiveValue = (v: string) => {
        if (step === 'current') setCurrentPin(v);
        else if (step === 'new') setNewPin(v);
        else setConfirmPin(v);
    };

    const reset = () => {
        setStep(canCancel ? 'current' : 'new');
        setCurrentPin('');
        setNewPin('');
        setConfirmPin('');
        setError('');
        setSuccess(false);
    };

    const handleClose = () => {
        if (!canCancel) return;
        reset();
        onClose?.();
    };

    const handleDigit = (d: string) => {
        if (activeValue.length >= 4) return;
        setError('');
        setActiveValue(activeValue + d);
    };

    const handleDelete = () => {
        setError('');
        setActiveValue(activeValue.slice(0, -1));
    };

    const handleNext = async () => {
        if (activeValue.length < 4) {
            setError('Le PIN doit contenir 4 chiffres.');
            return;
        }

        if (step === 'current') {
            // Vérification optionnelle côté client (l'ancien PIN est vérifié via AuthContext updatePin)
            setStep('new');
            return;
        }

        if (step === 'new') {
            if (BLOCKED_PINS.includes(newPin)) {
                setError('Ce PIN est trop simple. Choisissez-en un autre.');
                return;
            }
            setStep('confirm');
            return;
        }

        // step === 'confirm'
        if (confirmPin !== newPin) {
            setError('Les PINs ne correspondent pas.');
            setConfirmPin('');
            return;
        }

        setLoading(true);
        const ok = await updatePin(newPin);
        setLoading(false);

        if (ok) {
            setSuccess(true);
            setMustChangePin(false);
            setTimeout(() => {
                reset();
                onClose?.();
            }, 1800);
        } else {
            setError('Impossible de modifier le PIN. Réessayez.');
        }
    };

    const stepTitle: Record<Step, string> = {
        current: 'Ancien PIN',
        new:     'Nouveau PIN',
        confirm: 'Confirmer',
    };
    const stepHint: Record<Step, string> = {
        current: 'Entrez votre PIN actuel',
        new:     'Choisissez un nouveau PIN à 4 chiffres',
        confirm: 'Confirmez votre nouveau PIN',
    };

    return (
        <Modal
            visible={visible}
            transparent
            animationType="slide"
            statusBarTranslucent
            onRequestClose={handleClose}
        >
            <View style={s.overlay}>
                <View style={s.sheet}>
                    {/* Header */}
                    <View style={s.header}>
                        {step !== (canCancel ? 'current' : 'new') && !success ? (
                            <TouchableOpacity
                                style={s.backBtn}
                                onPress={() => {
                                    setError('');
                                    if (step === 'confirm') { setConfirmPin(''); setStep('new'); }
                                    else if (step === 'new' && canCancel) { setNewPin(''); setStep('current'); }
                                }}
                            >
                                <ChevronLeft color="#059669" size={20} />
                            </TouchableOpacity>
                        ) : (
                            <View style={{ width: 44 }} />
                        )}

                        <View style={s.lockIcon}>
                            <Lock color="#059669" size={22} />
                        </View>

                        {canCancel ? (
                            <TouchableOpacity style={s.closeBtn} onPress={handleClose}>
                                <X color="#64748b" size={20} />
                            </TouchableOpacity>
                        ) : (
                            <View style={{ width: 44 }} />
                        )}
                    </View>

                    {success ? (
                        <View style={s.successBox}>
                            <Text style={s.successIcon}>✓</Text>
                            <Text style={s.successTitle}>PIN modifié !</Text>
                            <Text style={s.successSub}>Votre nouveau PIN est actif.</Text>
                        </View>
                    ) : (
                        <>
                            <Text style={s.title}>{stepTitle[step]}</Text>
                            <Text style={s.hint}>{stepHint[step]}</Text>

                            {/* Pastilles PIN */}
                            <View style={s.dotsRow}>
                                {[0, 1, 2, 3].map(i => (
                                    <View
                                        key={i}
                                        style={[
                                            s.dot,
                                            i < activeValue.length && s.dotFilled,
                                        ]}
                                    />
                                ))}
                            </View>

                            {error ? <Text style={s.errorText}>{error}</Text> : null}

                            {/* Clavier */}
                            <View style={s.keypad}>
                                {['1','2','3','4','5','6','7','8','9','','0','⌫'].map((k, i) => (
                                    <TouchableOpacity
                                        key={i}
                                        style={[s.key, k === '' && s.keyEmpty]}
                                        onPress={() => {
                                            if (k === '⌫') handleDelete();
                                            else if (k !== '') handleDigit(k);
                                        }}
                                        disabled={k === ''}
                                        activeOpacity={0.7}
                                    >
                                        <Text style={[s.keyText, k === '⌫' && s.keyBackspace]}>
                                            {k}
                                        </Text>
                                    </TouchableOpacity>
                                ))}
                            </View>

                            {/* Bouton valider */}
                            <TouchableOpacity
                                style={[s.submitBtn, activeValue.length < 4 && s.submitBtnDisabled]}
                                onPress={handleNext}
                                disabled={activeValue.length < 4 || loading}
                                activeOpacity={0.85}
                            >
                                {loading
                                    ? <ActivityIndicator color="#fff" size="small" />
                                    : <Text style={s.submitText}>
                                        {step === 'confirm' ? 'VALIDER' : 'SUIVANT'}
                                    </Text>
                                }
                            </TouchableOpacity>

                            {!canCancel && (
                                <Text style={s.forcedNote}>
                                    Vous devez créer un nouveau PIN pour continuer.
                                </Text>
                            )}
                        </>
                    )}
                </View>
            </View>
        </Modal>
    );
};

const s = StyleSheet.create({
    overlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.55)',
        justifyContent: 'flex-end',
    },
    sheet: {
        backgroundColor: '#fff',
        borderTopLeftRadius: 20,
        borderTopRightRadius: 20,
        paddingBottom: Platform.OS === 'ios' ? 40 : 24,
        paddingHorizontal: 24,
        paddingTop: 8,
        alignItems: 'center',
    },
    header: {
        width: '100%',
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 12,
    },
    backBtn: {
        width: 44, height: 44,
        alignItems: 'center', justifyContent: 'center',
    },
    closeBtn: {
        width: 44, height: 44,
        alignItems: 'center', justifyContent: 'center',
    },
    lockIcon: {
        width: 52, height: 52,
        borderRadius: 12,
        backgroundColor: '#ecfdf5',
        alignItems: 'center', justifyContent: 'center',
    },
    title: {
        fontSize: 20, fontWeight: '800', color: '#1e293b',
        marginBottom: 4,
    },
    hint: {
        fontSize: 13, color: '#64748b', marginBottom: 24, textAlign: 'center',
    },
    dotsRow: {
        flexDirection: 'row', gap: 16, marginBottom: 12,
    },
    dot: {
        width: 16, height: 16, borderRadius: 8,
        borderWidth: 2, borderColor: '#cbd5e1',
        backgroundColor: 'transparent',
    },
    dotFilled: {
        backgroundColor: '#059669', borderColor: '#059669',
    },
    errorText: {
        fontSize: 12, color: '#dc2626', marginBottom: 12, textAlign: 'center',
    },
    keypad: {
        flexDirection: 'row', flexWrap: 'wrap',
        width: 240, gap: 0,
        marginBottom: 20,
    },
    key: {
        width: 80, height: 60,
        alignItems: 'center', justifyContent: 'center',
    },
    keyEmpty: { opacity: 0 },
    keyText: {
        fontSize: 22, fontWeight: '700', color: '#1e293b',
    },
    keyBackspace: {
        fontSize: 18, color: '#64748b',
    },
    submitBtn: {
        width: '100%', height: 52, borderRadius: 10,
        backgroundColor: '#059669',
        alignItems: 'center', justifyContent: 'center',
    },
    submitBtnDisabled: {
        backgroundColor: '#d1fae5',
    },
    submitText: {
        fontSize: 14, fontWeight: '800', color: '#fff', letterSpacing: 1,
    },
    forcedNote: {
        fontSize: 11, color: '#94a3b8', marginTop: 12, textAlign: 'center',
    },
    successBox: {
        alignItems: 'center', paddingVertical: 32,
    },
    successIcon: {
        fontSize: 52, color: '#059669', marginBottom: 12,
    },
    successTitle: {
        fontSize: 22, fontWeight: '800', color: '#059669', marginBottom: 4,
    },
    successSub: {
        fontSize: 14, color: '#64748b',
    },
});
