// Gestion du stock — Producteur
import React, { useState, useEffect, useCallback } from 'react';
import {
    View, Text, ScrollView, StyleSheet, TouchableOpacity,
    TextInput, ActivityIndicator, RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { ChevronLeft, Package, Plus, Minus, Search } from 'lucide-react-native';
import { supabase } from '@/src/lib/supabase';
import { colors } from '@/src/lib/colors';
import { useProfileContext } from '@/src/context/ProfileContext';

// ── Types ──────────────────────────────────────────────────────────────────────
interface StockItem {
    id: string;
    name: string;
    category: string;
    price: number;
    quantity: number;
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

    const [items, setItems]       = useState<StockItem[]>([]);
    const [search, setSearch]     = useState('');
    const [loading, setLoading]   = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [adjusting, setAdjusting]   = useState<string | null>(null);

    // ── Fetch ─────────────────────────────────────────────────────────────────
    const fetchStock = useCallback(async () => {
        if (!activeProfile) return;
        setLoading(true);
        try {
            const { data: products } = await supabase
                .from('products')
                .select('id, name, category, price')
                .eq('store_id', activeProfile.id)
                .order('name', { ascending: true });

            if (!products?.length) { setItems([]); return; }

            const ids = products.map(p => p.id);
            const { data: stockData } = await supabase
                .from('stock')
                .select('product_id, quantity')
                .in('product_id', ids);

            const stockMap: Record<string, number> = {};
            stockData?.forEach(s => { stockMap[s.product_id] = s.quantity; });

            setItems(products.map(p => ({
                id:       p.id,
                name:     p.name,
                category: p.category,
                price:    p.price,
                quantity: stockMap[p.id] ?? 0,
            })));
        } catch (err) {
            console.error('[Stock] fetch error:', err);
        } finally {
            setLoading(false);
        }
    }, [activeProfile]);

    useEffect(() => { fetchStock(); }, [fetchStock]);

    // Recharge à chaque retour sur l'écran
    useFocusEffect(useCallback(() => { fetchStock(); }, [fetchStock]));

    const handleRefresh = async () => {
        setRefreshing(true);
        await fetchStock();
        setRefreshing(false);
    };

    // ── Ajustement quantité ────────────────────────────────────────────────────
    const adjustQty = async (productId: string, delta: number) => {
        if (!activeProfile) return;
        const current = items.find(i => i.id === productId)?.quantity ?? 0;
        const newQty  = Math.max(0, current + delta);

        // Mise à jour optimiste
        setItems(prev => prev.map(i => i.id === productId ? { ...i, quantity: newQty } : i));
        setAdjusting(productId + delta);

        try {
            await supabase.from('stock').upsert({
                product_id: productId,
                store_id:   activeProfile.id,
                quantity:   newQty,
            });
        } catch (err) {
            console.error('[Stock] upsert error:', err);
            // Rollback
            setItems(prev => prev.map(i => i.id === productId ? { ...i, quantity: current } : i));
        } finally {
            setAdjusting(null);
        }
    };

    // ── Filtrage ──────────────────────────────────────────────────────────────
    const filtered = items.filter(i =>
        i.name.toLowerCase().includes(search.toLowerCase()) ||
        i.category.toLowerCase().includes(search.toLowerCase())
    );

    // Compteurs
    const outCount = items.filter(i => i.quantity === 0).length;
    const lowCount = items.filter(i => i.quantity > 0 && i.quantity < 10).length;

    return (
        <SafeAreaView style={styles.safe} edges={['top']}>
            {/* ── HEADER ── */}
            <View style={styles.header}>
                <View style={styles.headerTop}>
                    <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
                        <ChevronLeft color={colors.white} size={20} />
                    </TouchableOpacity>
                    <View style={styles.headerTitleBlock}>
                        <Text style={styles.headerTitle}>MON STOCK</Text>
                        <Text style={styles.headerSub}>{items.length} PRODUIT(S)</Text>
                    </View>
                    <View style={{ width: 40 }} />
                </View>

                {/* Mini KPIs */}
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
            </View>

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
                        const badge     = getStockBadge(item.quantity);
                        const adjKey    = adjusting?.startsWith(item.id);

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
        paddingBottom: 24,
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
    headerTitle: { fontSize: 16, fontWeight: '900', color: colors.white, letterSpacing: 1 },
    headerSub:   { fontSize: 9, fontWeight: '700', color: 'rgba(255,255,255,0.7)', letterSpacing: 2, marginTop: 2 },

    alertRow:    { flexDirection: 'row', gap: 8 },
    alertBadge:  { backgroundColor: '#fee2e2', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 6 },
    alertBadgeText: { fontSize: 9, fontWeight: '900', color: '#991b1b', letterSpacing: 1 },
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
    stockCat:   { fontSize: 10, fontWeight: '600', color: colors.slate400, marginTop: 2 },
    stockBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, flexShrink: 0 },
    stockBadgeText: { fontSize: 9, fontWeight: '700' },

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
    qtyUnit:    { fontSize: 9, fontWeight: '700', color: colors.slate400, letterSpacing: 1, marginTop: 2 },

    // Empty
    emptyCard: {
        backgroundColor: colors.white, borderRadius: 10, padding: 48,
        alignItems: 'center', borderWidth: 2, borderColor: colors.slate100,
        borderStyle: 'dashed', gap: 12,
    },
    emptyText:    { fontSize: 10, fontWeight: '900', color: colors.slate300, letterSpacing: 2, textAlign: 'center' },
    emptySubText: { fontSize: 12, fontWeight: '500', color: colors.slate400, textAlign: 'center' },
});
