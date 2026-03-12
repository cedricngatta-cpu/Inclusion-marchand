// Mes Commandes — Marchand : suivi des commandes passées + confirmation réception
import React, { useState, useEffect, useCallback } from 'react';
import {
    View, Text, ScrollView, StyleSheet, TouchableOpacity,
    ActivityIndicator, RefreshControl, Alert, Modal, Linking,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Package, Truck, Phone, X } from 'lucide-react-native';
import { ScreenHeader } from '@/src/components/ui';
import { supabase } from '@/src/lib/supabase';
import { colors } from '@/src/lib/colors';
import { emitEvent, onSocketEvent } from '@/src/lib/socket';
import { useProfileContext } from '@/src/context/ProfileContext';
import { useAuth } from '@/src/context/AuthContext';

// ── Types ──────────────────────────────────────────────────────────────────────
interface MerchantOrder {
    id: string;
    status: string;
    quantity: number;
    unit_price: number;
    total_amount: number;
    product_id: string | null;
    product_name: string | null;
    payment_mode: string | null;
    notes: string | null;
    created_at: string;
    seller_store_id: string;
    buyer_store_id: string;
    // enrichi après jointure
    products: { name: string; price: number } | null;
    sellerStore: { id: string; name: string; owner_id: string } | null;
    sellerProfile: { full_name: string; phone_number: string } | null;
}

// ── Constantes ────────────────────────────────────────────────────────────────
const STEPS = ['PENDING', 'ACCEPTED', 'SHIPPED', 'DELIVERED'] as const;
const STEP_LABELS = ['Commandé', 'Accepté', 'En route', 'Reçu'];

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

const PAYMENT_LABELS: Record<string, string> = {
    ESPECES:      'Espèces',
    CASH:         'Espèces',
    MOBILE_MONEY: 'Mobile Money',
    CREDIT:       'À crédit',
};

// ── Barre de progression ──────────────────────────────────────────────────────
function OrderProgressBar({ status }: { status: string }) {
    const currentIdx  = STEPS.indexOf(status as typeof STEPS[number]);
    const isCancelled = status === 'CANCELLED';

    return (
        <View style={pb.wrapper}>
            <View style={pb.row}>
                {STEPS.map((step, idx) => {
                    const isPast    = currentIdx > idx;
                    const isCurrent = currentIdx === idx;
                    const isLast    = idx === STEPS.length - 1;
                    const dotColor  = isCancelled
                        ? colors.slate200
                        : isCurrent
                            ? colors.info
                            : isPast
                                ? colors.primary
                                : colors.slate200;

                    return (
                        <React.Fragment key={step}>
                            <View style={[pb.dot, { backgroundColor: dotColor, borderColor: dotColor }]} />
                            {!isLast && (
                                <View style={[pb.line, !isCancelled && isPast && pb.lineDone]} />
                            )}
                        </React.Fragment>
                    );
                })}
            </View>
            <View style={pb.labelsRow}>
                {STEP_LABELS.map((label, idx) => (
                    <Text
                        key={label}
                        style={[
                            pb.label,
                            !isCancelled && currentIdx === idx && pb.labelCurrent,
                            !isCancelled && currentIdx > idx  && pb.labelDone,
                        ]}
                        numberOfLines={1}
                    >
                        {label}
                    </Text>
                ))}
            </View>
        </View>
    );
}

const pb = StyleSheet.create({
    wrapper:      { gap: 6 },
    row:          { flexDirection: 'row', alignItems: 'center' },
    dot:          { width: 10, height: 10, borderRadius: 4, backgroundColor: colors.slate200, borderWidth: 2, borderColor: colors.slate200 },
    line:         { flex: 1, height: 2, backgroundColor: colors.slate200 },
    lineDone:     { backgroundColor: colors.primary },
    labelsRow:    { flexDirection: 'row', justifyContent: 'space-between' },
    label:        { fontSize: 11, fontWeight: '600', color: colors.slate400, textAlign: 'center', flex: 1 },
    labelCurrent: { color: colors.info, fontWeight: '900' },
    labelDone:    { color: colors.primary, fontWeight: '700' },
});

