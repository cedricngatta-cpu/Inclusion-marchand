// Dashboard Coopérative — fidèle au projet Next.js original
// Design : header VIOLET #6d28d9, hero volume mensuel, 2 grands CTAs, activités récentes
import React, { useState, useEffect, useCallback } from 'react';
import {
    View, Text, ScrollView, StyleSheet, TouchableOpacity,
    ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import {
    Bell, Settings, Users, Truck, TrendingUp, ShoppingBag,
    ChevronRight, AlertCircle,
} from 'lucide-react-native';
import { supabase } from '@/src/lib/supabase';
import { onSocketEvent } from '@/src/lib/socket';
import { useAuth } from '@/src/context/AuthContext';

// ── Constantes violet ─────────────────────────────────────────────────────────
const PURPLE  = '#6d28d9';
const PURPLEL = 'rgba(255,255,255,0.15)';
const PURPLELT= 'rgba(255,255,255,0.7)';

const MONTH_LABELS = [
    'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
    'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre',
];

// ── Types ──────────────────────────────────────────────────────────────────────
interface RecentActivity {
    id: string;
    type: 'COMMANDE' | 'LIVRAISON' | 'VENTE' | 'ENROLEMENT';
    label: string;
    sub: string;
    amount?: number;
    created_at: string;
}

// ── Composant principal ────────────────────────────────────────────────────────
export default function CooperativeDashboard() {
    const router = useRouter();
    const { user } = useAuth();

    const [monthlyVolume,  setMonthlyVolume]  = useState(0);
    const [txCount,        setTxCount]        = useState(0);
    const [totalMembers,   setTotalMembers]   = useState(0);
    const [b2bPending,     setB2bPending]     = useState(0);
    const [pendingEnroll,  setPendingEnroll]  = useState(0);
    const [activities,     setActivities]     = useState<RecentActivity[]>([]);
    const [loading,        setLoading]        = useState(true);

    const fetchDashboard = useCallback(async () => {
        setLoading(true);
        try {
            const monthStart = new Date();
            monthStart.setDate(1);
            monthStart.setHours(0, 0, 0, 0);

            const [volRes, membersRes, b2bRes, pendRes, enrollRes] = await Promise.all([
                // Volume mensuel (toutes les transactions)
                supabase
                    .from('transactions')
                    .select('price')
                    .eq('type', 'VENTE')
                    .neq('status', 'DETTE')
                    .gte('created_at', monthStart.toISOString()),

                // Membres
                supabase
                    .from('profiles')
                    .select('*', { count: 'exact', head: true }),

                // Commandes B2B en attente
                supabase
                    .from('orders')
                    .select('*', { count: 'exact', head: true })
                    .in('status', ['PENDING', 'ACCEPTED']),

                // Enrôlements en attente
                supabase
                    .from('enrollments')
                    .select('*', { count: 'exact', head: true })
                    .eq('status', 'PENDING'),

                // Dernières demandes d'enrôlement
                supabase
                    .from('enrollments')
                    .select('*')
                    .eq('status', 'PENDING')
                    .order('created_at', { ascending: false })
                    .limit(3),
            ]);

            const vol = (volRes.data ?? []).reduce((s: number, t: any) => s + (t.price ?? 0), 0);
            setMonthlyVolume(vol);
            setTxCount(volRes.data?.length ?? 0);
            setTotalMembers(membersRes.count ?? 0);
            setB2bPending(b2bRes.count ?? 0);
            setPendingEnroll(pendRes.count ?? 0);

            // Construire les activités depuis les enrôlements récents
            const acts: RecentActivity[] = (enrollRes.data ?? []).map((e: any) => ({
                id: e.id,
                type: 'ENROLEMENT' as const,
                label: e.full_name ?? 'Nouveau membre',
                sub: e.role === 'PRODUCER' ? 'Producteur' : 'Marchand',
                created_at: e.created_at,
            }));
            setActivities(acts);
        } catch (err) {
            console.error('[CooperativeDashboard] fetch error:', err);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { fetchDashboard(); }, [fetchDashboard]);

    useEffect(() => {
        const unsubs = [
            onSocketEvent('nouvel-enrolement',      () => fetchDashboard()),
            onSocketEvent('enrolement-valide',      () => fetchDashboard()),
            onSocketEvent('signalement-conformite', () => fetchDashboard()),
            onSocketEvent('nouvelle-commande',      () => fetchDashboard()),
        ];
        return () => unsubs.forEach(fn => fn());
    }, [fetchDashboard]);

    // Recharge à chaque retour sur l'écran
    useFocusEffect(useCallback(() => { fetchDashboard(); }, [fetchDashboard]));

    const prenom    = user?.name?.split(' ')[0] ?? 'Gestionnaire';
    const moisLabel = MONTH_LABELS[new Date().getMonth()];

    return (
        <SafeAreaView style={s.safe} edges={['top']}>

            {/* ════════════════════════════════ HEADER ═══════════════════════════ */}
            <View style={s.header}>
                {/* Nav */}
                <View style={s.nav}>
                    <View style={{ flex: 1 }}>
                        <Text style={s.headerGreet}>Bonjour, {prenom}</Text>
                        <Text style={s.headerTitle}>COOPÉRATIVE</Text>
                    </View>
                    <View style={{ flexDirection: 'row', gap: 8 }}>
                        <TouchableOpacity style={s.iconBtn} onPress={() => router.push('/(tabs)/notifications' as any)}>
                            <Bell color="#fff" size={20} />
                        </TouchableOpacity>
                        <TouchableOpacity style={s.iconBtn} onPress={() => router.push('/(tabs)/profil' as any)}>
                            <Settings color="#fff" size={20} />
                        </TouchableOpacity>
                    </View>
                </View>

                {/* Hero : volume mensuel */}
                <View style={s.heroBlock}>
                    <View style={s.heroLabelRow}>
                        <TrendingUp color={PURPLELT} size={14} />
                        <Text style={s.heroLabel}>VOLUME — {moisLabel.toUpperCase()}</Text>
                    </View>
                    {loading ? (
                        <ActivityIndicator color="#fff" style={{ marginVertical: 8 }} />
                    ) : (
                        <View style={s.heroAmountRow}>
                            <Text style={s.heroAmount}>{monthlyVolume.toLocaleString('fr-FR')}</Text>
                            <Text style={s.heroCurrency}>F</Text>
                        </View>
                    )}
                    <Text style={s.heroSub}>
                        {txCount} transaction{txCount > 1 ? 's' : ''} ce mois
                    </Text>
                </View>

                {/* KPIs */}
                <View style={s.kpiRow}>
                    <View style={s.kpiCell}>
                        <View style={s.kpiIconWrap}>
                            <Users color="rgba(255,255,255,0.9)" size={16} />
                        </View>
                        <Text style={s.kpiValue}>{loading ? '–' : totalMembers}</Text>
                        <Text style={s.kpiLabel}>MEMBRES</Text>
                    </View>
                    <View style={s.kpiSep} />
                    <View style={s.kpiCell}>
                        <View style={[s.kpiIconWrap, b2bPending > 0 && { backgroundColor: 'rgba(239,68,68,0.3)' }]}>
                            <Truck color="rgba(255,255,255,0.9)" size={16} />
                        </View>
                        <Text style={[s.kpiValue, b2bPending > 0 && { color: '#fca5a5' }]}>
                            {loading ? '–' : b2bPending}
                        </Text>
                        <Text style={s.kpiLabel}>COMMANDES B2B</Text>
                    </View>
                </View>
            </View>

            {/* ════════════════════════════════ CONTENU ══════════════════════════ */}
            <ScrollView
                style={s.scroll}
                contentContainerStyle={s.scrollContent}
                showsVerticalScrollIndicator={false}
                bounces={false}
                overScrollMode="never"
            >
                {/* ── Alerte enrôlements en attente ── */}
                {!loading && pendingEnroll > 0 && (
                    <TouchableOpacity
                        style={s.alertBanner}
                        activeOpacity={0.85}
                        onPress={() => router.push('/cooperative/demandes' as any)}
                    >
                        <View style={s.alertIconWrap}>
                            <AlertCircle color={PURPLE} size={18} />
                        </View>
                        <View style={{ flex: 1 }}>
                            <Text style={[s.alertTitle, { color: PURPLE }]}>
                                {pendingEnroll} demande{pendingEnroll > 1 ? 's' : ''} en attente
                            </Text>
                            <Text style={[s.alertSub, { color: '#a78bfa' }]}>Valider les nouveaux membres →</Text>
                        </View>
                    </TouchableOpacity>
                )}

                {/* ── CTA 1 : Gérer les membres ── */}
                <TouchableOpacity
                    style={[s.cta, { backgroundColor: PURPLE }]}
                    activeOpacity={0.88}
                    onPress={() => router.push('/cooperative/membres' as any)}
                >
                    <Users color="#fff" size={20} />
                    <Text style={s.ctaText}>GÉRER LES MEMBRES</Text>
                </TouchableOpacity>

                {/* ── CTA 2 : Achats groupés ── */}
                <TouchableOpacity
                    style={[s.cta, { backgroundColor: '#059669' }]}
                    activeOpacity={0.88}
                    onPress={() => router.push('/cooperative/achats' as any)}
                >
                    <ShoppingBag color="#fff" size={20} />
                    <Text style={s.ctaText}>ACHATS GROUPÉS</Text>
                </TouchableOpacity>

                {/* ── Navigation modules ── */}
                <Text style={s.sectionTitle}>MODULES</Text>
                {[
                    { label: 'Demandes d\'enrôlement', icon: Users,      bg: '#fef3c7', color: '#92400e', path: '/cooperative/demandes' },
                    { label: 'Performances',           icon: TrendingUp, bg: '#ede9fe', color: PURPLE,   path: '/cooperative/performances' },
                    { label: 'Analyses de marché',     icon: TrendingUp, bg: '#e0e7ff', color: '#3730a3', path: '/cooperative/analyses' },
                ].map(item => {
                    const Icon = item.icon;
                    return (
                        <TouchableOpacity
                            key={item.label}
                            style={s.moduleCard}
                            activeOpacity={0.82}
                            onPress={() => router.push(item.path as any)}
                        >
                            <View style={[s.moduleIcon, { backgroundColor: item.bg }]}>
                                <Icon color={item.color} size={20} />
                            </View>
                            <Text style={s.moduleLabel}>{item.label}</Text>
                            <ChevronRight color="#cbd5e1" size={16} />
                        </TouchableOpacity>
                    );
                })}

                {/* ── Activités récentes ── */}
                {activities.length > 0 && (
                    <>
                        <View style={s.sectionHeader}>
                            <Text style={s.sectionTitle}>ACTIVITÉS RÉCENTES</Text>
                            <TouchableOpacity onPress={() => router.push('/cooperative/demandes' as any)}>
                                <Text style={s.sectionLink}>VOIR TOUT</Text>
                            </TouchableOpacity>
                        </View>

                        {activities.map(act => (
                            <TouchableOpacity
                                key={act.id}
                                style={s.activityCard}
                                activeOpacity={0.85}
                                onPress={() => router.push('/cooperative/demandes' as any)}
                            >
                                <View style={[s.activityDot, { backgroundColor: '#ede9fe' }]}>
                                    <Users color={PURPLE} size={15} />
                                </View>
                                <View style={{ flex: 1, minWidth: 0 }}>
                                    <Text style={s.activityLabel} numberOfLines={1}>{act.label}</Text>
                                    <Text style={s.activitySub}>{act.sub} · {new Date(act.created_at).toLocaleDateString('fr-FR')}</Text>
                                </View>
                                <View style={s.pendingBadge}>
                                    <Text style={s.pendingBadgeText}>EN ATTENTE</Text>
                                </View>
                            </TouchableOpacity>
                        ))}
                    </>
                )}
            </ScrollView>
        </SafeAreaView>
    );
}

// ── Styles ─────────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
    safe: { flex: 1, backgroundColor: '#f8fafc' },

    // ── Header VIOLET ──
    header: {
        backgroundColor: PURPLE,
        paddingHorizontal: 16,
        paddingTop: 8,
        paddingBottom: 28,
        borderBottomLeftRadius: 32,
        borderBottomRightRadius: 32,
        gap: 16,
    },
    nav:         { flexDirection: 'row', alignItems: 'center' },
    iconBtn: {
        width: 40, height: 40, borderRadius: 10,
        backgroundColor: 'rgba(255,255,255,0.2)',
        alignItems: 'center', justifyContent: 'center',
    },
    headerGreet: { fontSize: 12, fontWeight: '600', color: PURPLELT },
    headerTitle: { fontSize: 20, fontWeight: '900', color: '#fff', marginTop: 2, letterSpacing: 1 },

    // Hero
    heroBlock:     { alignItems: 'center', gap: 4 },
    heroLabelRow:  { flexDirection: 'row', alignItems: 'center', gap: 6 },
    heroLabel:     { fontSize: 10, fontWeight: '700', color: PURPLELT, letterSpacing: 2 },
    heroAmountRow: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
    heroAmount:    { fontSize: 48, fontWeight: '900', color: '#fff', letterSpacing: -2, lineHeight: 56 },
    heroCurrency:  { fontSize: 24, fontWeight: '700', color: 'rgba(255,255,255,0.8)' },
    heroSub:       { fontSize: 10, fontWeight: '700', color: 'rgba(255,255,255,0.5)', letterSpacing: 1, textTransform: 'uppercase', marginTop: 4 },

    // KPIs
    kpiRow: {
        flexDirection: 'row',
        backgroundColor: PURPLEL,
        borderRadius: 10,
        padding: 16,
    },
    kpiCell:    { flex: 1, alignItems: 'center', gap: 4 },
    kpiSep:     { width: 1, backgroundColor: 'rgba(255,255,255,0.3)', marginHorizontal: 8 },
    kpiIconWrap: { width: 32, height: 32, borderRadius: 8, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' },
    kpiValue:   { fontSize: 28, fontWeight: '900', color: '#fff', lineHeight: 32 },
    kpiLabel:   { fontSize: 9, fontWeight: '700', color: PURPLELT, letterSpacing: 1, textAlign: 'center' },

    // ── Scroll ──
    scroll:        { flex: 1 },
    scrollContent: { paddingHorizontal: 16, paddingTop: 20, paddingBottom: 40, gap: 12 },

    // Alerte
    alertBanner: {
        flexDirection: 'row', alignItems: 'center', gap: 12,
        backgroundColor: '#f5f3ff',
        borderWidth: 2, borderColor: '#ddd6fe',
        borderRadius: 10, padding: 14,
    },
    alertIconWrap: {
        width: 40, height: 40, borderRadius: 10,
        backgroundColor: '#ede9fe',
        alignItems: 'center', justifyContent: 'center',
        flexShrink: 0,
    },
    alertTitle: { fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
    alertSub:   { fontSize: 10, fontWeight: '700', marginTop: 2 },

    // CTAs
    cta: {
        borderRadius: 10,
        paddingVertical: 18,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 10,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.2,
        shadowRadius: 8,
        elevation: 5,
    },
    ctaText: { fontSize: 13, fontWeight: '900', color: '#fff', letterSpacing: 2 },

    // Section
    sectionTitle:  { fontSize: 10, fontWeight: '900', color: '#94a3b8', letterSpacing: 2 },
    sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    sectionLink:   { fontSize: 10, fontWeight: '900', color: PURPLE, letterSpacing: 1 },

    // Modules
    moduleCard: {
        flexDirection: 'row', alignItems: 'center', gap: 12,
        backgroundColor: '#fff', borderRadius: 10, padding: 14,
        borderWidth: 1, borderColor: '#f1f5f9',
    },
    moduleIcon:  { width: 44, height: 44, borderRadius: 10, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
    moduleLabel: { flex: 1, fontSize: 14, fontWeight: '700', color: '#1e293b' },

    // Activités
    activityCard: {
        flexDirection: 'row', alignItems: 'center',
        backgroundColor: '#fff', borderRadius: 10, padding: 14,
        borderWidth: 1, borderColor: '#f1f5f9', gap: 12,
        shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.04, shadowRadius: 4, elevation: 1,
    },
    activityDot:   { width: 40, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
    activityLabel: { fontSize: 13, fontWeight: '700', color: '#1e293b' },
    activitySub:   { fontSize: 10, color: '#94a3b8', marginTop: 2 },
    pendingBadge:  { backgroundColor: '#fef3c7', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, flexShrink: 0 },
    pendingBadgeText: { fontSize: 8, fontWeight: '900', color: '#92400e', letterSpacing: 0.5 },
});
