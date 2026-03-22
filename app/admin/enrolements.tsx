// Gestion des enrôlements — Admin
// Valider ou refuser avec motif → notification à l'agent
import React, { useState, useCallback } from 'react';
import {
    View, Text, ScrollView, StyleSheet, TouchableOpacity,
    ActivityIndicator, Alert, TextInput, Modal, Dimensions,
    KeyboardAvoidingView, Platform, useWindowDimensions,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Phone, MapPin, Store, User, Check, X, ChevronDown } from 'lucide-react-native';
import { ScreenHeader } from '@/src/components/ui';
import { supabase } from '@/src/lib/supabase';
import { emitEvent } from '@/src/lib/socket';
import { colors } from '@/src/lib/colors';

const { width: SCREEN_W } = Dimensions.get('window');

// ── Types ──────────────────────────────────────────────────────────────────────
interface Demande {
    id: string;
    nom: string;
    telephone: string;
    type: 'MERCHANT' | 'PRODUCER';
    adresse: string;
    nom_boutique: string;
    statut: 'en_attente' | 'valide' | 'rejete';
    motif_rejet?: string;
    date_demande: string;
    agent_id?: string;
    // Enrichi depuis profiles
    agent_nom?: string;
    agent_telephone?: string;
}

type FilterTab = 'en_attente' | 'valide' | 'rejete';

const TABS: { key: FilterTab; label: string }[] = [
    { key: 'en_attente', label: 'En attente' },
    { key: 'valide',     label: 'Validées' },
    { key: 'rejete',     label: 'Refusées' },
];

const TYPE_LABEL: Record<string, string> = {
    MERCHANT: 'Marchand',
    PRODUCER: 'Producteur',
};

