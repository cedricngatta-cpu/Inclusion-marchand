// Dashboard Marchand — header collapsible, UI thread only, zéro conflit de gestes
import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, Dimensions } from 'react-native';
import {
    TouchableOpacity,
    GestureHandlerRootView,
} from 'react-native-gesture-handler';
import Animated, {
    useSharedValue,
    useAnimatedScrollHandler,
    useAnimatedStyle,
    interpolate,
    Extrapolation,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import {
    ShoppingBag, Package, User, Bell, PieChart, BookOpen,
    Store, Eye, EyeOff, MoreHorizontal, QrCode,
    TrendingUp, Landmark, Wallet, GraduationCap, Lightbulb,
} from 'lucide-react-native';
import { useAuth } from '@/src/context/AuthContext';
import { useNotifications } from '@/src/context/NotificationContext';
import { useHistoryContext } from '@/src/context/HistoryContext';
import { colors } from '@/src/lib/colors';

const quickActions = [
    { id: 'vendre',  name: 'Vendre',     icon: ShoppingBag, bg: '#ecfdf5', color: '#059669', path: '/(tabs)/vendre' },
    { id: 'stock',   name: 'Stock',      icon: Package,     bg: '#fffbeb', color: '#d97706', path: '/(tabs)/stock' },
    { id: 'bilan',   name: 'Bilan',      icon: PieChart,    bg: '#eff6ff', color: '#2563eb', path: '/(tabs)/bilan' },
    { id: 'carnet',  name: 'Carnet',     icon: BookOpen,    bg: '#fff1f2', color: '#e11d48', path: '/(tabs)/carnet' },
    { id: 'wallet',  name: 'Wallet',     icon: Wallet,      bg: '#fefce8', color: '#ca8a04', path: '/(tabs)/wallet' },
    { id: 'finance', name: 'Crédit',     icon: Landmark,    bg: '#faf5ff', color: '#7c3aed', path: '/(tabs)/credit' },
    { id: 'marche',  name: 'Marché',     icon: Store,       bg: '#eef2ff', color: '#4338ca', path: '/(tabs)/marche' },
    { id: 'revenus', name: 'Revenus',    icon: TrendingUp,  bg: '#f0fdf4', color: '#16a34a', path: '/(tabs)/revenus' },
    { id: 'scanner',   name: 'Scanner',    icon: QrCode,         bg: '#f8fafc', color: '#475569', path: '/(tabs)/scanner' },
    { id: 'formation', name: 'Formation',  icon: GraduationCap,  bg: '#fdf4ff', color: '#a21caf', path: '/(tabs)/formation' },
    { id: 'conseils',  name: 'Conseils',   icon: Lightbulb,      bg: '#fffbeb', color: '#b45309', path: '/(tabs)/conseils' },
];

const NAV_H     = 56;
const CONTENT_H = 140;
const SCROLL_R  = 100;
const OVERLAP   = 36;
const ITEM_W    = Dimensions.get('window').width / 4;

export default function CommercantScreen() {
    const router = useRouter();
    const { user } = useAuth();
    const { unreadCount, refreshNotifications } = useNotifications();
    const { balance, history, refreshHistory } = useHistoryContext();

    // Recharger les données à chaque retour sur l'écran
    useFocusEffect(useCallback(() => {
        refreshHistory();
        refreshNotifications();
    }, [refreshHistory, refreshNotifications]));
    const [showBalance, setShowBalance] = useState(true);
    const insets = useSafeAreaInsets();

    const firstName  = user?.name?.split(' ')[0] || 'Marchand';
    const balanceText = showBalance ? balance.toLocaleString('fr-FR') : '••••••';

    const HEADER_EXPANDED  = insets.top + NAV_H + CONTENT_H;
    const HEADER_COLLAPSED = insets.top + NAV_H;
    const SCROLL_TOP       = HEADER_EXPANDED - OVERLAP;

    // ── Scroll — worklet sur UI thread, zéro JS bridge ──
    const scrollY = useSharedValue(0);
    const scrollHandler = useAnimatedScrollHandler({
        onScroll: (event) => {
            'worklet';
            scrollY.value = event.contentOffset.y;
        },
    });

    // ── Styles animés (tous sur UI thread) ──

    // Header : hauteur + coins arrondis
    const aHeader = useAnimatedStyle(() => ({
        height: interpolate(scrollY.value, [0, SCROLL_R], [HEADER_EXPANDED, HEADER_COLLAPSED], Extrapolation.CLAMP),
        borderBottomLeftRadius:  interpolate(scrollY.value, [0, SCROLL_R * 0.7], [28, 0], Extrapolation.CLAMP),
        borderBottomRightRadius: interpolate(scrollY.value, [0, SCROLL_R * 0.7], [28, 0], Extrapolation.CLAMP),
    }));

    // Section expandée (label + gros montant + bonjour) — disparaît tôt
    const aExpanded = useAnimatedStyle(() => ({
        opacity:   interpolate(scrollY.value, [0, SCROLL_R * 0.45], [1, 0], Extrapolation.CLAMP),
        transform: [{ translateY: interpolate(scrollY.value, [0, SCROLL_R], [0, -CONTENT_H * 0.5], Extrapolation.CLAMP) }],
    }));

    // Montant compact dans la nav bar — apparaît après la moitié
    const aCompact = useAnimatedStyle(() => ({
        opacity: interpolate(scrollY.value, [SCROLL_R * 0.5, SCROLL_R], [0, 1], Extrapolation.CLAMP),
    }));

    return (
        // GestureHandlerRootView évite les conflits entre gestes longs et scroll
        <GestureHandlerRootView style={styles.root}>

            {/* ── SCROLL (Animated.ScrollView Reanimated + anti-bounce) ── */}
            <Animated.ScrollView
                onScroll={scrollHandler}
                scrollEventThrottle={16}
                contentContainerStyle={[styles.scrollContent, { paddingTop: SCROLL_TOP }]}
                showsVerticalScrollIndicator={false}
                bounces={false}
                overScrollMode="never"
            >
                <View style={styles.body}>

                    {/* Grille des actions rapides */}
                    <View style={styles.actionsCard}>
                        <View style={styles.actionsGrid}>
                            {quickActions.map(action => (
                                <TouchableOpacity
                                    key={action.id}
                                    style={styles.actionItem}
                                    onPress={() => router.push(action.path as any)}
                                    activeOpacity={0.7}
                                >
                                    <View style={[styles.actionIconBox, { backgroundColor: action.bg }]}>
                                        <action.icon color={action.color} size={24} strokeWidth={2} />
                                    </View>
                                    <Text style={styles.actionLabel} numberOfLines={1} ellipsizeMode="tail">{action.name}</Text>
                                </TouchableOpacity>
                            ))}
                        </View>
                    </View>

                    {/* Historique du jour */}
                    <View style={styles.historyCard}>
                        <View style={styles.historyHeader}>
                            <Text style={styles.historyTitle}>AUJOURD'HUI</Text>
                            <MoreHorizontal color={colors.slate400} size={18} />
                        </View>

                        {history.slice(0, 5).map((t, i) => (
                            <View key={t.id} style={[styles.txItem, i > 0 && styles.txItemBorder]}>
                                <View style={styles.txIconBox}>
                                    {t.type === 'VENTE'
                                        ? <ShoppingBag color={colors.slate500} size={16} />
                                        : <Package color={colors.slate500} size={16} />}
                                </View>
                                <View style={styles.txInfo}>
                                    <Text style={styles.txName} numberOfLines={1}>
                                        {t.type === 'VENTE'
                                            ? `Vendu à ${t.clientName && t.clientName !== 'Client standard' ? t.clientName : 'Client'}`
                                            : t.type}
                                    </Text>
                                    <Text style={styles.txDate}>
                                        {new Date(t.timestamp).toLocaleDateString('fr-FR', { month: 'short', day: 'numeric' })} • {t.productName}
                                    </Text>
                                </View>
                                <Text style={[styles.txAmount, t.status === 'DETTE' && styles.txDebt]}>
                                    {t.type === 'VENTE' && t.status !== 'DETTE' ? '+' : ''}{t.price.toLocaleString()}F
                                </Text>
                            </View>
                        ))}

                        {history.length === 0 && (
                            <View style={styles.emptyHistory}>
                                <Package color={colors.slate300} size={28} />
                                <Text style={styles.emptyText}>AUCUNE VENTE AUJOURD'HUI</Text>
                            </View>
                        )}
                    </View>
                </View>
            </Animated.ScrollView>

            {/* ── HEADER ABSOLU ── */}
            <Animated.View style={[styles.header, aHeader, { paddingTop: insets.top }]}>

                <View style={[styles.headerNav, { height: NAV_H }]}>
                    <TouchableOpacity style={styles.iconBtn} onPress={() => router.push('/(tabs)/profil')}>
                        <User color={colors.primary} size={20} />
                    </TouchableOpacity>

                    <Animated.Text style={[styles.compactBalance, aCompact]} numberOfLines={1}>
                        {balanceText} F
                    </Animated.Text>

                    <View style={styles.navRight}>
                        <TouchableOpacity style={[styles.iconBtn, { position: 'relative' }]} onPress={() => router.push('/(tabs)/notifications')}>
                            <Bell color={colors.primary} size={20} />
                            {unreadCount > 0 && (
                                <View style={styles.notifBadge}>
                                    <Text style={styles.notifBadgeText}>{unreadCount}</Text>
                                </View>
                            )}
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.iconBtn} onPress={() => setShowBalance(v => !v)}>
                            {showBalance ? <Eye color={colors.primary} size={20} /> : <EyeOff color={colors.primary} size={20} />}
                        </TouchableOpacity>
                    </View>
                </View>

                <Animated.View style={[styles.expandedSection, aExpanded]}>
                    <Text style={styles.balanceLabel}>CAISSE DU JOUR</Text>
                    <View style={styles.balanceRow}>
                        <Text style={[styles.balanceAmount, !showBalance && styles.balanceHidden]}>
                            {balanceText}
                        </Text>
                        <Text style={styles.balanceCurrency}>F</Text>
                    </View>
                    <Text style={styles.balanceGreet}>Bonjour, {firstName} 👋</Text>
                </Animated.View>
            </Animated.View>

        </GestureHandlerRootView>
    );
}

