// Mon Secteur — Agent Terrain
import React, { useState, useCallback, useMemo } from 'react';
import {
    View, Text, ScrollView, StyleSheet, TouchableOpacity,
    ActivityIndicator, TextInput, Platform, useWindowDimensions,
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { Search, Users } from 'lucide-react-native';
import { ScreenHeader } from '@/src/components/ui';
import { supabase } from '@/src/lib/supabase';
import { colors } from '@/src/lib/colors';
import { useAuth } from '@/src/context/AuthContext';

// ── Types ──────────────────────────────────────────────────────────────────────
interface Enrollment {
    id: string;
    nom: string;
    type: 'MERCHANT' | 'PRODUCER';
    telephone: string;
    nom_boutique: string;
    adresse: string;
    statut: 'en_attente' | 'valide' | 'rejete';
    date_demande: string;
    agent_id: string;
}

type FilterType = 'ALL' | 'MERCHANT' | 'PRODUCER';

// ── Helpers ───────────────────────────────────────────────────────────────────
const STATUS_LABELS: Record<string, string> = {
    en_attente: 'En attente',
    valide:     'Validé',
    rejete:     'Refusé',
};
const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
    en_attente: { bg: '#fef3c7', text: '#92400e' },
    valide:     { bg: '#d1fae5', text: '#065f46' },
    rejete:     { bg: '#fee2e2', text: '#991b1b' },
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
    const { width } = useWindowDimensions();
    const isDesktop = Platform.OS === 'web' && width > 768;

    const [enrollments, setEnrollments] = useState<Enrollment[]>([]);
    const [loading, setLoading]         = useState(true);
    const [search, setSearch]           = useState('');
    const [filter, setFilter]           = useState<FilterType>('ALL');

    const fetchEnrollments = useCallback(async () => {
        if (!user?.id) return;
        setLoading(true);
        try {
            const { data, error } = await supabase
                .from('demandes_enrolement')
                .select('*')
                .eq('agent_id', user.id)
                .order('date_demande', { ascending: false });

            if (error) throw error;
            setEnrollments((data as Enrollment[]) || []);
        } catch (err) {
            console.error('[Secteur] fetch error:', err);
        } finally {
            setLoading(false);
        }
    }, [user?.id]);

    useFocusEffect(useCallback(() => { fetchEnrollments(); }, [fetchEnrollments]));

    const filtered = useMemo(() => {
        return enrollments.filter(e => {
            const matchRole = filter === 'ALL' || e.type === filter;
            const q = search.toLowerCase();
            const matchSearch = !q
                || e.nom.toLowerCase().includes(q)
                || e.telephone.toLowerCase().includes(q);
            return matchRole && matchSearch;
        });
    }, [enrollments, search, filter]);

    return (
        <View style={styles.safe}>
            <ScreenHeader
                title="Mon Secteur"
                subtitle={loading ? undefined : `${enrollments.length} membre(s) enrôlé(s)`}
                showBack={true}
                paddingBottom={24}
            >
                <View style={styles.kpiRow}>
                    <View style={styles.kpiCard}>
                        <Text style={styles.kpiValue}>{loading ? '–' : enrollments.length}</Text>
                        <Text style={styles.kpiLabel}>TOTAL ENRÔLÉS</Text>
                    </View>
                    <View style={styles.kpiDivider} />
                    <View style={styles.kpiCard}>
                        <Text style={styles.kpiValue}>
                            {loading ? '–' : enrollments.filter(e => e.statut === 'valide').length}
                        </Text>
                        <Text style={styles.kpiLabel}>VALIDÉS</Text>
                    </View>
                    <View style={styles.kpiDivider} />
                    <View style={styles.kpiCard}>
                        <Text style={styles.kpiValue}>
                            {loading ? '–' : enrollments.filter(e => e.statut === 'en_attente').length}
                        </Text>
                        <Text style={styles.kpiLabel}>EN ATTENTE</Text>
                    </View>
                </View>
            </ScreenHeader>

            <ScrollView
                style={styles.scroll}
                contentContainerStyle={[styles.scrollContent, isDesktop && dtSc.scrollContent]}
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
            >
                {/* Barre de recherche */}
                <View style={[styles.searchBar, isDesktop && dtSc.searchBar]}>
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
                ) : isDesktop ? (
                    <View style={dtSc.tableCard}>
                        {/* Header tableau desktop */}
                        <View style={dtSc.tableHeader}>
                            <Text style={[dtSc.tableHeaderText, { flex: 2 }]}>NOM</Text>
                            <Text style={[dtSc.tableHeaderText, { flex: 1.5 }]}>TÉLÉPHONE</Text>
                            <Text style={[dtSc.tableHeaderText, { flex: 2 }]}>BOUTIQUE</Text>
                            <Text style={[dtSc.tableHeaderText, { flex: 2 }]}>ADRESSE</Text>
                            <Text style={[dtSc.tableHeaderText, { flex: 1 }]}>TYPE</Text>
                            <Text style={[dtSc.tableHeaderText, { flex: 1 }]}>STATUT</Text>
                            <Text style={[dtSc.tableHeaderText, { flex: 1.5 }]}>DATE</Text>
                        </View>
                        {filtered.map((enroll, index) => {
                            const sc   = STATUS_COLORS[enroll.statut] ?? STATUS_COLORS.en_attente;
                            const rc   = ROLE_COLORS[enroll.type] ?? ROLE_COLORS.MERCHANT;
                            return (
                                <View key={enroll.id} style={[dtSc.tableRow, index % 2 === 1 && dtSc.tableRowAlt]}>
                                    <Text style={[dtSc.tableCell, { flex: 2, fontWeight: '700' }]} numberOfLines={1}>
                                        {enroll.nom}
                                    </Text>
                                    <Text style={[dtSc.tableCell, { flex: 1.5 }]} numberOfLines={1}>
                                        {enroll.telephone}
                                    </Text>
                                    <Text style={[dtSc.tableCell, { flex: 2 }]} numberOfLines={1}>
                                        {enroll.nom_boutique || '—'}
                                    </Text>
                                    <Text style={[dtSc.tableCell, { flex: 2 }]} numberOfLines={1}>
                                        {enroll.adresse || '—'}
                                    </Text>
                                    <View style={{ flex: 1, justifyContent: 'center' }}>
                                        <View style={[styles.badge, { backgroundColor: rc.bg, alignSelf: 'flex-start' }]}>
                                            <Text style={[styles.badgeText, { color: rc.text }]}>
                                                {ROLE_LABELS[enroll.type] ?? enroll.type}
                                            </Text>
                                        </View>
                                    </View>
                                    <View style={{ flex: 1, justifyContent: 'center' }}>
                                        <View style={[styles.badge, { backgroundColor: sc.bg, alignSelf: 'flex-start' }]}>
                                            <Text style={[styles.badgeText, { color: sc.text }]}>
                                                {STATUS_LABELS[enroll.statut] ?? enroll.statut}
                                            </Text>
                                        </View>
                                    </View>
                                    <Text style={[dtSc.tableCell, { flex: 1.5 }]} numberOfLines={1}>
                                        {new Date(enroll.date_demande).toLocaleDateString('fr-FR')}
                                    </Text>
                                </View>
                            );
                        })}
                    </View>
                ) : (
                    filtered.map(enroll => {
                        const sc   = STATUS_COLORS[enroll.statut] ?? STATUS_COLORS.en_attente;
                        const rc   = ROLE_COLORS[enroll.type] ?? ROLE_COLORS.MERCHANT;
                        return (
                            <View key={enroll.id} style={styles.memberCard}>
                                {/* Ligne 1 : nom + badges */}
                                <View style={styles.memberRow}>
                                    <Text style={styles.memberName} numberOfLines={1}>
                                        {enroll.nom}
                                    </Text>
                                    <View style={styles.badgesRow}>
                                        <View style={[styles.badge, { backgroundColor: rc.bg }]}>
                                            <Text style={[styles.badgeText, { color: rc.text }]}>
                                                {ROLE_LABELS[enroll.type] ?? enroll.type}
                                            </Text>
                                        </View>
                                        <View style={[styles.badge, { backgroundColor: sc.bg }]}>
                                            <Text style={[styles.badgeText, { color: sc.text }]}>
                                                {STATUS_LABELS[enroll.statut] ?? enroll.statut}
                                            </Text>
                                        </View>
                                    </View>
                                </View>

                                {/* Ligne 2 : telephone */}
                                <Text style={styles.memberMeta}>{enroll.telephone}</Text>

                                {/* Ligne 3 : boutique */}
                                {!!enroll.nom_boutique && (
                                    <Text style={styles.memberShop} numberOfLines={1}>
                                        {enroll.nom_boutique}
                                    </Text>
                                )}

                                {/* Ligne 4 : adresse */}
                                {!!enroll.adresse && (
                                    <Text style={styles.memberAddress} numberOfLines={1}>
                                        {enroll.adresse}
                                    </Text>
                                )}

                                {/* Ligne 5 : date */}
                                <Text style={styles.memberDate}>
                                    {new Date(enroll.date_demande).toLocaleDateString('fr-FR')}
                                </Text>
                            </View>
                        );
                    })
                )}
            </ScrollView>
        </View>
    );
}

