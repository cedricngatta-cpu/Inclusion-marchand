// Dashboard Marchand — header collapsible, UI thread only, zéro conflit de gestes
import React, { useState, useCallback, useEffect } from 'react';
import { View, Text, StyleSheet, BackHandler, Platform, useWindowDimensions, ScrollView, Pressable } from 'react-native';
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
    TrendingUp, Landmark, Wallet, GraduationCap, Lightbulb, Users, Truck, AlertTriangle,
} from 'lucide-react-native';
import { useAuth } from '@/src/context/AuthContext';
import { useNotifications } from '@/src/context/NotificationContext';
import { useHistoryContext } from '@/src/context/HistoryContext';
import { useProfileContext } from '@/src/context/ProfileContext';
import { onSocketEvent } from '@/src/lib/socket';
import { supabase } from '@/src/lib/supabase';
import { colors } from '@/src/lib/colors';
import OfflineBadge from '@/src/components/OfflineBadge';

const quickActions = [
    { id: 'vendre',  name: 'Vendre',     icon: ShoppingBag, bg: colors.primaryBg, color: colors.primary, path: '/(tabs)/vendre' },
    { id: 'stock',   name: 'Stock',      icon: Package,     bg: '#fffbeb', color: '#d97706', path: '/(tabs)/stock' },
    { id: 'bilan',   name: 'Bilan',      icon: PieChart,    bg: '#eff6ff', color: '#2563eb', path: '/(tabs)/bilan' },
    { id: 'carnet',  name: 'Carnet',     icon: BookOpen,    bg: '#fff1f2', color: '#e11d48', path: '/(tabs)/carnet' },
    { id: 'wallet',  name: 'Wallet',     icon: Wallet,      bg: '#fefce8', color: '#ca8a04', path: '/(tabs)/wallet' },
    { id: 'finance', name: 'Finance',    icon: Landmark,    bg: '#faf5ff', color: '#7c3aed', path: '/(tabs)/finance' },
    { id: 'marche',  name: 'Marché',     icon: Store,       bg: '#eef2ff', color: '#4338ca', path: '/(tabs)/marche' },
    { id: 'revenus', name: 'Revenus',    icon: TrendingUp,  bg: '#f0fdf4', color: '#16a34a', path: '/(tabs)/revenus' },
    { id: 'scanner',   name: 'Scanner',    icon: QrCode,         bg: '#f8fafc', color: '#475569', path: '/(tabs)/scanner' },
    { id: 'formation', name: 'Formation',  icon: GraduationCap,  bg: '#fdf4ff', color: '#a21caf', path: '/(tabs)/formation' },
    { id: 'conseils',       name: 'Conseils',   icon: Lightbulb,  bg: '#fffbeb', color: '#b45309', path: '/(tabs)/conseils' },
    { id: 'achats-groupes', name: 'Groupé',     icon: Users,       bg: '#fdf4ff', color: '#7c3aed', path: '/(tabs)/achats-groupes' },
    { id: 'mes-commandes',  name: 'Commandes',  icon: Truck,       bg: '#eff6ff', color: '#2563eb', path: '/(tabs)/mes-commandes' },
];

const NAV_H     = 56;
const CONTENT_H = 140;
const SCROLL_R  = 100;
const OVERLAP   = 36;

