// Revenus du marchand — adapté depuis Next.js /producteur/revenus/page.tsx
// Utilise HistoryContext (transactions VENTE) au lieu de la table orders producteur
import React, { useState, useMemo, useCallback } from 'react';
import {
    View, Text, ScrollView, StyleSheet, TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { ChevronLeft, ChevronRight, TrendingUp, ShoppingBag } from 'lucide-react-native';
import { useHistoryContext } from '@/src/context/HistoryContext';
import { colors } from '@/src/lib/colors';

const monthLabel = (year: number, month: number) =>
    new Date(year, month).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });

const statusColor = (status?: string) => {
    if (status === 'MOMO') return { bg: '#dbeafe', text: '#1d4ed8' };
    if (status === 'DETTE') return { bg: '#fef3c7', text: '#92400e' };
    return { bg: '#d1fae5', text: '#065f46' };
};

const statusLabel = (status?: string) => {
    if (status === 'MOMO') return 'MoMo';
    if (status === 'DETTE') return 'Crédit';
    return 'Espèces';
};

export default function RevenusScreen() {
    const router = useRouter();
    const { history, refreshHistory } = useHistoryContext();

    useFocusEffect(useCallback(() => { refreshHistory(); }, [refreshHistory]));

    const now = new Date();
    const [year, setYear]   = useState(now.getFullYear());
    const [month, setMonth] = useState(now.getMonth());

    const isCurrentMonth = year === now.getFullYear() && month === now.getMonth();

    const prevMonth = () => {
        if (month === 0) { setMonth(11); setYear(y => y - 1); }
        else setMonth(m => m - 1);
    };
    const nextMonth = () => {
        if (isCurrentMonth) return;
        if (month === 11) { setMonth(0); setYear(y => y + 1); }
        else setMonth(m => m + 1);
    };

    // ── Filtrer les ventes du mois ──
    const monthSales = useMemo(() => {
        return history.filter(t => {
            if (t.type !== 'VENTE') return false;
            const d = new Date(t.timestamp);
            return d.getFullYear() === year && d.getMonth() === month;
        }).sort((a, b) => b.timestamp - a.timestamp);
    }, [history, year, month]);

    const revenue    = monthSales.reduce((acc, t) => t.status !== 'DETTE' ? acc + t.price : acc, 0);
    const saleCount  = monthSales.length;

    // ── Agrégation par produit ──
    const byProduct = useMemo(() => {
        return Object.values(monthSales.reduce<Record<string, { name: string; qty: number; total: number }>>((acc, t) => {
            if (!acc[t.productId]) acc[t.productId] = { name: t.productName, qty: 0, total: 0 };
            acc[t.productId].qty   += t.quantity;
            acc[t.productId].total += t.status !== 'DETTE' ? t.price : 0;
            return acc;
        }, {})).sort((a, b) => b.total - a.total);
    }, [monthSales]);

    return (
        <SafeAreaView style={styles.safe} edges={['top']}>
            {/* ── HEADER ── */}
            <View style={styles.header}>
                <View style={styles.headerTop}>
                    <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
                        <ChevronLeft color={colors.white} size={20} />
                    </TouchableOpacity>
                    <View style={styles.headerTitleBlock}>
                        <Text style={styles.headerTitle}>REVENUS</Text>
                        <Text style={styles.headerSub}>HISTORIQUE DES VENTES</Text>
                    </View>
                    <View style={{ width: 40 }} />
                </View>

                {/* Sélecteur de mois */}
                <View style={styles.monthRow}>
                    <TouchableOpacity style={styles.monthBtn} onPress={prevMonth}>
                        <ChevronLeft color={colors.white} size={16} />
                    </TouchableOpacity>
                    <Text style={styles.monthLabel}>{monthLabel(year, month)}</Text>
                    <TouchableOpacity
                        style={[styles.monthBtn, isCurrentMonth && styles.monthBtnDisabled]}
                        onPress={nextMonth}
                        disabled={isCurrentMonth}
                    >
                        <ChevronRight color={isCurrentMonth ? 'rgba(255,255,255,0.3)' : colors.white} size={16} />
                    </TouchableOpacity>
                </View>

                {/* KPI */}
                <View style={styles.kpiBlock}>
                    <View style={styles.kpiLabelRow}>
                        <TrendingUp color="rgba(255,255,255,0.7)" size={14} />
                        <Text style={styles.kpiLabel}>CHIFFRE D'AFFAIRES</Text>
                    </View>
                    <View style={styles.kpiAmountRow}>
                        <Text style={styles.kpiAmount}>{revenue.toLocaleString('fr-FR')}</Text>
                        <Text style={styles.kpiCurrency}>F</Text>
                    </View>
                    <Text style={styles.kpiSub}>
                        {saleCount} vente{saleCount !== 1 ? 's' : ''} ce mois
                    </Text>
                </View>
            </View>

            <ScrollView
                style={styles.scroll}
                contentContainerStyle={styles.scrollContent}
                showsVerticalScrollIndicator={false}
            >
                {/* ── Résumé par produit ── */}
                {byProduct.length > 0 && (
                    <View style={styles.card}>
                        <Text style={styles.cardTitle}>PAR PRODUIT</Text>
                        <View style={styles.productList}>
                            {byProduct.map(p => {
                                const pct = revenue > 0 ? (p.total / revenue) * 100 : 0;
                                return (
                                    <View key={p.name} style={styles.productRow}>
                                        <View style={styles.productHeader}>
                                            <Text style={styles.productName} numberOfLines={1}>{p.name}</Text>
                                            <View style={styles.productAmounts}>
                                                <Text style={styles.productTotal}>{p.total.toLocaleString('fr-FR')} F</Text>
                                                <Text style={styles.productQty}>{p.qty} u</Text>
                                            </View>
                                        </View>
                                        {/* Barre de progression */}
                                        <View style={styles.progressBar}>
                                            <View style={[styles.progressFill, { width: `${pct}%` }]} />
                                        </View>
                                    </View>
                                );
                            })}
                        </View>
                    </View>
                )}

                {/* ── Liste des ventes ── */}
                <View style={styles.card}>
                    <Text style={styles.cardTitle}>DÉTAIL DES VENTES</Text>

                    {monthSales.length === 0 ? (
                        <View style={styles.empty}>
                            <TrendingUp color={colors.slate200} size={32} />
                            <Text style={styles.emptyText}>AUCUN REVENU CE MOIS</Text>
                        </View>
                    ) : (
                        <View style={styles.saleList}>
                            {monthSales.map((t, i) => {
                                const sc = statusColor(t.status);
                                return (
                                    <View key={t.id} style={[styles.saleRow, i > 0 && styles.saleRowBorder]}>
                                        <View style={styles.saleIcon}>
                                            <ShoppingBag color={colors.primary} size={15} />
                                        </View>
                                        <View style={styles.saleInfo}>
                                            <Text style={styles.saleName} numberOfLines={1}>{t.productName}</Text>
                                            <Text style={styles.saleMeta}>
                                                {t.clientName && t.clientName !== 'Client standard' ? t.clientName + ' · ' : ''}
                                                {t.quantity} u · {new Date(t.timestamp).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' })}
                                            </Text>
                                        </View>
                                        <View style={styles.saleRight}>
                                            <Text style={styles.saleAmount}>{t.price.toLocaleString('fr-FR')} F</Text>
                                            <View style={[styles.statusBadge, { backgroundColor: sc.bg }]}>
                                                <Text style={[styles.statusText, { color: sc.text }]}>{statusLabel(t.status)}</Text>
                                            </View>
                                        </View>
                                    </View>
                                );
                            })}
                        </View>
                    )}
                </View>
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
    headerTitle: { fontSize: 16, fontWeight: '900', color: colors.white, letterSpacing: 1 },
    headerSub:   { fontSize: 9, fontWeight: '700', color: 'rgba(255,255,255,0.7)', letterSpacing: 3, marginTop: 2 },

    monthRow:        { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 16 },
    monthBtn:        { width: 32, height: 32, borderRadius: 8, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' },
    monthBtnDisabled: { opacity: 0.4 },
    monthLabel:      { fontSize: 11, fontWeight: '700', color: '#d1fae5', letterSpacing: 2, minWidth: 140, textAlign: 'center', textTransform: 'uppercase' },

    kpiBlock:      { alignItems: 'center' },
    kpiLabelRow:   { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
    kpiLabel:      { fontSize: 10, fontWeight: '700', color: 'rgba(255,255,255,0.7)', letterSpacing: 3 },
    kpiAmountRow:  { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
    kpiAmount:     { fontSize: 48, fontWeight: '900', color: colors.white, letterSpacing: -2, lineHeight: 56 },
    kpiCurrency:   { fontSize: 22, fontWeight: '700', color: 'rgba(255,255,255,0.7)' },
    kpiSub:        { fontSize: 10, fontWeight: '700', color: 'rgba(255,255,255,0.5)', letterSpacing: 2, marginTop: 4 },

    scroll:        { flex: 1 },
    scrollContent: { paddingHorizontal: 16, paddingTop: 20, paddingBottom: 40, gap: 14 },

    card: {
        backgroundColor: colors.white, borderRadius: 10, padding: 20,
        borderWidth: 1, borderColor: colors.slate100,
        shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.06, shadowRadius: 8, elevation: 3,
    },
    cardTitle: { fontSize: 10, fontWeight: '900', color: colors.slate900, letterSpacing: 2, marginBottom: 16 },

    // ── Produits ──
    productList: { gap: 14 },
    productRow:  {},
    productHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 },
    productName:   { fontSize: 12, fontWeight: '700', color: colors.slate700, flex: 1, marginRight: 8 },
    productAmounts: { flexDirection: 'row', alignItems: 'baseline', gap: 6, flexShrink: 0 },
    productTotal:  { fontSize: 12, fontWeight: '900', color: colors.slate800 },
    productQty:    { fontSize: 10, color: colors.slate400 },
    progressBar:   { height: 6, backgroundColor: colors.slate100, borderRadius: 3, overflow: 'hidden' },
    progressFill:  { height: 6, backgroundColor: colors.primary, borderRadius: 3 },

    // ── Ventes ──
    saleList: {},
    empty: { alignItems: 'center', paddingVertical: 32, gap: 8 },
    emptyText: { fontSize: 10, fontWeight: '700', color: colors.slate300, letterSpacing: 2 },

    saleRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 },
    saleRowBorder: { borderTopWidth: 1, borderTopColor: colors.slate100 },
    saleIcon: {
        width: 38, height: 38, borderRadius: 10,
        backgroundColor: '#d1fae5', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
    },
    saleInfo: { flex: 1, minWidth: 0 },
    saleName: { fontSize: 13, fontWeight: '700', color: colors.slate800 },
    saleMeta: { fontSize: 10, color: colors.slate400, marginTop: 2 },

    saleRight:  { alignItems: 'flex-end', flexShrink: 0 },
    saleAmount: { fontSize: 13, fontWeight: '900', color: colors.slate800 },
    statusBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, marginTop: 3 },
    statusText:  { fontSize: 9, fontWeight: '700' },
});
