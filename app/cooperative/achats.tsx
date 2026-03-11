// Achats Groupés — Coopérative — Flux 2 phases : Négociation → Ouverture
import React, { useState, useEffect, useCallback } from 'react';
import {
    View, Text, ScrollView, StyleSheet, TouchableOpacity,
    ActivityIndicator, Modal, TextInput, Alert, RefreshControl,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import {
    Plus, X, Users, Clock, TrendingDown, Package,
    CheckCircle, XCircle, MessageSquare, ShoppingCart, Send,
} from 'lucide-react-native';
import { ScreenHeader } from '@/src/components/ui';
import { supabase } from '@/src/lib/supabase';
import { colors } from '@/src/lib/colors';
import { useAuth } from '@/src/context/AuthContext';
import { emitEvent, onSocketEvent } from '@/src/lib/socket';

// ── Types ──────────────────────────────────────────────────────────────────────
interface AchatGroupe {
    id: string;
    cooperative_id: string | null;
    produit_id: string | null;
    producteur_id: string | null;
    nom_produit: string;
    prix_normal: number;
    prix_negocie: number | null;
    quantite_minimum: number;
    quantite_totale: number;
    quantite_actuelle: number;
    statut: string;
    date_limite: string | null;
    description: string | null;
    message_coop: string | null;
    created_at: string;
    // enrichis
    producteurNom?: string;
    nbParticipants?: number;
}

interface Participant {
    id: string;
    marchand_nom: string | null;
    quantite: number;
    date_inscription: string;
}

interface ProducerProfile {
    id: string;
    full_name: string | null;
}

interface ProductRow {
    id: string;
    name: string;
    price: number;
    store_id: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
const STATUS_CONFIG: Record<string, { bg: string; text: string; label: string }> = {
    NEGOTIATION: { bg: '#fef3c7', text: '#92400e', label: 'En négociation' },
    OPEN:        { bg: '#d1fae5', text: '#065f46', label: 'Ouvert' },
    COMPLETED:   { bg: '#dbeafe', text: '#1e40af', label: 'Finalisé' },
    CANCELLED:   { bg: '#fee2e2', text: '#991b1b', label: 'Annulé' },
};

const FILTER_TABS = [
    { key: 'NEGOTIATION', label: 'Négociation' },
    { key: 'OPEN',        label: 'Ouverts' },
    { key: 'ALL',         label: 'Tous' },
];

function formatDate(d: string | null) {
    if (!d) return '–';
    return new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
}

function economie(normal: number, negocie: number | null) {
    if (!negocie || !normal || normal <= negocie) return null;
    return Math.round(((normal - negocie) / normal) * 100);
}

function ProgressBar({ current, min }: { current: number; min: number }) {
    const pct = min > 0 ? Math.min((current / min) * 100, 100) : 0;
    const reached = current >= min;
    return (
        <View style={pb.wrap}>
            <View style={pb.track}>
                <View style={[pb.fill, { width: `${pct}%` as any, backgroundColor: reached ? '#059669' : colors.primary }]} />
            </View>
            <Text style={[pb.label, reached && { color: '#059669' }]}>
                {current}/{min} unités {reached ? '✓ Seuil atteint' : ''}
            </Text>
        </View>
    );
}
const pb = StyleSheet.create({
    wrap:  { gap: 4 },
    track: { height: 8, backgroundColor: colors.slate100, borderRadius: 4, overflow: 'hidden' },
    fill:  { height: 8, borderRadius: 4 },
    label: { fontSize: 11, fontWeight: '700', color: colors.slate500 },
});

// ── Composant principal ────────────────────────────────────────────────────────
export default function AchatsGroupesScreen() {
    const { user } = useAuth();

    const [achats,       setAchats]       = useState<AchatGroupe[]>([]);
    const [loading,      setLoading]      = useState(true);
    const [refreshing,   setRefreshing]   = useState(false);
    const [activeFilter, setActiveFilter] = useState('NEGOTIATION');

    // Modal création
    const [createVisible, setCreateVisible] = useState(false);
    const [producers,     setProducers]     = useState<ProducerProfile[]>([]);
    const [products,      setProducts]      = useState<ProductRow[]>([]);
    const [selProd,       setSelProd]       = useState('');
    const [selProduct,    setSelProduct]    = useState('');
    const [qtyCible,      setQtyCible]      = useState('');
    const [qtyMin,        setQtyMin]        = useState('');
    const [dateLimite,    setDateLimite]    = useState('');
    const [messageCoop,   setMessageCoop]   = useState('');
    const [submitting,    setSubmitting]    = useState(false);

    // Modal participants
    const [participantsModal, setParticipantsModal] = useState<AchatGroupe | null>(null);
    const [participants,      setParticipants]      = useState<Participant[]>([]);
    const [partLoading,       setPartLoading]        = useState(false);

    // Finalisation
    const [finalizingId, setFinalizingId] = useState<string | null>(null);
    // Acceptation prix
    const [acceptingId,  setAcceptingId]  = useState<string | null>(null);

    // ── Fetch ─────────────────────────────────────────────────────────────────
    const fetchAchats = useCallback(async () => {
        try {
            const { data, error } = await supabase
                .from('achats_groupes')
                .select('*')
                .order('created_at', { ascending: false });
            if (error) throw error;

            const rows = (data as AchatGroupe[]) ?? [];

            // Noms producteurs
            const prodIds = [...new Set(rows.map(r => r.producteur_id).filter(Boolean))] as string[];
            const { data: profData } = prodIds.length > 0
                ? await supabase.from('profiles').select('id, full_name').in('id', prodIds)
                : { data: [] };
            const profMap: Record<string, string> = {};
            for (const p of (profData ?? []) as { id: string; full_name: string | null }[]) {
                profMap[p.id] = p.full_name ?? 'Producteur';
            }

            // Nombre de participants
            const ids = rows.map(r => r.id);
            const { data: partData } = ids.length > 0
                ? await supabase.from('achats_groupes_participants').select('achat_groupe_id').in('achat_groupe_id', ids)
                : { data: [] };
            const countMap: Record<string, number> = {};
            for (const p of (partData ?? []) as { achat_groupe_id: string }[]) {
                countMap[p.achat_groupe_id] = (countMap[p.achat_groupe_id] ?? 0) + 1;
            }

            setAchats(rows.map(r => ({
                ...r,
                producteurNom:  r.producteur_id ? (profMap[r.producteur_id] ?? 'Producteur') : '–',
                nbParticipants: countMap[r.id] ?? 0,
            })));
        } catch (err) {
            console.error('[AchatsGroupes] fetch error:', err);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, []);

    useEffect(() => { setLoading(true); fetchAchats(); }, [fetchAchats]);
    useFocusEffect(useCallback(() => { fetchAchats(); }, [fetchAchats]));

    // Écouter la réponse du producteur
    useEffect(() => {
        const unsub = onSocketEvent('prix-groupe-propose', () => { fetchAchats(); });
        return unsub;
    }, [fetchAchats]);

    const onRefresh = () => { setRefreshing(true); fetchAchats(); };

    // ── Ouvrir modal création ──────────────────────────────────────────────────
    const openCreate = useCallback(async () => {
        setSelProd(''); setSelProduct(''); setQtyCible('');
        setQtyMin(''); setDateLimite(''); setMessageCoop('');
        setProducts([]);
        const { data } = await supabase.from('profiles').select('id, full_name').eq('role', 'PRODUCER');
        setProducers((data as ProducerProfile[]) ?? []);
        setCreateVisible(true);
    }, []);

    // Charger les produits du producteur sélectionné
    useEffect(() => {
        if (!selProd) { setProducts([]); setSelProduct(''); return; }
        (async () => {
            const { data: storeData } = await supabase.from('stores').select('id').eq('owner_id', selProd).maybeSingle();
            if (!storeData?.id) return;
            const { data } = await supabase.from('products').select('id, name, price, store_id').eq('store_id', storeData.id);
            setProducts((data as ProductRow[]) ?? []);
        })();
    }, [selProd]);

    // ── Phase 1 : Envoyer la demande au producteur ────────────────────────────
    const handleCreate = async () => {
        if (!selProd || !selProduct || !qtyMin) {
            Alert.alert('Champs requis', 'Sélectionnez un producteur, un produit et entrez la quantité minimum.');
            return;
        }
        const qtyMinNum    = parseInt(qtyMin, 10);
        const qtyCibleNum  = qtyCible ? parseInt(qtyCible, 10) : qtyMinNum;
        if (isNaN(qtyMinNum) || qtyMinNum <= 0) {
            Alert.alert('Valeur invalide', 'La quantité minimum doit être un nombre positif.');
            return;
        }
        const prod = products.find(p => p.id === selProduct);
        if (!prod) return;

        setSubmitting(true);
        try {
            const { data: inserted, error } = await supabase.from('achats_groupes').insert({
                cooperative_id:   user?.id ?? null,
                produit_id:       selProduct,
                producteur_id:    selProd,
                nom_produit:      prod.name,
                prix_normal:      prod.price,
                prix_negocie:     null,
                quantite_minimum: qtyMinNum,
                quantite_totale:  qtyCibleNum,
                quantite_actuelle: 0,
                statut:           'NEGOTIATION',
                date_limite:      dateLimite || null,
                message_coop:     messageCoop || null,
            }).select('id').maybeSingle();
            if (error) throw error;

            emitEvent('demande-prix-groupe', {
                achatGroupeId:  inserted?.id,
                producteurId:   selProd,
                nomProduit:     prod.name,
                qtyCible:       qtyCibleNum,
                qtyMin:         qtyMinNum,
                dateLimite:     dateLimite || null,
                messageCoop:    messageCoop || null,
                cooperativeNom: user?.name ?? 'Coopérative',
                cooperativeId:  user?.id,
            });

            setCreateVisible(false);
            fetchAchats();
        } catch (err) {
            console.error('[AchatsGroupes] create error:', err);
            Alert.alert('Erreur', "Impossible d'envoyer la demande.");
        } finally {
            setSubmitting(false);
        }
    };

    // ── Phase 2 : Accepter le prix proposé par le producteur ─────────────────
    const handleAccepterPrix = async (achat: AchatGroupe) => {
        if (!achat.prix_negocie) return;
        Alert.alert(
            'Accepter ce prix ?',
            `Le producteur propose ${achat.prix_negocie.toLocaleString('fr-FR')} F / unité pour ${achat.nom_produit}.\n\nEn acceptant, l'achat sera ouvert aux marchands.`,
            [
                { text: 'Annuler', style: 'cancel' },
                { text: 'Accepter', onPress: () => doAccepterPrix(achat) },
            ]
        );
    };

    const doAccepterPrix = async (achat: AchatGroupe) => {
        setAcceptingId(achat.id);
        try {
            const { error } = await supabase
                .from('achats_groupes')
                .update({ statut: 'OPEN' })
                .eq('id', achat.id);
            if (error) throw error;

            emitEvent('prix-groupe-accepte', {
                achatGroupeId:  achat.id,
                producteurId:   achat.producteur_id,
                nomProduit:     achat.nom_produit,
                prixNegocie:    achat.prix_negocie,
                cooperativeNom: user?.name ?? 'Coopérative',
            });

            fetchAchats();
        } catch (err) {
            console.error('[AchatsGroupes] accepter error:', err);
            Alert.alert('Erreur', "Impossible d'accepter le prix.");
        } finally {
            setAcceptingId(null);
        }
    };

    // ── Voir participants ─────────────────────────────────────────────────────
    const viewParticipants = async (achat: AchatGroupe) => {
        setParticipantsModal(achat);
        setPartLoading(true);
        const { data } = await supabase
            .from('achats_groupes_participants')
            .select('id, marchand_nom, quantite, date_inscription')
            .eq('achat_groupe_id', achat.id)
            .order('date_inscription', { ascending: true });
        setParticipants((data as Participant[]) ?? []);
        setPartLoading(false);
    };

    // ── Finaliser ─────────────────────────────────────────────────────────────
    const handleFinaliser = (achat: AchatGroupe) => {
        Alert.alert(
            "Finaliser l'achat groupé",
            `Cela va créer ${achat.nbParticipants} commande(s) individuelle(s) au prix de ${(achat.prix_negocie ?? 0).toLocaleString('fr-FR')} F.`,
            [
                { text: 'Annuler', style: 'cancel' },
                { text: 'Confirmer', onPress: () => doFinaliser(achat) },
            ]
        );
    };

    const doFinaliser = async (achat: AchatGroupe) => {
        if (!achat.prix_negocie) return;
        setFinalizingId(achat.id);
        try {
            const { data: partData } = await supabase
                .from('achats_groupes_participants')
                .select('marchand_id, quantite')
                .eq('achat_groupe_id', achat.id);

            if (!partData?.length) {
                Alert.alert('Aucun participant', "Aucun marchand n'a rejoint cet achat.");
                return;
            }

            const { data: sellerStore } = await supabase
                .from('stores').select('id').eq('owner_id', achat.producteur_id).maybeSingle();
            if (!sellerStore?.id) {
                Alert.alert('Erreur', 'Boutique du producteur introuvable.');
                return;
            }

            const marchandIds = [...new Set((partData as any[]).map(p => p.marchand_id).filter(Boolean))];
            const { data: buyerStores } = await supabase
                .from('stores').select('id, owner_id').in('owner_id', marchandIds);
            const buyerMap: Record<string, string> = {};
            for (const s of (buyerStores ?? []) as { id: string; owner_id: string }[]) {
                buyerMap[s.owner_id] = s.id;
            }

            const ordersToInsert = (partData as any[])
                .filter(p => p.marchand_id && buyerMap[p.marchand_id])
                .map(p => ({
                    seller_store_id: sellerStore.id,
                    buyer_store_id:  buyerMap[p.marchand_id],
                    product_id:      achat.produit_id,
                    product_name:    achat.nom_produit,
                    quantity:        p.quantite,
                    unit_price:      achat.prix_negocie,
                    total_amount:    (achat.prix_negocie ?? 0) * p.quantite,
                    status:          'PENDING',
                    notes:           `Achat groupé — ${achat.nom_produit}`,
                }));

            if (ordersToInsert.length > 0) {
                const { error: ordErr } = await supabase.from('orders').insert(ordersToInsert);
                if (ordErr) throw ordErr;
            }

            await supabase.from('achats_groupes').update({ statut: 'COMPLETED' }).eq('id', achat.id);

            emitEvent('achat-groupe-finalise', {
                achatGroupeId: achat.id,
                nomProduit:    achat.nom_produit,
                nbCommandes:   ordersToInsert.length,
            });

            Alert.alert('Succès', `${ordersToInsert.length} commande(s) créée(s).`);
            fetchAchats();
        } catch (err) {
            console.error('[AchatsGroupes] finaliser error:', err);
            Alert.alert('Erreur', "Impossible de finaliser l'achat groupé.");
        } finally {
            setFinalizingId(null);
        }
    };

    // ── Annuler ───────────────────────────────────────────────────────────────
    const handleAnnuler = (achatId: string) => {
        Alert.alert("Annuler l'achat groupé", 'Cette action est irréversible.', [
            { text: 'Retour', style: 'cancel' },
            {
                text: 'Annuler', style: 'destructive',
                onPress: async () => {
                    await supabase.from('achats_groupes').update({ statut: 'CANCELLED' }).eq('id', achatId);
                    fetchAchats();
                },
            },
        ]);
    };

    // ── Filtrage ──────────────────────────────────────────────────────────────
    const filtered = achats.filter(a => {
        if (activeFilter === 'NEGOTIATION') return a.statut === 'NEGOTIATION';
        if (activeFilter === 'OPEN')        return a.statut === 'OPEN';
        return true;
    });

    const nbNego = achats.filter(a => a.statut === 'NEGOTIATION').length;
    const nbOpen = achats.filter(a => a.statut === 'OPEN').length;

    // ── Rendu ─────────────────────────────────────────────────────────────────
    return (
        <View style={s.safe}>
            <ScreenHeader
                title="Achats Groupés"
                subtitle={`${nbNego} en négociation · ${nbOpen} ouvert${nbOpen !== 1 ? 's' : ''}`}
                showBack={true}
                paddingBottom={12}
            >
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.tabsScroll}>
                    {FILTER_TABS.map(tab => (
                        <TouchableOpacity
                            key={tab.key}
                            style={[s.tab, activeFilter === tab.key && s.tabActive]}
                            onPress={() => setActiveFilter(tab.key)}
                        >
                            <Text style={[s.tabText, activeFilter === tab.key && s.tabTextActive]}>
                                {tab.label}
                            </Text>
                        </TouchableOpacity>
                    ))}
                </ScrollView>
            </ScreenHeader>

            <ScrollView
                style={s.scroll}
                contentContainerStyle={s.scrollContent}
                showsVerticalScrollIndicator={false}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.primary]} />}
            >
                {loading ? (
                    <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />
                ) : filtered.length === 0 ? (
                    <View style={s.emptyCard}>
                        <ShoppingCart color={colors.slate300} size={36} />
                        <Text style={s.emptyText}>AUCUN ACHAT GROUPÉ</Text>
                        <Text style={s.emptySubText}>
                            {activeFilter === 'NEGOTIATION'
                                ? 'Créez une demande de prix pour démarrer une négociation avec un producteur.'
                                : 'Aucun achat ouvert aux marchands pour l\'instant.'}
                        </Text>
                    </View>
                ) : (
                    filtered.map(achat => {
                        const sc      = STATUS_CONFIG[achat.statut] ?? STATUS_CONFIG.NEGOTIATION;
                        const eco     = economie(achat.prix_normal, achat.prix_negocie);
                        const reached = achat.quantite_actuelle >= achat.quantite_minimum;
                        const isFin   = finalizingId === achat.id;
                        const isAcc   = acceptingId  === achat.id;
                        const hasPrix = achat.prix_negocie !== null && achat.prix_negocie !== undefined;

                        return (
                            <View key={achat.id} style={s.card}>
                                {/* En-tête */}
                                <View style={s.cardHeader}>
                                    <View style={{ flex: 1 }}>
                                        <Text style={s.cardProduct} numberOfLines={1}>{achat.nom_produit}</Text>
                                        <Text style={s.cardProducer} numberOfLines={1}>{achat.producteurNom}</Text>
                                    </View>
                                    <View style={[s.badge, { backgroundColor: sc.bg }]}>
                                        <Text style={[s.badgeText, { color: sc.text }]}>{sc.label}</Text>
                                    </View>
                                </View>

                                {/* Info quantité */}
                                <View style={s.qtyRow}>
                                    <View style={s.qtyBlock}>
                                        <Text style={s.qtyLbl}>CIBLE</Text>
                                        <Text style={s.qtyVal}>{achat.quantite_totale > 0 ? achat.quantite_totale : achat.quantite_minimum} u</Text>
                                    </View>
                                    <View style={s.qtyBlock}>
                                        <Text style={s.qtyLbl}>MINIMUM</Text>
                                        <Text style={s.qtyVal}>{achat.quantite_minimum} u</Text>
                                    </View>
                                    {achat.date_limite && (
                                        <View style={s.qtyBlock}>
                                            <Text style={s.qtyLbl}>DATE LIMITE</Text>
                                            <Text style={s.qtyVal}>{formatDate(achat.date_limite)}</Text>
                                        </View>
                                    )}
                                </View>

                                {/* ── Phase NEGOTIATION ── */}
                                {achat.statut === 'NEGOTIATION' && (
                                    <>
                                        {!hasPrix ? (
                                            // Attente réponse producteur
                                            <View style={s.waitingBox}>
                                                <Clock color="#92400e" size={14} />
                                                <Text style={s.waitingText}>
                                                    En attente de la réponse du producteur...
                                                </Text>
                                            </View>
                                        ) : (
                                            // Producteur a répondu → afficher le prix proposé
                                            <>
                                                <View style={s.proposalBox}>
                                                    <Text style={s.proposalLabel}>PRIX PROPOSÉ PAR LE PRODUCTEUR</Text>
                                                    <Text style={s.proposalPrice}>
                                                        {(achat.prix_negocie ?? 0).toLocaleString('fr-FR')} F / unité
                                                    </Text>
                                                    {achat.prix_normal > 0 && (
                                                        <Text style={s.proposalNormal}>
                                                            Prix normal : {achat.prix_normal.toLocaleString('fr-FR')} F
                                                            {eco !== null ? `  (-${eco}%)` : ''}
                                                        </Text>
                                                    )}
                                                </View>
                                                <View style={s.actionsRow}>
                                                    <TouchableOpacity
                                                        style={[s.actionBtn, isAcc && { opacity: 0.6 }]}
                                                        onPress={() => handleAccepterPrix(achat)}
                                                        disabled={isAcc}
                                                    >
                                                        {isAcc
                                                            ? <ActivityIndicator color={colors.white} size="small" />
                                                            : <>
                                                                <CheckCircle color={colors.white} size={14} />
                                                                <Text style={s.actionBtnText}>Accepter ce prix</Text>
                                                              </>
                                                        }
                                                    </TouchableOpacity>
                                                    <TouchableOpacity
                                                        style={s.actionBtnDanger}
                                                        onPress={() => handleAnnuler(achat.id)}
                                                    >
                                                        <XCircle color="#dc2626" size={14} />
                                                    </TouchableOpacity>
                                                </View>
                                            </>
                                        )}

                                        {/* Message de la coopérative envoyé */}
                                        {!!achat.message_coop && (
                                            <View style={s.messageBox}>
                                                <MessageSquare color={colors.slate400} size={12} />
                                                <Text style={s.messageText} numberOfLines={2}>{achat.message_coop}</Text>
                                            </View>
                                        )}

                                        {!hasPrix && (
                                            <TouchableOpacity
                                                style={s.actionBtnOutlineSmall}
                                                onPress={() => handleAnnuler(achat.id)}
                                            >
                                                <Text style={s.actionBtnOutlineSmallText}>Annuler la demande</Text>
                                            </TouchableOpacity>
                                        )}
                                    </>
                                )}

                                {/* ── Phase OPEN ── */}
                                {achat.statut === 'OPEN' && (
                                    <>
                                        <View style={s.priceRow}>
                                            <View style={s.priceBlock}>
                                                <Text style={s.priceLbl}>PRIX NÉGOCIÉ</Text>
                                                <Text style={s.priceVal}>{(achat.prix_negocie ?? 0).toLocaleString('fr-FR')} F</Text>
                                            </View>
                                            {achat.prix_normal > 0 && (
                                                <View style={s.priceBlock}>
                                                    <Text style={s.priceLbl}>PRIX NORMAL</Text>
                                                    <Text style={[s.priceVal, s.priceStrike]}>{achat.prix_normal.toLocaleString('fr-FR')} F</Text>
                                                </View>
                                            )}
                                            {eco !== null && (
                                                <View style={s.ecoPill}>
                                                    <TrendingDown color="#065f46" size={12} />
                                                    <Text style={s.ecoText}>-{eco}%</Text>
                                                </View>
                                            )}
                                        </View>

                                        <ProgressBar current={achat.quantite_actuelle} min={achat.quantite_minimum} />

                                        <View style={s.metaRow}>
                                            <View style={s.metaItem}>
                                                <Users color={colors.slate400} size={12} />
                                                <Text style={s.metaText}>{achat.nbParticipants} participant{(achat.nbParticipants ?? 0) !== 1 ? 's' : ''}</Text>
                                            </View>
                                            {achat.date_limite && (
                                                <View style={s.metaItem}>
                                                    <Clock color={colors.slate400} size={12} />
                                                    <Text style={s.metaText}>Expire {formatDate(achat.date_limite)}</Text>
                                                </View>
                                            )}
                                        </View>

                                        <View style={s.actionsRow}>
                                            <TouchableOpacity
                                                style={s.actionBtnOutline}
                                                onPress={() => viewParticipants(achat)}
                                            >
                                                <Users color={colors.primary} size={14} />
                                                <Text style={s.actionBtnOutlineText}>Participants</Text>
                                            </TouchableOpacity>
                                            <TouchableOpacity
                                                style={[s.actionBtn, !reached && s.actionBtnDisabled, isFin && { opacity: 0.6 }]}
                                                onPress={() => handleFinaliser(achat)}
                                                disabled={isFin || !reached}
                                            >
                                                {isFin
                                                    ? <ActivityIndicator color={colors.white} size="small" />
                                                    : <>
                                                        <CheckCircle color={colors.white} size={14} />
                                                        <Text style={s.actionBtnText}>Finaliser</Text>
                                                      </>
                                                }
                                            </TouchableOpacity>
                                            <TouchableOpacity
                                                style={s.actionBtnDanger}
                                                onPress={() => handleAnnuler(achat.id)}
                                            >
                                                <XCircle color="#dc2626" size={14} />
                                            </TouchableOpacity>
                                        </View>
                                    </>
                                )}

                                {/* ── Phase COMPLETED ── */}
                                {achat.statut === 'COMPLETED' && (
                                    <TouchableOpacity
                                        style={s.actionBtnOutline}
                                        onPress={() => viewParticipants(achat)}
                                    >
                                        <Users color={colors.primary} size={14} />
                                        <Text style={s.actionBtnOutlineText}>Voir les {achat.nbParticipants} participant(s)</Text>
                                    </TouchableOpacity>
                                )}
                            </View>
                        );
                    })
                )}
            </ScrollView>

            {/* ── FAB ── */}
            <TouchableOpacity style={s.fab} onPress={openCreate} activeOpacity={0.85}>
                <Plus color={colors.white} size={24} />
            </TouchableOpacity>

            {/* ── MODAL CRÉATION ── */}
            <Modal visible={createVisible} animationType="slide" transparent onRequestClose={() => setCreateVisible(false)}>
                <View style={m.overlay}>
                    <View style={m.sheet}>
                        <View style={m.sheetHeader}>
                            <Text style={m.sheetTitle}>DEMANDE DE PRIX GROUPÉ</Text>
                            <TouchableOpacity
                                style={m.xCloseBtn}
                                onPress={() => setCreateVisible(false)}
                                hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
                            >
                                <X color={colors.slate600} size={22} />
                            </TouchableOpacity>
                        </View>
                        <Text style={m.sheetSubtitle}>
                            Le producteur recevra cette demande et proposera son prix groupé.
                        </Text>

                        <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                            {/* Producteur */}
                            <Text style={m.fieldLabel}>PRODUCTEUR *</Text>
                            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={m.chipScroll}>
                                {producers.map(p => (
                                    <TouchableOpacity
                                        key={p.id}
                                        style={[m.chip, selProd === p.id && m.chipActive]}
                                        onPress={() => setSelProd(p.id)}
                                    >
                                        <Text style={[m.chipText, selProd === p.id && m.chipTextActive]}>
                                            {p.full_name ?? 'Producteur'}
                                        </Text>
                                    </TouchableOpacity>
                                ))}
                            </ScrollView>

                            {/* Produit */}
                            {products.length > 0 && (
                                <>
                                    <Text style={m.fieldLabel}>PRODUIT *</Text>
                                    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={m.chipScroll}>
                                        {products.map(p => (
                                            <TouchableOpacity
                                                key={p.id}
                                                style={[m.chip, selProduct === p.id && m.chipActive]}
                                                onPress={() => setSelProduct(p.id)}
                                            >
                                                <Text style={[m.chipText, selProduct === p.id && m.chipTextActive]}>
                                                    {p.name} — {p.price.toLocaleString('fr-FR')} F
                                                </Text>
                                            </TouchableOpacity>
                                        ))}
                                    </ScrollView>
                                </>
                            )}

                            {/* Quantité cible */}
                            <Text style={m.fieldLabel}>QUANTITÉ CIBLE (optionnel)</Text>
                            <TextInput
                                style={m.input}
                                value={qtyCible}
                                onChangeText={setQtyCible}
                                keyboardType="numeric"
                                placeholder="Ex : 200"
                                placeholderTextColor={colors.slate300}
                            />

                            {/* Quantité minimum */}
                            <Text style={m.fieldLabel}>QUANTITÉ MINIMUM POUR DÉCLENCHER *</Text>
                            <TextInput
                                style={m.input}
                                value={qtyMin}
                                onChangeText={setQtyMin}
                                keyboardType="numeric"
                                placeholder="Ex : 100"
                                placeholderTextColor={colors.slate300}
                            />

                            {/* Date limite */}
                            <Text style={m.fieldLabel}>DATE LIMITE (AAAA-MM-JJ)</Text>
                            <TextInput
                                style={m.input}
                                value={dateLimite}
                                onChangeText={setDateLimite}
                                placeholder="Ex : 2026-04-15"
                                placeholderTextColor={colors.slate300}
                            />

                            {/* Message au producteur */}
                            <Text style={m.fieldLabel}>MESSAGE AU PRODUCTEUR (optionnel)</Text>
                            <TextInput
                                style={[m.input, { height: 80, textAlignVertical: 'top' }]}
                                value={messageCoop}
                                onChangeText={setMessageCoop}
                                multiline
                                placeholder="Ex : Nous avons 15 marchands intéressés, livraison souhaitée avant le 30..."
                                placeholderTextColor={colors.slate300}
                            />

                            <TouchableOpacity
                                style={[m.submitBtn, submitting && { opacity: 0.6 }]}
                                onPress={handleCreate}
                                disabled={submitting}
                            >
                                {submitting
                                    ? <ActivityIndicator color={colors.white} size="small" />
                                    : <>
                                        <Send color={colors.white} size={16} />
                                        <Text style={m.submitText}>ENVOYER LA DEMANDE AU PRODUCTEUR</Text>
                                      </>
                                }
                            </TouchableOpacity>
                        </ScrollView>
                    </View>
                </View>
            </Modal>

            {/* ── MODAL PARTICIPANTS ── */}
            <Modal
                visible={!!participantsModal}
                animationType="slide"
                transparent
                onRequestClose={() => setParticipantsModal(null)}
            >
                <View style={m.overlay}>
                    <View style={m.sheet}>
                        <View style={m.sheetHeader}>
                            <Text style={m.sheetTitle}>PARTICIPANTS</Text>
                            <TouchableOpacity
                                style={m.xCloseBtn}
                                onPress={() => setParticipantsModal(null)}
                                hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
                            >
                                <X color={colors.slate600} size={22} />
                            </TouchableOpacity>
                        </View>
                        {participantsModal && (
                            <Text style={m.sheetSubtitle}>{participantsModal.nom_produit}</Text>
                        )}
                        <ScrollView showsVerticalScrollIndicator={false}>
                            {partLoading ? (
                                <ActivityIndicator color={colors.primary} style={{ marginVertical: 24 }} />
                            ) : participants.length === 0 ? (
                                <View style={m.emptyPart}>
                                    <Users color={colors.slate300} size={28} />
                                    <Text style={m.emptyPartText}>Aucun participant pour l'instant</Text>
                                </View>
                            ) : (
                                participants.map((p, idx) => (
                                    <View key={p.id} style={m.partRow}>
                                        <View style={m.partIndex}>
                                            <Text style={m.partIndexText}>{idx + 1}</Text>
                                        </View>
                                        <View style={{ flex: 1 }}>
                                            <Text style={m.partName}>{p.marchand_nom ?? 'Marchand'}</Text>
                                            <Text style={m.partDate}>
                                                {new Date(p.date_inscription).toLocaleDateString('fr-FR')}
                                            </Text>
                                        </View>
                                        <View style={m.partQtyBadge}>
                                            <Text style={m.partQtyText}>{p.quantite} u</Text>
                                        </View>
                                    </View>
                                ))
                            )}
                            {participants.length > 0 && (
                                <View style={m.partTotal}>
                                    <Text style={m.partTotalLabel}>TOTAL ENGAGÉ</Text>
                                    <Text style={m.partTotalVal}>
                                        {participants.reduce((s, p) => s + p.quantite, 0)} unités
                                    </Text>
                                </View>
                            )}
                        </ScrollView>
                    </View>
                </View>
            </Modal>
        </View>
    );
}

