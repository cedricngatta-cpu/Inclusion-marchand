// Commandes reçues + Demandes Groupées — Producteur
import React, { useState, useEffect, useCallback } from 'react';
import {
    View, Text, ScrollView, StyleSheet, TouchableOpacity,
    ActivityIndicator, RefreshControl, TextInput, Alert,
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { ShoppingBag, Users, Clock, MessageSquare } from 'lucide-react-native';
import { ScreenHeader } from '@/src/components/ui';
import { supabase } from '@/src/lib/supabase';
import { colors } from '@/src/lib/colors';
import { useProfileContext } from '@/src/context/ProfileContext';
import { useAuth } from '@/src/context/AuthContext';
import { emitEvent, onSocketEvent } from '@/src/lib/socket';

const log = (...args: any[]) => { if (__DEV__) console.log(...args); };

// ── Types ──────────────────────────────────────────────────────────────────────
type FilterType = 'ALL' | 'PENDING' | 'ACCEPTED' | 'SHIPPED' | 'DELIVERED' | 'CANCELLED';

interface Order {
    id: string;
    status: string;
    quantity: number;
    total_amount: number;
    payment_mode: string | null;
    created_at: string;
    product_id: string | null;
    buyer_store_id: string | null;
    products: { name: string; price: number } | null;
    stores: { id: string; name: string; owner_id?: string } | null;
}

interface DemandeGroupee {
    id: string;
    cooperative_id: string | null;
    produit_id: string | null;
    nom_produit: string;
    prix_normal: number;
    prix_negocie: number | null;
    quantite_minimum: number;
    quantite_totale: number;
    date_limite: string | null;
    description: string | null;
    message_coop: string | null;
    created_at: string;
    // enrichi
    cooperativeNom?: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
const FILTERS: { key: FilterType; label: string }[] = [
    { key: 'ALL',       label: 'Toutes' },
    { key: 'PENDING',   label: 'En attente' },
    { key: 'ACCEPTED',  label: 'Acceptées' },
    { key: 'SHIPPED',   label: 'En livraison' },
    { key: 'DELIVERED', label: 'Livrées' },
    { key: 'CANCELLED', label: 'Refusées' },
];

const STATUS_LABELS: Record<string, string> = {
    PENDING:   'En attente',
    ACCEPTED:  'Acceptée',
    SHIPPED:   'En livraison',
    DELIVERED: 'Livrée',
    CANCELLED: 'Refusée',
};

const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
    PENDING:   { bg: '#fef3c7', text: '#92400e' },
    ACCEPTED:  { bg: '#d1fae5', text: '#065f46' },
    SHIPPED:   { bg: '#dbeafe', text: '#1e40af' },
    DELIVERED: { bg: '#f0fdf4', text: '#166534' },
    CANCELLED: { bg: '#fee2e2', text: '#991b1b' },
};

// ── Composant principal ────────────────────────────────────────────────────────
export default function CommandesScreen() {
    const router = useRouter();
    const { activeProfile } = useProfileContext();
    const { user }          = useAuth();

    // Tab principal
    const [activeTab, setActiveTab] = useState<'orders' | 'groupees'>('orders');

    // ── Commandes classiques ──────────────────────────────────────────────────
    const [orders, setOrders]   = useState<Order[]>([]);
    const [filter, setFilter]   = useState<FilterType>('ALL');
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [actionLoading, setActionLoading] = useState<string | null>(null);

    // ── Demandes groupées ─────────────────────────────────────────────────────
    const [demandes,        setDemandes]        = useState<DemandeGroupee[]>([]);
    const [demandesLoading, setDemandesLoading] = useState(false);
    const [prixInputs,      setPrixInputs]      = useState<Record<string, string>>({});
    const [actionDemande,   setActionDemande]   = useState<string | null>(null);

    // ── Fetch commandes ────────────────────────────────────────────────────────
    const fetchOrders = useCallback(async () => {
        if (!activeProfile) return;
        setLoading(true);
        try {
            let query = supabase
                .from('orders')
                .select('*, products(name, price), stores!buyer_store_id(id, name, owner_id)')
                .eq('seller_store_id', activeProfile.id)
                .order('created_at', { ascending: false });
            if (filter !== 'ALL') query = query.eq('status', filter);
            const { data, error } = await query;
            if (error) log('[Commandes] fetch error:', error.message);
            setOrders((data as Order[]) || []);
        } catch (err) {
            console.error('[Commandes] fetch error:', err);
        } finally {
            setLoading(false);
        }
    }, [activeProfile, filter]);

    // ── Fetch demandes groupées ────────────────────────────────────────────────
    const fetchDemandes = useCallback(async () => {
        const profileId = user?.id;
        if (!profileId) return;
        setDemandesLoading(true);
        try {
            const { data, error } = await supabase
                .from('achats_groupes')
                .select('*')
                .eq('producteur_id', profileId)
                .eq('statut', 'NEGOTIATION')
                .order('created_at', { ascending: false });
            if (error) throw error;

            const rows = (data as DemandeGroupee[]) ?? [];

            // Noms coopératives
            const coopIds = [...new Set(rows.map(r => r.cooperative_id).filter(Boolean))] as string[];
            const { data: coopData } = coopIds.length > 0
                ? await supabase.from('profiles').select('id, full_name').in('id', coopIds)
                : { data: [] };
            const coopMap: Record<string, string> = {};
            for (const c of (coopData ?? []) as { id: string; full_name: string | null }[]) {
                coopMap[c.id] = c.full_name ?? 'Coopérative';
            }

            setDemandes(rows.map(r => ({
                ...r,
                cooperativeNom: r.cooperative_id ? (coopMap[r.cooperative_id] ?? 'Coopérative') : 'Coopérative',
            })));
        } catch (err) {
            console.error('[Demandes] fetch error:', err);
        } finally {
            setDemandesLoading(false);
        }
    }, [user]);

    useEffect(() => { fetchOrders(); }, [fetchOrders]);

    useEffect(() => {
        const unsub = onSocketEvent('nouvelle-commande', () => { fetchOrders(); });
        return unsub;
    }, [fetchOrders]);

    // Écouter nouvelles demandes groupées
    useEffect(() => {
        const unsub = onSocketEvent('demande-prix-groupe', () => { fetchDemandes(); });
        return unsub;
    }, [fetchDemandes]);

    useFocusEffect(useCallback(() => {
        fetchOrders();
        fetchDemandes();
    }, [fetchOrders, fetchDemandes]));

    const handleRefresh = async () => {
        setRefreshing(true);
        await Promise.all([fetchOrders(), fetchDemandes()]);
        setRefreshing(false);
    };

    // ── Mise à jour statut commande ───────────────────────────────────────────
    const handleUpdateStatus = async (order: Order, status: string) => {
        setActionLoading(order.id + status);
        try {
            const { error: updateErr } = await supabase.from('orders').update({ status }).eq('id', order.id);
            if (updateErr) throw updateErr;

            const buyerStoreId = order.stores?.id ?? order.buyer_store_id ?? null;
            const eventData = {
                buyerStoreId,
                buyerUserId: order.stores?.owner_id ?? null,
                productName: order.products?.name ?? 'Produit',
                quantity:    order.quantity,
                orderId:     order.id,
            };

            if (status === 'ACCEPTED' || status === 'CANCELLED') {
                try {
                    const actionLabel = status === 'ACCEPTED' ? 'Commande acceptée' : 'Commande refusée';
                    await supabase.from('activity_logs').insert([{
                        user_id:   user?.id ?? null,
                        user_name: user?.name ?? 'Producteur',
                        action:    `${actionLabel} : ${order.products?.name ?? 'Produit'} × ${order.quantity} (${(order.total_amount || 0).toLocaleString('fr-FR')} F)`,
                        type:      'commande',
                    }]);
                } catch {}
            }

            if (status === 'ACCEPTED') {
                emitEvent('commande-acceptee', { ...eventData, estimatedDelivery: null });
            } else if (status === 'CANCELLED') {
                emitEvent('commande-refusee', { ...eventData, reason: 'Non disponible' });
            } else if (status === 'SHIPPED') {
                emitEvent('livraison-en-cours', { ...eventData, driverName: user?.name });
            }

            await fetchOrders();
        } catch (err) {
            console.error('[Commandes] update error:', err);
        } finally {
            setActionLoading(null);
        }
    };

    // ── Proposer un prix groupé ────────────────────────────────────────────────
    const handleProposer = async (demande: DemandeGroupee) => {
        const prixStr = prixInputs[demande.id] ?? '';
        const prix    = parseFloat(prixStr);
        if (isNaN(prix) || prix <= 0) {
            Alert.alert('Prix invalide', 'Entrez un prix valide supérieur à 0.');
            return;
        }
        setActionDemande(demande.id + 'propose');
        try {
            const { error } = await supabase
                .from('achats_groupes')
                .update({ prix_negocie: prix })
                .eq('id', demande.id);
            if (error) throw error;

            emitEvent('prix-groupe-propose', {
                achatGroupeId:  demande.id,
                cooperativeId:  demande.cooperative_id,
                nomProduit:     demande.nom_produit,
                prixPropose:    prix,
                producteurNom:  user?.name ?? 'Producteur',
            });

            Alert.alert('Prix envoyé !', `Votre prix de ${prix.toLocaleString('fr-FR')} F a été transmis à ${demande.cooperativeNom}. Vous serez notifié de leur réponse.`);
            fetchDemandes();
        } catch (err) {
            console.error('[Demandes] proposer error:', err);
            Alert.alert('Erreur', "Impossible d'envoyer le prix.");
        } finally {
            setActionDemande(null);
        }
    };

    // ── Refuser une demande ───────────────────────────────────────────────────
    const handleRefuserDemande = (demande: DemandeGroupee) => {
        Alert.alert(
            'Refuser la demande ?',
            `Vous allez refuser la demande de ${demande.cooperativeNom} pour ${demande.nom_produit}.`,
            [
                { text: 'Annuler', style: 'cancel' },
                {
                    text: 'Refuser', style: 'destructive',
                    onPress: async () => {
                        try {
                            await supabase
                                .from('achats_groupes')
                                .update({ statut: 'CANCELLED' })
                                .eq('id', demande.id);
                            fetchDemandes();
                        } catch {}
                    },
                },
            ]
        );
    };

    // ── Rendu ─────────────────────────────────────────────────────────────────
    return (
        <View style={styles.safe}>
            <ScreenHeader
                title="Mes Commandes"
                subtitle={activeTab === 'orders' ? 'Commandes reçues' : 'Demandes de prix groupé'}
                showBack={true}
                paddingBottom={12}
            >
                {/* Tab principal */}
                <View style={styles.mainTabRow}>
                    <TouchableOpacity
                        style={[styles.mainTab, activeTab === 'orders' && styles.mainTabActive]}
                        onPress={() => setActiveTab('orders')}
                    >
                        <ShoppingBag color={activeTab === 'orders' ? colors.primary : 'rgba(255,255,255,0.7)'} size={14} />
                        <Text style={[styles.mainTabText, activeTab === 'orders' && styles.mainTabTextActive]}>
                            Commandes
                        </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                        style={[styles.mainTab, activeTab === 'groupees' && styles.mainTabActive]}
                        onPress={() => setActiveTab('groupees')}
                    >
                        <Users color={activeTab === 'groupees' ? colors.primary : 'rgba(255,255,255,0.7)'} size={14} />
                        <Text style={[styles.mainTabText, activeTab === 'groupees' && styles.mainTabTextActive]}>
                            Groupées {demandes.length > 0 ? `(${demandes.length})` : ''}
                        </Text>
                    </TouchableOpacity>
                </View>

                {/* Filtres statut (seulement pour commandes) */}
                {activeTab === 'orders' && (
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filtersRow}>
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
                )}
            </ScreenHeader>

            <ScrollView
                style={styles.scroll}
                contentContainerStyle={styles.scrollContent}
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
                refreshControl={
                    <RefreshControl
                        refreshing={refreshing}
                        onRefresh={handleRefresh}
                        colors={[colors.primary]}
                        tintColor={colors.primary}
                    />
                }
            >
                {/* ── TAB COMMANDES ── */}
                {activeTab === 'orders' && (
                    loading ? (
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
                            const sc         = STATUS_COLORS[order.status] ?? STATUS_COLORS.PENDING;
                            const isPending  = order.status === 'PENDING';
                            const isAccepted = order.status === 'ACCEPTED';
                            const isShipping = order.status === 'SHIPPED';
                            const acceptKey   = order.id + 'ACCEPTED';
                            const rejectKey   = order.id + 'CANCELLED';
                            const shippingKey = order.id + 'SHIPPED';

                            return (
                                <View key={order.id} style={styles.orderCard}>
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

                                    <View style={styles.orderDetails}>
                                        <View style={styles.detailItem}>
                                            <Text style={styles.detailLabel}>QUANTITÉ</Text>
                                            <Text style={styles.detailValue}>{order.quantity} u</Text>
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

                                    {isPending && (
                                        <View style={styles.actionRow}>
                                            <TouchableOpacity
                                                style={[styles.acceptBtn, actionLoading === acceptKey && { opacity: 0.6 }]}
                                                onPress={() => handleUpdateStatus(order, 'ACCEPTED')}
                                                disabled={!!actionLoading}
                                            >
                                                {actionLoading === acceptKey
                                                    ? <ActivityIndicator color={colors.white} size="small" />
                                                    : <Text style={styles.acceptBtnText}>ACCEPTER</Text>}
                                            </TouchableOpacity>
                                            <TouchableOpacity
                                                style={[styles.rejectBtn, actionLoading === rejectKey && { opacity: 0.6 }]}
                                                onPress={() => handleUpdateStatus(order, 'CANCELLED')}
                                                disabled={!!actionLoading}
                                            >
                                                {actionLoading === rejectKey
                                                    ? <ActivityIndicator color={colors.error} size="small" />
                                                    : <Text style={styles.rejectBtnText}>REFUSER</Text>}
                                            </TouchableOpacity>
                                        </View>
                                    )}

                                    {isAccepted && (
                                        <TouchableOpacity
                                            style={[styles.shippingBtn, actionLoading === shippingKey && { opacity: 0.6 }]}
                                            onPress={() => handleUpdateStatus(order, 'SHIPPED')}
                                            disabled={!!actionLoading}
                                        >
                                            {actionLoading === shippingKey
                                                ? <ActivityIndicator color={colors.white} size="small" />
                                                : <Text style={styles.shippingBtnText}>🚚  METTRE EN LIVRAISON</Text>}
                                        </TouchableOpacity>
                                    )}

                                    {/* Livraison confirmée par le marchand uniquement */}
                                </View>
                            );
                        })
                    )
                )}

                {/* ── TAB DEMANDES GROUPÉES ── */}
                {activeTab === 'groupees' && (
                    demandesLoading ? (
                        <ActivityIndicator color={colors.primary} style={{ marginTop: 32 }} />
                    ) : demandes.length === 0 ? (
                        <View style={styles.emptyCard}>
                            <Users color={colors.slate300} size={48} />
                            <Text style={styles.emptyText}>AUCUNE DEMANDE GROUPÉE</Text>
                            <Text style={styles.emptySubText}>
                                La coopérative vous enverra des demandes de prix pour des achats groupés.
                            </Text>
                        </View>
                    ) : (
                        demandes.map(demande => {
                            const hasPrix     = demande.prix_negocie !== null && demande.prix_negocie !== undefined;
                            const isProposing = actionDemande === demande.id + 'propose';
                            const inputVal    = prixInputs[demande.id] ?? '';

                            return (
                                <View key={demande.id} style={styles.demandeCard}>
                                    {/* En-tête */}
                                    <View style={styles.demandeHeader}>
                                        <View style={styles.demandeIconBox}>
                                            <Users color="#7c3aed" size={18} />
                                        </View>
                                        <View style={{ flex: 1 }}>
                                            <Text style={styles.demandeProduct} numberOfLines={1}>
                                                {demande.nom_produit}
                                            </Text>
                                            <Text style={styles.demandeCoop} numberOfLines={1}>
                                                Demande de {demande.cooperativeNom}
                                            </Text>
                                        </View>
                                        {hasPrix ? (
                                            <View style={styles.sentBadge}>
                                                <Text style={styles.sentBadgeText}>Prix envoyé</Text>
                                            </View>
                                        ) : (
                                            <View style={styles.pendingBadge}>
                                                <Text style={styles.pendingBadgeText}>En attente</Text>
                                            </View>
                                        )}
                                    </View>

                                    {/* Infos quantité + date */}
                                    <View style={styles.demandeInfoRow}>
                                        <View style={styles.demandeInfoBlock}>
                                            <Text style={styles.demandeInfoLbl}>QTÉ CIBLE</Text>
                                            <Text style={styles.demandeInfoVal}>
                                                {demande.quantite_totale > 0 ? demande.quantite_totale : demande.quantite_minimum} u
                                            </Text>
                                        </View>
                                        <View style={styles.demandeInfoBlock}>
                                            <Text style={styles.demandeInfoLbl}>MINIMUM</Text>
                                            <Text style={styles.demandeInfoVal}>{demande.quantite_minimum} u</Text>
                                        </View>
                                        <View style={styles.demandeInfoBlock}>
                                            <Text style={styles.demandeInfoLbl}>PRIX NORMAL</Text>
                                            <Text style={styles.demandeInfoVal}>
                                                {demande.prix_normal > 0 ? `${demande.prix_normal.toLocaleString('fr-FR')} F` : '–'}
                                            </Text>
                                        </View>
                                        {demande.date_limite && (
                                            <View style={styles.demandeInfoBlock}>
                                                <Text style={styles.demandeInfoLbl}>DATE LIMITE</Text>
                                                <Text style={styles.demandeInfoVal}>
                                                    {new Date(demande.date_limite).toLocaleDateString('fr-FR')}
                                                </Text>
                                            </View>
                                        )}
                                    </View>

                                    {/* Message de la coopérative */}
                                    {!!demande.message_coop && (
                                        <View style={styles.demandeMsgBox}>
                                            <MessageSquare color="#7c3aed" size={12} />
                                            <Text style={styles.demandeMsgText}>{demande.message_coop}</Text>
                                        </View>
                                    )}

                                    {/* Si déjà répondu */}
                                    {hasPrix ? (
                                        <View style={styles.sentPriceBox}>
                                            <Text style={styles.sentPriceLabel}>VOTRE PRIX PROPOSÉ</Text>
                                            <Text style={styles.sentPriceVal}>
                                                {(demande.prix_negocie ?? 0).toLocaleString('fr-FR')} F / unité
                                            </Text>
                                            <Text style={styles.sentPriceNote}>
                                                En attente d'acceptation par la coopérative
                                            </Text>
                                        </View>
                                    ) : (
                                        /* Saisie du prix */
                                        <>
                                            <View>
                                                <Text style={styles.prixInputLabel}>VOTRE PRIX GROUPÉ (F / unité)</Text>
                                                <TextInput
                                                    style={styles.prixInput}
                                                    value={inputVal}
                                                    onChangeText={v => setPrixInputs(prev => ({ ...prev, [demande.id]: v }))}
                                                    keyboardType="numeric"
                                                    placeholder={`Prix normal : ${demande.prix_normal.toLocaleString('fr-FR')} F → proposez moins`}
                                                    placeholderTextColor={colors.slate300}
                                                />
                                            </View>
                                            <View style={styles.demandeActions}>
                                                <TouchableOpacity
                                                    style={[styles.proposerBtn, isProposing && { opacity: 0.6 }]}
                                                    onPress={() => handleProposer(demande)}
                                                    disabled={isProposing}
                                                >
                                                    {isProposing
                                                        ? <ActivityIndicator color={colors.white} size="small" />
                                                        : <Text style={styles.proposerBtnText}>ENVOYER MON PRIX</Text>}
                                                </TouchableOpacity>
                                                <TouchableOpacity
                                                    style={styles.refuserBtn}
                                                    onPress={() => handleRefuserDemande(demande)}
                                                >
                                                    <Text style={styles.refuserBtnText}>Refuser</Text>
                                                </TouchableOpacity>
                                            </View>
                                        </>
                                    )}
                                </View>
                            );
                        })
                    )
                )}
            </ScrollView>
        </View>
    );
}

