// Gestion du stock — Producteur
import React, { useState, useCallback, useMemo } from 'react';
import {
    View, Text, ScrollView, StyleSheet, TouchableOpacity,
    TextInput, ActivityIndicator, RefreshControl,
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { Package, Plus, Minus, Search } from 'lucide-react-native';
import { ScreenHeader } from '@/src/components/ui';
import { supabase } from '@/src/lib/supabase';
import { colors } from '@/src/lib/colors';
import { useProfileContext } from '@/src/context/ProfileContext';
import { useStockContext } from '@/src/context/StockContext';

// ── Types ──────────────────────────────────────────────────────────────────────
interface ProductInfo {
    id: string;
    name: string;
    category: string;
    price: number;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function getStockBadge(qty: number): { bg: string; text: string; label: string } {
    if (qty === 0)  return { bg: '#fee2e2', text: '#991b1b', label: 'Rupture' };
    if (qty < 10)   return { bg: '#fef3c7', text: '#92400e', label: 'Stock bas' };
    return { bg: '#d1fae5', text: '#065f46', label: 'En stock' };
}

// ── Composant principal ────────────────────────────────────────────────────────
export default function StockScreen() {
    const router = useRouter();
    const { activeProfile } = useProfileContext();
    const { stock, updateStock, refreshStock } = useStockContext();

    const [products, setProducts]     = useState<ProductInfo[]>([]);
    const [search, setSearch]         = useState('');
    const [loading, setLoading]       = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [adjusting, setAdjusting]   = useState<string | null>(null);

    // ── Fetch produits uniquement (les quantités viennent du StockContext) ─────
    const fetchProducts = useCallback(async () => {
        if (!activeProfile) return;
        setLoading(true);
        try {
            const { data } = await supabase
                .from('products')
                .select('id, name, category, price')
                .eq('store_id', activeProfile.id)
                .order('name', { ascending: true });

            setProducts((data as ProductInfo[]) ?? []);
        } catch (err) {
            console.error('[Stock] fetch error:', err);
        } finally {
            setLoading(false);
        }
    }, [activeProfile]);

    useFocusEffect(useCallback(() => { fetchProducts(); }, [fetchProducts]));

    const handleRefresh = async () => {
        setRefreshing(true);
        await Promise.all([fetchProducts(), refreshStock()]);
        setRefreshing(false);
    };

    // ── Items dérivés : produits + quantités du StockContext ──────────────────
    const items = useMemo(() =>
        products.map(p => ({ ...p, quantity: stock[p.id] ?? 0 })),
        [products, stock]
    );

    // ── Ajustement quantité via StockContext ──────────────────────────────────
    const adjustQty = async (productId: string, delta: number) => {
        if (!activeProfile) return;
        setAdjusting(productId + delta);
        try {
            await updateStock(productId, delta);
        } finally {
            setAdjusting(null);
        }
    };

    // ── Filtrage ──────────────────────────────────────────────────────────────
    const filtered = useMemo(() => items.filter(i =>
        i.name.toLowerCase().includes(search.toLowerCase()) ||
        i.category.toLowerCase().includes(search.toLowerCase())
    ), [items, search]);

    // Compteurs
    const outCount = items.filter(i => i.quantity === 0).length;
    const lowCount = items.filter(i => i.quantity > 0 && i.quantity < 10).length;

    return (
        <View style={styles.safe}>
            <ScreenHeader
                title="Mon Stock"
                subtitle={`${items.length} produit(s)`}
                showBack={true}
                paddingBottom={(outCount > 0 || lowCount > 0) ? 16 : undefined}
            >
                {(outCount > 0 || lowCount > 0) && (
                    <View style={styles.alertRow}>
                        {outCount > 0 && (
                            <View style={styles.alertBadge}>
                                <Text style={styles.alertBadgeText}>{outCount} RUPTURE</Text>
                            </View>
                        )}
                        {lowCount > 0 && (
                            <View style={[styles.alertBadge, styles.alertBadgeLow]}>
                                <Text style={[styles.alertBadgeText, styles.alertBadgeTextLow]}>{lowCount} STOCK BAS</Text>
                            </View>
                        )}
                    </View>
                )}
            </ScreenHeader>

            {/* ── CONTENU ── */}
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
                {/* Bouton ajouter + recherche */}
                <View style={styles.topActions}>
                    <TouchableOpacity
                        style={styles.addBtn}
                        onPress={() => router.push('/producteur/publier' as any)}
                        activeOpacity={0.85}
                    >
                        <Plus color={colors.white} size={16} />
                        <Text style={styles.addBtnText}>AJOUTER UN PRODUIT</Text>
                    </TouchableOpacity>
                </View>

                {/* Barre de recherche */}
                <View style={styles.searchBox}>
                    <Search color={colors.slate400} size={16} style={{ marginLeft: 14 }} />
                    <TextInput
                        style={styles.searchInput}
                        placeholder="Chercher un produit..."
                        placeholderTextColor={colors.slate400}
                        value={search}
                        onChangeText={setSearch}
                        autoCapitalize="none"
                    />
                </View>

                {/* Liste */}
                {loading ? (
                    <ActivityIndicator color={colors.primary} style={{ marginTop: 24 }} />
                ) : filtered.length === 0 ? (
                    <View style={styles.emptyCard}>
                        <Package color={colors.slate300} size={48} />
                        <Text style={styles.emptyText}>
                            {search ? 'AUCUN RÉSULTAT' : 'AUCUN PRODUIT PUBLIÉ'}
                        </Text>
                        {!search && (
                            <Text style={styles.emptySubText}>
                                Publiez votre premier produit sur le Marché Virtuel.
                            </Text>
                        )}
                    </View>
                ) : (
                    filtered.map(item => {
                        const badge  = getStockBadge(item.quantity);
                        const adjKey = adjusting?.startsWith(item.id);

                        return (
                            <View key={item.id} style={styles.stockCard}>
                                {/* Infos produit */}
                                <View style={styles.stockInfo}>
                                    <View style={styles.stockIcon}>
                                        <Package color="#4f46e5" size={18} />
                                    </View>
                                    <View style={{ flex: 1, minWidth: 0 }}>
                                        <Text style={styles.stockName} numberOfLines={1}>{item.name}</Text>
                                        <Text style={styles.stockCat}>{item.category} • {item.price.toLocaleString('fr-FR')} F</Text>
                                    </View>
                                    <View style={[styles.stockBadge, { backgroundColor: badge.bg }]}>
                                        <Text style={[styles.stockBadgeText, { color: badge.text }]}>{badge.label}</Text>
                                    </View>
                                </View>

                                {/* Contrôle quantité */}
                                <View style={styles.qtyRow}>
                                    <TouchableOpacity
                                        style={[styles.qtyBtn, item.quantity === 0 && styles.qtyBtnDisabled]}
                                        onPress={() => adjustQty(item.id, -1)}
                                        disabled={item.quantity === 0 || !!adjKey}
                                        activeOpacity={0.8}
                                    >
                                        <Minus color={item.quantity === 0 ? colors.slate300 : colors.slate600} size={16} />
                                    </TouchableOpacity>

                                    <View style={styles.qtyDisplay}>
                                        {adjKey ? (
                                            <ActivityIndicator color={colors.primary} size="small" />
                                        ) : (
                                            <Text style={styles.qtyValue}>{item.quantity}</Text>
                                        )}
                                        <Text style={styles.qtyUnit}>unités</Text>
                                    </View>

                                    <TouchableOpacity
                                        style={styles.qtyBtn}
                                        onPress={() => adjustQty(item.id, +1)}
                                        disabled={!!adjKey}
                                        activeOpacity={0.8}
                                    >
                                        <Plus color={colors.primary} size={16} />
                                    </TouchableOpacity>
                                </View>
                            </View>
                        );
                    })
                )}
            </ScrollView>
        </View>
    );
}

// ── Styles ─────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.bgSecondary },

    alertRow:    { flexDirection: 'row', gap: 8 },
    alertBadge:  { backgroundColor: '#fee2e2', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 6 },
    alertBadgeText: { fontSize: 11, fontWeight: '900', color: '#991b1b', letterSpacing: 1 },
    alertBadgeLow: { backgroundColor: '#fef3c7' },
    alertBadgeTextLow: { color: '#92400e' },

    // Scroll
    scroll:        { flex: 1 },
    scrollContent: { paddingHorizontal: 16, paddingTop: 20, paddingBottom: 40, gap: 12 },

    // Top actions
    topActions: { flexDirection: 'row' },
    addBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        backgroundColor: colors.primary,
        borderRadius: 10,
        paddingVertical: 12,
        paddingHorizontal: 16,
        shadowColor: colors.primary,
        shadowOpacity: 0.25,
        shadowRadius: 6,
        elevation: 3,
    },
    addBtnText: { fontSize: 12, fontWeight: '900', color: colors.white, letterSpacing: 1 },

    // Recherche
    searchBox: {
        flexDirection: 'row', alignItems: 'center',
        backgroundColor: colors.white, borderRadius: 10,
        borderWidth: 1, borderColor: colors.slate100,
        shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.06, shadowRadius: 6, elevation: 2,
    },
    searchInput: {
        flex: 1, height: 48, paddingHorizontal: 12,
        fontSize: 14, fontWeight: '600', color: colors.slate800,
    },

    // Stock card
    stockCard: {
        backgroundColor: colors.white,
        borderRadius: 10,
        padding: 14,
        borderWidth: 1,
        borderColor: colors.slate100,
        gap: 12,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.04,
        shadowRadius: 4,
        elevation: 1,
    },
    stockInfo:  { flexDirection: 'row', alignItems: 'center', gap: 12 },
    stockIcon: {
        width: 40, height: 40, borderRadius: 8,
        backgroundColor: '#e0e7ff', alignItems: 'center', justifyContent: 'center',
    },
    stockName:  { fontSize: 13, fontWeight: '700', color: colors.slate800 },
    stockCat:   { fontSize: 11, fontWeight: '600', color: colors.slate400, marginTop: 2 },
    stockBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, flexShrink: 0 },
    stockBadgeText: { fontSize: 11, fontWeight: '700' },

    // Contrôle quantité
    qtyRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 16,
        backgroundColor: colors.slate50,
        borderRadius: 8,
        padding: 10,
    },
    qtyBtn: {
        width: 36, height: 36, borderRadius: 8,
        backgroundColor: colors.white,
        alignItems: 'center', justifyContent: 'center',
        borderWidth: 1, borderColor: colors.slate200,
    },
    qtyBtnDisabled: { opacity: 0.4 },
    qtyDisplay: { alignItems: 'center', minWidth: 60 },
    qtyValue:   { fontSize: 22, fontWeight: '900', color: colors.slate800, lineHeight: 26 },
    qtyUnit:    { fontSize: 11, fontWeight: '700', color: colors.slate400, letterSpacing: 1, marginTop: 2 },

    // Empty
    emptyCard: {
        backgroundColor: colors.white, borderRadius: 10, padding: 48,
        alignItems: 'center', borderWidth: 2, borderColor: colors.slate100,
        borderStyle: 'dashed', gap: 12,
    },
    emptyText:    { fontSize: 11, fontWeight: '900', color: colors.slate300, letterSpacing: 2, textAlign: 'center' },
    emptySubText: { fontSize: 12, fontWeight: '500', color: colors.slate400, textAlign: 'center' },
});
