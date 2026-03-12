// Produits — Admin : catalogue global des produits avec stock
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
    View, Text, ScrollView, FlatList, StyleSheet, ActivityIndicator,
    TextInput, Alert, RefreshControl, Image,
} from 'react-native';
import { TouchableOpacity } from 'react-native-gesture-handler';
import { useFocusEffect } from 'expo-router';
import { Package, Trash2, X } from 'lucide-react-native';
import { ScreenHeader } from '@/src/components/ui';
import { supabase } from '@/src/lib/supabase';
import { colors } from '@/src/lib/colors';
import { useAuth } from '@/src/context/AuthContext';

// ── Types ──────────────────────────────────────────────────────────────────────
interface Product {
    id: string;
    name: string;
    price: number;
    category: string | null;
    store_id: string | null;
    image_url: string | null;
    created_at: string;
    stockQty?: number;
    storeName?: string;
    storeType?: string;
}

type CatFilter = 'tous' | 'en_stock' | 'rupture' | 'Alimentation' | 'Boissons' | 'Hygiène' | 'Autre';

// ── Helpers ───────────────────────────────────────────────────────────────────
const CAT_FILTERS: { key: CatFilter; label: string }[] = [
    { key: 'tous',         label: 'Tous' },
    { key: 'en_stock',     label: 'En stock' },
    { key: 'rupture',      label: 'Rupture' },
    { key: 'Alimentation', label: 'Alimentation' },
    { key: 'Boissons',     label: 'Boissons' },
    { key: 'Hygiène',      label: 'Hygiène' },
    { key: 'Autre',        label: 'Autre' },
];

