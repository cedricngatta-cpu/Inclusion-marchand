// Bouton uniforme — variants primary / secondary / danger
import React from 'react';
import { TouchableOpacity, Text, StyleSheet, ActivityIndicator, View, ViewStyle } from 'react-native';
import { colors } from '@/src/lib/colors';

interface ButtonProps {
    title: string;
    onPress: () => void;
    variant?: 'primary' | 'secondary' | 'danger' | 'outline';
    disabled?: boolean;
    loading?: boolean;
    icon?: React.ReactNode;
    style?: ViewStyle;
    fullWidth?: boolean;
}

const VARIANTS = {
    primary: {
        bg: colors.primary,
        text: colors.white,
        border: colors.primary,
    },
    secondary: {
        bg: colors.slate100,
        text: colors.slate700,
        border: colors.slate100,
    },
    danger: {
        bg: colors.error,
        text: colors.white,
        border: colors.error,
    },
    outline: {
        bg: 'transparent',
        text: colors.primary,
        border: colors.primary,
    },
};

export function Button({
    title,
    onPress,
    variant = 'primary',
    disabled = false,
    loading = false,
    icon,
    style,
    fullWidth = false,
}: ButtonProps) {
    const v = VARIANTS[variant];
    return (
        <TouchableOpacity
            style={[
                styles.btn,
                { backgroundColor: v.bg, borderColor: v.border },
                fullWidth && { alignSelf: 'stretch' },
                (disabled || loading) && styles.disabled,
                style,
            ]}
            onPress={onPress}
            disabled={disabled || loading}
            activeOpacity={0.8}
        >
            {loading ? (
                <ActivityIndicator color={v.text} size="small" />
            ) : (
                <View style={styles.inner}>
                    {icon && <View style={styles.iconWrap}>{icon}</View>}
                    <Text style={[styles.text, { color: v.text }]}>{title}</Text>
                </View>
            )}
        </TouchableOpacity>
    );
}

const styles = StyleSheet.create({
    btn: {
        borderRadius: 10,
        paddingVertical: 14,
        paddingHorizontal: 20,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1.5,
    },
    inner: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    iconWrap: {
        alignItems: 'center',
        justifyContent: 'center',
    },
    text: {
        fontSize: 15,
        fontWeight: '700',
        letterSpacing: 0.5,
    },
    disabled: {
        opacity: 0.5,
    },
});
