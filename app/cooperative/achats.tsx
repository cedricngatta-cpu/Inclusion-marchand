// Achats B2B — Coopérative
import React, { useState, useEffect, useCallback } from 'react';
import {
    View, Text, ScrollView, StyleSheet, TouchableOpacity,
    ActivityIndicator, Modal, TextInput, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { ChevronLeft, Plus, X, ShoppingCart, Store } from 'lucide-react-native';
import { supabase } from '@/src/lib/supabase';
import { colors } from '@/src/lib/colors';

// ── Types ──────────────────────────────────────────────────────────────────────
interface Order {
    id: string;
    status: string;
    quantity: number;
    total_amount?: number;
    created_at: string;
    products?: { name: string; price: number } | null;
    buyer?: { name: string } | null;
    seller?: { name: string } | null;
}

interface StoreItem {
    id: string;
    name: string;
    owner_role?: string;
}

interface Product {
    id: string;
    name: string;
    price: number;
    store_id: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
const STATUS_CONFIG: Record<string, { bg: string; text: string; label: string }> = {
    PENDING:   { bg: '#fef3c7', text: '#92400e', label: 'En cours' },
    ACCEPTED:  { bg: '#dbeafe', text: '#1e40af', label: 'Acceptée' },
    SHIPPING:  { bg: '#ede9fe', text: '#5b21b6', label: 'En livraison' },
    DELIVERED: { bg: '#d1fae5', text: '#065f46', label: 'Terminée' },
    REJECTED:  { bg: '#fee2e2', text: '#991b1b', label: 'Refusée' },
};

const FILTER_TABS = [
    { key: 'EN_COURS',  label: 'En cours' },
    { key: 'TERMINES',  label: 'Terminés' },
    { key: 'ALL',       label: 'Tous' },
];

const IN_PROGRESS_STATUSES = ['PENDING', 'ACCEPTED', 'SHIPPING'];
const DONE_STATUSES         = ['DELIVERED', 'REJECTED'];

// ── Composant principal ────────────────────────────────────────────────────────
export default function AchatsScreen() {
    const router = useRouter();

    const [orders, setOrders]           = useState<Order[]>([]);
    const [activeFilter, setActiveFilter] = useState('EN_COURS');
    const [loading, setLoading]         = useState(true);
    const [modalVisible, setModalVisible] = useState(false);

    // Formulaire commande
    const [sellerStores, setSellerStores] = useState<StoreItem[]>([]);
    const [buyerStores, setBuyerStores]   = useState<StoreItem[]>([]);
    const [products, setProducts]         = useState<Product[]>([]);
    const [selectedSeller, setSelectedSeller] = useState<string>('');
    const [selectedProduct, setSelectedProduct] = useState<string>('');
    const [selectedBuyer, setSelectedBuyer]     = useState<string>('');
    const [quantityStr, setQuantityStr]   = useState('');
    const [submitting, setSubmitting]     = useState(false);

    const fetchOrders = useCallback(async () => {
        setLoading(true);
        try {
            const { data } = await supabase
                .from('orders')
                .select('*, products(name, price), buyer:stores!buyer_store_id(name), seller:stores!seller_store_id(name)')
                .order('created_at', { ascending: false });
            setOrders((data as Order[]) || []);
        } catch (err) {
            console.error('[Achats] fetch error:', err);
        } finally {
            setLoading(false);
        }
    }, []);

    const fetchFormData = useCallback(async () => {
        try {
            const [sellersRes, buyersRes] = await Promise.all([
                supabase.from('stores').select('id, name').eq('owner_role', 'PRODUCER'),
                supabase.from('stores').select('id, name').eq('owner_role', 'MERCHANT'),
            ]);
            setSellerStores((sellersRes.data as StoreItem[]) || []);
            setBuyerStores((buyersRes.data as StoreItem[]) || []);
        } catch (err) {
            console.error('[Achats] form data error:', err);
        }
    }, []);

    useEffect(() => { fetchOrders(); }, [fetchOrders]);

    useFocusEffect(useCallback(() => { fetchOrders(); }, [fetchOrders]));

    useEffect(() => {
        if (!selectedSeller) { setProducts([]); return; }
        supabase
            .from('products')
            .select('id, name, price, store_id')
            .eq('store_id', selectedSeller)
            .then(({ data }) => setProducts((data as Product[]) || []));
    }, [selectedSeller]);

    const openModal = () => {
        fetchFormData();
        setSelectedSeller('');
        setSelectedProduct('');
        setSelectedBuyer('');
        setQuantityStr('');
        setModalVisible(true);
    };

    const handleSubmit = async () => {
        if (!selectedSeller || !selectedProduct || !selectedBuyer || !quantityStr) {
            Alert.alert('Champs requis', 'Veuillez remplir tous les champs.');
            return;
        }
        const qty = parseInt(quantityStr, 10);
        if (isNaN(qty) || qty <= 0) {
            Alert.alert('Quantité invalide', 'Entrez une quantité valide.');
            return;
        }
        const prod = products.find(p => p.id === selectedProduct);
        if (!prod) return;

        setSubmitting(true);
        try {
            await supabase.from('orders').insert({
                seller_store_id: selectedSeller,
                buyer_store_id:  selectedBuyer,
                product_id:      selectedProduct,
                product_name:    prod.name,
                quantity:        qty,
                unit_price:      prod.price,
                total_amount:    prod.price * qty,
                status:          'PENDING',
            });
            setModalVisible(false);
            fetchOrders();
        } catch (err) {
            console.error('[Achats] create order error:', err);
            Alert.alert('Erreur', 'Impossible de créer la commande.');
        } finally {
            setSubmitting(false);
        }
    };

    const filtered = orders.filter(o => {
        if (activeFilter === 'EN_COURS') return IN_PROGRESS_STATUSES.includes(o.status);
        if (activeFilter === 'TERMINES') return DONE_STATUSES.includes(o.status);
        return true;
    });

    return (
        <SafeAreaView style={styles.safe} edges={['top']}>
            {/* ── HEADER ── */}
            <View style={styles.header}>
                <View style={styles.headerTop}>
                    <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
                        <ChevronLeft color={colors.white} size={20} />
                    </TouchableOpacity>
                    <View style={{ flex: 1, marginLeft: 12 }}>
                        <Text style={styles.headerTitle}>ACHATS B2B</Text>
                        <Text style={styles.headerSub}>COMMANDES INTER-BOUTIQUES</Text>
                    </View>
                </View>

                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabsScroll}>
                    {FILTER_TABS.map(tab => (
                        <TouchableOpacity
                            key={tab.key}
                            style={[styles.tab, activeFilter === tab.key && styles.tabActive]}
                            onPress={() => setActiveFilter(tab.key)}
                        >
                            <Text style={[styles.tabText, activeFilter === tab.key && styles.tabTextActive]}>
                                {tab.label}
                            </Text>
                        </TouchableOpacity>
                    ))}
                </ScrollView>
            </View>

            {/* ── CONTENU ── */}
            <ScrollView
                style={styles.scroll}
                contentContainerStyle={styles.scrollContent}
                showsVerticalScrollIndicator={false}
            >
                {loading ? (
                    <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />
                ) : filtered.length === 0 ? (
                    <View style={styles.emptyCard}>
                        <ShoppingCart color={colors.slate300} size={36} />
                        <Text style={styles.emptyText}>AUCUNE COMMANDE</Text>
                    </View>
                ) : (
                    filtered.map(order => {
                        const sc = STATUS_CONFIG[order.status] ?? STATUS_CONFIG.PENDING;
                        return (
                            <View key={order.id} style={styles.card}>
                                <View style={styles.cardHeader}>
                                    <Text style={styles.cardProduct} numberOfLines={1}>
                                        {order.products?.name ?? 'Produit'}
                                    </Text>
                                    <View style={[styles.badge, { backgroundColor: sc.bg }]}>
                                        <Text style={[styles.badgeText, { color: sc.text }]}>{sc.label}</Text>
                                    </View>
                                </View>

                                <View style={styles.storeRow}>
                                    <View style={styles.storeBlock}>
                                        <Text style={styles.storeRoleLabel}>VENDEUR</Text>
                                        <View style={styles.storeNameRow}>
                                            <Store color={colors.slate400} size={12} />
                                            <Text style={styles.storeName} numberOfLines={1}>
                                                {order.seller?.name ?? '–'}
                                            </Text>
                                        </View>
                                    </View>
                                    <Text style={styles.arrow}>→</Text>
                                    <View style={[styles.storeBlock, { alignItems: 'flex-end' }]}>
                                        <Text style={styles.storeRoleLabel}>ACHETEUR</Text>
                                        <View style={styles.storeNameRow}>
                                            <Store color={colors.slate400} size={12} />
                                            <Text style={styles.storeName} numberOfLines={1}>
                                                {order.buyer?.name ?? '–'}
                                            </Text>
                                        </View>
                                    </View>
                                </View>

                                <View style={styles.cardFooter}>
                                    <Text style={styles.cardMeta}>
                                        Qté : {order.quantity}
                                    </Text>
                                    {order.total_amount != null && (
                                        <Text style={styles.cardPrice}>
                                            {order.total_amount.toLocaleString('fr-FR')} F
                                        </Text>
                                    )}
                                    <Text style={styles.cardDate}>
                                        {new Date(order.created_at).toLocaleDateString('fr-FR')}
                                    </Text>
                                </View>
                            </View>
                        );
                    })
                )}
            </ScrollView>

            {/* ── FAB ── */}
            <TouchableOpacity style={styles.fab} onPress={openModal}>
                <Plus color={colors.white} size={24} />
            </TouchableOpacity>

            {/* ── MODAL NOUVELLE COMMANDE ── */}
            <Modal
                visible={modalVisible}
                animationType="slide"
                transparent
                onRequestClose={() => setModalVisible(false)}
            >
                <View style={styles.modalOverlay}>
                    <View style={styles.modalSheet}>
                        <View style={styles.modalHeader}>
                            <Text style={styles.modalTitle}>NOUVELLE COMMANDE B2B</Text>
                            <TouchableOpacity onPress={() => setModalVisible(false)}>
                                <X color={colors.slate600} size={22} />
                            </TouchableOpacity>
                        </View>

                        <ScrollView showsVerticalScrollIndicator={false}>
                            {/* Vendeur */}
                            <Text style={styles.fieldLabel}>BOUTIQUE VENDEUR (PRODUCTEUR)</Text>
                            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipScroll}>
                                {sellerStores.map(s => (
                                    <TouchableOpacity
                                        key={s.id}
                                        style={[styles.chip, selectedSeller === s.id && styles.chipActive]}
                                        onPress={() => { setSelectedSeller(s.id); setSelectedProduct(''); }}
                                    >
                                        <Text style={[styles.chipText, selectedSeller === s.id && styles.chipTextActive]}>
                                            {s.name}
                                        </Text>
                                    </TouchableOpacity>
                                ))}
                            </ScrollView>

                            {/* Produit */}
                            {products.length > 0 && (
                                <>
                                    <Text style={styles.fieldLabel}>PRODUIT</Text>
                                    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipScroll}>
                                        {products.map(p => (
                                            <TouchableOpacity
                                                key={p.id}
                                                style={[styles.chip, selectedProduct === p.id && styles.chipActive]}
                                                onPress={() => setSelectedProduct(p.id)}
                                            >
                                                <Text style={[styles.chipText, selectedProduct === p.id && styles.chipTextActive]}>
                                                    {p.name} — {p.price.toLocaleString('fr-FR')} F
                                                </Text>
                                            </TouchableOpacity>
                                        ))}
                                    </ScrollView>
                                </>
                            )}

                            {/* Acheteur */}
                            <Text style={styles.fieldLabel}>BOUTIQUE ACHETEUR (MARCHAND)</Text>
                            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipScroll}>
                                {buyerStores.map(s => (
                                    <TouchableOpacity
                                        key={s.id}
                                        style={[styles.chip, selectedBuyer === s.id && styles.chipActive]}
                                        onPress={() => setSelectedBuyer(s.id)}
                                    >
                                        <Text style={[styles.chipText, selectedBuyer === s.id && styles.chipTextActive]}>
                                            {s.name}
                                        </Text>
                                    </TouchableOpacity>
                                ))}
                            </ScrollView>

                            {/* Quantité */}
                            <Text style={styles.fieldLabel}>QUANTITÉ</Text>
                            <TextInput
                                style={styles.textInput}
                                value={quantityStr}
                                onChangeText={setQuantityStr}
                                keyboardType="numeric"
                                placeholder="Ex : 10"
                                placeholderTextColor={colors.slate300}
                            />

                            <TouchableOpacity
                                style={[styles.submitBtn, submitting && { opacity: 0.6 }]}
                                onPress={handleSubmit}
                                disabled={submitting}
                            >
                                {submitting
                                    ? <ActivityIndicator color={colors.white} size="small" />
                                    : <Text style={styles.submitBtnText}>CRÉER LA COMMANDE</Text>
                                }
                            </TouchableOpacity>
                        </ScrollView>
                    </View>
                </View>
            </Modal>
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

    tabsScroll: { flexGrow: 0 },
    tab: {
        paddingHorizontal: 14, paddingVertical: 7,
        borderRadius: 8,
        backgroundColor: 'rgba(255,255,255,0.15)',
        marginRight: 8,
    },
    tabActive:     { backgroundColor: colors.white },
    tabText:       { fontSize: 12, fontWeight: '700', color: 'rgba(255,255,255,0.8)' },
    tabTextActive: { color: colors.primary },

    scroll:        { flex: 1 },
    scrollContent: { paddingTop: 20, paddingHorizontal: 16, paddingBottom: 100, gap: 12 },

    card: {
        backgroundColor: colors.white,
        borderRadius: 10, padding: 14,
        borderWidth: 1, borderColor: colors.slate100,
        gap: 10,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.05,
        shadowRadius: 4,
        elevation: 2,
    },
    cardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    cardProduct: { fontSize: 14, fontWeight: '800', color: colors.slate800, flex: 1, marginRight: 8 },
    badge:      { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
    badgeText:  { fontSize: 9, fontWeight: '700' },

    storeRow:      { flexDirection: 'row', alignItems: 'center', gap: 8 },
    storeBlock:    { flex: 1 },
    storeRoleLabel:{ fontSize: 8, fontWeight: '900', color: colors.slate400, letterSpacing: 1, marginBottom: 2 },
    storeNameRow:  { flexDirection: 'row', alignItems: 'center', gap: 4 },
    storeName:     { fontSize: 12, fontWeight: '700', color: colors.slate700, flex: 1 },
    arrow:         { fontSize: 18, color: colors.slate300, flexShrink: 0 },

    cardFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    cardMeta:   { fontSize: 11, color: colors.slate500 },
    cardPrice:  { fontSize: 13, fontWeight: '900', color: colors.slate800 },
    cardDate:   { fontSize: 10, color: colors.slate400 },

    emptyCard: {
        backgroundColor: colors.white, borderRadius: 10, padding: 40,
        alignItems: 'center', borderWidth: 2, borderColor: colors.slate100,
        borderStyle: 'dashed', gap: 12,
    },
    emptyText: { fontSize: 10, fontWeight: '900', color: colors.slate300, letterSpacing: 2 },

    fab: {
        position: 'absolute', right: 20, bottom: 30,
        width: 52, height: 52, borderRadius: 10,
        backgroundColor: colors.primary,
        alignItems: 'center', justifyContent: 'center',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.2,
        shadowRadius: 8,
        elevation: 6,
    },

    modalOverlay: {
        flex: 1, backgroundColor: 'rgba(0,0,0,0.5)',
        justifyContent: 'flex-end',
    },
    modalSheet: {
        backgroundColor: colors.white,
        borderTopLeftRadius: 24, borderTopRightRadius: 24,
        padding: 20, maxHeight: '85%',
    },
    modalHeader: {
        flexDirection: 'row', alignItems: 'center',
        justifyContent: 'space-between', marginBottom: 20,
    },
    modalTitle: { fontSize: 14, fontWeight: '900', color: colors.slate800, letterSpacing: 1 },

    fieldLabel: { fontSize: 9, fontWeight: '900', color: colors.slate400, letterSpacing: 2, marginBottom: 8, marginTop: 16 },

    chipScroll: { flexGrow: 0, marginBottom: 4 },
    chip: {
        paddingHorizontal: 14, paddingVertical: 8,
        borderRadius: 8, borderWidth: 1,
        borderColor: colors.slate200,
        backgroundColor: colors.slate50,
        marginRight: 8,
    },
    chipActive:     { backgroundColor: colors.primary, borderColor: colors.primary },
    chipText:       { fontSize: 12, fontWeight: '600', color: colors.slate600 },
    chipTextActive: { color: colors.white },

    textInput: {
        borderWidth: 1, borderColor: colors.slate200,
        borderRadius: 8, paddingHorizontal: 14, paddingVertical: 10,
        fontSize: 14, color: colors.slate800,
    },

    submitBtn: {
        backgroundColor: colors.primary, borderRadius: 8,
        paddingVertical: 14, alignItems: 'center',
        marginTop: 24, marginBottom: 8,
    },
    submitBtnText: { fontSize: 13, fontWeight: '900', color: colors.white, letterSpacing: 1 },
});
