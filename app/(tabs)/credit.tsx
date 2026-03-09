// Services Financiers — migré depuis Next.js /finance/page.tsx
import React from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ChevronLeft, Landmark, Shield, TrendingUp, Lock } from 'lucide-react-native';
import { colors } from '@/src/lib/colors';

const SERVICES = [
    {
        title: 'Microcrédit',
        description: 'Financement pour votre stock',
        icon: Landmark,
        bg: '#f3e8ff',
        color: '#7c3aed',
        status: 'Bientôt disponible',
    },
    {
        title: 'Assurance',
        description: 'Protection santé et boutique',
        icon: Shield,
        bg: '#eff6ff',
        color: '#2563eb',
        status: "En cours d'étude",
    },
    {
        title: 'Score de Crédit',
        description: 'Basé sur votre activité',
        icon: TrendingUp,
        bg: '#f0fdf4',
        color: colors.primary,
        status: 'Calcul automatique',
    },
];

export default function CreditScreen() {
    const router = useRouter();

    return (
        <SafeAreaView style={styles.safe} edges={['top']}>
            {/* ── HEADER ── */}
            <View style={styles.header}>
                <View style={styles.headerTop}>
                    <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
                        <ChevronLeft color={colors.white} size={20} />
                    </TouchableOpacity>
                    <View style={styles.headerTitleBlock}>
                        <Text style={styles.headerTitle}>SERVICES FINANCIERS</Text>
                        <Text style={styles.headerSub}>DÉVELOPPEZ VOTRE ACTIVITÉ</Text>
                    </View>
                    <View style={{ width: 40 }} />
                </View>
            </View>

            <ScrollView
                style={styles.scroll}
                contentContainerStyle={styles.scrollContent}
                showsVerticalScrollIndicator={false}
            >
                {/* Cartes services */}
                {SERVICES.map((service, i) => (
                    <View key={i} style={styles.serviceCard}>
                        <View style={[styles.serviceIcon, { backgroundColor: service.bg }]}>
                            <service.icon color={service.color} size={26} />
                        </View>
                        <View style={styles.serviceInfo}>
                            <Text style={styles.serviceTitle}>{service.title}</Text>
                            <Text style={styles.serviceDesc}>{service.description}</Text>
                            <View style={styles.statusBadge}>
                                <Lock color={colors.slate400} size={11} />
                                <Text style={styles.statusText}>{service.status}</Text>
                            </View>
                        </View>
                    </View>
                ))}

                {/* Bloc explicatif */}
                <View style={styles.infoBox}>
                    <Text style={styles.infoTitle}>POURQUOI CES SERVICES ?</Text>
                    <Text style={styles.infoText}>
                        Plus vous enregistrez vos ventes sur l'application, plus votre{' '}
                        <Text style={styles.infoHighlight}>score de confiance</Text>{' '}
                        augmente. C'est ce score qui vous permettra d'accéder aux
                        financements sans paperasse.
                    </Text>
                </View>
            </ScrollView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.bgSecondary },

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
    headerTitle: { fontSize: 14, fontWeight: '900', color: colors.white, letterSpacing: 1 },
    headerSub:   { fontSize: 9, fontWeight: '700', color: 'rgba(255,255,255,0.7)', letterSpacing: 2, marginTop: 2 },

    scroll:        { flex: 1 },
    scrollContent: { paddingHorizontal: 16, paddingTop: 20, paddingBottom: 40, gap: 16 },

    serviceCard: {
        flexDirection: 'row', alignItems: 'center', gap: 16,
        backgroundColor: colors.white, borderRadius: 10, padding: 20,
        borderWidth: 1, borderColor: colors.slate100,
        shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.07, shadowRadius: 8, elevation: 4,
    },
    serviceIcon: { width: 56, height: 56, borderRadius: 12, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
    serviceInfo: { flex: 1 },
    serviceTitle: { fontSize: 14, fontWeight: '900', color: colors.slate800, textTransform: 'uppercase', marginBottom: 4 },
    serviceDesc:  { fontSize: 10, fontWeight: '700', color: colors.slate400, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 },
    statusBadge: {
        flexDirection: 'row', alignItems: 'center', gap: 5, alignSelf: 'flex-start',
        backgroundColor: colors.slate50, paddingHorizontal: 10, paddingVertical: 5,
        borderRadius: 8, borderWidth: 1, borderColor: colors.slate100,
    },
    statusText: { fontSize: 9, fontWeight: '700', color: colors.slate500, letterSpacing: 1 },

    infoBox: {
        backgroundColor: '#f0fdf4', borderRadius: 10, padding: 22,
        borderWidth: 2, borderColor: '#bbf7d0',
    },
    infoTitle:     { fontSize: 10, fontWeight: '900', color: '#166534', letterSpacing: 2, marginBottom: 10 },
    infoText:      { fontSize: 13, fontWeight: '600', color: '#15803d', lineHeight: 20 },
    infoHighlight: { backgroundColor: '#bbf7d0', color: '#14532d', fontWeight: '900', borderRadius: 4, paddingHorizontal: 4 },
});
