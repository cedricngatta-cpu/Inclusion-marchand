// Suivi des livraisons — Producteur
import React, { useState, useCallback } from 'react';
import {
    View, Text, ScrollView, StyleSheet, TouchableOpacity,
    ActivityIndicator, RefreshControl, Platform, useWindowDimensions,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Truck } from 'lucide-react-native';
import { ScreenHeader } from '@/src/components/ui';
import { supabase } from '@/src/lib/supabase';
import { colors } from '@/src/lib/colors';
import { useProfileContext } from '@/src/context/ProfileContext';
import { emitEvent } from '@/src/lib/socket';

// ── Types ──────────────────────────────────────────────────────────────────────
interface DeliveryOrder {
    id: string;
    status: string;
    quantity: number;
    unit_price: number;
    total_amount: number;
    product_name: string | null;
    created_at: string;
    buyer_store_id: string | null;
    stores: { name: string; owner_id?: string } | null;
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
    ACCEPTED:  { bg: '#d1fae5', text: '#065f46' },
    SHIPPED:   { bg: '#dbeafe', text: '#1e40af' },
    DELIVERED: { bg: '#f0fdf4', text: '#166534' },
    CANCELLED: { bg: '#fee2e2', text: '#991b1b' },
};

// Progression des statuts
const STEPS = ['PENDING', 'ACCEPTED', 'SHIPPED', 'DELIVERED'];
const STEP_LABELS = ['En attente', 'Acceptée', 'En préparation', 'En livraison', 'Livrée'];

function getNextStatus(current: string): string | null {
    if (current === 'ACCEPTED') return 'SHIPPED';
    // DELIVERED est confirmé par le marchand depuis son écran Mes Commandes
    return null;
}

function getNextLabel(current: string): string | null {
    if (current === 'ACCEPTED') return 'METTRE EN LIVRAISON';
    return null;
}

// ── Barre de progression ──────────────────────────────────────────────────────
function ProgressBar({ status }: { status: string }) {
    const currentIdx = STEPS.indexOf(status);
    return (
        <View style={pb.container}>
            {STEPS.map((step, idx) => {
                const done    = idx <= currentIdx;
                const isLast  = idx === STEPS.length - 1;
                return (
                    <React.Fragment key={step}>
                        <View style={[pb.dot, done && pb.dotDone]} />
                        {!isLast && <View style={[pb.line, done && idx < currentIdx && pb.lineDone]} />}
                    </React.Fragment>
                );
            })}
        </View>
    );
}

const pb = StyleSheet.create({
    container: { flexDirection: 'row', alignItems: 'center', marginVertical: 8 },
    dot:       { width: 12, height: 12, borderRadius: 4, backgroundColor: colors.slate200, borderWidth: 2, borderColor: colors.slate200 },
    dotDone:   { backgroundColor: colors.primary, borderColor: colors.primary },
    line:      { flex: 1, height: 2, backgroundColor: colors.slate200 },
    lineDone:  { backgroundColor: colors.primary },
});

