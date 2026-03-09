// Formulaire d'enrôlement — Agent Terrain
import React, { useState } from 'react';
import {
    View, Text, ScrollView, StyleSheet, TouchableOpacity,
    TextInput, Alert, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ChevronLeft } from 'lucide-react-native';
import { supabase } from '@/src/lib/supabase';
import { colors } from '@/src/lib/colors';
import { useAuth } from '@/src/context/AuthContext';
import { emitEvent } from '@/src/lib/socket';

// ── Composant principal ────────────────────────────────────────────────────────
export default function Enrolement() {
    const router = useRouter();
    const { user } = useAuth();

    const [nom, setNom]             = useState('');
    const [telephone, setTelephone] = useState('');
    const [type, setType]           = useState<'MERCHANT' | 'PRODUCER'>('MERCHANT');
    const [boutique, setBoutique]   = useState('');
    const [adresse, setAdresse]     = useState('');
    const [pin, setPin]             = useState('');
    const [pinConfirm, setPinConfirm] = useState('');
    const [loading, setLoading]     = useState(false);

    const handleSubmit = async () => {
        if (!nom.trim())       { Alert.alert('Erreur', 'Le nom complet est requis.'); return; }
        if (!telephone.trim()) { Alert.alert('Erreur', 'Le numéro de téléphone est requis.'); return; }
        if (!boutique.trim())  { Alert.alert('Erreur', 'Le nom de la boutique / ferme est requis.'); return; }
        if (!adresse.trim())   { Alert.alert('Erreur', "L'adresse est requise."); return; }
        if (pin.length !== 4)  { Alert.alert('Erreur', 'Le PIN temporaire doit comporter 4 chiffres.'); return; }
        if (pin !== pinConfirm) { Alert.alert('Erreur', 'Les PINs ne correspondent pas.'); return; }

        setLoading(true);
        try {
            const enrollPayload = {
                full_name:    nom.trim(),
                phone_number: telephone.trim(),
                role:         type,
                shop_name:    boutique.trim(),
                address:      adresse.trim(),
                temp_pin:     pin,
                agent_id:     user?.id,
                status:       'PENDING',
            };
            console.log('[Enrolement] INSERT enrollments payload:', enrollPayload);

            const { data: enrollData, error } = await supabase
                .from('enrollments')
                .insert([enrollPayload])
                .select()
                .single();

            if (error) {
                console.error('[Enrolement] ❌ INSERT enrollments ERREUR:', error.message, '| code:', error.code, '| details:', error.details);
                throw error;
            }
            console.log('[Enrolement] ✅ INSERT enrollments OK — id:', enrollData?.id);

            // Notifier la coopérative en temps réel (APRÈS Supabase)
            emitEvent('nouvel-enrolement', {
                agentId:      user?.id,
                agentName:    user?.name,
                marchandId:   enrollData?.id,
                marchandName: nom.trim(),
                secteur:      adresse.trim(),
            });
            console.log('[Enrolement] emitEvent nouvel-enrolement envoyé → coopérative');

            // Log activité
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
        } catch (err: any) {
            console.error('[Enrolement] insert error:', err);
            Alert.alert('Erreur', err?.message ?? "Une erreur est survenue lors de l'enregistrement.");
        } finally {
            setLoading(false);
        }
    };

    return (
        <SafeAreaView style={styles.safe} edges={['top']}>
            {/* ── HEADER ── */}
            <View style={styles.header}>
                <View style={styles.headerTop}>
                    <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
                        <ChevronLeft color={colors.white} size={20} />
                    </TouchableOpacity>
                    <View style={styles.headerTitleBlock}>
                        <Text style={styles.headerTitle}>ENRÔLEMENT</Text>
                        <Text style={styles.headerSubtitle}>NOUVEAU MEMBRE</Text>
                    </View>
                    <View style={{ width: 40 }} />
                </View>
            </View>

            {/* ── FORMULAIRE ── */}
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
                        placeholder="Ex : 77 123 45 67"
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

                {/* Adresse / Localisation */}
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

                {/* PIN temporaire */}
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

                {/* Confirmer PIN */}
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
                        <Text style={styles.submitBtnLabel}>ENREGISTRER L'ENRÔLEMENT</Text>
                    )}
                </TouchableOpacity>
            </ScrollView>
        </SafeAreaView>
    );
}

// ── Styles ─────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.bgSecondary },

    // Header
    header: {
        backgroundColor: colors.primary,
        paddingHorizontal: 16,
        paddingTop: 8,
        paddingBottom: 24,
        borderBottomLeftRadius: 32,
        borderBottomRightRadius: 32,
    },
    headerTop: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    backBtn: {
        width: 40, height: 40, borderRadius: 10,
        backgroundColor: 'rgba(255,255,255,0.2)',
        alignItems: 'center', justifyContent: 'center',
    },
    headerTitleBlock: { alignItems: 'center' },
    headerTitle:    { fontSize: 16, fontWeight: '900', color: colors.white, letterSpacing: 1 },
    headerSubtitle: { fontSize: 10, fontWeight: '700', color: 'rgba(255,255,255,0.65)', letterSpacing: 1, marginTop: 2 },

    // Scroll
    scroll:        { flex: 1 },
    scrollContent: { paddingHorizontal: 16, paddingTop: 20, paddingBottom: 40, gap: 16 },

    // Fields
    fieldGroup: { gap: 6 },
    label: {
        fontSize: 10, fontWeight: '900', color: colors.slate400, letterSpacing: 1.5,
    },
    input: {
        backgroundColor: colors.white,
        borderRadius: 10,
        borderWidth: 1,
        borderColor: colors.slate200,
        paddingHorizontal: 14,
        paddingVertical: 12,
        fontSize: 14,
        color: colors.slate800,
        fontWeight: '600',
    },
    inputError: {
        borderColor: colors.error,
    },
    errorHint: {
        fontSize: 10, fontWeight: '600', color: colors.error, marginTop: 2,
    },

    // Type buttons
    typeRow: { flexDirection: 'row', gap: 10 },
    typeBtn: {
        flex: 1,
        paddingVertical: 12,
        borderRadius: 10,
        borderWidth: 1.5,
        borderColor: colors.slate200,
        backgroundColor: colors.white,
        alignItems: 'center',
        justifyContent: 'center',
    },
    typeBtnActive: {
        borderColor: colors.primary,
        backgroundColor: colors.primaryBg,
    },
    typeBtnLabel: {
        fontSize: 11, fontWeight: '900', color: colors.slate400, letterSpacing: 1,
    },
    typeBtnLabelActive: {
        color: colors.primary,
    },

    // Submit
    submitBtn: {
        backgroundColor: colors.primary,
        borderRadius: 10,
        paddingVertical: 16,
        alignItems: 'center',
        justifyContent: 'center',
        marginTop: 8,
        shadowColor: colors.primary,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
        elevation: 4,
    },
    submitBtnDisabled: { opacity: 0.6 },
    submitBtnLabel: {
        fontSize: 13, fontWeight: '900', color: colors.white, letterSpacing: 1,
    },
});
