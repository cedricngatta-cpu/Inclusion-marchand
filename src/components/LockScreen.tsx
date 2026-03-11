// Écran de verrouillage — apparaît après 60s d'inactivité
// Overlay blanc par-dessus l'app, même design minimaliste que le login
import React from 'react';
import { View, StyleSheet, TouchableOpacity, Text, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '@/src/context/AuthContext';
import PinInput from '@/src/components/PinInput';

export default function LockScreen() {
    const { user, isLocked, unlock, logout } = useAuth();

    if (!isLocked) return null;

    const handleForgot = () => {
        Alert.alert(
            'Accès bloqué',
            'Vous pouvez vous déconnecter pour accéder à un autre compte.',
            [
                { text: 'Annuler', style: 'cancel' },
                { text: 'Se déconnecter', onPress: logout, style: 'destructive' },
            ]
        );
    };

    return (
        <View style={styles.overlay}>
            <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
                <PinInput
                    mode="lock"
                    phoneNumber={user?.phoneNumber}
                    userName={user?.name}
                    onVerify={unlock}
                    onSuccess={() => {}}
                    onForgot={handleForgot}
                />
            </SafeAreaView>
        </View>
    );
}

const styles = StyleSheet.create({
    overlay: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 9997,
        backgroundColor: '#FFFFFF',
    },
    safe: {
        flex: 1,
    },
});
