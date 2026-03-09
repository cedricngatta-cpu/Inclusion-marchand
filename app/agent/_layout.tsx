// Layout Agent Terrain
import { Stack } from 'expo-router';

export default function AgentLayout() {
    return (
        <Stack screenOptions={{ headerShown: false }}>
            <Stack.Screen name="index" />
            <Stack.Screen name="enrolement" />
            <Stack.Screen name="secteur" />
            <Stack.Screen name="activites" />
            <Stack.Screen name="conformite" />
        </Stack>
    );
}
