// Mes Activités — Agent Terrain
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
    View, Text, ScrollView, StyleSheet, TouchableOpacity,
    ActivityIndicator, RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { ChevronLeft, Activity } from 'lucide-react-native';
import { supabase } from '@/src/lib/supabase';
import { colors } from '@/src/lib/colors';
import { useAuth } from '@/src/context/AuthContext';

// ── Types ──────────────────────────────────────────────────────────────────────
interface Enrollment {
    id: string;
    full_name: string;
    role: 'MERCHANT' | 'PRODUCER';
    phone_number: string;
    status: 'PENDING' | 'VALIDATED' | 'REJECTED';
    created_at: string;
    agent_id: string;
}

type StatusFilter = 'ALL' | 'VALIDATED' | 'PENDING' | 'REJECTED';

// ── Helpers ───────────────────────────────────────────────────────────────────
const STATUS_LABELS: Record<string, string> = {
    PENDING:   'En attente',
    VALIDATED: 'Validé',
    REJECTED:  'Refusé',
};
const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
    PENDING:   { bg: '#fef3c7', text: '#92400e' },
    VALIDATED: { bg: '#d1fae5', text: '#065f46' },
    REJECTED:  { bg: '#fee2e2', text: '#991b1b' },
};
const ROLE_LABELS: Record<string, string> = {
    MERCHANT: 'Marchand',
    PRODUCER: 'Producteur',
};

const STATUS_FILTERS: { key: StatusFilter; label: string }[] = [
    { key: 'ALL',       label: 'Toutes' },
    { key: 'VALIDATED', label: 'Validées' },
    { key: 'PENDING',   label: 'En attente' },
    { key: 'REJECTED',  label: 'Refusées' },
];

