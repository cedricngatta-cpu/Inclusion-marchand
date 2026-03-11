// Finances — Portefeuille + Services Financiers combinés
// Refactoré avec le design system unifié (ScreenHeader, Card, StatCard, ListItem, EmptyState)
import React, { useState, useCallback, useMemo } from 'react';
import {
    View, Text, ScrollView, StyleSheet, ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';
import {
    TrendingUp, TrendingDown, Wallet,
    ShoppingBag, ShoppingCart, Landmark, Shield, Lock,
} from 'lucide-react-native';
import { supabase } from '@/src/lib/supabase';
import { colors } from '@/src/lib/colors';
import { useProfileContext } from '@/src/context/ProfileContext';
import {
    ScreenHeader, Card, StatCard, ListItem, ListIcon, EmptyState,
} from '@/src/components/ui';

// ── Helpers ─────────────────────────────────────────────────────────────────

interface FinancialEntry {
    id: string;
    label: string;
    amount: number;
    type: 'IN' | 'OUT';
    date: string;
}

const JOURS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];

function getMondayOf(date: Date): Date {
    const d = new Date(date);
    const day = d.getDay();
    const diff = day === 0 ? -6 : 1 - day;
    d.setDate(d.getDate() + diff);
    d.setHours(0, 0, 0, 0);
    return d;
}

function startOfMonth(date: Date): Date {
    return new Date(date.getFullYear(), date.getMonth(), 1);
}

const SERVICES = [
    {
        title: 'Microcrédit',
        description: 'Financement pour votre stock',
        icon: Landmark,
        bg: colors.purpleLight,
        color: colors.purple,
        status: 'Bientôt disponible',
    },
    {
        title: 'Assurance',
        description: 'Protection santé et boutique',
        icon: Shield,
        bg: colors.blueLight,
        color: colors.blue,
        status: "En cours d'étude",
    },
    {
        title: 'Score de Crédit',
        description: 'Basé sur votre activité',
        icon: TrendingUp,
        bg: colors.primaryBg,
        color: colors.primary,
        status: 'Calcul automatique',
    },
];

// ── Composant principal ──────────────────────────────────────────────────────

