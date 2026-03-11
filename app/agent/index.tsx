// Dashboard Agent Terrain — fidèle au projet Next.js original
// Design : header CYAN #0891b2, hero enrôlements ce mois, 4 boutons colorés pleins, bannière alertes
import React, { useState, useEffect, useCallback } from 'react';
import {
    View, Text, ScrollView, StyleSheet, TouchableOpacity,
    ActivityIndicator, BackHandler,
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import {
    Users, UserPlus, MapPin, Activity, Shield,
    AlertCircle,
} from 'lucide-react-native';
import { ScreenHeader } from '@/src/components/ui';
import { supabase } from '@/src/lib/supabase';
import { useAuth } from '@/src/context/AuthContext';
import { onSocketEvent } from '@/src/lib/socket';
import { colors } from '@/src/lib/colors';

// ── Constantes de couleur propres à l'Agent ───────────────────────────────────
const CYAN   = '#059669';
const CYAN2  = '#047857'; // cyan-400
const CYANL  = 'rgba(255,255,255,0.15)';
const CYANLT = 'rgba(255,255,255,0.7)';

// ── Actions 2×2 (boutons colorés pleins) ─────────────────────────────────────
const ACTIONS = [
    {
        label: 'Enrôlement', sub: 'Nouveau membre',
        icon: UserPlus, bg: CYAN,
        path: '/agent/enrolement',
    },
    {
        label: 'Secteur', sub: 'Mes boutiques',
        icon: MapPin, bg: '#10b981',
        path: '/agent/secteur',
    },
    {
        label: 'Activités', sub: 'Mon historique',
        icon: Activity, bg: '#f43f5e',
        path: '/agent/activites',
    },
    {
        label: 'Conformité', sub: 'Alertes & Visites',
        icon: Shield, bg: '#f59e0b',
        path: '/agent/conformite',
    },
];

// ── Composant principal ────────────────────────────────────────────────────────
export default function AgentDashboard() {
    const router = useRouter();
    const { user } = useAuth();

    const [enrolledThisMonth, setEnrolledThisMonth] = useState(0);
    const [totalStores,       setTotalStores]       = useState(0);
    const [activeStores7j,    setActiveStores7j]    = useState(0);
    const [criticalPending,   setCriticalPending]   = useState(0);
    const [recentEnroll,      setRecentEnroll]      = useState<any[]>([]);
    const [loading,           setLoading]           = useState(true);

    const fetchDashboard = useCallback(async () => {
        if (!user?.id) return;
        setLoading(true);
        try {
            const monthStart = new Date();
            monthStart.setDate(1);
            monthStart.setHours(0, 0, 0, 0);

            const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

            const [monthRes, totalRes, activeRes, critRes, recentRes] = await Promise.all([
                // Enrôlements ce mois
                supabase
                    .from('demandes_enrolement')
                    .select('*', { count: 'exact', head: true })
                    .eq('agent_id', user.id)
                    .gte('date_demande', monthStart.toISOString()),

                // Total validés (boutiques dans le secteur)
                supabase
                    .from('demandes_enrolement')
                    .select('*', { count: 'exact', head: true })
                    .eq('agent_id', user.id)
                    .eq('statut', 'valide'),

                // Actifs 7 jours (validés récents)
                supabase
                    .from('demandes_enrolement')
                    .select('*', { count: 'exact', head: true })
                    .eq('agent_id', user.id)
                    .eq('statut', 'valide')
                    .gte('date_traitement', sevenDaysAgo.toISOString()),

                // Critiques : en_attente depuis plus de 7 jours
                supabase
                    .from('demandes_enrolement')
                    .select('*', { count: 'exact', head: true })
                    .eq('agent_id', user.id)
                    .eq('statut', 'en_attente')
                    .lt('date_demande', sevenDaysAgo.toISOString()),

                // Enrôlements récents
                supabase
                    .from('demandes_enrolement')
                    .select('*')
                    .eq('agent_id', user.id)
                    .order('date_demande', { ascending: false })
                    .limit(4),
            ]);

            setEnrolledThisMonth(monthRes.count ?? 0);
            setTotalStores(totalRes.count ?? 0);
            setActiveStores7j(activeRes.count ?? 0);
            setCriticalPending(critRes.count ?? 0);
            setRecentEnroll(recentRes.data || []);
        } catch (err) {
            console.error('[AgentDashboard] fetch error:', err);
        } finally {
            setLoading(false);
        }
    }, [user?.id]);

    useEffect(() => { fetchDashboard(); }, [fetchDashboard]);

    useEffect(() => {
        const unsubs = [
            onSocketEvent('enrolement-valide', () => fetchDashboard()),
            onSocketEvent('enrolement-rejete', () => fetchDashboard()),
        ];
        return () => unsubs.forEach(fn => fn());
    }, [fetchDashboard]);

    // Recharge à chaque retour sur l'écran
    useFocusEffect(useCallback(() => { fetchDashboard(); }, [fetchDashboard]));

    // Bouton retour Android sur le dashboard → quitter l'app
    useFocusEffect(useCallback(() => {
        const backHandler = BackHandler.addEventListener('hardwareBackPress', () => {
            BackHandler.exitApp();
            return true;
        });
        return () => backHandler.remove();
    }, []));

    const prenom = user?.name?.split(' ')[0] ?? 'Agent';

    return (
        <View style={s.safe}>

            <ScreenHeader
                title={`Bonjour, ${prenom}`}
                subtitle="Agent Terrain"
                showBack={false}
                showProfile={true}
                showNotification={true}
                paddingBottom={24}
            >
                {/* Hero : enrôlements ce mois */}
                <View style={s.heroBlock}>
                    <View style={s.heroLabelRow}>
                        <Users color={CYANLT} size={14} />
                        <Text style={s.heroLabel}>ENRÔLEMENTS CE MOIS</Text>
                    </View>
                    {loading ? (
                        <ActivityIndicator color="#fff" style={{ marginVertical: 8 }} />
                    ) : (
                        <Text style={s.heroAmount}>{enrolledThisMonth}</Text>
                    )}
                    <Text style={s.heroSub}>
                        {totalStores} boutique{totalStores > 1 ? 's' : ''} dans le réseau
                    </Text>
                </View>

                {/* KPIs : boutiques actives + alertes */}
                <View style={s.kpiRow}>
                    <View style={s.kpiCell}>
                        <Text style={s.kpiValue}>{loading ? '–' : activeStores7j}</Text>
                        <Text style={s.kpiLabel}>BOUTIQUES{'\n'}ACTIVES (7J)</Text>
                    </View>
                    <View style={s.kpiSep} />
                    <View style={s.kpiCell}>
                        <Text style={[s.kpiValue, criticalPending > 0 && { color: '#fca5a5' }]}>
                            {loading ? '–' : criticalPending}
                        </Text>
                        <Text style={s.kpiLabel}>ALERTES{'\n'}CRITIQUES</Text>
                    </View>
                </View>
            </ScreenHeader>

            {/* ════════════════════════════════ CONTENU ══════════════════════════ */}
            <ScrollView
                style={s.scroll}
                contentContainerStyle={s.scrollContent}
                showsVerticalScrollIndicator={false}
                bounces={false}
                overScrollMode="never"
            >
                {/* ── Bannière alerte critique ── */}
                {!loading && criticalPending > 0 && (
                    <TouchableOpacity
                        style={s.alertBanner}
                        activeOpacity={0.85}
                        onPress={() => router.push('/agent/conformite' as any)}
                    >
                        <View style={s.alertIconWrap}>
                            <AlertCircle color="#f43f5e" size={18} />
                        </View>
                        <View style={{ flex: 1 }}>
                            <Text style={s.alertTitle}>
                                {criticalPending} enrôlement{criticalPending > 1 ? 's' : ''} sans validation
                            </Text>
                            <Text style={s.alertSub}>Voir les alertes de conformité →</Text>
                        </View>
                    </TouchableOpacity>
                )}

                {/* ── Grille 4 boutons pleins ── */}
                <Text style={s.sectionTitle}>ACTIONS RAPIDES</Text>
                <View style={s.actionsGrid}>
                    {ACTIONS.map(action => {
                        const Icon = action.icon;
                        return (
                            <TouchableOpacity
                                key={action.label}
                                style={[s.actionBtn, { backgroundColor: action.bg }]}
                                activeOpacity={0.85}
                                onPress={() => router.push(action.path as any)}
                            >
                                <Icon color="#fff" size={28} />
                                <View style={s.actionTextBlock}>
                                    <Text style={s.actionLabel}>{action.label.toUpperCase()}</Text>
                                    <Text style={s.actionSub}>{action.sub}</Text>
                                </View>
                            </TouchableOpacity>
                        );
                    })}
                </View>

                {/* ── Enrôlements récents ── */}
                <View style={s.sectionHeader}>
                    <Text style={s.sectionTitle}>ENRÔLEMENTS RÉCENTS</Text>
                    <TouchableOpacity onPress={() => router.push('/agent/activites' as any)}>
                        <Text style={s.sectionLink}>VOIR TOUT</Text>
                    </TouchableOpacity>
                </View>

                {loading ? (
                    <ActivityIndicator color={CYAN} style={{ marginTop: 16 }} />
                ) : recentEnroll.length === 0 ? (
                    <View style={s.emptyCard}>
                        <UserPlus color="#cbd5e1" size={40} />
                        <Text style={s.emptyText}>AUCUN ENRÔLEMENT EFFECTUÉ</Text>
                        <Text style={s.emptySub}>Commencez par enrôler un nouveau membre</Text>
                    </View>
                ) : (
                    recentEnroll.map(enroll => {
                        const statusColor = enroll.statut === 'valide'
                            ? { bg: '#d1fae5', text: '#065f46', label: 'Validé' }
                            : enroll.statut === 'rejete'
                            ? { bg: '#fee2e2', text: '#991b1b', label: 'Refusé' }
                            : { bg: '#fef3c7', text: '#92400e', label: 'En attente' };
                        return (
                            <TouchableOpacity
                                key={enroll.id}
                                style={s.enrollCard}
                                activeOpacity={0.85}
                                onPress={() => router.push('/agent/activites' as any)}
                            >
                                <View style={s.enrollInfo}>
                                    <Text style={s.enrollName} numberOfLines={1}>
                                        {enroll.nom}
                                    </Text>
                                    <Text style={s.enrollMeta}>
                                        {enroll.type === 'PRODUCER' ? 'Producteur' : 'Marchand'} · {enroll.telephone}
                                    </Text>
                                    <Text style={s.enrollDate}>
                                        {new Date(enroll.date_demande).toLocaleDateString('fr-FR')}
                                    </Text>
                                </View>
                                <View style={[s.statusBadge, { backgroundColor: statusColor.bg }]}>
                                    <Text style={[s.statusText, { color: statusColor.text }]}>
                                        {statusColor.label}
                                    </Text>
                                </View>
                            </TouchableOpacity>
                        );
                    })
                )}
            </ScrollView>
        </View>
    );
}

// ── Styles ─────────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
    safe:   { flex: 1, backgroundColor: '#f8fafc' },

    // Hero
    heroBlock:    { alignItems: 'center', gap: 6 },
    heroLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    heroLabel:    { fontSize: 11, fontWeight: '700', color: CYANLT, letterSpacing: 2 },
    heroAmount:   { fontSize: 56, fontWeight: '900', color: '#fff', letterSpacing: -2, lineHeight: 62 },
    heroSub:      { fontSize: 11, fontWeight: '700', color: 'rgba(255,255,255,0.5)', letterSpacing: 1, textTransform: 'uppercase' },

    // KPI
    kpiRow: {
        flexDirection: 'row',
        backgroundColor: CYANL,
        borderRadius: 10,
        padding: 16,
    },
    kpiCell:  { flex: 1, alignItems: 'center' },
    kpiSep:   { width: 1, backgroundColor: 'rgba(255,255,255,0.3)', marginHorizontal: 8 },
    kpiValue: { fontSize: 32, fontWeight: '900', color: '#fff', lineHeight: 36 },
    kpiLabel: { fontSize: 11, fontWeight: '700', color: CYANLT, letterSpacing: 1, marginTop: 4, textAlign: 'center' },

    // ── Scroll ──
    scroll:        { flex: 1 },
    scrollContent: { paddingHorizontal: 16, paddingTop: 20, paddingBottom: 40, gap: 14 },

    // Alerte bannière
    alertBanner: {
        flexDirection: 'row', alignItems: 'center', gap: 12,
        backgroundColor: '#fff1f2',
        borderWidth: 2, borderColor: '#fecdd3',
        borderRadius: 10, padding: 14,
    },
    alertIconWrap: {
        width: 40, height: 40, borderRadius: 10,
        backgroundColor: '#ffe4e6',
        alignItems: 'center', justifyContent: 'center',
        flexShrink: 0,
    },
    alertTitle: { fontSize: 12, fontWeight: '700', color: '#e11d48', textTransform: 'uppercase', letterSpacing: 0.5 },
    alertSub:   { fontSize: 11, fontWeight: '700', color: '#fb7185', marginTop: 2 },

    // Section
    sectionTitle:  { fontSize: 11, fontWeight: '900', color: '#94a3b8', letterSpacing: 2 },
    sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    sectionLink:   { fontSize: 11, fontWeight: '900', color: CYAN, letterSpacing: 1 },

    // ── Grille actions pleines ──
    actionsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
    actionBtn: {
        width: '47.5%',
        borderRadius: 10,
        paddingVertical: 22,
        paddingHorizontal: 16,
        alignItems: 'center',
        gap: 10,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 3 },
        shadowOpacity: 0.15,
        shadowRadius: 6,
        elevation: 4,
    },
    actionTextBlock: { alignItems: 'center' },
    actionLabel:     { fontSize: 11, fontWeight: '900', color: '#fff', letterSpacing: 1.5 },
    actionSub:       { fontSize: 11, fontWeight: '700', color: 'rgba(255,255,255,0.7)', marginTop: 2, textTransform: 'uppercase', letterSpacing: 0.5 },

    // Enrôlements
    enrollCard: {
        flexDirection: 'row', alignItems: 'center',
        backgroundColor: '#fff', borderRadius: 10, padding: 14,
        borderWidth: 1, borderColor: '#f1f5f9', gap: 10,
        shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.04, shadowRadius: 4, elevation: 1,
    },
    enrollInfo:  { flex: 1, minWidth: 0 },
    enrollName:  { fontSize: 13, fontWeight: '700', color: '#1e293b' },
    enrollMeta:  { fontSize: 11, fontWeight: '600', color: '#64748b', marginTop: 2 },
    enrollDate:  { fontSize: 11, color: '#94a3b8', marginTop: 2 },
    statusBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, flexShrink: 0 },
    statusText:  { fontSize: 11, fontWeight: '700' },

    // Empty
    emptyCard: {
        backgroundColor: '#fff', borderRadius: 10, padding: 40,
        alignItems: 'center', borderWidth: 2, borderColor: '#f1f5f9',
        borderStyle: 'dashed', gap: 8,
    },
    emptyText: { fontSize: 11, fontWeight: '900', color: '#cbd5e1', letterSpacing: 2 },
    emptySub:  { fontSize: 11, color: '#94a3b8', textAlign: 'center' },
});
