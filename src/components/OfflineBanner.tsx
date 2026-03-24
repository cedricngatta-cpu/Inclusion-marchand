// Bandeau offline WhatsApp-like — 6 etats visuels
// 1. Online, rien a sync -> INVISIBLE
// 2. Offline, pas d'actions -> Banniere orange "Mode hors ligne"
// 3. Offline, actions en attente -> Banniere orange "Mode hors ligne — X actions en attente"
// 4. Online, sync en cours -> Banniere bleue "Synchronisation 2/5..." avec spinner
// 5. Online, sync terminee -> Banniere verte "Tout est a jour" (3s puis disparait)
// 6. Online, erreurs -> Banniere orange "X synchronisees, Y en erreur — [Reessayer]"
import React, { useEffect, useRef, useState } from 'react';
import { Animated, Platform, StyleSheet, Text, ActivityIndicator, TouchableOpacity } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { WifiOff, Check, AlertTriangle, RefreshCw } from 'lucide-react-native';
import { useNetwork } from '@/src/context/NetworkContext';
import { useAuth } from '@/src/context/AuthContext';
import { isOfflineEligible } from '@/src/lib/offlineCache';
import { colors } from '@/src/lib/colors';

type BannerPhase = 'hidden' | 'offline' | 'offline_pending' | 'syncing' | 'done' | 'error';

export default function OfflineBanner() {
    const { isOnline, pendingCount, syncState, syncResult, syncProgress, triggerSync } = useNetwork();
    const { user } = useAuth();
    const eligible = isOfflineEligible(user?.role);
    const insets = useSafeAreaInsets();
    const translateY = useRef(new Animated.Value(-80)).current;
    const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const [visible, setVisible] = useState(false);
    const [phase, setPhase] = useState<BannerPhase>('hidden');

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
        clearTimer();
        hideTimer.current = setTimeout(() => {
            Animated.timing(translateY, {
                toValue: -80,
                duration: 350,
                useNativeDriver: Platform.OS !== 'web',
            }).start(() => {
                setVisible(false);
                setPhase('hidden');
            });
        }, delay);
    };

    // Reagir aux changements de connectivite + pendingCount
    useEffect(() => {
        clearTimer();

        if (!isOnline) {
            // Hors ligne
            if (pendingCount > 0) {
                setPhase('offline_pending');
            } else {
                setPhase('offline');
            }
            slideIn();
        } else if (syncState === 'syncing') {
            setPhase('syncing');
            slideIn();
        } else if (syncState === 'done') {
            setPhase('done');
            slideIn();
            slideOut(3000);
        } else if (syncState === 'error') {
            setPhase('error');
            slideIn();
        } else {
            // Online, idle, rien a sync -> invisible
            if (visible) slideOut(0);
        }

        return clearTimer;
    }, [isOnline, syncState, pendingCount]);

    if (!visible) return null;

    const paddingTop = insets.top + 8;

    // Couleurs par phase
    const bannerBg =
        phase === 'offline' || phase === 'offline_pending'
            ? (eligible ? styles.bannerOffline : styles.bannerRequired)
        : phase === 'syncing' ? styles.bannerSyncing
        : phase === 'done' ? styles.bannerDone
        : phase === 'error' ? styles.bannerError
        : styles.bannerOffline;

    return (
        <Animated.View
            style={[styles.banner, bannerBg, { transform: [{ translateY }], paddingTop }]}
        >
            {/* Etat 2 : Offline, pas d'actions */}
            {phase === 'offline' && (
                <>
                    <WifiOff color="#fff" size={15} />
                    <Text style={styles.text}>
                        {eligible ? 'MODE HORS LIGNE' : 'CONNEXION INTERNET REQUISE'}
                    </Text>
                </>
            )}

            {/* Etat 3 : Offline, actions en attente */}
            {phase === 'offline_pending' && (
                <>
                    <WifiOff color="#fff" size={15} />
                    <Text style={styles.text}>
                        {eligible
                            ? `MODE HORS LIGNE \u2014 ${pendingCount} action${pendingCount > 1 ? 's' : ''} en attente \u23F3`
                            : 'CONNEXION INTERNET REQUISE'
                        }
                    </Text>
                </>
            )}

            {/* Etat 4 : Sync en cours */}
            {phase === 'syncing' && (
                <>
                    <ActivityIndicator size="small" color="#fff" />
                    <Text style={styles.text}>
                        {syncProgress.total > 0
                            ? `Synchronisation ${syncProgress.current}/${syncProgress.total}...`
                            : 'Synchronisation en cours...'
                        }
                    </Text>
                </>
            )}

            {/* Etat 5 : Sync terminee */}
            {phase === 'done' && (
                <>
                    <Check color="#fff" size={15} />
                    <Text style={styles.text}>
                        {'\u2713'} Tout est a jour
                        {syncResult.synced > 0 ? ` \u2014 ${syncResult.synced} synchronisee${syncResult.synced > 1 ? 's' : ''}` : ''}
                    </Text>
                </>
            )}

            {/* Etat 6 : Erreurs */}
            {phase === 'error' && (
                <>
                    <AlertTriangle color="#fff" size={15} />
                    <Text style={styles.text}>
                        {syncResult.synced > 0
                            ? `${syncResult.synced} synchronisee${syncResult.synced > 1 ? 's' : ''}, ${syncResult.failed} en erreur`
                            : `${syncResult.failed} erreur${syncResult.failed > 1 ? 's' : ''} de synchronisation`
                        }
                    </Text>
                    <TouchableOpacity
                        style={styles.retryBtn}
                        onPress={() => triggerSync()}
                        activeOpacity={0.7}
                    >
                        <RefreshCw color="#fff" size={12} />
                        <Text style={styles.retryText}>Reessayer</Text>
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
    bannerSyncing:  { backgroundColor: '#2563EB' },
    bannerDone:     { backgroundColor: '#059669' },
    bannerError:    { backgroundColor: '#b45309' },
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
