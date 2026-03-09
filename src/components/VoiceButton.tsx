// Bouton micro flottant — présent sur tous les écrans
import React, { useState, useRef } from 'react';
import { TouchableOpacity, StyleSheet, Animated } from 'react-native';
import { Mic } from 'lucide-react-native';
import { colors } from '@/src/lib/colors';
import VoiceModal from './VoiceModal';

export default function VoiceButton() {
    const [modalOpen, setModalOpen] = useState(false);
    const scale = useRef(new Animated.Value(1)).current;

    function handlePressIn() {
        Animated.spring(scale, { toValue: 0.92, useNativeDriver: true }).start();
    }

    function handlePressOut() {
        Animated.spring(scale, { toValue: 1, useNativeDriver: true }).start();
    }

    return (
        <>
            <Animated.View style={[styles.wrapper, { transform: [{ scale }] }]}>
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
