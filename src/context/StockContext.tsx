// Contexte stock — cache offline unifié + Supabase
import React, { createContext, useContext, useState, useCallback, useEffect, useRef, useMemo } from 'react';
import NetInfo from '@react-native-community/netinfo';
import { supabase } from '@/src/lib/supabase';
import { useProfileContext } from './ProfileContext';
import { emitEvent, onSocketEvent } from '@/src/lib/socket';
import { useNetwork } from './NetworkContext';
import { offlineQueue } from '@/src/lib/offlineQueue';
import { offlineCache, CACHE_KEYS, CACHE_TTL } from '@/src/lib/offlineCache';

const log = (...args: any[]) => { if (__DEV__) console.log(...args); };

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
    const { isOnline }  = useNetwork();
    const prevIsOnline  = useRef<boolean | null>(null);
    const lastFetched   = useRef<number>(0);

    const fetchStock = useCallback(async (force = false) => {
        if (!activeProfile) return;
        if (!force && lastFetched.current && Date.now() - lastFetched.current < 30000) return;
        const key = CACHE_KEYS.stock(activeProfile.id);

        try {
            // 1. Cache d'abord (instantané)
            const cached = await offlineCache.get<StockLevels>(key);
            if (cached) setStock(cached.data);

            // 2. Puis réseau si online
            if (isOnline) {
                const { data } = await supabase
                    .from('stock')
                    .select('*')
                    .eq('store_id', activeProfile.id);

                if (data) {
                    const levels: StockLevels = {};
                    data.forEach(s => { levels[s.product_id] = s.quantity; });
                    setStock(levels);
                    await offlineCache.set(key, levels, CACHE_TTL.CRITICAL);
                }
            }
        } catch (err) {
            console.error('[StockContext] fetchStock error:', err);
        }
        lastFetched.current = Date.now();
    }, [activeProfile, isOnline]);

    // La sync offline est geree exclusivement par syncManager.ts
    // Au retour de connexion : rafraichir le stock depuis Supabase
    useEffect(() => {
        if (prevIsOnline.current === false && isOnline && activeProfile) {
            fetchStock(true);
        }
        prevIsOnline.current = isOnline;
    }, [isOnline, activeProfile?.id]); // eslint-disable-line

    useEffect(() => {
        let isMounted = true;
        let subscription: ReturnType<typeof supabase.channel> | null = null;

        if (activeProfile) {
            fetchStock();

            // Abonnement realtime Supabase — seulement quand online (evite le spam offline)
            if (isOnline) {
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
            }
        } else {
            setStock({});
        }

        return () => {
            isMounted = false;
            if (subscription) supabase.removeChannel(subscription).catch(console.error);
        };
    }, [activeProfile, fetchStock, isOnline]);

    const updateStock = useCallback(async (productId: string, amount: number) => {
        if (!activeProfile) return;

        const currentQty = stock[productId] || 0;
        const newQty = Math.max(0, currentQty + amount);

        log('[StockContext] updateStock — productId:', productId, 'delta:', amount, 'ancien:', currentQty, '→ nouveau:', newQty);

        // Mise à jour optimiste
        const updatedStock = { ...stock, [productId]: newQty };
        setStock(updatedStock);

        // Cache local via offlineCache
        await offlineCache.set(CACHE_KEYS.stock(activeProfile.id), updatedStock, CACHE_TTL.CRITICAL);

        // Synchroniser si connecté
        log('[StockContext] connecté:', isOnline, '— store_id:', activeProfile.id);

        if (isOnline) {
            const upsertPayload = {
                store_id:   activeProfile.id,
                product_id: productId,
                quantity:   newQty,
                updated_at: new Date().toISOString(),
            };
            log('[StockContext] UPSERT stock payload:', upsertPayload);

            const { error: upsertError } = await supabase.from('stock').upsert(upsertPayload);

            if (upsertError) {
                console.error('[StockContext] ❌ UPSERT stock ERREUR:', upsertError.message, '| code:', upsertError.code);
            } else {
                log('[StockContext] ✅ UPSERT stock OK — productId:', productId, 'qty:', newQty);
            }
        } else {
            console.warn('[StockContext] ⚠️ Hors-ligne — stock sauvegardé localement uniquement');
            // Enregistrer dans la file d'attente pour sync à la reconnexion
            await offlineQueue.setStockUpdate(activeProfile.id, productId, newQty);
        }

        // Diffusion realtime Socket.io (après Supabase)
        emitEvent('stock-update', {
            storeId:     activeProfile.id,
            productId,
            productName: productId,
            newQty,
        });
        log('[StockContext] emitEvent stock-update envoyé — productId:', productId, 'newQty:', newQty);
    }, [activeProfile, stock]);

    // Listener Socket.io : mises à jour stock depuis l'assistant vocal ou un autre appareil
    useEffect(() => {
        if (!activeProfile) return;
        const unsubscribe = onSocketEvent('stock-update', ({ storeId }) => {
            // Supabase first : recharger depuis la base au lieu d'utiliser newQty du socket
            if (storeId !== activeProfile.id) return;
            fetchStock();
        });
        return unsubscribe;
    }, [activeProfile?.id]);

    const getStockLevel = useCallback((productId: string) => stock[productId] || 0, [stock]);

    const value = useMemo(() => ({
        stock, updateStock, getStockLevel, refreshStock: fetchStock,
    }), [stock, updateStock, getStockLevel, fetchStock]);

    return (
        <StockContext.Provider value={value}>
            {children}
        </StockContext.Provider>
    );
};

export const useStockContext = () => {
    const context = useContext(StockContext);
    if (!context) throw new Error('useStockContext must be used within a StockProvider');
    return context;
};
