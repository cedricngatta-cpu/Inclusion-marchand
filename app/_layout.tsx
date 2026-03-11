// Layout racine — point d'entrée expo-router
import React, { useEffect } from 'react';
import { View, Text } from 'react-native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider, useAuth } from '@/src/context/AuthContext';
import { setupGlobalErrorHandler, reportRenderError } from '@/src/lib/errorReporter';

// Capture les erreurs JS imprévues pour éviter un écran blanc sans info
class ErrorBoundary extends React.Component<
    { children: React.ReactNode },
    { hasError: boolean }
> {
    state = { hasError: false };
    static getDerivedStateFromError() { return { hasError: true }; }
    componentDidCatch(error: Error, info: React.ErrorInfo) {
        console.error('[ErrorBoundary]', error, info.componentStack);
        reportRenderError('App', error);
    }
    render() {
        if (this.state.hasError) {
            return (
                <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
                    <Text style={{ fontSize: 16, fontWeight: '700', color: '#DC2626', textAlign: 'center' }}>
                        Une erreur inattendue s'est produite.
                    </Text>
                    <Text style={{ fontSize: 13, color: '#6B7280', marginTop: 8, textAlign: 'center' }}>
                        Redémarrez l'application.
                    </Text>
                </View>
            );
        }
        return this.props.children;
    }
}
import { ProfileProvider } from '@/src/context/ProfileContext';
import { StockProvider } from '@/src/context/StockContext';
import { HistoryProvider } from '@/src/context/HistoryContext';
import { ProductProvider } from '@/src/context/ProductContext';
import { NotificationProvider } from '@/src/context/NotificationContext';
import { NetworkProvider } from '@/src/context/NetworkContext';
import { VoiceButtonProvider } from '@/src/context/VoiceButtonContext';
import VoiceButton from '@/src/components/VoiceButton';
import OfflineBanner from '@/src/components/OfflineBanner';
import LockScreen from '@/src/components/LockScreen';

// VoiceButton rendu seulement si connecté et non verrouillé
function AppWithVoice() {
    const { user, isLoading, isLocked, sessionKey } = useAuth();
    return (
        <>
            {/* key={sessionKey} force le remontage complet du Stack à chaque déconnexion,
                détruisant tout l'historique de navigation de la session précédente */}
            <Stack key={sessionKey} screenOptions={{ headerShown: false }}>
                <Stack.Screen name="(auth)" />
                <Stack.Screen name="(tabs)" />
                <Stack.Screen name="producteur" />
                <Stack.Screen name="agent" />
                <Stack.Screen name="cooperative" />
                <Stack.Screen name="admin" />
                <Stack.Screen name="+not-found" />
            </Stack>
            {user && !isLoading && !isLocked && <VoiceButton />}
            <LockScreen />
            <OfflineBanner />
        </>
    );
}

export default function RootLayout() {
    useEffect(() => {
        setupGlobalErrorHandler();
    }, []);

    return (
        <GestureHandlerRootView style={{ flex: 1 }}>
            <SafeAreaProvider>
                <NetworkProvider>
                <AuthProvider>
                    <ProfileProvider>
                        <StockProvider>
                            <ProductProvider>
                                <HistoryProvider>
                                    <NotificationProvider>
                                        <VoiceButtonProvider>
                                            <StatusBar style="auto" />
                                            <ErrorBoundary>
                                                <AppWithVoice />
                                            </ErrorBoundary>
                                        </VoiceButtonProvider>
                                    </NotificationProvider>
                                </HistoryProvider>
                            </ProductProvider>
                        </StockProvider>
                    </ProfileProvider>
                </AuthProvider>
                </NetworkProvider>
            </SafeAreaProvider>
        </GestureHandlerRootView>
    );
}
