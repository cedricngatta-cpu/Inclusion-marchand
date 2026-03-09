import { Stack } from 'expo-router';

export default function CooperativeLayout() {
    return (
        <Stack screenOptions={{ headerShown: false }}>
            <Stack.Screen name="index" />
            <Stack.Screen name="demandes" />
            <Stack.Screen name="membres" />
            <Stack.Screen name="achats" />
            <Stack.Screen name="performances" />
            <Stack.Screen name="analyses" />
        </Stack>
    );
}
