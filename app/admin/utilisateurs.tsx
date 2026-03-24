// Utilisateurs — Admin : liste complète, gestion des profils avec stats
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
    View, Text, ScrollView, StyleSheet, ActivityIndicator, TextInput,
    Alert, RefreshControl, Modal, Platform, useWindowDimensions,
} from 'react-native';
import { TouchableOpacity, GestureHandlerRootView } from 'react-native-gesture-handler';
import { useFocusEffect } from 'expo-router';
import {
    ChevronRight, X, User, ShoppingBag, Package, TrendingUp,
} from 'lucide-react-native';
import { ScreenHeader } from '@/src/components/ui';
import { supabase } from '@/src/lib/supabase';
import { colors } from '@/src/lib/colors';
import { onSocketEvent } from '@/src/lib/socket';

// ── Types ──────────────────────────────────────────────────────────────────────
interface Profile {
    id: string;
    full_name: string;
    phone_number: string;
    role: string;
    boutique_name: string | null;
    address: string | null;
    created_at: string;
    cooperative_id: string | null;
    cooperative_nom?: string;
}

interface UserStats {
    storeName: string | null;
    storeType: string | null;
    salesCount: number;
    salesTotal: number;
    ordersCount: number;
}

type RoleFilter = 'tous' | 'MERCHANT' | 'PRODUCER' | 'FIELD_AGENT' | 'COOPERATIVE' | 'SUPERVISOR';

// ── Helpers ───────────────────────────────────────────────────────────────────
const ROLE_COLORS: Record<string, { bg: string; text: string; label: string; avatarBg: string }> = {
    MERCHANT:    { bg: '#dcfce7', text: '#065f46', label: 'Marchand',    avatarBg: colors.primary },
    PRODUCER:    { bg: '#dbeafe', text: '#1e40af', label: 'Producteur',  avatarBg: '#2563eb' },
    FIELD_AGENT: { bg: '#fef3c7', text: '#92400e', label: 'Agent',       avatarBg: '#d97706' },
    COOPERATIVE: { bg: '#ede9fe', text: '#5b21b6', label: 'Coopérative', avatarBg: '#7c3aed' },
    SUPERVISOR:  { bg: '#fee2e2', text: '#991b1b', label: 'Admin',       avatarBg: colors.error },
};

function getRoleInfo(role: string) {
    const upper = role?.toUpperCase() ?? '';
    for (const key of Object.keys(ROLE_COLORS)) {
        if (upper.includes(key)) return ROLE_COLORS[key];
    }
    return { bg: '#f1f5f9', text: '#475569', label: role ?? 'Inconnu', avatarBg: '#64748b' };
}

const ROLE_FILTERS: { key: RoleFilter; label: string }[] = [
    { key: 'tous',        label: 'Tous' },
    { key: 'MERCHANT',    label: 'Marchands' },
    { key: 'PRODUCER',    label: 'Producteurs' },
    { key: 'FIELD_AGENT', label: 'Agents' },
    { key: 'COOPERATIVE', label: 'Coopératives' },
    { key: 'SUPERVISOR',  label: 'Admins' },
];

function fmt(n: number): string {
    return n.toLocaleString('fr-FR');
}

