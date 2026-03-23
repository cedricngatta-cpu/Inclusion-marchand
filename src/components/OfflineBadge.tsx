// Badge "Hors ligne" / "En attente de sync" — réutilisable
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { WifiOff, Clock } from 'lucide-react-native';
import { useNetwork } from '@/src/context/NetworkContext';

interface OfflineBadgeProps {
    /** Affiche le nombre d'actions en attente au lieu du badge offline */
    showPending?: boolean;
    /** Taille compacte (inline) */
    compact?: boolean;
}

export default function OfflineBadge({ showPending = false, compact = false }: OfflineBadgeProps) {
    const { isOnline, pendingCount } = useNetwork();

    if (isOnline && (!showPending || pendingCount === 0)) return null;

    if (!isOnline) {
        return (
            <View style={[styles.badge, styles.badgeOffline, compact && styles.compact]}>
                <WifiOff color="#b45309" size={compact ? 10 : 12} />
                <Text style={[styles.text, styles.textOffline, compact && styles.textCompact]}>
                    Hors ligne
                </Text>
            </View>
        );
    }

    if (showPending && pendingCount > 0) {
        return (
            <View style={[styles.badge, styles.badgePending, compact && styles.compact]}>
                <Clock color="#C47316" size={compact ? 10 : 12} />
                <Text style={[styles.text, styles.textPending, compact && styles.textCompact]}>
                    {pendingCount} en attente
                </Text>
            </View>
        );
    }

    return null;
}

const styles = StyleSheet.create({
    badge: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 6,
    },
    compact: {
        paddingHorizontal: 6,
        paddingVertical: 2,
    },
    badgeOffline: {
        backgroundColor: '#FEF3C7',
    },
    badgePending: {
        backgroundColor: '#FFF7ED',
    },
    text: {
        fontWeight: '700',
        letterSpacing: 0.2,
    },
    textCompact: {
        fontSize: 9,
    },
    textOffline: {
        fontSize: 10,
        color: '#b45309',
    },
    textPending: {
        fontSize: 10,
        color: '#C47316',
    },
});
