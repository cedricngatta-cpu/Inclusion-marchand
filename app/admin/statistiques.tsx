// Statistiques — Admin : analyses et tendances par mois
import React, { useState, useEffect, useCallback } from 'react';
import {
    View, Text, ScrollView, StyleSheet, ActivityIndicator, RefreshControl,
} from 'react-native';
import { TouchableOpacity } from 'react-native-gesture-handler';
import { useFocusEffect } from 'expo-router';
import { ChevronLeft, ChevronRight, TrendingUp, ShoppingBag, Users, Package } from 'lucide-react-native';
import { ScreenHeader } from '@/src/components/ui';
import { supabase } from '@/src/lib/supabase';
import { colors } from '@/src/lib/colors';
import { useAuth } from '@/src/context/AuthContext';

// ── Types ──────────────────────────────────────────────────────────────────────
interface MonthKPIs {
    txCount: number;
    txRevenue: number;
    deliveredOrders: number;
    newMembers: number;
    newProducts: number;
}

interface StoreRank {
    store_id: string;
    storeName: string;
    revenue: number;
}

interface ProductRank {
    product_id: string;
    productName: string;
    units: number;
}

interface RoleCount {
    label: string;
    count: number;
    color: string;
}

interface DailyPoint {
    day: number;
    total: number;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
const MONTH_LABELS = [
    'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
    'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre',
];

const RANK_COLORS = ['#f59e0b', '#94a3b8', '#d97706', '#64748b', '#64748b'];

// ── Composant principal ────────────────────────────────────────────────────────
export default function Statistiques() {
    const now = new Date();
    const [year, setYear]     = useState(now.getFullYear());
    const [month, setMonth]   = useState(now.getMonth()); // 0-indexed

    const [kpis, setKpis]               = useState<MonthKPIs | null>(null);
    const [dailyData, setDailyData]     = useState<DailyPoint[]>([]);
    const [topStores, setTopStores]     = useState<StoreRank[]>([]);
    const [topProducts, setTopProducts] = useState<ProductRank[]>([]);
    const [roleCounts, setRoleCounts]   = useState<RoleCount[]>([]);
    const [loading, setLoading]         = useState(true);
    const [refreshing, setRefreshing]   = useState(false);

    const fetchStats = useCallback(async (y: number, m: number) => {
        setLoading(true);
        try {
            const startOfMonth = new Date(y, m, 1).toISOString();
            const endOfMonth   = new Date(y, m + 1, 0, 23, 59, 59).toISOString();

            // ── KPIs du mois ──────────────────────────────────────────────────
            const [txRes, ordersRes, membersRes, productsRes] = await Promise.all([
                supabase
                    .from('transactions')
                    .select('price')
                    .gte('created_at', startOfMonth)
                    .lte('created_at', endOfMonth),
                supabase
                    .from('orders')
                    .select('*', { count: 'exact', head: true })
                    .eq('status', 'DELIVERED')
                    .gte('created_at', startOfMonth)
                    .lte('created_at', endOfMonth),
                supabase
                    .from('profiles')
                    .select('*', { count: 'exact', head: true })
                    .gte('created_at', startOfMonth)
                    .lte('created_at', endOfMonth),
                supabase
                    .from('products')
                    .select('*', { count: 'exact', head: true })
                    .gte('created_at', startOfMonth)
                    .lte('created_at', endOfMonth),
            ]);

            const txArr = (txRes.data ?? []) as { price: number }[];
            setKpis({
                txCount:         txArr.length,
                txRevenue:       txArr.reduce((s, t) => s + (t.price ?? 0), 0),
                deliveredOrders: ordersRes.count ?? 0,
                newMembers:      membersRes.count ?? 0,
                newProducts:     productsRes.count ?? 0,
            });

            // ── Ventes par jour du mois ───────────────────────────────────────
            const { data: dailyTxData } = await supabase
                .from('transactions')
                .select('created_at, price')
                .gte('created_at', startOfMonth)
                .lte('created_at', endOfMonth);

            const dayMap: Record<number, number> = {};
            for (const t of (dailyTxData ?? []) as { created_at: string; price: number }[]) {
                const day = new Date(t.created_at).getDate();
                dayMap[day] = (dayMap[day] ?? 0) + (t.price ?? 0);
            }
            const daysInMonth = new Date(y, m + 1, 0).getDate();
            const daily: DailyPoint[] = [];
            for (let d = 1; d <= daysInMonth; d++) {
                daily.push({ day: d, total: dayMap[d] ?? 0 });
            }
            setDailyData(daily);

            // ── Top 5 Marchands (par CA) ──────────────────────────────────────
            const { data: txData } = await supabase
                .from('transactions')
                .select('store_id, price')
                .gte('created_at', startOfMonth)
                .lte('created_at', endOfMonth);

            const storeMap: Record<string, number> = {};
            for (const t of (txData ?? []) as { store_id: string; price: number }[]) {
                if (!t.store_id) continue;
                storeMap[t.store_id] = (storeMap[t.store_id] ?? 0) + (t.price ?? 0);
            }
            const storeIds = Object.keys(storeMap);
            let topS: StoreRank[] = [];
            if (storeIds.length > 0) {
                const { data: storesData } = await supabase
                    .from('stores').select('id, name').in('id', storeIds);
                const sMap: Record<string, string> = {};
                for (const s of (storesData ?? []) as { id: string; name: string }[]) sMap[s.id] = s.name;
                topS = storeIds
                    .map(sid => ({ store_id: sid, storeName: sMap[sid] ?? sid.slice(0, 8), revenue: storeMap[sid] }))
                    .sort((a, b) => b.revenue - a.revenue)
                    .slice(0, 5);
            }
            setTopStores(topS);

            // ── Top 5 Produits (par quantité vendue) ──────────────────────────
            const { data: txProdData } = await supabase
                .from('transactions')
                .select('product_id, quantity')
                .gte('created_at', startOfMonth)
                .lte('created_at', endOfMonth);

            const prodMap: Record<string, number> = {};
            for (const t of (txProdData ?? []) as { product_id: string; quantity: number }[]) {
                if (!t.product_id) continue;
                prodMap[t.product_id] = (prodMap[t.product_id] ?? 0) + (t.quantity ?? 1);
            }
            const prodIds = Object.keys(prodMap);
            let topP: ProductRank[] = [];
            if (prodIds.length > 0) {
                const { data: prodsData } = await supabase
                    .from('products').select('id, name').in('id', prodIds);
                const pMap: Record<string, string> = {};
                for (const p of (prodsData ?? []) as { id: string; name: string }[]) pMap[p.id] = p.name;
                topP = prodIds
                    .map(pid => ({ product_id: pid, productName: pMap[pid] ?? 'Produit', units: prodMap[pid] }))
                    .sort((a, b) => b.units - a.units)
                    .slice(0, 5);
            }
            setTopProducts(topP);

            // ── Répartition membres ───────────────────────────────────────────
            const [mRes, proRes, aRes, cRes] = await Promise.all([
                supabase.from('profiles').select('*', { count: 'exact', head: true }).ilike('role', '%merchant%'),
                supabase.from('profiles').select('*', { count: 'exact', head: true }).ilike('role', '%producer%'),
                supabase.from('profiles').select('*', { count: 'exact', head: true }).ilike('role', '%agent%'),
                supabase.from('profiles').select('*', { count: 'exact', head: true }).ilike('role', '%cooperative%'),
            ]);
            setRoleCounts([
                { label: 'Marchands',   count: mRes.count   ?? 0, color: '#059669' },
                { label: 'Producteurs', count: proRes.count ?? 0, color: '#2563eb' },
                { label: 'Agents',      count: aRes.count   ?? 0, color: '#d97706' },
                { label: 'Coopératives',count: cRes.count   ?? 0, color: '#7c3aed' },
            ]);
        } catch (err) {
            console.error('[Statistiques] fetch error:', err);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, []);

    useEffect(() => { fetchStats(year, month); }, [fetchStats, year, month]);

    const onRefresh = useCallback(() => { setRefreshing(true); fetchStats(year, month); }, [fetchStats, year, month]);

    useFocusEffect(useCallback(() => { fetchStats(year, month); }, [fetchStats, year, month]));

    // ── Sélecteur mois ────────────────────────────────────────────────────────
    const isCurrentMonth = year === now.getFullYear() && month === now.getMonth();

    const prevMonth = () => {
        if (month === 0) { setMonth(11); setYear(y => y - 1); }
        else setMonth(m => m - 1);
    };
    const nextMonth = () => {
        if (isCurrentMonth) return;
        if (month === 11) { setMonth(0); setYear(y => y + 1); }
        else setMonth(m => m + 1);
    };

    // ── KPIs grid config ──────────────────────────────────────────────────────
    const KPI_CARDS = [
        {
            label: 'VENTES',
            Icon: ShoppingBag,
            value: kpis ? String(kpis.txCount) : '–',
            sub:   kpis ? `${kpis.txRevenue.toLocaleString('fr-FR')} F` : '',
            color: '#059669',
            bg:    '#d1fae5',
        },
        {
            label: 'COMMANDES LIVRÉES',
            Icon: TrendingUp,
            value: kpis ? String(kpis.deliveredOrders) : '–',
            sub:   'B2B',
            color: '#2563eb',
            bg:    '#dbeafe',
        },
        {
            label: 'NOUVEAUX MEMBRES',
            Icon: Users,
            value: kpis ? String(kpis.newMembers) : '–',
            sub:   'inscrits',
            color: '#d97706',
            bg:    '#fef3c7',
        },
        {
            label: 'PRODUITS PUBLIÉS',
            Icon: Package,
            value: kpis ? String(kpis.newProducts) : '–',
            sub:   'ce mois',
            color: '#7c3aed',
            bg:    '#ede9fe',
        },
    ];

    const maxRevenue   = topStores[0]?.revenue ?? 1;
    const maxUnits     = topProducts[0]?.units ?? 1;
    const maxRoleCount = Math.max(...roleCounts.map(r => r.count), 1);
    const maxDayTotal  = Math.max(...dailyData.map(d => d.total), 1);

    return (
        <View style={s.safe}>
            <ScreenHeader title="Statistiques" subtitle="Analyses réseau" showBack={true} paddingBottom={16}>
                <View style={s.monthSelector}>
                    <TouchableOpacity style={s.monthBtn} onPress={prevMonth}>
                        <ChevronLeft color={colors.white} size={18} />
                    </TouchableOpacity>
                    <Text style={s.monthLabel}>{MONTH_LABELS[month]} {year}</Text>
                    <TouchableOpacity
                        style={[s.monthBtn, isCurrentMonth && { opacity: 0.3 }]}
                        onPress={nextMonth}
                        disabled={isCurrentMonth}
                    >
                        <ChevronRight color={colors.white} size={18} />
                    </TouchableOpacity>
                </View>
            </ScreenHeader>

            <ScrollView
                style={s.scroll}
                contentContainerStyle={s.scrollContent}
                showsVerticalScrollIndicator={false}
                bounces={false}
                overScrollMode="never"
                refreshControl={
                    <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.primary]} />
                }
            >
                {loading ? (
                    <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />
                ) : (
                    <>
                        {/* ── Section 0 : Courbe ventes par jour ── */}
                        <Text style={s.sectionTitle}>VENTES PAR JOUR</Text>
                        <View style={s.chartCard}>
                            {dailyData.every(d => d.total === 0) ? (
                                <View style={s.chartEmpty}>
                                    <Text style={s.chartEmptyText}>Aucune vente ce mois</Text>
                                </View>
                            ) : (
                                <ScrollView
                                    horizontal
                                    showsHorizontalScrollIndicator={false}
                                    contentContainerStyle={s.chartContent}
                                >
                                    {dailyData.map(d => {
                                        const barH = d.total > 0
                                            ? Math.max(4, Math.round((d.total / maxDayTotal) * 72))
                                            : 0;
                                        const isToday = year === now.getFullYear()
                                            && month === now.getMonth()
                                            && d.day === now.getDate();
                                        const hasData = d.total > 0;
                                        return (
                                            <View key={d.day} style={s.barCol}>
                                                <Text style={s.barTopLabel}>
                                                    {hasData
                                                        ? d.total >= 1000
                                                            ? `${Math.round(d.total / 1000)}k`
                                                            : String(d.total)
                                                        : ''
                                                    }
                                                </Text>
                                                <View style={s.barTrackVert}>
                                                    <View style={[
                                                        s.barFillVert,
                                                        {
                                                            height: barH,
                                                            backgroundColor: isToday ? '#f59e0b' : colors.primary,
                                                        },
                                                    ]} />
                                                </View>
                                                <Text style={[
                                                    s.barDayLabel,
                                                    isToday && { color: '#f59e0b', fontWeight: '900' },
                                                ]}>
                                                    {d.day}
                                                </Text>
                                            </View>
                                        );
                                    })}
                                </ScrollView>
                            )}
                        </View>

                        {/* ── Section 1 : KPIs du mois ── */}
                        <Text style={s.sectionTitle}>KPIs DU MOIS</Text>
                        <View style={s.kpiGrid}>
                            {KPI_CARDS.map(k => (
                                <View key={k.label} style={s.kpiCard}>
                                    <View style={[s.kpiIconWrap, { backgroundColor: k.bg }]}>
                                        <k.Icon color={k.color} size={20} />
                                    </View>
                                    <Text style={s.kpiCardLabel}>{k.label}</Text>
                                    <Text style={s.kpiCardValue}>{k.value}</Text>
                                    <Text style={s.kpiCardSub}>{k.sub}</Text>
                                </View>
                            ))}
                        </View>

                        {/* ── Section 2 : Top 5 Marchands ── */}
                        <Text style={s.sectionTitle}>TOP 5 MARCHANDS</Text>
                        {topStores.length === 0 ? (
                            <View style={s.emptySmall}>
                                <Text style={s.emptySmallText}>Aucune donnée ce mois</Text>
                            </View>
                        ) : (
                            <View style={s.rankCard}>
                                {topStores.map((store, idx) => {
                                    const barPct = Math.max(4, Math.round((store.revenue / maxRevenue) * 100));
                                    return (
                                        <View key={store.store_id} style={s.rankRow}>
                                            <View style={[s.rankBadge, { backgroundColor: RANK_COLORS[idx] }]}>
                                                <Text style={s.rankBadgeText}>{idx + 1}</Text>
                                            </View>
                                            <View style={s.rankInfo}>
                                                <Text style={s.rankName} numberOfLines={1}>{store.storeName}</Text>
                                                <View style={s.barTrack}>
                                                    <View style={[s.barFill, {
                                                        backgroundColor: colors.primary,
                                                        width: `${barPct}%`,
                                                    }]} />
                                                </View>
                                            </View>
                                            <Text style={s.rankAmount}>
                                                {store.revenue.toLocaleString('fr-FR')} F
                                            </Text>
                                        </View>
                                    );
                                })}
                            </View>
                        )}

                        {/* ── Section 3 : Top 5 Produits ── */}
                        <Text style={s.sectionTitle}>TOP 5 PRODUITS VENDUS</Text>
                        {topProducts.length === 0 ? (
                            <View style={s.emptySmall}>
                                <Text style={s.emptySmallText}>Aucune donnée ce mois</Text>
                            </View>
                        ) : (
                            <View style={s.rankCard}>
                                {topProducts.map((prod, idx) => {
                                    const barPct = Math.max(4, Math.round((prod.units / maxUnits) * 100));
                                    return (
                                        <View key={prod.product_id} style={s.rankRow}>
                                            <View style={[s.rankBadge, { backgroundColor: RANK_COLORS[idx] }]}>
                                                <Text style={s.rankBadgeText}>{idx + 1}</Text>
                                            </View>
                                            <View style={s.rankInfo}>
                                                <Text style={s.rankName} numberOfLines={1}>{prod.productName}</Text>
                                                <View style={s.barTrack}>
                                                    <View style={[s.barFill, {
                                                        backgroundColor: '#2563eb',
                                                        width: `${barPct}%`,
                                                    }]} />
                                                </View>
                                            </View>
                                            <Text style={s.rankAmount}>{prod.units} u</Text>
                                        </View>
                                    );
                                })}
                            </View>
                        )}

                        {/* ── Section 4 : Répartition membres ── */}
                        <Text style={s.sectionTitle}>RÉPARTITION MEMBRES</Text>
                        <View style={s.rankCard}>
                            {roleCounts.map(role => {
                                const barPct = Math.max(4, Math.round((role.count / maxRoleCount) * 100));
                                return (
                                    <View key={role.label} style={s.rankRow}>
                                        <View style={[s.roleDot, { backgroundColor: role.color }]} />
                                        <View style={s.rankInfo}>
                                            <Text style={s.rankName}>{role.label}</Text>
                                            <View style={s.barTrack}>
                                                <View style={[s.barFill, {
                                                    backgroundColor: role.color,
                                                    width: `${barPct}%`,
                                                }]} />
                                            </View>
                                        </View>
                                        <Text style={s.rankAmount}>{role.count}</Text>
                                    </View>
                                );
                            })}
                        </View>
                    </>
                )}
            </ScrollView>
        </View>
    );
}

// ── Styles ─────────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
    safe: { flex: 1, backgroundColor: '#f8fafc' },