// ── Styles ─────────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.bgSecondary },

    tabsScroll: { flexGrow: 0 },
    tab: {
        paddingHorizontal: 14, paddingVertical: 7, borderRadius: 8,
        backgroundColor: 'rgba(255,255,255,0.15)', marginRight: 8,
    },
    tabActive:     { backgroundColor: colors.white },
    tabText:       { fontSize: 12, fontWeight: '700', color: 'rgba(255,255,255,0.8)' },
    tabTextActive: { color: colors.primary },

    scroll:        { flex: 1 },
    scrollContent: { paddingHorizontal: 16, paddingTop: 20, paddingBottom: 100, gap: 12 },

    card: {
        backgroundColor: colors.white, borderRadius: 10, padding: 16,
        borderWidth: 1, borderColor: colors.slate100, gap: 10,
        shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.05, shadowRadius: 4, elevation: 2,
    },
    cardHeader:  { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
    cardProduct: { fontSize: 14, fontWeight: '800', color: colors.slate800 },
    cardProducer:{ fontSize: 11, fontWeight: '600', color: colors.slate500, marginTop: 2 },
    badge:       { paddingHorizontal: 9, paddingVertical: 4, borderRadius: 6, flexShrink: 0 },
    badgeText:   { fontSize: 11, fontWeight: '700' },

    qtyRow:   { flexDirection: 'row', gap: 16, flexWrap: 'wrap' },
    qtyBlock: { gap: 2 },
    qtyLbl:   { fontSize: 11, fontWeight: '700', color: colors.slate400, letterSpacing: 1 },
    qtyVal:   { fontSize: 14, fontWeight: '800', color: colors.slate700 },

    // Négociation
    waitingBox: {
        flexDirection: 'row', alignItems: 'center', gap: 8,
        backgroundColor: '#fef3c7', borderRadius: 8, padding: 12,
    },
    waitingText: { fontSize: 12, fontWeight: '600', color: '#92400e', flex: 1 },

    proposalBox: {
        backgroundColor: '#ecfdf5', borderRadius: 8, padding: 12, gap: 4,
        borderWidth: 1, borderColor: '#a7f3d0',
    },
    proposalLabel:  { fontSize: 11, fontWeight: '900', color: colors.primary, letterSpacing: 1.5 },
    proposalPrice:  { fontSize: 22, fontWeight: '900', color: colors.primary },
    proposalNormal: { fontSize: 11, color: colors.slate500 },

    messageBox: {
        flexDirection: 'row', gap: 8, alignItems: 'flex-start',
        backgroundColor: colors.slate50, borderRadius: 8, padding: 10,
    },
    messageText: { flex: 1, fontSize: 11, color: colors.slate500, lineHeight: 16 },

    actionBtnOutlineSmall: {
        alignItems: 'center', paddingVertical: 8,
        borderWidth: 1, borderColor: colors.slate200, borderRadius: 8,
    },
    actionBtnOutlineSmallText: { fontSize: 11, fontWeight: '600', color: colors.slate500 },

    // OPEN
    priceRow:   { flexDirection: 'row', alignItems: 'center', gap: 12, flexWrap: 'wrap' },
    priceBlock: { gap: 2 },
    priceLbl:   { fontSize: 11, fontWeight: '700', color: colors.slate400, letterSpacing: 1 },
    priceVal:   { fontSize: 16, fontWeight: '900', color: colors.primary },
    priceStrike:{ fontSize: 13, fontWeight: '600', color: colors.slate400, textDecorationLine: 'line-through' },
    ecoPill:    { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#d1fae5', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4 },
    ecoText:    { fontSize: 11, fontWeight: '900', color: '#065f46' },

    metaRow:  { flexDirection: 'row', gap: 16, flexWrap: 'wrap' },
    metaItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    metaText: { fontSize: 11, fontWeight: '600', color: colors.slate500 },

    actionsRow:        { flexDirection: 'row', gap: 8, alignItems: 'center' },
    actionBtnOutline:  {
        flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
        borderWidth: 1.5, borderColor: colors.primary, borderRadius: 8, paddingVertical: 9,
    },
    actionBtnOutlineText: { fontSize: 11, fontWeight: '700', color: colors.primary },
    actionBtn:         {
        flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
        backgroundColor: colors.primary, borderRadius: 8, paddingVertical: 9,
    },
    actionBtnDisabled: { backgroundColor: colors.slate300 },
    actionBtnText:     { fontSize: 11, fontWeight: '700', color: colors.white },
    actionBtnDanger:   {
        width: 38, height: 38, borderRadius: 8, alignItems: 'center', justifyContent: 'center',
        backgroundColor: '#fee2e2',
    },

    emptyCard:    {
        backgroundColor: colors.white, borderRadius: 10, padding: 40,
        alignItems: 'center', gap: 12, borderWidth: 2, borderColor: colors.slate100, borderStyle: 'dashed',
    },
    emptyText:    { fontSize: 11, fontWeight: '900', color: colors.slate300, letterSpacing: 2 },
    emptySubText: { fontSize: 12, color: colors.slate400, textAlign: 'center', lineHeight: 18 },

    fab: {
        position: 'absolute', right: 20, bottom: 30,
        width: 56, height: 56, borderRadius: 10,
        backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center',
        shadowColor: colors.primary, shadowOpacity: 0.35, shadowRadius: 8, elevation: 6,
    },
});