const styles = StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.bgSecondary },

    header: {
        position: 'absolute',
        top: 0, left: 0, right: 0,
        backgroundColor: colors.primary,
        zIndex: 10,
        overflow: 'hidden',
        paddingHorizontal: 16,
    },
    headerNav: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    navRight: { flexDirection: 'row', gap: 8 },
    iconBtn: {
        width: 40, height: 40,
        backgroundColor: colors.white,
        borderRadius: 12,
        alignItems: 'center', justifyContent: 'center',
        shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1, shadowRadius: 4, elevation: 3,
    },
    notifBadge: {
        position: 'absolute', top: -2, right: -2,
        width: 16, height: 16, borderRadius: 4,
        backgroundColor: colors.error,
        borderWidth: 2, borderColor: colors.white,
        alignItems: 'center', justifyContent: 'center',
    },
    notifBadgeText: { fontSize: 8, fontWeight: '900', color: colors.white },
    compactBalance: {
        flex: 1, textAlign: 'center',
        fontSize: 17, fontWeight: '900',
        color: colors.white, letterSpacing: -0.5,
    },
    expandedSection: { alignItems: 'center', paddingBottom: 12 },
    balanceLabel: {
        fontSize: 10, fontWeight: '700',
        color: 'rgba(255,255,255,0.8)',
        letterSpacing: 3, textTransform: 'uppercase', marginBottom: 6,
    },
    balanceRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    balanceAmount: { fontSize: 52, fontWeight: '900', color: colors.white, letterSpacing: -2, lineHeight: 64 },
    balanceHidden: { fontSize: 26, letterSpacing: 10, lineHeight: 64 },
    balanceCurrency: { fontSize: 24, fontWeight: '700', color: 'rgba(255,255,255,0.7)' },
    balanceGreet: { fontSize: 12, fontWeight: '600', color: 'rgba(255,255,255,0.7)', marginTop: 6 },

    scrollContent: { paddingBottom: 32 },
    body: { paddingHorizontal: 16, paddingTop: 20 },

    actionsCard: {
        backgroundColor: colors.white,
        borderRadius: 10, padding: 20, marginBottom: 16,
        borderWidth: 1, borderColor: colors.slate100,
        elevation: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.05, shadowRadius: 4,
    },
    actionsGrid: { flexDirection: 'row', flexWrap: 'wrap' },
    actionItem: { width: ITEM_W, alignItems: 'center', paddingVertical: 12, gap: 6 },
    actionIconBox: { width: 52, height: 52, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
    actionLabel: { fontSize: 10, fontWeight: '700', color: colors.slate700, textAlign: 'center', width: ITEM_W - 8, flexShrink: 0 },

    historyCard: {
        backgroundColor: colors.white,
        borderRadius: 10, padding: 20,
        borderWidth: 1, borderColor: colors.slate100,
        elevation: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.05, shadowRadius: 4,
    },
    historyHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
    historyTitle: { fontSize: 10, fontWeight: '900', color: colors.slate900, letterSpacing: 2, textTransform: 'uppercase' },
    txItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, gap: 12 },
    txItemBorder: { borderTopWidth: 1, borderTopColor: colors.slate100 },
    txIconBox: {
        width: 38, height: 38, borderRadius: 10,
        backgroundColor: colors.slate50, alignItems: 'center', justifyContent: 'center',
        borderWidth: 1, borderColor: colors.slate100,
    },
    txInfo: { flex: 1 },
    txName: { fontSize: 13, fontWeight: '700', color: colors.slate800 },
    txDate: { fontSize: 10, color: colors.slate400, marginTop: 1 },
    txAmount: { fontSize: 13, fontWeight: '700', color: colors.slate800 },
    txDebt: { color: '#f97316' },
    emptyHistory: { alignItems: 'center', paddingVertical: 24, gap: 8 },
    emptyText: { fontSize: 10, fontWeight: '700', color: colors.slate400, letterSpacing: 2, textTransform: 'uppercase' },
});
