// Dashboard Admin — Tableau de bord global de supervision
import React, { useState, useEffect, useCallback } from 'react';
import {
    View, Text, ScrollView, StyleSheet, ActivityIndicator, RefreshControl, BackHandler, Platform, useWindowDimensions,
} from 'react-native';
import { TouchableOpacity } from 'react-native-gesture-handler';
import { useRouter, useFocusEffect } from 'expo-router';
import {
    TrendingUp, Users, ShoppingBag, Package,
    BarChart2, Shield, AlertCircle, Activity, UserPlus,
} from 'lucide-react-native';
import { ScreenHeader } from '@/src/components/ui';
import { supabase } from '@/src/lib/supabase';
import { colors } from '@/src/lib/colors';
import { onSocketEvent } from '@/src/lib/socket';
import { useAuth } from '@/src/context/AuthContext';

// CARD_W calculé dynamiquement dans le composant (voir ci-dessous)

// ── Types ──────────────────────────────────────────────────────────────────────
interface DashboardData {
    totalUsers: number;
    merchants: number;
    producers: number;
    agents: number;
    cooperatives: number;
    todayTxCount: number;
    todayTotal: number;
    monthRevenue: number;
    productsCount: number;
    activeOrdersCount: number;
    pendingEnroll: number;
    todayMomo: number;
}

