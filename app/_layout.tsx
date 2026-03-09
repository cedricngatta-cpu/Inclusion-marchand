// Layout racine — point d'entrée expo-router
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider, useAuth } from '@/src/context/AuthContext';
import { ProfileProvider } from '@/src/context/ProfileContext';
import { StockProvider } from '@/src/context/StockContext';
import { HistoryProvider } from '@/src/context/HistoryContext';
import { ProductProvider } from '@/src/context/ProductContext';
import { NotificationProvider } from '@/src/context/NotificationContext';
import VoiceButton from '@/src/components/VoiceButton';

// VoiceButton rendu seulement si l'utilisateur est connecté
function AppWithVoice() {
    const { user } = useAuth() as any;
    return (
        <>
            <Stack screenOptions={{ headerShown: false }}>
                <Stack.Screen name="(auth)" />
                <Stack.Screen name="(tabs)" />
                <Stack.Screen name="producteur" />
                <Stack.Screen name="agent" />
                <Stack.Screen name="cooperative" />
                <Stack.Screen name="admin" />
                <Stack.Screen name="+not-found" />
            </Stack>
            {user && <VoiceButton />}
        </>
    );
}

export default function RootLayout() {
    return (
        <GestureHandlerRootView style={{ flex: 1 }}>
            <SafeAreaProvider>
                <AuthProvider>
                    <ProfileProvider>
                        <StockProvider>
                            <ProductProvider>
                                <HistoryProvider>
                                    <NotificationProvider>
                                        <StatusBar style="auto" />
                                        <AppWithVoice />
                                    </NotificationProvider>
                                </HistoryProvider>
                            </ProductProvider>
                        </StockProvider>
                    </ProfileProvider>
                </AuthProvider>
            </SafeAreaProvider>
        </GestureHandlerRootView>
    );
}
