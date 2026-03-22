// Membres — Coopérative (producteurs uniquement)
import React, { useState, useCallback, useMemo } from 'react';
import {
    View, Text, ScrollView, StyleSheet, TouchableOpacity,
    ActivityIndicator, TextInput, Platform, useWindowDimensions,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { Search, Phone, Users, ChevronRight } from 'lucide-react-native';
import { ScreenHeader } from '@/src/components/ui';
import { supabase } from '@/src/lib/supabase';
import { colors } from '@/src/lib/colors';
import { useAuth } from '@/src/context/AuthContext';

// ── Types ──────────────────────────────────────────────────────────────────────
interface Member {
    id: string;
    full_name: string | null;
    phone_number: string | null;
    role: string | null;
    address: string | null;
    boutique_name: string | null;
    created_at: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
const AVATAR_COLORS = [colors.primary, '#2563eb', '#7c3aed', '#d97706', '#0891b2'];
function getAvatarColor(id: string) {
    let sum = 0;
    for (let i = 0; i < id.length; i++) sum += id.charCodeAt(i);
    return AVATAR_COLORS[sum % AVATAR_COLORS.length];
}

function getDisplayName(m: Member) {
    return m.full_name?.trim() || 'Inconnu';
}

function getInitials(m: Member) {
    const nm = getDisplayName(m);
    const parts = nm.split(' ').filter(Boolean);
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    return nm.slice(0, 2).toUpperCase();
}

// ── Composant principal ────────────────────────────────────────────────────────
export default function MembresScreen() {
    const router = useRouter();
    const { user } = useAuth();
    const { width } = useWindowDimensions();
    const isDesktop = Platform.OS === 'web' && width > 768;

    const [members, setMembers]           = useState<Member[]>([]);
    const [search, setSearch]             = useState('');
    const [loading, setLoading]           = useState(true);

    // ── Fetch liste membres (producteurs) ─────────────────────────────────────
    const fetchMembers = useCallback(async () => {
        setLoading(true);
        try {
            // Essai 1 : filtré par cooperative_id
            let { data, error } = await supabase
                .from('profiles')
                .select('id, full_name, phone_number, role, address, boutique_name, created_at')
                .eq('role', 'PRODUCER')
                .eq('cooperative_id', user?.id ?? '')
                .order('created_at', { ascending: false });

            // Fallback : si cooperative_id n'existe pas ou aucun résultat → tous les PRODUCER
            if (error || !data?.length) {
                console.log('[Membres] fallback sans cooperative_id — raison:', error?.message ?? 'aucun résultat filtré');
                const fallback = await supabase
                    .from('profiles')
                    .select('id, full_name, phone_number, role, address, boutique_name, created_at')
                    .eq('role', 'PRODUCER')
                    .order('created_at', { ascending: false });
                data = fallback.data;
            }

            setMembers((data as Member[]) || []);
        } catch (err) {
            console.error('[Membres] fetch error:', err);
        } finally {
            setLoading(false);
        }
    }, [user]);

    useFocusEffect(useCallback(() => { fetchMembers(); }, [fetchMembers]));

    // ── Filtrage ──────────────────────────────────────────────────────────────
    const filtered = useMemo(() => {
        if (!search.trim()) return members;
        const q = search.trim().toLowerCase();
        return members.filter(m =>
            (m.full_name ?? '').toLowerCase().includes(q) ||
            (m.phone_number ?? '').includes(q) ||
            (m.boutique_name ?? '').toLowerCase().includes(q)
        );
    }, [members, search]);

    // ── Navigation vers le détail ─────────────────────────────────────────────
    const goToDetail = (member: Member) => {
        router.push({
            pathname: '/cooperative/membre-detail',
            params: {
                id:          member.id,
                name:        getDisplayName(member),
                phone:       member.phone_number ?? '',
                address:     member.address ?? '',
                created_at:  member.created_at,
                boutique_name: member.boutique_name ?? '',
            },
        });
    };

    const totalCount = members.length;

    // ── Rendu ─────────────────────────────────────────────────────────────────
    return (
        <View style={styles.safe}>
            <ScreenHeader
                title="Membres"
                subtitle={`${totalCount} producteur${totalCount !== 1 ? 's' : ''}`}
                showBack={true}
                paddingBottom={12}
            >
                <View style={[styles.searchBar, isDesktop && dtMb.searchBar]}>
                    <Search color="rgba(255,255,255,0.6)" size={16} />
                    <TextInput
                        style={styles.searchInput}
                        placeholder="Rechercher par nom, telephone, boutique..."
                        placeholderTextColor="rgba(255,255,255,0.5)"
                        value={search}
                        onChangeText={setSearch}
                    />
                </View>
            </ScreenHeader>

            <ScrollView
                style={styles.scroll}
                contentContainerStyle={[styles.scrollContent, isDesktop && dtMb.scrollContent]}
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
            >
                {/* Resume */}
                <View style={styles.statsRow}>
                    <View style={styles.statCard}>
                        <Text style={styles.statValue}>{totalCount}</Text>
                        <Text style={styles.statLabel}>Total producteurs</Text>
                    </View>
                    <View style={styles.statCard}>
                        <Text style={[styles.statValue, { color: '#2563eb' }]}>{filtered.length}</Text>
                        <Text style={styles.statLabel}>Affiches</Text>
                    </View>
                </View>

                {loading ? (
                    <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />
                ) : filtered.length === 0 ? (
                    <View style={styles.emptyCard}>
                        <Users color={colors.slate300} size={36} />
                        <Text style={styles.emptyText}>Aucun producteur rattache a votre cooperative</Text>
                    </View>
                ) : isDesktop ? (
                    /* -- Desktop : tableau -- */
                    <View style={dtMb.tableCard}>
                        {/* En-tete tableau */}
                        <View style={dtMb.tableHeader}>
                            <Text style={[dtMb.thCell, { flex: 2 }]}>Nom</Text>
                            <Text style={[dtMb.thCell, { flex: 1.5 }]}>Boutique</Text>
                            <Text style={[dtMb.thCell, { flex: 1 }]}>Telephone</Text>
                            <Text style={[dtMb.thCell, { flex: 1 }]}>Inscription</Text>
                            <Text style={[dtMb.thCell, { width: 60, textAlign: 'center' }]}>Detail</Text>
                        </View>
                        {/* Lignes */}
                        {filtered.map((member, idx) => {
                            const av = getAvatarColor(member.id);
                            return (
                                <TouchableOpacity
                                    key={member.id}
                                    style={[dtMb.tableRow, idx % 2 === 1 && dtMb.tableRowAlt]}
                                    activeOpacity={0.7}
                                    onPress={() => goToDetail(member)}
                                >
                                    <View style={[dtMb.tdCell, { flex: 2, flexDirection: 'row', alignItems: 'center', gap: 10 }]}>
                                        <View style={[styles.avatar, { backgroundColor: av, width: 36, height: 36 }]}>
                                            <Text style={[styles.avatarText, { fontSize: 13 }]}>{getInitials(member)}</Text>
                                        </View>
                                        <Text style={styles.cardName} numberOfLines={1}>{getDisplayName(member)}</Text>
                                    </View>
                                    <Text style={[dtMb.tdText, { flex: 1.5 }]} numberOfLines={1}>
                                        {member.boutique_name || '--'}
                                    </Text>
                                    <Text style={[dtMb.tdText, { flex: 1 }]} numberOfLines={1}>
                                        {member.phone_number || '--'}
                                    </Text>
                                    <Text style={[dtMb.tdText, { flex: 1 }]}>
                                        {new Date(member.created_at).toLocaleDateString('fr-FR')}
                                    </Text>
                                    <View style={{ width: 60, alignItems: 'center' }}>
                                        <View style={styles.arrowBox}>
                                            <ChevronRight color={colors.primary} size={18} />
                                        </View>
                                    </View>
                                </TouchableOpacity>
                            );
                        })}
                    </View>
                ) : (
                    /* -- Mobile : cartes -- */
                    filtered.map(member => {
                        const av = getAvatarColor(member.id);
                        return (
                            <TouchableOpacity
                                key={member.id}
                                style={styles.card}
                                activeOpacity={0.82}
                                onPress={() => goToDetail(member)}
                            >
                                {/* Avatar */}
                                <View style={[styles.avatar, { backgroundColor: av }]}>
                                    <Text style={styles.avatarText}>{getInitials(member)}</Text>
                                </View>

                                {/* Infos */}
                                <View style={styles.cardBody}>
                                    <Text style={styles.cardName} numberOfLines={1}>
                                        {getDisplayName(member)}
                                    </Text>
                                    {!!member.boutique_name && (
                                        <Text style={styles.cardBoutique} numberOfLines={1}>
                                            {member.boutique_name}
                                        </Text>
                                    )}
                                    {!!member.phone_number && (
                                        <View style={styles.phoneRow}>
                                            <Phone color={colors.slate400} size={11} />
                                            <Text style={styles.cardPhone}>{member.phone_number}</Text>
                                        </View>
                                    )}
                                    <Text style={styles.cardDate}>
                                        Inscrit le {new Date(member.created_at).toLocaleDateString('fr-FR')}
                                    </Text>
                                </View>

                                {/* Fleche */}
                                <View style={styles.arrowBox}>
                                    <ChevronRight color={colors.primary} size={20} />
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
const styles = StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.bgSecondary },

    searchBar: {
        flexDirection: 'row', alignItems: 'center',
        backgroundColor: 'rgba(255,255,255,0.15)',
        borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, gap: 8,
    },
    searchInput: { flex: 1, fontSize: 13, color: colors.white },

    scroll:        { flex: 1 },
    scrollContent: { paddingTop: 20, paddingHorizontal: 16, paddingBottom: 40, gap: 10 },

    statsRow:  { flexDirection: 'row', gap: 10, marginBottom: 4 },
    statCard:  {
        flex: 1, backgroundColor: colors.white, borderRadius: 10,
        padding: 14, alignItems: 'center',
        borderWidth: 1, borderColor: colors.slate100,
    },
    statValue: { fontSize: 22, fontWeight: '900', color: colors.primary },
    statLabel: { fontSize: 11, fontWeight: '700', color: colors.slate400, marginTop: 2, textAlign: 'center', letterSpacing: 0.5 },

    card: {
        flexDirection: 'row', alignItems: 'center',
        backgroundColor: colors.white, borderRadius: 10, padding: 14,
        borderWidth: 1, borderColor: colors.slate100,
        shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.04, shadowRadius: 4, elevation: 1,
    },
    avatar:      { width: 48, height: 48, borderRadius: 10, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
    avatarText:  { fontSize: 15, fontWeight: '900', color: colors.white },
    cardBody:    { flex: 1, marginLeft: 12, gap: 2 },
    cardName:    { fontSize: 14, fontWeight: '800', color: colors.slate800 },
    cardBoutique:{ fontSize: 11, fontWeight: '600', color: colors.primary },
    phoneRow:    { flexDirection: 'row', alignItems: 'center', gap: 4 },
    cardPhone:   { fontSize: 11, color: colors.slate500 },
    cardDate:    { fontSize: 11, color: colors.slate400 },
    arrowBox:    {
        width: 32, height: 32, borderRadius: 8,
        backgroundColor: '#ecfdf5',
        alignItems: 'center', justifyContent: 'center', flexShrink: 0,
    },

    emptyCard: {
        backgroundColor: colors.white, borderRadius: 10, padding: 40,
        alignItems: 'center', borderWidth: 2, borderColor: colors.slate100,
        borderStyle: 'dashed', gap: 12,
    },
    emptyText: { fontSize: 11, fontWeight: '900', color: colors.slate300, letterSpacing: 2 },
});

// ── Desktop styles ──────────────────────────────────────────────────────────
const dtMb = StyleSheet.create({
    searchBar: {
        maxWidth: 500,
    },
    scrollContent: {
        maxWidth: 1400,
        alignSelf: 'center',
        width: '100%',
        padding: 32,
    },
    tableCard: {
        backgroundColor: colors.white,
        borderRadius: 12,
        overflow: 'hidden',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.08,
        shadowRadius: 8,
        elevation: 4,
        borderWidth: 1,
        borderColor: colors.slate100,
    },
    tableHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#f8fafc',
        paddingVertical: 12,
        paddingHorizontal: 16,
        borderBottomWidth: 1,
        borderBottomColor: colors.slate100,
    },
    thCell: {
        fontSize: 11,
        fontWeight: '800',
        color: colors.slate400,
        letterSpacing: 0.5,
        textTransform: 'uppercase',
    },
    tableRow: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 10,
        paddingHorizontal: 16,
        borderBottomWidth: 1,
        borderBottomColor: '#f1f5f9',
    },
    tableRowAlt: {
        backgroundColor: '#f8fafc',
    },
    tdCell: {
        paddingRight: 8,
    },
    tdText: {
        fontSize: 13,
        color: colors.slate600,
        paddingRight: 8,
    },
});