interface ActivityLog {
    id: string;
    user_name: string;
    action: string;
    details: string;
    type: string;
    created_at: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function relativeTime(dateStr: string): string {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "à l'instant";
    if (mins < 60) return `il y a ${mins} min`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `il y a ${hrs}h`;
    const days = Math.floor(hrs / 24);
    return `il y a ${days}j`;
}

const TYPE_COLORS: Record<string, { bg: string; icon: string }> = {
    vente:       { bg: '#d1fae5', icon: '#065f46' },
    enrolement:  { bg: '#dbeafe', icon: '#1e40af' },
    commande:    { bg: '#ede9fe', icon: '#5b21b6' },
    signalement: { bg: '#fee2e2', icon: '#991b1b' },
    stock:       { bg: '#fef3c7', icon: '#92400e' },
    default:     { bg: '#f1f5f9', icon: '#475569' },
};

// ── Composant principal ────────────────────────────────────────────────────────
const ROLE_ROUTES: Record<string, string> = {
    MERCHANT:    '/(tabs)/commercant',
    PRODUCER:    '/producteur',
    COOPERATIVE: '/cooperative',
    FIELD_AGENT: '/agent',
    SUPERVISOR:  '/admin',
};

export default function AdminDashboard() {
    const router = useRouter();
    const { user } = useAuth();
    const { width } = useWindowDimensions();
    const isDesktop = Platform.OS === 'web' && width > 768;

    // Garde de route — redirige si pas SUPERVISOR
    useEffect(() => {
        if (user && user.role !== 'SUPERVISOR') {
            router.replace((ROLE_ROUTES[user.role] ?? '/(tabs)/commercant') as any);
        }
    }, [user?.role]);
    const contentW  = isDesktop ? width - 250 : width;
    const CARD_W    = Math.floor((contentW - (isDesktop ? 96 : 48)) / (isDesktop ? 3 : 2));

    const [data, setData]           = useState<DashboardData | null>(null);
    const [activityLogs, setActivityLogs] = useState<ActivityLog[]>([]);
    const [loading, setLoading]     = useState(true);
    const [refreshing, setRefreshing] = useState(false);

    const fetchDashboard = useCallback(async () => {
        try {
            const todayStart = new Date();
            todayStart.setHours(0, 0, 0, 0);
            const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();

            const [
                totalRes, merchantsRes, producersRes, agentsRes, coopRes,
                todayTxRes, monthTxRes, productsRes, ordersRes, pendingRes,
            ] = await Promise.all([
                supabase.from('profiles').select('*', { count: 'exact', head: true }),
                supabase.from('profiles').select('*', { count: 'exact', head: true }).ilike('role', '%merchant%'),
                supabase.from('profiles').select('*', { count: 'exact', head: true }).ilike('role', '%producer%'),
                supabase.from('profiles').select('*', { count: 'exact', head: true }).ilike('role', '%agent%'),
                supabase.from('profiles').select('*', { count: 'exact', head: true }).ilike('role', '%cooperative%'),
                supabase.from('transactions').select('price, status').gte('created_at', todayStart.toISOString()),
                supabase.from('transactions').select('price').gte('created_at', monthStart),
                supabase.from('products').select('*', { count: 'exact', head: true }),
                supabase.from('orders').select('*', { count: 'exact', head: true }).in('status', ['PENDING', 'ACCEPTED']),
                supabase.from('demandes_enrolement').select('*', { count: 'exact', head: true }).eq('statut', 'en_attente'),
            ]);

            const todayTxArr = (todayTxRes.data ?? []) as { price: number; status: string }[];
            const monthTxArr = (monthTxRes.data ?? []) as { price: number }[];

            setData({
                totalUsers:        totalRes.count     ?? 0,
                merchants:         merchantsRes.count  ?? 0,
                producers:         producersRes.count  ?? 0,
                agents:            agentsRes.count     ?? 0,
                cooperatives:      coopRes.count       ?? 0,
                todayTxCount:      todayTxArr.length,
                todayTotal:        todayTxArr.reduce((s, t) => s + (t.price ?? 0), 0),
                todayMomo:         todayTxArr.filter(t => t.status === 'MOMO').reduce((s, t) => s + (t.price ?? 0), 0),
                monthRevenue:      monthTxArr.reduce((s, t) => s + (t.price ?? 0), 0),
                productsCount:     productsRes.count   ?? 0,
                activeOrdersCount: ordersRes.count     ?? 0,
                pendingEnroll:     pendingRes.count    ?? 0,
            });

            // Logs d'activité — table optionnelle
            try {
                const { data: logs } = await supabase
                    .from('activity_logs')
                    .select('*')
                    .order('created_at', { ascending: false })
                    .limit(8);
                setActivityLogs((logs as ActivityLog[]) ?? []);
            } catch {
                // Fallback : transactions récentes
                const { data: recentTx } = await supabase
                    .from('transactions')
                    .select('id, price, client_name, type, created_at')
                    .order('created_at', { ascending: false })
                    .limit(8);
                setActivityLogs(
                    (recentTx ?? []).map((t: any) => ({
                        id: t.id,
                        user_name: t.client_name ?? 'Client',
                        action: `Vente enregistrée — ${(t.price ?? 0).toLocaleString('fr-FR')} F`,
                        details: '',
                        type: 'vente',
                        created_at: t.created_at,
                    }))
                );
            }
        } catch (err) {
            console.error('[AdminDashboard] fetch error:', err);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, []);

    useEffect(() => { fetchDashboard(); }, [fetchDashboard]);

    useEffect(() => {
        const unsubs = [
            onSocketEvent('nouvelle-vente',         () => fetchDashboard()),
            onSocketEvent('nouvel-enrolement',      () => fetchDashboard()),
            onSocketEvent('enrolement-valide',      () => fetchDashboard()),
            onSocketEvent('enrolement-rejete',      () => fetchDashboard()),
            onSocketEvent('nouveau-produit-marche', () => fetchDashboard()),
            onSocketEvent('nouvelle-commande',      () => fetchDashboard()),
            onSocketEvent('commande-acceptee',      () => fetchDashboard()),
            onSocketEvent('commande-refusee',       () => fetchDashboard()),
            onSocketEvent('livraison-en-cours',     () => fetchDashboard()),
            onSocketEvent('livraison-terminee',     () => fetchDashboard()),
            onSocketEvent('signalement-conformite', () => fetchDashboard()),
            onSocketEvent('achat-groupe-cree',      () => fetchDashboard()),
            onSocketEvent('achat-groupe-rejoint',   () => fetchDashboard()),
            onSocketEvent('prix-groupe-propose',    () => fetchDashboard()),
            onSocketEvent('prix-groupe-accepte',    () => fetchDashboard()),
            onSocketEvent('demande-prix-groupe',    () => fetchDashboard()),
        ];
        return () => unsubs.forEach(fn => fn());
    }, [fetchDashboard]);

    // eslint-disable-next-line react-hooks/exhaustive-deps
    useFocusEffect(useCallback(() => { fetchDashboard(); }, []));

    // Bouton retour Android sur le dashboard → quitter l'app (Android uniquement)
    useFocusEffect(useCallback(() => {
        if (Platform.OS !== 'android') return;
        const backHandler = BackHandler.addEventListener('hardwareBackPress', () => {
            BackHandler.exitApp();
            return true;
        });
        return () => backHandler.remove();
    }, []));

    const onRefresh = () => { setRefreshing(true); fetchDashboard(); };

    const d = data;

    // ── Stats grid config ──────────────────────────────────────────────────────
    const statsGrid = [
        {
            label: 'VENTES AUJOURD\'HUI',
            topColor: '#f59e0b',
            value: loading ? '–' : String(d?.todayTxCount ?? 0),
            sub: loading ? '' : `${(d?.todayTotal ?? 0).toLocaleString('fr-FR')} F`,
        },
        {
            label: 'CA DU MOIS',
            topColor: '#059669',
            value: loading ? '–' : `${Math.round((d?.monthRevenue ?? 0) / 1000)}k`,
            sub: 'F CFA',
        },
        {
            label: 'MARCHÉ VIRTUEL',
            topColor: '#3b82f6',
            value: loading ? '–' : String(d?.productsCount ?? 0),
            sub: 'produits en ligne',
        },
        {
            label: 'COMMANDES B2B',
            topColor: '#8b5cf6',
            value: loading ? '–' : String(d?.activeOrdersCount ?? 0),
            sub: 'actives',
        },
        {
            label: 'ENRÔLEMENTS EN ATTENTE',
            topColor: '#ef4444',
            value: loading ? '–' : String(d?.pendingEnroll ?? 0),
            sub: 'à traiter',
            highlight: (d?.pendingEnroll ?? 0) > 0,
        },
        {
            label: 'MEMBRES ACTIFS',
            topColor: '#64748b',
            value: loading ? '–' : String(d?.totalUsers ?? 0),
            sub: 'utilisateurs',
        },
        {
            label: 'MOBILE MONEY',
            topColor: '#0891b2',
            value: loading ? '–' : `${Math.round((d?.todayMomo ?? 0) / 1000)}k`,
            sub: 'F encaissés aujourd\'hui',
        },
    ];

    // ── Navigation modules ─────────────────────────────────────────────────────
    const NAV_MODULES = [
        { label: 'Utilisateurs',  bg: '#0891b2', Icon: Users,      route: '/admin/utilisateurs' },
        { label: 'Enrôlements',   bg: '#059669', Icon: UserPlus,    route: '/admin/enrolements' },
        { label: 'Transactions',  bg: '#16a34a', Icon: TrendingUp,  route: '/admin/transactions' },
        { label: 'Produits',      bg: '#d97706', Icon: Package,     route: '/admin/produits' },
        { label: 'Commandes',     bg: '#2563eb', Icon: ShoppingBag, route: '/admin/commandes' },
        { label: 'Signalements',  bg: '#dc2626', Icon: Shield,      route: '/admin/signalements' },
        { label: 'Statistiques',  bg: '#7c3aed', Icon: BarChart2,   route: '/admin/statistiques' },
    ];

    return (
        <View style={s.safe}>
            <ScreenHeader
                title="Administration"
                subtitle="Tableau de bord"
                showBack={false}
                showProfile={true}
                showNotification={true}
                paddingBottom={24}
            >
                {/* Hero réseau */}
                <View style={s.heroBlock}>
                    <Text style={s.heroNetworkLabel}>RÉSEAU INCLUSION MARCHAND</Text>
                    {loading ? (
                        <ActivityIndicator color={colors.white} style={{ marginVertical: 8 }} />
                    ) : (
                        <Text style={s.heroTotalUsers}>{d?.totalUsers ?? 0}</Text>
                    )}
                    <Text style={s.heroNetworkSub}>
                        {d?.merchants ?? 0} marchands · {d?.producers ?? 0} producteurs · {d?.agents ?? 0} agents · {d?.cooperatives ?? 0} coopératives
                    </Text>
                </View>
            </ScreenHeader>

            {/* ════════════════ CONTENU ════════════════ */}
            <ScrollView
                style={s.scroll}
                contentContainerStyle={[s.scrollContent, isDesktop && { paddingHorizontal: 24 }]}
                showsVerticalScrollIndicator={false}
                bounces={false}
                overScrollMode="never"
                refreshControl={
                    <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.primary]} />
                }
            >
                {/* ── Alerte enrôlements ── */}
                {(d?.pendingEnroll ?? 0) > 0 && (
                    <TouchableOpacity
                        style={s.alertBanner}
                        activeOpacity={0.85}
                        onPress={() => router.push('/admin/enrolements' as any)}
                    >
                        <AlertCircle color="#92400e" size={18} />
                        <Text style={s.alertBannerText} numberOfLines={1}>
                            {d!.pendingEnroll} demande{d!.pendingEnroll > 1 ? 's' : ''} d'enrôlement en attente
                        </Text>
                        <Text style={s.alertBannerLink}>Traiter →</Text>
                    </TouchableOpacity>
                )}

                {/* ── Grille stats 2 col mobile / 3 col desktop ── */}
                <View style={s.statsGrid}>
                    {statsGrid.map((stat, i) => (
                        <View key={i} style={[s.statCard, { borderTopColor: stat.topColor }, isDesktop && { width: '31.5%' }]}>
                            <Text style={s.statLabel}>{stat.label}</Text>
                            <Text style={[s.statValue, stat.highlight && { color: '#ef4444' }]}>
                                {stat.value}
                            </Text>
                            <Text style={s.statSub}>{stat.sub}</Text>
                        </View>
                    ))}
                </View>

                {/* ── Section modules ── */}
                <Text style={s.sectionTitle}>MODULES D'ADMINISTRATION</Text>

                <View style={s.navGrid}>
                    {NAV_MODULES.map(mod => (
                        <TouchableOpacity
                            key={mod.route}
                            style={[s.navCard, { backgroundColor: mod.bg, width: CARD_W }]}
                            activeOpacity={0.85}
                            onPress={() => router.push(mod.route as any)}
                        >
                            <mod.Icon color={colors.white} size={26} />
                            <Text style={s.navCardLabel} numberOfLines={1}>{mod.label}</Text>
                        </TouchableOpacity>
                    ))}
                </View>

                {/* ── Activité récente ── */}
                <Text style={s.sectionTitle}>ACTIVITÉ RÉCENTE</Text>

                {loading ? (
                    <ActivityIndicator color={colors.primary} style={{ marginTop: 12 }} />
                ) : activityLogs.length === 0 ? (
                    <View style={s.emptyCard}>
                        <Activity color={colors.slate300} size={36} />
                        <Text style={s.emptyText}>AUCUNE ACTIVITÉ RÉCENTE</Text>
                    </View>
                ) : (
                    activityLogs.map(log => {
                        const tc = TYPE_COLORS[log.type] ?? TYPE_COLORS.default;
                        return (
                            <View key={log.id} style={s.activityRow}>
                                <View style={[s.activityIcon, { backgroundColor: tc.bg }]}>
                                    <Activity color={tc.icon} size={16} />
                                </View>
                                <View style={s.activityInfo}>
                                    <Text style={s.activityAction} numberOfLines={1}>{log.action}</Text>
                                    <Text style={s.activityUser} numberOfLines={1}>{log.user_name}</Text>
                                </View>
                                <Text style={s.activityTime}>{relativeTime(log.created_at)}</Text>
                            </View>
                        );
                    })
                )}
            </ScrollView>
        </View>
    );
}

// ── Styles ─────────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
    safe: { flex: 1, backgroundColor: '#f8fafc' },

