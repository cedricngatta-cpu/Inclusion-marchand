// Bandeau "Hors ligne" — overlay avec état de synchronisation
import React, { useEffect, useRef, useState } from 'react';
import { Animated, Platform, StyleSheet, Text, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { WifiOff, Wifi, Check, AlertTriangle } from 'lucide-react-native';
import { useNetwork } from '@/src/context/NetworkContext';
import { colors } from '@/src/lib/colors';

export default function OfflineBanner() {
    const { isOnline, pendingCount, syncState, syncResult } = useNetwork();
    const insets     = useSafeAreaInsets();
    const translateY = useRef(new Animated.Value(-80)).current;
    const hideTimer  = useRef<ReturnType<typeof setTimeout> | null>(null);
    const [visible, setVisible] = useState(false);

    // Phase actuelle du bandeau
    type BannerPhase = 'offline' | 'syncing' | 'done' | 'error';
    const [phase, setPhase] = useState<BannerPhase>('offline');

    const clearTimer = () => {
        if (hideTimer.current) { clearTimeout(hideTimer.current); hideTimer.current = null; }
    };

    const slideIn = () => {
        setVisible(true);
        Animated.spring(translateY, {
            toValue: 0,
            useNativeDriver: Platform.OS !== 'web',
            tension: 80,
            friction: 10,
        }).start();
    };

    const slideOut = (delay = 0) => {
        hideTimer.current = setTimeout(() => {
            Animated.timing(translateY, {
                toValue: -80,
                duration: 350,
                useNativeDriver: Platform.OS !== 'web',
            }).start(() => {
                setVisible(false);
                setPhase('offline');
            });
        }, delay);
    };

    // Réagir aux changements de connectivité
    useEffect(() => {
        clearTimer();
        if (!isOnline) {
            setPhase('offline');
            slideIn();
        } else if (visible && phase === 'offline') {
            // Vient de revenir online — passer en mode syncing
            setPhase('syncing');
        }
        return clearTimer;
    }, [isOnline]);

    // Réagir aux changements d'état du sync
    useEffect(() => {
        if (syncState === 'syncing' && isOnline) {
            setPhase('syncing');
            slideIn();
        } else if (syncState === 'done') {
            setPhase('done');
            slideIn();
            clearTimer();
            slideOut(2500);
        } else if (syncState === 'error') {
            setPhase('error');
            slideIn();
            clearTimer();
            slideOut(4000);
        }
    }, [syncState]);

    if (!visible) return null;

    const paddingTop = insets.top + 8;

    const bannerStyle = phase === 'offline' ? styles.bannerOffline
        : phase === 'syncing' ? styles.bannerSyncing
        : phase === 'done' ? styles.bannerDone
        : styles.bannerError;

    return (
        <Animated.View
            style={[styles.banner, bannerStyle, { transform: [{ translateY }], paddingTop }]}
        >
            {phase === 'offline' && (
                <>
                    <WifiOff color="#fff" size={15} />
                    <Text style={styles.text}>
                        {pendingCount > 0
                            ? `HORS LIGNE — ${pendingCount} action(s) en attente`
                            : 'HORS LIGNE — Données locales'
                        }
                    </Text>
                </>
            )}
            {phase === 'syncing' && (
                <>
                    <ActivityIndicator size="small" color="#fff" />
                    <Text style={styles.text}>Synchronisation en cours...</Text>
                </>
            )}
            {phase === 'done' && (
                <>
                    <Check color="#fff" size={15} />
                    <Text style={styles.text}>
                        {syncResult.synced > 0
                            ? `Tout est à jour — ${syncResult.synced} action(s) synchronisée(s)`
                            : 'Tout est à jour'
                        }
                    </Text>
                </>
            )}
            {phase === 'error' && (
                <>
                    <AlertTriangle color="#fff" size={15} />
                    <Text style={styles.text}>
                        {syncResult.failed > 0
                            ? `${syncResult.synced} sync / ${syncResult.failed} erreur(s)`
                            : 'Erreur de synchronisation'
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
    bannerSyncing: { backgroundColor: colors.primary },
    bannerDone:    { backgroundColor: '#059669' },
    bannerError:   { backgroundColor: '#DC2626' },
    text: {
        color: '#fff',
        fontSize: 11,
        fontWeight: '700',
        letterSpacing: 0.4,
    },
});