const m = StyleSheet.create({
    overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
    sheet:   {
        backgroundColor: colors.white,
        borderTopLeftRadius: 16, borderTopRightRadius: 16,
        padding: 20, maxHeight: '90%',
    },
    sheetHeader:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
    sheetTitle:    { fontSize: 14, fontWeight: '900', color: colors.slate800, letterSpacing: 1 },
    xCloseBtn:     { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
    sheetSubtitle: { fontSize: 11, color: colors.slate500, marginBottom: 16, lineHeight: 16 },

    fieldLabel: { fontSize: 11, fontWeight: '900', color: colors.slate400, letterSpacing: 2, marginTop: 16, marginBottom: 8 },

    chipScroll: { flexGrow: 0, marginBottom: 4 },
    chip: {
        paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8,
        borderWidth: 1, borderColor: colors.slate200, backgroundColor: colors.slate50, marginRight: 8,
    },
    chipActive:     { backgroundColor: colors.primary, borderColor: colors.primary },
    chipText:       { fontSize: 12, fontWeight: '600', color: colors.slate600 },
    chipTextActive: { color: colors.white },

    input: {
        borderWidth: 1, borderColor: colors.slate200, borderRadius: 8,
        paddingHorizontal: 14, paddingVertical: 10,
        fontSize: 14, color: colors.slate800,
    },

    submitBtn: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
        backgroundColor: colors.primary, borderRadius: 8,
        paddingVertical: 14, marginTop: 20, marginBottom: 8,
    },
    submitText: { fontSize: 12, fontWeight: '900', color: colors.white, letterSpacing: 1 },

    emptyPart:     { alignItems: 'center', paddingVertical: 32, gap: 10 },
    emptyPartText: { fontSize: 12, color: colors.slate400 },
    partRow: {
        flexDirection: 'row', alignItems: 'center', gap: 12,
        paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.slate100,
    },
    partIndex:     { width: 28, height: 28, borderRadius: 8, backgroundColor: colors.slate100, alignItems: 'center', justifyContent: 'center' },
    partIndexText: { fontSize: 11, fontWeight: '900', color: colors.slate500 },
    partName:      { fontSize: 13, fontWeight: '700', color: colors.slate800 },
    partDate:      { fontSize: 11, color: colors.slate400, marginTop: 2 },
    partQtyBadge:  { backgroundColor: '#d1fae5', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6 },
    partQtyText:   { fontSize: 12, fontWeight: '900', color: '#065f46' },
    partTotal:     {
        flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
        marginTop: 12, backgroundColor: colors.slate50, borderRadius: 8, padding: 14,
    },
    partTotalLabel: { fontSize: 11, fontWeight: '900', color: colors.slate400, letterSpacing: 1 },
    partTotalVal:   { fontSize: 16, fontWeight: '900', color: colors.primary },
});
