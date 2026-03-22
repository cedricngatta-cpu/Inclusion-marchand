// Achats Groupés — Marchand (rejoindre un achat groupé)
import React, { useState, useEffect, useCallback } from 'react';
import {
    View, Text, ScrollView, StyleSheet, TouchableOpacity,
    ActivityIndicator, Modal, TextInput, Alert, RefreshControl,
    KeyboardAvoidingView, Platform,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import { ShoppingCart, Users, Clock, TrendingDown, Package, X, CheckCircle } from 'lucide-react-native';
import { ScreenHeader } from '@/src/components/ui';
import { supabase } from '@/src/lib/supabase';
import { colors } from '@/src/lib/colors';
import { useProfileContext } from '@/src/context/ProfileContext';
import { useAuth } from '@/src/context/AuthContext';
import { emitEvent } from '@/src/lib/socket';

// ── Types ──────────────────────────────────────────────────────────────────────
interface AchatGroupe {
    id: string;
    produit_id: string | null;
    producteur_id: string | null;
    nom_produit: string;
    prix_normal: number;
    prix_negocie: number;
    quantite_minimum: number;
    quantite_actuelle: number;
    statut: string;
    date_limite: string | null;
    description: string | null;
    created_at: string;
    // enrichis
    producteurNom?: string;
    nbParticipants?: number;
    dejaParticipant?: boolean;
    maQuantite?: number;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function formatDate(d: string | null) {
    if (!d) return null;
    return new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
}

function economie(normal: number, negocie: number) {
    if (!normal || normal <= negocie) return null;
    return Math.round(((normal - negocie) / normal) * 100);
}

function daysLeft(dateStr: string | null): number | null {
    if (!dateStr) return null;
    const diff = new Date(dateStr).getTime() - Date.now();
    return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

// ── Barre de progression ───────────────────────────────────────────────────────
function ProgressBar({ current, min }: { current: number; min: number }) {
    const pct     = min > 0 ? Math.min((current / min) * 100, 100) : 0;
    const reached = current >= min;
    return (
        <View style={{ gap: 4 }}>
            <View style={pb.track}>
                <View style={[pb.fill, { width: `${pct}%` as any, backgroundColor: reached ? colors.success : colors.primary }]} />
            </View>
            <Text style={[pb.label, reached && { color: colors.success }]}>
                {current}/{min} unités commandées {reached ? '✓' : ''}
            </Text>
        </View>
    );
}
const pb = StyleSheet.create({
    track: { height: 8, backgroundColor: colors.slate100, borderRadius: 4, overflow: 'hidden' },
    fill:  { height: 8, borderRadius: 4 },
    label: { fontSize: 11, fontWeight: '700', color: colors.slate500 },
});

// ── Composant principal ────────────────────────────────────────────────────────
export default function AchatsGroupesMarchandScreen() {
    const { activeProfile } = useProfileContext();
    const { user }          = useAuth();

    const [achats,     setAchats]     = useState<AchatGroupe[]>([]);
    const [loading,    setLoading]    = useState(true);
    const [refreshing, setRefreshing] = useState(false);

    // Modal rejoindre
    const [joinModal,   setJoinModal]   = useState<AchatGroupe | null>(null);
    const [qtyStr,      setQtyStr]      = useState('');
    const [joining,     setJoining]     = useState(false);

    // ── Fetch achats groupés ──────────────────────────────────────────────────
    const fetchAchats = useCallback(async () => {
        try {
            const { data, error } = await supabase
                .from('achats_groupes')
                .select('*')
                .eq('statut', 'OPEN')
                .order('created_at', { ascending: false });
            if (error) throw error;

            const rows = (data as AchatGroupe[]) ?? [];

            // Noms des producteurs
            const prodIds = [...new Set(rows.map(r => r.producteur_id).filter(Boolean))] as string[];
            const { data: profData } = prodIds.length > 0
                ? await supabase.from('profiles').select('id, full_name').in('id', prodIds)
                : { data: [] };
            const profMap: Record<string, string> = {};
            for (const p of (profData ?? []) as { id: string; full_name: string | null }[]) {
                profMap[p.id] = p.full_name ?? 'Producteur';
            }

            // Vérifier si ce marchand participe déjà
            const profileId = user?.id;
            const ids       = rows.map(r => r.id);
            const { data: myParts } = (ids.length > 0 && profileId)
                ? await supabase
                    .from('achats_groupes_participants')
                    .select('achat_groupe_id, quantite')
                    .eq('marchand_id', profileId)
                    .in('achat_groupe_id', ids)
                : { data: [] };

            const myMap: Record<string, number> = {};
            for (const mp of (myParts ?? []) as { achat_groupe_id: string; quantite: number }[]) {
                myMap[mp.achat_groupe_id] = mp.quantite;
            }

            // Nombre total de participants par achat
            const { data: partCounts } = ids.length > 0
                ? await supabase
                    .from('achats_groupes_participants')
                    .select('achat_groupe_id')
                    .in('achat_groupe_id', ids)
                : { data: [] };
            const countMap: Record<string, number> = {};
            for (const c of (partCounts ?? []) as { achat_groupe_id: string }[]) {
                countMap[c.achat_groupe_id] = (countMap[c.achat_groupe_id] ?? 0) + 1;
            }

            setAchats(rows.map(r => ({
                ...r,
                producteurNom:    r.producteur_id ? (profMap[r.producteur_id] ?? 'Producteur') : '–',
                nbParticipants:   countMap[r.id] ?? 0,
                dejaParticipant:  myMap[r.id] !== undefined,
                maQuantite:       myMap[r.id],
            })));
        } catch (err) {
            console.error('[AchatsGroupesMarchand] fetch error:', err);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, [activeProfile, user]);

    useFocusEffect(useCallback(() => { setLoading(true); fetchAchats(); }, [fetchAchats]));
    const onRefresh = () => { setRefreshing(true); fetchAchats(); };

    // ── Rejoindre un achat groupé ─────────────────────────────────────────────
    const handleJoin = async () => {
        if (!joinModal) return;
        const qty = parseInt(qtyStr, 10);
        if (isNaN(qty) || qty <= 0) {
            Alert.alert('Quantité invalide', 'Entrez une quantité valide.');
            return;
        }

        const profileId   = user?.id;
        const marchandNom = user?.name ?? activeProfile?.name ?? 'Marchand';

        if (!profileId) return;
        setJoining(true);
        try {
            // Insérer la participation
            const { error } = await supabase.from('achats_groupes_participants').insert({
                achat_groupe_id: joinModal.id,
                marchand_id:     profileId,
                marchand_nom:    marchandNom,
                quantite:        qty,
            });
            if (error) throw error;

            // Mettre à jour quantite_actuelle
            await supabase
                .from('achats_groupes')
                .update({ quantite_actuelle: joinModal.quantite_actuelle + qty })
                .eq('id', joinModal.id);

            emitEvent('achat-groupe-rejoint', {
                achatGroupeId: joinModal.id,
                nomProduit:    joinModal.nom_produit,
                marchandId:    profileId,
                marchandNom,
                quantite:      qty,
            });

            Alert.alert(
                'Inscription confirmée !',
                `Vous avez réservé ${qty} unité(s) de ${joinModal.nom_produit} au prix de ${joinModal.prix_negocie.toLocaleString('fr-FR')} F l'unité.\n\nVous serez notifié quand la coopérative finalise la commande.`,
            );
            setJoinModal(null);
            fetchAchats();
        } catch (err) {
            console.error('[AchatsGroupesMarchand] join error:', err);
            Alert.alert('Erreur', 'Impossible de rejoindre cet achat groupé.');
        } finally {
            setJoining(false);
        }
    };

    // ── Rendu ─────────────────────────────────────────────────────────────────
    return (
        <View style={s.safe}>
            <ScreenHeader
                title="Achats Groupés"
                subtitle="Commander ensemble, payer moins"
                showBack={true}
                paddingBottom={12}
            />

            <ScrollView
                style={s.scroll}
                contentContainerStyle={s.scrollContent}
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.primary]} />}
            >
                {/* Explication */}
                <View style={s.infoCard}>
                    <TrendingDown color={colors.primary} size={20} />
                    <View style={{ flex: 1 }}>
                        <Text style={s.infoTitle}>Comment ça marche ?</Text>
                        <Text style={s.infoText}>
                            La coopérative négocie des prix réduits. Rejoignez un achat avec votre quantité. Quand le seuil est atteint, la coopérative déclenche la commande automatiquement.
                        </Text>
                    </View>
                </View>

                {loading ? (
                    <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />
                ) : achats.length === 0 ? (
                    <View style={s.emptyCard}>
                        <ShoppingCart color={colors.slate300} size={36} />
                        <Text style={s.emptyText}>AUCUN ACHAT GROUPÉ DISPONIBLE</Text>
                        <Text style={s.emptySubText}>
                            La coopérative n'a pas encore créé d'achat groupé. Revenez bientôt.
                        </Text>
                    </View>
                ) : (
                    achats.map(achat => {
                        const eco   = economie(achat.prix_normal, achat.prix_negocie);
                        const days  = daysLeft(achat.date_limite);
                        const urgent = days !== null && days <= 3;
                        return (
                            <View key={achat.id} style={s.card}>
                                {/* Badge participation */}
                                {achat.dejaParticipant && (
                                    <View style={s.myBadge}>
                                        <CheckCircle color="#065f46" size={12} />
                                        <Text style={s.myBadgeText}>Vous participez — {achat.maQuantite} u</Text>
                                    </View>
                                )}

                                {/* En-tête */}
                                <View style={s.cardHeader}>
                                    <View style={s.productIcon}>
                                        <Package color={colors.primary} size={20} />
                                    </View>
                                    <View style={{ flex: 1 }}>
                                        <Text style={s.cardProduct} numberOfLines={1}>{achat.nom_produit}</Text>
                                        <Text style={s.cardProducer} numberOfLines={1}>{achat.producteurNom}</Text>
                                    </View>
                                    {eco !== null && (
                                        <View style={s.ecoPill}>
                                            <TrendingDown color="#065f46" size={11} />
                                            <Text style={s.ecoText}>-{eco}%</Text>
                                        </View>
                                    )}
                                </View>

                                {/* Prix */}
                                <View style={s.priceSection}>
                                    <View style={s.priceMain}>
                                        <Text style={s.prixLabel}>PRIX GROUPÉ</Text>
                                        <Text style={s.prixVal}>{achat.prix_negocie.toLocaleString('fr-FR')} F</Text>
                                    </View>
                                    {achat.prix_normal > 0 && (
                                        <View style={s.priceNormal}>
                                            <Text style={s.prixNormalLabel}>Prix habituel</Text>
                                            <Text style={s.prixNormalVal}>{achat.prix_normal.toLocaleString('fr-FR')} F</Text>
                                        </View>
                                    )}
                                </View>

                                {/* Progression */}
                                <ProgressBar current={achat.quantite_actuelle} min={achat.quantite_minimum} />

                                {/* Méta */}
                                <View style={s.metaRow}>
                                    <View style={s.metaItem}>
                                        <Users color={colors.slate400} size={12} />
                                        <Text style={s.metaText}>{achat.nbParticipants} marchand{(achat.nbParticipants ?? 0) > 1 ? 's' : ''}</Text>
                                    </View>
                                    {days !== null && (
                                        <View style={[s.metaItem, urgent && s.metaUrgent]}>
                                            <Clock color={urgent ? '#dc2626' : colors.slate400} size={12} />
                                            <Text style={[s.metaText, urgent && { color: '#dc2626', fontWeight: '800' }]}>
                                                {days <= 0 ? 'Expire aujourd\'hui' : `${days} jour${days > 1 ? 's' : ''} restant${days > 1 ? 's' : ''}`}
                                            </Text>
                                        </View>
                                    )}
                                </View>

                                {/* Description */}
                                {!!achat.description && (
                                    <Text style={s.desc} numberOfLines={2}>{achat.description}</Text>
                                )}

                                {/* Économie totale estimée */}
                                {eco !== null && achat.prix_normal > 0 && (
                                    <View style={s.savingsRow}>
                                        <Text style={s.savingsText}>
                                            Économie : {(achat.prix_normal - achat.prix_negocie).toLocaleString('fr-FR')} F / unité
                                        </Text>
                                    </View>
                                )}

                                {/* Bouton */}
                                <TouchableOpacity
                                    style={[s.joinBtn, achat.dejaParticipant && s.joinBtnDone]}
                                    onPress={() => {
                                        if (achat.dejaParticipant) return;
                                        setQtyStr('');
                                        setJoinModal(achat);
                                    }}
                                    activeOpacity={achat.dejaParticipant ? 1 : 0.85}
                                >
                                    {achat.dejaParticipant ? (
                                        <>
                                            <CheckCircle color="#065f46" size={16} />
                                            <Text style={[s.joinBtnText, { color: '#065f46' }]}>Déjà inscrit</Text>
                                        </>
                                    ) : (
                                        <>
                                            <ShoppingCart color={colors.white} size={16} />
                                            <Text style={s.joinBtnText}>REJOINDRE CET ACHAT</Text>
                                        </>
                                    )}
                                </TouchableOpacity>
                            </View>
                        );
                    })
                )}
            </ScrollView>

            {/* ── MODAL REJOINDRE ── */}
            <Modal
                visible={!!joinModal}
                animationType="slide"
                transparent
                onRequestClose={() => setJoinModal(null)}
            >
                <KeyboardAvoidingView
                    behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                    style={{ flex: 1 }}
                >
                <View style={m.overlay}>
                    <View style={m.sheet}>
                        <View style={m.sheetHeader}>
                            <Text style={m.sheetTitle}>REJOINDRE L'ACHAT</Text>
                            <TouchableOpacity
                                style={m.xCloseBtn}
                                onPress={() => setJoinModal(null)}
                                hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
                            >
                                <X color={colors.slate600} size={22} />
                            </TouchableOpacity>
                        </View>

                        {joinModal && (
                            <>
                                {/* Résumé */}
                                <View style={m.summary}>
                                    <Text style={m.summaryProduct}>{joinModal.nom_produit}</Text>
                                    <Text style={m.summaryPrice}>
                                        {joinModal.prix_negocie.toLocaleString('fr-FR')} F / unité
                                    </Text>
                                    {joinModal.prix_normal > 0 && (
                                        <Text style={m.summaryNormal}>
                                            Prix habituel : {joinModal.prix_normal.toLocaleString('fr-FR')} F
                                        </Text>
                                    )}
                                </View>

                                <Text style={m.fieldLabel}>VOTRE QUANTITÉ</Text>
                                <TextInput
                                    style={m.input}
                                    value={qtyStr}
                                    onChangeText={setQtyStr}
                                    keyboardType="numeric"
                                    placeholder="Ex : 20"
                                    placeholderTextColor={colors.slate300}
                                    autoFocus
                                />

                                {/* Total estimé */}
                                {!!qtyStr && !isNaN(parseInt(qtyStr)) && parseInt(qtyStr) > 0 && (
                                    <View style={m.totalRow}>
                                        <Text style={m.totalLabel}>TOTAL ESTIMÉ</Text>
                                        <Text style={m.totalVal}>
                                            {(joinModal.prix_negocie * parseInt(qtyStr)).toLocaleString('fr-FR')} F
                                        </Text>
                                    </View>
                                )}

                                <Text style={m.infoNote}>
                                    ⚠ Votre commande sera confirmée et payable quand la coopérative finalise l'achat groupé.
                                </Text>

                                <TouchableOpacity
                                    style={[m.submitBtn, joining && { opacity: 0.6 }]}
                                    onPress={handleJoin}
                                    disabled={joining}
                                >
                                    {joining
                                        ? <ActivityIndicator color={colors.white} size="small" />
                                        : <Text style={m.submitText}>CONFIRMER MA PARTICIPATION</Text>}
                                </TouchableOpacity>
                            </>
                        )}
                    </View>
                </View>
                </KeyboardAvoidingView>
            </Modal>
        </View>
    );
}

// ── Styles ─────────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.bgSecondary },
    scroll:        { flex: 1 },
    scrollContent: { paddingHorizontal: 16, paddingTop: 20, paddingBottom: 40, gap: 12 },

    // Info card
    infoCard: {
        flexDirection: 'row', gap: 12, alignItems: 'flex-start',
        backgroundColor: '#ecfdf5', borderRadius: 10, padding: 14,
        borderWidth: 1, borderColor: '#a7f3d0',
    },
    infoTitle: { fontSize: 12, fontWeight: '800', color: colors.primary, marginBottom: 4 },
    infoText:  { fontSize: 11, color: '#065f46', lineHeight: 16 },

    // Card
    card: {
        backgroundColor: colors.white, borderRadius: 10, padding: 16,
        borderWidth: 1, borderColor: colors.slate100, gap: 10,
        shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.05, shadowRadius: 4, elevation: 2,
    },
    myBadge: {
        flexDirection: 'row', alignItems: 'center', gap: 6,
        backgroundColor: '#d1fae5', borderRadius: 6, paddingHorizontal: 10, paddingVertical: 5,
        alignSelf: 'flex-start',
    },
    myBadgeText: { fontSize: 11, fontWeight: '700', color: '#065f46' },

    cardHeader:  { flexDirection: 'row', alignItems: 'center', gap: 12 },
    productIcon: {
        width: 40, height: 40, borderRadius: 10, backgroundColor: '#ecfdf5',
        alignItems: 'center', justifyContent: 'center', flexShrink: 0,
    },
    cardProduct: { fontSize: 14, fontWeight: '800', color: colors.slate800 },
    cardProducer:{ fontSize: 11, fontWeight: '600', color: colors.slate500, marginTop: 2 },
    ecoPill:     { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#d1fae5', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4, flexShrink: 0 },
    ecoText:     { fontSize: 11, fontWeight: '900', color: '#065f46' },

    priceSection: { flexDirection: 'row', alignItems: 'center', gap: 16 },
    priceMain:    { gap: 2 },
    prixLabel:    { fontSize: 11, fontWeight: '900', color: colors.slate400, letterSpacing: 1.5 },
    prixVal:      { fontSize: 22, fontWeight: '900', color: colors.primary },
    priceNormal:  { gap: 2 },
    prixNormalLabel: { fontSize: 11, color: colors.slate400 },
    prixNormalVal:   { fontSize: 13, fontWeight: '600', color: colors.slate400, textDecorationLine: 'line-through' },

    metaRow:   { flexDirection: 'row', gap: 16, flexWrap: 'wrap' },
    metaItem:  { flexDirection: 'row', alignItems: 'center', gap: 4 },
    metaUrgent:{ backgroundColor: '#fee2e2', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
    metaText:  { fontSize: 11, fontWeight: '600', color: colors.slate500 },

    desc:        { fontSize: 11, color: colors.slate500, lineHeight: 16 },
    savingsRow:  { backgroundColor: '#d1fae5', borderRadius: 8, padding: 10 },
    savingsText: { fontSize: 11, fontWeight: '700', color: '#065f46', textAlign: 'center' },

    joinBtn: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
        backgroundColor: colors.primary, borderRadius: 10, paddingVertical: 13,
    },
    joinBtnDone: { backgroundColor: '#d1fae5' },
    joinBtnText: { fontSize: 12, fontWeight: '900', color: colors.white, letterSpacing: 1 },

    emptyCard:    {
        backgroundColor: colors.white, borderRadius: 10, padding: 40,
        alignItems: 'center', gap: 12, borderWidth: 2, borderColor: colors.slate100, borderStyle: 'dashed',
    },
    emptyText:    { fontSize: 11, fontWeight: '900', color: colors.slate300, letterSpacing: 2 },
    emptySubText: { fontSize: 12, color: colors.slate400, textAlign: 'center', lineHeight: 18 },
});

const m = StyleSheet.create({
    overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
    sheet:   {
        backgroundColor: colors.white,
        borderTopLeftRadius: 16, borderTopRightRadius: 16,
        padding: 20, paddingBottom: 36,
    },
    sheetHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 },
    sheetTitle:  { fontSize: 14, fontWeight: '900', color: colors.slate800, letterSpacing: 1 },
    xCloseBtn:   { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },

    summary:         { backgroundColor: colors.slate50, borderRadius: 10, padding: 14, gap: 4, marginBottom: 4 },
    summaryProduct:  { fontSize: 14, fontWeight: '800', color: colors.slate800 },
    summaryPrice:    { fontSize: 20, fontWeight: '900', color: colors.primary },
    summaryNormal:   { fontSize: 11, color: colors.slate400 },

    fieldLabel: { fontSize: 11, fontWeight: '900', color: colors.slate400, letterSpacing: 2, marginTop: 16, marginBottom: 8 },
    input: {
        borderWidth: 1.5, borderColor: colors.slate200, borderRadius: 8,
        paddingHorizontal: 14, paddingVertical: 12,
        fontSize: 18, fontWeight: '700', color: colors.slate800,
    },

    totalRow:  { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#ecfdf5', borderRadius: 8, padding: 12, marginTop: 8 },
    totalLabel:{ fontSize: 11, fontWeight: '900', color: '#065f46', letterSpacing: 1 },
    totalVal:  { fontSize: 18, fontWeight: '900', color: colors.primary },

    infoNote: { fontSize: 11, color: colors.slate400, lineHeight: 16, marginTop: 8, textAlign: 'center' },

    submitBtn: {
        backgroundColor: colors.primary, borderRadius: 10,
        paddingVertical: 14, alignItems: 'center', marginTop: 16,
    },
    submitText: { fontSize: 13, fontWeight: '900', color: colors.white, letterSpacing: 1 },
});
