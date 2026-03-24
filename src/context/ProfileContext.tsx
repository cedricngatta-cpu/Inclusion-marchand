// Contexte profil boutique — migré depuis Next.js
// localStorage → AsyncStorage, navigator.onLine → NetInfo
import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import { supabase } from '@/src/lib/supabase';
import { storage } from '@/src/lib/storage';
import { useAuth } from './AuthContext';
import { updateSocketStore } from '@/src/lib/socket';

export type StoreType = 'RETAILER' | 'PRODUCER' | 'WHOLESALER';

export interface StoreProfile {
    id: string;
    name: string;
    merchantName: string;
    status: 'ACTIVE' | 'INACTIVE';
    createdAt: number;
    logo?: string;
    ownerRole?: string;
    store_type: StoreType;
}

interface ProfileContextType {
    profiles: StoreProfile[];
    activeProfile: StoreProfile | null;
    addProfile: (profile: Omit<StoreProfile, 'id' | 'createdAt'>) => Promise<void>;
    updateProfile: (id: string, updates: Partial<StoreProfile>) => Promise<void>;
    deleteProfile: (id: string) => Promise<void>;
    setActiveProfile: (id: string) => void;
    refreshProfiles: () => Promise<void>;
}

const ProfileContext = createContext<ProfileContextType | undefined>(undefined);

export const ProfileProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const { user, isAuthenticated } = useAuth();
    const [profiles, setProfiles] = useState<StoreProfile[]>([]);
    const [activeProfileId, setActiveProfileId] = useState<string | null>(null);

    const refreshProfiles = useCallback(async function refresh() {
        if (!user) return;

        // Charger le cache offline d'abord
        const cached = await AsyncStorage.getItem(`profiles_${user.id}`);
        if (cached) {
            const cachedProfiles = JSON.parse(cached);
            setProfiles(cachedProfiles);
            // Continuer avec le fetch Supabase pour la fraîcheur
        }

        let query = supabase.from('stores').select('*, profiles:owner_id(full_name, role)');
        if (user.role !== 'SUPERVISOR') {
            query = query.eq('owner_id', user.id);
        }

        const { data } = await query;
        const netState = await NetInfo.fetch();

        if (data && data.length === 0 && (user.role === 'MERCHANT' || user.role === 'PRODUCER') && netState.isConnected) {
            // Vérifier si le store existe déjà (évite 409 Conflict en boucle)
            const { data: existing } = await supabase
                .from('stores')
                .select('*')
                .eq('owner_id', user.id)
                .maybeSingle();

            if (!existing) {
                const defaultName = user.role === 'PRODUCER' ? 'Ma Ferme' : 'Ma Boutique';
                const defaultType = user.role === 'PRODUCER' ? 'PRODUCER' : 'RETAILER';
                await supabase.from('stores').insert([{
                    owner_id: user.id,
                    name: defaultName,
                    store_type: defaultType,
                    status: 'ACTIVE',
                }]);
            }
            // Recharger une seule fois (pas de récursion infinie)
            const { data: refreshed } = await supabase
                .from('stores')
                .select('*, profiles:owner_id(full_name, role)')
                .eq('owner_id', user.id);
            if (refreshed && refreshed.length > 0) {
                const mapped: StoreProfile[] = refreshed.map(s => ({
                    id: s.id,
                    name: s.name,
                    merchantName: (s.profiles as any)?.full_name || 'Inconnu',
                    ownerRole: (s.profiles as any)?.role || 'MERCHANT',
                    status: s.status || 'ACTIVE',
                    createdAt: new Date(s.created_at).getTime(),
                    logo: s.logo_url,
                    store_type: (s.store_type as StoreType) || 'RETAILER',
                }));
                setProfiles(mapped);
                await AsyncStorage.setItem(`profiles_${user.id}`, JSON.stringify(mapped));
                setActiveProfileId(mapped[0].id);
            }
            return;
        }

        if (data && data.length > 0) {
            const mapped: StoreProfile[] = data.map(s => ({
                id: s.id,
                name: s.name,
                merchantName: (s.profiles as any)?.full_name || 'Inconnu',
                ownerRole: (s.profiles as any)?.role || 'MERCHANT',
                status: s.status || 'ACTIVE',
                createdAt: new Date(s.created_at).getTime(),
                logo: s.logo_url,
                store_type: (s.store_type as StoreType) || 'RETAILER',
            }));
            setProfiles(mapped);
            await AsyncStorage.setItem(`profiles_${user.id}`, JSON.stringify(mapped));

            const savedActiveId = await storage.getItem('active_profile_id');
            if (savedActiveId && mapped.some(p => p.id === savedActiveId)) {
                setActiveProfileId(savedActiveId);
            } else if (mapped.length > 0) {
                setActiveProfileId(mapped[0].id);
            }
        }
    }, [user]);

    useEffect(() => {
        if (isAuthenticated && user) {
            refreshProfiles();
        } else {
            setProfiles([]);
            setActiveProfileId(null);
        }
    }, [isAuthenticated, user, refreshProfiles]);

    const addProfile = useCallback(async (profileData: Omit<StoreProfile, 'id' | 'createdAt'>) => {
        if (!user) return;
        const { data } = await supabase
            .from('stores')
            .insert([{ name: profileData.name, owner_id: user.id, status: profileData.status }])
            .select()
            .single();
        if (data) await refreshProfiles();
    }, [user, refreshProfiles]);

    const updateProfile = useCallback(async (id: string, updates: Partial<StoreProfile>) => {
        const { error } = await supabase
            .from('stores')
            .update({ name: updates.name, status: updates.status, logo_url: updates.logo })
            .eq('id', id);
        if (!error) await refreshProfiles();
    }, [refreshProfiles]);

    const deleteProfile = useCallback(async (id: string) => {
        const { error } = await supabase.from('stores').delete().eq('id', id);
        if (!error) await refreshProfiles();
    }, [refreshProfiles]);

    const setActiveProfile = useCallback(async (id: string) => {
        setActiveProfileId(id);
        await storage.setItem('active_profile_id', id);
    }, []);

    const activeProfile = useMemo(() => profiles.find(p => p.id === activeProfileId) || null, [profiles, activeProfileId]);

    // Rejoindre la room socket de la boutique active
    useEffect(() => {
        if (activeProfile) {
            updateSocketStore(activeProfile.id, activeProfile.name);
        }
    }, [activeProfile?.id]);

    const value = useMemo(() => ({
        profiles, activeProfile, addProfile, updateProfile, deleteProfile, setActiveProfile, refreshProfiles,
    }), [profiles, activeProfile, addProfile, updateProfile, deleteProfile, setActiveProfile, refreshProfiles]);

    return (
        <ProfileContext.Provider value={value}>
            {children}
        </ProfileContext.Provider>
    );
};

export const useProfileContext = () => {
    const context = useContext(ProfileContext);
    if (!context) throw new Error('useProfileContext must be used within a ProfileProvider');
    return context;
};
