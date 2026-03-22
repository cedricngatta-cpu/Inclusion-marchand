// Layout principal — Stack sans tab bar
// Navigation via la grille du dashboard + bouton retour Android
import { Stack } from 'expo-router';

export default function TabsLayout() {
    return (
        <Stack screenOptions={{ headerShown: false }}>
            <Stack.Screen name="commercant" />
            <Stack.Screen name="notifications" />
            <Stack.Screen name="profil" />
            <Stack.Screen name="vendre" />
            <Stack.Screen name="stock" />
            <Stack.Screen name="bilan" />
            <Stack.Screen name="scanner" />
            <Stack.Screen name="carnet" />

            <Stack.Screen name="marche" />
            <Stack.Screen name="revenus" />
            <Stack.Screen name="wallet" />
            <Stack.Screen name="formation" />
            <Stack.Screen name="conseils" />
            <Stack.Screen name="achats-groupes" />
            <Stack.Screen name="mes-commandes" />
            <Stack.Screen name="finance" />
        </Stack>
    );
}
