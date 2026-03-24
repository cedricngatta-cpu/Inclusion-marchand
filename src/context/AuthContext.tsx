// Contexte d'authentification — cache offline unifié
import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { Alert, AppState, AppStateStatus, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import { router } from 'expo-router';
import { supabase } from '@/src/lib/supabase';
import { storage } from '@/src/lib/storage';
import { connectSocket, disconnectSocket } from '@/src/lib/socket';
import { offlineCache, CACHE_KEYS, CACHE_TTL, isOfflineEligible } from '@/src/lib/offlineCache';
import { prefetchAllData } from '@/src/lib/dataPrefetch';

export interface User {
    id: string;
    phoneNumber: string;
    role: 'MERCHANT' | 'SUPERVISOR' | 'PRODUCER' | 'COOPERATIVE' | 'FIELD_AGENT';
    name: string;
}

interface AuthContextType {
    user: User | null;
    profile: Record<string, any> | null;
    isLoading: boolean;
    isAuthenticated: boolean;
    isLocked: boolean;
    mustChangePin: boolean;
    sessionKey: number;
    login: (phoneNumber: string, pin: string) => Promise<boolean>;
    signup: (name: string, phoneNumber: string, pin: string, role: User['role']) => Promise<boolean>;
    unlock: (pin: string) => Promise<boolean>;
    logout: () => Promise<void>;
    setLocked: (locked: boolean) => void;
    setMustChangePin: (v: boolean) => void;
    updatePin: (newPin: string) => Promise<boolean>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Normalise les valeurs de rôle Supabase (fr minuscule) vers les enum TypeScript
const normalizeRole = (raw: string | undefined): User['role'] => {
    switch ((raw ?? '').toLowerCase()) {
        case 'supervisor':
        case 'admin':
        case 'superviseur':
            return 'SUPERVISOR';
        case 'producer':
        case 'producteur':
            return 'PRODUCER';
        case 'cooperative':
        case 'coopérative':
            return 'COOPERATIVE';
        case 'field_agent':
        case 'agent':
        case 'agent_terrain':
            return 'FIELD_AGENT';
        case 'merchant':
        case 'marchand':
        case 'commercant':
        default:
            return 'MERCHANT';
    }
};

// Hash SHA-256 du PIN (web) ou hash 32-bit (mobile fallback)
async function hashPin(pin: string): Promise<string> {
    const salted = 'julaba_salt_' + pin;
    if (Platform.OS === 'web' && typeof window !== 'undefined' && window.crypto?.subtle) {
        const data = new TextEncoder().encode(salted);
        const buf = await crypto.subtle.digest('SHA-256', data);
        return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
    }
    // Mobile fallback : hash 32-bit simple (suffisant pour PIN 4 chiffres + salt)
    let h = 0;
    for (let i = 0; i < salted.length; i++) {
        h = ((h << 5) - h) + salted.charCodeAt(i);
        h = h & h;
    }
    return 'h_' + Math.abs(h).toString(36);
}

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [user, setUser]               = useState<User | null>(null);
    const [profile, setProfile]         = useState<Record<string, any> | null>(null);
    const [isLoading, setIsLoading]     = useState<boolean>(true);
    const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
    const [isLocked, setIsLocked]       = useState<boolean>(false);
    const [mustChangePin, setMustChangePin] = useState<boolean>(false);
    const [sessionKey, setSessionKey]   = useState<number>(0);

    // Protection brute-force
    const loginAttemptsRef = useRef<Record<string, { count: number; blockedUntil: number }>>({});

    const checkBruteForce = (key: string): string | null => {
        const entry = loginAttemptsRef.current[key];
        if (!entry) return null;
        if (entry.blockedUntil > Date.now()) {
            const remainSec = Math.ceil((entry.blockedUntil - Date.now()) / 1000);
            const remainMin = Math.ceil(remainSec / 60);
            return `Trop de tentatives. Réessayez dans ${remainMin} min.`;
        }
        if (entry.count >= 10) {
            entry.blockedUntil = Date.now() + 30 * 60_000;
            return 'Compte bloqué pendant 30 minutes.';
        }
        return null;
    };

    const recordFailedAttempt = (key: string) => {
        if (!loginAttemptsRef.current[key]) {
            loginAttemptsRef.current[key] = { count: 0, blockedUntil: 0 };
        }
        loginAttemptsRef.current[key].count++;
        if (loginAttemptsRef.current[key].count >= 5 && loginAttemptsRef.current[key].blockedUntil === 0) {
            loginAttemptsRef.current[key].blockedUntil = Date.now() + 5 * 60_000;
        }
    };

    const clearAttempts = (key: string) => {
        delete loginAttemptsRef.current[key];
    };

    // Restaurer la session au démarrage
    useEffect(() => {
        const checkUser = async () => {
            try {
                const storedUser = await storage.getItem('auth_user');
                if (storedUser) {
                    const parsed = JSON.parse(storedUser) as User;
                    setUser(parsed);
                    setIsAuthenticated(true);
                    connectSocket(parsed.id, parsed.name, parsed.role);

                    // Synchroniser le profil depuis Supabase
                    try {
                        const { data } = await supabase
                            .from('profiles')
                            .select('*')
                            .eq('phone_number', parsed.phoneNumber)
                            .single();

                        if (data) {
                            const updatedUser: User = {
                                id: data.id,
                                phoneNumber: data.phone_number,
                                role: normalizeRole(data.role),
                                name: data.full_name,
                            };
                            setUser(updatedUser);
                            setProfile(data);
                            await storage.setItem('auth_user', JSON.stringify(updatedUser));
                            await offlineCache.set(CACHE_KEYS.profile(updatedUser.id), data, CACHE_TTL.CRITICAL);
                            connectSocket(updatedUser.id, updatedUser.name, updatedUser.role);
                        }
                    } catch (err) {
                        console.error('[Auth] Sync profile error:', err);
                        // Fallback : restaurer le profil depuis le cache offline
                        const cachedProfile = await offlineCache.get<Record<string, any>>(CACHE_KEYS.profile(parsed.id));
                        if (cachedProfile) setProfile(cachedProfile.data);
                    }

                    const wasLocked = await storage.getItem('app_locked');
                    setIsLocked(wasLocked === 'true');
                } else {
                    // Pas de session active — tenter l'auto-login offline pour marchands/producteurs
                    await tryOfflineAutoLogin();
                }
            } finally {
                setIsLoading(false);
            }
        };
        checkUser();
    }, []);

    // Auto-login offline : restaurer la session depuis le cache local (marchands/producteurs)
    const tryOfflineAutoLogin = async () => {
        try {
            const raw = await storage.getItem('julaba_offline_auth');
            if (!raw) return;
            const cached = JSON.parse(raw);
            if (!cached?.user || !cached?.role) return;

            // Seuls les marchands/producteurs peuvent se connecter hors ligne
            if (!isOfflineEligible(cached.role)) return;

            // Verifier que les donnees ne sont pas trop vieilles (30 jours max)
            if (Date.now() - (cached.timestamp ?? 0) > 30 * 24 * 3600 * 1000) return;

            const userData = cached.user as User;
            setUser(userData);
            setIsAuthenticated(true);
            setProfile(cached.profile ?? null);
            await storage.setItem('auth_user', JSON.stringify(userData));
            console.log('[Auth] Auto-login offline:', userData.name, '| role:', userData.role);
        } catch (err) {
            console.warn('[Auth] tryOfflineAutoLogin error:', err);
        }
    };

    // Login offline explicite (quand Supabase échoue) — marchands/producteurs uniquement
    const tryOfflineLogin = async (phoneNumber: string, pin: string): Promise<boolean> => {
        try {
            const raw = await storage.getItem('julaba_offline_auth');
            if (!raw) return false;
            const cached = JSON.parse(raw);
            if (!cached?.phone || !cached?.pinHash || !cached?.user) return false;
            if (!isOfflineEligible(cached.role)) return false;
            // Verifier le PIN (hash comparé)
            const inputHash = await hashPin(pin);
            if (cached.phone !== phoneNumber || cached.pinHash !== inputHash) return false;
            // Donnees pas trop vieilles (30 jours)
            if (Date.now() - (cached.timestamp ?? 0) > 30 * 24 * 3600 * 1000) return false;

            const userData = cached.user as User;
            setProfile(cached.profile ?? null);
            await handleAuthSuccess(userData);
            console.log('[Auth] Login offline OK:', userData.name);
            return true;
        } catch {
            return false;
        }
    };

    // Verrouillage automatique après 60s en arrière-plan (Android/iOS uniquement — AppState non dispo sur web)
    useEffect(() => {
        if (Platform.OS === 'web') return;
        let lockTimeout: ReturnType<typeof setTimeout> | null = null;

        const handleAppStateChange = (nextState: AppStateStatus) => {
            if (nextState === 'background' && isAuthenticated) {
                lockTimeout = setTimeout(async () => {
                    setIsLocked(true);
                    await storage.setItem('app_locked', 'true');
                }, 60000);
            } else if (nextState === 'active') {
                if (lockTimeout) clearTimeout(lockTimeout);
            }
        };

        const subscription = AppState.addEventListener('change', handleAppStateChange);
        return () => {
            subscription?.remove();
            if (lockTimeout) clearTimeout(lockTimeout);
        };
    }, [isAuthenticated]);

    const login = async (phoneNumber: string, pin: string): Promise<boolean> => {
        const bruteMsg = checkBruteForce(phoneNumber);
        if (bruteMsg) { Alert.alert('Bloqué', bruteMsg); return false; }

        try {
            const { data, error } = await supabase
                .from('profiles')
                .select('*')
                .eq('phone_number', phoneNumber)
                .eq('pin', pin)
                .single();

            if (error || !data) {
                console.warn('[Auth] Login Supabase échec:', error?.message ?? 'profil introuvable', '— phone:', phoneNumber);
                // Mode démo — désactivé en production
                if (__DEV__ && phoneNumber === '0000' && pin === '0000') {
                    console.warn('[Auth] ⚠️ Mode DEMO activé — user.id = admin-001 (pas un UUID réel). Exécutez le seed pour des données réelles.');
                    const demoUser: User = { id: 'admin-001', phoneNumber: '0000', role: 'SUPERVISOR', name: 'Superviseur' };
                    await handleAuthSuccess(demoUser);
                    await storage.setItem('cached_pin_hash', await hashPin(pin));
                    clearAttempts(phoneNumber);
                    return true;
                }
                // Tentative login offline pour marchands/producteurs
                const offlineOk = await tryOfflineLogin(phoneNumber, pin);
                if (offlineOk) { clearAttempts(phoneNumber); return true; }
                recordFailedAttempt(phoneNumber);
                return false;
            }

            const userData: User = {
                id: data.id,
                phoneNumber: data.phone_number,
                role: normalizeRole(data.role),
                name: data.full_name,
            };
            console.log('[Auth] ✅ Login OK:', userData.name, '| role:', userData.role, '| id:', userData.id);

            setProfile(data);
            await offlineCache.set(CACHE_KEYS.profile(userData.id), data, CACHE_TTL.CRITICAL);
            if (data.pin === '0101') setMustChangePin(true);
            await handleAuthSuccess(userData);
            await storage.setItem('cached_pin_hash', await hashPin(pin)); // Cache PIN hashé pour déverrouillage offline

            // Sauvegarder les données d'auth offline pour marchands/producteurs
            if (isOfflineEligible(userData.role)) {
                await storage.setItem('julaba_offline_auth', JSON.stringify({
                    phone: phoneNumber,
                    pinHash: await hashPin(pin),
                    profile: data,
                    user: userData,
                    role: userData.role,
                    timestamp: Date.now(),
                }));

                // Pre-charger toutes les donnees en background (non bloquant)
                const { data: store } = await supabase
                    .from('stores').select('id').eq('owner_id', userData.id).maybeSingle();
                if (store) {
                    prefetchAllData(store.id, userData.id, userData.role).catch(() => {});
                }
            }

            clearAttempts(phoneNumber);
            return true;
        } catch (err) {
            console.error('[Auth] Login error:', err);
            return false;
        }
    };

    const handleAuthSuccess = async (userData: User) => {
        setUser(userData);
        setIsAuthenticated(true);
        setIsLocked(false);
        await storage.setItem('auth_user', JSON.stringify(userData));
        await storage.setItem('app_locked', 'false');
        // Connexion socket realtime avec rôle
        connectSocket(userData.id, userData.name, userData.role);
    };

    const signup = async (name: string, phoneNumber: string, pin: string, role: User['role']): Promise<boolean> => {
        try {
            const { data } = await supabase
                .from('profiles')
                .insert([{ full_name: name, phone_number: phoneNumber, pin, role }])
                .select()
                .single();

            if (data && (role === 'MERCHANT' || role === 'PRODUCER')) {
                // Vérifier si le store existe déjà avant de créer
                const { data: existingStore } = await supabase
                    .from('stores')
                    .select('id')
                    .eq('owner_id', data.id)
                    .maybeSingle();

                if (!existingStore) {
                    await supabase.from('stores').insert([{
                        owner_id: data.id,
                        name: role === 'PRODUCER' ? 'Ma Ferme' : 'Ma Boutique',
                        store_type: role === 'PRODUCER' ? 'PRODUCER' : 'RETAILER',
                        status: 'ACTIVE',
                    }]);
                }
            }

            return login(phoneNumber, pin);
        } catch (err: any) {
            console.error('[Auth] Signup error:', err.message);
            return false;
        }
    };

    const unlock = async (pin: string): Promise<boolean> => {
        if (!user) return false;

        const unlockKey = user.phoneNumber || 'unlock';
        const bruteMsgUnlock = checkBruteForce(unlockKey);
        if (bruteMsgUnlock) { Alert.alert('Bloqué', bruteMsgUnlock); return false; }

        // Mode démo — désactivé en production
        if (__DEV__ && user.phoneNumber === '0000' && pin === '0000') {
            setIsLocked(false);
            await storage.setItem('app_locked', 'false');
            clearAttempts(unlockKey);
            return true;
        }

        const doUnlock = async () => {
            setIsLocked(false);
            await storage.setItem('app_locked', 'false');
            clearAttempts(unlockKey);
        };

        try {
            const netState = await NetInfo.fetch();

            if (netState.isConnected) {
                // En ligne : vérifier via Supabase
                const { data } = await supabase
                    .from('profiles')
                    .select('id')
                    .eq('phone_number', user.phoneNumber)
                    .eq('pin', pin)
                    .single();

                if (data) {
                    await storage.setItem('cached_pin_hash', await hashPin(pin));
                    await doUnlock();
                    return true;
                }
                recordFailedAttempt(unlockKey);
                return false;
            } else {
                // Hors-ligne : comparer avec le PIN hashé au dernier login
                const cachedHash = await storage.getItem('cached_pin_hash');
                const inputHash = await hashPin(pin);
                if (cachedHash && cachedHash === inputHash) {
                    await doUnlock();
                    return true;
                }
                recordFailedAttempt(unlockKey);
                return false;
            }
        } catch (err) {
            console.error('[Auth] Unlock error:', err);
            // Fallback cache si erreur réseau
            const cachedHash = await storage.getItem('cached_pin_hash');
            const inputHash = await hashPin(pin);
            if (cachedHash && cachedHash === inputHash) {
                await doUnlock();
                return true;
            }
            recordFailedAttempt(unlockKey);
            return false;
        }
    };

    const logout = async () => {
        disconnectSocket();
        setUser(null);
        setIsAuthenticated(false);
        setIsLocked(false);
        // Efface toutes les données persistées (session, profil actif, notifications…)
        await AsyncStorage.clear();
        // 1. Naviguer vers login immédiatement
        router.replace('/(auth)/login');
        // 2. Après un tick : incrémenter sessionKey pour forcer le remontage complet
        //    du Stack — détruit toute l'historique de navigation de la session précédente
        setTimeout(() => setSessionKey(k => k + 1), 50);
    };

    const updatePin = async (newPin: string): Promise<boolean> => {
        if (!user) return false;
        try {
            const { error } = await supabase
                .from('profiles')
                .update({ pin: newPin })
                .eq('id', user.id);

            if (error) throw error;
            return true;
        } catch (err) {
            console.error('[Auth] Update PIN error:', err);
            return false;
        }
    };

    return (
        <AuthContext.Provider value={{
            user,
            profile,
            isLoading,
            isAuthenticated,
            isLocked,
            mustChangePin,
            sessionKey,
            login,
            signup,
            unlock,
            logout,
            setLocked: setIsLocked,
            setMustChangePin,
            updatePin,
        }}>
            {children}
        </AuthContext.Provider>
    );
};

export const useAuth = () => {
    const context = useContext(AuthContext);
    if (!context) throw new Error('useAuth must be used within an AuthProvider');
    return context;
};
