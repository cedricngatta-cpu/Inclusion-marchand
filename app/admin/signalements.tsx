// Signalements — Admin : conformité terrain avec gestion de statut
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
    View, Text, ScrollView, StyleSheet, ActivityIndicator,
    RefreshControl, Alert,
} from 'react-native';
import { TouchableOpacity } from 'react-native-gesture-handler';
import { useFocusEffect } from 'expo-router';
import { Shield, UserX, AlertTriangle } from 'lucide-react-native';
import { ScreenHeader } from '@/src/components/ui';
import { supabase } from '@/src/lib/supabase';
import { colors } from '@/src/lib/colors';
import { emitEvent } from '@/src/lib/socket';

// ── Types ──────────────────────────────────────────────────────────────────────
interface Signalement {
    id: string;
    user_id: string | null;
    user_name: string;
    action: string;
    details: string | null;
    type: string;
    status: string | null;
    created_at: string;
}

type SigFilter = 'tous' | 'ouvert' | 'traitement' | 'clos';

// ── Helpers ───────────────────────────────────────────────────────────────────
const SIG_FILTERS: { key: SigFilter; label: string }[] = [
    { key: 'tous',       label: 'Tous' },
    { key: 'ouvert',     label: 'Ouverts' },
    { key: 'traitement', label: 'En traitement' },
    { key: 'clos',       label: 'Clos' },
];

const STATUS_STYLES: Record<string, { bg: string; text: string; label: string }> = {
    ouvert:     { bg: '#fee2e2', text: '#991b1b', label: 'OUVERT' },
    traitement: { bg: '#fef3c7', text: '#92400e', label: 'EN TRAITEMENT' },
    clos:       { bg: '#d1fae5', text: '#065f46', label: 'CLOS' },
};

