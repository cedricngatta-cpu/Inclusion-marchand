// Signalement — Agent Terrain
import React, { useState } from 'react';
import {
    View, Text, ScrollView, StyleSheet, TouchableOpacity,
    TextInput, Alert, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ChevronLeft, AlertTriangle } from 'lucide-react-native';
import { supabase } from '@/src/lib/supabase';
import { colors } from '@/src/lib/colors';
import { useAuth } from '@/src/context/AuthContext';
import { emitEvent } from '@/src/lib/socket';

// ── Types ──────────────────────────────────────────────────────────────────────
type ProblemType = 'Inactivité' | 'Fraude' | 'Fausse information' | 'Autre';

const PROBLEM_TYPES: ProblemType[] = ['Inactivité', 'Fraude', 'Fausse information', 'Autre'];

// ── Composant principal ────────────────────────────────────────────────────────
export default function Conformite() {
    const router = useRouter();
    const { user } = useAuth();

    const [membre, setMembre]           = useState('');
    const [typeProbleme, setTypeProbleme] = useState<ProblemType>('Inactivité');
    const [description, setDescription] = useState('');
    const [loading, setLoading]         = useState(false);

    const handleSubmit = async () => {
        if (!membre.trim()) {
            Alert.alert('Erreur', 'Veuillez renseigner le nom ou téléphone du membre concerné.');
            return;
        }
        if (!description.trim()) {
            Alert.alert('Erreur', 'Veuillez fournir une description du problème.');
            return;
        }

        setLoading(true);
        try {
            const { error } = await supabase.from('reports').insert([{
                reporter_id:  user?.id,
                member_name:  membre.trim(),
                problem_type: typeProbleme,
                description:  description.trim(),
                status:       'PENDING',
            }]);

            if (error) throw error;

            // Notifier la coopérative et l'admin en temps réel
            emitEvent('signalement-conformite', {
                agentId:      user?.id,
                agentName:    user?.name,
                marchandId:   null,
                marchandName: membre.trim(),
                type:         typeProbleme,
                description:  description.trim(),
                severity:     typeProbleme === 'Fraude' ? 'HIGH' : 'MEDIUM',
            });

            Alert.alert('Signalement envoyé', 'Votre signalement a été transmis avec succès.', [
                { text: 'OK', onPress: () => router.back() },
            ]);
        } catch (err: any) {
            console.error('[Conformite] insert error:', err);
            Alert.alert('Erreur', err?.message ?? 'Une erreur est survenue lors de l\'envoi.');
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
                        <Text style={styles.headerTitle}>SIGNALEMENT</Text>
                        <Text style={styles.headerSubtitle}>SIGNALER UN PROBLÈME</Text>
                    </View>
                    <View style={{ width: 40 }} />
                </View>
            </View>

            {/* ── CONTENU ── */}
            <ScrollView
                style={styles.scroll}
                contentContainerStyle={styles.scrollContent}
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
            >
                {/* Intro */}
                <View style={styles.infoCard}>
                    <AlertTriangle color='#92400e' size={20} />
                    <Text style={styles.infoText}>
                        Signalez un problème concernant un membre de votre secteur. Votre signalement sera traité dans les plus brefs délais.
                    </Text>
                </View>

                {/* Membre concerné */}
                <View style={styles.fieldGroup}>
                    <Text style={styles.label}>MEMBRE CONCERNÉ</Text>
                    <TextInput
                        style={styles.input}
                        placeholder="Nom ou téléphone du membre"
                        placeholderTextColor={colors.slate300}
                        value={membre}
                        onChangeText={setMembre}
                        autoCapitalize="words"
                    />
                </View>

                {/* Type de problème */}
                <View style={styles.fieldGroup}>
                    <Text style={styles.label}>TYPE DE PROBLÈME</Text>
                    <View style={styles.problemGrid}>
                        {PROBLEM_TYPES.map(type => (
                            <TouchableOpacity
                                key={type}
                                style={[
                                    styles.problemBtn,
                                    typeProbleme === type && styles.problemBtnActive,
                                ]}
                                activeOpacity={0.82}
                                onPress={() => setTypeProbleme(type)}
                            >
                                <Text style={[
                                    styles.problemBtnLabel,
                                    typeProbleme === type && styles.problemBtnLabelActive,
                                ]}>
                                    {type}
                                </Text>
                            </TouchableOpacity>
                        ))}
                    </View>
                </View>

                {/* Description */}
                <View style={styles.fieldGroup}>
                    <Text style={styles.label}>DESCRIPTION</Text>
                    <TextInput
                        style={styles.textArea}
                        placeholder="Décrivez le problème en détail…"
                        placeholderTextColor={colors.slate300}
                        value={description}
                        onChangeText={setDescription}
                        multiline
                        numberOfLines={4}
                        textAlignVertical="top"
                        autoCapitalize="sentences"
                    />
                </View>

                {/* Bouton envoyer */}
                <TouchableOpacity
                    style={[styles.submitBtn, loading && styles.submitBtnDisabled]}
                    activeOpacity={0.85}
                    onPress={handleSubmit}
                    disabled={loading}
                >
                    {loading ? (
                        <ActivityIndicator color={colors.white} />
                    ) : (
                        <Text style={styles.submitBtnLabel}>ENVOYER LE SIGNALEMENT</Text>
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
    headerTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
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

    // Info card
    infoCard: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: 10,
        backgroundColor: '#fef3c7',
        borderRadius: 10,
        padding: 14,
        borderWidth: 1,
        borderColor: '#fde68a',
    },
    infoText: {
        flex: 1,
        fontSize: 12,
        fontWeight: '600',
        color: '#92400e',
        lineHeight: 18,
    },

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
    textArea: {
        backgroundColor: colors.white,
        borderRadius: 10,
        borderWidth: 1,
        borderColor: colors.slate200,
        paddingHorizontal: 14,
        paddingVertical: 12,
        fontSize: 14,
        color: colors.slate800,
        fontWeight: '600',
        minHeight: 110,
    },

    // Problem buttons
    problemGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    problemBtn: {
        paddingHorizontal: 14,
        paddingVertical: 10,
        borderRadius: 8,
        borderWidth: 1.5,
        borderColor: colors.slate200,
        backgroundColor: colors.white,
    },
    problemBtnActive: {
        borderColor: colors.error,
        backgroundColor: '#fee2e2',
    },
    problemBtnLabel: {
        fontSize: 11, fontWeight: '700', color: colors.slate500,
    },
    problemBtnLabelActive: {
        color: '#991b1b',
    },

    // Submit
    submitBtn: {
        backgroundColor: colors.error,
        borderRadius: 10,
        paddingVertical: 16,
        alignItems: 'center',
        justifyContent: 'center',
        marginTop: 8,
        shadowColor: colors.error,
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
