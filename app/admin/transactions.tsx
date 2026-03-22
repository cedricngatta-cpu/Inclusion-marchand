// Transactions — Admin : liste globale de toutes les ventes
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
    View, Text, ScrollView, FlatList, StyleSheet, ActivityIndicator, RefreshControl,
    Platform, useWindowDimensions,
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
    operator: string | null;
    created_at: string;
    product_id: string | null;
    store_id: string | null;
    productName?: string;
    storeName?: string;
}

type TxFilter = 'toutes' | 'ventes' | 'dettes' | 'momo';

const PAGE_SIZE = 20;

// ── Helpers ───────────────────────────────────────────────────────────────────
const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
    PAYÉ:  { bg: '#d1fae5', text: '#065f46' },
    VENTE: { bg: '#d1fae5', text: '#065f46' },
    DETTE: { bg: '#fee2e2', text: '#991b1b' },
    MOMO:  { bg: '#dbeafe', text: '#1e40af' },
};

const OPERATOR_COLORS: Record<string, { bg: string; text: string }> = {
    ORANGE: { bg: '#FFF3E6', text: '#FF6600' },
    MTN:    { bg: '#FFFDE6', text: '#996600' },
    WAVE:   { bg: '#E6F9FC', text: '#0A8FA8' },
    MOOV:   { bg: '#E6F0FF', text: '#0066CC' },
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
    { key: 'momo',   label: 'Mobile Money' },
];

