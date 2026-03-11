// Détail d'un membre producteur — Coopérative
import React, { useState, useEffect, useCallback } from 'react';
import {
    View, Text, ScrollView, StyleSheet, ActivityIndicator,
} from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import {
    Phone, MapPin, Calendar, ShoppingBag, TrendingUp,
    Package, Store, CheckCircle, Clock, XCircle,
} from 'lucide-react-native';
import { ScreenHeader } from '@/src/components/ui';
import { supabase } from '@/src/lib/supabase';
import { colors } from '@/src/lib/colors';

// ── Types ──────────────────────────────────────────────────────────────────────
interface ProductInfo {
    id: string;
    name: string;
    price: number;
    quantity_available: number;
    category: string | null;
    created_at: string;
}

interface OrderStat {
    status: string;
    total_amount: number;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
const AVATAR_COLORS = ['#059669', '#2563eb', '#7c3aed', '#d97706', '#0891b2'];
function getAvatarColor(id: string) {
    let sum = 0;
    for (let i = 0; i < id.length; i++) sum += id.charCodeAt(i);
    return AVATAR_COLORS[sum % AVATAR_COLORS.length];
}

function getInitials(name: string) {
    const parts = name.split(' ').filter(Boolean);
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    return name.slice(0, 2).toUpperCase();
}

function formatMoney(n: number) {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `${Math.round(n / 1_000)}k`;
    return n.toLocaleString('fr-FR');
}

// ── Composant principal ────────────────────────────────────────────────────────
export default function MembreDetailScreen() {
    const params = useLocalSearchParams<{
        id: string;
        name: string;
        phone: string;
        address: string;
        created_at: string;
        boutique_name: string;
    }>();

    const memberId    = params.id;
    const memberName  = params.name  || 'Inconnu';
    const initials    = getInitials(memberName);
    const avatarColor = getAvatarColor(memberId);

    // État
    const [storeName, setStoreName]     = useState<string | null>(params.boutique_name || null);
    const [storeId,   setStoreId]       = useState<string | null>(null);
    const [products,  setProducts]      = useState<ProductInfo[]>([]);
    const [orders,    setOrders]        = useState<OrderStat[]>([]);
    const [loading,   setLoading]       = useState(true);

    const fetchData = useCallback(async () => {
        setLoading(true);
        try {
            // 1. Boutique du producteur
            const { data: storeData } = await supabase
                .from('stores')
                .select('id, name')
                .eq('owner_id', memberId)
                .maybeSingle();

            const sid = storeData?.id ?? null;
            setStoreId(sid);
            if (storeData?.name) setStoreName(storeData.name);

            if (!sid) { setLoading(false); return; }

            // 2. Produits publiés sur le marché
            const { data: prodData } = await supabase
                .from('products')
                .select('id, name, price, category, created_at')
                .eq('store_id', sid)
                .order('created_at', { ascending: false });

            // Quantité depuis la table stock
            const { data: stockData } = await supabase
                .from('stock')
                .select('product_id, quantity')
                .eq('store_id', sid);

            const stockMap: Record<string, number> = {};
            for (const s of (stockData ?? [])) stockMap[s.product_id] = s.quantity ?? 0;

            setProducts(((prodData ?? []) as any[]).map(p => ({
                ...p,
                quantity_available: stockMap[p.id] ?? 0,
            })));

            // 3. Commandes reçues (en tant que vendeur)
            const { data: ordData } = await supabase
                .from('orders')
                .select('status, total_amount')
                .eq('seller_store_id', sid);

            setOrders((ordData ?? []) as OrderStat[]);
        } catch (err) {
            console.error('[MembreDetail] fetch error:', err);
        } finally {
            setLoading(false);
        }
    }, [memberId]);

    useEffect(() => { fetchData(); }, [fetchData]);

    // ── Calculs KPI ───────────────────────────────────────────────────────────
    const totalCommandes    = orders.length;
    const commandesLivrees  = orders.filter(o => o.status === 'DELIVERED').length;
    const commandesEnCours  = orders.filter(o => ['ACCEPTED', 'SHIPPED'].includes(o.status)).length;
    const commandesAnnulees = orders.filter(o => o.status === 'CANCELLED').length;
    const revenuB2B         = orders
        .filter(o => o.status === 'DELIVERED')
        .reduce((s, o) => s + (Number(o.total_amount) || 0), 0);
    const tauxLivraison     = totalCommandes > 0
        ? Math.round((commandesLivrees / totalCommandes) * 100)
        : 0;

    const totalProduits = products.length;
    const stockTotal    = products.reduce((s, p) => s + p.quantity_available, 0);

    return (
        <View style={styles.safe}>
            <ScreenHeader
                title={memberName}
                subtitle={storeName ?? 'Producteur'}
                showBack={true}
                paddingBottom={24}
            >
                {/* Bandeau avatar + nom dans le header */}
                <View style={styles.heroRow}>
                    <View style={[styles.heroAvatar, { backgroundColor: avatarColor }]}>
                        <Text style={styles.heroInitials}>{initials}</Text>
                    </View>
                    <View style={styles.heroInfo}>
                        <Text style={styles.heroName} numberOfLines={1}>{memberName}</Text>
                        {!!storeName && (
                            <View style={styles.heroStorePill}>
                                <Store color="rgba(255,255,255,0.8)" size={11} />
                                <Text style={styles.heroStoreName} numberOfLines={1}>{storeName}</Text>
                            </View>
                        )}
                    </View>
                    {/* Taux de livraison */}
                    <View style={styles.heroRate}>
                        <Text style={styles.heroRateVal}>{tauxLivraison}%</Text>
                        <Text style={styles.heroRateLbl}>Livraison</Text>
                    </View>
                </View>
            </ScreenHeader>

            {loading ? (
                <ActivityIndicator color={colors.primary} style={{ marginTop: 48 }} />
            ) : (
                <ScrollView
                    style={styles.scroll}
                    contentContainerStyle={styles.scrollContent}
                    showsVerticalScrollIndicator={false}
                >
                    {/* ── Informations de contact ── */}
                    <View style={styles.section}>
                        <Text style={styles.sectionTitle}>INFORMATIONS</Text>
                        <View style={styles.infoCard}>
                            {!!params.phone && (
                                <View style={styles.infoRow}>
                                    <View style={[styles.infoIcon, { backgroundColor: '#dbeafe' }]}>
                                        <Phone color="#1e40af" size={16} />
                                    </View>
                                    <View>
                                        <Text style={styles.infoLabel}>Téléphone</Text>
                                        <Text style={styles.infoValue}>{params.phone}</Text>
                                    </View>
                                </View>
                            )}
                            {!!params.address && (
                                <View style={styles.infoRow}>
                                    <View style={[styles.infoIcon, { backgroundColor: '#ede9fe' }]}>
                                        <MapPin color="#5b21b6" size={16} />
                                    </View>
                                    <View>
                                        <Text style={styles.infoLabel}>Adresse</Text>
                                        <Text style={styles.infoValue}>{params.address}</Text>
                                    </View>
                                </View>
                            )}
                            <View style={styles.infoRow}>
                                <View style={[styles.infoIcon, { backgroundColor: '#fef3c7' }]}>
                                    <Calendar color="#92400e" size={16} />
                                </View>
                                <View>
                                    <Text style={styles.infoLabel}>Membre depuis</Text>
                                    <Text style={styles.infoValue}>
                                        {params.created_at
                                            ? new Date(params.created_at).toLocaleDateString('fr-FR', {
                                                day: '2-digit', month: 'long', year: 'numeric',
                                            })
                                            : '–'}
                                    </Text>
                                </View>
                            </View>
                        </View>
                    </View>

                    {/* ── KPI Commandes ── */}
                    <View style={styles.section}>
                        <Text style={styles.sectionTitle}>ACTIVITÉ B2B — COMMANDES</Text>
                        <View style={styles.kpiGrid}>
                            <View style={[styles.kpiCard, { borderTopColor: colors.primary }]}>
                                <ShoppingBag color={colors.primary} size={20} />
                                <Text style={styles.kpiVal}>{totalCommandes}</Text>
                                <Text style={styles.kpiLbl}>Total reçues</Text>
                            </View>
                            <View style={[styles.kpiCard, { borderTopColor: '#059669' }]}>
                                <CheckCircle color="#059669" size={20} />
                                <Text style={[styles.kpiVal, { color: '#059669' }]}>{commandesLivrees}</Text>
                                <Text style={styles.kpiLbl}>Livrées</Text>
                            </View>
                            <View style={[styles.kpiCard, { borderTopColor: '#2563eb' }]}>
                                <Clock color="#2563eb" size={20} />
                                <Text style={[styles.kpiVal, { color: '#2563eb' }]}>{commandesEnCours}</Text>
                                <Text style={styles.kpiLbl}>En cours</Text>
                            </View>
                            <View style={[styles.kpiCard, { borderTopColor: '#dc2626' }]}>
                                <XCircle color="#dc2626" size={20} />
                                <Text style={[styles.kpiVal, { color: '#dc2626' }]}>{commandesAnnulees}</Text>
                                <Text style={styles.kpiLbl}>Annulées</Text>
                            </View>
                        </View>
                    </View>

                    {/* ── Revenu B2B ── */}
                    <View style={styles.revenueCard}>
                        <View>
                            <Text style={styles.revenueLabel}>REVENU B2B TOTAL</Text>
                            <Text style={styles.revenueVal}>{formatMoney(revenuB2B)} F</Text>
                            <Text style={styles.revenueNote}>Commandes livrées uniquement</Text>
                        </View>
                        <View style={styles.ratePill}>
                            <TrendingUp color="#fff" size={16} />
                            <Text style={styles.ratePillText}>{tauxLivraison}% livré</Text>
                        </View>
                    </View>

                    {/* ── Produits publiés ── */}
                    <View style={styles.section}>
                        <View style={styles.sectionRow}>
                            <Text style={styles.sectionTitle}>CATALOGUE PRODUITS</Text>
                            <Text style={styles.sectionBadge}>{totalProduits} produit{totalProduits !== 1 ? 's' : ''}</Text>
                        </View>

                        {totalProduits === 0 ? (
                            <View style={styles.emptyCard}>
                                <Package color={colors.slate300} size={32} />
                                <Text style={styles.emptyText}>AUCUN PRODUIT PUBLIÉ</Text>
                            </View>
                        ) : (
                            <>
                                {/* Résumé stock */}
                                <View style={styles.stockSummary}>
                                    <View style={styles.stockItem}>
                                        <Text style={styles.stockVal}>{totalProduits}</Text>
                                        <Text style={styles.stockLbl}>Références</Text>
                                    </View>
                                    <View style={styles.stockDivider} />
                                    <View style={styles.stockItem}>
                                        <Text style={[styles.stockVal, { color: stockTotal > 0 ? '#059669' : '#dc2626' }]}>
                                            {stockTotal}
                                        </Text>
                                        <Text style={styles.stockLbl}>Unités en stock</Text>
                                    </View>
                                    <View style={styles.stockDivider} />
                                    <View style={styles.stockItem}>
                                        <Text style={[styles.stockVal, { color: '#7c3aed' }]}>
                                            {products.filter(p => p.quantity_available === 0).length}
                                        </Text>
                                        <Text style={styles.stockLbl}>Rupture</Text>
                                    </View>
                                </View>

                                {/* Liste produits */}
                                {products.map(product => (
                                    <View key={product.id} style={styles.productRow}>
                                        <View style={styles.productLeft}>
                                            <Text style={styles.productName} numberOfLines={1}>
                                                {product.name}
                                            </Text>
                                            <Text style={styles.productCat}>
                                                {product.category ?? 'Non catégorisé'}
                                            </Text>
                                        </View>
                                        <View style={styles.productRight}>
                                            <Text style={styles.productPrice}>
                                                {Number(product.price).toLocaleString('fr-FR')} F
                                            </Text>
                                            <View style={[
                                                styles.stockBadge,
                                                { backgroundColor: product.quantity_available > 0 ? '#d1fae5' : '#fee2e2' },
                                            ]}>
                                                <Text style={[
                                                    styles.stockBadgeText,
                                                    { color: product.quantity_available > 0 ? '#065f46' : '#991b1b' },
                                                ]}>
                                                    {product.quantity_available > 0
                                                        ? `${product.quantity_available} u`
                                                        : 'Rupture'}
                                                </Text>
                                            </View>
                                        </View>
                                    </View>
                                ))}
                            </>
                        )}
                    </View>
                </ScrollView>
            )}
        </View>
    );
}

// ── Styles ─────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.bgSecondary },

