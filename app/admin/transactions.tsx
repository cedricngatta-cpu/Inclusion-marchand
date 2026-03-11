// Transactions — Admin : liste globale de toutes les ventes
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
    View, Text, ScrollView, FlatList, StyleSheet, ActivityIndicator, RefreshControl,
} from 'react-native';
import { TouchableOpacity } from 'react-native-gesture-handler';
import { useFocusEffect } from 'expo-router';
import { ShoppingBag, TrendingUp } from 'lucide-react-native';
import { ScreenHeader } from '@/src/components/ui';
import { supabase } from '@/src/lib/supabase';
import { colors } from '@/src/lib/colors';
import { useAuth } from '@/src/context/AuthContext';

// ── Types ──────────────────────────────────────────────────────────────────────
interface Transaction {
    id: string;
    price: number;
    quantity: number;
    client_name: string | null;
    type: string;
    status: string;
    created_at: string;
    product_id: string | null;
    store_id: string | null;
    productName?: string;
    storeName?: string;
}

type TxFilter = 'toutes' | 'ventes' | 'dettes';

const PAGE_SIZE = 20;

// ── Helpers ───────────────────────────────────────────────────────────────────
const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
    PAYÉ:  { bg: '#d1fae5', text: '#065f46' },
    VENTE: { bg: '#d1fae5', text: '#065f46' },
    DETTE: { bg: '#fee2e2', text: '#991b1b' },
    MOMO:  { bg: '#dbeafe', text: '#1e40af' },
};

function getTxColor(tx: Transaction): { bg: string; icon: string } {
    if (tx.status === 'DETTE' || tx.type === 'DETTE') return { bg: '#fee2e2', icon: '#991b1b' };
    if (tx.status === 'MOMO' || tx.type === 'MOMO')   return { bg: '#dbeafe', icon: '#1e40af' };
    return { bg: '#d1fae5', icon: '#065f46' };
}

const TX_FILTERS: { key: TxFilter; label: string }[] = [
    { key: 'toutes', label: 'Toutes' },
    { key: 'ventes', label: 'Ventes' },
    { key: 'dettes', label: 'Dettes' },
];

// ── Carte transaction (mémoïsée) ──────────────────────────────────────────────
const TxCard = React.memo(({ tx }: { tx: Transaction }) => {
    const tc = getTxColor(tx);
    const sc = STATUS_COLORS[tx.status] ?? STATUS_COLORS[tx.type] ?? { bg: '#f1f5f9', text: '#475569' };
    return (
        <View style={s.txCard}>
            <View style={[s.txIcon, { backgroundColor: tc.bg }]}>
                <ShoppingBag color={tc.icon} size={18} />
            </View>
            <View style={s.txInfo}>
                <Text style={s.txProduct} numberOfLines={1}>{tx.productName}</Text>
                <Text style={s.txClient} numberOfLines={1}>
                    {tx.client_name ?? 'Client inconnu'} · {tx.storeName}
                </Text>
                <Text style={s.txDate}>
                    {new Date(tx.created_at).toLocaleDateString('fr-FR', {
                        day: '2-digit', month: 'short', year: 'numeric',
                    })}
                </Text>
            </View>
            <View style={s.txRight}>
                <Text style={s.txAmount}>{(tx.price ?? 0).toLocaleString('fr-FR')} F</Text>
                <View style={[s.statusBadge, { backgroundColor: sc.bg }]}>
                    <Text style={[s.statusText, { color: sc.text }]}>
                        {tx.status ?? tx.type ?? '–'}
                    </Text>
                </View>
            </View>
        </View>
    );
});

