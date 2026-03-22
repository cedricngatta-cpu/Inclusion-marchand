// Commandes B2B — Admin : suivi de toutes les commandes inter-boutiques
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
    View, Text, ScrollView, StyleSheet, ActivityIndicator, RefreshControl,
    Platform, useWindowDimensions,
} from 'react-native';
import { TouchableOpacity } from 'react-native-gesture-handler';
import { useFocusEffect } from 'expo-router';
import { ShoppingBag, ArrowRight } from 'lucide-react-native';
import { ScreenHeader } from '@/src/components/ui';
import { supabase } from '@/src/lib/supabase';
import { colors } from '@/src/lib/colors';
import { useAuth } from '@/src/context/AuthContext';

// ── Types ──────────────────────────────────────────────────────────────────────
interface Order {
    id: string;
    quantity: number;
    total_amount: number;
    status: string;
    notes: string | null;
    created_at: string;
    buyer_store_id: string | null;
    seller_store_id: string | null;
    product_id: string | null;
    buyerName?: string;
    sellerName?: string;
}

type OrderFilter = 'toutes' | 'PENDING' | 'ACCEPTED' | 'SHIPPED' | 'DELIVERED' | 'CANCELLED';

// ── Helpers ───────────────────────────────────────────────────────────────────
const STATUS_COLORS: Record<string, { bg: string; text: string; label: string }> = {
    PENDING:   { bg: '#fef3c7', text: '#92400e', label: 'En attente' },
    ACCEPTED:  { bg: '#dbeafe', text: '#1e40af', label: 'Acceptée' },
    SHIPPED:   { bg: '#ede9fe', text: '#5b21b6', label: 'En livraison' },
    DELIVERED: { bg: '#d1fae5', text: '#065f46', label: 'Livrée' },
    CANCELLED: { bg: '#fee2e2', text: '#991b1b', label: 'Annulée' },
};

const ORDER_FILTERS: { key: OrderFilter; label: string }[] = [
    { key: 'toutes',    label: 'Toutes' },
    { key: 'PENDING',   label: 'En attente' },
    { key: 'ACCEPTED',  label: 'Acceptées' },
    { key: 'SHIPPED',   label: 'En livraison' },
    { key: 'DELIVERED', label: 'Livrées' },
    { key: 'CANCELLED', label: 'Annulées' },
];

