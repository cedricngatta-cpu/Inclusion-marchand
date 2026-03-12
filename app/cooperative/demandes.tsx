// Demandes d'enrôlement — Coopérative
import React, { useState, useEffect, useCallback } from 'react';
import {
    View, Text, ScrollView, StyleSheet, TouchableOpacity,
    ActivityIndicator,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Phone, MapPin, Store } from 'lucide-react-native';
import { ScreenHeader } from '@/src/components/ui';
import { supabase } from '@/src/lib/supabase';
import { colors } from '@/src/lib/colors';
import { onSocketEvent, emitEvent } from '@/src/lib/socket';
import { useAuth } from '@/src/context/AuthContext';

// ── Types ──────────────────────────────────────────────────────────────────────
interface Enrollment {
    id: string;
    statut: 'en_attente' | 'valide' | 'rejete';
    date_demande: string;
    nom?: string;
    telephone?: string;
    type?: string;
    nom_boutique?: string;
    adresse?: string;
    agent_id?: string;   // UUID de l'agent — utilisé pour router la notification Socket.io
}

// ── Helpers ───────────────────────────────────────────────────────────────────
const FILTER_TABS = [
    { key: 'ALL',        label: 'Toutes' },
    { key: 'en_attente', label: 'À vérifier' },
    { key: 'valide',     label: 'Confirmés' },
    { key: 'rejete',     label: 'Rejetés' },
];

const STATUS_CONFIG: Record<string, { bg: string; text: string; label: string }> = {
    en_attente: { bg: '#fef3c7', text: '#92400e', label: 'À vérifier' },
    valide:     { bg: '#d1fae5', text: '#065f46', label: 'Confirmé' },
    rejete:     { bg: '#fee2e2', text: '#991b1b', label: 'Rejeté' },
};

const ROLE_CONFIG: Record<string, { bg: string; text: string }> = {
    MERCHANT: { bg: '#dbeafe', text: '#1e40af' },
    PRODUCER: { bg: '#d1fae5', text: '#065f46' },
    AGENT:    { bg: '#ede9fe', text: '#5b21b6' },
};