// ── Composant principal ────────────────────────────────────────────────────────
export default function Produits() {
    const [products, setProducts]     = useState<Product[]>([]);
    const [loading, setLoading]       = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [search, setSearch]       = useState('');
    const [catFilter, setCatFilter] = useState<CatFilter>('tous');
    const [deleting, setDeleting]       = useState<string | null>(null);

    const fetchProducts = useCallback(async () => {
        try {
            const [prodRes, stockRes, storeRes] = await Promise.all([
                supabase
                    .from('products')
                    .select('id, name, price, category, store_id, image_url, created_at')
                    .order('created_at', { ascending: false })
                    .limit(200),
                supabase.from('stock').select('product_id, quantity'),
                supabase.from('stores').select('id, name, store_type'),
            ]);

            const prods  = (prodRes.data  ?? []) as Product[];
            const stocks = (stockRes.data ?? []) as { product_id: string; quantity: number }[];
            const stores = (storeRes.data ?? []) as { id: string; name: string; store_type?: string }[];

            const stockMap: Record<string, number>  = {};
            const storeMap: Record<string, { name: string; type: string }> = {};
            for (const s of stocks) stockMap[s.product_id] = (stockMap[s.product_id] ?? 0) + s.quantity;
            for (const s of stores) storeMap[s.id] = { name: s.name, type: s.store_type ?? '' };

            setProducts(prods.map(p => ({
                ...p,
                stockQty:  stockMap[p.id] ?? 0,
                storeName: p.store_id ? (storeMap[p.store_id]?.name ?? 'Boutique') : 'Boutique',
                storeType: p.store_id ? (storeMap[p.store_id]?.type ?? '') : '',
            })));
        } catch (err) {
            console.error('[Produits Admin] fetch error:', err);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, []);

    useEffect(() => { setLoading(true); fetchProducts(); }, [fetchProducts]);

    const onRefresh = useCallback(() => { setRefreshing(true); fetchProducts(); }, [fetchProducts]);

    useFocusEffect(useCallback(() => { fetchProducts(); }, [fetchProducts]));

    // ── Filtrage ───────────────────────────────────────────────────────────────
    const filtered = useMemo(() => {
        let list = products;

        // Filtre catégorie/stock
        if (catFilter === 'en_stock')     list = list.filter(p => (p.stockQty ?? 0) > 0);
        else if (catFilter === 'rupture') list = list.filter(p => (p.stockQty ?? 0) === 0);
        else if (catFilter !== 'tous')    list = list.filter(p => p.category === catFilter);

        if (search.trim()) {
            const q = search.toLowerCase();
            list = list.filter(p => p.name?.toLowerCase().includes(q));
        }
        return list;
    }, [products, catFilter, search]);

    const totalValue  = useMemo(() =>
        products.reduce((s, p) => s + (p.price ?? 0) * (p.stockQty ?? 0), 0),
        [products]
    );
    const inStock = useMemo(() => products.filter(p => (p.stockQty ?? 0) > 0).length, [products]);

    // ── Suppression produit ────────────────────────────────────────────────────
    const handleDelete = (p: Product) => {
        Alert.alert(
            'Supprimer le produit',
            `Voulez-vous supprimer "${p.name}" ? Cette action est irréversible.`,
            [
                {
                    text: 'Supprimer', style: 'destructive',
                    onPress: async () => {
                        setDeleting(p.id);
                        try {
                            await supabase.from('stock').delete().eq('product_id', p.id);
                            const { error } = await supabase.from('products').delete().eq('id', p.id);
                            if (error) throw error;
                            setProducts(prev => prev.filter(x => x.id !== p.id));
                        } catch {
                            Alert.alert('Erreur', 'Impossible de supprimer le produit');
                        } finally {
                            setDeleting(null);
                        }
                    },
                },
                { text: 'Annuler', style: 'cancel' },
            ]
        );
    };

    return (
        <View style={s.safe}>
            <ScreenHeader title="Produits" subtitle="Catalogue global" showBack={true} paddingBottom={16}>
                {/* Stats row */}
                <View style={s.statsRow}>
                    <Text style={s.statsText}>
                        {loading ? '…' : `${products.length} produits · ${inStock} en stock · valeur ${totalValue.toLocaleString('fr-FR')} F`}
                    </Text>
                </View>

                {/* Barre de recherche */}
                <View style={s.searchBar}>
                    <Package color="rgba(255,255,255,0.6)" size={16} />
                    <TextInput
                        style={s.searchInput}
                        placeholder="Rechercher un produit..."
                        placeholderTextColor="rgba(255,255,255,0.5)"
                        value={search}
                        onChangeText={setSearch}
                    />
                    {search.length > 0 && (
                        <TouchableOpacity onPress={() => setSearch('')}>
                            <X color="rgba(255,255,255,0.6)" size={16} />
                        </TouchableOpacity>
                    )}
                </View>
            </ScreenHeader>

            {/* Filtres catégorie */}
            <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={s.filterScroll}
                contentContainerStyle={s.filterRow}
            >
                {CAT_FILTERS.map(f => (
                    <TouchableOpacity
                        key={f.key}
                        style={[s.filterBtn, catFilter === f.key && s.filterBtnActive]}
                        activeOpacity={0.82}
                        onPress={() => setCatFilter(f.key)}
                    >
                        <Text style={[s.filterLabel, catFilter === f.key && s.filterLabelActive]}>
                            {f.label}
                        </Text>
                    </TouchableOpacity>
                ))}
            </ScrollView>

            {/* Liste produits */}
            <FlatList
                data={loading ? [] : filtered}
                keyExtractor={(item) => item.id}
                style={s.scroll}
                contentContainerStyle={s.scrollContent}
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
                refreshControl={
                    <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.primary]} />
                }
                ListHeaderComponent={loading ? (
                    <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />
                ) : null}
                ListEmptyComponent={!loading ? (
                    <View style={s.emptyCard}>
                        <Package color={colors.slate300} size={40} />
                        <Text style={s.emptyText}>AUCUN PRODUIT TROUVÉ</Text>
                    </View>
                ) : null}
                renderItem={({ item: p }) => {
                    const qty        = p.stockQty ?? 0;
                    const prodInStock = qty > 0;
                    const isDeleting = deleting === p.id;
                    return (
                        <View style={s.productCard}>
                            {p.image_url ? (
                                <Image source={{ uri: p.image_url }} style={s.productImage} resizeMode="cover" />
                            ) : (
                                <View style={s.productImagePlaceholder}>
                                    <Package color="#94a3b8" size={22} />
                                </View>
                            )}
                            <View style={s.productInfo}>
                                <View style={s.productNameRow}>
                                    <Text style={s.productName} numberOfLines={1}>{p.name}</Text>
                                    {p.category && (
                                        <View style={s.catBadge}>
                                            <Text style={s.catBadgeText}>{p.category}</Text>
                                        </View>
                                    )}
                                </View>
                                <Text style={s.productStore} numberOfLines={1}>{p.storeName}</Text>
                                <View style={s.productMeta}>
                                    <Text style={s.productPrice}>{(p.price ?? 0).toLocaleString('fr-FR')} F</Text>
                                    <View style={[s.stockBadge, { backgroundColor: prodInStock ? '#d1fae5' : '#fee2e2' }]}>
                                        <Text style={[s.stockBadgeText, { color: prodInStock ? '#065f46' : '#991b1b' }]}>
                                            {prodInStock ? `${qty} u` : 'Rupture'}
                                        </Text>
                                    </View>
                                </View>
                            </View>
                            <TouchableOpacity
                                style={s.deleteBtn}
                                activeOpacity={0.85}
                                onPress={() => handleDelete(p)}
                                disabled={isDeleting}
                            >
                                {isDeleting
                                    ? <ActivityIndicator color="#fff" size="small" />
                                    : <Trash2 color="#fff" size={16} />
                                }
                            </TouchableOpacity>
                        </View>
                    );
                }}
            />
        </View>
    );
}

