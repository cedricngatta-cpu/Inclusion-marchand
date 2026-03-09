import { Stack } from 'expo-router';

export default function AdminLayout() {
    return (
        <Stack screenOptions={{ headerShown: false }}>
            <Stack.Screen name="index" />
            <Stack.Screen name="utilisateurs" />
            <Stack.Screen name="transactions" />
            <Stack.Screen name="produits" />
            <Stack.Screen name="commandes" />
            <Stack.Screen name="signalements" />
            <Stack.Screen name="statistiques" />
        </Stack>
    );
}
