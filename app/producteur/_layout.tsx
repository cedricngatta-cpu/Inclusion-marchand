import { Stack } from 'expo-router';

export default function ProducteurLayout() {
    return (
        <Stack screenOptions={{ headerShown: false }}>
            <Stack.Screen name="index" />
            <Stack.Screen name="publier" />
            <Stack.Screen name="commandes" />
            <Stack.Screen name="livraisons" />
            <Stack.Screen name="stock" />
            <Stack.Screen name="revenus" />
            <Stack.Screen name="mes-produits" />
        </Stack>
    );
}