// ── Styles ─────────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
    safe: { flex: 1, backgroundColor: '#f8fafc' },

    statsRow: { alignItems: 'center' },
    statsText: { fontSize: 11, fontWeight: '700', color: 'rgba(255,255,255,0.75)', textAlign: 'center' },

    searchBar: {
        flexDirection: 'row', alignItems: 'center', gap: 10,
        backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 10,
        paddingHorizontal: 12, paddingVertical: 10,
    },
    searchInput: { flex: 1, fontSize: 13, color: '#fff', paddingVertical: 0 },

    filterScroll: { flexGrow: 0, maxHeight: 52, marginTop: 12 },
    filterRow:    { paddingHorizontal: 16, paddingVertical: 6, flexDirection: 'row', gap: 8 },
    filterBtn: {
        paddingHorizontal: 14, paddingVertical: 7,
        borderRadius: 8, borderWidth: 1.5, borderColor: '#e2e8f0',
        backgroundColor: '#fff',
    },
    filterBtnActive:   { borderColor: '#059669', backgroundColor: '#ecfdf5' },
    filterLabel:       { fontSize: 11, fontWeight: '700', color: '#64748b' },
    filterLabelActive: { color: '#059669' },

    scroll:        { flex: 1 },
    scrollContent: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 40, gap: 8 },

    // Carte produit
    productCard: {
        flexDirection: 'row', alignItems: 'center', gap: 12,
        backgroundColor: '#fff', borderRadius: 10, padding: 12,
        borderWidth: 1, borderColor: '#f1f5f9',
        shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.04, shadowRadius: 4, elevation: 1,
    },
    productImage: { width: 48, height: 48, borderRadius: 10, flexShrink: 0 },
    productImagePlaceholder: {
        width: 48, height: 48, borderRadius: 10, flexShrink: 0,
        backgroundColor: '#f1f5f9', alignItems: 'center', justifyContent: 'center',
    },
    productInfo:    { flex: 1, minWidth: 0, gap: 3 },
    productNameRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
    productName:    { fontSize: 13, fontWeight: '700', color: '#1e293b', flexShrink: 1 },
    catBadge:       { backgroundColor: '#e2e8f0', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 5 },
    catBadgeText:   { fontSize: 11, fontWeight: '700', color: '#475569' },
    productStore:   { fontSize: 11, color: '#94a3b8' },
    productMeta:    { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 2 },
    productPrice:   { fontSize: 13, fontWeight: '900', color: '#1e293b' },
    stockBadge:     { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 5 },
    stockBadgeText: { fontSize: 11, fontWeight: '700' },

    deleteBtn: {
        width: 32, height: 32, borderRadius: 8,
        backgroundColor: '#dc2626', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
    },

    emptyCard: {
        backgroundColor: '#fff', borderRadius: 10, padding: 48,
        alignItems: 'center', borderWidth: 2, borderColor: '#f1f5f9',
        borderStyle: 'dashed', gap: 12,
    },
    emptyText: { fontSize: 11, fontWeight: '900', color: '#cbd5e1', letterSpacing: 2 },
});