// ── Composant principal ────────────────────────────────────────────────────────
export default function Utilisateurs() {
    const [profiles, setProfiles]         = useState<Profile[]>([]);
    const [loading, setLoading]           = useState(true);
    const [refreshing, setRefreshing]     = useState(false);
    const [search, setSearch]             = useState('');
    const [roleFilter, setRoleFilter]     = useState<RoleFilter>('tous');
    const [selectedUser, setSelectedUser] = useState<Profile | null>(null);
    const [modalVisible, setModalVisible] = useState(false);
    const [userStats, setUserStats]       = useState<UserStats | null>(null);
    const [statsLoading, setStatsLoading] = useState(false);

    const { width } = useWindowDimensions();
    const isDesktop = Platform.OS === 'web' && width > 768;

    // ── Chargement liste ──────────────────────────────────────────────────────
    const fetchUsers = useCallback(async () => {
        try {
            // Tentative avec cooperative_id (colonne optionnelle via migration)
            let { data, error } = await supabase
                .from('profiles')
                .select('id, full_name, phone_number, role, boutique_name, address, created_at, cooperative_id')
                .order('created_at', { ascending: false });

            // Si la colonne cooperative_id n'existe pas encore → retenter sans elle
            if (error) {
                console.log('⚠️ [Utilisateurs] fetch avec cooperative_id échoué:', error.message, '— retente sans');
                const fallback = await supabase
                    .from('profiles')
                    .select('id, full_name, phone_number, role, boutique_name, address, created_at')
                    .order('created_at', { ascending: false });
                if (fallback.error) {
                    console.log('❌ [Utilisateurs] fetch profiles:', fallback.error.message);
                    return;
                }
                data = (fallback.data ?? []).map(r => ({ ...r, cooperative_id: null }));
            }

            const rows = (data as Profile[]) ?? [];
            const byRole: Record<string, number> = {};
            for (const r of rows) byRole[r.role] = (byRole[r.role] ?? 0) + 1;
            console.log('[Utilisateurs] ✅ profils chargés:', rows.length, '— par rôle:', JSON.stringify(byRole));

            // Enrichir avec les noms de coopératives (si la colonne existe)
            const coopIds = [...new Set(rows.map(r => r.cooperative_id).filter(Boolean))] as string[];
            const { data: coopData } = coopIds.length > 0
                ? await supabase.from('profiles').select('id, full_name').in('id', coopIds)
                : { data: [] };
            const coopMap: Record<string, string> = {};
            for (const c of (coopData ?? []) as { id: string; full_name: string | null }[]) {
                coopMap[c.id] = c.full_name ?? 'Coopérative';
            }

            setProfiles(rows.map(r => ({
                ...r,
                cooperative_nom: r.cooperative_id ? coopMap[r.cooperative_id] : undefined,
            })));
        } catch (err) {
            console.log('❌ [Utilisateurs] exception:', err);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, []);

    const onRefresh = useCallback(() => { setRefreshing(true); fetchUsers(); }, [fetchUsers]);
    useFocusEffect(useCallback(() => { setLoading(true); fetchUsers(); }, [fetchUsers]));

    // Socket.io — rafraîchir quand un nouveau membre est enrôlé/validé
    useEffect(() => {
        const unsubs = [
            onSocketEvent('enrolement-valide',  () => fetchUsers()),
            onSocketEvent('nouvel-enrolement',  () => fetchUsers()),
        ];
        return () => unsubs.forEach(fn => fn());
    }, [fetchUsers]);

    // ── Stats modal ───────────────────────────────────────────────────────────
    const fetchUserStats = useCallback(async (u: Profile) => {
        setStatsLoading(true);
        setUserStats(null);
        try {
            // 1. Boutique/store
            const { data: storeData } = await supabase
                .from('stores')
                .select('id, name, store_type')
                .eq('owner_id', u.id)
                .limit(1)
                .maybeSingle();

            const stats: UserStats = {
                storeName:  storeData?.name   ?? null,
                storeType:  storeData?.store_type ?? null,
                salesCount: 0,
                salesTotal: 0,
                ordersCount: 0,
            };

            if (storeData?.id) {
                const [txRes, ordRes] = await Promise.all([
                    supabase
                        .from('transactions')
                        .select('price', { count: 'exact' })
                        .eq('store_id', storeData.id)
                        .eq('type', 'VENTE'),
                    supabase
                        .from('orders')
                        .select('id', { count: 'exact' })
                        .eq('buyer_store_id', storeData.id),
                ]);

                stats.salesCount  = txRes.count ?? 0;
                stats.salesTotal  = (txRes.data ?? []).reduce((s: number, t: any) => s + (t.price ?? 0), 0);
                stats.ordersCount = ordRes.count ?? 0;
            }

            setUserStats(stats);
        } catch (err) {
            console.log('❌ [UserStats] fetch error:', err);
        } finally {
            setStatsLoading(false);
        }
    }, []);

    const openModal = useCallback((u: Profile) => {
        setSelectedUser(u);
        setUserStats(null);
        setModalVisible(true);
        fetchUserStats(u);
    }, [fetchUserStats]);

    // ── Filtrage ───────────────────────────────────────────────────────────────
    const filtered = useMemo(() => {
        let list = profiles;
        if (roleFilter !== 'tous') {
            list = list.filter(p => p.role?.toUpperCase() === roleFilter);
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
        Alert.alert(
            'Réinitialiser le PIN',
            `Réinitialiser le PIN de ${u.full_name} à 0000 ?`,
            [
                {
                    text: 'Confirmer', style: 'destructive',
                    onPress: async () => {
                        const { error } = await supabase
                            .from('profiles').update({ pin: '0101' }).eq('id', u.id);
                        if (error) Alert.alert('Erreur', 'Impossible de réinitialiser le PIN');
                        else Alert.alert('Succès', `PIN de ${u.full_name} réinitialisé à 0101`);
                    },
                },
                { text: 'Annuler', style: 'cancel' },
            ]
        );
    };

    const handleChangeRole = (u: Profile) => {
        Alert.alert(
            'Changer le rôle',
            `Nouveau rôle pour ${u.full_name} :`,
            [
                { text: 'Marchand',    onPress: () => updateRole(u, 'MERCHANT') },
                { text: 'Producteur',  onPress: () => updateRole(u, 'PRODUCER') },
                { text: 'Agent',       onPress: () => updateRole(u, 'FIELD_AGENT') },
                { text: 'Coopérative', onPress: () => updateRole(u, 'COOPERATIVE') },
                { text: 'Annuler',     style: 'cancel' },
            ]
        );
    };

    const updateRole = async (u: Profile, newRole: string) => {
        const { error } = await supabase
            .from('profiles').update({ role: newRole }).eq('id', u.id);
        if (error) { Alert.alert('Erreur', 'Impossible de changer le rôle'); return; }
        await fetchUsers();
        setModalVisible(false);
        Alert.alert('Succès', `Rôle mis à jour → ${getRoleInfo(newRole).label}`);
    };

    const handleDisable = (u: Profile) => {
        Alert.alert(
            'Désactiver le compte',
            `Désactiver le compte de ${u.full_name} ? Cette action empêchera la connexion.`,
            [
                {
                    text: 'Désactiver', style: 'destructive',
                    onPress: async () => {
                        // Blocage via PIN invalide — en attendant colonne `active`
                        const { error } = await supabase
                            .from('profiles').update({ pin: 'DISABLED' }).eq('id', u.id);
                        if (error) Alert.alert('Erreur', 'Impossible de désactiver');
                        else {
                            setModalVisible(false);
                            await fetchUsers();
                            Alert.alert('Compte désactivé', `${u.full_name} ne peut plus se connecter.`);
                        }
                    },
                },
                { text: 'Annuler', style: 'cancel' },
            ]
        );
    };

    // ── Rendu ──────────────────────────────────────────────────────────────────
    return (
        <View style={s.safe}>
            <ScreenHeader
                title="Utilisateurs"
                subtitle={`${profiles.length} membres`}
                showBack={true}
                paddingBottom={16}
            >
                <View style={[s.searchBar, isDesktop && { maxWidth: 500 }]}>
                    <User color="rgba(255,255,255,0.6)" size={16} />
                    <TextInput
                        style={s.searchInput}
                        placeholder="Rechercher par nom ou téléphone..."
                        placeholderTextColor="rgba(255,255,255,0.5)"
                        value={search}
                        onChangeText={setSearch}
                    />
                    {search.length > 0 && (
                        <TouchableOpacity onPress={() => setSearch('')}>
                            <X color="rgba(255,255,255,0.6)" size={16} />
                        </TouchableOpacity>
                    )}
                </View>
            </ScreenHeader>

            {/* Filtres rôle */}
            {isDesktop ? (
                <View style={[s.filterRow, { paddingHorizontal: 32, paddingVertical: 10, maxWidth: 1400, alignSelf: 'center' as const, width: '100%' }]}>
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
                </View>
            ) : (
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
            )}

            {/* Liste */}
            <ScrollView
                style={s.scroll}
                contentContainerStyle={[s.scrollContent, isDesktop && dtU.desktopContent]}
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
                refreshControl={
                    <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.primary]} />
                }
            >
                {loading ? (
                    <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />
                ) : filtered.length === 0 ? (
                    <View style={s.emptyCard}>
                        <User color={colors.slate300} size={40} />
                        <Text style={s.emptyText}>AUCUN UTILISATEUR TROUVE</Text>
                    </View>
                ) : isDesktop ? (
                    /* ── Tableau desktop dans une card blanche ── */
                    <View style={dtU.tableCard}>
                        <View style={dtU.tableHeader}>
                            <View style={dtU.colAvatar} />
                            <Text style={[dtU.thText, dtU.colName]}>NOM</Text>
                            <Text style={[dtU.thText, dtU.colPhone]}>TELEPHONE</Text>
                            <Text style={[dtU.thText, dtU.colRole]}>ROLE</Text>
                            <Text style={[dtU.thText, dtU.colCoop]}>COOPERATIVE</Text>
                            <Text style={[dtU.thText, dtU.colStatus]}>STATUT</Text>
                            <Text style={[dtU.thText, dtU.colDate]}>DATE</Text>
                            <View style={dtU.colChev} />
                        </View>
                        {filtered.map((u, idx) => {
                            const ri      = getRoleInfo(u.role);
                            const initial = (u.full_name ?? 'U')[0].toUpperCase();
                            const isPending = !u.cooperative_id &&
                                (u.role === 'MERCHANT' || u.role === 'PRODUCER');
                            return (
                                <TouchableOpacity
                                    key={u.id}
                                    style={[dtU.tableRow, idx % 2 === 1 && dtU.tableRowAlt]}
                                    activeOpacity={0.85}
                                    onPress={() => openModal(u)}
                                >
                                    <View style={[s.avatar, { backgroundColor: ri.avatarBg }, dtU.colAvatar]}>
                                        <Text style={s.avatarText}>{initial}</Text>
                                    </View>
                                    <Text style={[s.userName, dtU.colName]} numberOfLines={1}>{u.full_name}</Text>
                                    <Text style={[s.userPhone, dtU.colPhone]} numberOfLines={1}>{u.phone_number}</Text>
                                    <View style={[dtU.colRole, { alignItems: 'flex-start' }]}>
                                        <View style={[s.roleBadge, { backgroundColor: ri.bg }]}>
                                            <Text style={[s.roleBadgeText, { color: ri.text }]}>{ri.label}</Text>
                                        </View>
                                    </View>
                                    <Text style={[s.userCoop, dtU.colCoop]} numberOfLines={1}>
                                        {u.cooperative_nom ?? (isPending ? 'A affecter' : '--')}
                                    </Text>
                                    <View style={[dtU.colStatus, { alignItems: 'flex-start' }]}>
                                        <View style={[dtU.statusBadge, dtU.statusActive]}>
                                            <Text style={[dtU.statusBadgeText, { color: '#065f46' }]}>Actif</Text>
                                        </View>
                                    </View>
                                    <Text style={[s.userDate, dtU.colDate]} numberOfLines={1}>
                                        {new Date(u.created_at).toLocaleDateString('fr-FR')}
                                    </Text>
                                    <ChevronRight color={colors.slate300} size={16} />
                                </TouchableOpacity>
                            );
                        })}
                    </View>
                ) : (
                    /* ── Cartes mobile ── */
                    <>
                        {filtered.map(u => {
                            const ri      = getRoleInfo(u.role);
                            const initial = (u.full_name ?? 'U')[0].toUpperCase();
                            const isPending = !u.cooperative_id &&
                                (u.role === 'MERCHANT' || u.role === 'PRODUCER');
                            return (
                                <TouchableOpacity
                                    key={u.id}
                                    style={s.userCard}
                                    activeOpacity={0.85}
                                    onPress={() => openModal(u)}
                                >
                                    <View style={[s.avatar, { backgroundColor: ri.avatarBg }]}>
                                        <Text style={s.avatarText}>{initial}</Text>
                                    </View>
                                    <View style={s.userInfo}>
                                        <Text style={s.userName} numberOfLines={1}>{u.full_name}</Text>
                                        <Text style={s.userPhone}>{u.phone_number}</Text>
                                        {u.boutique_name && (
                                            <Text style={s.userBoutique} numberOfLines={1}>
                                                {u.boutique_name}
                                            </Text>
                                        )}
                                        {u.cooperative_nom && (
                                            <Text style={s.userCoop} numberOfLines={1}>
                                                {u.cooperative_nom}
                                            </Text>
                                        )}
                                        {isPending && (
                                            <Text style={s.userNoCoopBadge}>A affecter</Text>
                                        )}
                                        <Text style={s.userDate}>
                                            {new Date(u.created_at).toLocaleDateString('fr-FR')}
                                        </Text>
                                    </View>
                                    <View style={[s.roleBadge, { backgroundColor: ri.bg }]}>
                                        <Text style={[s.roleBadgeText, { color: ri.text }]}>{ri.label}</Text>
                                    </View>
                                    <ChevronRight color={colors.slate300} size={16} />
                                </TouchableOpacity>
                            );
                        })}
                    </>
                )}
            </ScrollView>

            {/* ── MODAL utilisateur ── */}
            <Modal
                visible={modalVisible}
                animationType="slide"
                transparent
                onRequestClose={() => setModalVisible(false)}
            >
                {/* GestureHandlerRootView requis : Modal isole le contexte gestuel */}
                <GestureHandlerRootView style={{ flex: 1 }}>
                <View style={s.modalOverlay}>
                    <View style={s.modalSheet}>
                        {/* Header modal */}
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
                            const ri      = getRoleInfo(selectedUser.role);
                            const initial = (selectedUser.full_name ?? 'U')[0].toUpperCase();
                            return (
                                <ScrollView showsVerticalScrollIndicator={false}>
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

                                    {/* Infos profil */}
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
                                        {selectedUser.boutique_name && (
                                            <View style={s.modalInfoRow}>
                                                <Text style={s.modalInfoLabel}>Boutique</Text>
                                                <Text style={s.modalInfoValue}>{selectedUser.boutique_name}</Text>
                                            </View>
                                        )}
                                        {selectedUser.address && (
                                            <View style={s.modalInfoRow}>
                                                <Text style={s.modalInfoLabel}>Adresse</Text>
                                                <Text style={[s.modalInfoValue, { flex: 1, textAlign: 'right' }]} numberOfLines={2}>
                                                    {selectedUser.address}
                                                </Text>
                                            </View>
                                        )}
                                        {selectedUser.cooperative_nom && (
                                            <View style={s.modalInfoRow}>
                                                <Text style={s.modalInfoLabel}>Coopérative</Text>
                                                <Text style={[s.modalInfoValue, { color: '#7c3aed' }]}>
                                                    {selectedUser.cooperative_nom}
                                                </Text>
                                            </View>
                                        )}
                                        {!selectedUser.cooperative_id &&
                                            (selectedUser.role === 'MERCHANT' || selectedUser.role === 'PRODUCER') && (
                                            <View style={s.modalInfoRow}>
                                                <Text style={s.modalInfoLabel}>Coopérative</Text>
                                                <Text style={[s.modalInfoValue, { color: colors.error }]}>Non affecté</Text>
                                            </View>
                                        )}
                                    </View>

                                    {/* Stats */}
                                    <Text style={s.sectionLabel}>ACTIVITÉ</Text>
                                    {statsLoading ? (
                                        <ActivityIndicator color={colors.primary} style={{ marginVertical: 12 }} />
                                    ) : userStats ? (
                                        <>
                                            {userStats.storeName && (
                                                <View style={s.storeTag}>
                                                    <Package color={colors.primary} size={14} />
                                                    <Text style={s.storeTagText}>
                                                        {userStats.storeName}
                                                        {userStats.storeType ? ` · ${userStats.storeType}` : ''}
                                                    </Text>
                                                </View>
                                            )}
                                            <View style={s.statsRow}>
                                                <View style={[s.statBox, { backgroundColor: colors.primaryBg }]}>
                                                    <ShoppingBag color={colors.primary} size={18} />
                                                    <Text style={[s.statVal, { color: colors.primary }]}>
                                                        {userStats.salesCount}
                                                    </Text>
                                                    <Text style={s.statLbl}>Ventes</Text>
                                                </View>
                                                <View style={[s.statBox, { backgroundColor: '#eff6ff' }]}>
                                                    <TrendingUp color="#2563eb" size={18} />
                                                    <Text style={[s.statVal, { color: '#2563eb' }]}>
                                                        {fmt(userStats.salesTotal)} F
                                                    </Text>
                                                    <Text style={s.statLbl}>Chiffre d'affaires</Text>
                                                </View>
                                                <View style={[s.statBox, { backgroundColor: '#fef3c7' }]}>
                                                    <Package color="#d97706" size={18} />
                                                    <Text style={[s.statVal, { color: '#d97706' }]}>
                                                        {userStats.ordersCount}
                                                    </Text>
                                                    <Text style={s.statLbl}>Commandes</Text>
                                                </View>
                                            </View>
                                        </>
                                    ) : (
                                        <Text style={s.noStats}>Aucune activité enregistrée</Text>
                                    )}

                                    {/* Actions */}
                                    <Text style={s.sectionLabel}>ACTIONS</Text>
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
                                                DÉSACTIVER LE COMPTE
                                            </Text>
                                        </TouchableOpacity>
                                    </View>
                                </ScrollView>
                            );
                        })()}
                    </View>
                </View>
                </GestureHandlerRootView>
            </Modal>
        </View>
    );
}