export default function CommercantScreen() {
    const router = useRouter();
    const { user } = useAuth();
    const { activeProfile } = useProfileContext();
    const { unreadCount, refreshNotifications } = useNotifications();
    const { balance, history, refreshHistory } = useHistoryContext();
    const { width } = useWindowDimensions();
    const isDesktop = Platform.OS === 'web' && width > 768;

    // ── États desktop uniquement ──────────────────────────────────────────────
    const [caMois,           setCaMois]           = useState(0);
    const [ventesCount,      setVentesCount]      = useState(0);
    const [stockCount,       setStockCount]       = useState(0);
    const [ruptureCount,     setRuptureCount]     = useState(0);
    const [lowStockProducts, setLowStockProducts] = useState<{ name: string; quantity: number }[]>([]);
    const [commandesCount,   setCommandesCount]   = useState(0);
    const [commandesPending, setCommandesPending] = useState(0);
    const [cashTotal,        setCashTotal]        = useState(0);
    const [momoTotal,        setMomoTotal]        = useState(0);

    // activeProfile.id = store_id (table stores) — stable, pas l'objet entier
    const storeId = activeProfile?.id;

    const fetchDesktopData = useCallback(async () => {
        if (!storeId) return;

        const debut = new Date(); debut.setDate(1); debut.setHours(0, 0, 0, 0);
        const { data: txMois } = await supabase
            .from('transactions').select('price, status, created_at')
            .eq('store_id', storeId).eq('type', 'VENTE')
            .gte('created_at', debut.toISOString());

        const today = new Date().toDateString();
        let ventes = 0, cash = 0, momo = 0, ca = 0;
        for (const tx of txMois ?? []) {
            ca += tx.price ?? 0;
            if (new Date(tx.created_at).toDateString() === today) {
                ventes++;
                if (tx.status === 'MOMO') momo += tx.price ?? 0;
                else cash += tx.price ?? 0;
            }
        }
        setCaMois(ca);
        setVentesCount(ventes);
        setCashTotal(cash);
        setMomoTotal(momo);

        const { data: stockRows } = await supabase
            .from('stock').select('quantity, products(name)')
            .eq('store_id', storeId);
        const produits = (stockRows ?? []).map((r: any) => ({
            name: r.products?.name ?? 'Produit',
            quantity: r.quantity ?? 0,
        }));
        setStockCount(produits.length);
        const ruptures = produits.filter(p => p.quantity === 0);
        const basSeuil = produits.filter(p => p.quantity > 0 && p.quantity <= 3);
        setRuptureCount(ruptures.length);
        setLowStockProducts([...ruptures, ...basSeuil].slice(0, 6));

        const { data: orders } = await supabase
            .from('orders').select('status').eq('buyer_store_id', storeId);
        setCommandesCount(orders?.length ?? 0);
        setCommandesPending(orders?.filter((o: any) => o.status === 'PENDING').length ?? 0);
    }, [storeId]);

    // Focus : [] est le pattern Expo Router standard — useFocusEffect re-run au focus, pas sur les deps
    useFocusEffect(useCallback(() => {
        refreshHistory();
        refreshNotifications();
        if (isDesktop) fetchDesktopData();
    }, [isDesktop, fetchDesktopData]));

    // Fetch desktop : relancé quand profileId change OU quand isDesktop devient true
    useEffect(() => {
        if (isDesktop) fetchDesktopData();
    }, [fetchDesktopData, isDesktop]);

    // Socket : [] — s'attache une seule fois, pas à chaque render
    useEffect(() => {
        return onSocketEvent('nouvelle-vente', () => {
            refreshHistory().catch(console.error);
        });
    }, []);

    // Bouton retour Android sur le dashboard → quitter l'app (Android uniquement)
    useFocusEffect(useCallback(() => {
        if (Platform.OS !== 'android') return;
        const backHandler = BackHandler.addEventListener('hardwareBackPress', () => {
            BackHandler.exitApp();
            return true;
        });
        return () => backHandler.remove();
    }, []));

    const [showBalance, setShowBalance] = useState(true);
    const insets = useSafeAreaInsets();

    const ITEM_W   = width / 4; // 4 colonnes mobile

    const firstName   = user?.name?.split(' ')[0] || 'Marchand';
    const balanceText = showBalance ? balance.toLocaleString('fr-FR') : '••••••';
    const totalPay    = cashTotal + momoTotal;
    const cashPct     = totalPay > 0 ? Math.round((cashTotal / totalPay) * 100) : 0;
    const momoPct     = totalPay > 0 ? Math.round((momoTotal / totalPay) * 100) : 0;

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

    // ── Layout desktop — dashboard informatif ────────────────────────────────
    if (isDesktop) {
        const fmt = (n: number) => n.toLocaleString('fr-FR');
        const dCard: any = {
            backgroundColor: '#FFF', borderRadius: 12, padding: 24,
            shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
            shadowOpacity: 0.06, shadowRadius: 12, elevation: 3,
        };
        return (
            <ScrollView style={{ flex: 1, backgroundColor: '#F9FAFB' }}
                contentContainerStyle={{ maxWidth: 1400, alignSelf: 'center' as any, width: '100%' as any, padding: 32 }}
                showsVerticalScrollIndicator={false}
            >
                {/* En-tête */}
                <View style={{ marginBottom: 28 }}>
                    <Text style={{ fontSize: 24, fontWeight: '900', color: '#1F2937' }}>
                        Bonjour, {firstName}
                    </Text>
                    <Text style={{ fontSize: 14, color: '#6B7280', marginTop: 4 }}>
                        Voici votre tableau de bord du jour
                    </Text>
                    <OfflineBadge showPending />
                </View>

                {/* LIGNE 1 — 4 KPIs */}
                <View style={{ flexDirection: 'row', gap: 20, marginBottom: 24 }}>
                    {[
                        { label: 'CAISSE DU JOUR',     value: `${fmt(balance)} F`, sub: `${ventesCount} vente${ventesCount > 1 ? 's' : ''}`,        subColor: '#6B7280' },
                        { label: 'CA DU MOIS',          value: `${fmt(caMois)} F`,   sub: 'Ce mois-ci',                                               subColor: '#6B7280' },
                        { label: 'PRODUITS EN STOCK',   value: String(stockCount),   sub: `${ruptureCount} en rupture`,                               subColor: ruptureCount > 0 ? '#DC2626' : colors.success },
                        { label: 'COMMANDES B2B',       value: String(commandesCount), sub: `${commandesPending} en attente`,                         subColor: commandesPending > 0 ? '#D97706' : colors.success },
                    ].map((kpi, i) => (
                        <View key={i} style={{ flex: 1, ...dCard }}>
                            <Text style={{ fontSize: 10, fontWeight: '800', color: '#6B7280', letterSpacing: 1 }}>{kpi.label}</Text>
                            <Text style={{ fontSize: 28, fontWeight: '900', color: '#1F2937', marginTop: 8 }}>{kpi.value}</Text>
                            <Text style={{ fontSize: 12, color: kpi.subColor, marginTop: 4 }}>{kpi.sub}</Text>
                        </View>
                    ))}
                </View>

                {/* LIGNE 2 — Dernières ventes + Alertes stock */}
                <View style={{ flexDirection: 'row', gap: 20, marginBottom: 24 }}>
                    {/* Dernières ventes */}
                    <View style={{ flex: 1, ...dCard }}>
                        <Text style={{ fontSize: 14, fontWeight: '800', color: '#1F2937', marginBottom: 16 }}>Dernières ventes</Text>
                        {history.length === 0 && (
                            <Text style={{ fontSize: 13, color: '#9CA3AF', textAlign: 'center', paddingVertical: 20 }}>Aucune vente aujourd'hui</Text>
                        )}
                        {history.slice(0, 5).map((tx, i) => (
                            <View key={tx.id} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 10, borderBottomWidth: i < Math.min(history.length, 5) - 1 ? 1 : 0, borderBottomColor: '#F3F4F6' }}>
                                <View style={{ flex: 1 }}>
                                    <Text style={{ fontSize: 13, fontWeight: '600', color: '#1F2937' }} numberOfLines={1}>{tx.productName}</Text>
                                    <Text style={{ fontSize: 11, color: '#6B7280' }}>
                                        {tx.clientName && tx.clientName !== 'Client standard' ? tx.clientName : 'Client'} · {new Date(tx.timestamp).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                                    </Text>
                                </View>
                                <Text style={{ fontSize: 14, fontWeight: '800', color: tx.status === 'DETTE' ? '#F97316' : colors.success, marginLeft: 12 }}>
                                    {tx.status !== 'DETTE' ? '+' : ''}{fmt(tx.price)} F
                                </Text>
                            </View>
                        ))}
                    </View>

                    {/* Alertes stock */}
                    <View style={{ flex: 1, ...dCard }}>
                        <Text style={{ fontSize: 14, fontWeight: '800', color: '#1F2937', marginBottom: 16 }}>Alertes stock</Text>
                        {lowStockProducts.length === 0 && (
                            <Text style={{ fontSize: 13, color: colors.success, textAlign: 'center', paddingVertical: 20 }}>Tout est en ordre</Text>
                        )}
                        {lowStockProducts.map((p, i) => (
                            <View key={i} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 10, borderBottomWidth: i < lowStockProducts.length - 1 ? 1 : 0, borderBottomColor: '#F3F4F6' }}>
                                <Text style={{ fontSize: 13, fontWeight: '600', color: '#1F2937' }} numberOfLines={1}>{p.name}</Text>
                                <View style={{ backgroundColor: p.quantity === 0 ? '#FEE2E2' : '#FEF3C7', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6 }}>
                                    <Text style={{ fontSize: 11, fontWeight: '700', color: p.quantity === 0 ? '#DC2626' : '#D97706' }}>
                                        {p.quantity === 0 ? 'RUPTURE' : `${p.quantity} restants`}
                                    </Text>
                                </View>
                            </View>
                        ))}
                    </View>
                </View>

                {/* LIGNE 3 — Répartition paiements + Actions rapides */}
                <View style={{ flexDirection: 'row', gap: 20 }}>
                    {/* Répartition paiements */}
                    <View style={{ flex: 1, ...dCard }}>
                        <Text style={{ fontSize: 14, fontWeight: '800', color: '#1F2937', marginBottom: 18 }}>Répartition des paiements (aujourd'hui)</Text>
                        <View style={{ gap: 16 }}>
                            {[
                                { label: 'Espèces', total: cashTotal, pct: cashPct, color: colors.primary },
                                { label: 'Mobile Money', total: momoTotal, pct: momoPct, color: '#2563EB' },
                            ].map((item, i) => (
                                <View key={i}>
                                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }}>
                                        <Text style={{ fontSize: 13, color: '#6B7280' }}>{item.label}</Text>
                                        <Text style={{ fontSize: 13, fontWeight: '700', color: '#1F2937' }}>{fmt(item.total)} F ({item.pct}%)</Text>
                                    </View>
                                    <View style={{ height: 8, backgroundColor: '#F3F4F6', borderRadius: 4 }}>
                                        <View style={{ height: 8, backgroundColor: item.color, borderRadius: 4, width: `${item.pct}%` as any }} />
                                    </View>
                                </View>
                            ))}
                        </View>
                    </View>

                    {/* Actions rapides */}
                    <View style={{ flex: 1, maxWidth: 320, ...dCard }}>
                        <Text style={{ fontSize: 14, fontWeight: '800', color: '#1F2937', marginBottom: 16 }}>Actions rapides</Text>
                        {[
                            { label: 'Nouvelle vente',       path: '/(tabs)/vendre',       bg: colors.primaryBg, color: colors.primary, Icon: ShoppingBag },
                            { label: 'Commander au marché',   path: '/(tabs)/marche',        bg: '#EFF6FF', color: '#2563EB', Icon: Store },
                            { label: 'Gérer le stock',        path: '/(tabs)/stock',         bg: '#FEF3C7', color: '#D97706', Icon: AlertTriangle },
                            { label: 'Voir le bilan',         path: '/(tabs)/bilan',         bg: '#F5F3FF', color: '#7C3AED', Icon: PieChart },
                        ].map((a, i) => (
                            <TouchableOpacity key={i} onPress={() => router.push(a.path as any)}
                                activeOpacity={0.7}
                                style={{ flexDirection: 'row', alignItems: 'center', padding: 14, backgroundColor: a.bg, borderRadius: 10, marginBottom: i < 3 ? 10 : 0 }}
                            >
                                <a.Icon color={a.color} size={18} />
                                <Text style={{ marginLeft: 10, fontSize: 13, fontWeight: '700', color: a.color }}>{a.label}</Text>
                            </TouchableOpacity>
                        ))}
                    </View>
                </View>
            </ScrollView>
        );
    }

    return (
        // GestureHandlerRootView évite les conflits entre gestes longs et scroll
        <GestureHandlerRootView style={styles.root}>

            {/* ── SCROLL (Animated.ScrollView Reanimated + anti-bounce) ── */}
            <Animated.ScrollView
                onScroll={scrollHandler}
                scrollEventThrottle={16}
                contentContainerStyle={[styles.scrollContent, { paddingTop: isDesktop ? 0 : SCROLL_TOP }]}
                showsVerticalScrollIndicator={false}
                bounces={false}
                overScrollMode="never"
            >
                <View style={[styles.body, isDesktop && { paddingHorizontal: 24 }]}>

                    {/* Résumé caisse — visible uniquement desktop (remplace l'header flottant) */}
                    {isDesktop && (
                        <View style={dtSt.balanceCard}>
                            <View style={dtSt.balanceLeft}>
                                <Text style={dtSt.balanceLabel}>CAISSE DU JOUR</Text>
                                <Text style={dtSt.balanceAmt}>{balanceText} F CFA</Text>
                                <Text style={dtSt.balanceGreet}>Bonjour, {firstName} 👋</Text>
                            </View>
                            <TouchableOpacity onPress={() => setShowBalance(v => !v)} style={dtSt.eyeBtn}>
                                {showBalance
                                    ? <Eye color={colors.primary} size={22} />
                                    : <EyeOff color={colors.primary} size={22} />}
                            </TouchableOpacity>
                        </View>
                    )}

                    {/* Badge offline */}
                    <OfflineBadge showPending />

                    {/* Grille des actions rapides */}
                    <View style={styles.actionsCard}>
                        <View style={styles.actionsGrid}>
                            {quickActions.map(action => (
                                <TouchableOpacity
                                    key={action.id}
                                    style={[styles.actionItem, { width: ITEM_W }]}
                                    onPress={() => router.push(action.path as any)}
                                    activeOpacity={0.7}
                                >
                                    <View style={[styles.actionIconBox, { backgroundColor: action.bg }]}>
                                        <action.icon color={action.color} size={24} strokeWidth={2} />
                                    </View>
                                    <Text style={[styles.actionLabel, { width: ITEM_W - 8 }]} numberOfLines={1} ellipsizeMode="tail">{action.name}</Text>
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

            {/* ── HEADER ABSOLU — masqué sur desktop (remplacé par dtSt.balanceCard) ── */}
            {!isDesktop && <Animated.View style={[styles.header, aHeader, { paddingTop: insets.top }]}>

                <View style={[styles.headerNav, { height: NAV_H }]}>
                    <Pressable style={({ pressed }) => [styles.iconBtn, pressed && styles.iconBtnPressed]} onPress={() => router.push('/(tabs)/profil')}>
                        <User color={colors.primary} size={20} />
                    </Pressable>

                    <Animated.View style={[styles.compactBalanceWrap, aCompact]} pointerEvents="none">
                        <Text style={styles.compactBalance} numberOfLines={1}>
                            {balanceText} F
                        </Text>
                    </Animated.View>

                    <View style={styles.navRight}>
                        <Pressable style={({ pressed }) => [styles.iconBtn, { position: 'relative' as const }, pressed && styles.iconBtnPressed]} onPress={() => router.push('/(tabs)/notifications')}>
                            <Bell color={colors.primary} size={20} />
                            {unreadCount > 0 && (
                                <View style={styles.notifBadge}>
                                    <Text style={styles.notifBadgeText}>{unreadCount}</Text>
                                </View>
                            )}
                        </Pressable>
                        <Pressable style={({ pressed }) => [styles.iconBtn, pressed && styles.iconBtnPressed]} onPress={() => setShowBalance(v => !v)}>
                            {showBalance ? <Eye color={colors.primary} size={20} /> : <EyeOff color={colors.primary} size={20} />}
                        </Pressable>
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
            </Animated.View>}

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
        zIndex: 20,
        ...(Platform.OS === 'web' ? { cursor: 'pointer' as any } : {}),
    },
    iconBtnPressed: { opacity: 0.7 },
    notifBadge: {
        position: 'absolute', top: -2, right: -2,
        width: 16, height: 16, borderRadius: 4,
        backgroundColor: colors.error,
        borderWidth: 2, borderColor: colors.white,
        alignItems: 'center', justifyContent: 'center',
    },
    notifBadgeText: { fontSize: 11, fontWeight: '900', color: colors.white },
    compactBalanceWrap: {
        flex: 1,
    },
    compactBalance: {
        textAlign: 'center',
        fontSize: 17, fontWeight: '900',
        color: colors.white, letterSpacing: -0.5,
    },
    expandedSection: { alignItems: 'center', paddingBottom: 12 },
    balanceLabel: {
        fontSize: 11, fontWeight: '700',
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
    actionItem: { alignItems: 'center', paddingVertical: 12, gap: 6 },
    actionIconBox: { width: 52, height: 52, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
    actionLabel: { fontSize: 11, fontWeight: '700', color: colors.slate700, textAlign: 'center', flexShrink: 0 },

    historyCard: {
        backgroundColor: colors.white,
        borderRadius: 10, padding: 20,
        borderWidth: 1, borderColor: colors.slate100,
        elevation: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.05, shadowRadius: 4,
    },
    historyHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
    historyTitle: { fontSize: 11, fontWeight: '900', color: colors.slate900, letterSpacing: 2, textTransform: 'uppercase' },
    txItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, gap: 12 },
    txItemBorder: { borderTopWidth: 1, borderTopColor: colors.slate100 },
    txIconBox: {
        width: 38, height: 38, borderRadius: 10,
        backgroundColor: colors.slate50, alignItems: 'center', justifyContent: 'center',
        borderWidth: 1, borderColor: colors.slate100,
    },
    txInfo: { flex: 1 },
    txName: { fontSize: 13, fontWeight: '700', color: colors.slate800 },
    txDate: { fontSize: 11, color: colors.slate400, marginTop: 1 },
    txAmount: { fontSize: 13, fontWeight: '700', color: colors.slate800 },
    txDebt: { color: '#f97316' },
    emptyHistory: { alignItems: 'center', paddingVertical: 24, gap: 8 },
    emptyText: { fontSize: 11, fontWeight: '700', color: colors.slate400, letterSpacing: 2, textTransform: 'uppercase' },
});

// ── Styles desktop uniquement ─────────────────────────────────────────────
const dtSt = StyleSheet.create({
    balanceCard: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        backgroundColor: colors.white,
        borderRadius: 10, padding: 24, marginBottom: 16,
        borderWidth: 1, borderColor: colors.slate100,
        elevation: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.05, shadowRadius: 4,
    },
    balanceLeft: { gap: 4 },
    balanceLabel: { fontSize: 11, fontWeight: '700', color: colors.slate400, letterSpacing: 3, textTransform: 'uppercase' },
    balanceAmt:   { fontSize: 36, fontWeight: '900', color: colors.slate900, letterSpacing: -1 },
    balanceGreet: { fontSize: 13, fontWeight: '600', color: colors.slate400 },
    eyeBtn: {
        width: 44, height: 44, borderRadius: 10,
        backgroundColor: colors.slate50, alignItems: 'center', justifyContent: 'center',
    },
});