// ── Composant principal ────────────────────────────────────────────────────────
export default function MesCommandesScreen() {
    const { activeProfile } = useProfileContext();
    const { user }          = useAuth();

    const [orders,        setOrders]        = useState<MerchantOrder[]>([]);
    const [loading,       setLoading]       = useState(true);
    const [refreshing,    setRefreshing]    = useState(false);
    const [selectedOrder, setSelectedOrder] = useState<MerchantOrder | null>(null);
    const [actionLoading, setActionLoading] = useState(false);

    // ── Fetch commandes du marchand ────────────────────────────────────────────
    const fetchOrders = useCallback(async () => {
        if (!activeProfile) return;
        setLoading(true);
        try {
            // Étape 1 : commandes où je suis acheteur
            const { data: ordersData, error } = await supabase
                .from('orders')
                .select('*, products(name, price), stores!seller_store_id(id, name, owner_id)')
                .eq('buyer_store_id', activeProfile.id)
                .order('created_at', { ascending: false });

            if (error) throw error;

            const rows = (ordersData ?? []) as any[];

            // Étape 2 : profils des producteurs (owner de chaque seller_store)
            const ownerIds = [...new Set(rows.map((o: any) => o.stores?.owner_id).filter(Boolean))] as string[];
            const profileMap: Record<string, { full_name: string; phone_number: string }> = {};
            if (ownerIds.length > 0) {
                const { data: profilesData } = await supabase
                    .from('profiles')
                    .select('id, full_name, phone_number')
                    .in('id', ownerIds);
                for (const p of (profilesData ?? []) as any[]) {
                    profileMap[p.id] = { full_name: p.full_name, phone_number: p.phone_number };
                }
            }

            setOrders(rows.map((o: any) => ({
                ...o,
                sellerStore:   o.stores ?? null,
                sellerProfile: o.stores?.owner_id ? (profileMap[o.stores.owner_id] ?? null) : null,
            })));
        } catch (err) {
            console.error('[MesCommandes] fetch error:', err);
        } finally {
            setLoading(false);
        }
    }, [activeProfile]);

    useFocusEffect(useCallback(() => { fetchOrders(); }, [fetchOrders]));

    useEffect(() => {
        const u1 = onSocketEvent('commande-acceptee',   () => fetchOrders());
        const u2 = onSocketEvent('livraison-en-cours',  () => fetchOrders());
        return () => { u1(); u2(); };
    }, [fetchOrders]);

    const handleRefresh = async () => {
        setRefreshing(true);
        await fetchOrders();
        setRefreshing(false);
    };

    // ── Confirmer la réception (SHIPPED → DELIVERED) ───────────────────────────
    const handleConfirmReception = (order: MerchantOrder) => {
        const productName = order.products?.name ?? order.product_name ?? 'ce produit';
        Alert.alert(
            'Confirmer la réception',
            `Confirmez-vous avoir reçu ${order.quantity} ${productName} ?`,
            [
                { text: 'Annuler', style: 'cancel' },
                { text: "Oui, j'ai reçu", style: 'default', onPress: () => doConfirmReception(order) },
            ]
        );
    };

    const doConfirmReception = async (order: MerchantOrder) => {
        setActionLoading(true);
        try {
            // 1. Mettre à jour le statut
            const { error: updateErr } = await supabase
                .from('orders')
                .update({ status: 'DELIVERED' })
                .eq('id', order.id);
            if (updateErr) throw updateErr;

            // 2. Mettre à jour le stock du marchand
            if (order.product_id && activeProfile) {
                const { data: existingStock } = await supabase
                    .from('stock')
                    .select('id, quantity')
                    .eq('store_id', activeProfile.id)
                    .eq('product_id', order.product_id)
                    .maybeSingle();

                if (existingStock) {
                    await supabase
                        .from('stock')
                        .update({ quantity: existingStock.quantity + order.quantity })
                        .eq('id', existingStock.id);
                } else {
                    await supabase.from('stock').insert([{
                        store_id:   activeProfile.id,
                        product_id: order.product_id,
                        quantity:   order.quantity,
                    }]);
                }
            }

            // 3. Notification au producteur
            const producteurId = order.sellerStore?.owner_id ?? null;
            const productName  = order.products?.name ?? order.product_name ?? 'Produit';
            const marchandNom  = user?.name ?? 'Marchand';
            if (producteurId) {
                await supabase.from('notifications').insert([{
                    user_id: producteurId,
                    titre:   'Livraison confirmée ✓',
                    message: `${marchandNom} a confirmé la réception de ${order.quantity} ${productName}.`,
                    type:    'livraison',
                    data:    { orderId: order.id, route: '/producteur/commandes' },
                    lu:      false,
                }]);
            }

            // 4. Event Socket.io
            emitEvent('livraison-terminee', {
                orderId:       order.id,
                buyerStoreId:  activeProfile?.id,
                buyerUserId:   user?.id ?? null,
                sellerStoreId: order.seller_store_id,
                productName,
                quantity:      order.quantity,
                totalPrice:    order.total_amount,
            });

            // 5. Log activité
            try {
                await supabase.from('activity_logs').insert([{
                    user_id:   user?.id ?? null,
                    user_name: marchandNom,
                    action:    `Réception confirmée : ${productName} × ${order.quantity} (${(order.total_amount || 0).toLocaleString('fr-FR')} F)`,
                    type:      'livraison',
                }]);
            } catch {}

            setSelectedOrder(null);
            await fetchOrders();
        } catch (err) {
            console.error('[MesCommandes] confirm error:', err);
            Alert.alert('Erreur', 'Impossible de confirmer la réception. Réessaie.');
        } finally {
            setActionLoading(false);
        }
    };

    // ── Annuler une commande PENDING ──────────────────────────────────────────
    const handleCancelOrder = (order: MerchantOrder) => {
        Alert.alert(
            'Annuler la commande ?',
            `Voulez-vous annuler cette commande de ${order.products?.name ?? 'ce produit'} ?`,
            [
                { text: 'Non', style: 'cancel' },
                {
                    text: 'Annuler la commande', style: 'destructive',
                    onPress: async () => {
                        try {
                            await supabase.from('orders').update({ status: 'CANCELLED' }).eq('id', order.id);
                            setSelectedOrder(null);
                            await fetchOrders();
                        } catch {}
                    },
                },
            ]
        );
    };

    // ── Rendu carte ───────────────────────────────────────────────────────────
    const renderOrderCard = (order: MerchantOrder) => {
        const sc          = STATUS_COLORS[order.status] ?? STATUS_COLORS.PENDING;
        const productName = order.products?.name ?? order.product_name ?? 'Produit';
        const sellerName  = order.sellerStore?.name ?? 'Producteur';
        const total       = order.total_amount > 0
            ? `${order.total_amount.toLocaleString('fr-FR')} F`
            : order.unit_price > 0
                ? `${(order.unit_price * order.quantity).toLocaleString('fr-FR')} F`
                : '–';

        return (
            <TouchableOpacity
                key={order.id}
                style={styles.orderCard}
                onPress={() => setSelectedOrder(order)}
                activeOpacity={0.85}
            >
                {/* En-tête */}
                <View style={styles.cardHeader}>
                    <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={styles.cardProduct} numberOfLines={1}>{productName}</Text>
                        <Text style={styles.cardSeller}  numberOfLines={1}>{sellerName}</Text>
                    </View>
                    <View style={[styles.statusBadge, { backgroundColor: sc.bg }]}>
                        <Text style={[styles.statusText, { color: sc.text }]}>
                            {STATUS_LABELS[order.status] ?? order.status}
                        </Text>
                    </View>
                </View>

                {/* Barre de progression */}
                {order.status !== 'CANCELLED' && (
                    <OrderProgressBar status={order.status} />
                )}

                {/* Résumé bas de carte */}
                <View style={styles.cardFooter}>
                    <Text style={styles.cardQty}>{order.quantity} unité(s)</Text>
                    <Text style={styles.cardTotal}>{total}</Text>
                    <Text style={styles.cardDate}>
                        {new Date(order.created_at).toLocaleDateString('fr-FR')}
                    </Text>
                </View>

                {/* Bandeau En livraison */}
                {order.status === 'SHIPPED' && (
                    <View style={styles.shippedBanner}>
                        <Truck color="#1e40af" size={14} />
                        <Text style={styles.shippedBannerText}>
                            En livraison — Appuyez pour confirmer la réception
                        </Text>
                    </View>
                )}
            </TouchableOpacity>
        );
    };

    // ── Modal détail ──────────────────────────────────────────────────────────
    const renderDetailModal = () => {
        if (!selectedOrder) return null;
        const o = selectedOrder;
        const sc          = STATUS_COLORS[o.status] ?? STATUS_COLORS.PENDING;
        const productName = o.products?.name ?? o.product_name ?? 'Produit';
        const sellerName  = o.sellerStore?.name ?? 'Boutique';
        const sellerPhone = o.sellerProfile?.phone_number ?? null;
        const sellerNom   = o.sellerProfile?.full_name ?? sellerName;
        const total       = o.total_amount > 0
            ? `${o.total_amount.toLocaleString('fr-FR')} F`
            : o.unit_price > 0
                ? `${(o.unit_price * o.quantity).toLocaleString('fr-FR')} F`
                : '–';

        return (
            <Modal
                visible
                transparent
                animationType="slide"
                onRequestClose={() => setSelectedOrder(null)}
            >
                <View style={styles.modalOverlay}>
                    <View style={styles.modalContent}>

                        {/* Header modal */}
                        <View style={styles.modalHeader}>
                            <View style={{ flex: 1, minWidth: 0 }}>
                                <Text style={styles.modalTitle}    numberOfLines={1}>{productName}</Text>
                                <Text style={styles.modalSubtitle} numberOfLines={1}>{sellerName}</Text>
                            </View>
                            <TouchableOpacity
                                style={styles.modalClose}
                                onPress={() => setSelectedOrder(null)}
                                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                            >
                                <X color={colors.slate600} size={18} />
                            </TouchableOpacity>
                        </View>

                        {/* Badge statut */}
                        <View style={{ paddingHorizontal: 20, paddingTop: 16 }}>
                            <View style={[styles.modalStatusBadge, { backgroundColor: sc.bg }]}>
                                <Text style={[styles.modalStatusText, { color: sc.text }]}>
                                    {STATUS_LABELS[o.status] ?? o.status}
                                </Text>
                            </View>
                        </View>

                        {/* Progression */}
                        {o.status !== 'CANCELLED' && (
                            <View style={styles.modalProgressWrap}>
                                <OrderProgressBar status={o.status} />
                            </View>
                        )}

                        <ScrollView showsVerticalScrollIndicator={false}>

                            {/* Détail commande */}
                            <View style={styles.infoSection}>
                                <Text style={styles.infoSectionTitle}>DÉTAIL COMMANDE</Text>
                                <View style={styles.infoRow}>
                                    <Text style={styles.infoLabel}>Produit</Text>
                                    <Text style={styles.infoValue} numberOfLines={2}>{productName}</Text>
                                </View>
                                <View style={styles.infoRow}>
                                    <Text style={styles.infoLabel}>Quantité</Text>
                                    <Text style={styles.infoValue}>{o.quantity} unité(s)</Text>
                                </View>
                                {o.unit_price > 0 && (
                                    <View style={styles.infoRow}>
                                        <Text style={styles.infoLabel}>Prix unitaire</Text>
                                        <Text style={styles.infoValue}>
                                            {o.unit_price.toLocaleString('fr-FR')} F
                                        </Text>
                                    </View>
                                )}
                                <View style={[styles.infoRow, styles.infoRowTotal]}>
                                    <Text style={styles.infoLabelTotal}>TOTAL</Text>
                                    <Text style={styles.infoValueTotal}>{total}</Text>
                                </View>
                            </View>

                            {/* Producteur */}
                            <View style={styles.infoSection}>
                                <Text style={styles.infoSectionTitle}>PRODUCTEUR</Text>
                                <View style={styles.infoRow}>
                                    <Text style={styles.infoLabel}>Boutique</Text>
                                    <Text style={styles.infoValue}>{sellerName}</Text>
                                </View>
                                <View style={styles.infoRow}>
                                    <Text style={styles.infoLabel}>Nom</Text>
                                    <Text style={styles.infoValue}>{sellerNom}</Text>
                                </View>
                                {sellerPhone && (
                                    <View style={styles.infoRow}>
                                        <Text style={styles.infoLabel}>Téléphone</Text>
                                        <TouchableOpacity
                                            onPress={() => Linking.openURL(`tel:${sellerPhone}`)}
                                            style={styles.phoneRow}
                                        >
                                            <Phone color={colors.primary} size={13} />
                                            <Text style={styles.phoneText}>{sellerPhone}</Text>
                                        </TouchableOpacity>
                                    </View>
                                )}
                            </View>

                            {/* Mode de paiement */}
                            {!!o.payment_mode && (
                                <View style={styles.infoSection}>
                                    <Text style={styles.infoSectionTitle}>PAIEMENT</Text>
                                    <View style={styles.infoRow}>
                                        <Text style={styles.infoLabel}>Mode</Text>
                                        <Text style={styles.infoValue}>
                                            {PAYMENT_LABELS[o.payment_mode] ?? o.payment_mode}
                                        </Text>
                                    </View>
                                </View>
                            )}

                            {/* Date */}
                            <View style={styles.infoSection}>
                                <View style={styles.infoRow}>
                                    <Text style={styles.infoLabel}>Commandé le</Text>
                                    <Text style={styles.infoValue}>
                                        {new Date(o.created_at).toLocaleDateString('fr-FR', {
                                            day: '2-digit', month: 'long', year: 'numeric',
                                        })}
                                        {' à '}
                                        {new Date(o.created_at).toLocaleTimeString('fr-FR', {
                                            hour: '2-digit', minute: '2-digit',
                                        })}
                                    </Text>
                                </View>
                            </View>

                            {/* Bouton confirmation réception (SHIPPED uniquement) */}
                            {o.status === 'SHIPPED' && (
                                <TouchableOpacity
                                    style={[styles.confirmBtn, actionLoading && { opacity: 0.6 }]}
                                    onPress={() => handleConfirmReception(o)}
                                    disabled={actionLoading}
                                    activeOpacity={0.85}
                                >
                                    {actionLoading
                                        ? <ActivityIndicator color={colors.white} size="small" />
                                        : <Text style={styles.confirmBtnText}>J'AI REÇU MA COMMANDE ✓</Text>
                                    }
                                </TouchableOpacity>
                            )}

                            {/* Bouton annulation (PENDING uniquement) */}
                            {o.status === 'PENDING' && (
                                <TouchableOpacity
                                    style={[styles.cancelBtn, actionLoading && { opacity: 0.6 }]}
                                    onPress={() => handleCancelOrder(o)}
                                    disabled={actionLoading}
                                    activeOpacity={0.85}
                                >
                                    <Text style={styles.cancelBtnText}>ANNULER LA COMMANDE</Text>
                                </TouchableOpacity>
                            )}

                            <View style={{ height: 24 }} />
                        </ScrollView>
                    </View>
                </View>
            </Modal>
        );
    };

    // ── Rendu principal ────────────────────────────────────────────────────────
    return (
        <View style={styles.safe}>
            <ScreenHeader
                title="Mes Commandes"
                subtitle="Suivi de vos achats"
                showBack={true}
            />

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
                        <Package color={colors.slate300} size={48} />
                        <Text style={styles.emptyText}>AUCUNE COMMANDE</Text>
                        <Text style={styles.emptySubText}>
                            Vos commandes passées sur le Marché Virtuel apparaîtront ici.
                        </Text>
                    </View>
                ) : (
                    orders.map(order => renderOrderCard(order))
                )}
            </ScrollView>

            {renderDetailModal()}
        </View>
    );
}