// ── Composant principal ────────────────────────────────────────────────────────
export default function Transactions() {
    const [transactions, setTransactions] = useState<Transaction[]>([]);
    const [loading, setLoading]           = useState(true);
    const [refreshing, setRefreshing]     = useState(false);
    const [loadingMore, setLoadingMore]   = useState(false);
    const [hasMore, setHasMore]           = useState(true);
    const [page, setPage]                 = useState(0);
    const [txFilter, setTxFilter]         = useState<TxFilter>('toutes');

    const fetchTransactions = useCallback(async (pageNum = 0, append = false) => {
        if (pageNum === 0 && !append) setLoading(true);
        else setLoadingMore(true);
        try {
            const from = pageNum * PAGE_SIZE;
            const to   = from + PAGE_SIZE - 1;

            const { data, error } = await supabase
                .from('transactions')
                .select('id, price, quantity, client_name, type, status, created_at, product_id, store_id')
                .order('created_at', { ascending: false })
                .range(from, to);
            if (error) throw error;

            const rows = (data as Transaction[]) ?? [];
            setHasMore(rows.length === PAGE_SIZE);

            // Noms de produits/boutiques
            const productIds = [...new Set(rows.map(t => t.product_id).filter(Boolean))] as string[];
            const storeIds   = [...new Set(rows.map(t => t.store_id).filter(Boolean))] as string[];

            const [prodsRes, storesRes] = await Promise.all([
                productIds.length > 0
                    ? supabase.from('products').select('id, name').in('id', productIds)
                    : Promise.resolve({ data: [] }),
                storeIds.length > 0
                    ? supabase.from('stores').select('id, name').in('id', storeIds)
                    : Promise.resolve({ data: [] }),
            ]);

            const prodMap: Record<string, string>  = {};
            const storeMap: Record<string, string> = {};
            for (const p of (prodsRes.data ?? []) as { id: string; name: string }[]) prodMap[p.id] = p.name;
            for (const s of (storesRes.data ?? []) as { id: string; name: string }[]) storeMap[s.id] = s.name;

            const mapped = rows.map(t => ({
                ...t,
                productName: t.product_id ? (prodMap[t.product_id] ?? 'Produit') : 'Produit',
                storeName:   t.store_id   ? (storeMap[t.store_id]  ?? 'Boutique') : 'Boutique',
            }));

            if (append) setTransactions(prev => [...prev, ...mapped]);
            else setTransactions(mapped);
        } catch (err) {
            console.error('[Transactions Admin] fetch error:', err);
        } finally {
            setLoading(false);
            setRefreshing(false);
            setLoadingMore(false);
        }
    }, []);

    const fetchMore = useCallback(() => {
        if (loadingMore || !hasMore) return;
        const nextPage = page + 1;
        setPage(nextPage);
        fetchTransactions(nextPage, true);
    }, [page, loadingMore, hasMore, fetchTransactions]);

    const resetAndFetch = useCallback(() => {
        setPage(0);
        setHasMore(true);
        fetchTransactions(0, false);
    }, [fetchTransactions]);

    useEffect(() => { setLoading(true); resetAndFetch(); }, [resetAndFetch]);

    const onRefresh = useCallback(() => { setRefreshing(true); resetAndFetch(); }, [resetAndFetch]);

    useFocusEffect(useCallback(() => { resetAndFetch(); }, [resetAndFetch]));

    // ── Filtrage ───────────────────────────────────────────────────────────────
    const filtered = useMemo(() => {
        if (txFilter === 'ventes') return transactions.filter(t => t.status !== 'DETTE' && t.type !== 'DETTE');
        if (txFilter === 'dettes') return transactions.filter(t => t.status === 'DETTE' || t.type === 'DETTE');
        return transactions;
    }, [transactions, txFilter]);

    const totalVolume  = useMemo(() => filtered.reduce((s, t) => s + (t.price ?? 0), 0), [filtered]);
    const totalCount   = filtered.length;

    return (
        <View style={s.safe}>
            <ScreenHeader title="Transactions" subtitle="Global réseau" showBack={true} />

            <FlatList
                data={loading ? [] : filtered}
                keyExtractor={(item) => item.id}
                style={s.scroll}
                contentContainerStyle={s.scrollContent}
                showsVerticalScrollIndicator={false}
                bounces={false}
                overScrollMode="never"
                refreshControl={
                    <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.primary]} />
                }
                ListHeaderComponent={
                    <>
                        {/* ── KPI Volume total ── */}
                        <View style={s.kpiCard}>
                            <View style={s.kpiIconWrap}>
                                <TrendingUp color="#059669" size={24} />
                            </View>
                            <View style={s.kpiTextBlock}>
                                <Text style={s.kpiLabel}>VOLUME TOTAL</Text>
                                <Text style={s.kpiValue}>
                                    {loading ? '–' : totalVolume.toLocaleString('fr-FR')} F
                                </Text>
                                <Text style={s.kpiSub}>{totalCount} transaction{totalCount > 1 ? 's' : ''}</Text>
                            </View>
                        </View>

                        {/* ── Filtres ── */}
                        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.filterRow}>
                            {TX_FILTERS.map(f => (
                                <TouchableOpacity
                                    key={f.key}
                                    style={[s.filterBtn, txFilter === f.key && s.filterBtnActive]}
                                    activeOpacity={0.82}
                                    onPress={() => setTxFilter(f.key)}
                                >
                                    <Text style={[s.filterLabel, txFilter === f.key && s.filterLabelActive]}>
                                        {f.label}
                                    </Text>
                                </TouchableOpacity>
                            ))}
                        </ScrollView>

                        {loading && <ActivityIndicator color={colors.primary} style={{ marginTop: 32 }} />}
                    </>
                }
                onEndReached={fetchMore}
                onEndReachedThreshold={0.3}
                ListEmptyComponent={!loading ? (
                    <View style={s.emptyCard}>
                        <ShoppingBag color={colors.slate300} size={40} />
                        <Text style={s.emptyText}>AUCUNE TRANSACTION</Text>
                    </View>
                ) : null}
                ListFooterComponent={loadingMore ? (
                    <ActivityIndicator color={colors.primary} style={{ marginVertical: 16 }} />
                ) : null}
                renderItem={({ item: tx }) => <TxCard tx={tx} />}
            />
        </View>
    );
}

