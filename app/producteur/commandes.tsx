// Commandes reçues — Producteur
import React, { useState, useEffect, useCallback } from 'react';
import {
    View, Text, ScrollView, StyleSheet, TouchableOpacity,
    ActivityIndicator, RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { ChevronLeft, ShoppingBag } from 'lucide-react-native';
import { supabase } from '@/src/lib/supabase';
import { colors } from '@/src/lib/colors';
import { useProfileContext } from '@/src/context/ProfileContext';
import { emitEvent, onSocketEvent } from '@/src/lib/socket';

// ── Types ──────────────────────────────────────────────────────────────────────
type FilterType = 'ALL' | 'PENDING' | 'ACCEPTED' | 'SHIPPING' | 'DELIVERED' | 'REJECTED';

interface Order {
    id: string;
    status: string;
    quantity: number;
    total_amount: number;
    created_at: string;
    product_id: string | null;
    buyer_store_id: string | null;
    products: { name: string; price: number } | null;
    stores: { id: string; name: string } | null;  // id nécessaire pour router les events Socket.io
}

// ── Helpers ───────────────────────────────────────────────────────────────────
const FILTERS: { key: FilterType; label: string }[] = [
    { key: 'ALL',       label: 'Toutes' },
    { key: 'PENDING',   label: 'En attente' },
    { key: 'ACCEPTED',  label: 'Acceptées' },
    { key: 'SHIPPING',  label: 'En livraison' },
    { key: 'DELIVERED', label: 'Livrées' },
    { key: 'REJECTED',  label: 'Refusées' },
];

const STATUS_LABELS: Record<string, string> = {
    PENDING:   'En attente',
    ACCEPTED:  'Acceptée',
    SHIPPING:  'En livraison',
    DELIVERED: 'Livrée',
    REJECTED:  'Refusée',
};

const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
    PENDING:   { bg: '#fef3c7', text: '#92400e' },
    ACCEPTED:  { bg: '#d1fae5', text: '#065f46' },
    SHIPPING:  { bg: '#dbeafe', text: '#1e40af' },
    DELIVERED: { bg: '#f0fdf4', text: '#166534' },
    REJECTED:  { bg: '#fee2e2', text: '#991b1b' },
};