// ── Composant principal ────────────────────────────────────────────────────────
export default function Signalements() {
    const [signalements, setSignalements]   = useState<Signalement[]>([]);
    const [localStatuses, setLocalStatuses] = useState<Record<string, string>>({});
    const [loading, setLoading]             = useState(true);
    const [refreshing, setRefreshing]       = useState(false);
    const [sigFilter, setSigFilter]         = useState<SigFilter>('tous');
    const [actionLoading, setActionLoading] = useState<string | null>(null);
    const [useFallback, setUseFallback]     = useState(false);

    const fetchSignalements = useCallback(async () => {
        try {
            let sigs: Signalement[] = [];

            // Source principale : activity_logs (type signalement ou conformite)
            const { data: logsData, error: logsErr } = await supabase
                .from('activity_logs')
                .select('*')
                .or('type.eq.signalement,type.eq.conformite')
                .order('created_at', { ascending: false })
                .limit(100);

            if (!logsErr && logsData && logsData.length > 0) {
                sigs = (logsData as Signalement[]);
                setUseFallback(false);
            } else {
                // Fallback : tous les logs activity (si table existe mais type différent)
                const { data: allLogs, error: allErr } = await supabase
                    .from('activity_logs')
                    .select('*')
                    .order('created_at', { ascending: false })
                    .limit(50);

                if (!allErr && allLogs && allLogs.length > 0) {
                    sigs = (allLogs as Signalement[]);
                    setUseFallback(false);
                } else {
                    // Fallback final : demandes_enrolement rejetées
                    setUseFallback(true);
                    const { data: enrollData } = await supabase
                        .from('demandes_enrolement')
                        .select('id, nom, telephone, type, statut, date_demande, agent_id')
                        .in('statut', ['rejete', 'en_attente'])
                        .order('date_demande', { ascending: false })
                        .limit(50);

                    sigs = ((enrollData ?? []) as any[]).map(e => ({
                        id:         e.id,
                        user_id:    e.agent_id ?? null,
                        user_name:  e.nom,
                        action:     `Enrôlement ${e.statut === 'rejete' ? 'refusé' : 'en attente'} · ${e.type === 'MERCHANT' ? 'Marchand' : 'Producteur'}`,
                        details:    e.telephone ?? null,
                        type:       'signalement',
                        status:     e.statut === 'rejete' ? 'clos' : 'ouvert',
                        created_at: e.date_demande,
                    }));
                }
            }
            setSignalements(sigs);
        } catch (err) {
            console.error('[Signalements] fetch error:', err);
            setSignalements([]);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, []);

    useEffect(() => { setLoading(true); fetchSignalements(); }, [fetchSignalements]);

    const onRefresh = useCallback(() => { setRefreshing(true); fetchSignalements(); }, [fetchSignalements]);

    useFocusEffect(useCallback(() => { fetchSignalements(); }, [fetchSignalements]));

    // ── Status effectif = override local prioritaire ─────────────────────────
    const getStatus = useCallback((sig: Signalement): string =>
        localStatuses[sig.id] ?? sig.status ?? 'ouvert',
    [localStatuses]);

    // ── Filtrage ──────────────────────────────────────────────────────────────
    const filtered = useMemo(() => {
        if (sigFilter === 'tous') return signalements;
        return signalements.filter(sig => getStatus(sig) === sigFilter);
    }, [signalements, sigFilter, getStatus]);

    const counts = useMemo(() => ({
        total:      signalements.length,
        ouvert:     signalements.filter(s => getStatus(s) === 'ouvert').length,
        traitement: signalements.filter(s => getStatus(s) === 'traitement').length,
        clos:       signalements.filter(s => getStatus(s) === 'clos').length,
    }), [signalements, getStatus]);

    // ── Changer statut ────────────────────────────────────────────────────────
    const handleChangeStatus = useCallback(async (sig: Signalement, newStatus: string) => {
        setLocalStatuses(prev => ({ ...prev, [sig.id]: newStatus }));
        try {
            await supabase.from('activity_logs').update({ status: newStatus }).eq('id', sig.id);
        } catch { /* colonne status peut-être absente — override local maintenu */ }
        emitEvent('signalement-conformite', {
            agentId:     sig.user_id,
            agentName:   sig.user_name,
            marchandName: sig.user_name,
            type:        'statut',
            description: `Statut mis à jour : ${newStatus}`,
            severity:    newStatus === 'clos' ? 'resolved' : 'medium',
        });
    }, []);

    // ── Sanctionner ───────────────────────────────────────────────────────────
    const handleSanctionner = useCallback((sig: Signalement) => {
        Alert.alert(
            'Sanctionner ce membre',
            `Désactiver le compte associé à "${sig.user_name}" ?\nCette action bloquera leur accès à l'application.`,
            [
                {
                    text: 'Sanctionner', style: 'destructive',
                    onPress: async () => {
                        setActionLoading(sig.id + '_sanction');
                        try {
                            if (sig.user_id) {
                                await supabase
                                    .from('profiles')
                                    .update({ is_blocked: true })
                                    .eq('id', sig.user_id);
                            }
                            // Log dans activity_logs
                            await supabase.from('activity_logs').insert([{
                                user_name: 'Admin',
                                action:    `Membre sanctionné : ${sig.user_name}`,
                                type:      'sanction',
                            }]);
                            emitEvent('signalement-conformite', {
                                agentId:     'admin',
                                agentName:   'Admin',
                                marchandId:  sig.user_id,
                                marchandName: sig.user_name,
                                type:        'sanction',
                                description: `Compte désactivé par l'admin`,
                                severity:    'critical',
                            });
                            handleChangeStatus(sig, 'clos');
                            Alert.alert('Sanction appliquée', `Le compte de "${sig.user_name}" a été désactivé.`);
                        } catch {
                            Alert.alert('Erreur', "Impossible d'appliquer la sanction. Vérifiez la connexion.");
                        } finally {
                            setActionLoading(null);
                        }
                    },
                },
                { text: 'Annuler', style: 'cancel' },
            ]
        );
    }, [handleChangeStatus]);

    return (
        <View style={s.safe}>
            <ScreenHeader title="Signalements" subtitle="Conformité terrain" showBack={true} paddingBottom={24}>
                <View style={s.kpiRow}>
                    <View style={s.kpiItem}>
                        <Text style={s.kpiValue}>{loading ? '–' : counts.total}</Text>
                        <Text style={s.kpiLabel}>TOTAL</Text>
                    </View>
                    <View style={s.kpiDivider} />
                    <View style={s.kpiItem}>
                        <Text style={[s.kpiValue, counts.ouvert > 0 && { color: '#fca5a5' }]}>
                            {loading ? '–' : counts.ouvert}
                        </Text>
                        <Text style={s.kpiLabel}>OUVERTS</Text>
                    </View>
                    <View style={s.kpiDivider} />
                    <View style={s.kpiItem}>
                        <Text style={[s.kpiValue, counts.traitement > 0 && { color: '#fde68a' }]}>
                            {loading ? '–' : counts.traitement}
                        </Text>
                        <Text style={s.kpiLabel}>EN COURS</Text>
                    </View>
                    <View style={s.kpiDivider} />
                    <View style={s.kpiItem}>
                        <Text style={s.kpiValue}>{loading ? '–' : counts.clos}</Text>
                        <Text style={s.kpiLabel}>CLOS</Text>
                    </View>
                </View>
            </ScreenHeader>

            <ScrollView
                style={s.scroll}
                contentContainerStyle={s.scrollContent}
                showsVerticalScrollIndicator={false}
                bounces={false}
                overScrollMode="never"
                refreshControl={
                    <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.primary]} />
                }
            >
                {/* Filtres */}
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.filterRow}>
                    {SIG_FILTERS.map(f => (
                        <TouchableOpacity
                            key={f.key}
                            style={[s.filterBtn, sigFilter === f.key && s.filterBtnActive]}
                            activeOpacity={0.82}
                            onPress={() => setSigFilter(f.key)}
                        >
                            <Text style={[s.filterLabel, sigFilter === f.key && s.filterLabelActive]}>
                                {f.label}
                            </Text>
                        </TouchableOpacity>
                    ))}
                </ScrollView>

                {/* Bannière fallback */}
                {useFallback && signalements.length > 0 && (
                    <View style={s.fallbackBanner}>
                        <AlertTriangle color="#92400e" size={14} />
                        <Text style={s.fallbackText}>
                            Affichage des enrôlements (table activity_logs non disponible)
                        </Text>
                    </View>
                )}

                {/* Liste */}
                {loading ? (
                    <ActivityIndicator color={colors.primary} style={{ marginTop: 32 }} />
                ) : filtered.length === 0 ? (
                    <View style={s.emptyCard}>
                        <Shield color={colors.slate300} size={44} />
                        <Text style={s.emptyText}>AUCUN SIGNALEMENT</Text>
                        <Text style={s.emptySub}>
                            {sigFilter === 'tous'
                                ? 'Les signalements des agents terrain apparaîtront ici'
                                : `Aucun signalement "${SIG_FILTERS.find(f => f.key === sigFilter)?.label}"`
                            }
                        </Text>
                    </View>
                ) : (
                    filtered.map(sig => {
                        const currentStatus = getStatus(sig);
                        const sc            = STATUS_STYLES[currentStatus] ?? STATUS_STYLES.ouvert;
                        const isSanctioning = actionLoading === sig.id + '_sanction';
                        const isClos        = currentStatus === 'clos';

                        return (
                            <View key={sig.id} style={s.sigCard}>
                                {/* Contenu principal */}
                                <View style={s.sigCardTop}>
                                    <View style={s.sigIconWrap}>
                                        <Shield color="#991b1b" size={18} />
                                    </View>
                                    <View style={s.sigInfo}>
                                        <Text style={s.sigAction} numberOfLines={2}>{sig.action}</Text>
                                        {sig.details ? (
                                            <Text style={s.sigDetails} numberOfLines={1}>{sig.details}</Text>
                                        ) : null}
                                        <Text style={s.sigMeta}>
                                            {sig.user_name} · {new Date(sig.created_at).toLocaleDateString('fr-FR', {
                                                day: '2-digit', month: 'short', year: 'numeric',
                                            })}
                                        </Text>
                                    </View>
                                    <View style={[s.statusBadge, { backgroundColor: sc.bg }]}>
                                        <Text style={[s.statusText, { color: sc.text }]}>{sc.label}</Text>
                                    </View>
                                </View>

                                {/* Boutons d'action (sauf si clos) */}
                                {!isClos && (
                                    <View style={s.actionRow}>
                                        {currentStatus === 'ouvert' && (
                                            <TouchableOpacity
                                                style={s.btnTraitement}
                                                onPress={() => handleChangeStatus(sig, 'traitement')}
                                                activeOpacity={0.85}
                                            >
                                                <Text style={s.btnText}>EN TRAITEMENT</Text>
                                            </TouchableOpacity>
                                        )}
                                        {currentStatus === 'traitement' && (
                                            <TouchableOpacity
                                                style={s.btnClos}
                                                onPress={() => handleChangeStatus(sig, 'clos')}
                                                activeOpacity={0.85}
                                            >
                                                <Text style={s.btnText}>CLÔTURER</Text>
                                            </TouchableOpacity>
                                        )}
                                        <TouchableOpacity
                                            style={s.btnSanction}
                                            onPress={() => handleSanctionner(sig)}
                                            disabled={isSanctioning}
                                            activeOpacity={0.85}
                                        >
                                            {isSanctioning ? (
                                                <ActivityIndicator color="#fff" size="small" />
                                            ) : (
                                                <>
                                                    <UserX color="#fff" size={13} />
                                                    <Text style={s.btnText}>SANCTIONNER</Text>
                                                </>
                                            )}
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
const s = StyleSheet.create({
    safe: { flex: 1, backgroundColor: '#f8fafc' },

    kpiRow: {
        flexDirection: 'row',
        backgroundColor: 'rgba(255,255,255,0.15)',
        borderRadius: 10, padding: 12,
    },
    kpiItem:    { flex: 1, alignItems: 'center' },
    kpiDivider: { width: 1, backgroundColor: 'rgba(255,255,255,0.3)', marginHorizontal: 4 },
    kpiValue:   { fontSize: 22, fontWeight: '900', color: '#fff', lineHeight: 26 },
    kpiLabel:   { fontSize: 11, fontWeight: '700', color: 'rgba(255,255,255,0.7)', letterSpacing: 0.5, marginTop: 4, textAlign: 'center' },

    scroll:        { flex: 1 },
    scrollContent: { paddingHorizontal: 16, paddingTop: 20, paddingBottom: 40, gap: 10 },

    filterRow: { flexDirection: 'row', gap: 8, marginBottom: 4 },
    filterBtn: {
        paddingHorizontal: 14, paddingVertical: 8,
        borderRadius: 8, borderWidth: 1.5, borderColor: '#e2e8f0',
        backgroundColor: '#fff',
    },
    filterBtnActive:   { borderColor: '#059669', backgroundColor: '#ecfdf5' },
    filterLabel:       { fontSize: 11, fontWeight: '700', color: '#64748b' },
    filterLabelActive: { color: '#059669' },

    fallbackBanner: {
        flexDirection: 'row', alignItems: 'center', gap: 8,
        backgroundColor: '#fffbeb', borderRadius: 10, padding: 12,
        borderWidth: 1, borderColor: '#fde68a',
    },
    fallbackText: { flex: 1, fontSize: 11, fontWeight: '600', color: '#92400e' },

    // Carte signalement
    sigCard: {
        backgroundColor: '#fff', borderRadius: 10, padding: 14,
        borderWidth: 1, borderColor: '#f1f5f9', gap: 12,
        shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.04, shadowRadius: 4, elevation: 1,
    },
    sigCardTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
    sigIconWrap: {
        width: 40, height: 40, borderRadius: 10,
        backgroundColor: '#fee2e2', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
    },
    sigInfo:    { flex: 1, minWidth: 0, gap: 3 },
    sigAction:  { fontSize: 13, fontWeight: '700', color: '#1e293b' },
    sigDetails: { fontSize: 11, color: '#64748b' },
    sigMeta:    { fontSize: 11, color: '#94a3b8', marginTop: 2 },
    statusBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, flexShrink: 0, alignSelf: 'flex-start' },
    statusText:  { fontSize: 11, fontWeight: '900', letterSpacing: 0.5 },

    // Boutons d'action
    actionRow:    { flexDirection: 'row', gap: 8 },
    btnText:      { fontSize: 11, fontWeight: '900', color: '#fff', letterSpacing: 0.5 },
    btnTraitement: {
        flex: 1, backgroundColor: '#d97706', borderRadius: 8,
        paddingVertical: 10, alignItems: 'center', justifyContent: 'center',
    },
    btnClos: {
        flex: 1, backgroundColor: '#059669', borderRadius: 8,
        paddingVertical: 10, alignItems: 'center', justifyContent: 'center',
    },
    btnSanction: {
        flex: 1, backgroundColor: '#dc2626', borderRadius: 8,
        paddingVertical: 10, flexDirection: 'row',
        alignItems: 'center', justifyContent: 'center', gap: 6,
    },

    emptyCard: {
        backgroundColor: '#fff', borderRadius: 10, padding: 48,
        alignItems: 'center', borderWidth: 2, borderColor: '#f1f5f9',
        borderStyle: 'dashed', gap: 10,
    },
    emptyText: { fontSize: 11, fontWeight: '900', color: '#cbd5e1', letterSpacing: 2 },
    emptySub:  { fontSize: 12, color: '#94a3b8', textAlign: 'center' },
});