// ── Styles ─────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.bgSecondary },

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
    kpiLabel:   { fontSize: 11, fontWeight: '700', color: 'rgba(255,255,255,0.7)', letterSpacing: 1, marginTop: 4, textAlign: 'center' },

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
    badgeText:    { fontSize: 11, fontWeight: '700' },
    memberMeta:   { fontSize: 11, fontWeight: '600', color: colors.slate500 },
    memberShop:   { fontSize: 11, fontWeight: '600', color: colors.slate600 },
    memberAddress: { fontSize: 11, color: colors.slate400 },
    memberDate:   { fontSize: 11, color: colors.slate400, marginTop: 2 },

    // Empty
    emptyCard: {
        backgroundColor: colors.white, borderRadius: 10, padding: 40,
        alignItems: 'center', borderWidth: 2, borderColor: colors.slate100,
        borderStyle: 'dashed', gap: 12, marginTop: 8,
    },
    emptyText: { fontSize: 11, fontWeight: '900', color: colors.slate300, letterSpacing: 2 },
});

const dtSc = StyleSheet.create({
    scrollContent: {
        maxWidth: 1400,
        alignSelf: 'center' as const,
        width: '100%',
        padding: 32,
    },
    searchBar: {
        maxWidth: 500,
    },
    tableCard: {
        backgroundColor: colors.white,
        borderRadius: 12,
        overflow: 'hidden',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.08,
        shadowRadius: 12,
        elevation: 3,
        borderWidth: 1,
        borderColor: colors.slate100,
    },
    tableHeader: {
        flexDirection: 'row',
        backgroundColor: colors.slate50,
        paddingHorizontal: 16,
        paddingVertical: 12,
        borderBottomWidth: 1,
        borderBottomColor: colors.slate200,
    },
    tableHeaderText: {
        fontSize: 11,
        fontWeight: '900',
        color: colors.slate400,
        letterSpacing: 1,
    },
    tableRow: {
        flexDirection: 'row',
        paddingHorizontal: 16,
        paddingVertical: 12,
        alignItems: 'center',
        borderBottomWidth: 1,
        borderBottomColor: colors.slate100,
    },
    tableRowAlt: {
        backgroundColor: colors.slate50,
    },
    tableCell: {
        fontSize: 13,
        color: colors.slate700,
    },
});
