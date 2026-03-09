// Layout du groupe auth — pas de tabs, juste un Stack
import { Stack } from 'expo-router';

export default function AuthLayout() {
    return <Stack screenOptions={{ headerShown: false }} />;
}