// ── Composant principal ────────────────────────────────────────────────────────
export default function CommandesScreen() {
    const router = useRouter();
    const { activeProfile } = useProfileContext();

    const [orders, setOrders]   = useState<Order[]>([]);
    const [filter, setFilter]   = useState<FilterType>('ALL');
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [actionLoading, setActionLoading] = useState<string | null>(null);

    // ── Fetch ─────────────────────────────────────────────────────────────────
    const fetchOrders = useCallback(async () => {
        if (!activeProfile) return;
        setLoading(true);
        console.log('=== COMMANDES PRODUCTEUR — fetchOrders ===');
        console.log('[Commandes] activeProfile.id (seller_store_id):', activeProfile.id);
        console.log('[Commandes] filtre actif:', filter);
        try {
            let query = supabase
                .from('orders')
                .select('*, products(name, price), stores!buyer_store_id(id, name)')
                .eq('seller_store_id', activeProfile.id)
                .order('created_at', { ascending: false });

            if (filter !== 'ALL') query = query.eq('status', filter);

            const { data, error } = await query;
            console.log('[Commandes] résultat:', data?.length ?? 0, 'commandes — erreur:', error?.message ?? null);
            console.log('[Commandes] data:', data);
            setOrders((data as Order[]) || []);
        } catch (err) {
            console.error('[Commandes] fetch error:', err);
        } finally {
            setLoading(false);
        }
    }, [activeProfile, filter]);

    useEffect(() => { fetchOrders(); }, [fetchOrders]);

    // Écouter les nouvelles commandes en temps réel
    useEffect(() => {
        const unsub = onSocketEvent('nouvelle-commande', (data: any) => {
            console.log('=== COMMANDE REÇUE via Socket ===', data);
            fetchOrders();
        });
        return unsub;
    }, [fetchOrders]);

    // Recharge à chaque retour sur l'écran
    useFocusEffect(useCallback(() => { fetchOrders(); }, [fetchOrders]));

    const handleRefresh = async () => {
        setRefreshing(true);
        await fetchOrders();
        setRefreshing(false);
    };

    // ── Mise à jour statut ────────────────────────────────────────────────────
    const handleUpdateStatus = async (order: Order, status: string) => {
        setActionLoading(order.id + status);
        console.log('=== MISE À JOUR STATUT ===');
        console.log('[Commandes] order.id:', order.id, '→ nouveau statut:', status);
        try {
            const { error: updateErr } = await supabase.from('orders').update({ status }).eq('id', order.id);
            console.log('[Commandes] UPDATE statut erreur:', updateErr?.message ?? null);
            if (updateErr) throw updateErr;

            const buyerStoreId = order.stores?.id ?? order.buyer_store_id ?? null;
            const eventData = {
                buyerStoreId,
                buyerId:     null,
                productName: order.products?.name ?? 'Produit',
                quantity:    order.quantity,
                orderId:     order.id,
            };

            // Log activité pour les changements importants
            if (status === 'ACCEPTED' || status === 'REJECTED' || status === 'DELIVERED') {
                try {
                    const actionLabel = status === 'ACCEPTED' ? 'Commande acceptée'
                        : status === 'REJECTED' ? 'Commande refusée'
                        : 'Commande livrée';
                    await supabase.from('activity_logs').insert([{
                        user_id:   activeProfile?.id ?? null,
                        user_name: activeProfile?.name ?? 'Producteur',
                        action:    `${actionLabel} : ${order.products?.name ?? 'Produit'} × ${order.quantity} (${(order.total_amount || 0).toLocaleString('fr-FR')} F)`,
                        type:      'commande',
                    }]);
                } catch {}
            }

            if (status === 'ACCEPTED') {
                emitEvent('commande-acceptee', { ...eventData, estimatedDelivery: null });
            } else if (status === 'REJECTED') {
                emitEvent('commande-refusee', { ...eventData, reason: 'Non disponible' });
            } else if (status === 'SHIPPING') {
                emitEvent('livraison-en-cours', { ...eventData, driverName: activeProfile?.name });
            } else if (status === 'DELIVERED') {
                // ── Mettre à jour le stock du Marchand ──────────────────────
                // Ajoute la quantité livrée dans le stock de la boutique acheteuse
                if (buyerStoreId && order.product_id) {
                    const { data: existingStock } = await supabase
                        .from('stock')
                        .select('id, quantity')
                        .eq('store_id', buyerStoreId)
                        .eq('product_id', order.product_id)
                        .maybeSingle();

                    if (existingStock) {
                        await supabase
                            .from('stock')
                            .update({ quantity: existingStock.quantity + order.quantity })
                            .eq('id', existingStock.id);
                    } else {
                        // Première livraison de ce produit dans cette boutique
                        await supabase.from('stock').insert([{
                            store_id:   buyerStoreId,
                            product_id: order.product_id,
                            quantity:   order.quantity,
                        }]);
                    }
                }
                // ── Émettre livraison-terminee ───────────────────────────────
                emitEvent('livraison-terminee', {
                    ...eventData,
                    sellerStoreId: activeProfile?.id,
                    totalPrice:    order.total_amount,
                });
            }

            await fetchOrders();
        } catch (err) {
            console.error('[Commandes] update error:', err);
        } finally {
            setActionLoading(null);
        }
    };

    const totalCount = orders.length;

    return (
        <SafeAreaView style={styles.safe} edges={['top']}>
            {/* ── HEADER ── */}
            <View style={styles.header}>
                <View style={styles.headerTop}>
                    <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
                        <ChevronLeft color={colors.white} size={20} />
                    </TouchableOpacity>
                    <View style={styles.headerTitleBlock}>
                        <Text style={styles.headerTitle}>MES COMMANDES</Text>
                        <Text style={styles.headerSub}>COMMANDES REÇUES</Text>
                    </View>
                    <View style={styles.kpiBadge}>
                        <Text style={styles.kpiBadgeText}>{totalCount}</Text>
                    </View>
                </View>

                {/* Filtres */}
                <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.filtersRow}
                >
                    {FILTERS.map(f => (
                        <TouchableOpacity
                            key={f.key}
                            style={[styles.filterTab, filter === f.key && styles.filterTabActive]}
                            onPress={() => setFilter(f.key)}
                            activeOpacity={0.8}
                        >
                            <Text style={[styles.filterTabText, filter === f.key && styles.filterTabTextActive]}>
                                {f.label}
                            </Text>
                        </TouchableOpacity>
                    ))}
                </ScrollView>
            </View>

            {/* ── LISTE ── */}
            <ScrollView
                style={styles.scroll}
                contentContainerStyle={styles.scrollContent}
                showsVerticalScrollIndicator={false}
                refreshControl={
                    <RefreshControl
                        refreshing={refreshing}
                        onRefresh={handleRefresh}
                        colors={[colors.primary]}
                        tintColor={colors.primary}
                    />
                }
            >
                {loading ? (
                    <ActivityIndicator color={colors.primary} style={{ marginTop: 32 }} />
                ) : orders.length === 0 ? (
                    <View style={styles.emptyCard}>
                        <ShoppingBag color={colors.slate300} size={48} />
                        <Text style={styles.emptyText}>
                            {filter === 'ALL' ? 'AUCUNE COMMANDE' : `AUCUNE COMMANDE ${STATUS_LABELS[filter]?.toUpperCase() ?? filter}`}
                        </Text>
                    </View>
                ) : (
                    orders.map(order => {
                        const sc = STATUS_COLORS[order.status] ?? STATUS_COLORS.PENDING;
                        const isPending = order.status === 'PENDING';
                        const acceptKey = order.id + 'ACCEPTED';
                        const rejectKey = order.id + 'REJECTED';

                        return (
                            <View key={order.id} style={styles.orderCard}>
                                {/* En-tête commande */}
                                <View style={styles.orderHeader}>
                                    <View style={{ flex: 1, minWidth: 0 }}>
                                        <Text style={styles.orderProduct} numberOfLines={1}>
                                            {order.products?.name ?? 'Produit'}
                                        </Text>
                                        <Text style={styles.orderBuyer} numberOfLines={1}>
                                            {order.stores?.name ?? 'Acheteur'}
                                        </Text>
                                    </View>
                                    <View style={[styles.statusBadge, { backgroundColor: sc.bg }]}>
                                        <Text style={[styles.statusText, { color: sc.text }]}>
                                            {STATUS_LABELS[order.status] ?? order.status}
                                        </Text>
                                    </View>
                                </View>

                                {/* Détails */}
                                <View style={styles.orderDetails}>
                                    <View style={styles.detailItem}>
                                        <Text style={styles.detailLabel}>QUANTITÉ</Text>
                                        <Text style={styles.detailValue}>{order.quantity} unité(s)</Text>
                                    </View>
                                    <View style={styles.detailDivider} />
                                    <View style={styles.detailItem}>
                                        <Text style={styles.detailLabel}>MONTANT</Text>
                                        <Text style={styles.detailValue}>
                                            {order.total_amount > 0
                                                ? `${order.total_amount.toLocaleString('fr-FR')} F`
                                                : order.products?.price
                                                    ? `${(order.products.price * order.quantity).toLocaleString('fr-FR')} F`
                                                    : '–'}
                                        </Text>
                                    </View>
                                    <View style={styles.detailDivider} />
                                    <View style={styles.detailItem}>
                                        <Text style={styles.detailLabel}>DATE</Text>
                                        <Text style={styles.detailValue}>
                                            {new Date(order.created_at).toLocaleDateString('fr-FR')}
                                        </Text>
                                    </View>
                                </View>

                                {/* Actions pour PENDING */}
                                {isPending && (
                                    <View style={styles.actionRow}>
                                        <TouchableOpacity
                                            style={[styles.acceptBtn, actionLoading === acceptKey && { opacity: 0.6 }]}
                                            onPress={() => handleUpdateStatus(order, 'ACCEPTED')}
                                            disabled={!!actionLoading}
                                            activeOpacity={0.85}
                                        >
                                            {actionLoading === acceptKey ? (
                                                <ActivityIndicator color={colors.white} size="small" />
                                            ) : (
                                                <Text style={styles.acceptBtnText}>ACCEPTER</Text>
                                            )}
                                        </TouchableOpacity>
                                        <TouchableOpacity
                                            style={[styles.rejectBtn, actionLoading === rejectKey && { opacity: 0.6 }]}
                                            onPress={() => handleUpdateStatus(order, 'REJECTED')}
                                            disabled={!!actionLoading}
                                            activeOpacity={0.85}
                                        >
                                            {actionLoading === rejectKey ? (
                                                <ActivityIndicator color={colors.error} size="small" />
                                            ) : (
                                                <Text style={styles.rejectBtnText}>REFUSER</Text>
                                            )}
                                        </TouchableOpacity>
                                    </View>
                                )}
                            </View>
                        );
                    })
                )}
            </ScrollView>
        </SafeAreaView>
    );
}

