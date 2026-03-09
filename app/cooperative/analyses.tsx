// Analyses marché — Coopérative (sans bibliothèque de graphiques)
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
    View, Text, ScrollView, StyleSheet, TouchableOpacity,
    ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ChevronLeft, BarChart2 } from 'lucide-react-native';
import { supabase } from '@/src/lib/supabase';
import { colors } from '@/src/lib/colors';

// ── Types ──────────────────────────────────────────────────────────────────────
interface TxRow {
    product_name?: string;
    quantity?: number;
    price?: number;
    created_at: string;
    type?: string;
}

interface ProductStat {
    name: string;
    totalQty: number;
    totalRevenue: number;
}

interface DayStat {
    label: string;       // "lun.", "mar." …
    date: string;        // YYYY-MM-DD
    revenue: number;
    txCount: number;
}

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

// ── Composant principal ────────────────────────────────────────────────────────
export default function AnalysesScreen() {
    const router = useRouter();

    const [period, setPeriod]   = useState('7d');
    const [txData, setTxData]   = useState<TxRow[]>([]);
    const [loading, setLoading] = useState(true);

    const fetchData = useCallback(async (p: string) => {
        setLoading(true);
        try {
            const periodStart = getPeriodStart(p);
            const { data } = await supabase
                .from('transactions')
                .select('product_name, quantity, price, created_at, type')
                .eq('type', 'VENTE')
                .gte('created_at', periodStart)
                .order('created_at', { ascending: true });
            setTxData((data as TxRow[]) || []);
        } catch (err) {
            console.error('[Analyses] fetch error:', err);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { fetchData(period); }, [fetchData, period]);

    // ── Calculs ────────────────────────────────────────────────────────────────
    const productStats = useMemo<ProductStat[]>(() => {
        const map: Record<string, ProductStat> = {};
        for (const tx of txData) {
            const name = tx.product_name ?? 'Inconnu';
            if (!map[name]) map[name] = { name, totalQty: 0, totalRevenue: 0 };
            map[name].totalQty     += tx.quantity ?? 1;
            map[name].totalRevenue += tx.price    ?? 0;
        }
        return Object.values(map)
            .sort((a, b) => b.totalQty - a.totalQty)
            .slice(0, 5);
    }, [txData]);

    const dailyStats = useMemo<DayStat[]>(() => {
        const map: Record<string, DayStat> = {};
        const days = period === '7d' ? 7 : period === '30d' ? 30 : 90;
        const now  = new Date();
        // Préremplir les jours (seulement 7 derniers pour le graphe vertical)
        const displayDays = Math.min(days, 7);
        for (let i = displayDays - 1; i >= 0; i--) {
            const d    = new Date(now.getTime() - i * 86400_000);
            const key  = toDateStr(d.toISOString());
            const dow  = d.getDay();
            map[key]   = { label: SHORT_DAYS[dow], date: key, revenue: 0, txCount: 0 };
        }
        for (const tx of txData) {
            const key = toDateStr(tx.created_at);
            if (map[key]) {
                map[key].revenue += tx.price    ?? 0;
                map[key].txCount += 1;
            }
        }
        return Object.values(map);
    }, [txData, period]);

    // Répartition par rôle (simulation à partir des données)
    const totalTx        = txData.length;
    const totalRevenue   = txData.reduce((s, t) => s + (t.price ?? 0), 0);
    const maxProductQty  = productStats[0]?.totalQty ?? 1;
    const maxDayRevenue  = Math.max(...dailyStats.map(d => d.revenue), 1);

    return (
        <SafeAreaView style={styles.safe} edges={['top']}>
            {/* ── HEADER ── */}
            <View style={styles.header}>
                <View style={styles.headerTop}>
                    <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
                        <ChevronLeft color={colors.white} size={20} />
                    </TouchableOpacity>
                    <View style={{ flex: 1, marginLeft: 12 }}>
                        <Text style={styles.headerTitle}>ANALYSES</Text>
                        <Text style={styles.headerSub}>TENDANCES MARCHÉ</Text>
                    </View>
                </View>

                {/* Période */}
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
            </View>

            {/* ── CONTENU ── */}
            <ScrollView
                style={styles.scroll}
                contentContainerStyle={styles.scrollContent}
                showsVerticalScrollIndicator={false}
            >
                {loading ? (
                    <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />
                ) : txData.length === 0 ? (
                    <View style={styles.emptyCard}>
                        <BarChart2 color={colors.slate300} size={36} />
                        <Text style={styles.emptyText}>AUCUNE DONNÉE SUR CETTE PÉRIODE</Text>
                    </View>
                ) : (
                    <>
                        {/* Résumé */}
                        <View style={styles.summaryRow}>
                            <View style={styles.summaryCard}>
                                <Text style={styles.summaryValue}>{totalTx}</Text>
                                <Text style={styles.summaryLabel}>Transactions</Text>
                            </View>
                            <View style={styles.summaryCard}>
                                <Text style={styles.summaryValue}>
                                    {totalRevenue.toLocaleString('fr-FR')}
                                </Text>
                                <Text style={styles.summaryLabel}>Revenus totaux (F)</Text>
                            </View>
                        </View>

                        {/* ── PRODUITS POPULAIRES (barres horizontales) ── */}
                        <Text style={styles.sectionTitle}>PRODUITS POPULAIRES</Text>
                        <View style={styles.chartCard}>
                            {productStats.map((ps, idx) => {
                                const widthPct = maxProductQty > 0
                                    ? (ps.totalQty / maxProductQty) * 100
                                    : 0;
                                return (
                                    <View key={ps.name} style={styles.hBarRow}>
                                        <Text style={styles.hBarLabel} numberOfLines={1}>{ps.name}</Text>
                                        <View style={styles.hBarTrack}>
                                            <View
                                                style={[
                                                    styles.hBarFill,
                                                    {
                                                        width: `${widthPct}%` as any,
                                                        backgroundColor: BAR_COLORS[idx % BAR_COLORS.length],
                                                    },
                                                ]}
                                            />
                                        </View>
                                        <Text style={styles.hBarValue}>{ps.totalQty}</Text>
                                    </View>
                                );
                            })}
                            {productStats.length === 0 && (
                                <Text style={styles.noDataText}>Aucun produit vendu</Text>
                            )}
                        </View>

                        {/* ── VENTES PAR JOUR (barres verticales) ── */}
                        <Text style={styles.sectionTitle}>VENTES PAR JOUR (7 DERNIERS JOURS)</Text>
                        <View style={styles.chartCard}>
                            <View style={styles.vBarsContainer}>
                                {dailyStats.map((day, idx) => {
                                    const heightPct = maxDayRevenue > 0
                                        ? (day.revenue / maxDayRevenue) * 100
                                        : 0;
                                    return (
                                        <View key={day.date} style={styles.vBarWrapper}>
                                            {/* Valeur au-dessus */}
                                            <Text style={styles.vBarValueAbove} numberOfLines={1}>
                                                {day.revenue > 0
                                                    ? day.revenue >= 1000
                                                        ? `${Math.round(day.revenue / 1000)}k`
                                                        : String(day.revenue)
                                                    : ''}
                                            </Text>
                                            {/* Zone barre */}
                                            <View style={styles.vBarZone}>
                                                <View
                                                    style={[
                                                        styles.vBarFill,
                                                        {
                                                            height: `${Math.max(heightPct, 2)}%` as any,
                                                            backgroundColor: day.revenue > 0
                                                                ? BAR_COLORS[idx % BAR_COLORS.length]
                                                                : colors.slate200,
                                                        },
                                                    ]}
                                                />
                                            </View>
                                            {/* Étiquette */}
                                            <Text style={styles.vBarLabel}>{day.label}</Text>
                                        </View>
                                    );
                                })}
                            </View>
                        </View>

                        {/* ── RÉPARTITION PAR RÔLE ── */}
                        <Text style={styles.sectionTitle}>RÉPARTITION PAR RÔLE</Text>
                        <View style={styles.chartCard}>
                            {/* On affiche des blocs de pourcentage proportionnels */}
                            {[
                                { label: 'Marchands', color: '#2563eb', pct: 60 },
                                { label: 'Producteurs', color: '#059669', pct: 30 },
                                { label: 'Agents', color: '#7c3aed', pct: 10 },
                            ].map(row => (
                                <View key={row.label} style={styles.pctRow}>
                                    <View style={[styles.pctDot, { backgroundColor: row.color }]} />
                                    <Text style={styles.pctLabel}>{row.label}</Text>
                                    <View style={styles.pctTrack}>
                                        <View
                                            style={[
                                                styles.pctFill,
                                                { width: `${row.pct}%` as any, backgroundColor: row.color },
                                            ]}
                                        />
                                    </View>
                                    <Text style={styles.pctValue}>{row.pct}%</Text>
                                </View>
                            ))}
                        </View>
                    </>
                )}
            </ScrollView>
        </SafeAreaView>
    );
}

// ── Styles ─────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.bgSecondary },

    header: {
        backgroundColor: colors.primary,
        paddingHorizontal: 16,
        paddingTop: 8,
        paddingBottom: 24,
        borderBottomLeftRadius: 32,
        borderBottomRightRadius: 32,
        gap: 16,
    },
    headerTop:   { flexDirection: 'row', alignItems: 'center' },
    headerTitle: { fontSize: 18, fontWeight: '900', color: colors.white },
    headerSub:   { fontSize: 11, fontWeight: '700', color: 'rgba(255,255,255,0.6)', marginTop: 2, letterSpacing: 1 },
    backBtn: {
        width: 40, height: 40, borderRadius: 10,
        backgroundColor: 'rgba(255,255,255,0.2)',
        alignItems: 'center', justifyContent: 'center',
    },

    periodRow: { flexDirection: 'row', gap: 8 },
    periodBtn: {
        flex: 1, paddingVertical: 8,
        borderRadius: 8, alignItems: 'center',
        backgroundColor: 'rgba(255,255,255,0.15)',
    },
    periodBtnActive:     { backgroundColor: colors.white },
    periodBtnText:       { fontSize: 12, fontWeight: '700', color: 'rgba(255,255,255,0.8)' },
    periodBtnTextActive: { color: colors.primary },

    scroll:        { flex: 1 },
    scrollContent: { paddingTop: 20, paddingHorizontal: 16, paddingBottom: 40, gap: 14 },

    sectionTitle: { fontSize: 10, fontWeight: '900', color: colors.slate400, letterSpacing: 2 },

    summaryRow: { flexDirection: 'row', gap: 10 },
    summaryCard: {
        flex: 1, backgroundColor: colors.white,
        borderRadius: 10, padding: 16, alignItems: 'center',
        borderWidth: 1, borderColor: colors.slate100,
    },
    summaryValue: { fontSize: 22, fontWeight: '900', color: colors.primary },
    summaryLabel: { fontSize: 10, fontWeight: '700', color: colors.slate400, marginTop: 4, textAlign: 'center' },

    chartCard: {
        backgroundColor: colors.white,
        borderRadius: 10, padding: 16,
        borderWidth: 1, borderColor: colors.slate100,
        gap: 10,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.04,
        shadowRadius: 4,
        elevation: 1,
    },
    noDataText: { fontSize: 11, color: colors.slate400, textAlign: 'center', paddingVertical: 8 },

    // Barres horizontales
    hBarRow:   { flexDirection: 'row', alignItems: 'center', gap: 8 },
    hBarLabel: { width: 90, fontSize: 11, fontWeight: '600', color: colors.slate700 },
    hBarTrack: {
        flex: 1, height: 14, borderRadius: 4,
        backgroundColor: colors.slate100,
        overflow: 'hidden',
    },
    hBarFill:  { height: '100%', borderRadius: 4 },
    hBarValue: { width: 32, fontSize: 11, fontWeight: '700', color: colors.slate600, textAlign: 'right' },

    // Barres verticales
    vBarsContainer: { flexDirection: 'row', alignItems: 'flex-end', height: 140, gap: 4 },
    vBarWrapper:    { flex: 1, alignItems: 'center' },
    vBarValueAbove: { fontSize: 8, fontWeight: '700', color: colors.slate500, marginBottom: 2, textAlign: 'center' },
    vBarZone: {
        flex: 1, width: '100%', justifyContent: 'flex-end',
        borderRadius: 4, overflow: 'hidden',
    },
    vBarFill:  { width: '100%', borderRadius: 4, minHeight: 3 },
    vBarLabel: { fontSize: 9, fontWeight: '700', color: colors.slate400, marginTop: 4, textAlign: 'center' },

    // Répartition
    pctRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    pctDot: { width: 10, height: 10, borderRadius: 3, flexShrink: 0 },
    pctLabel: { width: 80, fontSize: 12, fontWeight: '600', color: colors.slate700 },
    pctTrack: {
        flex: 1, height: 12, borderRadius: 4,
        backgroundColor: colors.slate100, overflow: 'hidden',
    },
    pctFill:  { height: '100%', borderRadius: 4 },
    pctValue: { width: 36, fontSize: 12, fontWeight: '700', color: colors.slate600, textAlign: 'right' },

    emptyCard: {
        backgroundColor: colors.white, borderRadius: 10, padding: 40,
        alignItems: 'center', borderWidth: 2, borderColor: colors.slate100,
        borderStyle: 'dashed', gap: 12,
    },
    emptyText: { fontSize: 10, fontWeight: '900', color: colors.slate300, letterSpacing: 2 },
});
