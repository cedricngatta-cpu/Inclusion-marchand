// Marché Virtuel — migré depuis Next.js /approvisionnement/page.tsx
import React, { useState, useEffect, useCallback } from 'react';
import {
    View, Text, ScrollView, StyleSheet, TouchableOpacity,
    TextInput, ActivityIndicator, Image, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { ChevronLeft, Package, Search, Store, Truck, MapPin, Clock, ShoppingCart } from 'lucide-react-native';
import { supabase } from '@/src/lib/supabase';
import { colors } from '@/src/lib/colors';
import { onSocketEvent, emitEvent } from '@/src/lib/socket';
import { useProfileContext } from '@/src/context/ProfileContext';

interface CatalogueItem {
    id: string;
    name: string;
    price: number;
    delivery_price?: number;
    zone_livraison?: string;
    delai_livraison?: string;
    category: string;
    store_id: string;
    storeName: string;
    stockQty: number;
    imageUrl?: string;
}

export default function MarcheScreen() {
    const router = useRouter();
    const { activeProfile } = useProfileContext();
    const [items, setItems]     = useState<CatalogueItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch]   = useState('');

    // ── Fetch catalogue depuis Supabase ──
    const fetchCatalogue = useCallback(async () => {
        setLoading(true);
        try {
            console.log('=== MARCHÉ VIRTUEL — fetchCatalogue ===');

            const { data: storeData, error: storeErr } = await supabase
                .from('stores')
                .select('id, name')
                .eq('store_type', 'PRODUCER');

            console.log('[Marché] Boutiques producteurs:', storeData?.length ?? 0, 'erreur:', storeErr?.message ?? null);

            if (storeErr || !storeData?.length) {
                console.warn('[Marché] Aucun store PRODUCER trouvé — liste vide');
                setItems([]); return;
            }

            const storeMap: Record<string, string> = {};
            storeData.forEach(s => { storeMap[s.id] = s.name; });
            const storeIds = storeData.map(s => s.id);

            console.log('[Marché] Store IDs producteurs:', storeIds);

            const { data: prodData, error: prodErr } = await supabase
                .from('products')
                .select('id, name, price, delivery_price, category, store_id, image_url, zone_livraison, delai_livraison')
                .in('store_id', storeIds);

            console.log('[Marché] Produits trouvés:', prodData?.length ?? 0, 'erreur:', prodErr?.message ?? null);
            console.log('[Marché] Produits data:', prodData);

            if (prodErr || !prodData?.length) {
                console.warn('[Marché] Aucun produit producteur trouvé');
                setItems([]); return;
            }

            const productIds = prodData.map(p => p.id);
            const { data: stockData } = await supabase
                .from('stock')
                .select('product_id, quantity')
                .in('product_id', productIds);

            const stockMap: Record<string, number> = {};
            stockData?.forEach(s => { stockMap[s.product_id] = s.quantity; });

            setItems(prodData.map(p => ({
                id:              p.id,
                name:            p.name,
                price:           p.price,
                delivery_price:  p.delivery_price ?? undefined,
                zone_livraison:  p.zone_livraison ?? undefined,
                delai_livraison: p.delai_livraison ?? undefined,
                category:        p.category,
                store_id:        p.store_id,
                storeName:       storeMap[p.store_id] ?? 'Producteur',
                stockQty:        stockMap[p.id] ?? 0,
                imageUrl:        p.image_url ?? undefined,
            })));
        } catch (err) {
            console.error('[Marché] fetch error:', err);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { fetchCatalogue(); }, [fetchCatalogue]);

    // Rafraîchir quand un producteur publie un nouveau produit
    useEffect(() => {
        const unsub = onSocketEvent('nouveau-produit-marche', () => { fetchCatalogue(); });
        return unsub;
    }, [fetchCatalogue]);

    // Recharge à chaque retour sur l'écran (ex: après une publication producteur)
    useFocusEffect(useCallback(() => { fetchCatalogue(); }, [fetchCatalogue]));

    const filtered = items.filter(i =>
        i.name.toLowerCase().includes(search.toLowerCase()) ||
        i.storeName.toLowerCase().includes(search.toLowerCase())
    );

    return (
        <SafeAreaView style={styles.safe} edges={['top']}>
            {/* ── HEADER ── */}
            <View style={styles.header}>
                <View style={styles.headerTop}>
                    <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
                        <ChevronLeft color={colors.white} size={20} />
                    </TouchableOpacity>
                    <View style={styles.headerTitleBlock}>
                        <Text style={styles.headerTitle}>MARCHÉ VIRTUEL</Text>
                        <Text style={styles.headerSub}>PRODUITS DES PRODUCTEURS</Text>
                    </View>
                    <View style={{ width: 40 }} />
                </View>

                {/* Barre de recherche dans le header */}
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
            </View>

            {/* ── CONTENU ── */}
            <ScrollView
                style={styles.scroll}
                contentContainerStyle={styles.scrollContent}
                showsVerticalScrollIndicator={false}
            >
                {loading ? (
                    // Skeleton
                    [0, 1, 2, 3].map(i => (
                        <View key={i} style={styles.skeleton} />
                    ))
                ) : filtered.length === 0 ? (
                    <View style={styles.emptyCard}>
                        <Store color={colors.slate400} size={56} />
                        <Text style={styles.emptyText}>
                            {search ? 'AUCUN RÉSULTAT' : 'AUCUN PRODUCTEUR DISPONIBLE'}
                        </Text>
                    </View>
                ) : (
                    filtered.map(item => (
                        <View key={item.id} style={styles.itemCard}>
                            {/* Photo ou icône produit */}
                            {item.imageUrl ? (
                                <Image source={{ uri: item.imageUrl }} style={styles.itemIconImg} />
                            ) : (
                                <View style={styles.itemIcon}>
                                    <Package color="#4f46e5" size={20} />
                                </View>
                            )}

                            {/* Infos */}
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
                                {/* Zone + Délai */}
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

                            {/* Prix + Bouton Commander */}
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
                                        onPress={async () => {
                                            console.log('=== COMMANDER ===');
                                            console.log('[Marché] Produit sélectionné:', item.name, 'id:', item.id);
                                            console.log('[Marché] Boutique acheteur (activeProfile):', activeProfile?.id, activeProfile?.name);
                                            console.log('[Marché] Boutique vendeur (seller_store_id):', item.store_id);

                                            if (!activeProfile) {
                                                Alert.alert('Erreur', 'Profil non chargé. Reconnecte-toi.');
                                                console.error('[Marché] activeProfile est null — impossible de commander');
                                                return;
                                            }

                                            const total = item.price + (item.delivery_price ?? 0);
                                            const orderPayload = {
                                                product_id:      item.id,
                                                product_name:    item.name,
                                                seller_store_id: item.store_id,
                                                buyer_store_id:  activeProfile.id,
                                                quantity:        1,
                                                unit_price:      item.price,
                                                total_amount:    total,
                                                status:          'PENDING',
                                                notes:           item.name,
                                                buyer_name:      activeProfile.name,
                                            };

                                            console.log('[Marché] INSERT orders payload:', orderPayload);

                                            const { data: orderData, error: orderErr } = await supabase
                                                .from('orders')
                                                .insert([orderPayload])
                                                .select()
                                                .single();

                                            console.log('[Marché] INSERT orders résultat:', orderData);
                                            console.log('[Marché] INSERT orders erreur:', orderErr?.message ?? null);

                                            if (orderErr) {
                                                console.error('[Marché] ❌ INSERT orders ERREUR:', orderErr.message, '| code:', orderErr.code);
                                                Alert.alert('Erreur commande', orderErr.message);
                                                return;
                                            }
                                            console.log('[Marché] ✅ INSERT orders OK — orderId:', orderData?.id);

                                            // Log activité
                                            try {
                                                await supabase.from('activity_logs').insert([{
                                                    user_id:   activeProfile?.id ?? null,
                                                    user_name: activeProfile?.name ?? 'Marchand',
                                                    action:    `Commande passée : ${item.name} × 1 — ${total.toLocaleString('fr-FR')} F`,
                                                    type:      'commande',
                                                }]);
                                            } catch {}

                                            console.log('[Marché] Émission socket nouvelle-commande → sellerStoreId:', item.store_id);
                                            emitEvent('nouvelle-commande', {
                                                sellerStoreId: item.store_id,
                                                orderId:       orderData?.id,
                                                productName:   item.name,
                                                buyerName:     activeProfile.name,
                                            });

                                            Alert.alert('Commande envoyée !', `${item.name} · Total : ${total.toLocaleString('fr-FR')} F (livraison incluse)`);
                                        }}
                                    >
                                        <ShoppingCart color="#fff" size={11} />
                                        <Text style={styles.commanderBtnText}>Commander</Text>
                                    </TouchableOpacity>
                                )}
                            </View>
                        </View>
                    ))
                )}
            </ScrollView>
        </SafeAreaView>
    );
}

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
    headerTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    backBtn: {
        width: 40, height: 40, borderRadius: 10,
        backgroundColor: 'rgba(255,255,255,0.2)',
        alignItems: 'center', justifyContent: 'center',
    },
    headerTitleBlock: { alignItems: 'center' },
    headerTitle: { fontSize: 14, fontWeight: '900', color: colors.white, letterSpacing: 1 },
    headerSub:   { fontSize: 9, fontWeight: '700', color: 'rgba(255,255,255,0.7)', letterSpacing: 2, marginTop: 2 },

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
    emptyText: { fontSize: 10, fontWeight: '900', color: colors.slate300, letterSpacing: 2 },

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
    itemIconImg: {
        width: 48, height: 48, borderRadius: 10, flexShrink: 0,
        resizeMode: 'cover',
    },
    itemInfo:  { flex: 1, minWidth: 0 },
    itemName:  { fontSize: 14, fontWeight: '700', color: colors.slate800 },
    itemMeta:  { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4, flexWrap: 'wrap' },
    itemStore: { fontSize: 10, fontWeight: '700', color: colors.slate400, textTransform: 'uppercase' },

    badgeAvail:     { backgroundColor: '#dcfce7', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 },
    badgeAvailText: { fontSize: 9, fontWeight: '700', color: '#15803d' },
    badgeOut:       { backgroundColor: colors.slate100, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 },
    badgeOutText:   { fontSize: 9, fontWeight: '700', color: colors.slate400 },

    itemPriceBlock: { alignItems: 'flex-end', flexShrink: 0, gap: 3 },
    itemPrice:      { fontSize: 14, fontWeight: '900', color: colors.slate800 },
    deliveryRow:    { flexDirection: 'row', alignItems: 'center', gap: 3 },
    deliveryPrice:  { fontSize: 10, fontWeight: '700', color: '#3b82f6' },
    perUnit:        { fontSize: 10, color: '#16a34a', fontWeight: '700' },

    deliveryInfoRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 4 },
    deliveryInfoChip: {
        flexDirection: 'row', alignItems: 'center', gap: 3,
        backgroundColor: '#f1f5f9', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4,
    },
    deliveryInfoText: { fontSize: 9, fontWeight: '700', color: colors.slate500 },

    commanderBtn: {
        flexDirection: 'row', alignItems: 'center', gap: 4,
        backgroundColor: colors.primary, paddingHorizontal: 8, paddingVertical: 5,
        borderRadius: 6, marginTop: 2,
    },
    commanderBtnText: { fontSize: 10, fontWeight: '900', color: '#fff' },
});
