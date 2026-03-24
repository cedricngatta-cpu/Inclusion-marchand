// Bouton micro flottant — visible uniquement sur les dashboards et pages principales
// Masqué sur vendre, scanner, profil, notifications, auth, formulaires
import React, { useState, useRef, useEffect } from 'react';
import { TouchableOpacity, StyleSheet, Animated, Keyboard, Platform } from 'react-native';
import { usePathname } from 'expo-router';
import { Mic } from 'lucide-react-native';
import { colors } from '@/src/lib/colors';
import { useVoiceButton } from '@/src/context/VoiceButtonContext';
import { useAuth } from '@/src/context/AuthContext';
import { isWeb } from '@/src/lib/platform';
import { isMediaRecorderAvailable } from '@/src/lib/webAudioRecorder';
import { isWebSpeechSupported } from '@/src/lib/webSpeech';
import VoiceModal from './VoiceModal';

// Pages où le bouton micro doit apparaître
const VOICE_PAGES = [
    '/commercant',
    '/stock',
    '/bilan',
    '/revenus',
    '/carnet',
    '/finance',
    '/marche',
    '/achats-groupes',
    '/mes-commandes',
    '/producteur',
    '/agent',
    '/cooperative',
    '/admin',
];

export default function VoiceButton() {
    const [modalOpen, setModalOpen] = useState(false);
    const [keyboardVisible, setKeyboardVisible] = useState(false);
    const scale = useRef(new Animated.Value(1)).current;
    const { voiceButtonVisible } = useVoiceButton();
    const { user } = useAuth();
    const pathname = usePathname();

    // Masquer quand le clavier est ouvert (saisie nom client, etc.)
    useEffect(() => {
        const showSub = Keyboard.addListener('keyboardDidShow', () => setKeyboardVisible(true));
        const hideSub = Keyboard.addListener('keyboardDidHide', () => setKeyboardVisible(false));
        return () => { showSub.remove(); hideSub.remove(); };
    }, []);

    // Sur web : afficher si MediaRecorder OU Web Speech API est disponible
    if (isWeb && !isMediaRecorderAvailable() && !isWebSpeechSupported()) return null;

    // Garde défensive : ne rien afficher si pas authentifié
    if (!user) return null;

    // Vérifier si la page courante est dans la liste autorisée
    const shouldShow = VOICE_PAGES.some(p => pathname === p || pathname.startsWith(p + '/'));
    if (!shouldShow) return null;

    // Ne pas rendre si masqué par le contexte (scanner, panier) ou par le clavier
    if (!voiceButtonVisible || keyboardVisible) return null;

    function handlePressIn() {
        Animated.spring(scale, { toValue: 0.92, useNativeDriver: Platform.OS !== 'web' }).start();
    }

    function handlePressOut() {
        Animated.spring(scale, { toValue: 1, useNativeDriver: Platform.OS !== 'web' }).start();
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
        bottom: 30,
        right: 20,
        zIndex: 100,
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
