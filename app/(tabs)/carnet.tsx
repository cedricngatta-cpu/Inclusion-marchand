// Carnet de dettes — migré depuis Next.js /carnet/page.tsx
import React, { useState, useCallback } from 'react';
import {
    View, Text, ScrollView, StyleSheet, TouchableOpacity,
    TextInput, Alert, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { ChevronLeft, User, DollarSign, Search, CheckCircle, ChevronDown, ChevronUp } from 'lucide-react-native';
import { useHistoryContext } from '@/src/context/HistoryContext';
import { Transaction } from '@/src/context/HistoryContext';
import { useNotifications } from '@/src/context/NotificationContext';
import { emitEvent } from '@/src/lib/socket';
import { colors } from '@/src/lib/colors';

export default function CarnetScreen() {
    const router = useRouter();
    const { history, markAsPaid, refreshHistory } = useHistoryContext();
    const { sendNotification } = useNotifications();

    useFocusEffect(useCallback(() => { refreshHistory(); }, [refreshHistory]));
    const [search, setSearch]               = useState('');
    const [selectedClient, setSelectedClient] = useState<string | null>(null);
    const [processing, setProcessing]       = useState<string | null>(null);

    // ── Grouper les dettes par client ──
    const debtsByClient = history.reduce((acc, t) => {
        if (t.status !== 'DETTE') return acc;
        const raw = t.clientName;
        const name = raw && raw !== 'Client standard' ? raw : 'CLIENT INCONNU';
        const key = name.toUpperCase();
        if (!acc[key]) acc[key] = { name, total: 0, transactions: [] };
        acc[key].total += t.price;
        acc[key].transactions.push(t);
        return acc;
    }, {} as Record<string, { name: string; total: number; transactions: Transaction[] }>);

    const clientKeys = Object.keys(debtsByClient).filter(key =>
        debtsByClient[key].name.toLowerCase().includes(search.toLowerCase())
    );

    const totalGlobal = Object.values(debtsByClient).reduce((acc, c) => acc + c.total, 0);

    // ── Encaisser une transaction ──
    const handleSettle = async (transactionId: string) => {
        if (processing) return;
        setProcessing(transactionId);
        const tx = history.find(t => t.id === transactionId);
        try {
            await markAsPaid(transactionId);

            // Notification locale + événement socket
            const label = tx ? `${tx.productName} — ${tx.price.toLocaleString('fr-FR')} F` : 'Vente';
            const client = tx?.clientName && tx.clientName !== 'Client standard' ? tx.clientName : 'Client';
            await sendNotification({
                target_id: 'ALL',
                title: 'Dette encaissée ✓',
                message: `${client} a réglé : ${label}`,
                type: 'INFO',
            });
            emitEvent('dette-encaissee', {
                transactionId,
                clientName: client,
                amount:     tx?.price ?? 0,
            });
        } catch {
            Alert.alert('Erreur', "L'encaissement a échoué. Vérifie ta connexion.");
        } finally {
            setProcessing(null);
        }
    };

    // ── Tout régler pour un client ──
    const handleSettleAll = async (clientKey: string) => {
        if (processing) return;
        const client = debtsByClient[clientKey];
        if (!client) return;
        setProcessing(clientKey);
        try {
            for (const t of client.transactions) {
                await markAsPaid(t.id);
            }

            // Notification unique résumant le tout
            const total = client.total.toLocaleString('fr-FR');
            await sendNotification({
                target_id: 'ALL',
                title: 'Toutes les dettes réglées ✓',
                message: `${client.name} a tout remboursé — ${total} F encaissés`,
                type: 'INFO',
            });
            emitEvent('dette-encaissee', {
                clientName: client.name,
                amount:     client.total,
                bulk:       true,
            });
        } catch {
            Alert.alert('Erreur', 'Encaissement groupé échoué. Réessaie.');
        } finally {
            setProcessing(null);
        }
    };

    return (
        <SafeAreaView style={styles.safe} edges={['top']}>
            {/* ── HEADER ── */}
            <View style={styles.header}>
                <View style={styles.headerTop}>
                    <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
                        <ChevronLeft color={colors.white} size={20} />
                    </TouchableOpacity>
                    <View style={styles.headerTitleBlock}>
                        <Text style={styles.headerTitle}>MON CARNET</Text>
                        <Text style={styles.headerSub}>CRÉDITS & DETTES</Text>
                    </View>
                    <View style={{ width: 40 }} />
                </View>

                {/* KPI total */}
                <View style={styles.kpiBlock}>
                    <View style={styles.kpiLabelRow}>
                        <DollarSign color="rgba(255,255,255,0.7)" size={14} />
                        <Text style={styles.kpiLabel}>ARGENT DEHORS</Text>
                    </View>
                    <View style={styles.kpiAmountRow}>
                        <Text style={styles.kpiAmount}>{totalGlobal.toLocaleString('fr-FR')}</Text>
                        <Text style={styles.kpiCurrency}>F</Text>
                    </View>
                </View>
            </View>

            {/* ── CONTENU ── */}
            <ScrollView
                style={styles.scroll}
                contentContainerStyle={styles.scrollContent}
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
            >
                {/* Barre de recherche */}
                <View style={styles.searchBox}>
                    <Search color={colors.slate400} size={16} style={{ marginLeft: 14 }} />
                    <TextInput
                        style={styles.searchInput}
                        placeholder="Chercher un client..."
                        placeholderTextColor={colors.slate400}
                        value={search}
                        onChangeText={setSearch}
                        autoCapitalize="none"
                    />
                </View>

                {/* Compteur */}
                <Text style={styles.countLabel}>
                    {clientKeys.length} PERSONNE{clientKeys.length !== 1 ? 'S' : ''} DOI{clientKeys.length !== 1 ? 'VENT' : 'T'}
                </Text>

                {/* ── Liste clients ── */}
                {clientKeys.length === 0 ? (
                    <View style={styles.emptyCard}>
                        <Text style={styles.emptyText}>TOUT LE MONDE A PAYÉ !</Text>
                    </View>
                ) : (
                    clientKeys.map(key => {
                        const client = debtsByClient[key];
                        const expanded = selectedClient === key;
                        const isUnknown = client.name === 'CLIENT INCONNU';

                        return (
                            <View key={key} style={styles.clientCard}>
                                {/* En-tête client */}
                                <View style={styles.clientRow}>
                                    <View style={[styles.clientAvatar, isUnknown && styles.clientAvatarUnknown]}>
                                        <User color={isUnknown ? colors.slate400 : '#e11d48'} size={22} />
                                    </View>
                                    <View style={styles.clientInfo}>
                                        <Text style={styles.clientName} numberOfLines={1}>{client.name}</Text>
                                        <Text style={styles.clientDebt}>Doit {client.total.toLocaleString('fr-FR')} F</Text>
                                    </View>
                                </View>

                                {/* Boutons */}
                                <View style={styles.clientBtns}>
                                    <TouchableOpacity
                                        style={[styles.settleAllBtn, processing === key && { opacity: 0.5 }]}
                                        onPress={() => handleSettleAll(key)}
                                        disabled={!!processing}
                                    >
                                        {processing === key
                                            ? <ActivityIndicator color={colors.white} size="small" />
                                            : <Text style={styles.settleAllBtnText}>TOUT RÉGLER</Text>
                                        }
                                    </TouchableOpacity>
                                    <TouchableOpacity
                                        style={styles.detailsBtn}
                                        onPress={() => setSelectedClient(expanded ? null : key)}
                                    >
                                        {expanded
                                            ? <ChevronUp color={colors.slate600} size={16} />
                                            : <ChevronDown color={colors.slate600} size={16} />
                                        }
                                        <Text style={styles.detailsBtnText}>{expanded ? 'FERMER' : 'DÉTAILS'}</Text>
                                    </TouchableOpacity>
                                </View>

                                {/* Détails expandables */}
                                {expanded && (
                                    <View style={styles.txList}>
                                        {client.transactions.map(t => (
                                            <View key={t.id} style={styles.txRow}>
                                                <View style={styles.txInfo}>
                                                    <Text style={styles.txName} numberOfLines={1}>{t.productName}</Text>
                                                    <Text style={styles.txMeta}>
                                                        {new Date(t.timestamp).toLocaleDateString('fr-FR')} • {t.quantity} un.
                                                    </Text>
                                                </View>
                                                <View style={styles.txRight}>
                                                    <Text style={styles.txAmount}>{t.price.toLocaleString('fr-FR')} F</Text>
                                                    <TouchableOpacity
                                                        style={[styles.checkBtn, processing === t.id && { opacity: 0.5 }]}
                                                        onPress={() => handleSettle(t.id)}
                                                        disabled={!!processing}
                                                    >
                                                        {processing === t.id
                                                            ? <ActivityIndicator color={colors.white} size="small" />
                                                            : <CheckCircle color={colors.white} size={16} />
                                                        }
                                                    </TouchableOpacity>
                                                </View>
                                            </View>
                                        ))}
                                    </View>
                                )}
                            </View>
                        );
                    })
                )}
            </ScrollView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.bgSecondary },

    // ── Header ──
    header: {
        backgroundColor: colors.primary,
        paddingHorizontal: 16,
        paddingTop: 8,
        paddingBottom: 24,
        borderBottomLeftRadius: 32,
        borderBottomRightRadius: 32,
    },
    headerTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 },
    backBtn: {
        width: 40, height: 40, borderRadius: 10,
        backgroundColor: 'rgba(255,255,255,0.2)',
        alignItems: 'center', justifyContent: 'center',
    },
    headerTitleBlock: { alignItems: 'center' },
    headerTitle: { fontSize: 16, fontWeight: '900', color: colors.white, letterSpacing: 1 },
    headerSub:   { fontSize: 9, fontWeight: '700', color: 'rgba(255,255,255,0.7)', letterSpacing: 3, marginTop: 2 },

    kpiBlock:      { alignItems: 'center', paddingBottom: 4 },
    kpiLabelRow:   { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
    kpiLabel:      { fontSize: 10, fontWeight: '700', color: 'rgba(255,255,255,0.7)', letterSpacing: 3 },
    kpiAmountRow:  { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
    kpiAmount:     { fontSize: 48, fontWeight: '900', color: colors.white, letterSpacing: -2, lineHeight: 56 },
    kpiCurrency:   { fontSize: 22, fontWeight: '700', color: 'rgba(255,255,255,0.7)' },

    // ── Scroll ──
    scroll:        { flex: 1 },
    scrollContent: { paddingHorizontal: 16, paddingTop: 20, paddingBottom: 40, gap: 14 },

    // ── Recherche ──
    searchBox: {
        flexDirection: 'row', alignItems: 'center',
        backgroundColor: colors.white, borderRadius: 10,
        borderWidth: 1, borderColor: colors.slate100,
        shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.07, shadowRadius: 8, elevation: 4,
        marginBottom: 4,
    },
    searchInput: {
        flex: 1, height: 52, paddingHorizontal: 12,
        fontSize: 14, fontWeight: '600', color: colors.slate800,
    },

    countLabel: { fontSize: 10, fontWeight: '700', color: colors.slate400, letterSpacing: 2, marginBottom: 4, paddingHorizontal: 2 },

    // ── Empty ──
    emptyCard: {
        backgroundColor: colors.white, borderRadius: 10, padding: 48,
        alignItems: 'center', borderWidth: 2, borderColor: colors.slate100, borderStyle: 'dashed',
    },
    emptyText: { fontSize: 14, fontWeight: '900', color: colors.slate300, letterSpacing: 1 },

    // ── Client card ──
    clientCard: {
        backgroundColor: colors.white, borderRadius: 10, padding: 18,
        borderWidth: 1, borderColor: colors.slate100,
        shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.05, shadowRadius: 4, elevation: 2,
    },
    clientRow:   { flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 14 },
    clientAvatar: {
        width: 48, height: 48, borderRadius: 10,
        backgroundColor: '#fee2e2', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
    },
    clientAvatarUnknown: { backgroundColor: colors.slate100 },
    clientInfo:  { flex: 1 },
    clientName:  { fontSize: 15, fontWeight: '900', color: colors.slate800, textTransform: 'uppercase' },
    clientDebt:  { fontSize: 13, fontWeight: '700', color: '#e11d48', marginTop: 2 },

    clientBtns:    { flexDirection: 'row', gap: 8 },
    settleAllBtn: {
        flex: 1, backgroundColor: colors.primary,
        paddingVertical: 12, borderRadius: 10,
        alignItems: 'center', justifyContent: 'center',
        shadowColor: colors.primary, shadowOpacity: 0.3, shadowRadius: 6, elevation: 3,
    },
    settleAllBtnText: { fontSize: 11, fontWeight: '900', color: colors.white, letterSpacing: 1 },
    detailsBtn: {
        flexDirection: 'row', alignItems: 'center', gap: 4,
        backgroundColor: colors.slate50, paddingHorizontal: 16, paddingVertical: 12,
        borderRadius: 10, borderWidth: 1, borderColor: colors.slate100,
    },
    detailsBtnText: { fontSize: 10, fontWeight: '700', color: colors.slate600, letterSpacing: 1 },

    // ── Transaction list (expanded) ──
    txList: { marginTop: 14, borderTopWidth: 1, borderTopColor: colors.slate100, paddingTop: 14, gap: 10 },
    txRow: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        backgroundColor: colors.slate50, borderRadius: 10, padding: 12,
        borderWidth: 1, borderColor: colors.slate100, gap: 8,
    },
    txInfo:   { flex: 1 },
    txName:   { fontSize: 12, fontWeight: '700', color: colors.slate800 },
    txMeta:   { fontSize: 10, color: colors.slate400, marginTop: 2 },
    txRight:  { flexDirection: 'row', alignItems: 'center', gap: 10, flexShrink: 0 },
    txAmount: { fontSize: 13, fontWeight: '900', color: '#e11d48' },
    checkBtn: {
        width: 34, height: 34, borderRadius: 10,
        backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center',
    },
});
