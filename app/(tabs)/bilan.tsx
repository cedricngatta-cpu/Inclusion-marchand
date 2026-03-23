// Écran Bilan — migré depuis Next.js /bilan/page.tsx
import React, { useState, useCallback, useMemo } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Alert, Platform, useWindowDimensions } from 'react-native';
import { Wallet, TrendingUp, RotateCcw, ShoppingBag, Package, Smartphone } from 'lucide-react-native';
import { useHistoryContext } from '@/src/context/HistoryContext';
import { useProductContext } from '@/src/context/ProductContext';
import { useStockContext } from '@/src/context/StockContext';
import { useAuth } from '@/src/context/AuthContext';
import { useFocusEffect, useRouter } from 'expo-router';
import { colors } from '@/src/lib/colors';
import { ScreenHeader } from '@/src/components/ui';
import TransactionCard from '@/src/components/TransactionCard';

export default function BilanScreen() {
    const router = useRouter();
    const { history, balance, clearHistory, refreshHistory } = useHistoryContext();
    const { products, refreshProducts } = useProductContext();
    const { stock, refreshStock } = useStockContext();
    const { width } = useWindowDimensions();
    const isDesktop = Platform.OS === 'web' && width > 768;

    // Recharger toutes les données à chaque retour sur le bilan
    useFocusEffect(useCallback(() => {
        refreshHistory();
        refreshProducts();
        refreshStock();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []));
    const { user } = useAuth();
    const [showBalance, setShowBalance] = useState(true);

    const stats = useMemo(() => {
        const today = new Date().setHours(0, 0, 0, 0);
        const todayTx = history.filter(t => t.timestamp >= today);
        const todaySales = todayTx.filter(t => t.type === 'VENTE' && t.status !== 'DETTE').reduce((acc, t) => acc + t.price, 0);
        const todayDebts = history.filter(t => t.status === 'DETTE').reduce((acc, t) => acc + t.price, 0);
        const stockValue = products.reduce((acc, p) => acc + p.price * (stock[p.id] || 0), 0);

        // Répartition Mobile Money — single pass
        let momoTotal = 0;
        let cashTotal = 0;
        const momoByOp = { ORANGE: 0, MTN: 0, WAVE: 0, MOOV: 0 };
        for (const t of history) {
            if (t.status === 'MOMO') {
                momoTotal += t.price;
                if (t.operator && t.operator in momoByOp) {
                    momoByOp[t.operator as keyof typeof momoByOp] += t.price;
                }
            } else if (t.status === 'PAYÉ') {
                cashTotal += t.price;
            }
        }

        return { todaySales, todayDebts, stockValue, momoTotal, momoByOp, cashTotal };
    }, [history, products, stock]);

    const { todaySales, todayDebts, stockValue, momoTotal, momoByOp, cashTotal } = stats;

    const handleReset = () => {
        Alert.alert(
            'Remettre à zéro ?',
            'Cela supprimera tout l\'historique local. Cette action est irréversible.',
            [
                { text: 'Annuler', style: 'cancel' },
                { text: 'Réinitialiser', style: 'destructive', onPress: clearHistory },
            ]
        );
    };

    const STATS = [
        { label: 'VENTES DU JOUR', value: todaySales, color: colors.primary, icon: TrendingUp, bg: '#ecfdf5' },
        { label: 'DETTES EN COURS', value: todayDebts, color: '#f97316', icon: ShoppingBag, bg: '#fff7ed' },
        { label: 'VALEUR STOCK', value: stockValue, color: '#2563eb', icon: Package, bg: '#eff6ff' },
        { label: 'CAISSE TOTALE', value: balance, color: colors.primary, icon: Wallet, bg: '#ecfdf5' },
        { label: 'MOBILE MONEY', value: momoTotal, color: '#0891b2', icon: Smartphone, bg: '#e0f2fe' },
        { label: 'ESPÈCES', value: cashTotal, color: colors.primary, icon: Wallet, bg: colors.primaryBg },
    ];

    return (
        <View style={styles.safe}>
            <ScreenHeader
                title="Bilan"
                subtitle="Tableau de bord financier"
                showBack={true}
                showEye={true}
                eyeVisible={showBalance}
                onEyeToggle={() => setShowBalance(v => !v)}
                paddingBottom={24}
            >
                <View style={styles.balanceBox}>
                    <Text style={styles.balanceLabel}>CAISSE GLOBALE</Text>
                    <Text style={styles.balanceAmount}>
                        {showBalance ? balance.toLocaleString('fr-FR') : '••••••'} <Text style={styles.balanceCurrency}>F</Text>
                    </Text>
                    <Text style={styles.balanceName}>Bonjour, {user?.name?.split(' ')[0]}</Text>
                </View>
            </ScreenHeader>

            <ScrollView style={styles.body} contentContainerStyle={[{ padding: 16, gap: 16, paddingBottom: 40 }, isDesktop && dtBl.content]} showsVerticalScrollIndicator={false}>
                {/* Grille stats */}
                <View style={[styles.statsGrid, isDesktop && dtBl.statsGrid]}>
                    {STATS.map(stat => (
                        <View key={stat.label} style={[styles.statCard, isDesktop && dtBl.statCard, { backgroundColor: stat.bg }]}>
                            <View style={[styles.statIconBox, { backgroundColor: stat.bg }]}>
                                <stat.icon color={stat.color} size={22} />
                            </View>
                            <Text style={[styles.statValue, isDesktop && dtBl.statValue, { color: stat.color }]}>
                                {showBalance ? stat.value.toLocaleString() : '•••'} F
                            </Text>
                            <Text style={styles.statLabel}>{stat.label}</Text>
                        </View>
                    ))}
                </View>

                {/* LIGNE 2 desktop — MoMo + Historique côte à côte */}
                <View style={isDesktop ? dtBl.row : undefined}>
                    {/* Répartition Mobile Money */}
                    {momoTotal > 0 && (
                        <View style={[styles.momoCard, isDesktop && dtBl.card]}>
                            <Text style={styles.momoTitle}>RÉPARTITION MOBILE MONEY</Text>
                            {([
                                { key: 'ORANGE', label: 'Orange Money', color: '#FF6600', bg: '#FFF3E6' },
                                { key: 'MTN',    label: 'MTN MoMo',    color: '#996600', bg: '#FFFDE6' },
                                { key: 'WAVE',   label: 'Wave',         color: '#0A8FA8', bg: '#E6F9FC' },
                                { key: 'MOOV',   label: 'Moov Money',  color: '#0066CC', bg: '#E6F0FF' },
                            ] as const).map(op => {
                                const val = momoByOp[op.key];
                                if (val === 0) return null;
                                const pct = momoTotal > 0 ? Math.round((val / momoTotal) * 100) : 0;
                                return (
                                    <View key={op.key} style={styles.momoRow}>
                                        <View style={[styles.momoOpBadge, { backgroundColor: op.bg }]}>
                                            <Text style={[styles.momoOpText, { color: op.color }]}>{op.label}</Text>
                                        </View>
                                        <View style={styles.momoBar}>
                                            <View style={[styles.momoBarFill, { width: `${pct}%` as any, backgroundColor: op.color }]} />
                                        </View>
                                        <Text style={[styles.momoVal, { color: op.color }]}>{val.toLocaleString()} F</Text>
                                    </View>
                                );
                            })}
                        </View>
                    )}

                    {/* Historique */}
                    <View style={[styles.historyCard, isDesktop && dtBl.card]}>
                        <View style={styles.historyHeader}>
                            <Text style={styles.historyTitle}>HISTORIQUE RÉCENT</Text>
                            <Text style={styles.historyCount}>{history.length} transactions</Text>
                        </View>
                        {history.slice(0, isDesktop ? 15 : 10).map((t, i, arr) => (
                            <TransactionCard
                                key={t.id}
                                transaction={t}
                                showBorder={i < arr.length - 1}
                            />
                        ))}
                        {history.length === 0 && (
                            <View style={styles.empty}>
                                <Text style={styles.emptyText}>AUCUNE TRANSACTION</Text>
                            </View>
                        )}
                    </View>
                </View>

                {/* Bouton Reset */}
                <TouchableOpacity style={[styles.resetBtn, isDesktop && dtBl.resetBtn]} onPress={handleReset}>
                    <RotateCcw color={colors.error} size={16} />
                    <Text style={styles.resetBtnText}>REMETTRE À ZÉRO</Text>
                </TouchableOpacity>
            </ScrollView>
        </View>
    );
}

const styles = StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.bgSecondary },
    balanceBox: { alignItems: 'center', paddingTop: 8 },
    balanceLabel: { fontSize: 11, fontWeight: '700', color: 'rgba(255,255,255,0.7)', letterSpacing: 3, textTransform: 'uppercase', marginBottom: 8 },
    balanceAmount: { fontSize: 44, fontWeight: '900', color: colors.white, letterSpacing: -1 },
    balanceCurrency: { fontSize: 22, fontWeight: '700' },
    balanceName: { fontSize: 12, color: 'rgba(255,255,255,0.7)', marginTop: 4 },

    body: { flex: 1, backgroundColor: colors.bgSecondary },
    statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
    statCard: { width: '47%', borderRadius: 10, padding: 16, gap: 8 },
    statIconBox: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.7)' },
    statValue: { fontSize: 18, fontWeight: '900' },
    statLabel: { fontSize: 11, fontWeight: '700', color: colors.slate500, letterSpacing: 1.5, textTransform: 'uppercase' },

    historyCard: { backgroundColor: colors.white, borderRadius: 10, padding: 16, borderWidth: 1, borderColor: colors.slate100 },
    historyHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
    historyTitle: { fontSize: 11, fontWeight: '900', color: colors.slate900, letterSpacing: 1.5 },
    historyCount: { fontSize: 11, color: colors.slate400, fontWeight: '600' },

    // Section Mobile Money
    momoCard: { backgroundColor: colors.white, borderRadius: 10, padding: 16, borderWidth: 1, borderColor: colors.slate100, gap: 10 },
    momoTitle: { fontSize: 11, fontWeight: '900', color: colors.slate900, letterSpacing: 1.5, marginBottom: 4 },
    momoRow:  { flexDirection: 'row', alignItems: 'center', gap: 8 },
    momoOpBadge: { width: 110, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
    momoOpText: { fontSize: 11, fontWeight: '800' },
    momoBar:  { flex: 1, height: 6, backgroundColor: colors.slate100, borderRadius: 3, overflow: 'hidden' },
    momoBarFill: { height: '100%', borderRadius: 3 },
    momoVal:  { fontSize: 12, fontWeight: '900', minWidth: 70, textAlign: 'right' },

    empty: { alignItems: 'center', paddingVertical: 24 },
    emptyText: { fontSize: 11, fontWeight: '700', color: colors.slate400, letterSpacing: 2 },

    resetBtn: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
        paddingVertical: 14, borderRadius: 10,
        borderWidth: 2, borderColor: '#fecaca', backgroundColor: '#fff1f2',
    },
    resetBtnText: { fontSize: 12, fontWeight: '900', color: colors.error, letterSpacing: 1 },
});

// ── Styles desktop ─────────────────────────────────────────────────
const dtBl = StyleSheet.create({
    content: {
        maxWidth: 1400, alignSelf: 'center', width: '100%',
        padding: 32, gap: 24,
    },
    statsGrid: { flexDirection: 'row', gap: 20 },
    statCard: {
        flex: 1, width: 'auto',
        borderRadius: 12, padding: 20,
        shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.06, shadowRadius: 10, elevation: 3,
    },
    statValue: { fontSize: 22 },
    row: { flexDirection: 'row', gap: 20 },
    card: {
        flex: 1,
        borderWidth: 0,
        borderRadius: 12,
        shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.06, shadowRadius: 12, elevation: 3,
    },
    resetBtn: { maxWidth: 300, alignSelf: 'center' },
});
