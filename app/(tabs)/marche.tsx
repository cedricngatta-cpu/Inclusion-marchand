// Marché Virtuel — flux commande en 2 étapes : fiche produit → confirmation
import React, { useState, useEffect, useCallback } from 'react';
import {
    View, Text, ScrollView, FlatList, StyleSheet, TouchableOpacity,
    TextInput, ActivityIndicator, Image, Alert, Modal,
    Linking, Pressable, Platform, useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';
import {
    Package, Search, Store, Truck, MapPin, Clock,
    ShoppingCart, Phone, User, Tag, Calendar, X, Plus, Minus, CheckCircle, ChevronLeft,
} from 'lucide-react-native';
import { ScreenHeader } from '@/src/components/ui';
import { supabase } from '@/src/lib/supabase';
import { colors } from '@/src/lib/colors';
import { onSocketEvent, emitEvent } from '@/src/lib/socket';
import { useProfileContext } from '@/src/context/ProfileContext';

// ── Types ──────────────────────────────────────────────────────────────────────
interface CatalogueItem {
    id: string;
    name: string;
    description?: string;
    price: number;
    delivery_price?: number;
    zone_livraison?: string;
    delai_livraison?: string;
    livreur_nom?: string;
    livreur_telephone?: string;
    category: string;
    unite?: string;
    store_id: string;
    storeName: string;
    storePhone?: string;
    storeAddress?: string;
    storeOwnerId?: string;
    stockQty: number;
    imageUrl?: string;
    created_at?: string;
}

// ── Utilitaires ────────────────────────────────────────────────────────────────
function formatDate(dateStr?: string): string {
    if (!dateStr) return '';
    const date  = new Date(dateStr);
    const now   = new Date();
    const diffMs   = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    if (diffDays === 0)  return "Publié aujourd'hui";
    if (diffDays === 1)  return 'Publié hier';
    if (diffDays < 7)    return `Publié il y a ${diffDays} jours`;
    return `Publié le ${date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}`;
}

function callPhone(phone?: string) {
    if (!phone) return;
    Linking.openURL(`tel:${phone}`);
}

// ── Carte produit (mémoïsée) ───────────────────────────────────────────────────
interface ProductCardProps {
    item: CatalogueItem;
    onPress: (item: CatalogueItem) => void;
    isDesktop?: boolean;
}

const ProductCard = React.memo(({ item, onPress, isDesktop }: ProductCardProps) => {
    if (isDesktop) {
        return (
            <TouchableOpacity style={dtCard.card} onPress={() => onPress(item)} activeOpacity={0.85}>
                {/* Image ou placeholder */}
                {item.imageUrl ? (
                    <Image source={{ uri: item.imageUrl }} style={dtCard.img} resizeMode="cover" />
                ) : (
                    <View style={dtCard.placeholder}>
                        <Package color="#4f46e5" size={32} />
                    </View>
                )}
                {/* Corps de la carte */}
                <View style={dtCard.body}>
                    <Text style={dtCard.name} numberOfLines={2}>{item.name}</Text>
                    {/* Store + badge dispo */}
                    <View style={dtCard.metaRow}>
                        <Text style={dtCard.store} numberOfLines={1}>{item.storeName}</Text>
                        {item.stockQty > 0 ? (
                            <View style={styles.badgeAvail}>
                                <Text style={styles.badgeAvailText}>{item.stockQty} dispo</Text>
                            </View>
                        ) : (
                            <View style={styles.badgeOut}>
                                <Text style={styles.badgeOutText}>Rupture</Text>
                            </View>
                        )}
                    </View>
                    {/* Localisation + délai */}
                    {(item.zone_livraison || item.delai_livraison) ? (
                        <View style={dtCard.chipRow}>
                            {item.zone_livraison ? (
                                <View style={styles.deliveryInfoChip}>
                                    <MapPin color="#6366f1" size={9} />
                                    <Text style={styles.deliveryInfoText}>{item.zone_livraison}</Text>
                                </View>
                            ) : null}
                            {item.delai_livraison ? (
                                <View style={styles.deliveryInfoChip}>
                                    <Clock color="#0891b2" size={9} />
                                    <Text style={styles.deliveryInfoText}>{item.delai_livraison}</Text>
                                </View>
                            ) : null}
                        </View>
                    ) : null}
                    {/* Prix */}
                    <Text style={dtCard.price}>{item.price.toLocaleString('fr-FR')} F</Text>
                    {/* Livraison */}
                    {(item.delivery_price ?? 0) > 0 ? (
                        <View style={styles.deliveryRow}>
                            <Truck color="#3b82f6" size={10} />
                            <Text style={styles.deliveryPrice}>+{item.delivery_price!.toLocaleString('fr-FR')} F livraison</Text>
                        </View>
                    ) : (
                        <Text style={styles.perUnit}>Livraison gratuite</Text>
                    )}
                    {/* Bouton */}
                    {item.stockQty > 0 && (
                        <TouchableOpacity style={dtCard.btn} activeOpacity={0.82} onPress={() => onPress(item)}>
                            <ShoppingCart color="#fff" size={13} />
                            <Text style={dtCard.btnText}>Commander</Text>
                        </TouchableOpacity>
                    )}
                </View>
            </TouchableOpacity>
        );
    }

    // ── Layout mobile (inchangé) ──
    return (
    <TouchableOpacity
        style={styles.itemCard}
        onPress={() => onPress(item)}
        activeOpacity={0.85}
    >
        {item.imageUrl ? (
            <Image source={{ uri: item.imageUrl }} style={styles.itemIconImg} />
        ) : (
            <View style={styles.itemIcon}>
                <Package color="#4f46e5" size={20} />
            </View>
        )}

        <View style={styles.itemInfo}>
            <Text style={styles.itemName} numberOfLines={1}>{item.name}</Text>
            <View style={styles.itemMeta}>
                <Text style={styles.itemStore} numberOfLines={1}>{item.storeName}</Text>
                {item.stockQty > 0 ? (
                    <View style={styles.badgeAvail}>
                        <Text style={styles.badgeAvailText}>{item.stockQty} dispo</Text>
                    </View>
                ) : (
                    <View style={styles.badgeOut}>
                        <Text style={styles.badgeOutText}>Rupture</Text>
                    </View>
                )}
            </View>
            <View style={styles.deliveryInfoRow}>
                {item.zone_livraison ? (
                    <View style={styles.deliveryInfoChip}>
                        <MapPin color="#6366f1" size={9} />
                        <Text style={styles.deliveryInfoText}>{item.zone_livraison}</Text>
                    </View>
                ) : null}
                {item.delai_livraison ? (
                    <View style={styles.deliveryInfoChip}>
                        <Clock color="#0891b2" size={9} />
                        <Text style={styles.deliveryInfoText}>{item.delai_livraison}</Text>
                    </View>
                ) : null}
            </View>
        </View>

        <View style={styles.itemPriceBlock}>
            <Text style={styles.itemPrice}>{item.price.toLocaleString('fr-FR')} F</Text>
            {(item.delivery_price ?? 0) > 0 ? (
                <View style={styles.deliveryRow}>
                    <Truck color="#3b82f6" size={9} />
                    <Text style={styles.deliveryPrice}>+{item.delivery_price!.toLocaleString('fr-FR')} F</Text>
                </View>
            ) : (
                <Text style={styles.perUnit}>Livr. gratuite</Text>
            )}
            {item.stockQty > 0 && (
                <TouchableOpacity
                    style={styles.commanderBtn}
                    activeOpacity={0.82}
                    onPress={() => onPress(item)}
                >
                    <ShoppingCart color="#fff" size={11} />
                    <Text style={styles.commanderBtnText}>Commander</Text>
                </TouchableOpacity>
            )}
        </View>
    </TouchableOpacity>
    );
});

const PAGE_SIZE = 20;

// ── Types Supabase internes ────────────────────────────────────────────────────
interface StoreRow { id: string; name: string; owner_id?: string; profiles?: { phone_number?: string; address?: string } | null; }
interface ProdRow  { id: string; name: string; price: number; delivery_price?: number; category: string; store_id: string; image_url?: string; zone_livraison?: string; delai_livraison?: string; livreur_nom?: string; livreur_telephone?: string; description?: string; unite?: string; created_at?: string; }
interface StockRow { product_id: string; quantity: number; }

// ── Composant principal ────────────────────────────────────────────────────────
export default function MarcheScreen() {
    const { activeProfile } = useProfileContext();
    const { width } = useWindowDimensions();
    const isDesktop = Platform.OS === 'web' && width > 768;

    const [items,       setItems]       = useState<CatalogueItem[]>([]);
    const [loading,     setLoading]     = useState(true);
    const [loadingMore, setLoadingMore] = useState(false);
    const [hasMore,     setHasMore]     = useState(true);
    const [page,        setPage]        = useState(0);
    const [search,      setSearch]      = useState('');

    // Modal fiche produit
    const [selectedItem, setSelectedItem] = useState<CatalogueItem | null>(null);
    const [showDetail,   setShowDetail]   = useState(false);

    // Modal confirmation commande
    const [showConfirm,  setShowConfirm]  = useState(false);
    const [orderQty,     setOrderQty]     = useState(1);
    const [ordering,     setOrdering]     = useState(false);
    const [paymentMode,  setPaymentMode]  = useState<'CASH' | 'MOBILE_MONEY' | 'CREDIT'>('CASH');
    const [momoOperator, setMomoOperator] = useState<'ORANGE' | 'MTN' | 'WAVE' | 'MOOV' | null>(null);

    // ── Fetch catalogue (paginé) ─────────────────────────────────────────────
    const fetchCatalogue = useCallback(async (pageNum = 0, append = false) => {
        if (pageNum === 0) setLoading(true);
        else setLoadingMore(true);
        try {
            // 1. Boutiques producteurs + infos propriétaire
            const { data: storeData, error: storeErr } = await supabase
                .from('stores')
                .select('id, name, owner_id, profiles!owner_id(phone_number, address)')
                .eq('store_type', 'PRODUCER');

            if (storeErr || !storeData?.length) {
                if (!append) setItems([]);
                setHasMore(false);
                return;
            }

            const storeMap: Record<string, { name: string; phone?: string; address?: string; ownerId?: string }> = {};
            (storeData as StoreRow[]).forEach((s) => {
                storeMap[s.id] = {
                    name:    s.name,
                    phone:   s.profiles?.phone_number ?? undefined,
                    address: s.profiles?.address ?? undefined,
                    ownerId: s.owner_id ?? undefined,
                };
            });
            const storeIds = (storeData as StoreRow[]).map((s) => s.id);

            // 2. Produits (paginés)
            const from = pageNum * PAGE_SIZE;
            const to   = from + PAGE_SIZE - 1;
            const { data: prodData, error: prodErr } = await supabase
                .from('products')
                .select('id, name, price, delivery_price, category, store_id, image_url, zone_livraison, delai_livraison, livreur_nom, livreur_telephone, description, unite, created_at')
                .in('store_id', storeIds)
                .order('created_at', { ascending: false })
                .range(from, to);

            if (prodErr || !prodData?.length) {
                setHasMore(false);
                return;
            }

            setHasMore((prodData as ProdRow[]).length === PAGE_SIZE);

            // 3. Stock pour cette page seulement
            const productIds = (prodData as ProdRow[]).map((p) => p.id);
            const { data: stockData } = await supabase
                .from('stock')
                .select('product_id, quantity')
                .in('product_id', productIds);

            const stockMap: Record<string, number> = {};
            (stockData as StockRow[] ?? []).forEach((s) => { stockMap[s.product_id] = s.quantity; });

            const newItems: CatalogueItem[] = (prodData as ProdRow[]).map((p) => ({
                id:                 p.id,
                name:               p.name,
                description:        p.description ?? undefined,
                price:              p.price,
                delivery_price:     p.delivery_price ?? undefined,
                zone_livraison:     p.zone_livraison ?? undefined,
                delai_livraison:    p.delai_livraison ?? undefined,
                livreur_nom:        p.livreur_nom ?? undefined,
                livreur_telephone:  p.livreur_telephone ?? undefined,
                category:           p.category,
                unite:              p.unite ?? undefined,
                store_id:           p.store_id,
                storeName:          storeMap[p.store_id]?.name ?? 'Producteur',
                storePhone:         storeMap[p.store_id]?.phone,
                storeAddress:       storeMap[p.store_id]?.address,
                storeOwnerId:       storeMap[p.store_id]?.ownerId,
                stockQty:           stockMap[p.id] ?? 0,
                imageUrl:           p.image_url ?? undefined,
                created_at:         p.created_at,
            }));

            if (append) setItems(prev => [...prev, ...newItems]);
            else setItems(newItems);
        } catch (err) {
            console.error('[Marché] fetch error:', err);
        } finally {
            setLoading(false);
            setLoadingMore(false);
        }
    }, []);

    const fetchMore = useCallback(() => {
        if (loadingMore || !hasMore) return;
        const nextPage = page + 1;
        setPage(nextPage);
        fetchCatalogue(nextPage, true);
    }, [page, loadingMore, hasMore, fetchCatalogue]);

    const resetAndFetch = useCallback(() => {
        setPage(0);
        setHasMore(true);
        fetchCatalogue(0, false);
    }, [fetchCatalogue]);

    useEffect(() => { fetchCatalogue(0, false); }, [fetchCatalogue]);

    useEffect(() => {
        const unsub = onSocketEvent('nouveau-produit-marche', () => { resetAndFetch(); });
        return unsub;
    }, [resetAndFetch]);

    useFocusEffect(useCallback(() => { resetAndFetch(); }, [resetAndFetch]));

    // ── Ouvrir la fiche produit ────────────────────────────────────────────────
    function openDetail(item: CatalogueItem) {
        setSelectedItem(item);
        setOrderQty(1);
        setShowDetail(true);
    }

    // ── Passer à la confirmation ───────────────────────────────────────────────
    function goToConfirm() {
        setShowDetail(false);
        setPaymentMode(null);
        setShowConfirm(true);
    }

    // ── Confirmer la commande ─────────────────────────────────────────────────
    async function confirmOrder() {
        if (!selectedItem || !activeProfile) {
            Alert.alert('Erreur', 'Profil non chargé. Reconnecte-toi.');
            return;
        }

        if (!paymentMode) {
            Alert.alert('Mode de paiement', 'Veuillez choisir un mode de paiement.');
            return;
        }

        setOrdering(true);
        try {
            const total = selectedItem.price * orderQty + (selectedItem.delivery_price ?? 0);
            const payload = {
                product_id:      selectedItem.id,
                product_name:    selectedItem.name,
                seller_store_id: selectedItem.store_id,
                buyer_store_id:  activeProfile.id,
                quantity:        orderQty,
                unit_price:      selectedItem.price,
                total_amount:    total,
                status:          'PENDING',
                payment_mode:    paymentMode,
                operator:        paymentMode === 'MOBILE_MONEY' ? momoOperator : null,
                notes:           selectedItem.name,
                buyer_name:      activeProfile.name,
            };

            console.log('=== ORDER INSERT ===', JSON.stringify({
                buyer_store_id:  activeProfile.id,
                seller_store_id: selectedItem.store_id,
                product_id:      selectedItem.id,
                product_name:    selectedItem.name,
                quantity:        orderQty,
                unit_price:      selectedItem.price,
                total_amount:    total,
                status:          'PENDING',
                payment_mode:    paymentMode,
                operator:        paymentMode === 'MOBILE_MONEY' ? momoOperator : null,
                notes:           selectedItem.name,
                buyer_name:      activeProfile.name,
            }, null, 2));

            const { data: orderData, error: orderErr } = await supabase
                .from('orders')
                .insert([payload])
                .select()
                .single();

            console.log('=== ORDER RESULT ===', 'error:', JSON.stringify(orderErr));

            if (orderErr) {
                Alert.alert('Erreur commande', orderErr.message);
                return;
            }

            // Log activité
            try {
                await supabase.from('activity_logs').insert([{
                    user_id:   activeProfile.id,
                    user_name: activeProfile.name,
                    action:    `Commande passée : ${selectedItem.name} × ${orderQty} — ${total.toLocaleString('fr-FR')} F`,
                    type:      'commande',
                }]);
            } catch {}

            emitEvent('nouvelle-commande', {
                sellerStoreId: selectedItem.store_id,
                sellerUserId:  selectedItem.storeOwnerId ?? null,
                orderId:       orderData?.id,
                productName:   selectedItem.name,
                buyerName:     activeProfile.name,
            });

            setShowConfirm(false);
            setSelectedItem(null);
            Alert.alert('Commande envoyée !', `${selectedItem.name} × ${orderQty} — Total : ${total.toLocaleString('fr-FR')} F`);
        } catch (err: unknown) {
            Alert.alert('Erreur', (err as Error)?.message ?? 'Une erreur est survenue');
        } finally {
            setOrdering(false);
        }
    }

    const filtered = items.filter(i =>
        i.name.toLowerCase().includes(search.toLowerCase()) ||
        i.storeName.toLowerCase().includes(search.toLowerCase())
    );

    // ── Calcul total pour le récap ────────────────────────────────────────────
    const totalCommande = selectedItem
        ? selectedItem.price * orderQty + (selectedItem.delivery_price ?? 0)
        : 0;

    // ─────────────────────────────────────────────────────────────────────────
    return (
        <View style={styles.safe}>
            <ScreenHeader
                title="Marché Virtuel"
                subtitle="Produits des producteurs"
                showBack={true}
                paddingBottom={12}
            >
                <View style={styles.searchBox}>
                    <Search color={colors.slate400} size={16} style={{ marginLeft: 14 }} />
                    <TextInput
                        style={styles.searchInput}
                        placeholder="Maïs, Tomate, Riz..."
                        placeholderTextColor={colors.slate400}
                        value={search}
                        onChangeText={setSearch}
                        autoCapitalize="words"
                    />
                </View>
            </ScreenHeader>

            {/* ── LISTE PRODUITS ── */}
            {loading ? (
                <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
                    {[0, 1, 2, 3].map(i => <View key={i} style={styles.skeleton} />)}
                </ScrollView>
            ) : (
            <FlatList
                key={isDesktop ? 'grid3' : 'list1'}
                data={filtered}
                keyExtractor={(item) => item.id}
                style={styles.scroll}
                contentContainerStyle={[styles.scrollContent, isDesktop && { paddingHorizontal: 24 }]}
                numColumns={isDesktop ? 3 : 1}
                columnWrapperStyle={isDesktop ? { gap: 12 } : undefined}
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
                onEndReached={fetchMore}
                onEndReachedThreshold={0.3}
                ListEmptyComponent={
                    <View style={styles.emptyCard}>
                        <Store color={colors.slate400} size={56} />
                        <Text style={styles.emptyText}>
                            {search ? 'AUCUN RÉSULTAT' : 'AUCUN PRODUCTEUR DISPONIBLE'}
                        </Text>
                    </View>
                }
                ListFooterComponent={loadingMore ? (
                    <ActivityIndicator color={colors.primary} style={{ marginVertical: 16 }} />
                ) : null}
                renderItem={({ item }) => <ProductCard item={item} onPress={openDetail} isDesktop={isDesktop} />}
            />
            )}

            {/* ═══════════════════════════════════════════════════════════════
                MODAL 1 — FICHE PRODUIT COMPLÈTE
            ═══════════════════════════════════════════════════════════════ */}
            <Modal
                visible={showDetail}
                animationType="slide"
                presentationStyle="pageSheet"
                onRequestClose={() => setShowDetail(false)}
            >
                <SafeAreaView style={styles.modalSafe} edges={['top', 'bottom']}>
                    {/* Header modal */}
                    <View style={styles.modalHeader}>
                        <TouchableOpacity style={styles.modalBackBtn} onPress={() => setShowDetail(false)}>
                            <ChevronLeft color={colors.primary} size={22} />
                        </TouchableOpacity>
                        <Text style={styles.modalTitle} numberOfLines={1}>
                            {selectedItem?.name ?? ''}
                        </Text>
                        <View style={{ width: 40 }} />
                    </View>

                    <ScrollView
                        style={{ flex: 1 }}
                        contentContainerStyle={styles.modalScroll}
                        showsVerticalScrollIndicator={false}
                    >
                        {selectedItem && (
                            <>
                                {/* ── Photo grande ── */}
                                {selectedItem.imageUrl ? (
                                    <Image
                                        source={{ uri: selectedItem.imageUrl }}
                                        style={styles.detailPhoto}
                                        resizeMode="cover"
                                    />
                                ) : (
                                    <View style={styles.detailPhotoPlaceholder}>
                                        <Package color="#4f46e5" size={64} />
                                    </View>
                                )}

                                {/* ── Section PRODUIT ── */}
                                <View style={styles.detailSection}>
                                    <Text style={styles.detailSectionTitle}>PRODUIT</Text>

                                    <View style={styles.detailRow}>
                                        <Text style={styles.detailLabel}>Nom</Text>
                                        <Text style={styles.detailValue}>{selectedItem.name}</Text>
                                    </View>

                                    {selectedItem.description ? (
                                        <View style={[styles.detailRow, { alignItems: 'flex-start' }]}>
                                            <Text style={styles.detailLabel}>Description</Text>
                                            <Text style={[styles.detailValue, { flex: 1, textAlign: 'right' }]}>
                                                {selectedItem.description}
                                            </Text>
                                        </View>
                                    ) : null}

                                    <View style={styles.detailRow}>
                                        <Tag color={colors.slate400} size={14} />
                                        <Text style={styles.detailLabel}>Prix unitaire</Text>
                                        <Text style={[styles.detailValue, styles.detailValueGreen]}>
                                            {selectedItem.price.toLocaleString('fr-FR')} F CFA
                                        </Text>
                                    </View>

                                    <View style={styles.detailRow}>
                                        <Package color={colors.slate400} size={14} />
                                        <Text style={styles.detailLabel}>Disponible</Text>
                                        <Text style={styles.detailValue}>
                                            {selectedItem.stockQty} {selectedItem.unite ?? 'unité(s)'}
                                        </Text>
                                    </View>

                                    {selectedItem.unite ? (
                                        <View style={styles.detailRow}>
                                            <Text style={styles.detailLabel}>Unité</Text>
                                            <Text style={styles.detailValue}>{selectedItem.unite}</Text>
                                        </View>
                                    ) : null}

                                    <View style={styles.detailRow}>
                                        <Text style={styles.detailLabel}>Catégorie</Text>
                                        <Text style={styles.detailValue}>{selectedItem.category ?? '—'}</Text>
                                    </View>

                                    {selectedItem.created_at ? (
                                        <View style={styles.detailRow}>
                                            <Calendar color={colors.slate400} size={14} />
                                            <Text style={styles.detailLabel}>Publication</Text>
                                            <Text style={styles.detailValue}>{formatDate(selectedItem.created_at)}</Text>
                                        </View>
                                    ) : null}
                                </View>

                                {/* ── Section LIVRAISON ── */}
                                <View style={styles.detailSection}>
                                    <Text style={styles.detailSectionTitle}>LIVRAISON</Text>

                                    <View style={styles.detailRow}>
                                        <Truck color={colors.slate400} size={14} />
                                        <Text style={styles.detailLabel}>Frais de livraison</Text>
                                        <Text style={[styles.detailValue, (selectedItem.delivery_price ?? 0) === 0 && styles.detailValueGreen]}>
                                            {(selectedItem.delivery_price ?? 0) === 0
                                                ? 'Gratuite'
                                                : `${selectedItem.delivery_price!.toLocaleString('fr-FR')} F CFA`}
                                        </Text>
                                    </View>

                                    {selectedItem.zone_livraison ? (
                                        <View style={styles.detailRow}>
                                            <MapPin color={colors.slate400} size={14} />
                                            <Text style={styles.detailLabel}>Zone</Text>
                                            <Text style={styles.detailValue}>{selectedItem.zone_livraison}</Text>
                                        </View>
                                    ) : null}

                                    {selectedItem.delai_livraison ? (
                                        <View style={styles.detailRow}>
                                            <Clock color={colors.slate400} size={14} />
                                            <Text style={styles.detailLabel}>Délai estimé</Text>
                                            <Text style={styles.detailValue}>{selectedItem.delai_livraison}</Text>
                                        </View>
                                    ) : null}

                                    <View style={styles.detailRow}>
                                        <User color={colors.slate400} size={14} />
                                        <Text style={styles.detailLabel}>Livreur</Text>
                                        {selectedItem.livreur_nom ? (
                                            <Text style={styles.detailValue}>{selectedItem.livreur_nom}</Text>
                                        ) : (
                                            <Text style={styles.detailValueMuted}>Non renseigné</Text>
                                        )}
                                    </View>

                                    <View style={styles.detailRow}>
                                        <Phone color={selectedItem.livreur_telephone ? colors.primary : colors.slate400} size={14} />
                                        <Text style={styles.detailLabel}>Tél. livreur</Text>
                                        {selectedItem.livreur_telephone ? (
                                            <TouchableOpacity onPress={() => callPhone(selectedItem.livreur_telephone)} activeOpacity={0.7}>
                                                <Text style={styles.detailValuePhone}>{selectedItem.livreur_telephone}</Text>
                                            </TouchableOpacity>
                                        ) : (
                                            <Text style={styles.detailValueMuted}>Non renseigné</Text>
                                        )}
                                    </View>
                                </View>

                                {/* ── Section PRODUCTEUR ── */}
                                <View style={styles.detailSection}>
                                    <Text style={styles.detailSectionTitle}>PRODUCTEUR</Text>

                                    <View style={styles.detailRow}>
                                        <Store color={colors.slate400} size={14} />
                                        <Text style={styles.detailLabel}>Nom</Text>
                                        <Text style={styles.detailValue}>{selectedItem.storeName}</Text>
                                    </View>

                                    {selectedItem.storePhone ? (
                                        <TouchableOpacity
                                            style={styles.detailRow}
                                            onPress={() => callPhone(selectedItem.storePhone)}
                                            activeOpacity={0.7}
                                        >
                                            <Phone color={colors.primary} size={14} />
                                            <Text style={styles.detailLabel}>Téléphone</Text>
                                            <Text style={[styles.detailValue, styles.detailValuePhone]}>
                                                {selectedItem.storePhone}
                                            </Text>
                                        </TouchableOpacity>
                                    ) : null}

                                    {selectedItem.storeAddress ? (
                                        <View style={styles.detailRow}>
                                            <MapPin color={colors.slate400} size={14} />
                                            <Text style={styles.detailLabel}>Adresse</Text>
                                            <Text style={[styles.detailValue, { flex: 1, textAlign: 'right' }]}>
                                                {selectedItem.storeAddress}
                                            </Text>
                                        </View>
                                    ) : null}
                                </View>
                            </>
                        )}
                    </ScrollView>

                    {/* Bouton PASSER COMMANDE */}
                    {selectedItem && selectedItem.stockQty > 0 && (
                        <View style={styles.modalFooter}>
                            <TouchableOpacity style={styles.passerBtn} onPress={goToConfirm} activeOpacity={0.85}>
                                <ShoppingCart color="#fff" size={20} />
                                <Text style={styles.passerBtnText}>PASSER COMMANDE</Text>
                            </TouchableOpacity>
                        </View>
                    )}
                </SafeAreaView>
            </Modal>

            {/* ═══════════════════════════════════════════════════════════════
                MODAL 2 — CONFIRMATION COMMANDE
            ═══════════════════════════════════════════════════════════════ */}
            <Modal
                visible={showConfirm}
                animationType="fade"
                transparent
                onRequestClose={() => { setShowConfirm(false); setShowDetail(true); }}
            >
                <Pressable
                    style={styles.confirmOverlay}
                    onPress={() => { setShowConfirm(false); setShowDetail(true); }}
                >
                    <Pressable style={styles.confirmBox} onPress={() => {}}>

                        {/* Titre */}
                        <View style={styles.confirmHeader}>
                            <Text style={styles.confirmTitle}>CONFIRMATION</Text>
                            <TouchableOpacity
                                onPress={() => { setShowConfirm(false); setShowDetail(true); }}
                                style={styles.confirmCloseBtn}
                            >
                                <X color={colors.slate500} size={18} />
                            </TouchableOpacity>
                        </View>

                        {selectedItem && (
                            <>
                                {/* Sélecteur quantité */}
                                <View style={styles.qtySection}>
                                    <Text style={styles.qtyLabel}>QUANTITÉ</Text>
                                    <View style={styles.qtyRow}>
                                        <TouchableOpacity
                                            style={styles.qtyBtn}
                                            onPress={() => setOrderQty(q => Math.max(1, q - 1))}
                                            activeOpacity={0.7}
                                        >
                                            <Minus color={colors.primary} size={18} />
                                        </TouchableOpacity>
                                        <Text style={styles.qtyValue}>{orderQty}</Text>
                                        <TouchableOpacity
                                            style={styles.qtyBtn}
                                            onPress={() => setOrderQty(q => Math.min(selectedItem.stockQty, q + 1))}
                                            activeOpacity={0.7}
                                        >
                                            <Plus color={colors.primary} size={18} />
                                        </TouchableOpacity>
                                    </View>
                                    <Text style={styles.qtyMax}>
                                        Max disponible : {selectedItem.stockQty} {selectedItem.unite ?? 'unité(s)'}
                                    </Text>
                                </View>

                                {/* Mode de paiement */}
                                <View style={styles.paySection}>
                                    <Text style={styles.payLabel}>MODE DE PAIEMENT</Text>
                                    <View style={styles.payRow}>
                                        {([
                                            { key: 'CASH',         label: 'Espèces',      emoji: '💵' },
                                            { key: 'MOBILE_MONEY', label: 'Mobile Money', emoji: '📱' },
                                            { key: 'CREDIT',       label: 'À crédit',     emoji: '🤝' },
                                        ] as const).map(opt => (
                                            <TouchableOpacity
                                                key={opt.key}
                                                style={[
                                                    styles.payBtn,
                                                    paymentMode === opt.key && styles.payBtnActive,
                                                ]}
                                                onPress={() => { setPaymentMode(opt.key); if (opt.key !== 'MOBILE_MONEY') setMomoOperator(null); }}
                                                activeOpacity={0.8}
                                            >
                                                <Text style={styles.payEmoji}>{opt.emoji}</Text>
                                                <Text style={[
                                                    styles.payBtnText,
                                                    paymentMode === opt.key && styles.payBtnTextActive,
                                                ]}>
                                                    {opt.label}
                                                </Text>
                                            </TouchableOpacity>
                                        ))}
                                    </View>
                                    {/* Sélecteur opérateur si Mobile Money */}
                                    {paymentMode === 'MOBILE_MONEY' && (
                                        <View style={styles.operatorGrid}>
                                            {([
                                                { v: 'ORANGE', label: 'Orange Money', bg: '#FFF3E6', border: '#FF6600', text: '#FF6600' },
                                                { v: 'MTN',    label: 'MTN MoMo',    bg: '#FFFDE6', border: '#FFCC00', text: '#996600' },
                                                { v: 'WAVE',   label: 'Wave',         bg: '#E6F9FC', border: '#1DC4E9', text: '#0A8FA8' },
                                                { v: 'MOOV',   label: 'Moov Money',  bg: '#E6F0FF', border: '#0066CC', text: '#0066CC' },
                                            ] as const).map(op => (
                                                <TouchableOpacity
                                                    key={op.v}
                                                    style={[
                                                        styles.operatorBtn,
                                                        { backgroundColor: op.bg, borderColor: momoOperator === op.v ? colors.primary : op.border },
                                                    ]}
                                                    onPress={() => setMomoOperator(op.v)}
                                                    activeOpacity={0.8}
                                                >
                                                    <Text style={[styles.operatorLabel, { color: op.text }]} numberOfLines={1}>{op.label}</Text>
                                                    {momoOperator === op.v && <Text style={styles.operatorCheck}>✓</Text>}
                                                </TouchableOpacity>
                                            ))}
                                        </View>
                                    )}
                                </View>

                                {/* Récapitulatif */}
                                <View style={styles.recapBox}>
                                    <View style={styles.recapRow}>
                                        <Text style={styles.recapLabel}>
                                            {selectedItem.name} × {orderQty}
                                        </Text>
                                        <Text style={styles.recapValue}>
                                            {(selectedItem.price * orderQty).toLocaleString('fr-FR')} F
                                        </Text>
                                    </View>
                                    {(selectedItem.delivery_price ?? 0) > 0 && (
                                        <View style={styles.recapRow}>
                                            <Text style={styles.recapLabel}>Livraison</Text>
                                            <Text style={styles.recapValue}>
                                                {selectedItem.delivery_price!.toLocaleString('fr-FR')} F
                                            </Text>
                                        </View>
                                    )}
                                    <View style={[styles.recapRow, styles.recapTotalRow]}>
                                        <Text style={styles.recapTotalLabel}>TOTAL</Text>
                                        <Text style={styles.recapTotalValue}>
                                            {totalCommande.toLocaleString('fr-FR')} F
                                        </Text>
                                    </View>
                                </View>

                                {/* Boutons */}
                                <View style={styles.confirmBtns}>
                                    <TouchableOpacity
                                        style={styles.cancelBtn}
                                        onPress={() => { setShowConfirm(false); setShowDetail(true); }}
                                        activeOpacity={0.7}
                                    >
                                        <Text style={styles.cancelBtnText}>ANNULER</Text>
                                    </TouchableOpacity>
                                    <TouchableOpacity
                                        style={[styles.confirmBtn, ordering && { opacity: 0.6 }]}
                                        onPress={confirmOrder}
                                        disabled={ordering}
                                        activeOpacity={0.85}
                                    >
                                        {ordering ? (
                                            <ActivityIndicator color="#fff" size="small" />
                                        ) : (
                                            <>
                                                <CheckCircle color="#fff" size={16} />
                                                <Text style={styles.confirmBtnText}>CONFIRMER</Text>
                                            </>
                                        )}
                                    </TouchableOpacity>
                                </View>
                            </>
                        )}
                    </Pressable>
                </Pressable>
            </Modal>
        </View>
    );
}

// ── Styles ─────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.bgSecondary },

    searchBox: {
        flexDirection: 'row', alignItems: 'center',
        backgroundColor: colors.white, borderRadius: 10,
        shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.08, shadowRadius: 8, elevation: 4,
    },
    searchInput: {
        flex: 1, height: 48, paddingHorizontal: 12,
        fontSize: 14, fontWeight: '700', color: colors.slate800,
    },

    // Liste
    scroll:        { flex: 1 },
    scrollContent: { paddingHorizontal: 16, paddingTop: 20, paddingBottom: 40, gap: 10 },
    skeleton: {
        height: 80, backgroundColor: colors.white, borderRadius: 10,
        borderWidth: 1, borderColor: colors.slate100, opacity: 0.6,
    },
    emptyCard: {
        backgroundColor: colors.white, borderRadius: 10, padding: 48,
        alignItems: 'center', borderWidth: 2, borderColor: colors.slate100,
        borderStyle: 'dashed', gap: 12,
    },
    emptyText: { fontSize: 11, fontWeight: '900', color: colors.slate300, letterSpacing: 2 },

    // Carte produit (inchangée)
    itemCard: {
        flexDirection: 'row', alignItems: 'center', gap: 12,
        backgroundColor: colors.white, borderRadius: 10, padding: 16,
        borderWidth: 1, borderColor: colors.slate100,
        shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.04, shadowRadius: 4, elevation: 1,
    },
    itemIcon: {
        width: 48, height: 48, borderRadius: 10,
        backgroundColor: '#e0e7ff', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
    },
    itemIconImg: { width: 48, height: 48, borderRadius: 10, flexShrink: 0, resizeMode: 'cover' },
    itemInfo:   { flex: 1, minWidth: 0 },
    itemName:   { fontSize: 14, fontWeight: '700', color: colors.slate800 },
    itemMeta:   { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4, flexWrap: 'wrap' },
    itemStore:  { fontSize: 11, fontWeight: '700', color: colors.slate400, textTransform: 'uppercase' },
    badgeAvail:     { backgroundColor: '#dcfce7', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 },
    badgeAvailText: { fontSize: 11, fontWeight: '700', color: '#15803d' },
    badgeOut:       { backgroundColor: colors.slate100, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 },
    badgeOutText:   { fontSize: 11, fontWeight: '700', color: colors.slate400 },
    itemPriceBlock: { alignItems: 'flex-end', flexShrink: 0, gap: 3 },
    itemPrice:      { fontSize: 14, fontWeight: '900', color: colors.slate800 },
    deliveryRow:    { flexDirection: 'row', alignItems: 'center', gap: 3 },
    deliveryPrice:  { fontSize: 11, fontWeight: '700', color: '#3b82f6' },
    perUnit:        { fontSize: 11, color: '#16a34a', fontWeight: '700' },
    deliveryInfoRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 4 },
    deliveryInfoChip: {
        flexDirection: 'row', alignItems: 'center', gap: 3,
        backgroundColor: '#f1f5f9', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4,
    },
    deliveryInfoText: { fontSize: 11, fontWeight: '700', color: colors.slate500 },
    commanderBtn: {
        flexDirection: 'row', alignItems: 'center', gap: 4,
        backgroundColor: colors.primary, paddingHorizontal: 8, paddingVertical: 5,
        borderRadius: 6, marginTop: 2,
    },
    commanderBtnText: { fontSize: 11, fontWeight: '900', color: '#fff' },

    // ── Modal fiche produit ──────────────────────────────────────────────────
    modalSafe: { flex: 1, backgroundColor: colors.bgSecondary },
    modalHeader: {
        flexDirection: 'row', alignItems: 'center',
        justifyContent: 'space-between',
        backgroundColor: colors.primary,
        paddingHorizontal: 16, paddingVertical: 12,
        borderBottomLeftRadius: 24,
        borderBottomRightRadius: 24,
    },
    modalBackBtn: {
        width: 40, height: 40, borderRadius: 10,
        backgroundColor: '#FFFFFF',
        alignItems: 'center', justifyContent: 'center',
    },
    modalTitle: {
        flex: 1, textAlign: 'center',
        fontSize: 15, fontWeight: '700', color: colors.white,
        marginHorizontal: 8,
    },
    modalScroll: { padding: 16, paddingBottom: 32, gap: 12 },

    detailPhoto: {
        width: '100%', height: 220, borderRadius: 10,
        backgroundColor: colors.slate100,
    },
    detailPhotoPlaceholder: {
        width: '100%', height: 160, borderRadius: 10,
        backgroundColor: '#e0e7ff',
        alignItems: 'center', justifyContent: 'center',
    },

    detailSection: {
        backgroundColor: colors.white, borderRadius: 10,
        borderWidth: 1, borderColor: colors.slate100,
        overflow: 'hidden',
        shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.04, shadowRadius: 4, elevation: 1,
    },
    detailSectionTitle: {
        fontSize: 11, fontWeight: '900', color: colors.slate400,
        letterSpacing: 2, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8,
        backgroundColor: colors.slate50,
        borderBottomWidth: 1, borderBottomColor: colors.slate100,
    },
    detailRow: {
        flexDirection: 'row', alignItems: 'center', gap: 8,
        paddingHorizontal: 16, paddingVertical: 12,
        borderBottomWidth: 1, borderBottomColor: colors.slate100,
    },
    detailLabel:      { flex: 1, fontSize: 13, color: colors.slate500, fontWeight: '500' },
    detailValue:      { fontSize: 13, fontWeight: '600', color: colors.slate800, maxWidth: '55%', textAlign: 'right' },
    detailValueGreen: { color: colors.primary },
    detailValuePhone: { color: colors.primary, textDecorationLine: 'underline', fontSize: 14, fontWeight: '600' },
    detailValueMuted: { fontSize: 14, fontWeight: '500', color: colors.slate400, fontStyle: 'italic' },

    modalFooter: {
        paddingHorizontal: 16, paddingVertical: 12,
        backgroundColor: colors.white,
        borderTopWidth: 1, borderTopColor: colors.slate100,
    },
    passerBtn: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
        backgroundColor: colors.primary, borderRadius: 10,
        paddingVertical: 16, gap: 10,
    },
    passerBtnText: { fontSize: 15, fontWeight: '900', color: '#fff', letterSpacing: 1 },

    // ── Modal confirmation ───────────────────────────────────────────────────
    confirmOverlay: {
        flex: 1, backgroundColor: 'rgba(0,0,0,0.5)',
        alignItems: 'center', justifyContent: 'center', padding: 24,
    },
    confirmBox: {
        backgroundColor: colors.white, borderRadius: 12,
        width: '100%', maxWidth: 380,
        shadowColor: '#000', shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.15, shadowRadius: 24, elevation: 10,
        overflow: 'hidden',
    },
    confirmHeader: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        paddingHorizontal: 20, paddingVertical: 16,
        borderBottomWidth: 1, borderBottomColor: colors.slate100,
    },
    confirmTitle: { fontSize: 14, fontWeight: '900', color: colors.slate800, letterSpacing: 1 },
    confirmCloseBtn: {
        width: 44, height: 44, borderRadius: 10,
        backgroundColor: colors.slate100,
        alignItems: 'center', justifyContent: 'center',
    },

    // Quantité
    qtySection: { paddingHorizontal: 20, paddingVertical: 16, alignItems: 'center', gap: 8 },
    qtyLabel:   { fontSize: 11, fontWeight: '700', color: colors.slate400, letterSpacing: 2 },
    qtyRow:     { flexDirection: 'row', alignItems: 'center', gap: 20 },
    qtyBtn: {
        width: 44, height: 44, borderRadius: 10,
        backgroundColor: colors.primaryBg,
        alignItems: 'center', justifyContent: 'center',
    },
    qtyValue: { fontSize: 36, fontWeight: '900', color: colors.slate800, minWidth: 60, textAlign: 'center' },
    qtyMax:   { fontSize: 11, color: colors.slate400, fontWeight: '500' },

    // Mode de paiement
    paySection: { paddingHorizontal: 20, paddingBottom: 16, gap: 8 },
    payLabel:   { fontSize: 11, fontWeight: '700', color: colors.slate400, letterSpacing: 2 },
    payRow:     { flexDirection: 'row', gap: 8 },
    payBtn: {
        flex: 1, alignItems: 'center', gap: 4, paddingVertical: 10,
        borderRadius: 10, borderWidth: 1.5, borderColor: colors.slate200,
        backgroundColor: colors.white,
    },
    payBtnActive:    { borderColor: colors.primary, backgroundColor: colors.primaryBg },
    payEmoji:        { fontSize: 18 },
    payBtnText:      { fontSize: 11, fontWeight: '700', color: colors.slate500, textAlign: 'center' },
    payBtnTextActive:{ color: colors.primary },
    operatorGrid:  { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8, paddingHorizontal: 20 },
    operatorBtn: {
        width: '47%', borderRadius: 10, borderWidth: 2,
        paddingVertical: 8, paddingHorizontal: 8,
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    },
    operatorLabel: { fontSize: 11, fontWeight: '800', flex: 1 },
    operatorCheck: { fontSize: 13, fontWeight: '900', color: colors.primary },

    // Récap
    recapBox: {
        marginHorizontal: 20, marginBottom: 16,
        backgroundColor: colors.slate50, borderRadius: 10,
        borderWidth: 1, borderColor: colors.slate100,
        overflow: 'hidden',
    },
    recapRow: {
        flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
        paddingHorizontal: 14, paddingVertical: 10,
        borderBottomWidth: 1, borderBottomColor: colors.slate100,
    },
    recapTotalRow: {
        backgroundColor: colors.primaryBg,
        borderBottomWidth: 0,
    },
    recapLabel:      { fontSize: 13, color: colors.slate600, fontWeight: '500', flex: 1 },
    recapValue:      { fontSize: 13, fontWeight: '700', color: colors.slate800 },
    recapTotalLabel: { fontSize: 13, fontWeight: '900', color: colors.primary, letterSpacing: 0.5, flex: 1 },
    recapTotalValue: { fontSize: 15, fontWeight: '900', color: colors.primary },

    // Boutons confirmation
    confirmBtns: {
        flexDirection: 'row', gap: 10,
        paddingHorizontal: 20, paddingBottom: 20,
    },
    cancelBtn: {
        flex: 1, paddingVertical: 14, borderRadius: 10,
        backgroundColor: colors.slate100,
        alignItems: 'center', justifyContent: 'center',
    },
    cancelBtnText: { fontSize: 13, fontWeight: '700', color: colors.slate600, letterSpacing: 0.5 },
    confirmBtn: {
        flex: 2, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
        gap: 8, paddingVertical: 14, borderRadius: 10,
        backgroundColor: colors.primary,
    },
    confirmBtnText: { fontSize: 13, fontWeight: '900', color: '#fff', letterSpacing: 0.5 },
});

