// Performances — Coopérative
import React, { useState, useCallback } from 'react';
import {
    View, Text, ScrollView, StyleSheet, TouchableOpacity,
    ActivityIndicator,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import { ChevronLeft, ChevronRight, TrendingUp, TrendingDown } from 'lucide-react-native';
import { ScreenHeader } from '@/src/components/ui';
import { supabase } from '@/src/lib/supabase';
import { colors } from '@/src/lib/colors';

// ── Types ──────────────────────────────────────────────────────────────────────
interface StorePerf {
    store_id: string;
    storeName: string;
    revenue: number;
    txCount: number;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
const MONTH_NAMES = [
    'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
    'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre',
];

const MEDAL_COLORS = ['#f59e0b', '#94a3b8', '#b45309'];
const MEDAL_LABELS = ['1ER', '2ÈME', '3ÈME'];

type SortKey = 'revenue' | 'txCount';

// ── Composant principal ────────────────────────────────────────────────────────
export default function PerformancesScreen() {
    const now = new Date();
    const [year, setYear]     = useState(now.getFullYear());
    const [month, setMonth]   = useState(now.getMonth()); // 0-indexed
    const [rankings, setRankings] = useState<StorePerf[]>([]);
    const [loading, setLoading]   = useState(true);
    const [sortKey, setSortKey]   = useState<SortKey>('revenue');

    const fetchPerformances = useCallback(async (y: number, m: number) => {
        setLoading(true);
        try {
            const startOfMonth = new Date(y, m, 1).toISOString();
            const endOfMonth   = new Date(y, m + 1, 0, 23, 59, 59).toISOString();

            const { data } = await supabase
                .from('transactions')
                .select('store_id, price, type')
                .eq('type', 'VENTE')
                .gte('created_at', startOfMonth)
                .lte('created_at', endOfMonth);

            if (!data) { setRankings([]); return; }

            // Regrouper par store_id
            const map: Record<string, { revenue: number; txCount: number }> = {};
            for (const tx of data as { store_id: string; price: number }[]) {
                if (!map[tx.store_id]) map[tx.store_id] = { revenue: 0, txCount: 0 };
                map[tx.store_id].revenue += tx.price ?? 0;
                map[tx.store_id].txCount += 1;
            }

            const storeIds = Object.keys(map);
            if (storeIds.length === 0) { setRankings([]); setLoading(false); return; }

            // Récupérer les noms des boutiques
            const { data: storesData } = await supabase
                .from('stores')
                .select('id, name')
                .in('id', storeIds);

            const storeNameMap: Record<string, string> = {};
            for (const s of (storesData ?? []) as { id: string; name: string }[]) {
                storeNameMap[s.id] = s.name;
            }

            const list: StorePerf[] = storeIds.map(sid => ({
                store_id:  sid,
                storeName: storeNameMap[sid] ?? sid.slice(0, 8),
                revenue:   map[sid].revenue,
                txCount:   map[sid].txCount,
            }));

            list.sort((a, b) => b.revenue - a.revenue);
            setRankings(list);
        } catch (err) {
            console.error('[Performances] fetch error:', err);
        } finally {
            setLoading(false);
        }
    }, []);

    // Recharge à chaque retour sur l'écran
    useFocusEffect(useCallback(() => { fetchPerformances(year, month); }, [fetchPerformances, year, month]));

    const prevMonth = () => {
        if (month === 0) { setMonth(11); setYear(y => y - 1); }
        else setMonth(m => m - 1);
    };
    const nextMonth = () => {
        const today = new Date();
        if (year === today.getFullYear() && month === today.getMonth()) return;
        if (month === 11) { setMonth(0); setYear(y => y + 1); }
        else setMonth(m => m + 1);
    };

    const sorted = [...rankings].sort((a, b) => b[sortKey] - a[sortKey]);
    const podium = sorted.slice(0, 3);
    const rest   = sorted.slice(3);

    return (
        <View style={styles.safe}>
            <ScreenHeader
                title="Performances"
                subtitle={`${MONTH_NAMES[month]} ${year}`}
                showBack={true}
                paddingBottom={16}
            >
                <View style={styles.monthSelector}>
                    <TouchableOpacity style={styles.monthBtn} onPress={prevMonth}>
                        <ChevronLeft color={colors.white} size={18} />
                    </TouchableOpacity>
                    <Text style={styles.monthLabel}>{MONTH_NAMES[month]} {year}</Text>
                    <TouchableOpacity style={styles.monthBtn} onPress={nextMonth}>
                        <ChevronRight color={colors.white} size={18} />
                    </TouchableOpacity>
                </View>
            </ScreenHeader>

            {/* ── CONTENU ── */}
            <ScrollView
                style={styles.scroll}
                contentContainerStyle={styles.scrollContent}
                showsVerticalScrollIndicator={false}
            >
                {loading ? (
                    <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />
                ) : rankings.length === 0 ? (
                    <View style={styles.emptyCard}>
                        <TrendingUp color={colors.slate300} size={36} />
                        <Text style={styles.emptyText}>AUCUNE DONNÉE CE MOIS</Text>
                    </View>
                ) : (
                    <>
                        {/* Tri */}
                        <View style={styles.sortRow}>
                            <Text style={styles.sectionTitle}>CLASSEMENT</Text>
                            <View style={styles.sortBtns}>
                                <TouchableOpacity
                                    style={[styles.sortBtn, sortKey === 'revenue' && styles.sortBtnActive]}
                                    onPress={() => setSortKey('revenue')}
                                >
                                    <Text style={[styles.sortBtnText, sortKey === 'revenue' && styles.sortBtnTextActive]}>
                                        Revenus
                                    </Text>
                                </TouchableOpacity>
                                <TouchableOpacity
                                    style={[styles.sortBtn, sortKey === 'txCount' && styles.sortBtnActive]}
                                    onPress={() => setSortKey('txCount')}
                                >
                                    <Text style={[styles.sortBtnText, sortKey === 'txCount' && styles.sortBtnTextActive]}>
                                        Transactions
                                    </Text>
                                </TouchableOpacity>
                            </View>
                        </View>

                        {/* Podium */}
                        {podium.length > 0 && (
                            <View style={styles.podiumRow}>
                                {podium.map((store, idx) => (
                                    <View key={store.store_id} style={[styles.podiumCard, idx === 0 && styles.podiumFirst]}>
                                        <View style={[styles.medalBadge, { backgroundColor: MEDAL_COLORS[idx] }]}>
                                            <Text style={styles.medalText}>{MEDAL_LABELS[idx]}</Text>
                                        </View>
                                        <Text style={styles.podiumName} numberOfLines={2}>{store.storeName}</Text>
                                        <Text style={styles.podiumRevenue}>
                                            {store.revenue.toLocaleString('fr-FR')} F
                                        </Text>
                                        <Text style={styles.podiumTx}>{store.txCount} ventes</Text>
                                    </View>
                                ))}
                            </View>
                        )}

                        {/* Liste complète */}
                        {rest.length > 0 && (
                            <>
                                <Text style={styles.sectionTitle}>SUITE DU CLASSEMENT</Text>
                                {rest.map((store, idx) => {
                                    const rank = idx + 4;
                                    return (
                                        <View key={store.store_id} style={styles.rankCard}>
                                            <View style={styles.rankNum}>
                                                <Text style={styles.rankNumText}>{rank}</Text>
                                            </View>
                                            <View style={{ flex: 1, marginLeft: 12 }}>
                                                <Text style={styles.rankName} numberOfLines={1}>{store.storeName}</Text>
                                                <Text style={styles.rankTx}>{store.txCount} transaction(s)</Text>
                                            </View>
                                            <View style={styles.rankRight}>
                                                <Text style={styles.rankRevenue}>
                                                    {store.revenue.toLocaleString('fr-FR')} F
                                                </Text>
                                                {store.revenue > 0
                                                    ? <TrendingUp color={colors.success} size={14} />
                                                    : <TrendingDown color={colors.error} size={14} />
                                                }
                                            </View>
                                        </View>
                                    );
                                })}
                            </>
                        )}
                    </>
                )}
            </ScrollView>
        </View>
    );
}

// ── Styles ─────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.bgSecondary },

    monthSelector: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        backgroundColor: 'rgba(255,255,255,0.15)',
        borderRadius: 10, paddingHorizontal: 8, paddingVertical: 6,
    },
    monthBtn:   { padding: 8 },
    monthLabel: { fontSize: 14, fontWeight: '800', color: colors.white },

    scroll:        { flex: 1 },
    scrollContent: { paddingTop: 20, paddingHorizontal: 16, paddingBottom: 40, gap: 12 },

    sectionTitle: { fontSize: 11, fontWeight: '900', color: colors.slate400, letterSpacing: 2 },

    sortRow:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    sortBtns: { flexDirection: 'row', gap: 6 },
    sortBtn:  {
        paddingHorizontal: 10, paddingVertical: 5,
        borderRadius: 6, borderWidth: 1, borderColor: colors.slate200,
        backgroundColor: colors.white,
    },
    sortBtnActive:     { backgroundColor: colors.primary, borderColor: colors.primary },
    sortBtnText:       { fontSize: 11, fontWeight: '700', color: colors.slate500 },
    sortBtnTextActive: { color: colors.white },

    podiumRow:  { flexDirection: 'row', gap: 8 },
    podiumCard: {
        flex: 1,
        backgroundColor: colors.white,
        borderRadius: 10, padding: 12,
        alignItems: 'center', gap: 6,
        borderWidth: 1, borderColor: colors.slate100,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.05,
        shadowRadius: 4,
        elevation: 2,
    },
    podiumFirst: {
        borderColor: '#f59e0b',
        borderWidth: 2,
    },
    medalBadge: {
        borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3,
    },
    medalText:     { fontSize: 11, fontWeight: '900', color: colors.white },
    podiumName:    { fontSize: 11, fontWeight: '800', color: colors.slate800, textAlign: 'center' },
    podiumRevenue: { fontSize: 12, fontWeight: '900', color: colors.primary, textAlign: 'center' },
    podiumTx:      { fontSize: 11, color: colors.slate400 },

    rankCard: {
        flexDirection: 'row', alignItems: 'center',
        backgroundColor: colors.white,
        borderRadius: 10, padding: 14,
        borderWidth: 1, borderColor: colors.slate100,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.04,
        shadowRadius: 4,
        elevation: 1,
    },
    rankNum: {
        width: 32, height: 32, borderRadius: 8,
        backgroundColor: colors.slate100,
        alignItems: 'center', justifyContent: 'center',
    },
    rankNumText:  { fontSize: 13, fontWeight: '900', color: colors.slate600 },
    rankName:     { fontSize: 13, fontWeight: '700', color: colors.slate800 },
    rankTx:       { fontSize: 11, color: colors.slate400, marginTop: 2 },
    rankRight:    { alignItems: 'flex-end', gap: 2 },
    rankRevenue:  { fontSize: 13, fontWeight: '900', color: colors.slate800 },

    emptyCard: {
        backgroundColor: colors.white, borderRadius: 10, padding: 40,
        alignItems: 'center', borderWidth: 2, borderColor: colors.slate100,
        borderStyle: 'dashed', gap: 12,
    },
    emptyText: { fontSize: 11, fontWeight: '900', color: colors.slate300, letterSpacing: 2 },
});