    monthSelector: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        backgroundColor: 'rgba(255,255,255,0.15)',
        borderRadius: 10, paddingHorizontal: 8, paddingVertical: 6,
    },
    monthBtn:   { padding: 6 },
    monthLabel: { fontSize: 14, fontWeight: '800', color: '#fff' },

    scroll:        { flex: 1 },
    scrollContent: { paddingHorizontal: 16, paddingTop: 20, paddingBottom: 40, gap: 12 },

    sectionTitle: { fontSize: 11, fontWeight: '900', color: '#94a3b8', letterSpacing: 2, textTransform: 'uppercase' },

    // Graphique ventes par jour
    chartCard: {
        backgroundColor: '#fff', borderRadius: 10,
        borderWidth: 1, borderColor: '#f1f5f9',
        shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.04, shadowRadius: 4, elevation: 1,
        overflow: 'hidden',
    },
    chartContent: {
        flexDirection: 'row', alignItems: 'flex-end',
        paddingHorizontal: 12, paddingTop: 8, paddingBottom: 0, gap: 6,
    },
    chartEmpty: { padding: 24, alignItems: 'center' },
    chartEmptyText: { fontSize: 12, color: '#94a3b8', fontWeight: '600' },
    barCol: { alignItems: 'center', width: 22, gap: 3 },
    barTopLabel: {
        fontSize: 11, fontWeight: '700', color: '#64748b',
        textAlign: 'center', height: 12,
    },
    barTrackVert: {
        width: 14, height: 72,
        backgroundColor: '#f1f5f9', borderRadius: 4,
        justifyContent: 'flex-end', overflow: 'hidden',
    },
    barFillVert: { width: 14, borderRadius: 4 },
    barDayLabel: {
        fontSize: 11, fontWeight: '600', color: '#94a3b8',
        textAlign: 'center', marginTop: 4, marginBottom: 8,
    },

    // KPIs grid 2x2
    kpiGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
    kpiCard: {
        width: '47.5%',
        backgroundColor: '#fff', borderRadius: 10,
        padding: 14, gap: 4,
        borderWidth: 1, borderColor: '#f1f5f9',
        shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.04, shadowRadius: 4, elevation: 1,
    },
    kpiIconWrap:   { width: 40, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginBottom: 2 },
    kpiCardLabel:  { fontSize: 11, fontWeight: '800', color: '#94a3b8', letterSpacing: 1.2, textTransform: 'uppercase' },
    kpiCardValue:  { fontSize: 22, fontWeight: '900', color: '#1e293b', lineHeight: 26 },
    kpiCardSub:    { fontSize: 11, fontWeight: '600', color: '#94a3b8' },

    // Ranking card
    rankCard: {
        backgroundColor: '#fff', borderRadius: 10, padding: 16,
        borderWidth: 1, borderColor: '#f1f5f9', gap: 12,
        shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.04, shadowRadius: 4, elevation: 1,
    },
    rankRow:  { flexDirection: 'row', alignItems: 'center', gap: 10 },
    rankBadge: {
        width: 28, height: 28, borderRadius: 8,
        alignItems: 'center', justifyContent: 'center', flexShrink: 0,
    },
    rankBadgeText: { fontSize: 11, fontWeight: '900', color: '#fff' },
    rankInfo:  { flex: 1, gap: 4, minWidth: 0 },
    rankName:  { fontSize: 12, fontWeight: '700', color: '#1e293b' },
    barTrack: {
        height: 6, backgroundColor: '#f1f5f9', borderRadius: 3, overflow: 'hidden',
    },
    barFill:  { height: 6, borderRadius: 3 },
    rankAmount: { fontSize: 12, fontWeight: '900', color: '#1e293b', flexShrink: 0, minWidth: 60, textAlign: 'right' },

    roleDot: {
        width: 14, height: 14, borderRadius: 4, flexShrink: 0,
    },

    emptySmall: {
        backgroundColor: '#fff', borderRadius: 10, padding: 20,
        alignItems: 'center', borderWidth: 1, borderColor: '#f1f5f9',
    },
    emptySmallText: { fontSize: 12, color: '#94a3b8', fontWeight: '600' },
});
