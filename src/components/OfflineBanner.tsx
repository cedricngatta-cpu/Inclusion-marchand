// Bandeau "Hors ligne" — affiché en overlay quand pas de connexion
import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Animated, Platform, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { WifiOff, Wifi } from 'lucide-react-native';
import { useNetwork } from '@/src/context/NetworkContext';
import { colors } from '@/src/lib/colors';

export default function OfflineBanner() {
    const { isOnline, pendingCount }  = useNetwork();
    const insets        = useSafeAreaInsets();
    const translateY    = useRef(new Animated.Value(-80)).current;
    const hideTimer     = useRef<ReturnType<typeof setTimeout> | null>(null);
    const [visible, setVisible]     = useState(false);
    const [reconnected, setReconnected] = useState(false);

    useEffect(() => {
        if (!isOnline) {
            // Afficher le bandeau "Hors ligne"
            if (hideTimer.current) { clearTimeout(hideTimer.current); hideTimer.current = null; }
            setReconnected(false);
            setVisible(true);
            Animated.spring(translateY, {
                toValue: 0,
                useNativeDriver: Platform.OS !== 'web',
                tension: 80,
                friction: 10,
            }).start();
        } else if (visible) {
            // Montrer brièvement "Reconnecté" avant de masquer
            setReconnected(true);
            hideTimer.current = setTimeout(() => {
                Animated.timing(translateY, {
                    toValue: -80,
                    duration: 350,
                    useNativeDriver: Platform.OS !== 'web',
                }).start(() => {
                    setVisible(false);
                    setReconnected(false);
                });
            }, 1500);
        }
        return () => {
            if (hideTimer.current) { clearTimeout(hideTimer.current); hideTimer.current = null; }
        };
    }, [isOnline]);

    if (!visible) return null;

    const paddingTop = insets.top + 8;

    return (
        <Animated.View
            style={[
                styles.banner,
                reconnected ? styles.bannerOnline : styles.bannerOffline,
                { transform: [{ translateY }], paddingTop },
            ]}
        >
            {reconnected ? (
                <>
                    <Wifi color="#fff" size={15} />
                    <Text style={styles.text}>RECONNECTÉ — Synchronisation en cours...</Text>
                </>
            ) : (
                <>
                    <WifiOff color="#fff" size={15} />
                    <Text style={styles.text}>
                        {pendingCount > 0
                            ? `HORS LIGNE — ${pendingCount} opération(s) en attente`
                            : 'HORS LIGNE — Données sauvegardées localement'
                        }
                    </Text>
                </>
            )}
        </Animated.View>
    );
}

const styles = StyleSheet.create({
    banner: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        zIndex: 9999,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingBottom: 10,
        paddingHorizontal: 16,
        gap: 8,
    },
    bannerOffline: { backgroundColor: '#b45309' },
    bannerOnline:  { backgroundColor: colors.primary },
    text: {
        color: '#fff',
        fontSize: 11,
        fontWeight: '700',
        letterSpacing: 0.4,
    },
});
