// Utilisateurs — Admin : liste, recherche, gestion des profils
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
    View, Text, ScrollView, StyleSheet, ActivityIndicator, TextInput,
    Alert, RefreshControl, Modal,
} from 'react-native';
import { TouchableOpacity } from 'react-native-gesture-handler';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { ChevronLeft, ChevronRight, X, User } from 'lucide-react-native';
import { supabase } from '@/src/lib/supabase';
import { colors } from '@/src/lib/colors';
import { useAuth } from '@/src/context/AuthContext';

// ── Types ──────────────────────────────────────────────────────────────────────
interface Profile {
    id: string;
    full_name: string;
    phone_number: string;
    role: string;
    created_at: string;
}

type RoleFilter = 'tous' | 'merchant' | 'producer' | 'field_agent' | 'cooperative' | 'supervisor';

// ── Helpers ───────────────────────────────────────────────────────────────────
const ROLE_COLORS: Record<string, { bg: string; text: string; label: string; avatarBg: string }> = {
    merchant:    { bg: '#dcfce7', text: '#065f46', label: 'Marchand',    avatarBg: '#059669' },
    producer:    { bg: '#dbeafe', text: '#1e40af', label: 'Producteur',  avatarBg: '#2563eb' },
    field_agent: { bg: '#fef3c7', text: '#92400e', label: 'Agent',       avatarBg: '#d97706' },
    cooperative: { bg: '#ede9fe', text: '#5b21b6', label: 'Coopérative', avatarBg: '#7c3aed' },
    supervisor:  { bg: '#fee2e2', text: '#991b1b', label: 'Admin',       avatarBg: '#dc2626' },
};

function getRoleInfo(role: string) {
    for (const key of Object.keys(ROLE_COLORS)) {
        if (role?.toLowerCase().includes(key.toLowerCase())) return ROLE_COLORS[key];
    }
    return { bg: '#f1f5f9', text: '#475569', label: role ?? 'Inconnu', avatarBg: '#64748b' };
}

const ROLE_FILTERS: { key: RoleFilter; label: string }[] = [
    { key: 'tous',       label: 'Tous' },
    { key: 'merchant',   label: 'Marchands' },
    { key: 'producer',   label: 'Producteurs' },
    { key: 'field_agent',label: 'Agents' },
    { key: 'cooperative',label: 'Coopératives' },
    { key: 'supervisor', label: 'Admins' },
];

