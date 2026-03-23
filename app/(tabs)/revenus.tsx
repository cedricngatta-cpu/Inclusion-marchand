// Revenus du marchand — adapté depuis Next.js /producteur/revenus/page.tsx
// Utilise HistoryContext (transactions VENTE) au lieu de la table orders producteur
import React, { useState, useMemo, useCallback, useRef } from 'react';
import {
    View, Text, ScrollView, StyleSheet, TouchableOpacity,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import { ChevronLeft, ChevronRight, TrendingUp } from 'lucide-react-native';
import { ScreenHeader } from '@/src/components/ui';
import { useHistoryContext } from '@/src/context/HistoryContext';
import { colors } from '@/src/lib/colors';
import TransactionCard from '@/src/components/TransactionCard';

const monthLabel = (year: number, month: number) =>
    new Date(year, month).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });

export default function RevenusScreen() {
    const { history, refreshHistory } = useHistoryContext();
    const lastRefresh = useRef(0);

    // Rafraîchir uniquement si les données ont plus de 30 secondes
    useFocusEffect(useCallback(() => {
        const now = Date.now();
        if (now - lastRefresh.current > 30_000) {
            lastRefresh.current = now;
            refreshHistory();
        }
    }, [refreshHistory]));

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
        <View style={styles.safe}>
            <ScreenHeader
                title="Revenus"
                subtitle="Historique des ventes"
                showBack={true}
                paddingBottom={24}
            >
                {/* Sélecteur de mois */}
                <View style={styles.monthRow}>
                    <TouchableOpacity style={styles.monthBtn} onPress={prevMonth} activeOpacity={0.8}>
                        <ChevronLeft color={colors.primary} size={18} strokeWidth={2.5} />
                    </TouchableOpacity>
                    <Text style={styles.monthLabel}>{monthLabel(year, month)}</Text>
                    <TouchableOpacity
                        style={[styles.monthBtn, isCurrentMonth && styles.monthBtnDisabled]}
                        onPress={nextMonth}
                        disabled={isCurrentMonth}
                        activeOpacity={0.8}
                    >
                        <ChevronRight color={isCurrentMonth ? colors.slate300 : colors.primary} size={18} strokeWidth={2.5} />
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
            </ScreenHeader>

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
                        <View>
                            {monthSales.map((t, i) => (
                                <TransactionCard
                                    key={t.id}
                                    transaction={t}
                                    showBorder={i < monthSales.length - 1}
                                />
                            ))}
                        </View>
                    )}
                </View>
            </ScrollView>
        </View>
    );
}

const styles = StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.bgSecondary },

    monthRow:        { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 16 },
    monthBtn:        { width: 36, height: 36, borderRadius: 8, backgroundColor: colors.white, alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.1, shadowRadius: 2, elevation: 2 },
    monthBtnDisabled: { opacity: 0.35 },
    monthLabel:      { fontSize: 11, fontWeight: '700', color: '#d1fae5', letterSpacing: 2, minWidth: 140, textAlign: 'center', textTransform: 'uppercase' },

    kpiBlock:      { alignItems: 'center' },
    kpiLabelRow:   { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
    kpiLabel:      { fontSize: 11, fontWeight: '700', color: 'rgba(255,255,255,0.7)', letterSpacing: 3 },
    kpiAmountRow:  { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
    kpiAmount:     { fontSize: 48, fontWeight: '900', color: colors.white, letterSpacing: -2, lineHeight: 56 },
    kpiCurrency:   { fontSize: 22, fontWeight: '700', color: 'rgba(255,255,255,0.7)' },
    kpiSub:        { fontSize: 11, fontWeight: '700', color: 'rgba(255,255,255,0.5)', letterSpacing: 2, marginTop: 4 },

    scroll:        { flex: 1 },
    scrollContent: { paddingHorizontal: 16, paddingTop: 20, paddingBottom: 40, gap: 14 },

    card: {
        backgroundColor: colors.white, borderRadius: 10, padding: 20,
        borderWidth: 1, borderColor: colors.slate100,
        shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.06, shadowRadius: 8, elevation: 3,
    },
    cardTitle: { fontSize: 11, fontWeight: '900', color: colors.slate900, letterSpacing: 2, marginBottom: 16 },

    // ── Produits ──
    productList: { gap: 14 },
    productRow:  {},
    productHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 },
    productName:   { fontSize: 12, fontWeight: '700', color: colors.slate700, flex: 1, marginRight: 8 },
    productAmounts: { flexDirection: 'row', alignItems: 'baseline', gap: 6, flexShrink: 0 },
    productTotal:  { fontSize: 12, fontWeight: '900', color: colors.slate800 },
    productQty:    { fontSize: 11, color: colors.slate400 },
    progressBar:   { height: 6, backgroundColor: colors.slate100, borderRadius: 3, overflow: 'hidden' },
    progressFill:  { height: 6, backgroundColor: colors.primary, borderRadius: 3 },

    // ── Ventes ──
    empty: { alignItems: 'center', paddingVertical: 32, gap: 8 },
    emptyText: { fontSize: 11, fontWeight: '700', color: colors.slate300, letterSpacing: 2 },
});
