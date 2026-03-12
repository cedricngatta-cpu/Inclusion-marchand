// Analyses marché — Coopérative (par boutique, 100% temps réel)
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
    View, Text, ScrollView, StyleSheet, TouchableOpacity,
    ActivityIndicator, RefreshControl,
} from 'react-native';
import { BarChart2 } from 'lucide-react-native';
import { ScreenHeader } from '@/src/components/ui';
import { useFocusEffect } from 'expo-router';
import { supabase } from '@/src/lib/supabase';
import { colors } from '@/src/lib/colors';
import { onSocketEvent } from '@/src/lib/socket';

// ── Types ──────────────────────────────────────────────────────────────────────
interface TxRow {
    store_id: string | null;
    quantity: number | null;
    price: number | null;
    created_at: string;
    storeName: string;
}

interface OrderRow {
    seller_store_id: string | null;
    total_amount: number | null;
    created_at: string;
    storeName: string;
}

interface RoleStat   { label: string; color: string; count: number; pct: number; }
interface ProducerStat { storeId: string; name: string; b2bRevenue: number; orderCount: number; }
interface DayStat    { label: string; date: string; revenue: number; }

// ── Helpers ───────────────────────────────────────────────────────────────────
const PERIOD_TABS = [
    { key: '7d',  label: '7 jours' },
    { key: '30d', label: '30 jours' },
    { key: '3m',  label: '3 mois' },
];
const SHORT_DAYS = ['dim.', 'lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.'];
const BAR_COLORS = ['#059669', '#2563eb', '#7c3aed', '#d97706', '#dc2626'];

function getPeriodStart(key: string): string {
    const now = new Date();
    if (key === '7d')  return new Date(now.getTime() - 7  * 86400_000).toISOString();
    if (key === '30d') return new Date(now.getTime() - 30 * 86400_000).toISOString();
    return new Date(now.getTime() - 90 * 86400_000).toISOString();
}

function toDateStr(iso: string) { return iso.slice(0, 10); }

const ROLE_MAP: Record<string, { key: string; label: string; color: string }> = {
    producer: { key: 'producer', label: 'Producteurs', color: '#059669' },
};
const EXCLUDED_ROLES = ['field_agent', 'agent', 'agent_terrain', 'supervisor', 'admin', 'cooperative', 'merchant'];