    // Hero (dans header)
    heroRow:       { flexDirection: 'row', alignItems: 'center', gap: 14 },
    heroAvatar:    { width: 52, height: 52, borderRadius: 12, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
    heroInitials:  { fontSize: 18, fontWeight: '900', color: '#fff' },
    heroInfo:      { flex: 1 },
    heroName:      { fontSize: 16, fontWeight: '900', color: '#fff' },
    heroStorePill: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 },
    heroStoreName: { fontSize: 11, color: 'rgba(255,255,255,0.8)', fontWeight: '600' },
    heroRate:      { alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 10, padding: 10 },
    heroRateVal:   { fontSize: 20, fontWeight: '900', color: '#fff' },
    heroRateLbl:   { fontSize: 11, fontWeight: '700', color: 'rgba(255,255,255,0.7)', letterSpacing: 1, marginTop: 2 },

    scroll:        { flex: 1 },
    scrollContent: { paddingHorizontal: 16, paddingTop: 20, paddingBottom: 48, gap: 16 },

    // Section
    section:     { gap: 10 },
    sectionRow:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    sectionTitle:{ fontSize: 11, fontWeight: '900', color: colors.slate400, letterSpacing: 2 },
    sectionBadge:{ fontSize: 11, fontWeight: '700', color: colors.primary, backgroundColor: '#ecfdf5', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },

