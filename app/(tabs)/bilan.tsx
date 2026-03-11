// Écran Bilan — migré depuis Next.js /bilan/page.tsx
import React, { useState, useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { Wallet, TrendingUp, RotateCcw, ShoppingBag, Package } from 'lucide-react-native';
import { useHistoryContext } from '@/src/context/HistoryContext';
import { useProductContext } from '@/src/context/ProductContext';
import { useStockContext } from '@/src/context/StockContext';
import { useAuth } from '@/src/context/AuthContext';
import { useFocusEffect, useRouter } from 'expo-router';
import { colors } from '@/src/lib/colors';
import { ScreenHeader } from '@/src/components/ui';

export default function BilanScreen() {
    const router = useRouter();
    const { history, balance, clearHistory, refreshHistory } = useHistoryContext();
    const { products, refreshProducts } = useProductContext();
    const { stock, refreshStock } = useStockContext();

    // Recharger toutes les données à chaque retour sur le bilan
    useFocusEffect(useCallback(() => {
        refreshHistory();
        refreshProducts();
        refreshStock();
    }, [refreshHistory, refreshProducts, refreshStock]));
    const { user } = useAuth();
    const [showBalance, setShowBalance] = useState(true);

    const today = new Date().setHours(0, 0, 0, 0);
    const todayTx = history.filter(t => t.timestamp >= today);
    const todaySales = todayTx.filter(t => t.type === 'VENTE' && t.status !== 'DETTE').reduce((acc, t) => acc + t.price, 0);
    const todayDebts = todayTx.filter(t => t.status === 'DETTE').reduce((acc, t) => acc + t.price, 0);
    const stockValue = products.reduce((acc, p) => acc + p.price * (stock[p.id] || 0), 0);

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

            <ScrollView style={styles.body} contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
                {/* Grille stats */}
                <View style={styles.statsGrid}>
                    {STATS.map(stat => (
                        <View key={stat.label} style={[styles.statCard, { backgroundColor: stat.bg }]}>
                            <View style={[styles.statIconBox, { backgroundColor: stat.bg }]}>
                                <stat.icon color={stat.color} size={22} />
                            </View>
                            <Text style={[styles.statValue, { color: stat.color }]}>
                                {showBalance ? stat.value.toLocaleString() : '•••'} F
                            </Text>
                            <Text style={styles.statLabel}>{stat.label}</Text>
                        </View>
                    ))}
                </View>

                {/* Historique */}
                <View style={styles.historyCard}>
                    <View style={styles.historyHeader}>
                        <Text style={styles.historyTitle}>HISTORIQUE RÉCENT</Text>
                        <Text style={styles.historyCount}>{history.length} transactions</Text>
                    </View>
                    {history.slice(0, 10).map((t, i) => (
                        <View key={t.id} style={[styles.txRow, i > 0 && styles.txBorder]}>
                            <View style={[styles.txIcon, t.type === 'VENTE' ? styles.txIconSale : styles.txIconDelivery]}>
                                {t.type === 'VENTE' ? <ShoppingBag color="#059669" size={15} /> : <Package color="#2563eb" size={15} />}
                            </View>
                            <View style={styles.txInfo}>
                                <Text style={styles.txName} numberOfLines={1}>{t.productName}</Text>
                                <Text style={styles.txDate}>
                                    {new Date(t.timestamp).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                                    {t.clientName ? ` • ${t.clientName}` : ''}
                                </Text>
                            </View>
                            <Text style={[styles.txAmount, t.status === 'DETTE' && styles.txDebt]}>
                                {t.type === 'VENTE' && t.status !== 'DETTE' ? '+' : ''}{t.price.toLocaleString()}F
                            </Text>
                        </View>
                    ))}
                    {history.length === 0 && (
                        <View style={styles.empty}>
                            <Text style={styles.emptyText}>AUCUNE TRANSACTION</Text>
                        </View>
                    )}
                </View>

                {/* Bouton Reset */}
                <TouchableOpacity style={styles.resetBtn} onPress={handleReset}>
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
    historyHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
    historyTitle: { fontSize: 11, fontWeight: '900', color: colors.slate900, letterSpacing: 1.5 },
    historyCount: { fontSize: 11, color: colors.slate400, fontWeight: '600' },
    txRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, gap: 10 },
    txBorder: { borderTopWidth: 1, borderTopColor: colors.slate100 },
    txIcon: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
    txIconSale: { backgroundColor: '#ecfdf5' },
    txIconDelivery: { backgroundColor: '#eff6ff' },
    txInfo: { flex: 1 },
    txName: { fontSize: 13, fontWeight: '600', color: colors.slate800 },
    txDate: { fontSize: 11, color: colors.slate400, marginTop: 1 },
    txAmount: { fontSize: 13, fontWeight: '700', color: colors.slate800 },
    txDebt: { color: '#f97316' },
    empty: { alignItems: 'center', paddingVertical: 24 },
    emptyText: { fontSize: 11, fontWeight: '700', color: colors.slate400, letterSpacing: 2 },

    resetBtn: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
        paddingVertical: 14, borderRadius: 10,
        borderWidth: 2, borderColor: '#fecaca', backgroundColor: '#fff1f2',
    },
    resetBtnText: { fontSize: 12, fontWeight: '900', color: colors.error, letterSpacing: 1 },
});