// ── Composant principal ────────────────────────────────────────────────────────
export default function CommandesAdmin() {
    const [orders, setOrders]         = useState<Order[]>([]);
    const [loading, setLoading]       = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [orderFilter, setOrderFilter] = useState<OrderFilter>('toutes');

    const { width } = useWindowDimensions();
    const isDesktop = Platform.OS === 'web' && width > 768;

    const fetchOrders = useCallback(async () => {
        try {
            const { data, error } = await supabase
                .from('orders')
                .select('id, quantity, total_amount, status, notes, created_at, buyer_store_id, seller_store_id, product_id')
                .order('created_at', { ascending: false })
                .limit(100);
            if (error) throw error;

            const rows = (data as Order[]) ?? [];
            console.log('[CommandesAdmin] ✅ commandes chargées:', rows.length);

            // Noms des boutiques
            const allStoreIds = [
                ...new Set([
                    ...rows.map(o => o.buyer_store_id),
                    ...rows.map(o => o.seller_store_id),
                ].filter(Boolean))
            ] as string[];

            const { data: storesData } = allStoreIds.length > 0
                ? await supabase.from('stores').select('id, name').in('id', allStoreIds)
                : { data: [] };

            const storeMap: Record<string, string> = {};
            for (const s of (storesData ?? []) as { id: string; name: string }[]) {
                storeMap[s.id] = s.name;
            }

            setOrders(rows.map(o => ({
                ...o,
                buyerName:  o.buyer_store_id  ? (storeMap[o.buyer_store_id]  ?? 'Acheteur') : 'Acheteur',
                sellerName: o.seller_store_id ? (storeMap[o.seller_store_id] ?? 'Vendeur')  : 'Vendeur',
            })));
        } catch (err) {
            console.error('[CommandesAdmin] fetch error:', err);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, []);

    const onRefresh = useCallback(() => { setRefreshing(true); fetchOrders(); }, [fetchOrders]);

    useFocusEffect(useCallback(() => { setLoading(true); fetchOrders(); }, [fetchOrders]));

    // ── Filtrage ───────────────────────────────────────────────────────────────
    const filtered = useMemo(() => {
        if (orderFilter === 'toutes') return orders;
        return orders.filter(o => o.status === orderFilter);
    }, [orders, orderFilter]);

    const totalAmount = useMemo(() =>
        filtered.reduce((s, o) => s + (o.total_amount ?? 0), 0),
        [filtered]
    );

    return (
        <View style={s.safe}>
            <ScreenHeader title="Commandes B2B" subtitle="Inter-boutiques" showBack={true} paddingBottom={24}>
                <View style={s.kpiRow}>
                    <View style={s.kpiItem}>
                        <Text style={s.kpiValue}>{loading ? '–' : filtered.length}</Text>
                        <Text style={s.kpiLabel}>COMMANDES</Text>
                    </View>
                    <View style={s.kpiDivider} />
                    <View style={s.kpiItem}>
                        <Text style={s.kpiValue}>
                            {loading ? '–' : `${Math.round(totalAmount / 1000)}k`}
                        </Text>
                        <Text style={s.kpiLabel}>VALEUR (F)</Text>
                    </View>
                    <View style={s.kpiDivider} />
                    <View style={s.kpiItem}>
                        <Text style={s.kpiValue}>
                            {loading ? '–' : orders.filter(o => o.status === 'PENDING').length}
                        </Text>
                        <Text style={s.kpiLabel}>EN ATTENTE</Text>
                    </View>
                </View>
            </ScreenHeader>

            <ScrollView
                style={s.scroll}
                contentContainerStyle={[s.scrollContent, isDesktop && { maxWidth: 1400, alignSelf: 'center', width: '100%', padding: 32 }]}
                showsVerticalScrollIndicator={false}
                bounces={false}
                overScrollMode="never"
                refreshControl={
                    <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.primary]} />
                }
            >
                {/* ── Filtres ── */}
                {isDesktop ? (
                    <View style={{ flexDirection: 'row', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
                        {ORDER_FILTERS.map(f => (
                            <TouchableOpacity
                                key={f.key}
                                style={[s.filterBtn, orderFilter === f.key && s.filterBtnActive]}
                                activeOpacity={0.82}
                                onPress={() => setOrderFilter(f.key)}
                            >
                                <Text style={[s.filterLabel, orderFilter === f.key && s.filterLabelActive]}>
                                    {f.label}
                                </Text>
                            </TouchableOpacity>
                        ))}
                    </View>
                ) : (
                    <ScrollView
                        horizontal
                        showsHorizontalScrollIndicator={false}
                        contentContainerStyle={s.filterRow}
                    >
                        {ORDER_FILTERS.map(f => (
                            <TouchableOpacity
                                key={f.key}
                                style={[s.filterBtn, orderFilter === f.key && s.filterBtnActive]}
                                activeOpacity={0.82}
                                onPress={() => setOrderFilter(f.key)}
                            >
                                <Text style={[s.filterLabel, orderFilter === f.key && s.filterLabelActive]}>
                                    {f.label}
                                </Text>
                            </TouchableOpacity>
                        ))}
                    </ScrollView>
                )}

                {/* ── Liste commandes ── */}
                {loading ? (
                    <ActivityIndicator color={colors.primary} style={{ marginTop: 32 }} />
                ) : filtered.length === 0 ? (
                    <View style={s.emptyCard}>
                        <ShoppingBag color={colors.slate300} size={40} />
                        <Text style={s.emptyText}>AUCUNE COMMANDE TROUVÉE</Text>
                    </View>
                ) : (
                    <>
                        {/* Tableau desktop enveloppé dans une card */}
                        {isDesktop ? (
                            <View style={dtC.tableCard}>
                                <View style={dtC.tableHeader}>
                                    <Text style={[dtC.thText, dtC.colBuyer]}>ACHETEUR</Text>
                                    <Text style={[dtC.thText, dtC.colSeller]}>VENDEUR</Text>
                                    <Text style={[dtC.thText, dtC.colNote]}>NOTES</Text>
                                    <Text style={[dtC.thText, dtC.colQty]}>QTE</Text>
                                    <Text style={[dtC.thText, dtC.colDate]}>DATE</Text>
                                    <Text style={[dtC.thText, dtC.colTotal]}>MONTANT</Text>
                                    <Text style={[dtC.thText, dtC.colStatus]}>STATUT</Text>
                                </View>
                                {filtered.map((order, idx) => {
                                    const sc = STATUS_COLORS[order.status] ?? STATUS_COLORS.PENDING;
                                    return (
                                        <View key={order.id} style={[dtC.tableRow, idx % 2 === 1 && { backgroundColor: colors.slate50 }]}>
                                            <Text style={[s.storeName, dtC.colBuyer]} numberOfLines={1}>{order.buyerName}</Text>
                                            <View style={[dtC.colSeller, { flexDirection: 'row', alignItems: 'center', gap: 6 }]}>
                                                <ArrowRight color="#94a3b8" size={12} />
                                                <Text style={[s.storeName, { flex: 1 }]} numberOfLines={1}>{order.sellerName}</Text>
                                            </View>
                                            <Text style={[s.orderNote, dtC.colNote]} numberOfLines={1}>
                                                {order.notes || `${order.quantity} unite${order.quantity > 1 ? 's' : ''}`}
                                            </Text>
                                            <Text style={[s.orderMeta, dtC.colQty]} numberOfLines={1}>{order.quantity}</Text>
                                            <Text style={[s.orderMeta, dtC.colDate]} numberOfLines={1}>
                                                {new Date(order.created_at).toLocaleDateString('fr-FR')}
                                            </Text>
                                            <Text style={[s.orderTotal, dtC.colTotal]} numberOfLines={1}>
                                                {(order.total_amount ?? 0).toLocaleString('fr-FR')} F
                                            </Text>
                                            <View style={[dtC.colStatus, { alignItems: 'flex-end' }]}>
                                                <View style={[s.statusBadge, { backgroundColor: sc.bg }]}>
                                                    <Text style={[s.statusText, { color: sc.text }]}>{sc.label}</Text>
                                                </View>
                                            </View>
                                        </View>
                                    );
                                })}
                            </View>
                        ) : null}
                        {/* Mobile cards */}
                        {!isDesktop && filtered.map(order => {
                            const sc = STATUS_COLORS[order.status] ?? STATUS_COLORS.PENDING;
                            return (
                                <View key={order.id} style={s.orderCard}>
                                    <View style={s.orderTop}>
                                        <Text style={s.orderNote} numberOfLines={2}>
                                            {order.notes || `Commande · ${order.quantity} unite${order.quantity > 1 ? 's' : ''}`}
                                        </Text>
                                        <View style={[s.statusBadge, { backgroundColor: sc.bg }]}>
                                            <Text style={[s.statusText, { color: sc.text }]}>{sc.label}</Text>
                                        </View>
                                    </View>

                                    {/* Acheteur -> Vendeur */}
                                    <View style={s.orderFlow}>
                                        <Text style={s.storeName} numberOfLines={1}>{order.buyerName}</Text>
                                        <ArrowRight color="#94a3b8" size={14} />
                                        <Text style={s.storeName} numberOfLines={1}>{order.sellerName}</Text>
                                    </View>

                                    <View style={s.orderBottom}>
                                        <Text style={s.orderMeta}>
                                            {order.quantity} u · {new Date(order.created_at).toLocaleDateString('fr-FR')}
                                        </Text>
                                        <Text style={s.orderTotal}>
                                            {(order.total_amount ?? 0).toLocaleString('fr-FR')} F
                                        </Text>
                                    </View>
                                </View>
                            );
                        })}
                    </>
                )}
            </ScrollView>
        </View>
    );
}

// ── Styles ─────────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.slate50 },

    kpiRow: {
        flexDirection: 'row',
        backgroundColor: 'rgba(255,255,255,0.15)',
        borderRadius: 10, padding: 14,
    },
    kpiItem:    { flex: 1, alignItems: 'center' },
    kpiDivider: { width: 1, backgroundColor: 'rgba(255,255,255,0.3)', marginHorizontal: 6 },
    kpiValue:   { fontSize: 24, fontWeight: '900', color: '#fff', lineHeight: 28 },
    kpiLabel:   { fontSize: 11, fontWeight: '700', color: 'rgba(255,255,255,0.7)', letterSpacing: 1, marginTop: 4, textAlign: 'center' },

    scroll:        { flex: 1 },
    scrollContent: { paddingHorizontal: 16, paddingTop: 20, paddingBottom: 40, gap: 10 },

    filterRow: { flexDirection: 'row', gap: 8, marginBottom: 4 },
    filterBtn: {
        paddingHorizontal: 14, paddingVertical: 8,
        borderRadius: 8, borderWidth: 1.5, borderColor: '#e2e8f0',
        backgroundColor: '#fff',
    },
    filterBtnActive:   { borderColor: colors.primary, backgroundColor: colors.primaryBg },
    filterLabel:       { fontSize: 11, fontWeight: '700', color: '#64748b' },
    filterLabelActive: { color: colors.primary },

    // Carte commande
    orderCard: {
        backgroundColor: '#fff', borderRadius: 10, padding: 14,
        borderWidth: 1, borderColor: '#f1f5f9', gap: 8,
        shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.04, shadowRadius: 4, elevation: 1,
    },
    orderTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, justifyContent: 'space-between' },
    orderNote: { flex: 1, fontSize: 13, fontWeight: '700', color: '#1e293b' },
    statusBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, flexShrink: 0 },
    statusText:  { fontSize: 11, fontWeight: '700' },

    orderFlow: {
        flexDirection: 'row', alignItems: 'center', gap: 8,
        backgroundColor: colors.slate50, borderRadius: 8, padding: 8,
    },
    storeName: { flex: 1, fontSize: 11, fontWeight: '700', color: '#475569', textAlign: 'center' },

    orderBottom: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    orderMeta:   { fontSize: 11, color: '#94a3b8' },
    orderTotal:  { fontSize: 14, fontWeight: '900', color: '#1e293b' },

    emptyCard: {
        backgroundColor: '#fff', borderRadius: 10, padding: 48,
        alignItems: 'center', borderWidth: 2, borderColor: '#f1f5f9',
        borderStyle: 'dashed', gap: 12,
    },
    emptyText: { fontSize: 11, fontWeight: '900', color: '#cbd5e1', letterSpacing: 2 },
});