    // Info contact
    infoCard: {
        backgroundColor: colors.white, borderRadius: 10, padding: 16,
        gap: 14, borderWidth: 1, borderColor: colors.slate100,
        shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.04, shadowRadius: 4, elevation: 1,
    },
    infoRow:   { flexDirection: 'row', alignItems: 'center', gap: 12 },
    infoIcon:  { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
    infoLabel: { fontSize: 11, fontWeight: '700', color: colors.slate400, letterSpacing: 1 },
    infoValue: { fontSize: 13, fontWeight: '700', color: colors.slate800, marginTop: 2 },

    // KPI grid
    kpiGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    kpiCard: {
        width: '47.5%',
        backgroundColor: colors.white, borderRadius: 10, padding: 14,
        alignItems: 'center', gap: 6,
        borderTopWidth: 3, borderWidth: 1, borderColor: colors.slate100,
        shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.04, shadowRadius: 4, elevation: 1,
    },
    kpiVal: { fontSize: 24, fontWeight: '900', color: colors.primary },
    kpiLbl: { fontSize: 11, fontWeight: '700', color: colors.slate400, textAlign: 'center', letterSpacing: 0.5 },

    // Revenu card
    revenueCard: {
        backgroundColor: colors.primary, borderRadius: 10, padding: 20,
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    },
    revenueLabel: { fontSize: 11, fontWeight: '900', color: 'rgba(255,255,255,0.7)', letterSpacing: 1.5, marginBottom: 4 },
    revenueVal:   { fontSize: 28, fontWeight: '900', color: '#fff' },
    revenueNote:  { fontSize: 11, color: 'rgba(255,255,255,0.6)', marginTop: 4 },
    ratePill:     { backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 10, padding: 12, alignItems: 'center', gap: 6 },
    ratePillText: { fontSize: 11, fontWeight: '900', color: '#fff' },

    // Stock summary
    stockSummary: {
        flexDirection: 'row', backgroundColor: colors.white, borderRadius: 10,
        padding: 16, borderWidth: 1, borderColor: colors.slate100,
    },
    stockItem:   { flex: 1, alignItems: 'center' },
    stockDivider:{ width: 1, backgroundColor: colors.slate200, marginHorizontal: 8 },
    stockVal:    { fontSize: 20, fontWeight: '900', color: colors.primary },
    stockLbl:    { fontSize: 11, fontWeight: '700', color: colors.slate400, marginTop: 2, textAlign: 'center', letterSpacing: 0.5 },

    // Liste produits
    productRow: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        backgroundColor: colors.white, borderRadius: 10, padding: 14,
        borderWidth: 1, borderColor: colors.slate100,
    },
    productLeft:  { flex: 1, marginRight: 12 },
    productName:  { fontSize: 13, fontWeight: '700', color: colors.slate800 },
    productCat:   { fontSize: 11, color: colors.slate400, marginTop: 2 },
    productRight: { alignItems: 'flex-end', gap: 4 },
    productPrice: { fontSize: 13, fontWeight: '900', color: colors.slate800 },
    stockBadge:   { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
    stockBadgeText:{ fontSize: 11, fontWeight: '700' },

    // Empty
    emptyCard: {
        backgroundColor: colors.white, borderRadius: 10, padding: 40,
        alignItems: 'center', gap: 12,
        borderWidth: 2, borderColor: colors.slate100, borderStyle: 'dashed',
    },
    emptyText: { fontSize: 11, fontWeight: '900', color: colors.slate300, letterSpacing: 2 },
});