// ── Composant principal ────────────────────────────────────────────────────────
export default function AdminEnrolements() {
    const [demandes, setDemandes]     = useState<Demande[]>([]);
    const [loading, setLoading]       = useState(true);
    const [activeTab, setActiveTab]   = useState<FilterTab>('en_attente');
    const [processing, setProcessing] = useState<string | null>(null);

    // Modal de refus
    const [refusModal, setRefusModal] = useState<Demande | null>(null);
    const [motif, setMotif]           = useState('');

    const { width } = useWindowDimensions();
    const isDesktop = Platform.OS === 'web' && width > 768;

    const fetchDemandes = useCallback(async () => {
        setLoading(true);
        try {
            const { data, error } = await supabase
                .from('demandes_enrolement')
                .select('*')
                .order('date_demande', { ascending: false });

            if (error) throw error;
            const list = (data ?? []) as Demande[];
            console.log('[AdminEnrolements] ✅ demandes chargées:', list.length, '— en_attente:', list.filter(d => d.statut === 'en_attente').length);

            // Enrichir avec les infos agents
            const agentIds = [...new Set(list.map(d => d.agent_id).filter(Boolean))] as string[];
            let agentMap: Record<string, { nom: string; telephone: string }> = {};

            if (agentIds.length > 0) {
                const { data: agents } = await supabase
                    .from('profiles')
                    .select('id, full_name, phone_number')
                    .in('id', agentIds);

                for (const a of (agents ?? [])) {
                    agentMap[a.id] = { nom: a.full_name, telephone: a.phone_number };
                }
            }

            setDemandes(list.map(d => ({
                ...d,
                agent_nom:       d.agent_id ? (agentMap[d.agent_id]?.nom ?? 'Agent inconnu') : undefined,
                agent_telephone: d.agent_id ? (agentMap[d.agent_id]?.telephone ?? '') : undefined,
            })));
        } catch (err) {
            console.error('[AdminEnrolements] fetch error:', err);
        } finally {
            setLoading(false);
        }
    }, []);

    useFocusEffect(useCallback(() => { fetchDemandes(); }, [fetchDemandes]));

    // ── Valider ───────────────────────────────────────────────────────────────
    const handleValider = async (demande: Demande) => {
        setProcessing(demande.id);
        try {
            const { error } = await supabase
                .from('demandes_enrolement')
                .update({ statut: 'valide' })
                .eq('id', demande.id);

            if (error) throw error;

            // Notification à l'agent
            if (demande.agent_id) {
                await supabase.from('notifications').insert([{
                    user_id: demande.agent_id,
                    titre:   'Enrôlement validé ✓',
                    message: `L'enrôlement de ${demande.nom} (${TYPE_LABEL[demande.type] ?? demande.type}) a été validé par l'administration.`,
                    type:    'enrolement',
                    lu:      false,
                    data:    { demande_id: demande.id, statut: 'valide' },
                }]);

                emitEvent('enrolement-valide', {
                    agentId:     demande.agent_id,
                    marchandId:  demande.id,
                    marchandName: demande.nom,
                    cooperativeName: 'Administration',
                    demandId:    demande.id,
                });
            }

            const { error: logErr1 } = await supabase.from('activity_logs').insert([{
                user_id:   null,
                user_name: 'Admin',
                action:    `Enrôlement validé : ${demande.nom} (${TYPE_LABEL[demande.type] ?? demande.type})`,
                type:      'enrolement',
            }]);
            if (logErr1) console.warn('[Enrolements] activity_log insert:', logErr1.message);

            fetchDemandes();
            Alert.alert('Validé', `L'enrôlement de ${demande.nom} a été validé. L'agent a été notifié.`);
        } catch (err: any) {
            Alert.alert('Erreur', err?.message ?? 'Une erreur est survenue.');
        } finally {
            setProcessing(null);
        }
    };

    // ── Refuser avec motif ─────────────────────────────────────────────────────
    const handleRefuser = async () => {
        if (!refusModal) return;
        if (!motif.trim()) {
            Alert.alert('Motif requis', 'Précisez ce qui manque pour que l\'agent puisse corriger.');
            return;
        }

        setProcessing(refusModal.id);
        const demande = refusModal;
        setRefusModal(null);

        try {
            const { error } = await supabase
                .from('demandes_enrolement')
                .update({ statut: 'rejete', motif_rejet: motif.trim() })
                .eq('id', demande.id);

            if (error) throw error;

            // Notification à l'agent avec le motif
            if (demande.agent_id) {
                await supabase.from('notifications').insert([{
                    user_id: demande.agent_id,
                    titre:   'Enrôlement refusé — correction requise',
                    message: `L'enrôlement de ${demande.nom} a été refusé. Motif : ${motif.trim()}. Veuillez soumettre à nouveau avec les informations manquantes.`,
                    type:    'enrolement',
                    lu:      false,
                    data:    { demande_id: demande.id, statut: 'rejete', motif: motif.trim() },
                }]);

                emitEvent('enrolement-rejete', {
                    agentId:     demande.agent_id,
                    marchandId:  demande.id,
                    marchandName: demande.nom,
                    reason:      motif.trim(),
                    demandId:    demande.id,
                });
            }

            const { error: logErr2 } = await supabase.from('activity_logs').insert([{
                user_id:   null,
                user_name: 'Admin',
                action:    `Enrôlement refusé : ${demande.nom} — ${motif.trim()}`,
                type:      'enrolement',
            }]);
            if (logErr2) console.warn('[Enrolements] activity_log insert:', logErr2.message);

            setMotif('');
            fetchDemandes();
            Alert.alert('Refusé', `L'agent a été notifié du motif de refus.`);
        } catch (err: any) {
            Alert.alert('Erreur', err?.message ?? 'Une erreur est survenue.');
        } finally {
            setProcessing(null);
        }
    };

    const filtered = demandes.filter(d => d.statut === activeTab);
    const pendingCount = demandes.filter(d => d.statut === 'en_attente').length;

    return (
        <View style={s.safe}>
            <ScreenHeader
                title="Enrôlements"
                subtitle={pendingCount > 0 ? `${pendingCount} en attente` : 'Demandes d\'enrôlement'}
                showBack={true}
                paddingBottom={12}
            >
                {/* Onglets filtre */}
                {isDesktop ? (
                    <View style={{ flexDirection: 'row', gap: 8 }}>
                        {TABS.map(tab => {
                            const count = demandes.filter(d => d.statut === tab.key).length;
                            return (
                                <TouchableOpacity
                                    key={tab.key}
                                    style={[s.tab, activeTab === tab.key && s.tabActive]}
                                    onPress={() => setActiveTab(tab.key)}
                                >
                                    <Text style={[s.tabText, activeTab === tab.key && s.tabTextActive]}>
                                        {tab.label}
                                        {count > 0 ? ` (${count})` : ''}
                                    </Text>
                                </TouchableOpacity>
                            );
                        })}
                    </View>
                ) : (
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.tabsScroll}>
                        {TABS.map(tab => {
                            const count = demandes.filter(d => d.statut === tab.key).length;
                            return (
                                <TouchableOpacity
                                    key={tab.key}
                                    style={[s.tab, activeTab === tab.key && s.tabActive]}
                                    onPress={() => setActiveTab(tab.key)}
                                >
                                    <Text style={[s.tabText, activeTab === tab.key && s.tabTextActive]}>
                                        {tab.label}
                                        {count > 0 ? ` (${count})` : ''}
                                    </Text>
                                </TouchableOpacity>
                            );
                        })}
                    </ScrollView>
                )}
            </ScreenHeader>

            <ScrollView
                style={s.scroll}
                keyboardShouldPersistTaps="handled"
                contentContainerStyle={[s.scrollContent, isDesktop && { maxWidth: 1400, alignSelf: 'center', width: '100%', padding: 32 }]}
                showsVerticalScrollIndicator={false}
            >
                {loading ? (
                    <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />
                ) : filtered.length === 0 ? (
                    <View style={s.emptyCard}>
                        <Text style={s.emptyText}>AUCUNE DEMANDE {activeTab === 'en_attente' ? 'EN ATTENTE' : activeTab === 'valide' ? 'VALIDÉE' : 'REFUSÉE'}</Text>
                    </View>
                ) : isDesktop ? (
                    <View style={dtE.tableCard}>
                        <View style={dtE.tableHeader}>
                            <Text style={[dtE.thText, { flex: 2 }]}>NOM</Text>
                            <Text style={[dtE.thText, { flex: 1.2 }]}>TYPE</Text>
                            <Text style={[dtE.thText, { flex: 1.5 }]}>TELEPHONE</Text>
                            <Text style={[dtE.thText, { flex: 2 }]}>BOUTIQUE</Text>
                            <Text style={[dtE.thText, { flex: 1.5 }]}>AGENT</Text>
                            <Text style={[dtE.thText, { flex: 1.5 }]}>DATE</Text>
                            <Text style={[dtE.thText, { flex: 1 }]}>STATUT</Text>
                            {activeTab === 'en_attente' && <Text style={[dtE.thText, { flex: 1.5 }]}>ACTIONS</Text>}
                        </View>
                        {filtered.map((demande, idx) => {
                            const statColors = {
                                en_attente: { bg: '#fef3c7', text: '#92400e', label: 'En attente' },
                                valide:     { bg: '#d1fae5', text: '#065f46', label: 'Validee' },
                                rejete:     { bg: '#fee2e2', text: '#991b1b', label: 'Refusee' },
                            }[demande.statut];
                            return (
                                <View key={demande.id} style={[dtE.tableRow, idx % 2 === 1 && { backgroundColor: '#f8fafc' }]}>
                                    <Text style={[dtE.cellText, { flex: 2, fontWeight: '700', color: '#1e293b' }]} numberOfLines={1}>{demande.nom}</Text>
                                    <Text style={[dtE.cellText, { flex: 1.2 }]}>{TYPE_LABEL[demande.type] ?? demande.type}</Text>
                                    <Text style={[dtE.cellText, { flex: 1.5 }]}>{demande.telephone}</Text>
                                    <Text style={[dtE.cellText, { flex: 2 }]} numberOfLines={1}>{demande.nom_boutique || '--'}</Text>
                                    <Text style={[dtE.cellText, { flex: 1.5 }]} numberOfLines={1}>{demande.agent_nom || '--'}</Text>
                                    <Text style={[dtE.cellText, { flex: 1.5, color: '#94a3b8' }]}>
                                        {new Date(demande.date_demande).toLocaleDateString('fr-FR')}
                                    </Text>
                                    <View style={{ flex: 1 }}>
                                        <View style={[s.statusBadge, { backgroundColor: statColors.bg, alignSelf: 'flex-start' }]}>
                                            <Text style={[s.statusText, { color: statColors.text }]}>{statColors.label}</Text>
                                        </View>
                                    </View>
                                    {activeTab === 'en_attente' && (
                                        <View style={{ flex: 1.5, flexDirection: 'row', gap: 6 }}>
                                            {processing === demande.id ? (
                                                <ActivityIndicator color={colors.primary} size="small" />
                                            ) : (
                                                <>
                                                    <TouchableOpacity
                                                        style={dtE.btnSmallValider}
                                                        onPress={() => handleValider(demande)}
                                                        activeOpacity={0.85}
                                                    >
                                                        <Check color={colors.white} size={14} />
                                                    </TouchableOpacity>
                                                    <TouchableOpacity
                                                        style={dtE.btnSmallRefuser}
                                                        onPress={() => { setMotif(''); setRefusModal(demande); }}
                                                        activeOpacity={0.85}
                                                    >
                                                        <X color={colors.error} size={14} />
                                                    </TouchableOpacity>
                                                </>
                                            )}
                                        </View>
                                    )}
                                </View>
                            );
                        })}
                    </View>
                ) : (
                    filtered.map(demande => (
                        <DemandeCard
                            key={demande.id}
                            demande={demande}
                            processing={processing === demande.id}
                            onValider={() => handleValider(demande)}
                            onRefuser={() => { setMotif(''); setRefusModal(demande); }}
                        />
                    ))
                )}
            </ScrollView>

            {/* ── Modal refus avec motif ── */}
            <Modal
                visible={!!refusModal}
                transparent
                animationType="fade"
                onRequestClose={() => setRefusModal(null)}
            >
                <KeyboardAvoidingView
                    behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                    style={{ flex: 1 }}
                >
                <View style={s.overlay}>
                    <View style={s.modalBox}>
                        <Text style={s.modalTitle}>Motif du refus</Text>
                        <Text style={s.modalSub}>
                            Indiquez ce qui manque. L'agent recevra ce message et pourra corriger.
                        </Text>

                        {refusModal && (
                            <View style={s.modalName}>
                                <User color={colors.slate400} size={14} />
                                <Text style={s.modalNameText} numberOfLines={1}>
                                    {refusModal.nom} · {TYPE_LABEL[refusModal.type] ?? refusModal.type}
                                </Text>
                            </View>
                        )}

                        <TextInput
                            style={s.motifInput}
                            placeholder="Ex : Photo d'identité manquante, adresse incomplète..."
                            placeholderTextColor={colors.slate300}
                            value={motif}
                            onChangeText={setMotif}
                            multiline
                            numberOfLines={4}
                            textAlignVertical="top"
                            autoFocus
                        />

                        <View style={s.modalBtns}>
                            <TouchableOpacity
                                style={s.modalBtnCancel}
                                onPress={() => { setRefusModal(null); setMotif(''); }}
                            >
                                <Text style={s.modalBtnCancelText}>Annuler</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={s.modalBtnRefus}
                                onPress={handleRefuser}
                            >
                                <X color={colors.white} size={16} />
                                <Text style={s.modalBtnRefusText}>Envoyer le refus</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
                </KeyboardAvoidingView>
            </Modal>
        </View>
    );
}