// ── Composant principal ────────────────────────────────────────────────────────
export default function AnalysesScreen() {
    const [period, setPeriod]         = useState('7d');
    const [txRows, setTxRows]         = useState<TxRow[]>([]);
    const [orderRows, setOrderRows]   = useState<OrderRow[]>([]);
    const [roleStats, setRoleStats]   = useState<RoleStat[]>([]);
    const [loading, setLoading]       = useState(true);
    const [refreshing, setRefreshing] = useState(false);

    // ── Ref toujours à jour — évite les closures figées ───────────────────────
    const periodRef = useRef(period);
    periodRef.current = period;

    // ── Fetch ventes par période ──────────────────────────────────────────────
    const loadTx = useCallback(async (p: string) => {
        const { data: raw, error } = await supabase
            .from('transactions')
            .select('store_id, quantity, price, created_at')
            .eq('type', 'VENTE')
            .gte('created_at', getPeriodStart(p))
            .order('created_at', { ascending: true });
        if (error) { console.error('[Analyses] loadTx:', error.message); return; }
        const rows = raw ?? [];

        // Noms boutiques en une seule requête
        const ids = [...new Set(rows.map(r => r.store_id).filter(Boolean))] as string[];
        const nameMap: Record<string, string> = {};
        if (ids.length) {
            const { data: stores } = await supabase.from('stores').select('id, name').in('id', ids);
            for (const s of stores ?? []) nameMap[s.id] = s.name;
        }

        setTxRows(rows.map(r => ({
            store_id:   r.store_id,
            quantity:   r.quantity,
            price:      Number(r.price) || 0,
            created_at: r.created_at,
            storeName:  r.store_id ? (nameMap[r.store_id] ?? `Boutique (${r.store_id.slice(0,6)})`) : 'Inconnue',
        })));
    }, []);

    // ── Fetch commandes B2B livrées par période ───────────────────────────────
    const loadOrders = useCallback(async (p: string) => {
        const { data: raw, error } = await supabase
            .from('orders')
            .select('seller_store_id, total_amount, created_at')
            .eq('status', 'DELIVERED')
            .gte('created_at', getPeriodStart(p))
            .order('created_at', { ascending: true });
        if (error) { console.error('[Analyses] loadOrders:', error.message); return; }
        const rows = raw ?? [];

        const ids = [...new Set(rows.map(r => r.seller_store_id).filter(Boolean))] as string[];
        const nameMap: Record<string, string> = {};
        if (ids.length) {
            const { data: stores } = await supabase.from('stores').select('id, name').in('id', ids);
            for (const s of stores ?? []) nameMap[s.id] = s.name;
        }

        setOrderRows(rows.map(r => ({
            seller_store_id: r.seller_store_id,
            total_amount:    Number(r.total_amount) || 0,
            created_at:      r.created_at,
            storeName:       r.seller_store_id ? (nameMap[r.seller_store_id] ?? `Boutique (${r.seller_store_id.slice(0,6)})`) : 'Inconnue',
        })));
    }, []);

    // ── Fetch répartition membres (pas de filtre période) ─────────────────────
    const loadRoles = useCallback(async () => {
        const { data, error } = await supabase.from('profiles').select('role');
        if (error) { console.error('[Analyses] loadRoles:', error.message); return; }
        const counts: Record<string, { label: string; color: string; count: number }> = {};
        let total = 0;
        for (const p of data ?? []) {
            const r = (p.role ?? '').toLowerCase();
            if (EXCLUDED_ROLES.includes(r)) continue;
            const mapped = ROLE_MAP[r];
            if (!mapped) continue;
            total++;
            if (!counts[mapped.key]) counts[mapped.key] = { label: mapped.label, color: mapped.color, count: 0 };
            counts[mapped.key].count++;
        }
        if (!total) { setRoleStats([]); return; }
        setRoleStats(
            Object.values(counts)
                .map(c => ({ ...c, pct: Math.round(c.count / total * 100) }))
                .sort((a, b) => b.count - a.count)
        );
    }, []);

    // ── Chargement principal — lit la période depuis le ref ───────────────────
    // Deps vides intentionnels : on lit toujours periodRef.current à l'intérieur
    const doLoad = useCallback(async (silent = false) => {
        const p = periodRef.current;          // période courante, toujours fraîche
        if (!silent) setLoading(true);
        try {
            await Promise.all([loadTx(p), loadOrders(p), loadRoles()]);
        } catch (err) {
            console.error('[Analyses] doLoad error:', err);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [loadTx, loadOrders, loadRoles]);

    // Déclenche un rechargement complet dès que la période change
    useEffect(() => {
        setLoading(true);
        const p = period;                     // capture locale pour cette exécution
        Promise.all([loadTx(p), loadOrders(p), loadRoles()])
            .finally(() => setLoading(false));
    }, [period, loadTx, loadOrders, loadRoles]);

    // Rechargement silencieux au focus (retour sur l'écran)
    useFocusEffect(useCallback(() => { doLoad(true); }, [doLoad]));

    // ── Supabase Realtime ─────────────────────────────────────────────────────
    useEffect(() => {
        const txCh = supabase.channel('analyses-tx')
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'transactions' },
                () => loadTx(periodRef.current))
            .subscribe();

        const ordCh = supabase.channel('analyses-ord')
            .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'orders' },
                () => loadOrders(periodRef.current))
            .subscribe();

        const profCh = supabase.channel('analyses-prof')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' },
                () => loadRoles())
            .subscribe();

        return () => {
            supabase.removeChannel(txCh);
            supabase.removeChannel(ordCh);
            supabase.removeChannel(profCh);
        };
    }, [loadTx, loadOrders, loadRoles]);

    // ── Socket.io — couche complémentaire ─────────────────────────────────────
    useEffect(() => {
        const u = [
            onSocketEvent('nouvelle-vente',     () => loadTx(periodRef.current)),
            onSocketEvent('livraison-terminee', () => loadOrders(periodRef.current)),
            onSocketEvent('enrolement-valide',  () => loadRoles()),
        ];
        return () => u.forEach(fn => fn());
    }, [loadTx, loadOrders, loadRoles]);

    const onRefresh = useCallback(() => {
        setRefreshing(true);
        doLoad(true);
    }, [doLoad]);

    // ── Calculs dérivés ───────────────────────────────────────────────────────
    const producerStats = useMemo<ProducerStat[]>(() => {
        const map: Record<string, ProducerStat> = {};
        for (const o of orderRows) {
            if (!o.seller_store_id) continue;
            if (!map[o.seller_store_id]) map[o.seller_store_id] = { storeId: o.seller_store_id, name: o.storeName, b2bRevenue: 0, orderCount: 0 };
            map[o.seller_store_id].b2bRevenue += o.total_amount ?? 0;
            map[o.seller_store_id].orderCount += 1;
        }
        return Object.values(map).sort((a, b) => b.b2bRevenue - a.b2bRevenue).slice(0, 5);
    }, [orderRows]);

    const dailyStats = useMemo<DayStat[]>(() => {
        const map: Record<string, DayStat> = {};
        const now = new Date();
        for (let i = 6; i >= 0; i--) {
            const d = new Date(now.getTime() - i * 86400_000);
            const k = toDateStr(d.toISOString());
            map[k] = { label: SHORT_DAYS[d.getDay()], date: k, revenue: 0 };
        }
        for (const tx of txRows) {
            const k = toDateStr(tx.created_at);
            if (map[k]) map[k].revenue += tx.price ?? 0;
        }
        return Object.values(map);
    }, [txRows]);

    const totalTxRevenue  = txRows.reduce((s, t)  => s + (t.price         ?? 0), 0);
    const totalTxCount    = txRows.length;
    const totalB2BRevenue = orderRows.reduce((s, o) => s + (o.total_amount ?? 0), 0);
    const totalB2BCount   = orderRows.length;
    const maxProducerRevenue = producerStats[0]?.b2bRevenue ?? 1;
    const maxDayRevenue      = Math.max(...dailyStats.map(d => d.revenue), 1);

    // ── Rendu ─────────────────────────────────────────────────────────────────
    return (
        <View style={styles.safe}>
            <ScreenHeader title="Analyses" subtitle="Tendances par boutique" showBack={true} paddingBottom={16}>
                <View style={styles.periodRow}>
                    {PERIOD_TABS.map(tab => (
                        <TouchableOpacity
                            key={tab.key}
                            style={[styles.periodBtn, period === tab.key && styles.periodBtnActive]}
                            onPress={() => setPeriod(tab.key)}
                        >
                            <Text style={[styles.periodBtnText, period === tab.key && styles.periodBtnTextActive]}>
                                {tab.label}
                            </Text>
                        </TouchableOpacity>
                    ))}
                </View>
            </ScreenHeader>

            <ScrollView
                style={styles.scroll}
                contentContainerStyle={styles.scrollContent}
                showsVerticalScrollIndicator={false}
                refreshControl={
                    <RefreshControl refreshing={refreshing} onRefresh={onRefresh}
                        colors={[colors.primary]} tintColor={colors.primary} />
                }
            >
                {loading ? (
                    <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />
                ) : (
                    <>
                        {/* ── KPIs ── */}
                        <View style={styles.kpiRow}>
                            <View style={styles.kpiCard}>
                                <Text style={styles.kpiValue}>{totalTxCount}</Text>
                                <Text style={styles.kpiLabel}>Ventes réseau</Text>
                            </View>
                            <View style={styles.kpiCard}>
                                <Text style={styles.kpiValue}>
                                    {totalTxRevenue >= 1000 ? `${Math.round(totalTxRevenue / 1000)}k` : totalTxRevenue.toLocaleString('fr-FR')}
                                </Text>
                                <Text style={styles.kpiLabel}>Revenus ventes (F)</Text>
                            </View>
                            <View style={[styles.kpiCard, { borderTopColor: '#2563eb' }]}>
                                <Text style={[styles.kpiValue, { color: '#2563eb' }]}>{totalB2BCount}</Text>
                                <Text style={styles.kpiLabel}>Commandes B2B</Text>
                            </View>
                            <View style={[styles.kpiCard, { borderTopColor: '#2563eb' }]}>
                                <Text style={[styles.kpiValue, { color: '#2563eb' }]}>
                                    {totalB2BRevenue >= 1000 ? `${Math.round(totalB2BRevenue / 1000)}k` : totalB2BRevenue.toLocaleString('fr-FR')}
                                </Text>
                                <Text style={styles.kpiLabel}>Volume B2B (F)</Text>
                            </View>
                        </View>

                                        {/* ── TOP PRODUCTEURS B2B ── */}
                        <Text style={styles.sectionTitle}>TOP PRODUCTEURS — VENTES B2B</Text>
                        <View style={styles.chartCard}>
                            {producerStats.length === 0 ? (
                                <View style={styles.emptyInline}>
                                    <BarChart2 color={colors.slate300} size={28} />
                                    <Text style={styles.noDataText}>Aucune livraison B2B sur cette période</Text>
                                </View>
                            ) : producerStats.map((pr, idx) => (
                                <View key={pr.storeId} style={styles.storeRow}>
                                    <View style={[styles.storeRank, { backgroundColor: '#dbeafe' }]}>
                                        <Text style={[styles.storeRankText, { color: '#1e40af' }]}>{idx + 1}</Text>
                                    </View>
                                    <View style={styles.storeInfo}>
                                        <View style={styles.hBarHeaderRow}>
                                            <Text style={styles.storeName} numberOfLines={1}>{pr.name}</Text>
                                            <Text style={styles.storeMeta}>{pr.orderCount} commande{pr.orderCount > 1 ? 's' : ''}</Text>
                                        </View>
                                        <View style={styles.hBarTrack}>
                                            <View style={[styles.hBarFill, {
                                                width: `${(pr.b2bRevenue / maxProducerRevenue) * 100}%` as any,
                                                backgroundColor: '#2563eb',
                                            }]} />
                                        </View>
                                    </View>
                                    <Text style={[styles.storeRevenue, { color: '#2563eb' }]}>
                                        {pr.b2bRevenue >= 1000 ? `${Math.round(pr.b2bRevenue / 1000)}k` : pr.b2bRevenue.toLocaleString('fr-FR')}
                                    </Text>
                                </View>
                            ))}
                        </View>

                        {/* ── VENTES PAR JOUR ── */}
                        <Text style={styles.sectionTitle}>VENTES RÉSEAU — 7 DERNIERS JOURS</Text>
                        <View style={styles.chartCard}>
                            <View style={styles.vBarsContainer}>
                                {dailyStats.map((day, idx) => {
                                    const h = (day.revenue / maxDayRevenue) * 100;
                                    return (
                                        <View key={day.date} style={styles.vBarWrapper}>
                                            <Text style={styles.vBarValueAbove} numberOfLines={1}>
                                                {day.revenue > 0 ? (day.revenue >= 1000 ? `${Math.round(day.revenue / 1000)}k` : String(day.revenue)) : ''}
                                            </Text>
                                            <View style={styles.vBarZone}>
                                                <View style={[styles.vBarFill, {
                                                    height: `${Math.max(h, 2)}%` as any,
                                                    backgroundColor: day.revenue > 0 ? BAR_COLORS[idx % BAR_COLORS.length] : colors.slate200,
                                                }]} />
                                            </View>
                                            <Text style={styles.vBarLabel}>{day.label}</Text>
                                        </View>
                                    );
                                })}
                            </View>
                        </View>

                        {/* ── RÉPARTITION MEMBRES ── */}
                        <Text style={styles.sectionTitle}>RÉPARTITION DES MEMBRES</Text>
                        <View style={styles.chartCard}>
                            {roleStats.length === 0 ? (
                                <Text style={styles.noDataText}>Aucun membre enregistré</Text>
                            ) : roleStats.map(row => (
                                <View key={row.label} style={styles.pctRow}>
                                    <View style={[styles.pctDot, { backgroundColor: row.color }]} />
                                    <Text style={styles.pctLabel}>{row.label}</Text>
                                    <View style={styles.pctTrack}>
                                        <View style={[styles.pctFill, { width: `${row.pct}%` as any, backgroundColor: row.color }]} />
                                    </View>
                                    <Text style={styles.pctCount}>{row.count}</Text>
                                    <Text style={styles.pctValue}>{row.pct}%</Text>
                                </View>
                            ))}
                        </View>
                    </>
                )}
            </ScrollView>
        </View>
    );
}

