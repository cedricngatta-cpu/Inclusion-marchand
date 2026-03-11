// État vide uniforme — affiché quand une liste est vide
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors } from '@/src/lib/colors';

interface EmptyStateProps {
    icon?: React.ReactNode;
    title: string;
    subtitle?: string;
    action?: React.ReactNode;      // bouton d'action optionnel
}

export function EmptyState({ icon, title, subtitle, action }: EmptyStateProps) {
    return (
        <View style={styles.wrap}>
            {icon && <View style={styles.iconWrap}>{icon}</View>}
            <Text style={styles.title}>{title.toUpperCase()}</Text>
            {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
            {action && <View style={styles.action}>{action}</View>}
        </View>
    );
}

const styles = StyleSheet.create({
    wrap: {
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 40,
        paddingHorizontal: 24,
        gap: 8,
    },
    iconWrap: {
        marginBottom: 8,
        opacity: 0.4,
    },
    title: {
        fontSize: 12,
        fontWeight: '700',
        letterSpacing: 1.5,
        color: colors.textMuted,
        textAlign: 'center',
    },
    subtitle: {
        fontSize: 13,
        color: colors.textSecondary,
        textAlign: 'center',
        lineHeight: 20,
    },
    action: {
        marginTop: 12,
    },
});