// ── Carte d'une demande ────────────────────────────────────────────────────────
function DemandeCard({
    demande, processing, onValider, onRefuser,
}: {
    demande: Demande;
    processing: boolean;
    onValider: () => void;
    onRefuser: () => void;
}) {
    const [expanded, setExpanded] = useState(false);

    const statColors = {
        en_attente: { bg: '#fef3c7', text: '#92400e', label: 'En attente' },
        valide:     { bg: '#d1fae5', text: '#065f46', label: 'Validée' },
        rejete:     { bg: '#fee2e2', text: '#991b1b', label: 'Refusée' },
    }[demande.statut];

    const initials = (demande.nom ?? '?').trim().split(' ')
        .slice(0, 2).map(w => w[0]?.toUpperCase() ?? '').join('');

    return (
        <View style={s.card}>
            {/* Ligne haut : initiales + nom + statut */}
            <View style={s.cardTop}>
                <View style={s.avatar}>
                    <Text style={s.avatarText}>{initials}</Text>
                </View>
                <View style={s.cardMain}>
                    <Text style={s.cardNom} numberOfLines={1}>{demande.nom}</Text>
                    <Text style={s.cardType}>{TYPE_LABEL[demande.type] ?? demande.type}</Text>
                </View>
                <View style={[s.statusBadge, { backgroundColor: statColors.bg }]}>
                    <Text style={[s.statusText, { color: statColors.text }]}>{statColors.label}</Text>
                </View>
            </View>

            {/* Infos principales */}
            <View style={s.infoBlock}>
                <InfoRow icon={<Phone color={colors.slate400} size={13} />} text={demande.telephone} />
                {!!demande.nom_boutique && <InfoRow icon={<Store color={colors.slate400} size={13} />} text={demande.nom_boutique} />}
                {!!demande.adresse     && <InfoRow icon={<MapPin color={colors.slate400} size={13} />} text={demande.adresse} />}
            </View>

            {/* Infos agent — toujours visibles */}
            {demande.agent_nom && (
                <View style={s.agentBlock}>
                    <User color={colors.primary} size={13} />
                    <Text style={s.agentText}>
                        Agent : <Text style={s.agentName}>{demande.agent_nom}</Text>
                        {demande.agent_telephone ? `  ·  ${demande.agent_telephone}` : ''}
                    </Text>
                </View>
            )}

            {/* Date */}
            <Text style={s.dateText}>
                Soumis le {new Date(demande.date_demande).toLocaleDateString('fr-FR', {
                    day: '2-digit', month: 'long', year: 'numeric',
                })}
            </Text>

            {/* Motif de refus (si refusée) */}
            {demande.statut === 'rejete' && demande.motif_rejet && (
                <View style={s.motifBlock}>
                    <Text style={s.motifLabel}>MOTIF DU REFUS</Text>
                    <Text style={s.motifText}>{demande.motif_rejet}</Text>
                </View>
            )}

            {/* Actions (uniquement pour les demandes en attente) */}
            {demande.statut === 'en_attente' && (
                <View style={s.actionRow}>
                    {processing ? (
                        <ActivityIndicator color={colors.primary} />
                    ) : (
                        <>
                            <TouchableOpacity style={s.btnValider} onPress={onValider} activeOpacity={0.85}>
                                <Check color={colors.white} size={16} />
                                <Text style={s.btnValiderText}>VALIDER</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={s.btnRefuser} onPress={onRefuser} activeOpacity={0.85}>
                                <X color={colors.error} size={16} />
                                <Text style={s.btnRefuserText}>REFUSER</Text>
                            </TouchableOpacity>
                        </>
                    )}
                </View>
            )}
        </View>
    );
}