// ── Styles ─────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.bgSecondary },

    // Header
    header: {
        backgroundColor: colors.primary,
        paddingHorizontal: 16,
        paddingTop: 8,
        paddingBottom: 16,
        borderBottomLeftRadius: 32,
        borderBottomRightRadius: 32,
        gap: 12,
    },
    headerTop: {
        flexDirection: 'row', alignItems: 'center',
        justifyContent: 'space-between',
    },
    backBtn: {
        width: 40, height: 40, borderRadius: 10,
        backgroundColor: 'rgba(255,255,255,0.2)',
        alignItems: 'center', justifyContent: 'center',
    },
    headerTitleBlock: { alignItems: 'center' },
    headerTitle: { fontSize: 15, fontWeight: '900', color: colors.white, letterSpacing: 1 },
    headerSub:   { fontSize: 9, fontWeight: '700', color: 'rgba(255,255,255,0.7)', letterSpacing: 2, marginTop: 2 },
    kpiBadge: {
        minWidth: 40, height: 40, borderRadius: 10,
        backgroundColor: 'rgba(255,255,255,0.2)',
        alignItems: 'center', justifyContent: 'center',
        paddingHorizontal: 8,
    },
    kpiBadgeText: { fontSize: 16, fontWeight: '900', color: colors.white },

    // Filtres
    filtersRow: { gap: 8, paddingVertical: 4 },
    filterTab: {
        paddingHorizontal: 14, paddingVertical: 8,
        borderRadius: 8,
        backgroundColor: 'rgba(255,255,255,0.2)',
    },
    filterTabActive: { backgroundColor: colors.white },
    filterTabText: { fontSize: 12, fontWeight: '700', color: 'rgba(255,255,255,0.8)' },
    filterTabTextActive: { color: colors.primary },

    // Scroll
    scroll:        { flex: 1 },
    scrollContent: { paddingHorizontal: 16, paddingTop: 20, paddingBottom: 40, gap: 12 },

    // Order card
    orderCard: {
        backgroundColor: colors.white,
        borderRadius: 10,
        padding: 16,
        borderWidth: 1,
        borderColor: colors.slate100,
        gap: 12,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.05,
        shadowRadius: 4,
        elevation: 2,
    },
    orderHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    orderProduct: { fontSize: 14, fontWeight: '700', color: colors.slate800 },
    orderBuyer:   { fontSize: 11, fontWeight: '600', color: colors.slate500, marginTop: 2 },
    statusBadge:  { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6, flexShrink: 0 },
    statusText:   { fontSize: 10, fontWeight: '700' },

    // Détails
    orderDetails:  { flexDirection: 'row', backgroundColor: colors.slate50, borderRadius: 8, padding: 12 },
    detailItem:    { flex: 1, alignItems: 'center' },
    detailDivider: { width: 1, backgroundColor: colors.slate200 },
    detailLabel:   { fontSize: 9, fontWeight: '700', color: colors.slate400, letterSpacing: 1, marginBottom: 4 },
    detailValue:   { fontSize: 12, fontWeight: '700', color: colors.slate800 },

    // Actions
    actionRow:    { flexDirection: 'row', gap: 8 },
    acceptBtn: {
        flex: 1,
        backgroundColor: colors.primary,
        borderRadius: 10,
        paddingVertical: 12,
        alignItems: 'center',
        justifyContent: 'center',
    },
    acceptBtnText: { fontSize: 12, fontWeight: '900', color: colors.white, letterSpacing: 1 },
    rejectBtn: {
        flex: 1,
        borderRadius: 10,
        paddingVertical: 12,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 2,
        borderColor: colors.error,
        backgroundColor: colors.white,
    },
    rejectBtnText: { fontSize: 12, fontWeight: '900', color: colors.error, letterSpacing: 1 },

    // Empty
    emptyCard: {
        backgroundColor: colors.white, borderRadius: 10, padding: 48,
        alignItems: 'center', borderWidth: 2, borderColor: colors.slate100,
        borderStyle: 'dashed', gap: 12,
    },
    emptyText: { fontSize: 10, fontWeight: '900', color: colors.slate300, letterSpacing: 2, textAlign: 'center' },
});
