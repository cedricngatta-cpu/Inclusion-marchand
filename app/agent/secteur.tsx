// Mon Secteur — Agent Terrain
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
    View, Text, ScrollView, StyleSheet, TouchableOpacity,
    ActivityIndicator, TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ChevronLeft, Search, Users } from 'lucide-react-native';
import { supabase } from '@/src/lib/supabase';
import { colors } from '@/src/lib/colors';
import { useAuth } from '@/src/context/AuthContext';

// ── Types ──────────────────────────────────────────────────────────────────────
interface Enrollment {
    id: string;
    full_name: string;
    role: 'MERCHANT' | 'PRODUCER';
    phone_number: string;
    shop_name: string;
    address: string;
    status: 'PENDING' | 'VALIDATED' | 'REJECTED';
    created_at: string;
    agent_id: string;
}

type FilterType = 'ALL' | 'MERCHANT' | 'PRODUCER';

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

const ROLE_COLORS: Record<string, { bg: string; text: string }> = {
    MERCHANT: { bg: '#dbeafe', text: '#1e40af' },
    PRODUCER: { bg: '#d1fae5', text: '#065f46' },
};
const ROLE_LABELS: Record<string, string> = {
    MERCHANT: 'Marchand',
    PRODUCER: 'Producteur',
};

const FILTERS: { key: FilterType; label: string }[] = [
    { key: 'ALL',      label: 'Tous' },
    { key: 'MERCHANT', label: 'Marchands' },
    { key: 'PRODUCER', label: 'Producteurs' },
];