// ── Styles ─────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
    safe:          { flex: 1, backgroundColor: colors.bgSecondary },
    scroll:        { flex: 1 },
    scrollContent: { paddingHorizontal: 16, paddingTop: 20, paddingBottom: 40, gap: 12 },

    // Order card
    orderCard: {
        backgroundColor: colors.white, borderRadius: 10, padding: 16,
        borderWidth: 1, borderColor: colors.slate100, gap: 12,
        shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.05, shadowRadius: 4, elevation: 2,
    },
    cardHeader:  { flexDirection: 'row', alignItems: 'center', gap: 10 },
    cardProduct: { fontSize: 14, fontWeight: '700', color: colors.slate800 },
    cardSeller:  { fontSize: 11, fontWeight: '600', color: colors.slate500, marginTop: 2 },
    statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6, flexShrink: 0 },
    statusText:  { fontSize: 11, fontWeight: '700' },

    cardFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    cardQty:    { fontSize: 11, fontWeight: '700', color: colors.slate500 },
    cardTotal:  { fontSize: 13, fontWeight: '900', color: colors.slate800 },
    cardDate:   { fontSize: 11, fontWeight: '600', color: colors.slate400 },

    shippedBanner: {
        flexDirection: 'row', alignItems: 'center', gap: 8,
        backgroundColor: '#eff6ff', borderRadius: 8, padding: 10,
        borderWidth: 1, borderColor: '#bfdbfe',
    },
    shippedBannerText: { flex: 1, fontSize: 12, fontWeight: '600', color: '#1e40af' },

    // Modal
    modalOverlay: {
        flex: 1, backgroundColor: 'rgba(0,0,0,0.5)',
        justifyContent: 'flex-end',
    },
    modalContent: {
        backgroundColor: colors.white,
        borderTopLeftRadius: 12, borderTopRightRadius: 12,
        maxHeight: '90%',
    },
    modalHeader: {
        flexDirection: 'row', alignItems: 'center', gap: 12,
        padding: 20, paddingBottom: 14,
        borderBottomWidth: 1, borderBottomColor: colors.slate100,
    },
    modalTitle:    { fontSize: 16, fontWeight: '900', color: colors.slate800 },
    modalSubtitle: { fontSize: 12, fontWeight: '600', color: colors.slate500, marginTop: 2 },
    modalClose: {
        width: 36, height: 36, borderRadius: 8,
        backgroundColor: colors.slate100, alignItems: 'center', justifyContent: 'center', flexShrink: 0,
    },
    modalStatusBadge:  { alignSelf: 'flex-start', paddingHorizontal: 12, paddingVertical: 5, borderRadius: 6 },
    modalStatusText:   { fontSize: 12, fontWeight: '700' },
    modalProgressWrap: { paddingHorizontal: 20, paddingTop: 16 },

    // Info sections
    infoSection: {
        marginHorizontal: 20, marginTop: 16,
        backgroundColor: colors.slate50, borderRadius: 10, padding: 14, gap: 10,
    },
    infoSectionTitle: { fontSize: 11, fontWeight: '900', color: colors.slate400, letterSpacing: 1.5, marginBottom: 2 },
    infoRow:      { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 },
    infoRowTotal: { paddingTop: 10, borderTopWidth: 1, borderTopColor: colors.slate200, marginTop: 2 },
    infoLabel:    { fontSize: 12, fontWeight: '600', color: colors.slate500 },
    infoValue:    { fontSize: 12, fontWeight: '700', color: colors.slate800, flex: 1, textAlign: 'right' },
    infoLabelTotal:  { fontSize: 13, fontWeight: '900', color: colors.slate700 },
    infoValueTotal:  { fontSize: 16, fontWeight: '900', color: colors.primary },

    phoneRow:  { flexDirection: 'row', alignItems: 'center', gap: 4 },
    phoneText: { fontSize: 12, fontWeight: '700', color: colors.primary },

    // Boutons action
    confirmBtn: {
        marginHorizontal: 20, marginTop: 20,
        backgroundColor: colors.primary, borderRadius: 10,
        padding: 16, alignItems: 'center',
    },
    confirmBtnText: { color: colors.white, fontWeight: '900', fontSize: 14, letterSpacing: 0.5 },

    cancelBtn: {
        marginHorizontal: 20, marginTop: 12,
        borderRadius: 10, padding: 14, alignItems: 'center',
        borderWidth: 2, borderColor: colors.error,
    },
    cancelBtnText: { color: colors.error, fontWeight: '900', fontSize: 13, letterSpacing: 0.5 },

    // Empty
    emptyCard: {
        backgroundColor: colors.white, borderRadius: 10, padding: 48,
        alignItems: 'center', borderWidth: 2, borderColor: colors.slate100,
        borderStyle: 'dashed', gap: 12,
    },
    emptyText:    { fontSize: 11, fontWeight: '900', color: colors.slate300, letterSpacing: 2, textAlign: 'center' },
    emptySubText: { fontSize: 12, color: colors.slate400, textAlign: 'center', lineHeight: 18 },
});