// ── Styles ─────────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
    safe: { flex: 1, backgroundColor: '#f8fafc' },

    scroll:        { flex: 1 },
    scrollContent: { paddingHorizontal: 16, paddingTop: 20, paddingBottom: 40, gap: 12 },

    // KPI
    kpiCard: {
        backgroundColor: '#059669', borderRadius: 10, padding: 20,
        flexDirection: 'row', alignItems: 'center', gap: 16,
        marginBottom: 14,
    },
    kpiIconWrap: {
        width: 52, height: 52, borderRadius: 12,
        backgroundColor: '#FFFFFF',
        alignItems: 'center', justifyContent: 'center',
    },
    kpiTextBlock: { flex: 1 },
    kpiLabel:    { fontSize: 11, fontWeight: '700', color: 'rgba(255,255,255,0.7)', letterSpacing: 2, textTransform: 'uppercase' },
    kpiValue:    { fontSize: 28, fontWeight: '900', color: '#fff', marginTop: 2, lineHeight: 32 },
    kpiSub:      { fontSize: 11, fontWeight: '600', color: 'rgba(255,255,255,0.6)', marginTop: 2 },

    // Filtres
    filterRow:       { flexDirection: 'row', gap: 8 },
    filterBtn: {
        paddingHorizontal: 14, paddingVertical: 8,
        borderRadius: 8, borderWidth: 1.5, borderColor: '#e2e8f0',
        backgroundColor: '#fff',
    },
    filterBtnActive:   { borderColor: '#059669', backgroundColor: '#ecfdf5' },
    filterLabel:       { fontSize: 11, fontWeight: '700', color: '#64748b' },
    filterLabelActive: { color: '#059669' },

    // Carte tx
    txCard: {
        flexDirection: 'row', alignItems: 'center', gap: 12,
        backgroundColor: '#fff', borderRadius: 10, padding: 14,
        borderWidth: 1, borderColor: '#f1f5f9',
        shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.04, shadowRadius: 4, elevation: 1,
    },
    txIcon: {
        width: 40, height: 40, borderRadius: 10,
        alignItems: 'center', justifyContent: 'center', flexShrink: 0,
    },
    txInfo:    { flex: 1, minWidth: 0, gap: 2 },
    txProduct: { fontSize: 13, fontWeight: '700', color: '#1e293b' },
    txClient:  { fontSize: 11, color: '#64748b' },
    txDate:    { fontSize: 11, color: '#94a3b8' },
    txRight:   { alignItems: 'flex-end', gap: 4, flexShrink: 0 },
    txAmount:  { fontSize: 14, fontWeight: '900', color: '#1e293b' },
    statusBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
    statusText:  { fontSize: 11, fontWeight: '700' },

    emptyCard: {
        backgroundColor: '#fff', borderRadius: 10, padding: 48,
        alignItems: 'center', borderWidth: 2, borderColor: '#f1f5f9',
        borderStyle: 'dashed', gap: 12,
    },
    emptyText: { fontSize: 11, fontWeight: '900', color: '#cbd5e1', letterSpacing: 2 },
});