// ── Carte transaction (memoisee) ──────────────────────────────────────────────
const TxCard = React.memo(({ tx, isDesktop, index }: { tx: Transaction; isDesktop?: boolean; index?: number }) => {
    const tc = getTxColor(tx);
    const sc = STATUS_COLORS[tx.status] ?? STATUS_COLORS[tx.type] ?? { bg: '#f1f5f9', text: '#475569' };
    const opColor = tx.operator ? OPERATOR_COLORS[tx.operator] : null;

    // Mode paiement label
    const paymentLabel = tx.status === 'MOMO' || tx.type === 'MOMO'
        ? (tx.operator ?? 'Mobile Money')
        : tx.status === 'DETTE' || tx.type === 'DETTE'
            ? 'Dette'
            : 'Especes';

    if (isDesktop) {
        return (
            <View style={[dtT.tableRowData, (index ?? 0) % 2 === 1 && dtT.tableRowAlt]}>
                <View style={[s.txIcon, { backgroundColor: tc.bg }, dtT.colIcon]}>
                    <ShoppingBag color={tc.icon} size={16} />
                </View>
                <Text style={[s.txProduct, dtT.colProduct]} numberOfLines={1}>{tx.productName}</Text>
                <Text style={[s.txClient, dtT.colStore]} numberOfLines={1}>{tx.storeName}</Text>
                <View style={dtT.colType}>
                    <View style={[s.statusBadge, { backgroundColor: sc.bg }]}>
                        <Text style={[s.statusText, { color: sc.text }]}>{tx.status ?? tx.type ?? '--'}</Text>
                    </View>
                </View>
                <Text style={[s.txAmount, dtT.colAmount]} numberOfLines={1}>
                    {(tx.price ?? 0).toLocaleString('fr-FR')} F
                </Text>
                <View style={dtT.colPayment}>
                    {opColor ? (
                        <View style={[s.statusBadge, { backgroundColor: opColor.bg }]}>
                            <Text style={[s.statusText, { color: opColor.text }]}>{tx.operator}</Text>
                        </View>
                    ) : (
                        <Text style={[s.txClient, { fontSize: 11 }]}>{paymentLabel}</Text>
                    )}
                </View>
                <Text style={[s.txDate, dtT.colDate]} numberOfLines={1}>
                    {new Date(tx.created_at).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })}
                </Text>
            </View>
        );
    }

    return (
        <View style={s.txCard}>
            <View style={[s.txIcon, { backgroundColor: tc.bg }]}>
                <ShoppingBag color={tc.icon} size={18} />
            </View>
            <View style={s.txInfo}>
                <Text style={s.txProduct} numberOfLines={1}>{tx.productName}</Text>
                <Text style={s.txClient} numberOfLines={1}>
                    {tx.client_name ?? 'Client inconnu'} -- {tx.storeName}
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
                        {tx.status ?? tx.type ?? '--'}
                    </Text>
                </View>
                {opColor && (
                    <View style={[s.statusBadge, { backgroundColor: opColor.bg }]}>
                        <Text style={[s.statusText, { color: opColor.text }]}>{tx.operator}</Text>
                    </View>
                )}
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

    const { width } = useWindowDimensions();
    const isDesktop = Platform.OS === 'web' && width > 768;

    const fetchTransactions = useCallback(async (pageNum = 0, append = false) => {
        if (pageNum === 0 && !append) setLoading(true);
        else setLoadingMore(true);
        try {
            const from = pageNum * PAGE_SIZE;
            const to   = from + PAGE_SIZE - 1;

            const { data, error } = await supabase
                .from('transactions')
                .select('id, price, quantity, client_name, type, status, operator, created_at, product_id, store_id')
                .order('created_at', { ascending: false })
                .range(from, to);
            if (error) throw error;

            const rows = (data as Transaction[]) ?? [];
            console.log('[Transactions Admin] ✅ page', pageNum, ':', rows.length, 'lignes');
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

    const onRefresh = useCallback(() => { setRefreshing(true); resetAndFetch(); }, [resetAndFetch]);

    useFocusEffect(useCallback(() => { setLoading(true); resetAndFetch(); }, [resetAndFetch]));

    // ── Filtrage ───────────────────────────────────────────────────────────────
    const filtered = useMemo(() => {
        if (txFilter === 'ventes') return transactions.filter(t => t.status !== 'DETTE' && t.type !== 'DETTE');
        if (txFilter === 'dettes') return transactions.filter(t => t.status === 'DETTE' || t.type === 'DETTE');
        if (txFilter === 'momo')   return transactions.filter(t => t.status === 'MOMO'  || t.type === 'MOMO');
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
                contentContainerStyle={[s.scrollContent, isDesktop && dtT.desktopContent]}
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
                                <TrendingUp color={colors.primary} size={24} />
                            </View>
                            <View style={s.kpiTextBlock}>
                                <Text style={s.kpiLabel}>VOLUME TOTAL</Text>
                                <Text style={s.kpiValue}>
                                    {loading ? '--' : totalVolume.toLocaleString('fr-FR')} F
                                </Text>
                                <Text style={s.kpiSub}>{totalCount} transaction{totalCount > 1 ? 's' : ''}</Text>
                            </View>
                        </View>

                        {/* ── Filtres ── */}
                        {isDesktop ? (
                            <View style={[s.filterRow, { marginBottom: 12 }]}>
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
                            </View>
                        ) : (
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
                        )}

                        {/* ── En-tete tableau desktop ── */}
                        {isDesktop && !loading && filtered.length > 0 && (
                            <View style={dtT.tableHeaderWrap}>
                                <View style={dtT.tableHeader}>
                                    <View style={dtT.colIcon} />
                                    <Text style={[dtT.thText, dtT.colProduct]}>PRODUIT</Text>
                                    <Text style={[dtT.thText, dtT.colStore]}>BOUTIQUE</Text>
                                    <Text style={[dtT.thText, dtT.colType]}>TYPE</Text>
                                    <Text style={[dtT.thText, dtT.colAmount]}>MONTANT</Text>
                                    <Text style={[dtT.thText, dtT.colPayment]}>MODE PAIEMENT</Text>
                                    <Text style={[dtT.thText, dtT.colDate]}>DATE</Text>
                                </View>
                            </View>
                        )}

                    </>
                }
                onEndReached={fetchMore}
                onEndReachedThreshold={0.3}
                ListEmptyComponent={
                    loading ? (
                        <ActivityIndicator color={colors.primary} style={{ marginTop: 32 }} />
                    ) : (
                        <View style={s.emptyCard}>
                            <ShoppingBag color={colors.slate300} size={40} />
                            <Text style={s.emptyText}>AUCUNE TRANSACTION</Text>
                        </View>
                    )
                }
                ListFooterComponent={loadingMore && !loading ? (
                    <ActivityIndicator color={colors.primary} style={{ marginVertical: 16 }} />
                ) : null}
                renderItem={({ item: tx, index }) => <TxCard tx={tx} isDesktop={isDesktop} index={index} />}
            />
        </View>
    );
}

// ── Styles ─────────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.slate50 },

    scroll:        { flex: 1 },
    scrollContent: { paddingHorizontal: 16, paddingTop: 20, paddingBottom: 40, gap: 8 },

    // KPI
    kpiCard: {
        backgroundColor: colors.primary, borderRadius: 10, padding: 20,
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
    filterBtnActive:   { borderColor: colors.primary, backgroundColor: colors.primaryBg },
    filterLabel:       { fontSize: 11, fontWeight: '700', color: '#64748b' },
    filterLabelActive: { color: colors.primary },

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

// ── Desktop table styles ────────────────────────────────────────────────────────
const dtT = StyleSheet.create({
    desktopContent: {
        maxWidth: 1400,
        alignSelf: 'center',
        width: '100%',
        padding: 32,
        gap: 0,
    },
    tableCard: {
        backgroundColor: '#fff',
        borderRadius: 12,
        overflow: 'hidden',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.08,
        shadowRadius: 12,
        elevation: 3,
    },
    tableHeaderWrap: {
        backgroundColor: '#fff',
        borderTopLeftRadius: 12,
        borderTopRightRadius: 12,
        overflow: 'hidden',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.06,
        shadowRadius: 8,
        elevation: 2,
    },
    tableHeader: {
        flexDirection: 'row', alignItems: 'center',
        paddingHorizontal: 16, paddingVertical: 12,
        backgroundColor: '#f1f5f9',
        borderBottomWidth: 1, borderBottomColor: '#e2e8f0',
    },
    tableRowData: {
        flexDirection: 'row', alignItems: 'center',
        paddingHorizontal: 16, paddingVertical: 10,
        backgroundColor: '#fff',
        borderLeftWidth: 0, borderRightWidth: 0,
        borderBottomWidth: 1, borderBottomColor: '#f1f5f9',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.04,
        shadowRadius: 4,
        elevation: 1,
    },
    tableRowAlt: {
        backgroundColor: colors.slate50,
    },
    thText: { fontSize: 10, fontWeight: '900', color: '#94a3b8', letterSpacing: 1 },
    // Colonnes : Produit, Boutique, Type, Montant, Mode paiement, Date
    colIcon:    { width: 36, height: 36, marginRight: 12, borderRadius: 8, flexShrink: 0 },
    colProduct: { flex: 2, fontSize: 13, fontWeight: '700', color: '#1e293b', paddingRight: 8 },
    colStore:   { flex: 1.5, fontSize: 11, color: '#64748b', paddingRight: 8 },
    colType:    { flex: 1, paddingRight: 8, alignItems: 'flex-start' as const },
    colAmount:  { flex: 1.2, fontSize: 13, fontWeight: '900', color: '#1e293b', textAlign: 'right' as const, paddingRight: 12 },
    colPayment: { flex: 1.2, paddingRight: 8, alignItems: 'flex-start' as const },
    colDate:    { flex: 1, fontSize: 11, color: '#94a3b8', paddingRight: 8 },
});
