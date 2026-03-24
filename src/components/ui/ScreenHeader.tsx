// Header vert unifié — utilisé sur TOUS les écrans secondaires
import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Platform, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChevronLeft, Bell, Eye, EyeOff, User } from 'lucide-react-native';
import { useRouter, useNavigation } from 'expo-router';
import { useNotifications } from '@/src/context/NotificationContext';
import { useNetwork } from '@/src/context/NetworkContext';
import { colors } from '@/src/lib/colors';

interface ScreenHeaderProps {
    title: string;
    subtitle?: string;
    showProfile?: boolean;                 // priorité maximale : bouton profil à gauche
    showBack?: boolean;
    leftIcon?: React.ReactNode;            // icône custom à gauche (si pas showBack ni showProfile)
    onLeftPress?: () => void;              // rend leftIcon pressable
    showNotification?: boolean;
    showEye?: boolean;
    eyeVisible?: boolean;
    onEyeToggle?: () => void;
    rightIcon?: React.ReactNode;           // icône(s) custom à droite
    children?: React.ReactNode;            // contenu étendu sous le header (stats, montant...)
    paddingBottom?: number;
}

export function ScreenHeader({
    title,
    subtitle,
    showProfile = false,
    showBack = false,
    leftIcon,
    onLeftPress,
    showNotification = false,
    showEye = false,
    eyeVisible = true,
    onEyeToggle,
    rightIcon,
    children,
    paddingBottom = 16,
}: ScreenHeaderProps) {
    const insets = useSafeAreaInsets();
    const router = useRouter();
    const navigation = useNavigation();
    const { unreadCount } = useNotifications();
    const { isOnline } = useNetwork();
    const { width } = useWindowDimensions();

    // Sur desktop web, la sidebar remplace le header
    if (Platform.OS === 'web' && width > 768) return null;

    // Sur web : bloquer le bouton retour 250ms pour éviter la propagation du clic de navigation
    const [backReady, setBackReady] = useState(Platform.OS !== 'web');
    useEffect(() => {
        if (Platform.OS === 'web') {
            const t = setTimeout(() => setBackReady(true), 250);
            return () => clearTimeout(t);
        }
    }, []);

    const handleBack = () => {
        if (!backReady) return; // protection supplémentaire : ignorer si pas encore prêt (web click propagation)
        if (navigation.canGoBack()) {
            router.back();
        }
    };

    return (
        <View style={[styles.header, { paddingTop: insets.top + 8, paddingBottom }]}>
            {/* Ligne principale : gauche | titre | droite */}
            <View style={styles.row} pointerEvents="box-none">
                {/* Gauche — priorité : showProfile → showBack → leftIcon → espace vide */}
                <View style={styles.side}>
                    {showProfile ? (
                        <TouchableOpacity style={styles.iconBtn} onPress={() => router.push('/(tabs)/profil' as any)} activeOpacity={0.8} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                            <User color={colors.white} size={22} strokeWidth={2} />
                        </TouchableOpacity>
                    ) : showBack ? (
                        <TouchableOpacity style={styles.iconBtn} onPress={handleBack} activeOpacity={0.8} disabled={!backReady} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                            <ChevronLeft color={colors.white} size={22} strokeWidth={2.5} />
                        </TouchableOpacity>
                    ) : leftIcon ? (
                        onLeftPress
                            ? <TouchableOpacity style={styles.iconBtn} onPress={onLeftPress} activeOpacity={0.8} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>{leftIcon}</TouchableOpacity>
                            : <View style={styles.iconBtn}>{leftIcon}</View>
                    ) : (
                        <View style={styles.iconBtnPlaceholder} />
                    )}
                </View>

                {/* Titre centré */}
                <View style={styles.titleWrap} pointerEvents="none">
                    <Text style={styles.title} numberOfLines={1}>{title}</Text>
                    {!isOnline ? (
                        <Text style={styles.offlineHint} numberOfLines={1}>Mode hors ligne</Text>
                    ) : subtitle ? (
                        <Text style={styles.subtitle} numberOfLines={1}>{subtitle}</Text>
                    ) : null}
                </View>

                {/* Droite */}
                <View style={[styles.side, styles.sideRight]}>
                    {rightIcon}
                    {showEye && (
                        <TouchableOpacity style={styles.iconBtn} onPress={onEyeToggle} activeOpacity={0.8} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                            {eyeVisible
                                ? <Eye color={colors.white} size={20} />
                                : <EyeOff color={colors.white} size={20} />}
                        </TouchableOpacity>
                    )}
                    {showNotification && (
                        <TouchableOpacity
                            style={styles.iconBtn}
                            onPress={() => {
                                try { router.push('/(tabs)/notifications' as any); } catch { /* ignore */ }
                            }}
                            activeOpacity={0.8}
                            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                        >
                            <Bell color={colors.white} size={20} />
                            {unreadCount > 0 && (
                                <View style={styles.badge}>
                                    <Text style={styles.badgeText}>{unreadCount}</Text>
                                </View>
                            )}
                        </TouchableOpacity>
                    )}
                </View>
            </View>

            {/* Contenu étendu (montant, stats…) */}
            {children}
        </View>
    );
}

const styles = StyleSheet.create({
    header: {
        backgroundColor: colors.primary,
        borderBottomLeftRadius: 24,
        borderBottomRightRadius: 24,
        paddingHorizontal: 16,
    },
    row: {
        flexDirection: 'row',
        alignItems: 'center',
        height: 52,
        zIndex: 50,
    },
    side: {
        flexDirection: 'row',
        alignItems: 'center',
        flexShrink: 0,
        minWidth: 44,
        zIndex: 50,
    },
    sideRight: {
        justifyContent: 'flex-end',
        gap: 8,
    },
    titleWrap: {
        flex: 1,
        alignItems: 'center',
        paddingHorizontal: 8,
    },
    title: {
        fontSize: 17,
        fontWeight: '700',
        color: colors.white,
        letterSpacing: 0.5,
    },
    subtitle: {
        fontSize: 12,
        color: 'rgba(255,255,255,0.75)',
        marginTop: 2,
    },
    offlineHint: {
        fontSize: 10,
        color: '#FDE68A',
        fontWeight: '600',
        marginTop: 2,
    },
    iconBtn: {
        width: 44,
        height: 44,
        backgroundColor: 'rgba(255,255,255,0.2)',
        borderRadius: 10,
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 50,
        position: 'relative' as const,
        ...(Platform.OS === 'web' ? { cursor: 'pointer' as any } : {}),
    },
    iconBtnPlaceholder: {
        width: 44,
        height: 44,
    },
    badge: {
        position: 'absolute',
        top: -3,
        right: -3,
        minWidth: 16,
        height: 16,
        borderRadius: 4,
        backgroundColor: colors.error,
        borderWidth: 1.5,
        borderColor: colors.white,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 2,
    },
    badgeText: {
        fontSize: 11,
        fontWeight: '900',
        color: colors.white,
    },
});