function InfoRow({ icon, text }: { icon: React.ReactNode; text: string }) {
    return (
        <View style={s.infoRow}>
            {icon}
            <Text style={s.infoText} numberOfLines={1}>{text}</Text>
        </View>
    );
}

// ── Styles ─────────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
    safe:          { flex: 1, backgroundColor: colors.bgSecondary },
    scroll:        { flex: 1 },
    scrollContent: { paddingHorizontal: 16, paddingTop: 20, paddingBottom: 40, gap: 12 },

    // Onglets
    tabsScroll: { flexGrow: 0 },
    tab: {
        paddingHorizontal: 14, paddingVertical: 7, borderRadius: 8,
        backgroundColor: 'rgba(255,255,255,0.15)', marginRight: 8,
    },
    tabActive:     { backgroundColor: colors.white },
    tabText:       { fontSize: 12, fontWeight: '700', color: 'rgba(255,255,255,0.8)' },
    tabTextActive: { color: colors.primary },

    // Carte demande
    card: {
        backgroundColor: colors.white, borderRadius: 10, padding: 14,
        borderWidth: 1, borderColor: colors.slate100, gap: 10,
        shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.05, shadowRadius: 4, elevation: 2,
    },
    cardTop: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    avatar: {
        width: 44, height: 44, borderRadius: 10,
        backgroundColor: colors.primary,
        alignItems: 'center', justifyContent: 'center', flexShrink: 0,
    },
    avatarText: { fontSize: 15, fontWeight: '900', color: colors.white },
    cardMain:   { flex: 1, minWidth: 0 },
    cardNom:    { fontSize: 14, fontWeight: '800', color: colors.slate800 },
    cardType:   { fontSize: 11, fontWeight: '600', color: colors.slate500, marginTop: 2 },
    statusBadge:{ paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, flexShrink: 0 },
    statusText: { fontSize: 11, fontWeight: '700' },

    // Infos
    infoBlock: { gap: 6 },
    infoRow:   { flexDirection: 'row', alignItems: 'center', gap: 6 },
    infoText:  { fontSize: 12, color: colors.slate600, flex: 1 },

    // Agent
    agentBlock: {
        flexDirection: 'row', alignItems: 'center', gap: 6,
        backgroundColor: '#f0fdf4', borderRadius: 8, padding: 8,
    },
    agentText: { fontSize: 12, color: colors.slate600, flex: 1 },
    agentName: { fontWeight: '700', color: colors.primary },

    // Date
    dateText: { fontSize: 11, color: colors.slate400 },

    // Motif refus
    motifBlock: {
        backgroundColor: '#fef2f2', borderRadius: 8, padding: 10,
        borderLeftWidth: 3, borderLeftColor: colors.error, gap: 4,
    },
    motifLabel: { fontSize: 11, fontWeight: '900', color: colors.error, letterSpacing: 1 },
    motifText:  { fontSize: 12, color: '#7f1d1d', lineHeight: 18 },

    // Boutons action
    actionRow: { flexDirection: 'row', gap: 10, paddingTop: 4, borderTopWidth: 1, borderTopColor: colors.slate100 },
    btnValider: {
        flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
        backgroundColor: colors.primary, borderRadius: 8, paddingVertical: 10,
    },
    btnValiderText: { fontSize: 12, fontWeight: '900', color: colors.white, letterSpacing: 1 },
    btnRefuser: {
        flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
        borderWidth: 1.5, borderColor: colors.error, borderRadius: 8, paddingVertical: 10,
        backgroundColor: 'transparent',
    },
    btnRefuserText: { fontSize: 12, fontWeight: '900', color: colors.error, letterSpacing: 1 },

    // Modal refus
    overlay: {
        flex: 1, backgroundColor: 'rgba(0,0,0,0.5)',
        justifyContent: 'flex-end',
    },
    modalBox: {
        backgroundColor: colors.white,
        borderTopLeftRadius: 20, borderTopRightRadius: 20,
        padding: 24, gap: 14,
    },
    modalTitle:   { fontSize: 16, fontWeight: '900', color: colors.slate900 },
    modalSub:     { fontSize: 13, color: colors.slate500, lineHeight: 20 },
    modalName: {
        flexDirection: 'row', alignItems: 'center', gap: 6,
        backgroundColor: colors.slate50, borderRadius: 8, padding: 10,
    },
    modalNameText: { fontSize: 13, fontWeight: '700', color: colors.slate700, flex: 1 },
    motifInput: {
        backgroundColor: colors.slate50, borderRadius: 10,
        borderWidth: 1, borderColor: colors.slate200,
        paddingHorizontal: 14, paddingVertical: 12,
        fontSize: 14, color: colors.slate800,
        minHeight: 100,
    },
    modalBtns:          { flexDirection: 'row', gap: 10 },
    modalBtnCancel: {
        flex: 1, paddingVertical: 12, borderRadius: 8,
        borderWidth: 1.5, borderColor: colors.slate200,
        alignItems: 'center', backgroundColor: colors.white,
    },
    modalBtnCancelText: { fontSize: 13, fontWeight: '700', color: colors.slate600 },
    modalBtnRefus: {
        flex: 2, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
        paddingVertical: 12, borderRadius: 8,
        backgroundColor: colors.error,
    },
    modalBtnRefusText: { fontSize: 13, fontWeight: '900', color: colors.white },

    // Empty
    emptyCard: {
        backgroundColor: colors.white, borderRadius: 10, padding: 40,
        alignItems: 'center', borderWidth: 2, borderColor: colors.slate100, borderStyle: 'dashed',
    },
    emptyText: { fontSize: 11, fontWeight: '900', color: colors.slate300, letterSpacing: 2 },
});