// ── Composant principal ────────────────────────────────────────────────────────
export default function LivraisonsScreen() {
    const { activeProfile } = useProfileContext();
    const { width } = useWindowDimensions();
    const isDesktop = Platform.OS === 'web' && width > 768;

    const [orders, setOrders]   = useState<DeliveryOrder[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [actionLoading, setActionLoading] = useState<string | null>(null);

    // ── Fetch ─────────────────────────────────────────────────────────────────
    const fetchDeliveries = useCallback(async () => {
        if (!activeProfile) return;
        setLoading(true);
        try {
            const { data } = await supabase
                .from('orders')
                .select('*, stores!buyer_store_id(name, owner_id)')
                .eq('seller_store_id', activeProfile.id)
                .in('status', ['ACCEPTED', 'SHIPPED'])
                .order('created_at', { ascending: false });

            setOrders((data as DeliveryOrder[]) || []);
        } catch (err) {
            console.error('[Livraisons] fetch error:', err);
        } finally {
            setLoading(false);
        }
    }, [activeProfile]);

    // Recharge à chaque retour sur l'écran
    useFocusEffect(useCallback(() => { fetchDeliveries(); }, [fetchDeliveries]));

    const handleRefresh = async () => {
        setRefreshing(true);
        await fetchDeliveries();
        setRefreshing(false);
    };

    // ── Changer statut ────────────────────────────────────────────────────────
    const handleChangeStatus = async (orderId: string, nextStatus: string) => {
        setActionLoading(orderId);
        try {
            await supabase.from('orders').update({ status: nextStatus }).eq('id', orderId);

            if (nextStatus === 'SHIPPED') {
                const order = orders.find(o => o.id === orderId);
                emitEvent('livraison-en-cours', {
                    orderId,
                    sellerStoreId: activeProfile?.id,
                    buyerStoreId:  order?.buyer_store_id ?? null,
                    buyerUserId:   order?.stores?.owner_id ?? null,
                    driverName:    activeProfile?.name,
                });
            }

            await fetchDeliveries();
        } catch (err) {
            console.error('[Livraisons] update error:', err);
        } finally {
            setActionLoading(null);
        }
    };

    return (
        <View style={styles.safe}>
            <ScreenHeader
                title="Livraisons"
                subtitle="En cours"
                showBack={true}
            />

            {/* ── LISTE ── */}
            <ScrollView
                style={styles.scroll}
                contentContainerStyle={[styles.scrollContent, isDesktop && dtLv.scrollContent]}
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
                        <Truck color={colors.slate300} size={48} />
                        <Text style={styles.emptyText}>AUCUNE LIVRAISON EN COURS</Text>
                        <Text style={styles.emptySubText}>
                            Les commandes acceptées apparaissent ici.
                        </Text>
                    </View>
                ) : (
                  <View style={isDesktop ? dtLv.grid : undefined}>
                    {orders.map(order => {
                        const sc         = STATUS_COLORS[order.status] ?? STATUS_COLORS.ACCEPTED;
                        const nextStatus = getNextStatus(order.status);
                        const nextLabel  = getNextLabel(order.status);
                        const isLoading  = actionLoading === order.id;
                        const amount     = order.total_amount > 0
                            ? order.total_amount
                            : (order.unit_price ?? 0) * order.quantity;

                        return (
                            <View key={order.id} style={[styles.deliveryCard, isDesktop && dtLv.card]}>
                                {/* En-tête */}
                                <View style={styles.cardHeader}>
                                    <View style={styles.cardHeaderLeft}>
                                        <Text style={styles.productName} numberOfLines={1}>
                                            {order.product_name ?? 'Produit'}
                                        </Text>
                                        <Text style={styles.buyerName} numberOfLines={1}>
                                            {order.stores?.name ?? 'Acheteur'}
                                        </Text>
                                    </View>
                                    <View style={[styles.statusBadge, { backgroundColor: sc.bg }]}>
                                        <Text style={[styles.statusText, { color: sc.text }]}>
                                            {STATUS_LABELS[order.status] ?? order.status}
                                        </Text>
                                    </View>
                                </View>

                                {/* Progression */}
                                <ProgressBar status={order.status} />

                                {/* Étapes labels */}
                                <View style={styles.stepsLabels}>
                                    {STEP_LABELS.map((label, idx) => (
                                        <Text
                                            key={label}
                                            style={[
                                                styles.stepLabel,
                                                idx === STEPS.indexOf(order.status) && styles.stepLabelActive,
                                            ]}
                                            numberOfLines={1}
                                        >
                                            {label}
                                        </Text>
                                    ))}
                                </View>

                                {/* Détails */}
                                <View style={styles.detailsRow}>
                                    <View style={styles.detailItem}>
                                        <Text style={styles.detailLabel}>QUANTITÉ</Text>
                                        <Text style={styles.detailValue}>{order.quantity} unité(s)</Text>
                                    </View>
                                    <View style={styles.detailDivider} />
                                    <View style={styles.detailItem}>
                                        <Text style={styles.detailLabel}>MONTANT</Text>
                                        <Text style={styles.detailValue}>
                                            {amount > 0 ? `${amount.toLocaleString('fr-FR')} F` : '–'}
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

                                {/* Bouton changer statut */}
                                {nextStatus && nextLabel ? (
                                    <TouchableOpacity
                                        style={[styles.statusBtn, isLoading && { opacity: 0.6 }]}
                                        onPress={() => handleChangeStatus(order.id, nextStatus)}
                                        disabled={isLoading || !!actionLoading}
                                        activeOpacity={0.85}
                                    >
                                        {isLoading ? (
                                            <ActivityIndicator color={colors.white} size="small" />
                                        ) : (
                                            <>
                                                <Truck color={colors.white} size={16} />
                                                <Text style={styles.statusBtnText}>{nextLabel}</Text>
                                            </>
                                        )}
                                    </TouchableOpacity>
                                ) : order.status === 'SHIPPED' ? (
                                    <View style={styles.waitingBanner}>
                                        <Text style={styles.waitingBannerText}>
                                            En attente de confirmation par le marchand
                                        </Text>
                                    </View>
                                ) : null}
                            </View>
                        );
                    })}
                  </View>
                )}
            </ScrollView>
        </View>
    );
}

