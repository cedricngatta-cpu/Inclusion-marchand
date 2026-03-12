// Layout racine — point d'entrée expo-router
import React, { useEffect } from 'react';
import { View, Text, Platform, useWindowDimensions, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { Stack, usePathname, useRouter } from 'expo-router';
import {
    Home, ShoppingBag, Package, Store, Truck, TrendingUp,
    BarChart2, DollarSign, BookOpen, ShoppingCart, Activity,
    Bell, User, UserPlus, MapPin, AlertTriangle, CheckCircle,
    LogOut, Users, PieChart, FileText,
} from 'lucide-react-native';
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
import { ChangePinModal } from '@/src/components/ChangePinModal';

// ── Sidebar desktop ──────────────────────────────────────────────────────────

type SidebarItem = { label: string; href: string; path: string; icon: React.ReactNode };

function getRoleLabel(role: string): string {
    switch (role) {
        case 'MERCHANT':    return 'Marchand';
        case 'PRODUCER':    return 'Producteur';
        case 'FIELD_AGENT': return 'Agent Terrain';
        case 'COOPERATIVE': return 'Coopérative';
        case 'SUPERVISOR':  return 'Administrateur';
        default:            return role;
    }
}

function getMenuItems(role: string): SidebarItem[] {
    const s = 20;
    const ic = '#6B7280';
    const common: SidebarItem[] = [
        { label: 'Notifications', href: '/(tabs)/notifications', path: '/notifications', icon: <Bell size={s} color={ic} /> },
        { label: 'Profil',        href: '/(tabs)/profil',         path: '/profil',         icon: <User size={s} color={ic} /> },
    ];
    switch (role) {
        case 'MERCHANT': return [
            { label: 'Tableau de bord',  href: '/(tabs)/commercant',    path: '/commercant',    icon: <Home size={s} color={ic} /> },
            { label: 'Vendre',           href: '/(tabs)/vendre',         path: '/vendre',         icon: <ShoppingBag size={s} color={ic} /> },
            { label: 'Stock',            href: '/(tabs)/stock',          path: '/stock',          icon: <Package size={s} color={ic} /> },
            { label: 'Bilan',            href: '/(tabs)/bilan',          path: '/bilan',          icon: <BarChart2 size={s} color={ic} /> },
            { label: 'Marché',           href: '/(tabs)/marche',         path: '/marche',         icon: <Store size={s} color={ic} /> },
            { label: 'Mes Commandes',    href: '/(tabs)/mes-commandes',  path: '/mes-commandes',  icon: <Truck size={s} color={ic} /> },
            { label: 'Achats Groupés',   href: '/(tabs)/achats-groupes', path: '/achats-groupes', icon: <ShoppingCart size={s} color={ic} /> },
            { label: 'Carnet de dettes', href: '/(tabs)/carnet',         path: '/carnet',         icon: <BookOpen size={s} color={ic} /> },
            { label: 'Finances',         href: '/(tabs)/finance',        path: '/finance',        icon: <DollarSign size={s} color={ic} /> },
            { label: 'Revenus',          href: '/(tabs)/revenus',        path: '/revenus',        icon: <TrendingUp size={s} color={ic} /> },
            ...common,
        ];
        case 'PRODUCER': return [
            { label: 'Tableau de bord', href: '/producteur',            path: '/producteur',            icon: <Home size={s} color={ic} /> },
            { label: 'Mes Produits',    href: '/producteur/stock',      path: '/producteur/stock',      icon: <Package size={s} color={ic} /> },
            { label: 'Publier',         href: '/producteur/publier',    path: '/producteur/publier',    icon: <Store size={s} color={ic} /> },
            { label: 'Commandes',       href: '/producteur/commandes',  path: '/producteur/commandes',  icon: <ShoppingBag size={s} color={ic} /> },
            { label: 'Livraisons',      href: '/producteur/livraisons', path: '/producteur/livraisons', icon: <Truck size={s} color={ic} /> },
            { label: 'Revenus',         href: '/producteur/revenus',    path: '/producteur/revenus',    icon: <TrendingUp size={s} color={ic} /> },
            ...common,
        ];
        case 'FIELD_AGENT': return [
            { label: 'Tableau de bord', href: '/agent',            path: '/agent',            icon: <Home size={s} color={ic} /> },
            { label: 'Enrôler',         href: '/agent/enrolement', path: '/agent/enrolement', icon: <UserPlus size={s} color={ic} /> },
            { label: 'Mon Secteur',     href: '/agent/secteur',    path: '/agent/secteur',    icon: <MapPin size={s} color={ic} /> },
            { label: 'Activités',       href: '/agent/activites',  path: '/agent/activites',  icon: <Activity size={s} color={ic} /> },
            { label: 'Conformité',      href: '/agent/conformite', path: '/agent/conformite', icon: <AlertTriangle size={s} color={ic} /> },
            ...common,
        ];
        case 'COOPERATIVE': return [
            { label: 'Tableau de bord', href: '/cooperative',              path: '/cooperative',              icon: <Home size={s} color={ic} /> },
            { label: 'Validations',     href: '/cooperative/demandes',     path: '/cooperative/demandes',     icon: <CheckCircle size={s} color={ic} /> },
            { label: 'Membres',         href: '/cooperative/membres',      path: '/cooperative/membres',      icon: <Users size={s} color={ic} /> },
            { label: 'Achats Groupés',  href: '/cooperative/achats',       path: '/cooperative/achats',       icon: <ShoppingCart size={s} color={ic} /> },
            { label: 'Performances',    href: '/cooperative/performances', path: '/cooperative/performances', icon: <BarChart2 size={s} color={ic} /> },
            { label: 'Analyses',        href: '/cooperative/analyses',     path: '/cooperative/analyses',     icon: <PieChart size={s} color={ic} /> },
            ...common,
        ];
        case 'SUPERVISOR': return [
            { label: 'Tableau de bord', href: '/admin',              path: '/admin',              icon: <Home size={s} color={ic} /> },
            { label: 'Utilisateurs',    href: '/admin/utilisateurs', path: '/admin/utilisateurs', icon: <Users size={s} color={ic} /> },
            { label: 'Transactions',    href: '/admin/transactions', path: '/admin/transactions', icon: <DollarSign size={s} color={ic} /> },
            { label: 'Enrôlements',     href: '/admin/enrolements',  path: '/admin/enrolements',  icon: <FileText size={s} color={ic} /> },
            ...common,
        ];
        default: return common;
    }
}

function WebSidebar() {
    const { user, logout } = useAuth();
    const router = useRouter();
    const pathname = usePathname();

    if (!user) return null;

    const items = getMenuItems(user.role);
    const ACTIVE = '#059669';

    return (
        <View style={sidebarSt.sidebar}>
            {/* Logo & identité */}
            <View style={sidebarSt.logoArea}>
                <View style={sidebarSt.logoSquare}>
                    <Text style={sidebarSt.logoText}>IM</Text>
                </View>
                <View style={{ flex: 1 }}>
                    <Text style={sidebarSt.appName} numberOfLines={1}>Inclusion Marchand</Text>
                    <Text style={sidebarSt.roleLabel} numberOfLines={1}>{getRoleLabel(user.role)}</Text>
                </View>
            </View>

            {/* Items de navigation */}
            <ScrollView style={sidebarSt.menuScroll} showsVerticalScrollIndicator={false}>
                {items.map((item) => {
                    const DASHBOARD_PATHS = ['/admin', '/(tabs)/commercant', '/producteur', '/cooperative', '/agent'];
                    const active = DASHBOARD_PATHS.includes(item.path)
                        ? pathname === item.path
                        : pathname === item.path || pathname.startsWith(item.path + '/');
                    return (
                        <TouchableOpacity
                            key={item.href + item.label}
                            style={[sidebarSt.menuItem, active && sidebarSt.menuItemActive]}
                            onPress={() => router.push(item.href as any)}
                            activeOpacity={0.7}
                        >
                            {React.cloneElement(item.icon as React.ReactElement, {
                                color: active ? ACTIVE : '#6B7280',
                            })}
                            <Text style={[sidebarSt.menuLabel, active && sidebarSt.menuLabelActive]}>
                                {item.label}
                            </Text>
                        </TouchableOpacity>
                    );
                })}
            </ScrollView>

            {/* Pied : infos utilisateur + déconnexion */}
            <View style={sidebarSt.footer}>
                <Text style={sidebarSt.footerName} numberOfLines={1}>{user.name}</Text>
                <Text style={sidebarSt.footerPhone} numberOfLines={1}>{user.phoneNumber}</Text>
                <TouchableOpacity style={sidebarSt.logoutBtn} onPress={logout} activeOpacity={0.8}>
                    <LogOut size={15} color="#DC2626" />
                    <Text style={sidebarSt.logoutText}>Déconnexion</Text>
                </TouchableOpacity>
            </View>
        </View>
    );
}

const sidebarSt = StyleSheet.create({
    sidebar: {
        width: 250,
        backgroundColor: '#FFFFFF',
        borderRightWidth: 1,
        borderRightColor: '#E5E7EB',
        flexDirection: 'column',
    },
    logoArea: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        paddingHorizontal: 16,
        paddingVertical: 20,
        borderBottomWidth: 1,
        borderBottomColor: '#F3F4F6',
    },
    logoSquare: {
        width: 40, height: 40,
        backgroundColor: '#059669',
        borderRadius: 10,
        alignItems: 'center', justifyContent: 'center',
        flexShrink: 0,
    },
    logoText:   { fontSize: 16, fontWeight: '900', color: '#FFFFFF' },
    appName:    { fontSize: 13, fontWeight: '700', color: '#1F2937' },
    roleLabel:  { fontSize: 11, color: '#6B7280', marginTop: 1 },
    menuScroll: { flex: 1 },
    menuItem: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        paddingHorizontal: 16,
        paddingVertical: 11,
        marginHorizontal: 8,
        marginVertical: 1,
        borderRadius: 8,
    },
    menuItemActive: {
        backgroundColor: '#ECFDF5',
        borderLeftWidth: 3,
        borderLeftColor: '#059669',
        paddingLeft: 13,
    },
    menuLabel:       { fontSize: 13, fontWeight: '500', color: '#374151', flex: 1 },
    menuLabelActive: { color: '#059669', fontWeight: '600' },
    footer: {
        padding: 16,
        borderTopWidth: 1,
        borderTopColor: '#F3F4F6',
    },
    footerName:  { fontSize: 13, fontWeight: '700', color: '#1F2937' },
    footerPhone: { fontSize: 11, color: '#6B7280', marginTop: 2, marginBottom: 10 },
    logoutBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        paddingVertical: 8,
        paddingHorizontal: 12,
        backgroundColor: '#FEF2F2',
        borderRadius: 8,
    },
    logoutText: { fontSize: 12, fontWeight: '600', color: '#DC2626' },
});