// ── Composant principal ────────────────────────────────────────────────────────
export default function Secteur() {
    const router = useRouter();
    const { user } = useAuth();

    const [enrollments, setEnrollments] = useState<Enrollment[]>([]);
    const [loading, setLoading]         = useState(true);
    const [search, setSearch]           = useState('');
    const [filter, setFilter]           = useState<FilterType>('ALL');

    const fetchEnrollments = useCallback(async () => {
        if (!user?.id) return;
        setLoading(true);
        try {
            const { data, error } = await supabase
                .from('enrollments')
                .select('*')
                .eq('agent_id', user.id)
                .order('created_at', { ascending: false });

            if (error) throw error;
            setEnrollments((data as Enrollment[]) || []);
        } catch (err) {
            console.error('[Secteur] fetch error:', err);
        } finally {
            setLoading(false);
        }
    }, [user?.id]);

    useEffect(() => { fetchEnrollments(); }, [fetchEnrollments]);

    const filtered = useMemo(() => {
        return enrollments.filter(e => {
            const matchRole = filter === 'ALL' || e.role === filter;
            const q = search.toLowerCase();
            const matchSearch = !q
                || e.full_name.toLowerCase().includes(q)
                || e.phone_number.toLowerCase().includes(q);
            return matchRole && matchSearch;
        });
    }, [enrollments, search, filter]);

    return (
        <SafeAreaView style={styles.safe} edges={['top']}>
            {/* ── HEADER ── */}
            <View style={styles.header}>
                <View style={styles.headerTop}>
                    <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
                        <ChevronLeft color={colors.white} size={20} />
                    </TouchableOpacity>
                    <View style={styles.headerTitleBlock}>
                        <Text style={styles.headerTitle}>MON SECTEUR</Text>
                        <Text style={styles.headerSubtitle}>
                            {loading ? '…' : `${enrollments.length} MEMBRE(S) ENRÔLÉ(S)`}
                        </Text>
                    </View>
                    <View style={{ width: 40 }} />
                </View>

                {/* KPI */}
                <View style={styles.kpiRow}>
                    <View style={styles.kpiCard}>
                        <Text style={styles.kpiValue}>{loading ? '–' : enrollments.length}</Text>
                        <Text style={styles.kpiLabel}>TOTAL ENRÔLÉS</Text>
                    </View>
                    <View style={styles.kpiDivider} />
                    <View style={styles.kpiCard}>
                        <Text style={styles.kpiValue}>
                            {loading ? '–' : enrollments.filter(e => e.status === 'VALIDATED').length}
                        </Text>
                        <Text style={styles.kpiLabel}>VALIDÉS</Text>
                    </View>
                    <View style={styles.kpiDivider} />
                    <View style={styles.kpiCard}>
                        <Text style={styles.kpiValue}>
                            {loading ? '–' : enrollments.filter(e => e.status === 'PENDING').length}
                        </Text>
                        <Text style={styles.kpiLabel}>EN ATTENTE</Text>
                    </View>
                </View>
            </View>

            <ScrollView
                style={styles.scroll}
                contentContainerStyle={styles.scrollContent}
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
            >
                {/* Barre de recherche */}
                <View style={styles.searchBar}>
                    <Search color={colors.slate400} size={16} />
                    <TextInput
                        style={styles.searchInput}
                        placeholder="Rechercher par nom ou téléphone…"
                        placeholderTextColor={colors.slate300}
                        value={search}
                        onChangeText={setSearch}
                        autoCapitalize="none"
                    />
                </View>

                {/* Filtres */}
                <View style={styles.filterRow}>
                    {FILTERS.map(f => (
                        <TouchableOpacity
                            key={f.key}
                            style={[styles.filterBtn, filter === f.key && styles.filterBtnActive]}
                            activeOpacity={0.82}
                            onPress={() => setFilter(f.key)}
                        >
                            <Text style={[styles.filterLabel, filter === f.key && styles.filterLabelActive]}>
                                {f.label}
                            </Text>
                        </TouchableOpacity>
                    ))}
                </View>

                {/* Liste */}
                {loading ? (
                    <ActivityIndicator color={colors.primary} style={{ marginTop: 32 }} />
                ) : filtered.length === 0 ? (
                    <View style={styles.emptyCard}>
                        <Users color={colors.slate300} size={40} />
                        <Text style={styles.emptyText}>AUCUN MEMBRE TROUVÉ</Text>
                    </View>
                ) : (
                    filtered.map(enroll => {
                        const sc   = STATUS_COLORS[enroll.status] ?? STATUS_COLORS.PENDING;
                        const rc   = ROLE_COLORS[enroll.role] ?? ROLE_COLORS.MERCHANT;
                        return (
                            <View key={enroll.id} style={styles.memberCard}>
                                {/* Ligne 1 : nom + badges */}
                                <View style={styles.memberRow}>
                                    <Text style={styles.memberName} numberOfLines={1}>
                                        {enroll.full_name}
                                    </Text>
                                    <View style={styles.badgesRow}>
                                        <View style={[styles.badge, { backgroundColor: rc.bg }]}>
                                            <Text style={[styles.badgeText, { color: rc.text }]}>
                                                {ROLE_LABELS[enroll.role] ?? enroll.role}
                                            </Text>
                                        </View>
                                        <View style={[styles.badge, { backgroundColor: sc.bg }]}>
                                            <Text style={[styles.badgeText, { color: sc.text }]}>
                                                {STATUS_LABELS[enroll.status] ?? enroll.status}
                                            </Text>
                                        </View>
                                    </View>
                                </View>

                                {/* Ligne 2 : téléphone */}
                                <Text style={styles.memberMeta}>{enroll.phone_number}</Text>

                                {/* Ligne 3 : boutique */}
                                {!!enroll.shop_name && (
                                    <Text style={styles.memberShop} numberOfLines={1}>
                                        {enroll.shop_name}
                                    </Text>
                                )}

                                {/* Ligne 4 : adresse */}
                                {!!enroll.address && (
                                    <Text style={styles.memberAddress} numberOfLines={1}>
                                        {enroll.address}
                                    </Text>
                                )}

                                {/* Ligne 5 : date */}
                                <Text style={styles.memberDate}>
                                    Enrôlé le {new Date(enroll.created_at).toLocaleDateString('fr-FR')}
                                </Text>
                            </View>
                        );
                    })
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
    headerTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
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
    kpiValue:   { fontSize: 26, fontWeight: '900', color: colors.white, lineHeight: 30 },
    kpiLabel:   { fontSize: 8, fontWeight: '700', color: 'rgba(255,255,255,0.7)', letterSpacing: 1, marginTop: 4, textAlign: 'center' },

    // Scroll
    scroll:        { flex: 1 },
    scrollContent: { paddingHorizontal: 16, paddingTop: 20, paddingBottom: 40, gap: 12 },

    // Search
    searchBar: {
        flexDirection: 'row', alignItems: 'center', gap: 10,
        backgroundColor: colors.white,
        borderRadius: 10, borderWidth: 1, borderColor: colors.slate200,
        paddingHorizontal: 14, paddingVertical: 10,
    },
    searchInput: { flex: 1, fontSize: 14, color: colors.slate800, fontWeight: '500' },

    // Filters
    filterRow: { flexDirection: 'row', gap: 8 },
    filterBtn: {
        paddingHorizontal: 14, paddingVertical: 8,
        borderRadius: 8, borderWidth: 1.5, borderColor: colors.slate200,
        backgroundColor: colors.white,
    },
    filterBtnActive:   { borderColor: colors.primary, backgroundColor: colors.primaryBg },
    filterLabel:       { fontSize: 11, fontWeight: '700', color: colors.slate500 },
    filterLabelActive: { color: colors.primary },

    // Member cards
    memberCard: {
        backgroundColor: colors.white,
        borderRadius: 10,
        padding: 14,
        borderWidth: 1,
        borderColor: colors.slate100,
        gap: 4,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.04,
        shadowRadius: 4,
        elevation: 1,
    },
    memberRow:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
    memberName:   { flex: 1, fontSize: 13, fontWeight: '700', color: colors.slate800 },
    badgesRow:    { flexDirection: 'row', gap: 4, flexShrink: 0 },
    badge:        { paddingHorizontal: 7, paddingVertical: 3, borderRadius: 6 },
    badgeText:    { fontSize: 9, fontWeight: '700' },
    memberMeta:   { fontSize: 11, fontWeight: '600', color: colors.slate500 },
    memberShop:   { fontSize: 11, fontWeight: '600', color: colors.slate600 },
    memberAddress: { fontSize: 10, color: colors.slate400 },
    memberDate:   { fontSize: 10, color: colors.slate400, marginTop: 2 },

    // Empty
    emptyCard: {
        backgroundColor: colors.white, borderRadius: 10, padding: 40,
        alignItems: 'center', borderWidth: 2, borderColor: colors.slate100,
        borderStyle: 'dashed', gap: 12, marginTop: 8,
    },
    emptyText: { fontSize: 10, fontWeight: '900', color: colors.slate300, letterSpacing: 2 },
});
