// Page d'accueil — redirige vers login ou dashboard selon l'état d'auth
import { useEffect } from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '@/src/context/AuthContext';
import { colors } from '@/src/lib/colors';

export default function IndexPage() {
    const router = useRouter();
    const { isAuthenticated, user } = useAuth();

    const getDashboardPath = (role: string | undefined) => {
        switch ((role ?? '').toLowerCase()) {
            // Valeurs normalisées (AuthContext)
            case 'supervisor':
            // Valeurs brutes Supabase (sécurité)
            case 'admin':
            case 'superviseur':
                return '/admin';

            case 'producer':
            case 'producteur':
                return '/producteur';

            case 'cooperative':
            case 'coopérative':
                return '/cooperative';

            case 'field_agent':
            case 'agent':
            case 'agent_terrain':
                return '/agent';

            case 'merchant':
            case 'marchand':
            case 'commercant':
            default:
                return '/(tabs)/commercant';
        }
    };

    useEffect(() => {
        if (isAuthenticated && user) {
            router.replace(getDashboardPath(user.role) as any);
        } else if (isAuthenticated === false) {
            router.replace('/(auth)/login' as any);
        }
    }, [isAuthenticated, user]);

    return (
        <View style={styles.container}>
            <ActivityIndicator size="large" color={colors.primary} />
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: colors.white,
    },
});