// ── Composant principal ────────────────────────────────────────────────────────
export default function Activites() {
    const router = useRouter();
    const { user } = useAuth();

    const [enrollments, setEnrollments] = useState<Enrollment[]>([]);
    const [loading, setLoading]         = useState(true);
    const [refreshing, setRefreshing]   = useState(false);
    const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL');

    const fetchActivities = useCallback(async () => {
        if (!user?.id) return;
        try {
            const { data, error } = await supabase
                .from('enrollments')
                .select('*')
                .eq('agent_id', user.id)
                .order('created_at', { ascending: false });

            if (error) throw error;
            setEnrollments((data as Enrollment[]) || []);
        } catch (err) {
            console.error('[Activites] fetch error:', err);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, [user?.id]);

    useEffect(() => {
        setLoading(true);
        fetchActivities();
    }, [fetchActivities]);

    const onRefresh = useCallback(() => {
        setRefreshing(true);
        fetchActivities();
    }, [fetchActivities]);

    // Recharge à chaque retour sur l'écran
    useFocusEffect(useCallback(() => { fetchActivities(); }, [fetchActivities]));

    const validated = useMemo(() => enrollments.filter(e => e.status === 'VALIDATED').length, [enrollments]);
    const pending   = useMemo(() => enrollments.filter(e => e.status === 'PENDING').length,   [enrollments]);
    const rejected  = useMemo(() => enrollments.filter(e => e.status === 'REJECTED').length,  [enrollments]);

    const filtered = useMemo(() => {
        if (statusFilter === 'ALL') return enrollments;
        return enrollments.filter(e => e.status === statusFilter);
    }, [enrollments, statusFilter]);

    return (
        <SafeAreaView style={styles.safe} edges={['top']}>
            {/* ── HEADER ── */}
            <View style={styles.header}>
                <View style={styles.headerTop}>
                    <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
                        <ChevronLeft color={colors.white} size={20} />
                    </TouchableOpacity>
                    <View style={styles.headerTitleBlock}>
                        <Text style={styles.headerTitle}>MES ACTIVITÉS</Text>
                        <Text style={styles.headerSubtitle}>HISTORIQUE DES ENRÔLEMENTS</Text>
                    </View>
                    <View style={{ width: 40 }} />
                </View>

                {/* KPI 3 stats */}
                <View style={styles.kpiRow}>
                    <View style={styles.kpiCard}>
                        <Text style={[styles.kpiValue, { color: '#86efac' }]}>
                            {loading ? '–' : validated}
                        </Text>
                        <Text style={styles.kpiLabel}>VALIDÉS</Text>
                    </View>
                    <View style={styles.kpiDivider} />
                    <View style={styles.kpiCard}>
                        <Text style={[styles.kpiValue, { color: '#fde68a' }]}>
                            {loading ? '–' : pending}
                        </Text>
                        <Text style={styles.kpiLabel}>EN ATTENTE</Text>
                    </View>
                    <View style={styles.kpiDivider} />
                    <View style={styles.kpiCard}>
                        <Text style={[styles.kpiValue, { color: '#fca5a5' }]}>
                            {loading ? '–' : rejected}
                        </Text>
                        <Text style={styles.kpiLabel}>REFUSÉS</Text>
                    </View>
                </View>
            </View>

            <ScrollView
                style={styles.scroll}
                contentContainerStyle={styles.scrollContent}
                showsVerticalScrollIndicator={false}
                refreshControl={
                    <RefreshControl
                        refreshing={refreshing}
                        onRefresh={onRefresh}
                        colors={[colors.primary]}
                        tintColor={colors.primary}
                    />
                }
            >
                {/* Filtres statut */}
                <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.filterRow}
                >
                    {STATUS_FILTERS.map(f => (
                        <TouchableOpacity
                            key={f.key}
                            style={[styles.filterBtn, statusFilter === f.key && styles.filterBtnActive]}
                            activeOpacity={0.82}
                            onPress={() => setStatusFilter(f.key)}
                        >
                            <Text style={[styles.filterLabel, statusFilter === f.key && styles.filterLabelActive]}>
                                {f.label}
                            </Text>
                        </TouchableOpacity>
                    ))}
                </ScrollView>

                {/* Timeline */}
                {loading ? (
                    <ActivityIndicator color={colors.primary} style={{ marginTop: 32 }} />
                ) : filtered.length === 0 ? (
                    <View style={styles.emptyCard}>
                        <Activity color={colors.slate300} size={40} />
                        <Text style={styles.emptyText}>AUCUNE ACTIVITÉ TROUVÉE</Text>
                    </View>
                ) : (
                    <View style={styles.timeline}>
                        {filtered.map((enroll, index) => {
                            const sc = STATUS_COLORS[enroll.status] ?? STATUS_COLORS.PENDING;
                            const isLast = index === filtered.length - 1;
                            return (
                                <View key={enroll.id} style={styles.timelineItem}>
                                    {/* Ligne de connexion verticale */}
                                    <View style={styles.timelineLeft}>
                                        <View style={[styles.timelineDot, { backgroundColor: sc.text }]} />
                                        {!isLast && <View style={styles.timelineLine} />}
                                    </View>

                                    {/* Contenu */}
                                    <View style={[styles.timelineCard, isLast && { marginBottom: 0 }]}>
                                        <View style={styles.timelineCardTop}>
                                            <Text style={styles.timelineName} numberOfLines={1}>
                                                {enroll.full_name}
                                            </Text>
                                            <View style={[styles.statusBadge, { backgroundColor: sc.bg }]}>
                                                <Text style={[styles.statusText, { color: sc.text }]}>
                                                    {STATUS_LABELS[enroll.status] ?? enroll.status}
                                                </Text>
                                            </View>
                                        </View>
                                        <Text style={styles.timelineRole}>
                                            {ROLE_LABELS[enroll.role] ?? enroll.role}
                                        </Text>
                                        <Text style={styles.timelineDate}>
                                            {new Date(enroll.created_at).toLocaleDateString('fr-FR', {
                                                day: '2-digit', month: 'long', year: 'numeric',
                                            })}
                                        </Text>
                                    </View>
                                </View>
                            );
                        })}
                    </View>
                )}
            </ScrollView>
        </SafeAreaView>
    );
}

// ── Styles ─────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.bgSecondary },

    // Header
    header: {
        backgroundColor: colors.primary,
        paddingHorizontal: 16,
        paddingTop: 8,
        paddingBottom: 24,
        borderBottomLeftRadius: 32,
        borderBottomRightRadius: 32,
        gap: 16,
    },
    headerTop:        { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    backBtn: {
        width: 40, height: 40, borderRadius: 10,
        backgroundColor: 'rgba(255,255,255,0.2)',
        alignItems: 'center', justifyContent: 'center',
    },
    headerTitleBlock: { alignItems: 'center' },
    headerTitle:      { fontSize: 16, fontWeight: '900', color: colors.white, letterSpacing: 1 },
    headerSubtitle:   { fontSize: 10, fontWeight: '700', color: 'rgba(255,255,255,0.65)', letterSpacing: 1, marginTop: 2 },

    // KPI
    kpiRow: {
        flexDirection: 'row',
        backgroundColor: 'rgba(255,255,255,0.15)',
        borderRadius: 10,
        padding: 14,
    },
    kpiCard:    { flex: 1, alignItems: 'center' },
    kpiDivider: { width: 1, backgroundColor: 'rgba(255,255,255,0.3)', marginHorizontal: 6 },
    kpiValue:   { fontSize: 28, fontWeight: '900', lineHeight: 32 },
    kpiLabel:   { fontSize: 8, fontWeight: '700', color: 'rgba(255,255,255,0.7)', letterSpacing: 1, marginTop: 4, textAlign: 'center' },

    // Scroll
    scroll:        { flex: 1 },
    scrollContent: { paddingHorizontal: 16, paddingTop: 20, paddingBottom: 40, gap: 16 },

    // Filters
    filterRow: { flexDirection: 'row', gap: 8, paddingBottom: 4 },
    filterBtn: {
        paddingHorizontal: 14, paddingVertical: 8,
        borderRadius: 8, borderWidth: 1.5, borderColor: colors.slate200,
        backgroundColor: colors.white,
    },
    filterBtnActive:   { borderColor: colors.primary, backgroundColor: colors.primaryBg },
    filterLabel:       { fontSize: 11, fontWeight: '700', color: colors.slate500 },
    filterLabelActive: { color: colors.primary },

    // Timeline
    timeline: { gap: 0 },
    timelineItem: { flexDirection: 'row', gap: 12 },
    timelineLeft: { alignItems: 'center', width: 16 },
    timelineDot: {
        width: 12, height: 12, borderRadius: 6,
        marginTop: 14, flexShrink: 0,
    },
    timelineLine: {
        flex: 1, width: 2,
        backgroundColor: colors.slate200,
        marginVertical: 4,
    },
    timelineCard: {
        flex: 1,
        backgroundColor: colors.white,
        borderRadius: 10,
        padding: 12,
        borderWidth: 1,
        borderColor: colors.slate100,
        marginBottom: 10,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.04,
        shadowRadius: 4,
        elevation: 1,
        gap: 2,
    },
    timelineCardTop: {
        flexDirection: 'row', alignItems: 'center',
        justifyContent: 'space-between', gap: 8,
    },
    timelineName:  { flex: 1, fontSize: 13, fontWeight: '700', color: colors.slate800 },
    timelineRole:  { fontSize: 11, fontWeight: '600', color: colors.slate500 },
    timelineDate:  { fontSize: 10, color: colors.slate400, marginTop: 2 },
    statusBadge:   { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, flexShrink: 0 },
    statusText:    { fontSize: 9, fontWeight: '700' },

    // Empty
    emptyCard: {
        backgroundColor: colors.white, borderRadius: 10, padding: 40,
        alignItems: 'center', borderWidth: 2, borderColor: colors.slate100,
        borderStyle: 'dashed', gap: 12,
    },
    emptyText: { fontSize: 10, fontWeight: '900', color: colors.slate300, letterSpacing: 2 },
});
