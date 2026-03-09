// Écran Profil — migré depuis Next.js /profil/page.tsx
import React from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { User, LogOut, Store, Shield, Phone, ChevronRight } from 'lucide-react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useAuth } from '@/src/context/AuthContext';
import { useProfileContext } from '@/src/context/ProfileContext';
import { colors } from '@/src/lib/colors';

const ROLE_LABELS: Record<string, string> = {
    MERCHANT: 'Commerçant',
    SUPERVISOR: 'Superviseur',
    PRODUCER: 'Producteur',
    COOPERATIVE: 'Coopérative',
    FIELD_AGENT: 'Agent Terrain',
};

const ROLE_COLORS: Record<string, string> = {
    MERCHANT: '#ecfdf5',
    SUPERVISOR: '#fef2f2',
    PRODUCER: '#fffbeb',
    COOPERATIVE: '#eff6ff',
    FIELD_AGENT: '#f5f3ff',
};

export default function ProfilScreen() {
    const router = useRouter();
    const { user, logout } = useAuth();
    const { activeProfile } = useProfileContext();

    const handleLogout = () => {
        Alert.alert(
            'Déconnexion',
            'Voulez-vous vraiment vous déconnecter ?',
            [
                { text: 'Annuler', style: 'cancel' },
                {
                    text: 'Se déconnecter',
                    style: 'destructive',
                    onPress: async () => {
                        await logout();
                        router.replace('/(auth)/login' as any);
                    },
                },
            ]
        );
    };

    const roleBg = ROLE_COLORS[user?.role || 'MERCHANT'];
    const roleLabel = ROLE_LABELS[user?.role || 'MERCHANT'];

    return (
        <SafeAreaView style={styles.safe} edges={['top']}>
            <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
                {/* Avatar + infos */}
                <View style={styles.avatarSection}>
                    <View style={styles.avatar}>
                        <Text style={styles.avatarLetter}>
                            {user?.name?.charAt(0)?.toUpperCase() || 'M'}
                        </Text>
                    </View>
                    <Text style={styles.userName}>{user?.name || 'Utilisateur'}</Text>
                    <View style={[styles.roleBadge, { backgroundColor: roleBg }]}>
                        <Text style={styles.roleBadgeText}>{roleLabel}</Text>
                    </View>
                </View>

                {/* Infos compte */}
                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>INFORMATIONS</Text>

                    <InfoRow icon={<Phone color={colors.primary} size={18} />} label="Téléphone" value={user?.phoneNumber || '—'} />
                    <InfoRow icon={<Shield color={colors.primary} size={18} />} label="Rôle" value={roleLabel} />
                    {activeProfile && (
                        <InfoRow icon={<Store color={colors.primary} size={18} />} label="Boutique" value={activeProfile.name} />
                    )}
                    <InfoRow icon={<User color={colors.primary} size={18} />} label="ID Compte" value={user?.id?.substring(0, 8) + '...' || '—'} />
                </View>

                {/* Actions */}
                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>ACTIONS</Text>

                    <TouchableOpacity style={styles.actionRow} activeOpacity={0.7}>
                        <View style={styles.actionLeft}>
                            <Shield color={colors.slate600} size={18} />
                            <Text style={styles.actionText}>Changer mon PIN</Text>
                        </View>
                        <ChevronRight color={colors.slate300} size={18} />
                    </TouchableOpacity>
                </View>

                {/* Déconnexion */}
                <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout} activeOpacity={0.85}>
                    <LogOut color={colors.error} size={18} />
                    <Text style={styles.logoutBtnText}>SE DÉCONNECTER</Text>
                </TouchableOpacity>

                <Text style={styles.footer}>Inclusion Marchand • v1.0.0</Text>
            </ScrollView>
        </SafeAreaView>
    );
}

function InfoRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
    return (
        <View style={infoStyles.row}>
            <View style={infoStyles.iconBox}>{icon}</View>
            <View style={infoStyles.content}>
                <Text style={infoStyles.label}>{label}</Text>
                <Text style={infoStyles.value}>{value}</Text>
            </View>
        </View>
    );
}

const infoStyles = StyleSheet.create({
    row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, gap: 12, borderBottomWidth: 1, borderBottomColor: colors.slate100 },
    iconBox: { width: 36, height: 36, borderRadius: 12, backgroundColor: colors.primaryBg, alignItems: 'center', justifyContent: 'center' },
    content: { flex: 1 },
    label: { fontSize: 10, fontWeight: '700', color: colors.slate400, textTransform: 'uppercase', letterSpacing: 1 },
    value: { fontSize: 14, fontWeight: '600', color: colors.slate800, marginTop: 2 },
});

const styles = StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.white },
    scroll: { paddingBottom: 40 },

    avatarSection: { alignItems: 'center', paddingVertical: 32, backgroundColor: colors.primaryBg },
    avatar: {
        width: 88, height: 88, borderRadius: 10,
        backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center',
        marginBottom: 12,
        shadowColor: colors.primary, shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.3, shadowRadius: 12, elevation: 8,
    },
    avatarLetter: { fontSize: 36, fontWeight: '900', color: colors.white },
    userName: { fontSize: 22, fontWeight: '900', color: colors.slate900, letterSpacing: -0.5 },
    roleBadge: { borderRadius: 10, paddingHorizontal: 16, paddingVertical: 6, marginTop: 8 },
    roleBadgeText: { fontSize: 12, fontWeight: '700', color: colors.slate700 },

    section: { paddingHorizontal: 20, paddingTop: 24 },
    sectionTitle: { fontSize: 10, fontWeight: '900', color: colors.slate400, letterSpacing: 3, textTransform: 'uppercase', marginBottom: 12 },

    actionRow: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: colors.slate100,
    },
    actionLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    actionText: { fontSize: 14, fontWeight: '600', color: colors.slate800 },

    logoutBtn: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
        marginHorizontal: 20, marginTop: 32, paddingVertical: 16,
        borderRadius: 10, borderWidth: 2, borderColor: '#fecaca', backgroundColor: '#fff1f2',
    },
    logoutBtnText: { fontSize: 13, fontWeight: '900', color: colors.error, letterSpacing: 1 },
    footer: { textAlign: 'center', color: colors.slate300, fontSize: 11, fontWeight: '600', marginTop: 24 },
});
