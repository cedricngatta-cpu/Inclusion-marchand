// Contexte stock — migré depuis Next.js
// Dexie/IndexedDB → AsyncStorage (simplifié pour Expo Go)
// navigator.onLine → NetInfo
import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import NetInfo from '@react-native-community/netinfo';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '@/src/lib/supabase';
import { useProfileContext } from './ProfileContext';
import { emitEvent } from '@/src/lib/socket';

interface StockLevels {
    [productId: string]: number;
}

interface StockContextType {
    stock: StockLevels;
    updateStock: (productId: string, amount: number) => Promise<void>;
    getStockLevel: (productId: string) => number;
    refreshStock: () => Promise<void>;
}

const StockContext = createContext<StockContextType | undefined>(undefined);

export const StockProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const { activeProfile } = useProfileContext();
    const [stock, setStock] = useState<StockLevels>({});

    const fetchStock = useCallback(async () => {
        if (!activeProfile) return;

        try {
            // 1. Lire le cache local (AsyncStorage remplace Dexie/IndexedDB)
            const cacheKey = `stock_${activeProfile.id}`;
            const cached = await AsyncStorage.getItem(cacheKey);
            if (cached) {
                setStock(JSON.parse(cached));
            }

            // 2. Synchroniser depuis Supabase si connecté
            const netState = await NetInfo.fetch();
            if (netState.isConnected) {
                const { data } = await supabase
                    .from('stock')
                    .select('*')
                    .eq('store_id', activeProfile.id);

                if (data) {
                    const levels: StockLevels = {};
                    data.forEach(s => { levels[s.product_id] = s.quantity; });
                    setStock(levels);
                    await AsyncStorage.setItem(cacheKey, JSON.stringify(levels));
                }
            }
        } catch (err) {
            console.error('[StockContext] fetchStock error:', err);
        }
    }, [activeProfile]);

    useEffect(() => {
        let isMounted = true;
        let subscription: ReturnType<typeof supabase.channel> | null = null;

        if (activeProfile) {
            fetchStock();

            // Abonnement realtime Supabase (fonctionne identiquement sur mobile)
            subscription = supabase
                .channel(`stock_changes_${activeProfile.id}`)
                .on(
                    'postgres_changes' as any,
                    {
                        event: '*',
                        table: 'stock',
                        schema: 'public',
                        filter: `store_id=eq.${activeProfile.id}`,
                    },
                    () => { if (isMounted) fetchStock(); }
                )
                .subscribe();
        } else {
            setStock({});
        }

        return () => {
            isMounted = false;
            if (subscription) supabase.removeChannel(subscription).catch(console.error);
        };
    }, [activeProfile, fetchStock]);

    const updateStock = useCallback(async (productId: string, amount: number) => {
        if (!activeProfile) return;

        const currentQty = stock[productId] || 0;
        const newQty = Math.max(0, currentQty + amount);

        console.log('[StockContext] updateStock — productId:', productId, 'delta:', amount, 'ancien:', currentQty, '→ nouveau:', newQty);

        // Mise à jour optimiste
        const updatedStock = { ...stock, [productId]: newQty };
        setStock(updatedStock);

        // Cache local
        const cacheKey = `stock_${activeProfile.id}`;
        await AsyncStorage.setItem(cacheKey, JSON.stringify(updatedStock));

        // Synchroniser si connecté
        const netState = await NetInfo.fetch();
        console.log('[StockContext] connecté:', netState.isConnected, '— store_id:', activeProfile.id);

        if (netState.isConnected) {
            const upsertPayload = {
                store_id:   activeProfile.id,
                product_id: productId,
                quantity:   newQty,
                updated_at: new Date().toISOString(),
            };
            console.log('[StockContext] UPSERT stock payload:', upsertPayload);

            const { error: upsertError } = await supabase.from('stock').upsert(upsertPayload);

            if (upsertError) {
                console.error('[StockContext] ❌ UPSERT stock ERREUR:', upsertError.message, '| code:', upsertError.code);
            } else {
                console.log('[StockContext] ✅ UPSERT stock OK — productId:', productId, 'qty:', newQty);
            }
        } else {
            console.warn('[StockContext] ⚠️ Hors-ligne — stock sauvegardé localement uniquement');
        }

        // Diffusion realtime Socket.io (après Supabase)
        emitEvent('stock-update', {
            storeId:     activeProfile.id,
            productId,
            productName: productId,
            newQty,
        });
        console.log('[StockContext] emitEvent stock-update envoyé — productId:', productId, 'newQty:', newQty);
    }, [activeProfile, stock]);

    const getStockLevel = useCallback((productId: string) => stock[productId] || 0, [stock]);

    return (
        <StockContext.Provider value={{ stock, updateStock, getStockLevel, refreshStock: fetchStock }}>
            {children}
        </StockContext.Provider>
    );
};

export const useStockContext = () => {
    const context = useContext(StockContext);
    if (!context) throw new Error('useStockContext must be used within a StockProvider');
    return context;
};
