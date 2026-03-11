// Barre de recherche uniforme
import React from 'react';
import { View, TextInput, StyleSheet } from 'react-native';
import { Search } from 'lucide-react-native';
import { colors } from '@/src/lib/colors';

interface SearchBarProps {
    value: string;
    onChangeText: (text: string) => void;
    placeholder?: string;
    autoFocus?: boolean;
}

export function SearchBar({
    value,
    onChangeText,
    placeholder = 'Rechercher…',
    autoFocus = false,
}: SearchBarProps) {
    return (
        <View style={styles.wrap}>
            <Search color={colors.textMuted} size={16} strokeWidth={2} />
            <TextInput
                style={styles.input}
                value={value}
                onChangeText={onChangeText}
                placeholder={placeholder}
                placeholderTextColor={colors.textMuted}
                autoFocus={autoFocus}
                returnKeyType="search"
                autoCorrect={false}
            />
        </View>
    );
}

const styles = StyleSheet.create({
    wrap: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: colors.slate50,
        borderRadius: 10,
        paddingHorizontal: 12,
        paddingVertical: 10,
        marginHorizontal: 16,
        marginBottom: 12,
        gap: 10,
        borderWidth: 1,
        borderColor: colors.slate100,
    },
    input: {
        flex: 1,
        fontSize: 14,
        color: colors.textPrimary,
        padding: 0,
    },
});