export default function FinanceScreen() {
    const insets = useSafeAreaInsets();
    const { activeProfile } = useProfileContext();

    const [loading, setLoading]           = useState(true);
    const [entries, setEntries]           = useState<FinancialEntry[]>([]);
    const [weekRevByDay, setWeekRevByDay] = useState<number[]>([0, 0, 0, 0, 0, 0, 0]);

    const fetchFinance = useCallback(async () => {
        if (!activeProfile) return;
        setLoading(true);
        try {
            const now     = new Date();
            const mStart  = startOfMonth(now).toISOString();
            const wMonday = getMondayOf(now);

            const [txRes, ordRes] = await Promise.all([
                supabase
                    .from('transactions')
                    .select('id, price, product_name, status, created_at')
                    .eq('store_id', activeProfile.id)
                    .eq('type', 'VENTE')
                    .neq('status', 'DETTE')
                    .gte('created_at', mStart)
                    .order('created_at', { ascending: false }),
                supabase
                    .from('orders')
                    .select('id, total_amount, created_at, products(name)')
                    .eq('buyer_store_id', activeProfile.id)
                    .eq('status', 'DELIVERED')
                    .gte('created_at', mStart)
                    .order('created_at', { ascending: false }),
            ]);

            const ins: FinancialEntry[] = (txRes.data ?? []).map((t: any) => ({
                id:     'tx_' + t.id,
                label:  t.product_name ?? 'Vente',
                amount: t.price ?? 0,
                type:   'IN',
                date:   t.created_at,
            }));
            const outs: FinancialEntry[] = (ordRes.data ?? []).map((o: any) => ({
                id:     'ord_' + o.id,
                label:  (o.products as any)?.name ?? 'Commande',
                amount: o.total_amount ?? 0,
                type:   'OUT',
                date:   o.created_at,
            }));
            const all = [...ins, ...outs].sort(
                (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
            );
            setEntries(all);

            // Graphique semaine
            const { data: weekTx } = await supabase
                .from('transactions')
                .select('price, created_at')
                .eq('store_id', activeProfile.id)
                .eq('type', 'VENTE')
                .neq('status', 'DETTE')
                .gte('created_at', wMonday.toISOString());
            const byDay: number[] = [0, 0, 0, 0, 0, 0, 0];
            for (const t of (weekTx ?? []) as any[]) {
                const idx = new Date(t.created_at).getDay();
                byDay[idx === 0 ? 6 : idx - 1] += t.price ?? 0;
            }
            setWeekRevByDay(byDay);
        } catch (err) {
            console.error('[Finance] fetch error:', err);
        } finally {
            setLoading(false);
        }
    }, [activeProfile]);

    useFocusEffect(useCallback(() => { fetchFinance(); }, [fetchFinance]));

    const totalIn  = useMemo(() => entries.filter(e => e.type === 'IN').reduce((s, e) => s + e.amount, 0), [entries]);
    const totalOut = useMemo(() => entries.filter(e => e.type === 'OUT').reduce((s, e) => s + e.amount, 0), [entries]);
    const solde    = totalIn - totalOut;
    const maxDay   = Math.max(...weekRevByDay, 1);
    const todayIdx = new Date().getDay() === 0 ? 6 : new Date().getDay() - 1;

    return (
        <View style={[styles.container, { paddingBottom: insets.bottom }]}>

            {/* ── HEADER ── */}
            <ScreenHeader
                title="Finances"
                subtitle="Gestion financière"
                showBack
                paddingBottom={20}
            >
                {/* Solde net en grand */}
                <View style={styles.balanceBlock}>
                    <View style={styles.balanceLabelRow}>
                        <Wallet color="rgba(255,255,255,0.7)" size={14} />
                        <Text style={styles.balanceLabel}>SOLDE NET DU MOIS</Text>
                    </View>
                    {loading ? (
                        <ActivityIndicator color={colors.white} style={{ marginVertical: 12 }} />
                    ) : (
                        <View style={styles.balanceAmountRow}>
                            <Text style={[styles.balanceAmount, solde < 0 && styles.balanceNeg]}>
                                {solde < 0 ? '-' : '+'}{Math.abs(solde).toLocaleString('fr-FR')}
                            </Text>
                            <Text style={styles.balanceCurrency}>F</Text>
                        </View>
                    )}
                </View>

                {/* Rangée revenus / dépenses */}
                <View style={styles.statsRow}>
                    <StatCard
                        label="Revenus"
                        value={loading ? '–' : `${totalIn.toLocaleString('fr-FR')} F`}
                        icon={<TrendingUp color={colors.primary} size={16} />}
                        iconBg={colors.primaryBg}
                        accentColor={colors.primary}
                        flex
                    />
                    <StatCard
                        label="Dépenses"
                        value={loading ? '–' : `${totalOut.toLocaleString('fr-FR')} F`}
                        icon={<TrendingDown color={colors.error} size={16} />}
                        iconBg={colors.redLight}
                        accentColor={colors.error}
                        flex
                    />
                </View>
            </ScreenHeader>

            <ScrollView
                style={styles.scroll}
                contentContainerStyle={styles.scrollContent}
                showsVerticalScrollIndicator={false}
            >
                {/* ── Graphique semaine ── */}
                <Card>
                    <Text style={styles.cardTitle}>REVENUS — SEMAINE EN COURS</Text>
                    <View style={styles.chartArea}>
                        {weekRevByDay.map((val, idx) => {
                            const pct     = maxDay > 0 ? val / maxDay : 0;
                            const isToday = idx === todayIdx;
                            return (
                                <View key={idx} style={styles.barCol}>
                                    <Text style={styles.barValue}>
                                        {val > 0 ? `${Math.round(val / 1000)}k` : ''}
                                    </Text>
                                    <View style={styles.barTrack}>
                                        <View style={[
                                            styles.barFill,
                                            { height: `${Math.max(pct * 100, val > 0 ? 4 : 0)}%` as any },
                                            isToday && styles.barFillToday,
                                        ]} />
                                    </View>
                                    <Text style={[styles.barLabel, isToday && styles.barLabelToday]}>
                                        {JOURS[idx]}
                                    </Text>
                                </View>
                            );
                        })}
                    </View>
                </Card>

                {/* ── Historique financier ── */}
                <Card noPadding>
                    <Text style={[styles.cardTitle, { paddingHorizontal: 16, paddingTop: 16 }]}>
                        HISTORIQUE FINANCIER
                    </Text>
                    {loading ? (
                        <ActivityIndicator color={colors.primary} style={{ marginVertical: 24 }} />
                    ) : entries.length === 0 ? (
                        <EmptyState
                            icon={<Wallet color={colors.slate400} size={36} />}
                            title="Aucune opération ce mois"
                        />
                    ) : (
                        entries.slice(0, 20).map((entry, i) => (
                            <ListItem
                                key={entry.id}
                                title={entry.label}
                                subtitle={new Date(entry.date).toLocaleDateString('fr-FR', {
                                    day: '2-digit', month: 'short',
                                    hour: '2-digit', minute: '2-digit',
                                })}
                                noBorder={i === Math.min(entries.length, 20) - 1}
                                left={
                                    <ListIcon bg={entry.type === 'IN' ? colors.primaryBg : colors.redLight}>
                                        {entry.type === 'IN'
                                            ? <ShoppingBag color={colors.primary} size={16} />
                                            : <ShoppingCart color={colors.error} size={16} />
                                        }
                                    </ListIcon>
                                }
                                right={
                                    <Text style={[
                                        styles.entryAmount,
                                        entry.type === 'IN' ? styles.entryAmountIn : styles.entryAmountOut,
                                    ]}>
                                        {entry.type === 'IN' ? '+' : '-'}{entry.amount.toLocaleString('fr-FR')} F
                                    </Text>
                                }
                            />
                        ))
                    )}
                </Card>

                {/* ── Services Financiers ── */}
                <Text style={styles.sectionTitle}>SERVICES FINANCIERS</Text>

                {SERVICES.map((service, i) => (
                    <Card key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
                        <View style={[styles.serviceIcon, { backgroundColor: service.bg }]}>
                            <service.icon color={service.color} size={24} />
                        </View>
                        <View style={{ flex: 1 }}>
                            <Text style={styles.serviceTitle}>{service.title}</Text>
                            <Text style={styles.serviceDesc}>{service.description}</Text>
                            <View style={styles.statusBadge}>
                                <Lock color={colors.slate400} size={10} />
                                <Text style={styles.statusText}>{service.status}</Text>
                            </View>
                        </View>
                    </Card>
                ))}

                {/* Bloc informatif */}
                <Card style={styles.infoBox}>
                    <Text style={styles.infoTitle}>POURQUOI CES SERVICES ?</Text>
                    <Text style={styles.infoText}>
                        Plus vous enregistrez vos ventes, plus votre{' '}
                        <Text style={styles.infoHighlight}>score de confiance</Text>{' '}
                        augmente. C'est ce score qui vous permettra d'accéder aux financements sans paperasse.
                    </Text>
                </Card>
            </ScrollView>
        </View>
    );
}

// ── Styles ─────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.bgSecondary },

    // Solde dans le header
    balanceBlock:     { alignItems: 'center', marginTop: 8 },
    balanceLabelRow:  { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 },
    balanceLabel:     { fontSize: 11, fontWeight: '700', color: 'rgba(255,255,255,0.7)', letterSpacing: 2 },
    balanceAmountRow: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
    balanceAmount:    { fontSize: 44, fontWeight: '900', color: colors.white, letterSpacing: -2, lineHeight: 52 },
    balanceNeg:       { color: '#fca5a5' },
    balanceCurrency:  { fontSize: 20, fontWeight: '700', color: 'rgba(255,255,255,0.7)' },

    // Rangée de StatCards dans le header
    statsRow: { flexDirection: 'row', gap: 10, marginTop: 14 },

    scroll:        { flex: 1 },
    scrollContent: { paddingTop: 20, paddingBottom: 40 },

    // Titre de section à l'intérieur d'une card
    cardTitle: { fontSize: 11, fontWeight: '900', color: colors.textPrimary, letterSpacing: 2, marginBottom: 16 },

    // Graphique
    chartArea: { flexDirection: 'row', alignItems: 'flex-end', height: 110, gap: 4 },
    barCol:    { flex: 1, alignItems: 'center', height: '100%', justifyContent: 'flex-end', gap: 4 },
    barValue:  { fontSize: 11, fontWeight: '700', color: colors.slate400, height: 14, textAlign: 'center' },
    barTrack:  { flex: 1, width: '100%', backgroundColor: colors.slate100, borderRadius: 4, justifyContent: 'flex-end', overflow: 'hidden' },
    barFill:        { width: '100%', backgroundColor: colors.primary, borderRadius: 4 },
    barFillToday:   { backgroundColor: '#0d9488' },
    barLabel:       { fontSize: 11, fontWeight: '700', color: colors.slate400, textAlign: 'center' },
    barLabelToday:  { color: colors.primary, fontWeight: '900' },

    // Montant dans l'historique
    entryAmount:    { fontSize: 13, fontWeight: '900' },
    entryAmountIn:  { color: colors.primary },
    entryAmountOut: { color: colors.error },

    // Section services
    sectionTitle: {
        fontSize: 11, fontWeight: '900', color: colors.textMuted,
        letterSpacing: 2, textTransform: 'uppercase',
        marginHorizontal: 16, marginBottom: 4,
    },
    serviceIcon:  { width: 52, height: 52, borderRadius: 10, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
    serviceTitle: { fontSize: 13, fontWeight: '900', color: colors.textPrimary, marginBottom: 3 },
    serviceDesc:  { fontSize: 11, fontWeight: '600', color: colors.textMuted, marginBottom: 8 },
    statusBadge:  {
        flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start',
        backgroundColor: colors.bgSecondary, paddingHorizontal: 8, paddingVertical: 4,
        borderRadius: 6, borderWidth: 1, borderColor: colors.slate200,
    },
    statusText: { fontSize: 11, fontWeight: '700', color: colors.textSecondary, letterSpacing: 0.5 },

    // Bloc info
    infoBox:       { backgroundColor: colors.primaryBg, borderColor: colors.primaryBg2 },
    infoTitle:     { fontSize: 11, fontWeight: '900', color: '#166534', letterSpacing: 2, marginBottom: 8 },
    infoText:      { fontSize: 12, fontWeight: '600', color: '#15803d', lineHeight: 20 },
    infoHighlight: { fontWeight: '900', color: '#14532d' },
});
