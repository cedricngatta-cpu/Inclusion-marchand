// Dashboard Producteur — fidèle au projet Next.js original
// Design : header vert émeraude, hero revenus, grille 4 KPIs, CTA "Déclarer une Récolte"
import React, { useState, useEffect, useCallback } from 'react';
import {
    View, Text, ScrollView, StyleSheet, TouchableOpacity,
    ActivityIndicator, BackHandler,
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import {
    Package, ShoppingBag,
    Truck, TrendingUp, ChevronRight, Plus, List,
} from 'lucide-react-native';
import { ScreenHeader } from '@/src/components/ui';
import { supabase } from '@/src/lib/supabase';
import { colors } from '@/src/lib/colors';
import { useProfileContext } from '@/src/context/ProfileContext';
import { useAuth } from '@/src/context/AuthContext';
import { onSocketEvent } from '@/src/lib/socket';

const log = (...args: any[]) => { if (__DEV__) console.log(...args); };

// ── Types ──────────────────────────────────────────────────────────────────────
interface RecentOrder {
    id: string;
    status: string;
    quantity: number;
    total_amount: number;
    created_at: string;
    products: { name: string } | null;
    stores:   { name: string } | null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
const STATUS_LABELS: Record<string, string> = {
    PENDING:   'En attente',
    ACCEPTED:  'Acceptée',
    SHIPPED:   'En livraison',
    DELIVERED: 'Livrée',
    CANCELLED: 'Annulée',
};

const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
    PENDING:   { bg: '#fef3c7', text: '#92400e' },
    ACCEPTED:  { bg: '#dbeafe', text: '#1e40af' },
    SHIPPED:   { bg: '#ede9fe', text: '#5b21b6' },
    DELIVERED: { bg: '#d1fae5', text: '#065f46' },
    CANCELLED: { bg: '#fee2e2', text: '#991b1b' },
};

const MONTH_LABELS = [
    'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
    'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre',
];

// ── Composant principal ────────────────────────────────────────────────────────
export default function ProducteurDashboard() {
    const router = useRouter();
    const { activeProfile } = useProfileContext();
    const { user } = useAuth();

    const [revenuMois,     setRevenuMois]     = useState(0);
    const [stockUnits,     setStockUnits]     = useState(0);
    const [stockValue,     setStockValue]     = useState(0);
    const [pendingCount,   setPendingCount]   = useState(0);
    const [monthDeliveries,setMonthDeliveries]= useState(0);
    const [recentOrders,   setRecentOrders]   = useState<RecentOrder[]>([]);
    const [loading,        setLoading]        = useState(true);
    const [showRevenu,     setShowRevenu]     = useState(true);

    const fetchDashboard = useCallback(async () => {
        if (!activeProfile) return;
        setLoading(true);
        log('[Dashboard] activeProfile.id =', activeProfile.id);
        try {
            const debut = new Date();
            debut.setDate(1);
            debut.setHours(0, 0, 0, 0);

            log('[Dashboard] Fetching stock depuis table "stock" WHERE store_id =', activeProfile.id);

            const [prodRes, pendRes, revRes, delivRes, ordersRes] = await Promise.all([
                // Stock — lire depuis la table stock (et non products.quantity)
                supabase
                    .from('stock')
                    .select('quantity, products(price)')
                    .eq('store_id', activeProfile.id),

                // Commandes en attente
                supabase
                    .from('orders')
                    .select('*', { count: 'exact', head: true })
                    .eq('seller_store_id', activeProfile.id)
                    .eq('status', 'PENDING'),

                // Revenus du mois (livrées)
                supabase
                    .from('orders')
                    .select('total_amount')
                    .eq('seller_store_id', activeProfile.id)
                    .eq('status', 'DELIVERED')
                    .gte('created_at', debut.toISOString()),

                // Livraisons ce mois
                supabase
                    .from('orders')
                    .select('*', { count: 'exact', head: true })
                    .eq('seller_store_id', activeProfile.id)
                    .eq('status', 'DELIVERED')
                    .gte('created_at', debut.toISOString()),

                // Commandes récentes
                supabase
                    .from('orders')
                    .select('*, products(name), stores!buyer_store_id(name)')
                    .eq('seller_store_id', activeProfile.id)
                    .order('created_at', { ascending: false })
                    .limit(5),
            ]);

            log('[Dashboard] stock result:', prodRes.data, 'error:', prodRes.error);
            log('[Dashboard] orders PENDING:', pendRes.count, 'error:', pendRes.error);
            log('[Dashboard] revenus data:', revRes.data, 'error:', revRes.error);

            const products = prodRes.data ?? [];
            setStockUnits(products.reduce((s: number, p: any) => s + (p.quantity ?? 0), 0));
            setStockValue(products.reduce((s: number, p: any) => s + (p.quantity ?? 0) * ((p.products as any)?.price ?? 0), 0));
            setPendingCount(pendRes.count ?? 0);
            setRevenuMois((revRes.data ?? []).reduce((s: number, o: any) => s + (o.total_amount ?? 0), 0));
            setMonthDeliveries(delivRes.count ?? 0);
            setRecentOrders((ordersRes.data as RecentOrder[]) || []);
        } catch (err) {
            console.error('[ProducteurDashboard] fetch error:', err);
        } finally {
            setLoading(false);
        }
    }, [activeProfile]);

    useEffect(() => { fetchDashboard(); }, [fetchDashboard]);

    useEffect(() => {
        const unsubs = [
            onSocketEvent('nouvelle-commande',  () => fetchDashboard()),
            onSocketEvent('livraison-terminee', () => fetchDashboard()),
        ];
        return () => unsubs.forEach(fn => fn());
    }, [fetchDashboard]);

    // Recharge à chaque retour sur l'écran (ex: après avoir publié un produit)
    useFocusEffect(useCallback(() => { fetchDashboard(); }, [fetchDashboard]));

    // Bouton retour Android sur le dashboard → quitter l'app
    useFocusEffect(useCallback(() => {
        const backHandler = BackHandler.addEventListener('hardwareBackPress', () => {
            BackHandler.exitApp();
            return true;
        });
        return () => backHandler.remove();
    }, []));

    if (!activeProfile) {
        return (
            <View style={s.safe}>
                <View style={s.center}>
                    <ActivityIndicator color={colors.primary} size="large" />
                </View>
            </View>
        );
    }

    const prenom    = user?.name?.split(' ')[0] ?? 'Producteur';
    const moisLabel = MONTH_LABELS[new Date().getMonth()];

    return (
        <View style={s.safe}>
            <ScreenHeader
                title="Tableau de bord"
                subtitle={`Bonjour, ${prenom}`}
                showBack={false}
                showProfile={true}
                showNotification={true}
                showEye={true}
                eyeVisible={showRevenu}
                onEyeToggle={() => setShowRevenu(v => !v)}
                paddingBottom={24}
            >
                {/* Hero revenus */}
                <View style={s.heroBlock}>
                    <View style={s.heroLabelRow}>
                        <TrendingUp color="rgba(255,255,255,0.7)" size={14} />
                        <Text style={s.heroLabel}>REVENUS — {moisLabel.toUpperCase()}</Text>
                    </View>
                    {loading ? (
                        <ActivityIndicator color={colors.white} style={{ marginVertical: 8 }} />
                    ) : showRevenu ? (
                        <View style={s.heroAmountRow}>
                            <Text style={s.heroAmount}>{revenuMois.toLocaleString('fr-FR')}</Text>
                            <Text style={s.heroCurrency}>F</Text>
                        </View>
                    ) : (
                        <Text style={s.heroHidden}>• • • • •</Text>
                    )}
                    <Text style={s.heroSub}>
                        {monthDeliveries} livraison{monthDeliveries > 1 ? 's' : ''} validée{monthDeliveries > 1 ? 's' : ''}
                    </Text>
                </View>
            </ScreenHeader>

            {/* ════════════════════════════════ CONTENU ══════════════════════════ */}
            <ScrollView
                style={s.scroll}
                contentContainerStyle={s.scrollContent}
                showsVerticalScrollIndicator={false}
                bounces={false}
                overScrollMode="never"
            >
                {/* ── Grille 4 KPIs ── */}
                <View style={s.kpiGrid}>
                    {/* Mon Stock */}
                    <TouchableOpacity
                        style={[s.kpiCell, { borderTopColor: '#f59e0b' }]}
                        activeOpacity={0.82}
                        onPress={() => router.push('/producteur/stock' as any)}
                    >
                        <View style={[s.kpiIconWrap, { backgroundColor: '#fef3c7' }]}>
                            <Package color="#92400e" size={20} />
                        </View>
                        <Text style={s.kpiCellLabel}>MON STOCK</Text>
                        <Text style={s.kpiCellValue}>{loading ? '–' : `${stockUnits} u`}</Text>
                        <Text style={s.kpiCellSub}>{loading ? '' : `${stockValue.toLocaleString('fr-FR')} F`}</Text>
                    </TouchableOpacity>

                    {/* Commandes */}
                    <TouchableOpacity
                        style={[s.kpiCell, { borderTopColor: '#3b82f6' }]}
                        activeOpacity={0.82}
                        onPress={() => router.push('/producteur/commandes' as any)}
                    >
                        <View style={[s.kpiIconWrap, { backgroundColor: '#dbeafe' }]}>
                            <ShoppingBag color="#1e40af" size={20} />
                        </View>
                        {pendingCount > 0 && (
                            <View style={s.kpiBadge}>
                                <Text style={s.kpiBadgeText}>{pendingCount}</Text>
                            </View>
                        )}
                        <Text style={s.kpiCellLabel}>COMMANDES</Text>
                        <Text style={s.kpiCellValue}>{loading ? '–' : pendingCount}</Text>
                        <Text style={s.kpiCellSub}>en attente</Text>
                    </TouchableOpacity>

                    {/* Livraisons */}
                    <TouchableOpacity
                        style={[s.kpiCell, { borderTopColor: '#10b981' }]}
                        activeOpacity={0.82}
                        onPress={() => router.push('/producteur/livraisons' as any)}
                    >
                        <View style={[s.kpiIconWrap, { backgroundColor: '#d1fae5' }]}>
                            <Truck color="#065f46" size={20} />
                        </View>
                        <Text style={s.kpiCellLabel}>LIVRAISONS</Text>
                        <Text style={s.kpiCellValue}>{loading ? '–' : monthDeliveries}</Text>
                        <Text style={s.kpiCellSub}>ce mois</Text>
                    </TouchableOpacity>

                    {/* Revenus */}
                    <TouchableOpacity
                        style={[s.kpiCell, { borderTopColor: '#8b5cf6' }]}
                        activeOpacity={0.82}
                        onPress={() => router.push('/producteur/revenus' as any)}
                    >
                        <View style={[s.kpiIconWrap, { backgroundColor: '#ede9fe' }]}>
                            <TrendingUp color="#5b21b6" size={20} />
                        </View>
                        <Text style={s.kpiCellLabel}>REVENUS</Text>
                        <Text style={s.kpiCellValue}>
                            {loading ? '–' : `${Math.round(revenuMois / 1000)}k`}
                        </Text>
                        <Text style={s.kpiCellSub}>F ce mois</Text>
                    </TouchableOpacity>
                </View>

                {/* ── CTA principal ── */}
                <TouchableOpacity
                    style={s.cta}
                    activeOpacity={0.88}
                    onPress={() => router.push('/producteur/publier' as any)}
                >
                    <Plus color={colors.white} size={20} />
                    <Text style={s.ctaText}>DÉCLARER UNE RÉCOLTE</Text>
                </TouchableOpacity>

                {/* ── Mes produits ── */}
                <TouchableOpacity
                    style={s.ctaSecondary}
                    activeOpacity={0.88}
                    onPress={() => router.push('/producteur/mes-produits' as any)}
                >
                    <List color={colors.primary} size={20} />
                    <Text style={s.ctaSecondaryText}>MES PRODUITS PUBLIÉS</Text>
                </TouchableOpacity>

                {/* ── Dernières commandes ── */}
                <View style={s.sectionHeader}>
                    <Text style={s.sectionTitle}>DERNIÈRES COMMANDES</Text>
                    <TouchableOpacity onPress={() => router.push('/producteur/commandes' as any)}>
                        <Text style={s.sectionLink}>VOIR TOUT</Text>
                    </TouchableOpacity>
                </View>

                {loading ? (
                    <ActivityIndicator color={colors.primary} style={{ marginTop: 16 }} />
                ) : recentOrders.length === 0 ? (
                    <View style={s.emptyCard}>
                        <ShoppingBag color={colors.slate300} size={40} />
                        <Text style={s.emptyText}>AUCUNE COMMANDE REÇUE</Text>
                        <Text style={s.emptySub}>Les commandes des marchands apparaîtront ici</Text>
                    </View>
                ) : (
                    recentOrders.map(order => {
                        const sc = STATUS_COLORS[order.status] ?? STATUS_COLORS.PENDING;
                        return (
                            <TouchableOpacity
                                key={order.id}
                                style={s.orderCard}
                                activeOpacity={0.85}
                                onPress={() => router.push('/producteur/commandes' as any)}
                            >
                                <View style={s.orderInfo}>
                                    <Text style={s.orderProduct} numberOfLines={1}>
                                        {order.products?.name ?? 'Produit'}
                                    </Text>
                                    <Text style={s.orderBuyer} numberOfLines={1}>
                                        {order.stores?.name ?? 'Acheteur inconnu'}
                                    </Text>
                                    <Text style={s.orderMeta}>
                                        {order.quantity} u · {new Date(order.created_at).toLocaleDateString('fr-FR')}
                                    </Text>
                                </View>
                                <View style={s.orderRight}>
                                    <View style={[s.statusBadge, { backgroundColor: sc.bg }]}>
                                        <Text style={[s.statusText, { color: sc.text }]}>
                                            {STATUS_LABELS[order.status] ?? order.status}
                                        </Text>
                                    </View>
                                    {order.total_amount > 0 && (
                                        <Text style={s.orderPrice}>
                                            {order.total_amount.toLocaleString('fr-FR')} F
                                        </Text>
                                    )}
                                    <ChevronRight color={colors.slate300} size={16} />
                                </View>
                            </TouchableOpacity>
                        );
                    })
                )}
            </ScrollView>
        </View>
    );
}

// ── Styles ─────────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
    safe:   { flex: 1, backgroundColor: '#f8fafc' },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center' },

    // Hero
    heroBlock:     { alignItems: 'center', gap: 4 },
    heroLabelRow:  { flexDirection: 'row', alignItems: 'center', gap: 6 },
    heroLabel:     { fontSize: 11, fontWeight: '700', color: 'rgba(255,255,255,0.7)', letterSpacing: 2 },
    heroAmountRow: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
    heroAmount:    { fontSize: 48, fontWeight: '900', color: '#fff', letterSpacing: -2, lineHeight: 56 },
    heroCurrency:  { fontSize: 24, fontWeight: '700', color: 'rgba(255,255,255,0.8)' },
    heroHidden:    { fontSize: 18, fontWeight: '900', color: 'rgba(255,255,255,0.4)', lineHeight: 56, letterSpacing: 4 },
    heroSub:       { fontSize: 11, fontWeight: '700', color: 'rgba(255,255,255,0.5)', letterSpacing: 1, textTransform: 'uppercase', marginTop: 2 },
    heroGreet:     { fontSize: 14, fontWeight: '700', color: 'rgba(255,255,255,0.85)', marginTop: 4 },

    // ── Scroll ──
    scroll:        { flex: 1 },
    scrollContent: { paddingHorizontal: 16, paddingTop: 20, paddingBottom: 40, gap: 14 },

    // ── Grille 4 KPIs ──
    kpiGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
    kpiCell: {
        width: '47.5%',
        backgroundColor: '#fff',
        borderRadius: 10,
        borderTopWidth: 3,
        padding: 14,
        gap: 4,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.06,
        shadowRadius: 4,
        elevation: 2,
    },
    kpiIconWrap:  { width: 40, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
    kpiCellLabel: { fontSize: 11, fontWeight: '800', color: '#94a3b8', letterSpacing: 1.5, textTransform: 'uppercase' },
    kpiCellValue: { fontSize: 22, fontWeight: '900', color: '#1e293b', lineHeight: 26 },
    kpiCellSub:   { fontSize: 11, fontWeight: '600', color: '#94a3b8' },
    kpiBadge: {
        position: 'absolute', top: 10, right: 10,
        backgroundColor: '#ef4444',
        minWidth: 20, height: 20, borderRadius: 6,
        alignItems: 'center', justifyContent: 'center',
        paddingHorizontal: 4,
    },
    kpiBadgeText: { fontSize: 11, fontWeight: '900', color: '#fff' },

    // ── CTA ──
    cta: {
        backgroundColor: '#059669',
        borderRadius: 10,
        paddingVertical: 18,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 10,
        shadowColor: '#059669',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
        elevation: 6,
    },
    ctaText: { fontSize: 13, fontWeight: '900', color: '#fff', letterSpacing: 2 },

    // ── CTA secondaire ──
    ctaSecondary: {
        borderRadius: 10,
        paddingVertical: 16,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 10,
        borderWidth: 2,
        borderColor: '#059669',
        backgroundColor: '#ecfdf5',
    },
    ctaSecondaryText: { fontSize: 13, fontWeight: '900', color: '#059669', letterSpacing: 2 },

    // ── Section ──
    sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    sectionTitle:  { fontSize: 11, fontWeight: '900', color: '#94a3b8', letterSpacing: 2 },
    sectionLink:   { fontSize: 11, fontWeight: '900', color: '#059669', letterSpacing: 1 },

    // ── Commandes ──
    orderCard: {
        flexDirection: 'row', alignItems: 'center',
        backgroundColor: '#fff', borderRadius: 10,
        padding: 14, borderWidth: 1, borderColor: '#f1f5f9',
        gap: 10,
        shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.04, shadowRadius: 4, elevation: 1,
    },
    orderInfo:    { flex: 1, minWidth: 0 },
    orderProduct: { fontSize: 13, fontWeight: '700', color: '#1e293b' },
    orderBuyer:   { fontSize: 11, fontWeight: '600', color: '#64748b', marginTop: 2 },
    orderMeta:    { fontSize: 11, color: '#94a3b8', marginTop: 2 },
    orderRight:   { alignItems: 'flex-end', gap: 4, flexShrink: 0 },
    orderPrice:   { fontSize: 12, fontWeight: '900', color: '#1e293b' },
    statusBadge:  { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
    statusText:   { fontSize: 11, fontWeight: '700' },

    // ── Empty ──
    emptyCard: {
        backgroundColor: '#fff', borderRadius: 10, padding: 40,
        alignItems: 'center', borderWidth: 2, borderColor: '#f1f5f9',
        borderStyle: 'dashed', gap: 8,
    },
    emptyText: { fontSize: 11, fontWeight: '900', color: '#cbd5e1', letterSpacing: 2 },
    emptySub:  { fontSize: 11, color: '#94a3b8', textAlign: 'center' },
});
