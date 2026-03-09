// Demandes d'enrôlement — Coopérative
import React, { useState, useEffect, useCallback } from 'react';
import {
    View, Text, ScrollView, StyleSheet, TouchableOpacity,
    ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { ChevronLeft, Phone, MapPin, User, Store } from 'lucide-react-native';
import { supabase } from '@/src/lib/supabase';
import { colors } from '@/src/lib/colors';
import { onSocketEvent, emitEvent } from '@/src/lib/socket';

// ── Types ──────────────────────────────────────────────────────────────────────
interface Enrollment {
    id: string;
    status: 'PENDING' | 'VALIDATED' | 'REJECTED';
    created_at: string;
    first_name?: string;
    last_name?: string;
    phone?: string;
    role?: string;
    shop_name?: string;
    address?: string;
    agent_id?: string;   // UUID de l'agent — utilisé pour router la notification Socket.io
    agent_name?: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
const FILTER_TABS = [
    { key: 'ALL',       label: 'Toutes' },
    { key: 'PENDING',   label: 'En attente' },
    { key: 'VALIDATED', label: 'Validées' },
    { key: 'REJECTED',  label: 'Refusées' },
];

const STATUS_CONFIG: Record<string, { bg: string; text: string; label: string }> = {
    PENDING:   { bg: '#fef3c7', text: '#92400e', label: 'En attente' },
    VALIDATED: { bg: '#d1fae5', text: '#065f46', label: 'Validée' },
    REJECTED:  { bg: '#fee2e2', text: '#991b1b', label: 'Refusée' },
};

const ROLE_CONFIG: Record<string, { bg: string; text: string }> = {
    MERCHANT: { bg: '#dbeafe', text: '#1e40af' },
    PRODUCER: { bg: '#d1fae5', text: '#065f46' },
    AGENT:    { bg: '#ede9fe', text: '#5b21b6' },
};

function getInitials(firstName?: string, lastName?: string) {
    const f = (firstName ?? '?')[0]?.toUpperCase() ?? '?';
    const l = (lastName ?? '')[0]?.toUpperCase() ?? '';
    return f + l;
}

const AVATAR_COLORS = ['#059669', '#2563eb', '#7c3aed', '#d97706', '#dc2626'];
function getAvatarColor(id: string) {
    let sum = 0;
    for (let i = 0; i < id.length; i++) sum += id.charCodeAt(i);
    return AVATAR_COLORS[sum % AVATAR_COLORS.length];
}

// ── Composant principal ────────────────────────────────────────────────────────
export default function DemandesScreen() {
    const router = useRouter();

    const [enrollments, setEnrollments] = useState<Enrollment[]>([]);
    const [activeFilter, setActiveFilter] = useState<string>('ALL');
    const [loading, setLoading]           = useState(true);
    const [pendingCount, setPendingCount] = useState(0);

    const fetchDemandes = useCallback(async () => {
        setLoading(true);
        try {
            const { data } = await supabase
                .from('enrollments')
                .select('*')
                .order('created_at', { ascending: false })
                .limit(50);

            const list = (data as Enrollment[]) || [];
            setEnrollments(list);
            setPendingCount(list.filter(e => e.status === 'PENDING').length);
        } catch (err) {
            console.error('[Demandes] fetch error:', err);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { fetchDemandes(); }, [fetchDemandes]);

    // Écouter les nouveaux enrôlements en temps réel
    useEffect(() => {
        const unsub = onSocketEvent('nouvel-enrolement', () => {
            fetchDemandes();
        });
        return unsub;
    }, [fetchDemandes]);

    // Recharge à chaque retour sur l'écran
    useFocusEffect(useCallback(() => { fetchDemandes(); }, [fetchDemandes]));

    const handleUpdateStatus = async (enroll: Enrollment, status: 'VALIDATED' | 'REJECTED') => {
        const marchandName = `${enroll.first_name ?? ''} ${enroll.last_name ?? ''}`.trim();
        console.log('[Demandes] handleUpdateStatus — id:', enroll.id, '→ nouveau statut:', status, '| agent_id:', enroll.agent_id);

        try {
            // 1. Mise à jour Supabase EN PREMIER
            const { error: updateError } = await supabase
                .from('enrollments')
                .update({ status })
                .eq('id', enroll.id);

            if (updateError) {
                console.error('[Demandes] ❌ UPDATE enrollments ERREUR:', updateError.message, '| code:', updateError.code);
                return;
            }
            console.log('[Demandes] ✅ UPDATE enrollments OK — id:', enroll.id, 'statut:', status);

            // 2. Log activité
            try {
                await supabase.from('activity_logs').insert([{
                    user_id:   null,
                    user_name: 'Coopérative',
                    action:    `Enrôlement ${status === 'VALIDATED' ? 'validé' : 'rejeté'} : ${marchandName}`,
                    type:      'enrolement',
                }]);
                console.log('[Demandes] ✅ activity_log inséré');
            } catch (logErr) {
                console.warn('[Demandes] ⚠️ activity_log échec (non bloquant):', logErr);
            }

            // 3. Émettre Socket.io APRÈS Supabase
            if (status === 'VALIDATED') {
                emitEvent('enrolement-valide', {
                    agentId:         enroll.agent_id,
                    marchandId:      enroll.id,
                    marchandName,
                    cooperativeName: 'Coopérative',
                    demandId:        enroll.id,
                });
                console.log('[Demandes] emitEvent enrolement-valide → agentId:', enroll.agent_id);
            } else {
                emitEvent('enrolement-rejete', {
                    agentId:     enroll.agent_id,
                    marchandId:  enroll.id,
                    marchandName,
                    reason:      'Dossier incomplet',
                    demandId:    enroll.id,
                });
                console.log('[Demandes] emitEvent enrolement-rejete → agentId:', enroll.agent_id);
            }

            fetchDemandes();
        } catch (err: any) {
            console.error('[Demandes] handleUpdateStatus exception:', err?.message ?? err);
        }
    };

    const filtered = activeFilter === 'ALL'
        ? enrollments
        : enrollments.filter(e => e.status === activeFilter);

    return (
        <SafeAreaView style={styles.safe} edges={['top']}>
            {/* ── HEADER ── */}
            <View style={styles.header}>
                <View style={styles.headerTop}>
                    <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
                        <ChevronLeft color={colors.white} size={20} />
                    </TouchableOpacity>
                    <View style={{ flex: 1, marginLeft: 12 }}>
                        <Text style={styles.headerTitle}>DEMANDES</Text>
                        <Text style={styles.headerSub}>ENRÔLEMENTS EN ATTENTE</Text>
                    </View>
                    {pendingCount > 0 && (
                        <View style={styles.countBadge}>
                            <Text style={styles.countBadgeText}>{pendingCount}</Text>
                        </View>
                    )}
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
                {loading ? (
                    <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />
                ) : filtered.length === 0 ? (
                    <View style={styles.emptyCard}>
                        <Text style={styles.emptyText}>AUCUNE DEMANDE</Text>
                    </View>
                ) : (
                    filtered.map(enroll => {
                        const sc   = STATUS_CONFIG[enroll.status] ?? STATUS_CONFIG.PENDING;
                        const rc   = ROLE_CONFIG[enroll.role ?? ''] ?? { bg: colors.slate100, text: colors.slate600 };
                        const init = getInitials(enroll.first_name, enroll.last_name);
                        const av   = getAvatarColor(enroll.id);

                        return (
                            <View key={enroll.id} style={styles.card}>
                                {/* Ligne haut */}
                                <View style={styles.cardTop}>
                                    <View style={[styles.avatar, { backgroundColor: av }]}>
                                        <Text style={styles.avatarText}>{init}</Text>
                                    </View>
                                    <View style={{ flex: 1, marginLeft: 12 }}>
                                        <Text style={styles.cardName}>
                                            {enroll.first_name ?? ''} {enroll.last_name ?? '–'}
                                        </Text>
                                        <View style={styles.badgeRow}>
                                            <View style={[styles.badge, { backgroundColor: rc.bg }]}>
                                                <Text style={[styles.badgeText, { color: rc.text }]}>
                                                    {enroll.role ?? 'INCONNU'}
                                                </Text>
                                            </View>
                                        </View>
                                    </View>
                                    <View style={[styles.badge, { backgroundColor: sc.bg }]}>
                                        <Text style={[styles.badgeText, { color: sc.text }]}>{sc.label}</Text>
                                    </View>
                                </View>

                                {/* Détails */}
                                <View style={styles.detailsBlock}>
                                    {enroll.phone && (
                                        <View style={styles.detailRow}>
                                            <Phone color={colors.slate400} size={13} />
                                            <Text style={styles.detailText}>{enroll.phone}</Text>
                                        </View>
                                    )}
                                    {enroll.shop_name && (
                                        <View style={styles.detailRow}>
                                            <Store color={colors.slate400} size={13} />
                                            <Text style={styles.detailText}>{enroll.shop_name}</Text>
                                        </View>
                                    )}
                                    {enroll.address && (
                                        <View style={styles.detailRow}>
                                            <MapPin color={colors.slate400} size={13} />
                                            <Text style={styles.detailText}>{enroll.address}</Text>
                                        </View>
                                    )}
                                    {enroll.agent_name && (
                                        <View style={styles.detailRow}>
                                            <User color={colors.slate400} size={13} />
                                            <Text style={styles.detailText}>Agent : {enroll.agent_name}</Text>
                                        </View>
                                    )}
                                    <Text style={styles.dateText}>
                                        Soumis le {new Date(enroll.created_at).toLocaleDateString('fr-FR')}
                                    </Text>
                                </View>

                                {/* Actions PENDING */}
                                {enroll.status === 'PENDING' && (
                                    <View style={styles.actionRow}>
                                        <TouchableOpacity
                                            style={styles.validateBtn}
                                            onPress={() => handleUpdateStatus(enroll, 'VALIDATED')}
                                        >
                                            <Text style={styles.validateBtnText}>VALIDER</Text>
                                        </TouchableOpacity>
                                        <TouchableOpacity
                                            style={styles.rejectBtn}
                                            onPress={() => handleUpdateStatus(enroll, 'REJECTED')}
                                        >
                                            <Text style={styles.rejectBtnText}>REJETER</Text>
                                        </TouchableOpacity>
                                    </View>
                                )}
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
        gap: 16,
    },
    headerTop:  { flexDirection: 'row', alignItems: 'center' },
    headerTitle:{ fontSize: 18, fontWeight: '900', color: colors.white },
    headerSub:  { fontSize: 11, fontWeight: '700', color: 'rgba(255,255,255,0.6)', marginTop: 2, letterSpacing: 1 },
    backBtn: {
        width: 40, height: 40, borderRadius: 10,
        backgroundColor: 'rgba(255,255,255,0.2)',
        alignItems: 'center', justifyContent: 'center',
    },
    countBadge: {
        backgroundColor: '#fbbf24',
        borderRadius: 6,
        minWidth: 28, height: 28,
        alignItems: 'center', justifyContent: 'center',
        paddingHorizontal: 6,
    },
    countBadgeText: { fontSize: 13, fontWeight: '900', color: '#78350f' },

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
    scrollContent: { paddingTop: 20, paddingHorizontal: 16, paddingBottom: 40, gap: 12 },

    card: {
        backgroundColor: colors.white,
        borderRadius: 10,
        padding: 14,
        borderWidth: 1,
        borderColor: colors.slate100,
        gap: 12,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.05,
        shadowRadius: 4,
        elevation: 2,
    },
    cardTop: { flexDirection: 'row', alignItems: 'flex-start' },
    avatar: {
        width: 44, height: 44, borderRadius: 10,
        alignItems: 'center', justifyContent: 'center',
    },
    avatarText: { fontSize: 15, fontWeight: '900', color: colors.white },
    cardName:   { fontSize: 14, fontWeight: '800', color: colors.slate800 },
    badgeRow:   { flexDirection: 'row', gap: 6, marginTop: 4 },
    badge:      { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
    badgeText:  { fontSize: 9, fontWeight: '700' },

    detailsBlock: { gap: 6 },
    detailRow:    { flexDirection: 'row', alignItems: 'center', gap: 6 },
    detailText:   { fontSize: 12, color: colors.slate600, flex: 1 },
    dateText:     { fontSize: 10, color: colors.slate400, marginTop: 2 },

    actionRow: { flexDirection: 'row', gap: 10 },
    validateBtn: {
        flex: 1, backgroundColor: colors.primary,
        borderRadius: 8, paddingVertical: 10,
        alignItems: 'center',
    },
    validateBtnText: { fontSize: 12, fontWeight: '900', color: colors.white, letterSpacing: 1 },
    rejectBtn: {
        flex: 1, borderWidth: 1.5,
        borderColor: colors.error,
        borderRadius: 8, paddingVertical: 10,
        alignItems: 'center',
        backgroundColor: 'transparent',
    },
    rejectBtnText: { fontSize: 12, fontWeight: '900', color: colors.error, letterSpacing: 1 },

    emptyCard: {
        backgroundColor: colors.white, borderRadius: 10, padding: 40,
        alignItems: 'center', borderWidth: 2, borderColor: colors.slate100,
        borderStyle: 'dashed',
    },
    emptyText: { fontSize: 10, fontWeight: '900', color: colors.slate300, letterSpacing: 2 },
});
