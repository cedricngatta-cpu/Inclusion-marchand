// Bandeau "Hors ligne" — overlay avec etat de synchronisation + progression + retry
// Marchands/Producteurs : mode offline complet (orange)
// Agents/Coops/Admins : connexion requise (rouge)
import React, { useEffect, useRef, useState } from 'react';
import { Animated, Platform, StyleSheet, Text, ActivityIndicator, TouchableOpacity } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { WifiOff, Check, AlertTriangle, RefreshCw } from 'lucide-react-native';
import { useNetwork } from '@/src/context/NetworkContext';
import { useAuth } from '@/src/context/AuthContext';
import { isOfflineEligible } from '@/src/lib/offlineCache';
import { colors } from '@/src/lib/colors';

export default function OfflineBanner() {
    const { isOnline, pendingCount, syncState, syncResult, syncProgress, triggerSync } = useNetwork();
    const { user } = useAuth();
    const eligible = isOfflineEligible(user?.role);
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
            // Ne pas auto-hide en erreur — laisser le bouton retry visible
        }
    }, [syncState]);

    if (!visible) return null;

    const paddingTop = insets.top + 8;

    const bannerStyle = phase === 'offline'
        ? (eligible ? styles.bannerOffline : styles.bannerRequired)
        : phase === 'syncing' ? styles.bannerSyncing
        : phase === 'done' ? styles.bannerDone
        : styles.bannerError;

    // Texte de progression pendant la sync
    const progressText = syncProgress.total > 0
        ? `${syncProgress.current}/${syncProgress.total}`
        : '';

    return (
        <Animated.View
            style={[styles.banner, bannerStyle, { transform: [{ translateY }], paddingTop }]}
        >
            {phase === 'offline' && (
                <>
                    <WifiOff color="#fff" size={15} />
                    <Text style={styles.text}>
                        {eligible
                            ? (pendingCount > 0
                                ? `MODE HORS LIGNE — ${pendingCount} action(s) sauvegardée(s)`
                                : 'MODE HORS LIGNE — Vos données sont disponibles')
                            : 'CONNEXION INTERNET REQUISE'
                        }
                    </Text>
                </>
            )}
            {phase === 'syncing' && (
                <>
                    <ActivityIndicator size="small" color="#fff" />
                    <Text style={styles.text}>
                        {progressText
                            ? `Synchronisation ${progressText}...`
                            : 'Synchronisation en cours...'
                        }
                    </Text>
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
                    <TouchableOpacity
                        style={styles.retryBtn}
                        onPress={() => { triggerSync(); }}
                        activeOpacity={0.7}
                    >
                        <RefreshCw color="#fff" size={12} />
                        <Text style={styles.retryText}>Réessayer</Text>
                    </TouchableOpacity>
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
    bannerOffline:  { backgroundColor: '#b45309' },
    bannerRequired: { backgroundColor: '#DC2626' },
    bannerSyncing:  { backgroundColor: colors.primary },
    bannerDone:     { backgroundColor: '#059669' },
    bannerError:    { backgroundColor: '#DC2626' },
    text: {
        color: '#fff',
        fontSize: 11,
        fontWeight: '700',
        letterSpacing: 0.4,
    },
    retryBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        backgroundColor: 'rgba(255,255,255,0.25)',
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 8,
        marginLeft: 4,
    },
    retryText: {
        color: '#fff',
        fontSize: 10,
        fontWeight: '700',
    },
});
