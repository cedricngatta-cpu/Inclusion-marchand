// Badge de statut uniforme
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors } from '@/src/lib/colors';

type StatusKey =
    | 'en_attente' | 'PENDING'
    | 'acceptee'   | 'ACCEPTED' | 'valide' | 'VALIDATED'
    | 'en_livraison' | 'SHIPPED'
    | 'livree'     | 'DELIVERED'
    | 'refusee'    | 'rejete' | 'CANCELLED'
    | 'ouvert'     | 'OPEN'
    | 'actif'      | 'ACTIVE'
    | 'inactif'    | 'INACTIVE'
    | 'NEGOTIATION' | 'COMPLETED';

interface BadgeProps {
    status: string;
    label?: string;               // libellé custom (si absent, utilise le statut)
    size?: 'sm' | 'md';
}

const STATUS_MAP: Record<string, { bg: string; text: string; label: string }> = {
    en_attente: { bg: colors.orangeLight,  text: colors.orange,  label: 'En attente' },
    PENDING:    { bg: colors.orangeLight,  text: colors.orange,  label: 'En attente' },
    acceptee:   { bg: colors.greenLight,   text: colors.green,   label: 'Acceptée' },
    ACCEPTED:   { bg: colors.greenLight,   text: colors.green,   label: 'Acceptée' },
    valide:     { bg: colors.greenLight,   text: colors.green,   label: 'Validé' },
    VALIDATED:  { bg: colors.greenLight,   text: colors.green,   label: 'Validé' },
    en_livraison: { bg: colors.blueLight,  text: colors.blue,    label: 'En livraison' },
    SHIPPED:    { bg: colors.blueLight,    text: colors.blue,    label: 'En livraison' },
    livree:     { bg: colors.greenLight,   text: colors.green,   label: 'Livrée' },
    DELIVERED:  { bg: colors.greenLight,   text: colors.green,   label: 'Livrée' },
    refusee:    { bg: colors.redLight,     text: colors.red,     label: 'Refusée' },
    rejete:     { bg: colors.redLight,     text: colors.red,     label: 'Rejeté' },
    CANCELLED:  { bg: colors.redLight,     text: colors.red,     label: 'Annulée' },
    ouvert:     { bg: colors.primaryBg,    text: colors.primary, label: 'Ouvert' },
    OPEN:       { bg: colors.primaryBg,    text: colors.primary, label: 'Ouvert' },
    actif:      { bg: colors.greenLight,   text: colors.green,   label: 'Actif' },
    ACTIVE:     { bg: colors.greenLight,   text: colors.green,   label: 'Actif' },
    inactif:    { bg: colors.slate100,     text: colors.slate500, label: 'Inactif' },
    INACTIVE:   { bg: colors.slate100,     text: colors.slate500, label: 'Inactif' },
    NEGOTIATION: { bg: colors.orangeLight, text: colors.orange,  label: 'En négociation' },
    COMPLETED:  { bg: colors.greenLight,   text: colors.green,   label: 'Terminé' },
};

export function Badge({ status, label, size = 'md' }: BadgeProps) {
    const config = STATUS_MAP[status] ?? {
        bg: colors.slate100,
        text: colors.slate500,
        label: status,
    };

    return (
        <View style={[styles.badge, size === 'sm' && styles.badgeSm, { backgroundColor: config.bg }]}>
            <Text style={[styles.text, size === 'sm' && styles.textSm, { color: config.text }]}>
                {label ?? config.label}
            </Text>
        </View>
    );
}

const styles = StyleSheet.create({
    badge: {
        borderRadius: 6,
        paddingHorizontal: 8,
        paddingVertical: 4,
        alignSelf: 'flex-start',
    },
    badgeSm: {
        paddingHorizontal: 6,
        paddingVertical: 2,
        borderRadius: 4,
    },
    text: {
        fontSize: 11,
        fontWeight: '600',
    },
    textSm: {
        fontSize: 11,
    },
});