function getInitials(nom?: string) {
    const parts = (nom ?? '?').trim().split(' ');
    const f = (parts[0] ?? '?')[0]?.toUpperCase() ?? '?';
    const l = parts.length > 1 ? (parts[parts.length - 1][0]?.toUpperCase() ?? '') : '';
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
    const { user } = useAuth();
    const [enrollments, setEnrollments] = useState<Enrollment[]>([]);
    const [activeFilter, setActiveFilter] = useState<string>('ALL');
    const [loading, setLoading]           = useState(true);
    const [pendingCount, setPendingCount] = useState(0);

    const fetchDemandes = useCallback(async () => {
        setLoading(true);
        try {
            const coopId = user?.id;
            const query = supabase
                .from('demandes_enrolement')
                .select('*')
                .order('date_demande', { ascending: false })
                .limit(50);
            // Filtrer par coopérative si l'ID est disponible
            const { data } = coopId
                ? await query.eq('cooperative_id', coopId)
                : await query;

            const list = (data as Enrollment[]) || [];
            setEnrollments(list);
            setPendingCount(list.filter(e => e.statut === 'en_attente').length);
        } catch (err) {
            console.error('[Demandes] fetch error:', err);
        } finally {
            setLoading(false);
        }
    }, [user]);

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

    const handleUpdateStatus = async (enroll: Enrollment, status: 'valide' | 'rejete') => {
        const marchandName = enroll.nom ?? '';
        console.log('[Demandes] handleUpdateStatus — id:', enroll.id, '→ nouveau statut:', status, '| agent_id:', enroll.agent_id);

        try {
            // 1. Mise à jour Supabase EN PREMIER
            const { error: updateError } = await supabase
                .from('demandes_enrolement')
                .update({ statut: status })
                .eq('id', enroll.id);

            if (updateError) {
                console.error('[Demandes] ❌ UPDATE demandes_enrolement ERREUR:', updateError.message, '| code:', updateError.code);
                return;
            }
            console.log('[Demandes] ✅ UPDATE demandes_enrolement OK — id:', enroll.id, 'statut:', status);

            // 2. Log activité
            try {
                await supabase.from('activity_logs').insert([{
                    user_id:   null,
                    user_name: 'Coopérative',
                    action:    `Enrôlement ${status === 'valide' ? 'validé' : 'rejeté'} : ${marchandName}`,
                    type:      'enrolement',
                }]);
                console.log('[Demandes] ✅ activity_log inséré');
            } catch (logErr) {
                console.warn('[Demandes] ⚠️ activity_log échec (non bloquant):', logErr);
            }

            // Créer/mettre à jour le profil avec cooperative_id si la demande en contient un
            if (status === 'valide' && (enroll as any).cooperative_id) {
                try {
                    const d = enroll as any;
                    // Insérer le profil s'il n'existe pas (par téléphone)
                    await supabase.from('profiles').upsert({
                        full_name:      d.nom,
                        phone_number:   d.telephone,
                        pin:            '1234',          // PIN temporaire — à changer à la première connexion
                        role:           d.type === 'MERCHANT' ? 'MERCHANT' : 'PRODUCER',
                        cooperative_id: d.cooperative_id,
                    }, { onConflict: 'phone_number', ignoreDuplicates: false });
                } catch (profileErr) {
                    console.warn('[Demandes] profil upsert non bloquant:', profileErr);
                }
            }

            // 3. Émettre Socket.io APRÈS Supabase
            if (status === 'valide') {
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
        : enrollments.filter(e => e.statut === activeFilter);

    return (
        <View style={styles.safe}>
            <ScreenHeader
                title="Validations"
                subtitle="Membres à vérifier"
                showBack={true}
                paddingBottom={12}
                rightIcon={pendingCount > 0 ? (
                    <View style={styles.countBadge}>
                        <Text style={styles.countBadgeText}>{pendingCount}</Text>
                    </View>
                ) : undefined}
            >
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
            </ScreenHeader>

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
                        const sc   = STATUS_CONFIG[enroll.statut] ?? STATUS_CONFIG.en_attente;
                        const rc   = ROLE_CONFIG[enroll.type ?? ''] ?? { bg: colors.slate100, text: colors.slate600 };
                        const init = getInitials(enroll.nom);
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
                                            {enroll.nom ?? '–'}
                                        </Text>
                                        <View style={styles.badgeRow}>
                                            <View style={[styles.badge, { backgroundColor: rc.bg }]}>
                                                <Text style={[styles.badgeText, { color: rc.text }]}>
                                                    {enroll.type ?? 'INCONNU'}
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
                                    {enroll.telephone && (
                                        <View style={styles.detailRow}>
                                            <Phone color={colors.slate400} size={13} />
                                            <Text style={styles.detailText}>{enroll.telephone}</Text>
                                        </View>
                                    )}
                                    {enroll.nom_boutique && (
                                        <View style={styles.detailRow}>
                                            <Store color={colors.slate400} size={13} />
                                            <Text style={styles.detailText}>{enroll.nom_boutique}</Text>
                                        </View>
                                    )}
                                    {enroll.adresse && (
                                        <View style={styles.detailRow}>
                                            <MapPin color={colors.slate400} size={13} />
                                            <Text style={styles.detailText}>{enroll.adresse}</Text>
                                        </View>
                                    )}
                                    <Text style={styles.dateText}>
                                        Soumis le {new Date(enroll.date_demande).toLocaleDateString('fr-FR')}
                                    </Text>
                                </View>

                                {/* Actions en attente */}
                                {enroll.statut === 'en_attente' && (
                                    <View style={styles.actionRow}>
                                        <TouchableOpacity
                                            style={styles.validateBtn}
                                            onPress={() => handleUpdateStatus(enroll, 'valide')}
                                        >
                                            <Text style={styles.validateBtnText}>CONFIRMER CE MEMBRE</Text>
                                        </TouchableOpacity>
                                        <TouchableOpacity
                                            style={styles.rejectBtn}
                                            onPress={() => handleUpdateStatus(enroll, 'rejete')}
                                        >
                                            <Text style={styles.rejectBtnText}>CE N'EST PAS UN DE NOS MEMBRES</Text>
                                        </TouchableOpacity>
                                    </View>
                                )}
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
    badgeText:  { fontSize: 11, fontWeight: '700' },

    detailsBlock: { gap: 6 },
    detailRow:    { flexDirection: 'row', alignItems: 'center', gap: 6 },
    detailText:   { fontSize: 12, color: colors.slate600, flex: 1 },
    dateText:     { fontSize: 11, color: colors.slate400, marginTop: 2 },

    actionRow: { flexDirection: 'column', gap: 8 },
    validateBtn: {
        backgroundColor: colors.primary,
        borderRadius: 8, paddingVertical: 12,
        alignItems: 'center',
    },
    validateBtnText: { fontSize: 12, fontWeight: '900', color: colors.white, letterSpacing: 1 },
    rejectBtn: {
        borderWidth: 1.5,
        borderColor: colors.error,
        borderRadius: 8, paddingVertical: 12,
        alignItems: 'center',
        backgroundColor: 'transparent',
    },
    rejectBtnText: { fontSize: 11, fontWeight: '900', color: colors.error, letterSpacing: 0.5 },

    emptyCard: {
        backgroundColor: colors.white, borderRadius: 10, padding: 40,
        alignItems: 'center', borderWidth: 2, borderColor: colors.slate100,
        borderStyle: 'dashed',
    },
    emptyText: { fontSize: 11, fontWeight: '900', color: colors.slate300, letterSpacing: 2 },
});