// ── Styles ─────────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.slate50 },

    // Barre de recherche (dans le header)
    searchBar: {
        flexDirection: 'row', alignItems: 'center', gap: 10,
        backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 10,
        paddingHorizontal: 12, paddingVertical: 10,
    },
    searchInput: { flex: 1, fontSize: 13, color: '#fff', paddingVertical: 0 },

    // Filtres
    filterScroll: { flexGrow: 0, maxHeight: 52 },
    filterRow:    { paddingHorizontal: 16, paddingVertical: 10, flexDirection: 'row', gap: 8 },
    filterBtn: {
        paddingHorizontal: 14, paddingVertical: 7,
        borderRadius: 8, borderWidth: 1.5, borderColor: '#e2e8f0',
        backgroundColor: '#fff',
    },
    filterBtnActive:   { borderColor: colors.primary, backgroundColor: colors.primaryBg },
    filterLabel:       { fontSize: 11, fontWeight: '700', color: '#64748b' },
    filterLabelActive: { color: colors.primary },

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
    avatarText:  { fontSize: 18, fontWeight: '900', color: '#fff' },
    userInfo:    { flex: 1, minWidth: 0, gap: 2 },
    userName:    { fontSize: 13, fontWeight: '700', color: '#1e293b' },
    userPhone:   { fontSize: 11, color: '#64748b' },
    userBoutique:    { fontSize: 11, color: colors.primary, fontWeight: '600' },
    userDate:        { fontSize: 11, color: '#94a3b8' },
    userCoop:        { fontSize: 11, color: '#7c3aed', fontWeight: '600' },
    userNoCoopBadge: { fontSize: 11, fontWeight: '700', color: colors.error },
    roleBadge:     { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, flexShrink: 0 },
    roleBadgeText: { fontSize: 11, fontWeight: '700' },

    // Empty
    emptyCard: {
        backgroundColor: '#fff', borderRadius: 10, padding: 48,
        alignItems: 'center', borderWidth: 2, borderColor: '#f1f5f9',
        borderStyle: 'dashed', gap: 12,
    },
    emptyText: { fontSize: 11, fontWeight: '900', color: '#cbd5e1', letterSpacing: 2 },

    // Modal
    modalOverlay: {
        flex: 1, backgroundColor: 'rgba(0,0,0,0.4)',
        justifyContent: 'flex-end',
    },
    modalSheet: {
        backgroundColor: '#fff',
        borderTopLeftRadius: 12, borderTopRightRadius: 12,
        paddingHorizontal: 20, paddingTop: 20, paddingBottom: 40,
        maxHeight: '88%', gap: 16,
    },
    modalHeader: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    },
    modalTitle:    { fontSize: 12, fontWeight: '900', color: '#94a3b8', letterSpacing: 2 },
    modalCloseBtn: {
        width: 44, height: 44, borderRadius: 10,
        backgroundColor: '#f1f5f9',
        alignItems: 'center', justifyContent: 'center',
    },
    modalUserBlock: { alignItems: 'center', gap: 8, paddingVertical: 4 },
    modalAvatar: {
        width: 60, height: 60, borderRadius: 12,
        alignItems: 'center', justifyContent: 'center',
    },
    modalAvatarText: { fontSize: 24, fontWeight: '900', color: '#fff' },
    modalName:       { fontSize: 18, fontWeight: '900', color: '#1e293b' },

    modalInfoBlock: {
        backgroundColor: colors.slate50, borderRadius: 10,
        padding: 14, gap: 10,
    },
    modalInfoRow:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 },
    modalInfoLabel: { fontSize: 12, fontWeight: '700', color: '#94a3b8' },
    modalInfoValue: { fontSize: 13, fontWeight: '700', color: '#1e293b' },

    sectionLabel: {
        fontSize: 11, fontWeight: '900', color: '#94a3b8',
        letterSpacing: 1.5, marginTop: 8, marginBottom: 4,
    },
    storeTag: {
        flexDirection: 'row', alignItems: 'center', gap: 6,
        backgroundColor: colors.primaryBg, borderRadius: 8,
        paddingHorizontal: 12, paddingVertical: 8, marginBottom: 8,
    },
    storeTagText: { fontSize: 13, fontWeight: '700', color: colors.primary },

    statsRow:  { flexDirection: 'row', gap: 8, marginBottom: 8 },
    statBox:   {
        flex: 1, borderRadius: 10, padding: 12,
        alignItems: 'center', gap: 4,
    },
    statVal:   { fontSize: 14, fontWeight: '900' },
    statLbl:   { fontSize: 11, color: '#64748b', textAlign: 'center' },
    noStats:   { fontSize: 13, color: '#94a3b8', textAlign: 'center', paddingVertical: 12 },

    modalActions: { gap: 10, paddingBottom: 8 },
    actionBtn: {
        borderRadius: 10, paddingVertical: 14,
        alignItems: 'center',
    },
    actionBtnText: { fontSize: 12, fontWeight: '900', letterSpacing: 1 },
});