// ── Styles ─────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.bgSecondary },

    // Scroll
    scroll:        { flex: 1 },
    scrollContent: { paddingHorizontal: 16, paddingTop: 20, paddingBottom: 40, gap: 12 },

    // Delivery card
    deliveryCard: {
        backgroundColor: colors.white,
        borderRadius: 10,
        padding: 16,
        borderWidth: 1,
        borderColor: colors.slate100,
        gap: 10,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.05,
        shadowRadius: 4,
        elevation: 2,
    },
    cardHeader:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
    cardHeaderLeft: { flex: 1, minWidth: 0 },
    productName:    { fontSize: 14, fontWeight: '700', color: colors.slate800 },
    buyerName:      { fontSize: 11, fontWeight: '600', color: colors.slate500, marginTop: 2 },
    statusBadge:    { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6, flexShrink: 0 },
    statusText:     { fontSize: 11, fontWeight: '700' },

    // Steps
    stepsLabels: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
    stepLabel: { fontSize: 11, fontWeight: '600', color: colors.slate400, textAlign: 'center', flex: 1 },
    stepLabelActive: { color: colors.primary, fontWeight: '900' },

    // Détails
    detailsRow:    { flexDirection: 'row', backgroundColor: colors.slate50, borderRadius: 8, padding: 12 },
    detailItem:    { flex: 1, alignItems: 'center' },
    detailDivider: { width: 1, backgroundColor: colors.slate200 },
    detailLabel:   { fontSize: 11, fontWeight: '700', color: colors.slate400, letterSpacing: 1, marginBottom: 4 },
    detailValue:   { fontSize: 12, fontWeight: '700', color: colors.slate800 },

    // Bouton statut
    statusBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        backgroundColor: colors.primary,
        borderRadius: 10,
        paddingVertical: 12,
        shadowColor: colors.primary,
        shadowOpacity: 0.25,
        shadowRadius: 6,
        elevation: 3,
    },
    statusBtnText: { fontSize: 12, fontWeight: '900', color: colors.white, letterSpacing: 1 },

    waitingBanner: {
        backgroundColor: '#eff6ff', borderRadius: 8, padding: 12,
        borderWidth: 1, borderColor: '#bfdbfe', alignItems: 'center',
    },
    waitingBannerText: { fontSize: 12, fontWeight: '600', color: '#1e40af' },

    // Empty
    emptyCard: {
        backgroundColor: colors.white, borderRadius: 10, padding: 48,
        alignItems: 'center', borderWidth: 2, borderColor: colors.slate100,
        borderStyle: 'dashed', gap: 12,
    },
    emptyText:    { fontSize: 11, fontWeight: '900', color: colors.slate300, letterSpacing: 2, textAlign: 'center' },
    emptySubText: { fontSize: 12, fontWeight: '500', color: colors.slate400, textAlign: 'center' },
});

// ── Desktop styles ──────────────────────────────────────────────────────────
const dtLv = StyleSheet.create({
    scrollContent: {
        maxWidth: 1400,
        alignSelf: 'center' as const,
        width: '100%' as unknown as number,
        padding: 32,
    },
    grid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 16,
    },
    card: {
        width: '48%' as unknown as number,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.06,
        shadowRadius: 12,
        elevation: 3,
        borderWidth: 0,
        borderColor: 'transparent',
    },
});
