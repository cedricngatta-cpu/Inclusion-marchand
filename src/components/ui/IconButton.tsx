// Bouton icône pour grilles de navigation (dashboard actions rapides)
import React from 'react';
import { TouchableOpacity, Text, StyleSheet, View, Dimensions } from 'react-native';
import { colors } from '@/src/lib/colors';

const W = Dimensions.get('window').width;

interface IconButtonProps {
    label: string;
    icon: React.ReactNode;
    onPress: () => void;
    cols?: 2 | 4;                  // grille 2 colonnes ou 4 colonnes
    bg?: string;                   // fond de l'icône
    color?: string;                // couleur du texte
    badge?: string | number;       // badge optionnel (ex: nombre de commandes)
}

export function IconButton({
    label,
    icon,
    onPress,
    cols = 4,
    bg = colors.primaryBg,
    color = colors.textPrimary,
    badge,
}: IconButtonProps) {
    const itemWidth = cols === 4
        ? (W - 48) / 4
        : (W - 44) / 2;

    return (
        <TouchableOpacity
            style={[styles.item, { width: itemWidth }]}
            onPress={onPress}
            activeOpacity={0.75}
        >
            <View style={[styles.iconWrap, { backgroundColor: bg, position: 'relative' }]}>
                {icon}
                {badge != null && (
                    <View style={styles.badge}>
                        <Text style={styles.badgeText}>{badge}</Text>
                    </View>
                )}
            </View>
            <Text style={[styles.label, { color }]} numberOfLines={1}>{label}</Text>
        </TouchableOpacity>
    );
}

const styles = StyleSheet.create({
    item: {
        alignItems: 'center',
        paddingVertical: 10,
        gap: 6,
    },
    iconWrap: {
        width: 52,
        height: 52,
        borderRadius: 10,
        alignItems: 'center',
        justifyContent: 'center',
    },
    label: {
        fontSize: 11,
        fontWeight: '600',
        textAlign: 'center',
    },
    badge: {
        position: 'absolute',
        top: -4,
        right: -4,
        minWidth: 18,
        height: 18,
        borderRadius: 5,
        backgroundColor: colors.error,
        borderWidth: 1.5,
        borderColor: colors.white,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 3,
    },
    badgeText: {
        fontSize: 11,
        fontWeight: '900',
        color: colors.white,
    },
});
