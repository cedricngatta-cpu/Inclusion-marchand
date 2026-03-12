// Bouton micro flottant — présent sur tous les écrans
// Masqué automatiquement pendant la vente manuelle (scanner, panier, clavier)
import React, { useState, useRef, useEffect } from 'react';
import { TouchableOpacity, StyleSheet, Animated, Keyboard, Platform } from 'react-native';
import { Mic } from 'lucide-react-native';
import { colors } from '@/src/lib/colors';
import { useVoiceButton } from '@/src/context/VoiceButtonContext';
import { useAuth } from '@/src/context/AuthContext';
import { isWeb } from '@/src/lib/platform';
import { isWebSpeechSupported } from '@/src/lib/webSpeech';
import VoiceModal from './VoiceModal';

export default function VoiceButton() {
    const [modalOpen, setModalOpen] = useState(false);
    const [keyboardVisible, setKeyboardVisible] = useState(false);
    const scale = useRef(new Animated.Value(1)).current;
    const { voiceButtonVisible } = useVoiceButton();
    const { user } = useAuth();

    // Masquer quand le clavier est ouvert (saisie nom client, etc.)
    useEffect(() => {
        const showSub = Keyboard.addListener('keyboardDidShow', () => setKeyboardVisible(true));
        const hideSub = Keyboard.addListener('keyboardDidHide', () => setKeyboardVisible(false));
        return () => { showSub.remove(); hideSub.remove(); };
    }, []);

    // Sur web : afficher uniquement si Web Speech API est supportée par le navigateur
    if (isWeb && !isWebSpeechSupported()) return null;

    // Garde défensive : ne rien afficher si pas authentifié
    if (!user) return null;

    // Ne pas rendre si masqué par le contexte (scanner, panier) ou par le clavier
    if (!voiceButtonVisible || keyboardVisible) return null;

    function handlePressIn() {
        Animated.spring(scale, { toValue: 0.92, useNativeDriver: true }).start();
    }

    function handlePressOut() {
        Animated.spring(scale, { toValue: 1, useNativeDriver: true }).start();
    }

    return (
        <>
            <Animated.View style={[
                styles.wrapper,
                { transform: [{ scale }] },
            ]}>
                <TouchableOpacity
                    style={styles.btn}
                    onPress={() => setModalOpen(true)}
                    onPressIn={handlePressIn}
                    onPressOut={handlePressOut}
                    activeOpacity={0.9}
                >
                    <Mic color="#fff" size={28} />
                </TouchableOpacity>
            </Animated.View>

            <VoiceModal visible={modalOpen} onClose={() => setModalOpen(false)} />
        </>
    );
}

const styles = StyleSheet.create({
    wrapper: {
        position: 'absolute',
        bottom: 16,
        right: 20,
        zIndex: 999,
    },
    btn: {
        width: 56, height: 56, borderRadius: 10,
        backgroundColor: colors.primary,
        alignItems: 'center', justifyContent: 'center',
        elevation: 6,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 3 },
        shadowOpacity: 0.25,
        shadowRadius: 6,
    },
});