// ── Composant principal ────────────────────────────────────────────────────────
export default function Utilisateurs() {
    const router = useRouter();
    const { user } = useAuth();

    const [profiles, setProfiles]         = useState<Profile[]>([]);
    const [loading, setLoading]           = useState(true);
    const [refreshing, setRefreshing]     = useState(false);
    const [search, setSearch]             = useState('');
    const [roleFilter, setRoleFilter]     = useState<RoleFilter>('tous');
    const [selectedUser, setSelectedUser] = useState<Profile | null>(null);
    const [modalVisible, setModalVisible] = useState(false);

    const fetchUsers = useCallback(async () => {
        try {
            const { data, error } = await supabase
                .from('profiles')
                .select('id, full_name, phone_number, role, created_at')
                .order('created_at', { ascending: false });
            if (error) throw error;
            setProfiles((data as Profile[]) ?? []);
        } catch (err) {
            console.error('[Utilisateurs] fetch error:', err);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, []);

    useEffect(() => { setLoading(true); fetchUsers(); }, [fetchUsers]);

    const onRefresh = useCallback(() => { setRefreshing(true); fetchUsers(); }, [fetchUsers]);

    useFocusEffect(useCallback(() => { fetchUsers(); }, [fetchUsers]));

    // ── Filtrage ───────────────────────────────────────────────────────────────
    const filtered = useMemo(() => {
        let list = profiles;
        if (roleFilter !== 'tous') {
            list = list.filter(p => p.role?.toLowerCase().includes(roleFilter.toLowerCase()));
        }
        if (search.trim()) {
            const q = search.toLowerCase();
            list = list.filter(p =>
                p.full_name?.toLowerCase().includes(q) ||
                p.phone_number?.toLowerCase().includes(q)
            );
        }
        return list;
    }, [profiles, roleFilter, search]);

    // ── Actions ────────────────────────────────────────────────────────────────
    const handleResetPin = async (u: Profile) => {
        try {
            const { error } = await supabase
                .from('profiles')
                .update({ pin: '0000' })
                .eq('id', u.id);
            if (error) throw error;
            Alert.alert('Succès', 'PIN réinitialisé à 0000');
        } catch {
            Alert.alert('Erreur', 'Impossible de réinitialiser le PIN');
        }
    };

    const handleChangeRole = (u: Profile) => {
        Alert.alert(
            'Changer le rôle',
            `Choisir le nouveau rôle pour ${u.full_name} :`,
            [
                { text: 'Marchand',    onPress: () => updateRole(u.id, 'merchant') },
                { text: 'Producteur',  onPress: () => updateRole(u.id, 'producer') },
                { text: 'Agent',       onPress: () => updateRole(u.id, 'field_agent') },
                { text: 'Coopérative', onPress: () => updateRole(u.id, 'cooperative') },
                { text: 'Annuler',     style: 'cancel' },
            ]
        );
    };

    const updateRole = async (userId: string, newRole: string) => {
        try {
            const { error } = await supabase
                .from('profiles')
                .update({ role: newRole })
                .eq('id', userId);
            if (error) throw error;
            await fetchUsers();
            Alert.alert('Succès', 'Rôle mis à jour');
            setModalVisible(false);
        } catch {
            Alert.alert('Erreur', 'Impossible de changer le rôle');
        }
    };

    const handleDisable = (u: Profile) => {
        Alert.alert(
            'Désactiver le compte',
            `Voulez-vous désactiver le compte de ${u.full_name} ?`,
            [
                {
                    text: 'Désactiver', style: 'destructive',
                    onPress: () => Alert.alert('Information', 'Fonctionnalité en cours de déploiement'),
                },
                { text: 'Annuler', style: 'cancel' },
            ]
        );
    };

    const openModal = (u: Profile) => {
        setSelectedUser(u);
        setModalVisible(true);
    };

    return (
        <SafeAreaView style={s.safe} edges={['top']}>
            {/* ── HEADER ── */}
            <View style={s.header}>
                <View style={s.headerTop}>
                    <TouchableOpacity style={s.backBtn} onPress={() => router.back()}>
                        <ChevronLeft color={colors.white} size={20} />
                    </TouchableOpacity>
                    <View style={s.headerTitleBlock}>
                        <Text style={s.headerTitle}>UTILISATEURS</Text>
                        <Text style={s.headerSubtitle}>{profiles.length} MEMBRES</Text>
                    </View>
                    <View style={{ width: 40 }} />
                </View>

                {/* Barre de recherche */}
                <View style={s.searchBar}>
                    <User color="#94a3b8" size={16} />
                    <TextInput
                        style={s.searchInput}
                        placeholder="Rechercher par nom ou téléphone..."
                        placeholderTextColor="#94a3b8"
                        value={search}
                        onChangeText={setSearch}
                    />
                    {search.length > 0 && (
                        <TouchableOpacity onPress={() => setSearch('')}>
                            <X color="#94a3b8" size={16} />
                        </TouchableOpacity>
                    )}
                </View>
            </View>

            {/* Filtres rôle */}
            <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={s.filterScroll}
                contentContainerStyle={s.filterRow}
            >
                {ROLE_FILTERS.map(f => (
                    <TouchableOpacity
                        key={f.key}
                        style={[s.filterBtn, roleFilter === f.key && s.filterBtnActive]}
                        activeOpacity={0.82}
                        onPress={() => setRoleFilter(f.key)}
                    >
                        <Text style={[s.filterLabel, roleFilter === f.key && s.filterLabelActive]}>
                            {f.label}
                        </Text>
                    </TouchableOpacity>
                ))}
            </ScrollView>

            {/* Liste */}
            <ScrollView
                style={s.scroll}
                contentContainerStyle={s.scrollContent}
                showsVerticalScrollIndicator={false}
                refreshControl={
                    <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.primary]} />
                }
            >
                {loading ? (
                    <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />
                ) : filtered.length === 0 ? (
                    <View style={s.emptyCard}>
                        <User color={colors.slate300} size={40} />
                        <Text style={s.emptyText}>AUCUN UTILISATEUR TROUVÉ</Text>
                    </View>
                ) : (
                    filtered.map(u => {
                        const ri = getRoleInfo(u.role);
                        const initial = (u.full_name ?? 'U')[0].toUpperCase();
                        return (
                            <TouchableOpacity
                                key={u.id}
                                style={s.userCard}
                                activeOpacity={0.85}
                                onPress={() => openModal(u)}
                            >
                                {/* Avatar */}
                                <View style={[s.avatar, { backgroundColor: ri.avatarBg }]}>
                                    <Text style={s.avatarText}>{initial}</Text>
                                </View>
                                {/* Infos */}
                                <View style={s.userInfo}>
                                    <Text style={s.userName} numberOfLines={1}>{u.full_name}</Text>
                                    <Text style={s.userPhone}>{u.phone_number}</Text>
                                    <Text style={s.userDate}>
                                        {new Date(u.created_at).toLocaleDateString('fr-FR')}
                                    </Text>
                                </View>
                                {/* Badge rôle */}
                                <View style={[s.roleBadge, { backgroundColor: ri.bg }]}>
                                    <Text style={[s.roleBadgeText, { color: ri.text }]}>{ri.label}</Text>
                                </View>
                                <ChevronRight color={colors.slate300} size={16} />
                            </TouchableOpacity>
                        );
                    })
                )}
            </ScrollView>

            {/* ── MODAL utilisateur ── */}
            <Modal
                visible={modalVisible}
                animationType="slide"
                transparent
                onRequestClose={() => setModalVisible(false)}
            >
                <View style={s.modalOverlay}>
                    <View style={s.modalSheet}>
                        {/* Fermer */}
                        <View style={s.modalHeader}>
                            <Text style={s.modalTitle}>GESTION UTILISATEUR</Text>
                            <TouchableOpacity
                                style={s.modalCloseBtn}
                                onPress={() => setModalVisible(false)}
                            >
                                <X color={colors.slate600} size={20} />
                            </TouchableOpacity>
                        </View>

                        {selectedUser && (() => {
                            const ri = getRoleInfo(selectedUser.role);
                            const initial = (selectedUser.full_name ?? 'U')[0].toUpperCase();
                            return (
                                <>
                                    {/* Profil */}
                                    <View style={s.modalUserBlock}>
                                        <View style={[s.modalAvatar, { backgroundColor: ri.avatarBg }]}>
                                            <Text style={s.modalAvatarText}>{initial}</Text>
                                        </View>
                                        <Text style={s.modalName}>{selectedUser.full_name}</Text>
                                        <View style={[s.roleBadge, { backgroundColor: ri.bg }]}>
                                            <Text style={[s.roleBadgeText, { color: ri.text }]}>{ri.label}</Text>
                                        </View>
                                    </View>

                                    {/* Infos */}
                                    <View style={s.modalInfoBlock}>
                                        <View style={s.modalInfoRow}>
                                            <Text style={s.modalInfoLabel}>Téléphone</Text>
                                            <Text style={s.modalInfoValue}>{selectedUser.phone_number}</Text>
                                        </View>
                                        <View style={s.modalInfoRow}>
                                            <Text style={s.modalInfoLabel}>Inscription</Text>
                                            <Text style={s.modalInfoValue}>
                                                {new Date(selectedUser.created_at).toLocaleDateString('fr-FR', {
                                                    day: '2-digit', month: 'long', year: 'numeric',
                                                })}
                                            </Text>
                                        </View>
                                    </View>

                                    {/* Actions */}
                                    <View style={s.modalActions}>
                                        <TouchableOpacity
                                            style={[s.actionBtn, { backgroundColor: '#dbeafe' }]}
                                            activeOpacity={0.85}
                                            onPress={() => handleResetPin(selectedUser)}
                                        >
                                            <Text style={[s.actionBtnText, { color: '#1e40af' }]}>
                                                RÉINITIALISER PIN
                                            </Text>
                                        </TouchableOpacity>

                                        <TouchableOpacity
                                            style={[s.actionBtn, { backgroundColor: '#fef3c7' }]}
                                            activeOpacity={0.85}
                                            onPress={() => handleChangeRole(selectedUser)}
                                        >
                                            <Text style={[s.actionBtnText, { color: '#92400e' }]}>
                                                CHANGER LE RÔLE
                                            </Text>
                                        </TouchableOpacity>

                                        <TouchableOpacity
                                            style={[s.actionBtn, { backgroundColor: '#fee2e2' }]}
                                            activeOpacity={0.85}
                                            onPress={() => handleDisable(selectedUser)}
                                        >
                                            <Text style={[s.actionBtnText, { color: '#991b1b' }]}>
                                                DÉSACTIVER
                                            </Text>
                                        </TouchableOpacity>
                                    </View>
                                </>
                            );
                        })()}
                    </View>
                </View>
            </Modal>
        </SafeAreaView>
    );
}

