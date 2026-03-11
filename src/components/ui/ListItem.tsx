// Ligne de liste uniforme — stock, ventes, commandes, notifications...
import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { colors } from '@/src/lib/colors';

interface ListItemProps {
    title: string;
    subtitle?: string;
    caption?: string;              // troisième ligne (ex: date)
    left?: React.ReactNode;        // icône/image à gauche
    right?: React.ReactNode;       // montant/action/badge à droite
    onPress?: () => void;
    noBorder?: boolean;
    topBorder?: boolean;
}

export function ListItem({
    title,
    subtitle,
    caption,
    left,
    right,
    onPress,
    noBorder = false,
    topBorder = false,
}: ListItemProps) {
    const Container = onPress ? TouchableOpacity : View;

    return (
        <Container
            style={[
                styles.item,
                !noBorder && styles.bottomBorder,
                topBorder && styles.topBorder,
            ]}
            onPress={onPress}
            activeOpacity={0.7}
        >
            {left && <View style={styles.left}>{left}</View>}
            <View style={styles.center}>
                <Text style={styles.title} numberOfLines={1}>{title}</Text>
                {subtitle ? <Text style={styles.subtitle} numberOfLines={1}>{subtitle}</Text> : null}
                {caption  ? <Text style={styles.caption}  numberOfLines={1}>{caption}</Text>  : null}
            </View>
            {right && <View style={styles.right}>{right}</View>}
        </Container>
    );
}

// Icône-conteneur standard pour la colonne gauche
export function ListIcon({ children, bg = colors.slate100 }: { children: React.ReactNode; bg?: string }) {
    return (
        <View style={[styles.iconBox, { backgroundColor: bg }]}>
            {children}
        </View>
    );
}

const styles = StyleSheet.create({
    item: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 12,
        paddingHorizontal: 16,
        gap: 12,
        backgroundColor: colors.white,
    },
    bottomBorder: {
        borderBottomWidth: 1,
        borderBottomColor: colors.slate100,
    },
    topBorder: {
        borderTopWidth: 1,
        borderTopColor: colors.slate100,
    },
    left: {
        alignItems: 'center',
        justifyContent: 'center',
    },
    center: {
        flex: 1,
        gap: 2,
    },
    right: {
        alignItems: 'flex-end',
        gap: 4,
    },
    title: {
        fontSize: 14,
        fontWeight: '600',
        color: colors.textPrimary,
    },
    subtitle: {
        fontSize: 13,
        color: colors.textSecondary,
    },
    caption: {
        fontSize: 11,
        color: colors.textMuted,
    },
    iconBox: {
        width: 42,
        height: 42,
        borderRadius: 8,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1,
        borderColor: colors.slate100,
    },
});
