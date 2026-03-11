// Carte blanche uniforme — utilisée partout
import React from 'react';
import { View, StyleSheet, ViewStyle } from 'react-native';
import { colors } from '@/src/lib/colors';

interface CardProps {
    children: React.ReactNode;
    style?: ViewStyle | ViewStyle[];
    padding?: number;
    noPadding?: boolean;
}

export function Card({ children, style, padding = 16, noPadding = false }: CardProps) {
    return (
        <View style={[styles.card, noPadding ? {} : { padding }, style]}>
            {children}
        </View>
    );
}

const styles = StyleSheet.create({
    card: {
        backgroundColor: colors.white,
        borderRadius: 10,
        marginHorizontal: 16,
        marginBottom: 12,
        borderWidth: 1,
        borderColor: colors.slate100,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.05,
        shadowRadius: 6,
        elevation: 2,
    },
});
