// Contexte d'authentification — migré depuis Next.js
// Utilise AsyncStorage au lieu de localStorage + AppState au lieu de visibilityChange
import React, { createContext, useContext, useState, useEffect } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';
import { supabase } from '@/src/lib/supabase';
import { storage } from '@/src/lib/storage';
import { connectSocket, disconnectSocket } from '@/src/lib/socket';

export interface User {
    id: string;
    phoneNumber: string;
    role: 'MERCHANT' | 'SUPERVISOR' | 'PRODUCER' | 'COOPERATIVE' | 'FIELD_AGENT';
    name: string;
}

interface AuthContextType {
    user: User | null;
    isAuthenticated: boolean;
    isLocked: boolean;
    login: (phoneNumber: string, pin: string) => Promise<boolean>;
    signup: (name: string, phoneNumber: string, pin: string, role: User['role']) => Promise<boolean>;
    unlock: (pin: string) => Promise<boolean>;
    logout: () => void;
    setLocked: (locked: boolean) => void;
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

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [user, setUser] = useState<User | null>(null);
    const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
    const [isLocked, setIsLocked] = useState<boolean>(false);

    // Restaurer la session au démarrage
    useEffect(() => {
        const checkUser = async () => {
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
                        await storage.setItem('auth_user', JSON.stringify(updatedUser));
                        connectSocket(updatedUser.id, updatedUser.name, updatedUser.role);
                    }
                } catch (err) {
                    console.error('[Auth] Sync profile error:', err);
                }

                const wasLocked = await storage.getItem('app_locked');
                setIsLocked(wasLocked === 'true');
            }
        };
        checkUser();
    }, []);

    // Verrouillage automatique après 60s en arrière-plan (AppState remplace visibilitychange)
    useEffect(() => {
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
            subscription.remove();
            if (lockTimeout) clearTimeout(lockTimeout);
        };
    }, [isAuthenticated]);

    const login = async (phoneNumber: string, pin: string): Promise<boolean> => {
        try {
            const { data, error } = await supabase
                .from('profiles')
                .select('*')
                .eq('phone_number', phoneNumber)
                .eq('pin', pin)
                .single();

            if (error || !data) {
                // Mode démo
                if (phoneNumber === '0000' && pin === '0000') {
                    const demoUser: User = { id: 'admin-001', phoneNumber: '0000', role: 'SUPERVISOR', name: 'Superviseur' };
                    await handleAuthSuccess(demoUser);
                    return true;
                }
                return false;
            }

            const userData: User = {
                id: data.id,
                phoneNumber: data.phone_number,
                role: normalizeRole(data.role),
                name: data.full_name,
            };

            await handleAuthSuccess(userData);
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

            if (data && role === 'MERCHANT') {
                await supabase.from('stores').insert([{
                    owner_id: data.id,
                    name: 'Ma Boutique',
                    status: 'ACTIVE',
                }]);
            }

            return login(phoneNumber, pin);
        } catch (err: any) {
            console.error('[Auth] Signup error:', err.message);
            return false;
        }
    };

    const unlock = async (pin: string): Promise<boolean> => {
        if (!user) return false;

        // Mode démo
        if (user.phoneNumber === '0000' && pin === '0000') {
            setIsLocked(false);
            await storage.setItem('app_locked', 'false');
            return true;
        }

        try {
            const { data } = await supabase
                .from('profiles')
                .select('id')
                .eq('phone_number', user.phoneNumber)
                .eq('pin', pin)
                .single();

            if (data) {
                setIsLocked(false);
                await storage.setItem('app_locked', 'false');
                return true;
            }
        } catch (err) {
            console.error('[Auth] Unlock error:', err);
        }
        return false;
    };

    const logout = async () => {
        disconnectSocket();
        setUser(null);
        setIsAuthenticated(false);
        setIsLocked(false);
        // Efface toutes les données persistées (session, profil actif, notifications…)
        await AsyncStorage.clear();
        // replace() supprime tout l'historique de navigation → impossible de revenir en arrière
        router.replace('/(auth)/login');
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
            isAuthenticated,
            isLocked,
            login,
            signup,
            unlock,
            logout,
            setLocked: setIsLocked,
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