// ── Styles ─────────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
    safe: { flex: 1, backgroundColor: '#f8fafc' },

    // Header
    header: {
        backgroundColor: '#059669',
        paddingHorizontal: 16,
        paddingTop: 8,
        paddingBottom: 20,
        borderBottomLeftRadius: 32,
        borderBottomRightRadius: 32,
        gap: 12,
    },
    headerTop:        { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    backBtn: {
        width: 40, height: 40, borderRadius: 10,
        backgroundColor: 'rgba(255,255,255,0.2)',
        alignItems: 'center', justifyContent: 'center',
    },
    headerTitleBlock: { alignItems: 'center' },
    headerTitle:      { fontSize: 16, fontWeight: '900', color: '#fff', letterSpacing: 1 },
    headerSubtitle:   { fontSize: 10, fontWeight: '700', color: 'rgba(255,255,255,0.65)', letterSpacing: 1, marginTop: 2 },

    searchBar: {
        flexDirection: 'row', alignItems: 'center', gap: 10,
        backgroundColor: '#fff', borderRadius: 10,
        paddingHorizontal: 12, paddingVertical: 10,
    },
    searchInput: { flex: 1, fontSize: 13, color: '#1e293b', paddingVertical: 0 },

    // Filtres
    filterScroll: { flexGrow: 0, maxHeight: 52 },
    filterRow:    { paddingHorizontal: 16, paddingVertical: 10, flexDirection: 'row', gap: 8 },
    filterBtn: {
        paddingHorizontal: 14, paddingVertical: 7,
        borderRadius: 8, borderWidth: 1.5, borderColor: '#e2e8f0',
        backgroundColor: '#fff',
    },
    filterBtnActive:   { borderColor: '#059669', backgroundColor: '#ecfdf5' },
    filterLabel:       { fontSize: 11, fontWeight: '700', color: '#64748b' },
    filterLabelActive: { color: '#059669' },

    // Scroll
    scroll:        { flex: 1 },
    scrollContent: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 40, gap: 8 },

    // Carte utilisateur
    userCard: {
        flexDirection: 'row', alignItems: 'center', gap: 12,
        backgroundColor: '#fff', borderRadius: 10, padding: 12,
        borderWidth: 1, borderColor: '#f1f5f9',
        shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.04, shadowRadius: 4, elevation: 1,
    },
    avatar: {
        width: 44, height: 44, borderRadius: 10,
        alignItems: 'center', justifyContent: 'center', flexShrink: 0,
    },
    avatarText: { fontSize: 18, fontWeight: '900', color: '#fff' },
    userInfo:   { flex: 1, minWidth: 0, gap: 2 },
    userName:   { fontSize: 13, fontWeight: '700', color: '#1e293b' },
    userPhone:  { fontSize: 11, color: '#64748b' },
    userDate:   { fontSize: 10, color: '#94a3b8' },
    roleBadge:  { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, flexShrink: 0 },
    roleBadgeText: { fontSize: 9, fontWeight: '700' },

    // Empty
    emptyCard: {
        backgroundColor: '#fff', borderRadius: 10, padding: 48,
        alignItems: 'center', borderWidth: 2, borderColor: '#f1f5f9',
        borderStyle: 'dashed', gap: 12,
    },
    emptyText: { fontSize: 10, fontWeight: '900', color: '#cbd5e1', letterSpacing: 2 },

    // Modal
    modalOverlay: {
        flex: 1, backgroundColor: 'rgba(0,0,0,0.4)',
        justifyContent: 'flex-end',
    },
    modalSheet: {
        backgroundColor: '#fff',
        borderTopLeftRadius: 20, borderTopRightRadius: 20,
        paddingHorizontal: 20, paddingTop: 20, paddingBottom: 40,
        gap: 16,
    },
    modalHeader: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    },
    modalTitle:    { fontSize: 12, fontWeight: '900', color: '#94a3b8', letterSpacing: 2 },
    modalCloseBtn: {
        width: 36, height: 36, borderRadius: 10,
        backgroundColor: '#f1f5f9',
        alignItems: 'center', justifyContent: 'center',
    },
    modalUserBlock: { alignItems: 'center', gap: 8 },
    modalAvatar: {
        width: 60, height: 60, borderRadius: 12,
        alignItems: 'center', justifyContent: 'center',
    },
    modalAvatarText: { fontSize: 24, fontWeight: '900', color: '#fff' },
    modalName:       { fontSize: 18, fontWeight: '900', color: '#1e293b' },

    modalInfoBlock: {
        backgroundColor: '#f8fafc', borderRadius: 10,
        padding: 14, gap: 10,
    },
    modalInfoRow:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    modalInfoLabel: { fontSize: 12, fontWeight: '700', color: '#94a3b8' },
    modalInfoValue: { fontSize: 13, fontWeight: '700', color: '#1e293b' },

    modalActions: { gap: 10 },
    actionBtn: {
        borderRadius: 10, paddingVertical: 14,
        alignItems: 'center',
    },
    actionBtnText: { fontSize: 12, fontWeight: '900', letterSpacing: 1 },
});