// ── Desktop table styles ────────────────────────────────────────────────────────
const dtC = StyleSheet.create({
    tableCard: {
        backgroundColor: '#fff', borderRadius: 12, overflow: 'hidden',
        shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.06, shadowRadius: 12, elevation: 3,
        borderWidth: 1, borderColor: '#f1f5f9',
    },
    tableHeader: {
        flexDirection: 'row', alignItems: 'center',
        paddingHorizontal: 12, paddingVertical: 10,
        backgroundColor: '#f1f5f9',
    },
    tableRow: { flexDirection: 'row', alignItems: 'center', gap: 0, paddingVertical: 10, paddingHorizontal: 12 },
    thText: { fontSize: 10, fontWeight: '900', color: '#94a3b8', letterSpacing: 1 },
    // Colonnes
    colBuyer:  { flex: 1.5, fontSize: 12, fontWeight: '700', color: '#1e293b', paddingRight: 8 },
    colSeller: { flex: 1.5, paddingRight: 8 },
    colNote:   { flex: 2, fontSize: 11, color: '#64748b', paddingRight: 8 },
    colQty:    { width: 50, fontSize: 11, color: '#64748b', textAlign: 'center', paddingRight: 8 },
    colDate:   { flex: 1, fontSize: 11, color: '#94a3b8', paddingRight: 8 },
    colTotal:  { width: 110, fontSize: 13, fontWeight: '900', color: '#1e293b', textAlign: 'right', paddingRight: 12 },
    colStatus: { width: 100 },
});