    // Hero
    heroBlock:        { alignItems: 'center', gap: 4 },
    heroNetworkLabel: { fontSize: 11, fontWeight: '700', color: 'rgba(255,255,255,0.7)', letterSpacing: 2, textTransform: 'uppercase' },
    heroTotalUsers:   { fontSize: 56, fontWeight: '900', color: '#fff', lineHeight: 64, letterSpacing: -3 },
    heroNetworkSub:   { fontSize: 11, fontWeight: '600', color: 'rgba(255,255,255,0.6)', textAlign: 'center', paddingHorizontal: 8 },

    // Scroll
    scroll:        { flex: 1 },
    scrollContent: { paddingHorizontal: 16, paddingTop: 20, paddingBottom: 40, gap: 12 },

    // Alerte banner
    alertBanner: {
        flexDirection: 'row', alignItems: 'center', gap: 10,
        backgroundColor: '#fffbeb',
        borderRadius: 10, padding: 14,
        borderWidth: 1, borderColor: '#fde68a',
    },
    alertBannerText: { flex: 1, fontSize: 12, fontWeight: '700', color: '#92400e' },
    alertBannerLink: { fontSize: 12, fontWeight: '900', color: '#d97706', flexShrink: 0 },

    // Stats grid 2 colonnes
    statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
    statCard: {
        width: '47.5%',
        backgroundColor: '#fff',
        borderRadius: 10,
        borderTopWidth: 3,
        padding: 14,
        gap: 3,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.05,
        shadowRadius: 4,
        elevation: 1,
        borderWidth: 1,
        borderColor: '#f1f5f9',
    },
    statLabel: { fontSize: 11, fontWeight: '800', color: '#94a3b8', letterSpacing: 1.2, textTransform: 'uppercase' },
    statValue: { fontSize: 22, fontWeight: '900', color: '#1e293b', lineHeight: 26 },
    statSub:   { fontSize: 11, fontWeight: '600', color: '#94a3b8' },