// ── Styles ─────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.bgSecondary },

    // Tabs principaux
    mainTabRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
    mainTab: {
        flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
        paddingVertical: 8, borderRadius: 8,
        backgroundColor: 'rgba(255,255,255,0.15)',
    },
    mainTabActive: { backgroundColor: colors.white },
    mainTabText:       { fontSize: 12, fontWeight: '700', color: 'rgba(255,255,255,0.8)' },
    mainTabTextActive: { color: colors.primary },

    // Filtres
    filtersRow: { gap: 8, paddingVertical: 4 },
    filterTab: {
        paddingHorizontal: 14, paddingVertical: 8,
        borderRadius: 8, backgroundColor: 'rgba(255,255,255,0.15)',
    },
    filterTabActive:     { backgroundColor: colors.white },
    filterTabText:       { fontSize: 12, fontWeight: '700', color: 'rgba(255,255,255,0.8)' },
    filterTabTextActive: { color: colors.primary },

    scroll:        { flex: 1 },
    scrollContent: { paddingHorizontal: 16, paddingTop: 20, paddingBottom: 40, gap: 12 },

    // Order card
    orderCard: {
        backgroundColor: colors.white, borderRadius: 10, padding: 16,
        borderWidth: 1, borderColor: colors.slate100, gap: 12,
        shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.05, shadowRadius: 4, elevation: 2,
    },
    orderHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    orderProduct: { fontSize: 14, fontWeight: '700', color: colors.slate800 },
    orderBuyer:   { fontSize: 11, fontWeight: '600', color: colors.slate500, marginTop: 2 },
    statusBadge:  { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6, flexShrink: 0 },
    statusText:   { fontSize: 11, fontWeight: '700' },

    orderDetails:  { flexDirection: 'row', backgroundColor: colors.slate50, borderRadius: 8, padding: 12 },
    detailItem:    { flex: 1, alignItems: 'center' },
    detailDivider: { width: 1, backgroundColor: colors.slate200 },
    detailLabel:   { fontSize: 11, fontWeight: '700', color: colors.slate400, letterSpacing: 1, marginBottom: 4 },
    detailValue:   { fontSize: 12, fontWeight: '700', color: colors.slate800 },

    actionRow:    { flexDirection: 'row', gap: 8 },
    acceptBtn: {
        flex: 1, backgroundColor: colors.primary,
        borderRadius: 10, paddingVertical: 12,
        alignItems: 'center', justifyContent: 'center',
    },
    acceptBtnText: { fontSize: 12, fontWeight: '900', color: colors.white, letterSpacing: 1 },
    rejectBtn: {
        flex: 1, borderRadius: 10, paddingVertical: 12,
        alignItems: 'center', justifyContent: 'center',
        borderWidth: 2, borderColor: colors.error, backgroundColor: colors.white,
    },
    rejectBtnText: { fontSize: 12, fontWeight: '900', color: colors.error, letterSpacing: 1 },

    shippingBtn: {
        backgroundColor: '#2563EB', borderRadius: 10,
        paddingVertical: 12, alignItems: 'center', justifyContent: 'center',
    },
    shippingBtnText: { fontSize: 12, fontWeight: '900', color: colors.white, letterSpacing: 1 },

    deliveredBtn: {
        backgroundColor: colors.primary, borderRadius: 10,
        paddingVertical: 12, alignItems: 'center', justifyContent: 'center',
    },
    deliveredBtnText: { fontSize: 12, fontWeight: '900', color: colors.white, letterSpacing: 1 },

    // Demande groupée card
    demandeCard: {
        backgroundColor: colors.white, borderRadius: 10, padding: 16,
        borderWidth: 1, borderColor: '#ede9fe', gap: 12,
        shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.05, shadowRadius: 4, elevation: 2,
    },
    demandeHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    demandeIconBox: {
        width: 36, height: 36, borderRadius: 8,
        backgroundColor: '#fdf4ff', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
    },
    demandeProduct: { fontSize: 14, fontWeight: '700', color: colors.slate800 },
    demandeCoop:    { fontSize: 11, fontWeight: '600', color: '#7c3aed', marginTop: 2 },

    sentBadge:    { backgroundColor: '#d1fae5', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
    sentBadgeText:{ fontSize: 11, fontWeight: '700', color: '#065f46' },
    pendingBadge: { backgroundColor: '#fef3c7', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
    pendingBadgeText: { fontSize: 11, fontWeight: '700', color: '#92400e' },

    demandeInfoRow:    { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
    demandeInfoBlock:  { gap: 2 },
    demandeInfoLbl:    { fontSize: 11, fontWeight: '700', color: colors.slate400, letterSpacing: 1 },
    demandeInfoVal:    { fontSize: 13, fontWeight: '800', color: colors.slate700 },

    demandeMsgBox: {
        flexDirection: 'row', gap: 8, alignItems: 'flex-start',
        backgroundColor: '#fdf4ff', borderRadius: 8, padding: 10,
        borderWidth: 1, borderColor: '#ede9fe',
    },
    demandeMsgText: { flex: 1, fontSize: 12, color: '#6d28d9', lineHeight: 17 },

    prixInputLabel: { fontSize: 11, fontWeight: '900', color: colors.slate400, letterSpacing: 2, marginBottom: 8 },
    prixInput: {
        borderWidth: 1.5, borderColor: '#c4b5fd', borderRadius: 8,
        paddingHorizontal: 14, paddingVertical: 12,
        fontSize: 18, fontWeight: '700', color: colors.slate800,
    },

    demandeActions: { flexDirection: 'row', gap: 8 },
    proposerBtn: {
        flex: 1, backgroundColor: '#7c3aed', borderRadius: 8,
        paddingVertical: 12, alignItems: 'center', justifyContent: 'center',
    },
    proposerBtnText: { fontSize: 12, fontWeight: '900', color: colors.white, letterSpacing: 0.5 },
    refuserBtn: {
        paddingHorizontal: 16, paddingVertical: 12, borderRadius: 8,
        borderWidth: 1.5, borderColor: colors.slate200, alignItems: 'center', justifyContent: 'center',
    },
    refuserBtnText: { fontSize: 12, fontWeight: '700', color: colors.slate500 },

    sentPriceBox: {
        backgroundColor: '#ecfdf5', borderRadius: 8, padding: 12,
        borderWidth: 1, borderColor: '#a7f3d0', gap: 4,
    },
    sentPriceLabel: { fontSize: 11, fontWeight: '900', color: '#065f46', letterSpacing: 1.5 },
    sentPriceVal:   { fontSize: 20, fontWeight: '900', color: colors.primary },
    sentPriceNote:  { fontSize: 11, color: colors.slate500 },

    emptyCard: {
        backgroundColor: colors.white, borderRadius: 10, padding: 48,
        alignItems: 'center', borderWidth: 2, borderColor: colors.slate100,
        borderStyle: 'dashed', gap: 12,
    },
    emptyText:    { fontSize: 11, fontWeight: '900', color: colors.slate300, letterSpacing: 2, textAlign: 'center' },
    emptySubText: { fontSize: 12, color: colors.slate400, textAlign: 'center', lineHeight: 18 },
});
