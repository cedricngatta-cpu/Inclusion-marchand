// Requis par expo-router 4+ — gère toutes les routes inconnues
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';

export default function NotFound() {
    const router = useRouter();
    return (
        <View style={s.container}>
            <Text style={s.title}>Page introuvable</Text>
            <TouchableOpacity style={s.btn} onPress={() => router.replace('/')}>
                <Text style={s.btnText}>Retour à l'accueil</Text>
            </TouchableOpacity>
        </View>
    );
}

const s = StyleSheet.create({
    container: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#f8fafc', gap: 16 },
    title:     { fontSize: 18, fontWeight: '700', color: '#475569' },
    btn:       { backgroundColor: '#059669', paddingHorizontal: 24, paddingVertical: 12, borderRadius: 10 },
    btnText:   { fontSize: 14, fontWeight: '700', color: '#fff' },
});
