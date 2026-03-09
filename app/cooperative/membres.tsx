// Membres — Coopérative
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
    View, Text, ScrollView, StyleSheet, TouchableOpacity,
    ActivityIndicator, TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { ChevronLeft, Search, Phone, Users } from 'lucide-react-native';
import { supabase } from '@/src/lib/supabase';
import { colors } from '@/src/lib/colors';

// ── Types ──────────────────────────────────────────────────────────────────────
interface Member {
    id: string;
    name?: string;
    first_name?: string;
    last_name?: string;
    phone?: string;
    role?: string;
    created_at: string;
    stores?: { name: string } | null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
const FILTER_TABS = [
    { key: 'ALL',      label: 'Tous' },
    { key: 'MERCHANT', label: 'Marchands' },
    { key: 'PRODUCER', label: 'Producteurs' },
    { key: 'AGENT',    label: 'Agents' },
];

const ROLE_CONFIG: Record<string, { bg: string; text: string; label: string }> = {
    MERCHANT: { bg: '#dbeafe', text: '#1e40af', label: 'Marchand' },
    PRODUCER: { bg: '#d1fae5', text: '#065f46', label: 'Producteur' },
    AGENT:    { bg: '#ede9fe', text: '#5b21b6', label: 'Agent' },
};

const AVATAR_COLORS = ['#059669', '#2563eb', '#7c3aed', '#d97706', '#dc2626'];
function getAvatarColor(id: string) {
    let sum = 0;
    for (let i = 0; i < id.length; i++) sum += id.charCodeAt(i);
    return AVATAR_COLORS[sum % AVATAR_COLORS.length];
}

function getDisplayName(m: Member) {
    if (m.name) return m.name;
    const parts = [m.first_name, m.last_name].filter(Boolean);
    return parts.length > 0 ? parts.join(' ') : 'Inconnu';
}

function getInitials(m: Member) {
    const nm = getDisplayName(m);
    const parts = nm.split(' ');
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    return nm.slice(0, 2).toUpperCase();
}

// ── Composant principal ────────────────────────────────────────────────────────
export default function MembresScreen() {
    const router = useRouter();

    const [members, setMembers]         = useState<Member[]>([]);
    const [activeFilter, setActiveFilter] = useState('ALL');
    const [search, setSearch]           = useState('');
    const [loading, setLoading]         = useState(true);

    const fetchMembers = useCallback(async () => {
        setLoading(true);
        try {
            const { data } = await supabase
                .from('profiles')
                .select('*, stores(name)')
                .order('created_at', { ascending: false });
            setMembers((data as Member[]) || []);
        } catch (err) {
            console.error('[Membres] fetch error:', err);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { fetchMembers(); }, [fetchMembers]);

    useFocusEffect(useCallback(() => { fetchMembers(); }, [fetchMembers]));

    const filtered = useMemo(() => {
        let list = members;
        if (activeFilter !== 'ALL') list = list.filter(m => m.role === activeFilter);
        if (search.trim()) {
            const q = search.trim().toLowerCase();
            list = list.filter(m =>
                getDisplayName(m).toLowerCase().includes(q) ||
                (m.phone ?? '').includes(q)
            );
        }
        return list;
    }, [members, activeFilter, search]);

    const totalCount    = members.length;
    const activePercent = totalCount > 0
        ? Math.round(members.filter(m => m.role && m.role !== '').length / totalCount * 100)
        : 0;

    return (
        <SafeAreaView style={styles.safe} edges={['top']}>
            {/* ── HEADER ── */}
            <View style={styles.header}>
                <View style={styles.headerTop}>
                    <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
                        <ChevronLeft color={colors.white} size={20} />
                    </TouchableOpacity>
                    <View style={{ flex: 1, marginLeft: 12 }}>
                        <Text style={styles.headerTitle}>MEMBRES</Text>
                        <Text style={styles.headerSub}>{totalCount} MEMBRE{totalCount !== 1 ? 'S' : ''} AU TOTAL</Text>
                    </View>
                </View>

                {/* Barre de recherche */}
                <View style={styles.searchBar}>
                    <Search color="rgba(255,255,255,0.6)" size={16} />
                    <TextInput
                        style={styles.searchInput}
                        placeholder="Rechercher par nom ou téléphone…"
                        placeholderTextColor="rgba(255,255,255,0.5)"
                        value={search}
                        onChangeText={setSearch}
                    />
                </View>

                {/* Filtres */}
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabsScroll}>
                    {FILTER_TABS.map(tab => (
                        <TouchableOpacity
                            key={tab.key}
                            style={[styles.tab, activeFilter === tab.key && styles.tabActive]}
                            onPress={() => setActiveFilter(tab.key)}
                        >
                            <Text style={[styles.tabText, activeFilter === tab.key && styles.tabTextActive]}>
                                {tab.label}
                            </Text>
                        </TouchableOpacity>
                    ))}
                </ScrollView>
            </View>

            {/* ── CONTENU ── */}
            <ScrollView
                style={styles.scroll}
                contentContainerStyle={styles.scrollContent}
                showsVerticalScrollIndicator={false}
            >
                {/* Stats résumé */}
                <View style={styles.statsRow}>
                    <View style={styles.statCard}>
                        <Text style={styles.statValue}>{totalCount}</Text>
                        <Text style={styles.statLabel}>Total membres</Text>
                    </View>
                    <View style={styles.statCard}>
                        <Text style={styles.statValue}>{activePercent}%</Text>
                        <Text style={styles.statLabel}>Avec rôle assigné</Text>
                    </View>
                    <View style={styles.statCard}>
                        <Text style={styles.statValue}>{filtered.length}</Text>
                        <Text style={styles.statLabel}>Résultats</Text>
                    </View>
                </View>

                {loading ? (
                    <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />
                ) : filtered.length === 0 ? (
                    <View style={styles.emptyCard}>
                        <Users color={colors.slate300} size={36} />
                        <Text style={styles.emptyText}>AUCUN MEMBRE TROUVÉ</Text>
                    </View>
                ) : (
                    filtered.map(member => {
                        const rc   = ROLE_CONFIG[member.role ?? ''] ?? { bg: colors.slate100, text: colors.slate600, label: member.role ?? 'Inconnu' };
                        const init = getInitials(member);
                        const av   = getAvatarColor(member.id);

                        return (
                            <View key={member.id} style={styles.card}>
                                <View style={[styles.avatar, { backgroundColor: av }]}>
                                    <Text style={styles.avatarText}>{init}</Text>
                                </View>
                                <View style={{ flex: 1, marginLeft: 12 }}>
                                    <Text style={styles.cardName} numberOfLines={1}>{getDisplayName(member)}</Text>
                                    {member.stores?.name && (
                                        <Text style={styles.cardStore} numberOfLines={1}>{member.stores.name}</Text>
                                    )}
                                    {member.phone && (
                                        <View style={styles.phoneRow}>
                                            <Phone color={colors.slate400} size={11} />
                                            <Text style={styles.cardPhone}>{member.phone}</Text>
                                        </View>
                                    )}
                                    <Text style={styles.cardDate}>
                                        Inscrit le {new Date(member.created_at).toLocaleDateString('fr-FR')}
                                    </Text>
                                </View>
                                <View style={[styles.badge, { backgroundColor: rc.bg }]}>
                                    <Text style={[styles.badgeText, { color: rc.text }]}>{rc.label}</Text>
                                </View>
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

    header: {
        backgroundColor: colors.primary,
        paddingHorizontal: 16,
        paddingTop: 8,
        paddingBottom: 24,
        borderBottomLeftRadius: 32,
        borderBottomRightRadius: 32,
        gap: 14,
    },
    headerTop:   { flexDirection: 'row', alignItems: 'center' },
    headerTitle: { fontSize: 18, fontWeight: '900', color: colors.white },
    headerSub:   { fontSize: 11, fontWeight: '700', color: 'rgba(255,255,255,0.6)', marginTop: 2, letterSpacing: 1 },
    backBtn: {
        width: 40, height: 40, borderRadius: 10,
        backgroundColor: 'rgba(255,255,255,0.2)',
        alignItems: 'center', justifyContent: 'center',
    },

    searchBar: {
        flexDirection: 'row', alignItems: 'center',
        backgroundColor: 'rgba(255,255,255,0.15)',
        borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8,
        gap: 8,
    },
    searchInput: { flex: 1, fontSize: 13, color: colors.white },

    tabsScroll: { flexGrow: 0 },
    tab: {
        paddingHorizontal: 14, paddingVertical: 7,
        borderRadius: 8,
        backgroundColor: 'rgba(255,255,255,0.15)',
        marginRight: 8,
    },
    tabActive:     { backgroundColor: colors.white },
    tabText:       { fontSize: 12, fontWeight: '700', color: 'rgba(255,255,255,0.8)' },
    tabTextActive: { color: colors.primary },

    scroll:        { flex: 1 },
    scrollContent: { paddingTop: 20, paddingHorizontal: 16, paddingBottom: 40, gap: 10 },

    statsRow: { flexDirection: 'row', gap: 8, marginBottom: 4 },
    statCard: {
        flex: 1, backgroundColor: colors.white,
        borderRadius: 10, padding: 12,
        alignItems: 'center',
        borderWidth: 1, borderColor: colors.slate100,
    },
    statValue: { fontSize: 20, fontWeight: '900', color: colors.primary },
    statLabel: { fontSize: 9, fontWeight: '700', color: colors.slate400, marginTop: 2, textAlign: 'center' },

    card: {
        flexDirection: 'row', alignItems: 'center',
        backgroundColor: colors.white,
        borderRadius: 10, padding: 14,
        borderWidth: 1, borderColor: colors.slate100,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.04,
        shadowRadius: 4,
        elevation: 1,
    },
    avatar: {
        width: 44, height: 44, borderRadius: 10,
        alignItems: 'center', justifyContent: 'center',
        flexShrink: 0,
    },
    avatarText: { fontSize: 14, fontWeight: '900', color: colors.white },
    cardName:   { fontSize: 13, fontWeight: '800', color: colors.slate800 },
    cardStore:  { fontSize: 11, fontWeight: '600', color: colors.slate500, marginTop: 1 },
    phoneRow:   { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
    cardPhone:  { fontSize: 11, color: colors.slate500 },
    cardDate:   { fontSize: 10, color: colors.slate400, marginTop: 2 },
    badge:      { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, flexShrink: 0 },
    badgeText:  { fontSize: 9, fontWeight: '700' },

    emptyCard: {
        backgroundColor: colors.white, borderRadius: 10, padding: 40,
        alignItems: 'center', borderWidth: 2, borderColor: colors.slate100,
        borderStyle: 'dashed', gap: 12,
    },
    emptyText: { fontSize: 10, fontWeight: '900', color: colors.slate300, letterSpacing: 2 },
});