// ── Desktop table styles ────────────────────────────────────────────────────────
const dtU = StyleSheet.create({
    desktopContent: {
        maxWidth: 1400,
        alignSelf: 'center',
        width: '100%',
        padding: 32,
    },
    tableCard: {
        backgroundColor: '#fff',
        borderRadius: 12,
        overflow: 'hidden',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.08,
        shadowRadius: 12,
        elevation: 3,
    },
    tableHeader: {
        flexDirection: 'row', alignItems: 'center',
        paddingHorizontal: 16, paddingVertical: 12,
        backgroundColor: '#f1f5f9',
        borderBottomWidth: 1, borderBottomColor: '#e2e8f0',
    },
    tableRow: {
        flexDirection: 'row', alignItems: 'center',
        paddingHorizontal: 16, paddingVertical: 10,
        borderBottomWidth: 1, borderBottomColor: '#f1f5f9',
    },
    tableRowAlt: {
        backgroundColor: colors.slate50,
    },
    thText: { fontSize: 10, fontWeight: '900', color: '#94a3b8', letterSpacing: 1 },
    // Colonnes
    colAvatar: { width: 44, marginRight: 12 },
    colName:   { flex: 2, fontSize: 13, fontWeight: '700', color: '#1e293b', paddingRight: 8 },
    colPhone:  { flex: 1.5, fontSize: 11, color: '#64748b', paddingRight: 8 },
    colRole:   { flex: 1, paddingRight: 8 },
    colCoop:   { flex: 1.5, fontSize: 11, color: '#7c3aed', fontWeight: '600', paddingRight: 8 },
    colStatus: { flex: 0.8, paddingRight: 8 },
    colDate:   { flex: 1, fontSize: 11, color: '#94a3b8', paddingRight: 8 },
    colChev:   { width: 16 },
    // Status badges
    statusBadge: {
        paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6,
    },
    statusActive: {
        backgroundColor: '#d1fae5',
    },
    statusInactive: {
        backgroundColor: '#fee2e2',
    },
    statusBadgeText: {
        fontSize: 11, fontWeight: '700',
    },
});