// ── Wrapper responsive : sidebar desktop, transparent sur mobile ──────────────
function ResponsiveWrapper({ children }: { children: React.ReactNode }) {
    const { width } = useWindowDimensions();
    const { user, isLocked } = useAuth();
    const pathname = usePathname();
    const isDesktop = Platform.OS === 'web' && width > 768;

    // Pas de sidebar : mobile, non connecté, pages d'auth, ou écran verrouillé
    const isAuthRoute = pathname.startsWith('/(auth)') || pathname === '/login' || pathname === '/signup';

    if (isDesktop && user && !isAuthRoute && !isLocked) {
        return (
            <View style={{ flex: 1, flexDirection: 'row', backgroundColor: '#F9FAFB' }}>
                <WebSidebar />
                <View style={{ flex: 1, overflow: 'hidden' }}>
                    {children}
                </View>
            </View>
        );
    }

    return <>{children}</>;
}

// VoiceButton rendu seulement si connecté et non verrouillé
function AppWithVoice() {
    const { user, isLoading, isLocked, mustChangePin, sessionKey } = useAuth();
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
            {/* Modal bloquant si PIN temporaire 0101 */}
            <ChangePinModal visible={!!mustChangePin} canCancel={false} />
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
                                                <ResponsiveWrapper>
                                                    <AppWithVoice />
                                                </ResponsiveWrapper>
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