// ── Desktop table styles ────────────────────────────────────────────────────────
const dtE = StyleSheet.create({
    tableCard: {
        backgroundColor: '#fff', borderRadius: 12, overflow: 'hidden',
        shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.06, shadowRadius: 12, elevation: 3,
        borderWidth: 1, borderColor: '#f1f5f9',
    },
    tableHeader: {
        flexDirection: 'row', alignItems: 'center',
        paddingHorizontal: 14, paddingVertical: 10,
        backgroundColor: '#f1f5f9',
    },
    thText: { fontSize: 10, fontWeight: '900', color: '#94a3b8', letterSpacing: 1 },
    tableRow: {
        flexDirection: 'row', alignItems: 'center',
        paddingHorizontal: 14, paddingVertical: 12,
        backgroundColor: '#fff',
        borderBottomWidth: 1, borderBottomColor: '#f1f5f9',
    },
    cellText: { fontSize: 12, color: '#64748b' },
    btnSmallValider: {
        width: 32, height: 32, borderRadius: 8,
        backgroundColor: colors.primary,
        alignItems: 'center', justifyContent: 'center',
    },
    btnSmallRefuser: {
        width: 32, height: 32, borderRadius: 8,
        borderWidth: 1.5, borderColor: colors.error,
        backgroundColor: '#fff',
        alignItems: 'center', justifyContent: 'center',
    },
});
