// Revenus — Producteur
import React, { useState, useEffect, useCallback } from 'react';
import {
    View, Text, ScrollView, StyleSheet, TouchableOpacity, ActivityIndicator,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import { ChevronLeft, ChevronRight, TrendingUp, Package } from 'lucide-react-native';
import { ScreenHeader } from '@/src/components/ui';
import { supabase } from '@/src/lib/supabase';
import { colors } from '@/src/lib/colors';
import { useProfileContext } from '@/src/context/ProfileContext';

// ── Types ──────────────────────────────────────────────────────────────────────
interface RevenueOrder {
    id: string;
    status: string;
    quantity: number;
    total_amount: number;
    created_at: string;
    products: { name: string } | null;
    stores: { name: string } | null;
}

interface ProductRevenue {
    name: string;
    total: number;
    count: number;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
const MONTHS_FR = [
    'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
    'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre',
];

// ── Composant principal ────────────────────────────────────────────────────────
export default function RevenusScreen() {
    const { activeProfile } = useProfileContext();

    const now = new Date();
    const [year, setYear]   = useState(now.getFullYear());
    const [month, setMonth] = useState(now.getMonth()); // 0-indexed

    const [orders, setOrders]   = useState<RevenueOrder[]>([]);
    const [loading, setLoading] = useState(true);

    // ── Fetch ─────────────────────────────────────────────────────────────────
    const fetchRevenue = useCallback(async () => {
        if (!activeProfile) return;
        setLoading(true);
        try {
            const startOfMonth = new Date(year, month, 1).toISOString();
            const endOfMonth   = new Date(year, month + 1, 0, 23, 59, 59).toISOString();

            const { data } = await supabase
                .from('orders')
                .select('*, products(name), stores!buyer_store_id(name)')
                .eq('seller_store_id', activeProfile.id)
                .eq('status', 'DELIVERED')
                .gte('created_at', startOfMonth)
                .lte('created_at', endOfMonth)
                .order('created_at', { ascending: false });

            setOrders((data as RevenueOrder[]) || []);
        } catch (err) {
            console.error('[Revenus] fetch error:', err);
        } finally {
            setLoading(false);
        }
    }, [activeProfile, year, month]);

    useEffect(() => { fetchRevenue(); }, [fetchRevenue]);

    // Recharge à chaque retour sur l'écran
    useFocusEffect(useCallback(() => { fetchRevenue(); }, [fetchRevenue]));

    // ── Navigation mois ───────────────────────────────────────────────────────
    const prevMonth = () => {
        if (month === 0) { setMonth(11); setYear(y => y - 1); }
        else setMonth(m => m - 1);
    };
    const nextMonth = () => {
        if (month === 11) { setMonth(0); setYear(y => y + 1); }
        else setMonth(m => m + 1);
    };
    const isCurrentMonth = year === now.getFullYear() && month === now.getMonth();

    // ── Calculs ───────────────────────────────────────────────────────────────
    const totalRevenue = orders.reduce((acc, o) => {
        const amount = o.total_amount > 0 ? o.total_amount : 0;
        return acc + amount;
    }, 0);

    // Revenus par produit
    const byProduct = orders.reduce<Record<string, ProductRevenue>>((acc, o) => {
        const name   = o.products?.name ?? 'Produit inconnu';
        const amount = o.total_amount > 0 ? o.total_amount : 0;
        if (!acc[name]) acc[name] = { name, total: 0, count: 0 };
        acc[name].total += amount;
        acc[name].count += 1;
        return acc;
    }, {});

    const productList = Object.values(byProduct).sort((a, b) => b.total - a.total);
    const maxRevenue  = productList[0]?.total ?? 1;

    return (
        <View style={styles.safe}>
            <ScreenHeader title="Mes Revenus" subtitle="Commandes livrées" showBack={true} paddingBottom={24}>
                {/* Sélecteur de mois */}
                <View style={styles.monthSelector}>
                    <TouchableOpacity style={styles.monthArrow} onPress={prevMonth}>
                        <ChevronLeft color={colors.white} size={20} />
                    </TouchableOpacity>
                    <Text style={styles.monthLabel}>
                        {MONTHS_FR[month]} {year}
                    </Text>
                    <TouchableOpacity
                        style={[styles.monthArrow, isCurrentMonth && styles.monthArrowDisabled]}
                        onPress={nextMonth}
                        disabled={isCurrentMonth}
                    >
                        <ChevronRight color={isCurrentMonth ? 'rgba(255,255,255,0.3)' : colors.white} size={20} />
                    </TouchableOpacity>
                </View>

                {/* KPI */}
                <View style={styles.kpiRow}>
                    <View style={styles.kpiCard}>
                        <View style={styles.kpiIcon}>
                            <TrendingUp color={colors.white} size={16} />
                        </View>
                        <View>
                            <Text style={styles.kpiValue}>
                                {loading ? '–' : totalRevenue.toLocaleString('fr-FR')}
                            </Text>
                            <Text style={styles.kpiUnit}>F CFA ENCAISSÉS</Text>
                        </View>
                    </View>
                    <View style={styles.kpiDivider} />
                    <View style={styles.kpiCard}>
                        <View style={[styles.kpiIcon, { backgroundColor: 'rgba(255,255,255,0.15)' }]}>
                            <Package color={colors.white} size={16} />
                        </View>
                        <View>
                            <Text style={styles.kpiValue}>{loading ? '–' : orders.length}</Text>
                            <Text style={styles.kpiUnit}>COMMANDES LIVRÉES</Text>
                        </View>
                    </View>
                </View>
            </ScreenHeader>

            {/* ── CONTENU ── */}
            <ScrollView
                style={styles.scroll}
                contentContainerStyle={styles.scrollContent}
                showsVerticalScrollIndicator={false}
            >
                {loading ? (
                    <ActivityIndicator color={colors.primary} style={{ marginTop: 32 }} />
                ) : orders.length === 0 ? (
                    <View style={styles.emptyCard}>
                        <TrendingUp color={colors.slate300} size={48} />
                        <Text style={styles.emptyText}>AUCUN REVENU CE MOIS</Text>
                        <Text style={styles.emptySubText}>
                            Les revenus des commandes livrées apparaîtront ici.
                        </Text>
                    </View>
                ) : (
                    <>
                        {/* Revenus par produit */}
                        {productList.length > 0 && (
                            <>
                                <Text style={styles.sectionTitle}>REVENUS PAR PRODUIT</Text>
                                <View style={styles.productsCard}>
                                    {productList.map((p, idx) => {
                                        const pct = maxRevenue > 0 ? (p.total / maxRevenue) * 100 : 0;
                                        return (
                                            <View key={p.name} style={[styles.productRow, idx > 0 && styles.productRowBorder]}>
                                                <View style={styles.productRowTop}>
                                                    <Text style={styles.productRowName} numberOfLines={1}>{p.name}</Text>
                                                    <Text style={styles.productRowTotal}>
                                                        {p.total.toLocaleString('fr-FR')} F
                                                    </Text>
                                                </View>
                                                <View style={styles.progressBg}>
                                                    <View style={[styles.progressFill, { width: `${pct}%` }]} />
                                                </View>
                                                <Text style={styles.productRowCount}>{p.count} commande(s)</Text>
                                            </View>
                                        );
                                    })}
                                </View>
                            </>
                        )}

                        {/* Liste commandes */}
                        <Text style={styles.sectionTitle}>DÉTAIL DES COMMANDES</Text>
                        {orders.map(order => {
                            const amount = order.total_amount > 0 ? order.total_amount : 0;
                            return (
                                <View key={order.id} style={styles.orderCard}>
                                    <View style={styles.orderInfo}>
                                        <Text style={styles.orderProduct} numberOfLines={1}>
                                            {order.products?.name ?? 'Produit'}
                                        </Text>
                                        <Text style={styles.orderBuyer} numberOfLines={1}>
                                            {order.stores?.name ?? 'Acheteur'}
                                        </Text>
                                        <Text style={styles.orderMeta}>
                                            {order.quantity} unité(s) • {new Date(order.created_at).toLocaleDateString('fr-FR')}
                                        </Text>
                                    </View>
                                    <View style={styles.orderRight}>
                                        <Text style={styles.orderAmount}>
                                            {amount > 0 ? `+${amount.toLocaleString('fr-FR')} F` : '–'}
                                        </Text>
                                        <View style={styles.deliveredBadge}>
                                            <Text style={styles.deliveredBadgeText}>Livrée</Text>
                                        </View>
                                    </View>
                                </View>
                            );
                        })}
                    </>
                )}
            </ScrollView>
        </View>
    );
}

// ── Styles ─────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.bgSecondary },

    // Sélecteur mois
    monthSelector: {
        flexDirection: 'row', alignItems: 'center',
        justifyContent: 'center', gap: 16,
    },
    monthArrow: {
        width: 36, height: 36, borderRadius: 8,
        backgroundColor: 'rgba(255,255,255,0.2)',
        alignItems: 'center', justifyContent: 'center',
    },
    monthArrowDisabled: { opacity: 0.4 },
    monthLabel: { fontSize: 16, fontWeight: '900', color: colors.white, minWidth: 160, textAlign: 'center' },

    // KPI
    kpiRow: {
        flexDirection: 'row',
        backgroundColor: 'rgba(255,255,255,0.15)',
        borderRadius: 10,
        padding: 16,
        gap: 12,
    },
    kpiCard: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
    kpiDivider: { width: 1, backgroundColor: 'rgba(255,255,255,0.3)' },
    kpiIcon: {
        width: 36, height: 36, borderRadius: 8,
        backgroundColor: 'rgba(255,255,255,0.25)',
        alignItems: 'center', justifyContent: 'center',
    },
    kpiValue: { fontSize: 20, fontWeight: '900', color: colors.white, lineHeight: 24 },
    kpiUnit:  { fontSize: 11, fontWeight: '700', color: 'rgba(255,255,255,0.7)', letterSpacing: 1, marginTop: 2 },

    // Scroll
    scroll:        { flex: 1 },
    scrollContent: { paddingHorizontal: 16, paddingTop: 20, paddingBottom: 40, gap: 12 },

    // Section
    sectionTitle: { fontSize: 11, fontWeight: '900', color: colors.slate400, letterSpacing: 2 },

    // Produits card
    productsCard: {
        backgroundColor: colors.white,
        borderRadius: 10,
        padding: 16,
        borderWidth: 1,
        borderColor: colors.slate100,
        gap: 12,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.05,
        shadowRadius: 4,
        elevation: 2,
    },
    productRow:       { gap: 6 },
    productRowBorder: { borderTopWidth: 1, borderTopColor: colors.slate100, paddingTop: 12 },
    productRowTop:    { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    productRowName:   { fontSize: 13, fontWeight: '700', color: colors.slate800, flex: 1, marginRight: 8 },
    productRowTotal:  { fontSize: 13, fontWeight: '900', color: colors.primary, flexShrink: 0 },
    progressBg: {
        height: 6, backgroundColor: colors.slate100,
        borderRadius: 3, overflow: 'hidden',
    },
    progressFill: { height: 6, backgroundColor: colors.primary, borderRadius: 3 },
    productRowCount: { fontSize: 11, fontWeight: '600', color: colors.slate400 },

    // Order card
    orderCard: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: colors.white,
        borderRadius: 10,
        padding: 14,
        borderWidth: 1,
        borderColor: colors.slate100,
        gap: 10,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.04,
        shadowRadius: 4,
        elevation: 1,
    },
    orderInfo:    { flex: 1, minWidth: 0 },
    orderProduct: { fontSize: 13, fontWeight: '700', color: colors.slate800 },
    orderBuyer:   { fontSize: 11, fontWeight: '600', color: colors.slate500, marginTop: 2 },
    orderMeta:    { fontSize: 11, color: colors.slate400, marginTop: 2 },
    orderRight:   { alignItems: 'flex-end', gap: 4, flexShrink: 0 },
    orderAmount:  { fontSize: 14, fontWeight: '900', color: colors.primary },

    deliveredBadge:     { backgroundColor: '#f0fdf4', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
    deliveredBadgeText: { fontSize: 11, fontWeight: '700', color: '#166534' },

    // Empty
    emptyCard: {
        backgroundColor: colors.white, borderRadius: 10, padding: 48,
        alignItems: 'center', borderWidth: 2, borderColor: colors.slate100,
        borderStyle: 'dashed', gap: 12,
    },
    emptyText:    { fontSize: 11, fontWeight: '900', color: colors.slate300, letterSpacing: 2, textAlign: 'center' },
    emptySubText: { fontSize: 12, fontWeight: '500', color: colors.slate400, textAlign: 'center' },
});
