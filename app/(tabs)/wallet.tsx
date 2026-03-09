// Portefeuille Marchand — solde, historique financier, graphique semaine
import React, { useState, useCallback, useMemo } from 'react';
import {
    View, Text, ScrollView, StyleSheet, TouchableOpacity,
    ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { ChevronLeft, TrendingUp, TrendingDown, Wallet, ShoppingBag, ShoppingCart } from 'lucide-react-native';
import { supabase } from '@/src/lib/supabase';
import { colors } from '@/src/lib/colors';
import { useProfileContext } from '@/src/context/ProfileContext';

// ── Types ──────────────────────────────────────────────────────────────────────
interface FinancialEntry {
    id: string;
    label: string;
    amount: number;
    type: 'IN' | 'OUT';
    date: string;         // ISO string
    paymentMode?: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
const JOURS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];

/** Retourne le lundi de la semaine contenant `date` (00h00 locale) */
function getMondayOf(date: Date): Date {
    const d = new Date(date);
    const day = d.getDay(); // 0=dim
    const diff = day === 0 ? -6 : 1 - day;
    d.setDate(d.getDate() + diff);
    d.setHours(0, 0, 0, 0);
    return d;
}

function sameDay(a: Date, b: Date): boolean {
    return a.getFullYear() === b.getFullYear()
        && a.getMonth() === b.getMonth()
        && a.getDate() === b.getDate();
}

function startOfMonth(date: Date): Date {
    return new Date(date.getFullYear(), date.getMonth(), 1);
}

// ── Composant principal ────────────────────────────────────────────────────────
export default function WalletScreen() {
    const router = useRouter();
    const { activeProfile } = useProfileContext();

    const [loading, setLoading] = useState(true);
    const [entries, setEntries] = useState<FinancialEntry[]>([]);
    const [weekRevByDay, setWeekRevByDay] = useState<number[]>([0, 0, 0, 0, 0, 0, 0]);

    // ── Fetch ─────────────────────────────────────────────────────────────────
    const fetchWallet = useCallback(async () => {
        if (!activeProfile) return;
        setLoading(true);
        console.log('=== WALLET — fetchWallet, store_id:', activeProfile.id);

        try {
            const now      = new Date();
            const mStart   = startOfMonth(now).toISOString();
            const wMonday  = getMondayOf(now);

            // ── Revenus : ventes encaissées (pas DETTE) ─────────────────────
            const { data: txData, error: txErr } = await supabase
                .from('transactions')
                .select('id, price, product_name, client_name, status, created_at')
                .eq('store_id', activeProfile.id)
                .eq('type', 'VENTE')
                .neq('status', 'DETTE')
                .gte('created_at', mStart)
                .order('created_at', { ascending: false });

            console.log('[Wallet] transactions:', txData?.length ?? 0, 'erreur:', txErr?.message ?? null);

            // ── Dépenses : commandes livrées achetées par ce marchand ───────
            const { data: ordData, error: ordErr } = await supabase
                .from('orders')
                .select('id, total_amount, notes, created_at, products(name)')
                .eq('buyer_store_id', activeProfile.id)
                .eq('status', 'DELIVERED')
                .gte('created_at', mStart)
                .order('created_at', { ascending: false });

            console.log('[Wallet] orders (dépenses):', ordData?.length ?? 0, 'erreur:', ordErr?.message ?? null);

            // ── Construction de la liste financière ─────────────────────────
            const ins: FinancialEntry[] = (txData ?? []).map((t: any) => ({
                id:    'tx_' + t.id,
                label: t.product_name ?? 'Vente',
                amount: t.price,
                type:  'IN',
                date:  t.created_at,
            }));

            const outs: FinancialEntry[] = (ordData ?? []).map((o: any) => ({
                id:    'ord_' + o.id,
                label: (o.products as any)?.name ?? o.notes ?? 'Commande',
                amount: o.total_amount ?? 0,
                type:  'OUT',
                date:  o.created_at,
            }));

            const all = [...ins, ...outs].sort(
                (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
            );
            setEntries(all);

            // ── Graphique semaine : revenus bruts par jour (lun→dim) ────────
            // On re-fetch les transactions de la semaine en cours (pas filtré par mois car
            // semaine peut chevaucher deux mois)
            const { data: weekTx } = await supabase
                .from('transactions')
                .select('price, created_at')
                .eq('store_id', activeProfile.id)
                .eq('type', 'VENTE')
                .neq('status', 'DETTE')
                .gte('created_at', wMonday.toISOString());

            const byDay: number[] = [0, 0, 0, 0, 0, 0, 0];
            for (const t of (weekTx ?? []) as any[]) {
                const d    = new Date(t.created_at);
                const idx  = d.getDay() === 0 ? 6 : d.getDay() - 1; // lun=0 … dim=6
                byDay[idx] += t.price ?? 0;
            }
            setWeekRevByDay(byDay);
        } catch (err) {
            console.error('[Wallet] fetch error:', err);
        } finally {
            setLoading(false);
        }
    }, [activeProfile]);

    useFocusEffect(useCallback(() => { fetchWallet(); }, [fetchWallet]));

    // ── Calculs ───────────────────────────────────────────────────────────────
    const totalIn  = useMemo(() => entries.filter(e => e.type === 'IN').reduce((s, e) => s + e.amount, 0), [entries]);
    const totalOut = useMemo(() => entries.filter(e => e.type === 'OUT').reduce((s, e) => s + e.amount, 0), [entries]);
    const solde    = totalIn - totalOut;
    const maxDay   = Math.max(...weekRevByDay, 1);

    const today      = new Date();
    const todayIdx   = today.getDay() === 0 ? 6 : today.getDay() - 1;

    return (
        <SafeAreaView style={styles.safe} edges={['top']}>

            {/* ── HEADER ── */}
            <View style={styles.header}>
                <View style={styles.headerTop}>
                    <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
                        <ChevronLeft color={colors.white} size={20} />
                    </TouchableOpacity>
                    <View style={styles.headerTitleBlock}>
                        <Text style={styles.headerTitle}>PORTEFEUILLE</Text>
                        <Text style={styles.headerSub}>FINANCES DU MOIS</Text>
                    </View>
                    <View style={{ width: 40 }} />
                </View>

                {/* Solde net */}
                <View style={styles.balanceBlock}>
                    <View style={styles.balanceLabelRow}>
                        <Wallet color="rgba(255,255,255,0.7)" size={14} />
                        <Text style={styles.balanceLabel}>SOLDE NET</Text>
                    </View>
                    {loading ? (
                        <ActivityIndicator color={colors.white} style={{ marginVertical: 12 }} />
                    ) : (
                        <View style={styles.balanceAmountRow}>
                            <Text style={[styles.balanceAmount, solde < 0 && styles.balanceNeg]}>
                                {solde < 0 ? '-' : '+'}{Math.abs(solde).toLocaleString('fr-FR')}
                            </Text>
                            <Text style={styles.balanceCurrency}>F</Text>
                        </View>
                    )}
                </View>

                {/* Stats rapides */}
                <View style={styles.statsRow}>
                    <View style={styles.statCell}>
                        <View style={styles.statIconIn}>
                            <TrendingUp color="#059669" size={12} />
                        </View>
                        <View>
                            <Text style={styles.statValue}>{loading ? '–' : totalIn.toLocaleString('fr-FR')} F</Text>
                            <Text style={styles.statLabel}>REVENUS</Text>
                        </View>
                    </View>
                    <View style={styles.statDivider} />
                    <View style={styles.statCell}>
                        <View style={styles.statIconOut}>
                            <TrendingDown color="#e11d48" size={12} />
                        </View>
                        <View>
                            <Text style={styles.statValue}>{loading ? '–' : totalOut.toLocaleString('fr-FR')} F</Text>
                            <Text style={styles.statLabel}>DÉPENSES</Text>
                        </View>
                    </View>
                </View>
            </View>

            {/* ── CONTENU ── */}
            <ScrollView
                style={styles.scroll}
                contentContainerStyle={styles.scrollContent}
                showsVerticalScrollIndicator={false}
            >
                {/* ── Graphique semaine ── */}
                <View style={styles.card}>
                    <Text style={styles.cardTitle}>REVENUS — SEMAINE EN COURS</Text>
                    <View style={styles.chartArea}>
                        {weekRevByDay.map((val, idx) => {
                            const pct    = maxDay > 0 ? val / maxDay : 0;
                            const isToday = idx === todayIdx;
                            return (
                                <View key={idx} style={styles.barCol}>
                                    <Text style={styles.barValue}>
                                        {val > 0 ? `${Math.round(val / 1000)}k` : ''}
                                    </Text>
                                    <View style={styles.barTrack}>
                                        <View
                                            style={[
                                                styles.barFill,
                                                { height: `${Math.max(pct * 100, val > 0 ? 4 : 0)}%` },
                                                isToday && styles.barFillToday,
                                            ]}
                                        />
                                    </View>
                                    <Text style={[styles.barLabel, isToday && styles.barLabelToday]}>
                                        {JOURS[idx]}
                                    </Text>
                                </View>
                            );
                        })}
                    </View>
                </View>

                {/* ── Historique financier ── */}
                <View style={styles.card}>
                    <Text style={styles.cardTitle}>HISTORIQUE FINANCIER</Text>

                    {loading ? (
                        <ActivityIndicator color={colors.primary} style={{ marginVertical: 24 }} />
                    ) : entries.length === 0 ? (
                        <View style={styles.empty}>
                            <Wallet color={colors.slate200} size={36} />
                            <Text style={styles.emptyText}>AUCUNE OPÉRATION CE MOIS</Text>
                        </View>
                    ) : (
                        entries.slice(0, 30).map((entry, i) => (
                            <View key={entry.id} style={[styles.entryRow, i > 0 && styles.entryBorder]}>
                                <View style={[styles.entryIcon, entry.type === 'IN' ? styles.entryIconIn : styles.entryIconOut]}>
                                    {entry.type === 'IN'
                                        ? <ShoppingBag color="#059669" size={14} />
                                        : <ShoppingCart color="#e11d48" size={14} />
                                    }
                                </View>
                                <View style={styles.entryInfo}>
                                    <Text style={styles.entryLabel} numberOfLines={1}>{entry.label}</Text>
                                    <Text style={styles.entryDate}>
                                        {new Date(entry.date).toLocaleDateString('fr-FR', {
                                            day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
                                        })}
                                    </Text>
                                </View>
                                <Text style={[styles.entryAmount, entry.type === 'IN' ? styles.entryAmountIn : styles.entryAmountOut]}>
                                    {entry.type === 'IN' ? '+' : '-'}{entry.amount.toLocaleString('fr-FR')} F
                                </Text>
                            </View>
                        ))
                    )}
                </View>
            </ScrollView>
        </SafeAreaView>
    );
}

// ── Styles ─────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.bgSecondary },

    // ── Header ──
    header: {
        backgroundColor: colors.primary,
        paddingHorizontal: 16,
        paddingTop: 8,
        paddingBottom: 24,
        borderBottomLeftRadius: 32,
        borderBottomRightRadius: 32,
        gap: 16,
    },
    headerTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    backBtn: {
        width: 40, height: 40, borderRadius: 10,
        backgroundColor: 'rgba(255,255,255,0.2)',
        alignItems: 'center', justifyContent: 'center',
    },
    headerTitleBlock: { alignItems: 'center' },
    headerTitle: { fontSize: 16, fontWeight: '900', color: colors.white, letterSpacing: 1 },
    headerSub:   { fontSize: 9, fontWeight: '700', color: 'rgba(255,255,255,0.7)', letterSpacing: 3, marginTop: 2 },

    // Solde
    balanceBlock:     { alignItems: 'center' },
    balanceLabelRow:  { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 },
    balanceLabel:     { fontSize: 10, fontWeight: '700', color: 'rgba(255,255,255,0.7)', letterSpacing: 3 },
    balanceAmountRow: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
    balanceAmount:    { fontSize: 48, fontWeight: '900', color: colors.white, letterSpacing: -2, lineHeight: 56 },
    balanceNeg:       { color: '#fca5a5' },
    balanceCurrency:  { fontSize: 22, fontWeight: '700', color: 'rgba(255,255,255,0.7)' },

    // Stats
    statsRow: {
        flexDirection: 'row',
        backgroundColor: 'rgba(255,255,255,0.15)',
        borderRadius: 10,
        paddingHorizontal: 16,
        paddingVertical: 12,
    },
    statCell:    { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
    statDivider: { width: 1, backgroundColor: 'rgba(255,255,255,0.3)', marginHorizontal: 12 },
    statIconIn:  { width: 28, height: 28, borderRadius: 8, backgroundColor: '#d1fae5', alignItems: 'center', justifyContent: 'center' },
    statIconOut: { width: 28, height: 28, borderRadius: 8, backgroundColor: '#fee2e2', alignItems: 'center', justifyContent: 'center' },
    statValue:   { fontSize: 13, fontWeight: '900', color: colors.white, lineHeight: 18 },
    statLabel:   { fontSize: 8, fontWeight: '700', color: 'rgba(255,255,255,0.7)', letterSpacing: 1, marginTop: 1 },

    // Scroll
    scroll:        { flex: 1 },
    scrollContent: { paddingHorizontal: 16, paddingTop: 20, paddingBottom: 40, gap: 14 },

    // Cards
    card: {
        backgroundColor: colors.white,
        borderRadius: 10,
        padding: 20,
        borderWidth: 1,
        borderColor: colors.slate100,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 8,
        elevation: 2,
    },
    cardTitle: {
        fontSize: 10, fontWeight: '900',
        color: colors.slate900, letterSpacing: 2,
        marginBottom: 18,
    },

    // ── Graphique barres ──
    chartArea: {
        flexDirection: 'row',
        alignItems: 'flex-end',
        height: 120,
        gap: 6,
    },
    barCol: {
        flex: 1,
        alignItems: 'center',
        height: '100%',
        justifyContent: 'flex-end',
        gap: 4,
    },
    barValue: {
        fontSize: 8, fontWeight: '700',
        color: colors.slate400,
        height: 12,
        textAlign: 'center',
    },
    barTrack: {
        flex: 1,
        width: '100%',
        backgroundColor: colors.slate100,
        borderRadius: 4,
        justifyContent: 'flex-end',
        overflow: 'hidden',
    },
    barFill: {
        width: '100%',
        backgroundColor: colors.primary,
        borderRadius: 4,
    },
    barFillToday: {
        backgroundColor: '#0d9488',
    },
    barLabel: {
        fontSize: 9, fontWeight: '700',
        color: colors.slate400,
        textAlign: 'center',
    },
    barLabelToday: {
        color: colors.primary,
        fontWeight: '900',
    },

    // ── Historique ──
    entryRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, gap: 12 },
    entryBorder: { borderTopWidth: 1, borderTopColor: colors.slate100 },
    entryIcon: {
        width: 36, height: 36, borderRadius: 10,
        alignItems: 'center', justifyContent: 'center',
        flexShrink: 0,
    },
    entryIconIn:  { backgroundColor: '#d1fae5' },
    entryIconOut: { backgroundColor: '#fee2e2' },
    entryInfo:    { flex: 1, minWidth: 0 },
    entryLabel:   { fontSize: 13, fontWeight: '700', color: colors.slate800 },
    entryDate:    { fontSize: 10, color: colors.slate400, marginTop: 2 },
    entryAmount:  { fontSize: 13, fontWeight: '900', flexShrink: 0 },
    entryAmountIn:  { color: '#059669' },
    entryAmountOut: { color: '#e11d48' },

    // Empty
    empty: { alignItems: 'center', paddingVertical: 32, gap: 10 },
    emptyText: { fontSize: 10, fontWeight: '900', color: colors.slate300, letterSpacing: 2 },
});