// ── Styles carte desktop (grille 3 col) ───────────────────────────────────
const dtCard = StyleSheet.create({
    card: {
        flexDirection: 'column',
        backgroundColor: '#fff',
        borderRadius: 10,
        overflow: 'hidden',
        flex: 1,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.06,
        shadowRadius: 4,
        elevation: 2,
    },
    img: {
        width: '100%',
        height: 180,
        borderRadius: 0,
    },
    placeholder: {
        width: '100%',
        height: 180,
        backgroundColor: '#e0e7ff',
        alignItems: 'center',
        justifyContent: 'center',
    },
    body: {
        padding: 12,
        gap: 6,
    },
    name: {
        fontSize: 14,
        fontWeight: '700',
        color: '#1F2937',
        lineHeight: 20,
    },
    metaRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        flexWrap: 'wrap',
    },
    store: {
        fontSize: 11,
        fontWeight: '700',
        color: '#9CA3AF',
        textTransform: 'uppercase',
        flex: 1,
    },
    chipRow: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 4,
    },
    price: {
        fontSize: 16,
        fontWeight: '900',
        color: '#1F2937',
        marginTop: 2,
    },
    btn: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        backgroundColor: '#059669',
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderRadius: 8,
        marginTop: 4,
        alignSelf: 'stretch',
        justifyContent: 'center',
    },
    btnText: {
        fontSize: 13,
        fontWeight: '700',
        color: '#fff',
    },
});