// ── Styles ─────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.bgSecondary },

    periodRow: { flexDirection: 'row', gap: 8 },
    periodBtn: {
        flex: 1, paddingVertical: 8, borderRadius: 8, alignItems: 'center',
        backgroundColor: 'rgba(255,255,255,0.15)',
    },
    periodBtnActive:     { backgroundColor: colors.white },
    periodBtnText:       { fontSize: 12, fontWeight: '700', color: 'rgba(255,255,255,0.8)' },
    periodBtnTextActive: { color: colors.primary },

    scroll:        { flex: 1 },
    scrollContent: { paddingTop: 20, paddingHorizontal: 16, paddingBottom: 40, gap: 14 },

    sectionTitle: { fontSize: 11, fontWeight: '900', color: colors.slate400, letterSpacing: 2, marginBottom: -4 },

    kpiRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    kpiCard: {
        width: '47.5%', backgroundColor: colors.white, borderRadius: 10, padding: 14,
        alignItems: 'center', borderWidth: 1, borderColor: colors.slate100,
        borderTopWidth: 3, borderTopColor: colors.primary,
        shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 4, elevation: 1,
    },
    kpiValue: { fontSize: 20, fontWeight: '900', color: colors.primary },
    kpiLabel: { fontSize: 11, fontWeight: '700', color: colors.slate400, marginTop: 4, textAlign: 'center' },

    chartCard: {
        backgroundColor: colors.white, borderRadius: 10, padding: 14,
        borderWidth: 1, borderColor: colors.slate100, gap: 10,
        shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 4, elevation: 1,
    },

    storeRow:      { flexDirection: 'row', alignItems: 'center', gap: 10 },
    storeRank:     { width: 24, height: 24, borderRadius: 6, backgroundColor: '#ecfdf5', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
    storeRankText: { fontSize: 11, fontWeight: '900', color: colors.primary },
    storeInfo:     { flex: 1, gap: 4 },
    hBarHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    storeName:     { flex: 1, fontSize: 12, fontWeight: '700', color: colors.slate800 },
    storeMeta:     { fontSize: 11, fontWeight: '600', color: colors.slate400, flexShrink: 0, marginLeft: 4 },
    hBarTrack:     { height: 10, borderRadius: 4, backgroundColor: colors.slate100, overflow: 'hidden' },
    hBarFill:      { height: '100%', borderRadius: 4 },
    storeRevenue:  { width: 40, fontSize: 12, fontWeight: '900', color: colors.primary, textAlign: 'right', flexShrink: 0 },

    vBarsContainer: { flexDirection: 'row', alignItems: 'flex-end', height: 130, gap: 4 },
    vBarWrapper:    { flex: 1, alignItems: 'center' },
    vBarValueAbove: { fontSize: 11, fontWeight: '700', color: colors.slate500, marginBottom: 2, textAlign: 'center' },
    vBarZone:       { flex: 1, width: '100%', justifyContent: 'flex-end', borderRadius: 4, overflow: 'hidden' },
    vBarFill:       { width: '100%', borderRadius: 4, minHeight: 3 },
    vBarLabel:      { fontSize: 11, fontWeight: '700', color: colors.slate400, marginTop: 4, textAlign: 'center' },

    pctRow:   { flexDirection: 'row', alignItems: 'center', gap: 8 },
    pctDot:   { width: 10, height: 10, borderRadius: 3, flexShrink: 0 },
    pctLabel: { width: 80, fontSize: 12, fontWeight: '600', color: colors.slate700 },
    pctTrack: { flex: 1, height: 12, borderRadius: 4, backgroundColor: colors.slate100, overflow: 'hidden' },
    pctFill:  { height: '100%', borderRadius: 4 },
    pctCount: { width: 24, fontSize: 11, fontWeight: '700', color: colors.slate500, textAlign: 'right' },
    pctValue: { width: 36, fontSize: 12, fontWeight: '700', color: colors.slate600, textAlign: 'right' },

    emptyInline: { alignItems: 'center', paddingVertical: 12, gap: 8 },
    noDataText:  { fontSize: 11, color: colors.slate400, textAlign: 'center' },
});
