// Formulaire d'enrôlement — Agent Terrain
// Chaque nouveau membre est rattaché à une coopérative dès l'inscription
import React, { useState, useEffect } from 'react';
import {
    View, Text, ScrollView, StyleSheet, TouchableOpacity,
    TextInput, Alert, ActivityIndicator, KeyboardAvoidingView, Platform,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { ChevronDown } from 'lucide-react-native';
import { ScreenHeader } from '@/src/components/ui';
import { supabase } from '@/src/lib/supabase';
import { colors } from '@/src/lib/colors';
import { useAuth } from '@/src/context/AuthContext';
import { emitEvent } from '@/src/lib/socket';

const log = (...args: any[]) => { if (__DEV__) console.log(...args); };

type CoopMode = 'select' | 'none' | 'autre';

interface Cooperative {
    id: string;
    full_name: string | null;
}

export default function Enrolement() {
    const router = useRouter();
    const { user } = useAuth();
    const { id } = useLocalSearchParams<{ id?: string }>();
    const isEditMode = !!id;

    // Champs du formulaire
    const [nom, setNom]             = useState('');
    const [telephone, setTelephone] = useState('');
    const [type, setType]           = useState<'MERCHANT' | 'PRODUCER'>('MERCHANT');
    const [boutique, setBoutique]   = useState('');
    const [adresse, setAdresse]     = useState('');
    const [pin, setPin]             = useState('');
    const [pinConfirm, setPinConfirm] = useState('');
    const [loading, setLoading]     = useState(false);

    // Coopérative
    const [coopMode,       setCoopMode]       = useState<CoopMode>('select');
    const [cooperatives,   setCooperatives]   = useState<Cooperative[]>([]);
    const [selectedCoopId, setSelectedCoopId] = useState('');
    const [coopNomAutre,   setCoopNomAutre]   = useState('');
    const [coopsLoading,   setCoopsLoading]   = useState(false);

    // Charger la liste des coopératives au montage
    useEffect(() => {
        (async () => {
            setCoopsLoading(true);
            try {
                const { data } = await supabase
                    .from('profiles')
                    .select('id, full_name')
                    .eq('role', 'COOPERATIVE')
                    .order('full_name');
                setCooperatives((data as Cooperative[]) ?? []);
                // Sélectionner la première par défaut
                if (data && data.length > 0) setSelectedCoopId((data[0] as Cooperative).id);
            } catch {}
            finally { setCoopsLoading(false); }
        })();
    }, []);

    // Pré-remplissage en mode correction
    useEffect(() => {
        if (!id) return;
        (async () => {
            setLoading(true);
            try {
                const { data, error } = await supabase
                    .from('demandes_enrolement')
                    .select('*')
                    .eq('id', id)
                    .single();
                if (error) throw error;
                if (data) {
                    setNom(data.nom ?? '');
                    setTelephone(data.telephone ?? '');
                    setType(data.type ?? 'MERCHANT');
                    setBoutique(data.nom_boutique ?? '');
                    setAdresse(data.adresse ?? '');
                    // Restaurer mode coopérative
                    if (data.affectation_status === 'a_affecter') {
                        setCoopMode('none');
                    } else if (data.affectation_status === 'nouvelle') {
                        setCoopMode('autre');
                        setCoopNomAutre(data.cooperative_nom_autre ?? '');
                    } else if (data.cooperative_id) {
                        setCoopMode('select');
                        setSelectedCoopId(data.cooperative_id);
                    }
                }
            } catch (err: any) {
                Alert.alert('Erreur', "Impossible de charger les données de l'enrôlement.");
                console.error('[Enrolement] fetch edit error:', err);
            } finally {
                setLoading(false);
            }
        })();
    }, [id]);

    // Validation et payload de la coopérative
    const buildCoopPayload = (): { cooperative_id: string | null; cooperative_nom_autre: string | null; affectation_status: string } | null => {
        if (coopMode === 'select') {
            if (!selectedCoopId) {
                Alert.alert('Coopérative requise', 'Veuillez sélectionner une coopérative ou choisir une autre option.');
                return null;
            }
            return { cooperative_id: selectedCoopId, cooperative_nom_autre: null, affectation_status: 'affecte' };
        }
        if (coopMode === 'none') {
            return { cooperative_id: null, cooperative_nom_autre: null, affectation_status: 'a_affecter' };
        }
        // mode 'autre'
        if (!coopNomAutre.trim()) {
            Alert.alert('Nom requis', 'Veuillez saisir le nom de la coopérative.');
            return null;
        }
        return { cooperative_id: null, cooperative_nom_autre: coopNomAutre.trim(), affectation_status: 'nouvelle' };
    };

    const handleSubmit = async () => {
        if (!nom.trim())       { Alert.alert('Erreur', 'Le nom complet est requis.'); return; }
        if (!telephone.trim()) { Alert.alert('Erreur', 'Le numéro de téléphone est requis.'); return; }
        if (!boutique.trim())  { Alert.alert('Erreur', 'Le nom de la boutique / ferme est requis.'); return; }
        if (!adresse.trim())   { Alert.alert('Erreur', "L'adresse est requise."); return; }
        if (!isEditMode) {
            if (pin.length !== 4)   { Alert.alert('Erreur', 'Le PIN temporaire doit comporter 4 chiffres.'); return; }
            if (pin !== pinConfirm) { Alert.alert('Erreur', 'Les PINs ne correspondent pas.'); return; }
        }

        const coopPayload = buildCoopPayload();
        if (coopPayload === null) return; // validation coopérative a échoué

        setLoading(true);
        try {
            if (isEditMode) {
                const updatePayload = {
                    nom:          nom.trim(),
                    telephone:    telephone.trim(),
                    type,
                    nom_boutique: boutique.trim(),
                    adresse:      adresse.trim(),
                    statut:       'en_attente',
                    motif_rejet:  null,
                    ...coopPayload,
                };
                log('[Enrolement] UPDATE payload:', updatePayload);

                const { error } = await supabase
                    .from('demandes_enrolement')
                    .update(updatePayload)
                    .eq('id', id);
                if (error) throw error;

                emitEvent('nouvel-enrolement', {
                    agentId:      user?.id,
                    agentName:    user?.name,
                    marchandId:   id,
                    marchandName: nom.trim(),
                    secteur:      adresse.trim(),
                });

                try {
                    await supabase.from('activity_logs').insert([{
                        user_id:   user?.id ?? null,
                        user_name: user?.name ?? 'Agent',
                        action:    `Correction enrôlement de ${nom.trim()} (${type === 'MERCHANT' ? 'Marchand' : 'Producteur'}) — ${boutique.trim()} à ${adresse.trim()}`,
                        type:      'enrolement',
                    }]);
                } catch {}

                Alert.alert('Correction envoyée', "L'enrôlement corrigé a été soumis pour validation.", [
                    { text: 'OK', onPress: () => router.back() },
                ]);

            } else {
                const enrollPayload = {
                    nom:          nom.trim(),
                    telephone:    telephone.trim(),
                    type,
                    nom_boutique: boutique.trim(),
                    adresse:      adresse.trim(),
                    agent_id:     user?.id,
                    statut:       'en_attente',
                    ...coopPayload,
                };
                log('[Enrolement] INSERT payload:', enrollPayload);

                const { data: enrollData, error } = await supabase
                    .from('demandes_enrolement')
                    .insert([enrollPayload])
                    .select()
                    .single();
                if (error) throw error;

                // Notification pour cas spéciaux
                if (coopPayload.affectation_status === 'a_affecter') {
                    // Notifier la première coopérative (AGRI-CI par défaut)
                    if (cooperatives.length > 0) {
                        try {
                            await supabase.from('notifications').insert([{
                                user_id: cooperatives[0].id,
                                titre:   'Nouveau membre sans coopérative',
                                message: `L'agent ${user?.name ?? 'Agent'} a inscrit ${nom.trim()} (${type === 'MERCHANT' ? 'Marchand' : 'Producteur'}) sans coopérative. Veuillez l'affecter.`,
                                type:    'enrolement',
                            }]);
                        } catch {}
                    }
                } else if (coopPayload.affectation_status === 'nouvelle') {
                    // Notifier l'admin (rôle SUPERVISOR)
                    try {
                        const { data: admins } = await supabase.from('profiles').select('id').eq('role', 'SUPERVISOR');
                        if (admins?.length) {
                            await supabase.from('notifications').insert(
                                (admins as { id: string }[]).map(a => ({
                                    user_id: a.id,
                                    titre:   'Coopérative inconnue signalée',
                                    message: `Agent ${user?.name ?? 'Agent'} a inscrit ${nom.trim()} avec une coopérative inconnue : "${coopNomAutre.trim()}". Veuillez traiter.`,
                                    type:    'enrolement',
                                }))
                            );
                        }
                    } catch {}
                }

                emitEvent('nouvel-enrolement', {
                    agentId:        user?.id,
                    agentName:      user?.name,
                    marchandId:     enrollData?.id,
                    marchandName:   nom.trim(),
                    secteur:        adresse.trim(),
                    cooperativeId:  coopPayload.cooperative_id,
                });

                try {
                    await supabase.from('activity_logs').insert([{
                        user_id:   user?.id ?? null,
                        user_name: user?.name ?? 'Agent',
                        action:    `Enrôlement de ${nom.trim()} (${type === 'MERCHANT' ? 'Marchand' : 'Producteur'}) — ${boutique.trim()} à ${adresse.trim()}`,
                        type:      'enrolement',
                    }]);
                } catch {}

                Alert.alert('Succès', "L'enrôlement a été enregistré avec succès.", [
                    { text: 'OK', onPress: () => router.back() },
                ]);
            }
        } catch (err: any) {
            console.error('[Enrolement] submit error:', err);
            Alert.alert('Erreur', err?.message ?? "Une erreur est survenue lors de l'enregistrement.");
        } finally {
            setLoading(false);
        }
    };

    return (
        <KeyboardAvoidingView
            style={styles.safe}
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
            <ScreenHeader
                title="Enrôlement"
                subtitle={isEditMode ? "Corriger l'enrôlement" : "Nouveau membre"}
                showBack={true}
            />

            <ScrollView
                style={styles.scroll}
                contentContainerStyle={styles.scrollContent}
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
            >
                {/* Nom complet */}
                <View style={styles.fieldGroup}>
                    <Text style={styles.label}>NOM COMPLET</Text>
                    <TextInput
                        style={styles.input}
                        placeholder="Ex : Fatima Diallo"
                        placeholderTextColor={colors.slate300}
                        value={nom}
                        onChangeText={setNom}
                        autoCapitalize="words"
                    />
                </View>

                {/* Téléphone */}
                <View style={styles.fieldGroup}>
                    <Text style={styles.label}>TÉLÉPHONE</Text>
                    <TextInput
                        style={styles.input}
                        placeholder="Ex : 0711 223 344"
                        placeholderTextColor={colors.slate300}
                        value={telephone}
                        onChangeText={setTelephone}
                        keyboardType="phone-pad"
                    />
                </View>

                {/* Type de membre */}
                <View style={styles.fieldGroup}>
                    <Text style={styles.label}>TYPE DE MEMBRE</Text>
                    <View style={styles.typeRow}>
                        <TouchableOpacity
                            style={[styles.typeBtn, type === 'MERCHANT' && styles.typeBtnActive]}
                            activeOpacity={0.82}
                            onPress={() => setType('MERCHANT')}
                        >
                            <Text style={[styles.typeBtnLabel, type === 'MERCHANT' && styles.typeBtnLabelActive]}>
                                MARCHAND
                            </Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={[styles.typeBtn, type === 'PRODUCER' && styles.typeBtnActive]}
                            activeOpacity={0.82}
                            onPress={() => setType('PRODUCER')}
                        >
                            <Text style={[styles.typeBtnLabel, type === 'PRODUCER' && styles.typeBtnLabelActive]}>
                                PRODUCTEUR
                            </Text>
                        </TouchableOpacity>
                    </View>
                </View>

                {/* ── COOPÉRATIVE ── */}
                <View style={styles.fieldGroup}>
                    <Text style={styles.label}>COOPÉRATIVE</Text>

                    {/* Sélecteur de mode */}
                    <View style={styles.coopModeRow}>
                        <TouchableOpacity
                            style={[styles.coopModeBtn, coopMode === 'select' && styles.coopModeBtnActive]}
                            onPress={() => setCoopMode('select')}
                            activeOpacity={0.82}
                        >
                            <Text style={[styles.coopModeBtnText, coopMode === 'select' && styles.coopModeBtnTextActive]}>
                                Sélectionner
                            </Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={[styles.coopModeBtn, coopMode === 'none' && styles.coopModeBtnActive]}
                            onPress={() => setCoopMode('none')}
                            activeOpacity={0.82}
                        >
                            <Text style={[styles.coopModeBtnText, coopMode === 'none' && styles.coopModeBtnTextActive]}>
                                Pas de coop.
                            </Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={[styles.coopModeBtn, coopMode === 'autre' && styles.coopModeBtnActive]}
                            onPress={() => setCoopMode('autre')}
                            activeOpacity={0.82}
                        >
                            <Text style={[styles.coopModeBtnText, coopMode === 'autre' && styles.coopModeBtnTextActive]}>
                                Autre
                            </Text>
                        </TouchableOpacity>
                    </View>

                    {/* Mode sélection : liste des coopératives */}
                    {coopMode === 'select' && (
                        coopsLoading ? (
                            <ActivityIndicator color={colors.primary} style={{ marginVertical: 8 }} />
                        ) : cooperatives.length === 0 ? (
                            <View style={styles.coopEmptyBox}>
                                <Text style={styles.coopEmptyText}>Aucune coopérative trouvée dans le système</Text>
                            </View>
                        ) : (
                            <ScrollView
                                horizontal
                                showsHorizontalScrollIndicator={false}
                                style={styles.coopListScroll}
                                contentContainerStyle={{ gap: 8 }}
                            >
                                {cooperatives.map(c => (
                                    <TouchableOpacity
                                        key={c.id}
                                        style={[styles.coopChip, selectedCoopId === c.id && styles.coopChipActive]}
                                        onPress={() => setSelectedCoopId(c.id)}
                                        activeOpacity={0.82}
                                    >
                                        <Text style={[styles.coopChipText, selectedCoopId === c.id && styles.coopChipTextActive]}>
                                            {c.full_name ?? 'Coopérative'}
                                        </Text>
                                    </TouchableOpacity>
                                ))}
                            </ScrollView>
                        )
                    )}

                    {/* Mode "pas de coopérative" */}
                    {coopMode === 'none' && (
                        <View style={styles.coopInfoBox}>
                            <Text style={styles.coopInfoText}>
                                Ce membre sera rattaché à la coopérative par défaut (AGRI-CI) et marqué "À affecter". La coopérative sera notifiée.
                            </Text>
                        </View>
                    )}

                    {/* Mode "autre" : saisir le nom */}
                    {coopMode === 'autre' && (
                        <>
                            <TextInput
                                style={styles.input}
                                placeholder="Nom de la coopérative (ex: Coop Bélier)"
                                placeholderTextColor={colors.slate300}
                                value={coopNomAutre}
                                onChangeText={setCoopNomAutre}
                                autoCapitalize="words"
                            />
                            <View style={styles.coopInfoBox}>
                                <Text style={styles.coopInfoText}>
                                    Une notification sera envoyée à l'administrateur pour créer cette coopérative dans le système.
                                </Text>
                            </View>
                        </>
                    )}
                </View>

                {/* Nom boutique / ferme */}
                <View style={styles.fieldGroup}>
                    <Text style={styles.label}>
                        {type === 'MERCHANT' ? 'NOM DE LA BOUTIQUE' : 'NOM DE LA FERME'}
                    </Text>
                    <TextInput
                        style={styles.input}
                        placeholder={type === 'MERCHANT' ? 'Ex : Boutique Baobab' : 'Ex : Ferme des Collines'}
                        placeholderTextColor={colors.slate300}
                        value={boutique}
                        onChangeText={setBoutique}
                        autoCapitalize="words"
                    />
                </View>

                {/* Adresse */}
                <View style={styles.fieldGroup}>
                    <Text style={styles.label}>ADRESSE / LOCALISATION</Text>
                    <TextInput
                        style={styles.input}
                        placeholder="Ex : Quartier Médina, Dakar"
                        placeholderTextColor={colors.slate300}
                        value={adresse}
                        onChangeText={setAdresse}
                        autoCapitalize="sentences"
                    />
                </View>

                {/* PIN (seulement en création) */}
                {!isEditMode && (
                    <>
                        <View style={styles.fieldGroup}>
                            <Text style={styles.label}>PIN TEMPORAIRE (4 CHIFFRES)</Text>
                            <TextInput
                                style={styles.input}
                                placeholder="••••"
                                placeholderTextColor={colors.slate300}
                                value={pin}
                                onChangeText={text => setPin(text.replace(/\D/g, '').slice(0, 4))}
                                keyboardType="numeric"
                                secureTextEntry
                                maxLength={4}
                            />
                        </View>

                        <View style={styles.fieldGroup}>
                            <Text style={styles.label}>CONFIRMER LE PIN</Text>
                            <TextInput
                                style={[styles.input, pinConfirm.length > 0 && pin !== pinConfirm && styles.inputError]}
                                placeholder="••••"
                                placeholderTextColor={colors.slate300}
                                value={pinConfirm}
                                onChangeText={text => setPinConfirm(text.replace(/\D/g, '').slice(0, 4))}
                                keyboardType="numeric"
                                secureTextEntry
                                maxLength={4}
                            />
                            {pinConfirm.length > 0 && pin !== pinConfirm && (
                                <Text style={styles.errorHint}>Les PINs ne correspondent pas</Text>
                            )}
                        </View>
                    </>
                )}

                {/* Bouton soumettre */}
                <TouchableOpacity
                    style={[styles.submitBtn, loading && styles.submitBtnDisabled]}
                    activeOpacity={0.85}
                    onPress={handleSubmit}
                    disabled={loading}
                >
                    {loading ? (
                        <ActivityIndicator color={colors.white} />
                    ) : (
                        <Text style={styles.submitBtnLabel}>
                            {isEditMode ? 'ENVOYER LA CORRECTION' : "ENREGISTRER L'ENRÔLEMENT"}
                        </Text>
                    )}
                </TouchableOpacity>
            </ScrollView>
        </KeyboardAvoidingView>
    );
}

const styles = StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.bgSecondary },
    scroll:        { flex: 1 },
    scrollContent: { paddingHorizontal: 16, paddingTop: 20, paddingBottom: 40, gap: 16 },

    fieldGroup: { gap: 6 },
    label: { fontSize: 11, fontWeight: '900', color: colors.slate400, letterSpacing: 1.5 },
    input: {
        backgroundColor: colors.white, borderRadius: 10,
        borderWidth: 1, borderColor: colors.slate200,
        paddingHorizontal: 14, paddingVertical: 12,
        fontSize: 14, color: colors.slate800, fontWeight: '600',
    },
    inputError: { borderColor: colors.error },
    errorHint:  { fontSize: 11, fontWeight: '600', color: colors.error, marginTop: 2 },

    typeRow: { flexDirection: 'row', gap: 10 },
    typeBtn: {
        flex: 1, paddingVertical: 12, borderRadius: 10,
        borderWidth: 1.5, borderColor: colors.slate200,
        backgroundColor: colors.white, alignItems: 'center', justifyContent: 'center',
    },
    typeBtnActive:      { borderColor: colors.primary, backgroundColor: colors.primaryBg },
    typeBtnLabel:       { fontSize: 11, fontWeight: '900', color: colors.slate400, letterSpacing: 1 },
    typeBtnLabelActive: { color: colors.primary },

    // Coopérative
    coopModeRow: { flexDirection: 'row', gap: 8, marginBottom: 4 },
    coopModeBtn: {
        flex: 1, paddingVertical: 9, borderRadius: 8,
        borderWidth: 1.5, borderColor: colors.slate200,
        backgroundColor: colors.white, alignItems: 'center',
    },
    coopModeBtnActive:     { borderColor: colors.primary, backgroundColor: colors.primaryBg },
    coopModeBtnText:       { fontSize: 11, fontWeight: '700', color: colors.slate400 },
    coopModeBtnTextActive: { color: colors.primary },

    coopListScroll: { flexGrow: 0 },
    coopChip: {
        paddingHorizontal: 14, paddingVertical: 10, borderRadius: 8,
        borderWidth: 1.5, borderColor: colors.slate200,
        backgroundColor: colors.white,
    },
    coopChipActive:     { borderColor: colors.primary, backgroundColor: colors.primaryBg },
    coopChipText:       { fontSize: 12, fontWeight: '700', color: colors.slate500 },
    coopChipTextActive: { color: colors.primary },

    coopInfoBox: {
        backgroundColor: '#fef9c3', borderRadius: 8, padding: 10,
        borderWidth: 1, borderColor: '#fde047',
    },
    coopInfoText:  { fontSize: 11, color: '#854d0e', lineHeight: 16 },
    coopEmptyBox:  { backgroundColor: colors.slate50, borderRadius: 8, padding: 12 },
    coopEmptyText: { fontSize: 11, color: colors.slate400 },

    submitBtn: {
        backgroundColor: colors.primary, borderRadius: 10,
        paddingVertical: 16, alignItems: 'center', justifyContent: 'center',
        marginTop: 8,
        shadowColor: colors.primary, shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3, shadowRadius: 8, elevation: 4,
    },
    submitBtnDisabled: { opacity: 0.6 },
    submitBtnLabel:    { fontSize: 13, fontWeight: '900', color: colors.white, letterSpacing: 1 },
});