    // Section titre
    sectionTitle: { fontSize: 11, fontWeight: '900', color: '#94a3b8', letterSpacing: 2, textTransform: 'uppercase' },

    // Nav grid 2 colonnes — largeur fixe en pixels via Dimensions
    navGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
    navCard: {
        // width injecté inline via CARD_W
        height: 90,
        borderRadius: 10,
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.15,
        shadowRadius: 6,
        elevation: 4,
    },
    navCardLabel: { fontSize: 13, fontWeight: '700', color: '#fff', letterSpacing: 0, textAlign: 'center', paddingHorizontal: 4 },

    // Activité
    activityRow: {
        flexDirection: 'row', alignItems: 'center', gap: 12,
        backgroundColor: '#fff', borderRadius: 10, padding: 12,
        borderWidth: 1, borderColor: '#f1f5f9',
        shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.04, shadowRadius: 4, elevation: 1,
    },
    activityIcon: {
        width: 40, height: 40, borderRadius: 10,
        alignItems: 'center', justifyContent: 'center', flexShrink: 0,
    },
    activityInfo:   { flex: 1, minWidth: 0, gap: 2 },
    activityAction: { fontSize: 12, fontWeight: '700', color: '#1e293b' },
    activityUser:   { fontSize: 11, color: '#94a3b8' },
    activityTime:   { fontSize: 11, color: '#94a3b8', flexShrink: 0 },

    // Empty
    emptyCard: {
        backgroundColor: '#fff', borderRadius: 10, padding: 40,
        alignItems: 'center', borderWidth: 2, borderColor: '#f1f5f9',
        borderStyle: 'dashed', gap: 8,
    },
    emptyText: { fontSize: 11, fontWeight: '900', color: '#cbd5e1', letterSpacing: 2 },
});
