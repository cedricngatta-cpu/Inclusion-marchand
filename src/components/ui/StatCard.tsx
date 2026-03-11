// Carte statistique uniforme — KPIs, revenus, compteurs
import React from 'react';
import { View, Text, StyleSheet, ViewStyle } from 'react-native';
import { colors } from '@/src/lib/colors';

interface StatCardProps {
    label: string;
    value: string | number;
    subtext?: string;
    icon?: React.ReactNode;
    iconBg?: string;
    accentColor?: string;          // couleur de la barre supérieure
    style?: ViewStyle;
    flex?: boolean;
}

export function StatCard({
    label,
    value,
    subtext,
    icon,
    iconBg = colors.primaryBg,
    accentColor = colors.primary,
    style,
    flex = false,
}: StatCardProps) {
    return (
        <View style={[styles.card, flex && { flex: 1 }, style]}>
            <View style={[styles.accent, { backgroundColor: accentColor }]} />
            <View style={styles.body}>
                {icon && (
                    <View style={[styles.iconWrap, { backgroundColor: iconBg }]}>
                        {icon}
                    </View>
                )}
                <Text style={styles.label}>{label.toUpperCase()}</Text>
                <Text style={styles.value}>{value}</Text>
                {subtext ? <Text style={styles.subtext}>{subtext}</Text> : null}
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    card: {
        backgroundColor: colors.white,
        borderRadius: 10,
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: colors.slate100,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.05,
        shadowRadius: 6,
        elevation: 2,
    },
    accent: {
        height: 4,
    },
    body: {
        padding: 14,
    },
    iconWrap: {
        width: 36,
        height: 36,
        borderRadius: 8,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 10,
    },
    label: {
        fontSize: 11,
        fontWeight: '600',
        letterSpacing: 1,
        color: colors.textSecondary,
        marginBottom: 4,
    },
    value: {
        fontSize: 22,
        fontWeight: '700',
        color: colors.textPrimary,
        letterSpacing: -0.5,
    },
    subtext: {
        fontSize: 12,
        color: colors.textSecondary,
        marginTop: 2,
    },
});
