// Contexte historique transactions — cache offline unifié + Supabase
import React, { createContext, useContext, useState, useEffect, useMemo, useRef } from 'react';
import NetInfo from '@react-native-community/netinfo';
import { supabase } from '@/src/lib/supabase';
import { useProfileContext } from './ProfileContext';
import { emitEvent, onSocketEvent } from '@/src/lib/socket';
import { useNetwork } from './NetworkContext';
import { offlineQueue } from '@/src/lib/offlineQueue';
import { offlineCache, CACHE_KEYS, CACHE_TTL } from '@/src/lib/offlineCache';

export type TransactionType = 'VENTE' | 'LIVRAISON' | 'RETRAIT';

export interface Transaction {
    id: string;
    type: TransactionType;
    productId: string;
    productName: string;
    quantity: number;
    price: number;
    unitPrice?: number;
    timestamp: number;
    clientName?: string;
    status?: 'PAYÉ' | 'DETTE' | 'MOMO';
    operator?: 'ORANGE' | 'MTN' | 'WAVE' | 'MOOV';
    clientPhone?: string;
    source?: 'manual' | 'voice' | 'voice_offline';
}

interface HistoryContextType {
    history: Transaction[];
    balance: number;
    addTransaction: (transaction: Omit<Transaction, 'id' | 'timestamp'>) => Promise<void>;
    markAsPaid: (transactionId: string) => Promise<void>;
    clearHistory: () => Promise<void>;
    todayTransactions: Transaction[];
    refreshHistory: () => Promise<void>;
}

const HistoryContext = createContext<HistoryContextType | undefined>(undefined);

// Génère un UUID v4 valide — compatible avec les colonnes UUID de Supabase
const generateUUID = (): string =>
    'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
        const r = Math.random() * 16 | 0;
        return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
    });

export const HistoryProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const { activeProfile } = useProfileContext();
    const [history, setHistory] = useState<Transaction[]>([]);
    const { isOnline }     = useNetwork();
    const prevIsOnline     = useRef<boolean | null>(null);

    const cacheKey = activeProfile ? CACHE_KEYS.transactions(activeProfile.id) : null;

    const fetchHistory = async () => {
        if (!activeProfile || !cacheKey) return;

        // 1. Cache d'abord (instantané)
        const cached = await offlineCache.get<Transaction[]>(cacheKey);
        if (cached) setHistory(cached.data);

        // 2. Puis réseau si online
        if (isOnline) {
            try {
                const { data } = await supabase
                    .from('transactions')
                    .select('*')
                    .eq('store_id', activeProfile.id)
                    .order('created_at', { ascending: false })
                    .limit(500);

                if (data && data.length > 0) {
                    const mapped: Transaction[] = data.map(t => ({
                        id: t.id,
                        type: t.type,
                        productId: t.product_id,
                        productName: t.product_name,
                        quantity: t.quantity,
                        price: t.price,
                        unitPrice: t.quantity > 0 ? Math.round(t.price / t.quantity) : t.price,
                        timestamp: new Date(t.created_at).getTime(),
                        clientName: t.client_name,
                        status: t.status,
                        operator: t.operator,
                        clientPhone: t.client_phone,
                        source: t.source ?? 'manual',
                    }));
                    setHistory(mapped);
                    await offlineCache.set(cacheKey, mapped, CACHE_TTL.IMPORTANT);
                }
            } catch (err) {
                console.error('[HistoryContext] fetchHistory network error:', err);
            }
        }
    };

    // Sync hors-ligne au retour de connexion
    useEffect(() => {
        if (prevIsOnline.current === false && isOnline && activeProfile && cacheKey) {
            (async () => {
                const pending = await offlineQueue.getTransactions(activeProfile.id);
                if (!pending.length) return;
                console.log('[HistoryContext] Sync offline:', pending.length, 'transaction(s) en attente...');
                try {
                    const { error } = await supabase
                        .from('transactions')
                        .upsert(pending, { onConflict: 'id' });
                    if (!error) {
                        await offlineQueue.clearTransactions(activeProfile.id);
                        console.log('[HistoryContext] ✅ Sync offline OK');
                        await fetchHistory();
                    }
                } catch (err) {
                    console.error('[HistoryContext] ❌ Sync offline erreur:', err);
                }
            })();
        }
        prevIsOnline.current = isOnline;
    }, [isOnline, activeProfile?.id]); // eslint-disable-line

    useEffect(() => {
        if (!activeProfile) { setHistory([]); return; }

        fetchHistory();

        // Realtime Supabase
        const subscription = supabase
            .channel(`transactions_${activeProfile.id}`)
            .on('postgres_changes' as any, {
                event: '*', schema: 'public', table: 'transactions',
                filter: `store_id=eq.${activeProfile.id}`,
            }, () => fetchHistory())
            .subscribe();

        return () => { supabase.removeChannel(subscription); };
    }, [activeProfile?.id]);

    // Recevoir les ventes des autres appareils en temps réel
    useEffect(() => {
        if (!activeProfile) return;
        const unsubscribe = onSocketEvent('nouvelle-vente', () => {
            // Supabase first : recharger depuis la base au lieu d'utiliser les données du socket
            fetchHistory();
        });
        return unsubscribe;
    }, [activeProfile?.id, cacheKey]);

    const addTransaction = async (transaction: Omit<Transaction, 'id' | 'timestamp'>) => {
        if (!activeProfile || !cacheKey) return;

        // UUID valide pour Supabase (colonne id de type UUID)
        const newTx: Transaction = {
            ...transaction,
            id: generateUUID(),
            timestamp: Date.now(),
            unitPrice: transaction.quantity > 0 ? Math.round(transaction.price / transaction.quantity) : transaction.price,
        };

        console.log('[HistoryContext] addTransaction — id:', newTx.id, 'type:', newTx.type, 'produit:', newTx.productName, 'prix:', newTx.price);

        // Mise à jour optimiste locale (offlineCache)
        const key = cacheKey;
        setHistory(prev => {
            const updated = [newTx, ...prev];
            offlineCache.set(key, updated, CACHE_TTL.IMPORTANT).catch(console.error);
            return updated;
        });

        // Sync Supabase si connecté
        console.log('[HistoryContext] connecté:', isOnline, '— store_id:', activeProfile.id);

        if (isOnline) {
            const insertPayload = {
                id:           newTx.id,
                store_id:     activeProfile.id,
                type:         newTx.type,
                product_id:   newTx.productId,
                product_name: newTx.productName,
                quantity:     newTx.quantity,
                price:        newTx.price,
                client_name:  newTx.clientName,
                status:       newTx.status || 'PAYÉ',
                operator:     newTx.operator ?? null,
                client_phone: newTx.clientPhone ?? null,
                source:       newTx.source ?? 'manual',
                created_at:   new Date(newTx.timestamp).toISOString(),
            };
            console.log('[HistoryContext] INSERT transactions payload:', insertPayload);

            const { data: insertData, error: insertError } = await supabase
                .from('transactions')
                .insert([insertPayload])
                .select()
                .single();

            if (insertError) {
                console.error('[HistoryContext] ❌ INSERT transactions ERREUR:', insertError.message, '| code:', insertError.code, '| details:', insertError.details);
            } else {
                console.log('[HistoryContext] ✅ INSERT transactions OK — id Supabase:', insertData?.id);
            }
        } else {
            console.warn('[HistoryContext] ⚠️ Hors-ligne — transaction sauvegardée localement uniquement');
            // Ajouter à la file d'attente pour sync à la reconnexion
            await offlineQueue.addTransaction(activeProfile.id, {
                id:           newTx.id,
                store_id:     activeProfile.id,
                type:         newTx.type,
                product_id:   newTx.productId,
                product_name: newTx.productName,
                quantity:     newTx.quantity,
                price:        newTx.price,
                client_name:  newTx.clientName,
                status:       newTx.status || 'PAYÉ',
                operator:     newTx.operator ?? null,
                client_phone: newTx.clientPhone ?? null,
                source:       newTx.source ?? 'manual',
                created_at:   new Date(newTx.timestamp).toISOString(),
            });
        }

        // Diffusion realtime Socket.io (après Supabase)
        if (newTx.type === 'VENTE') {
            emitEvent('nouvelle-vente', {
                storeId:     activeProfile.id,
                storeName:   activeProfile.name,
                transaction: newTx,
            });
            console.log('[HistoryContext] emitEvent nouvelle-vente envoyé');
        }
    };

    const markAsPaid = async (transactionId: string) => {
        // Mise à jour optimiste locale
        const updated = history.map(t => t.id === transactionId ? { ...t, status: 'PAYÉ' as const } : t);
        setHistory(updated);
        if (cacheKey) await offlineCache.set(cacheKey, updated, CACHE_TTL.IMPORTANT);

        if (isOnline) {
            const { error } = await supabase
                .from('transactions')
                .update({ status: 'PAYÉ' })
                .eq('id', transactionId);

            if (error) {
                console.error('[HistoryContext] ❌ markAsPaid UPDATE erreur:', error.message);
                // Rollback local si Supabase échoue
                setHistory(history);
                if (cacheKey) await offlineCache.set(cacheKey, history, CACHE_TTL.IMPORTANT);
                throw new Error(error.message);
            } else {
                console.log('[HistoryContext] ✅ markAsPaid OK — id:', transactionId);
            }
        } else {
            console.warn('[HistoryContext] ⚠️ markAsPaid hors-ligne — sera syncé à la reconnexion');
        }
    };

    const clearHistory = async () => {
        setHistory([]);
        if (cacheKey) await offlineCache.remove(cacheKey);
    };

    const todayTransactions = useMemo(() => {
        const today = new Date().setHours(0, 0, 0, 0);
        return history.filter(t => t.timestamp >= today);
    }, [history]);

    const balance = useMemo(() => history.reduce((acc, t) => {
        if (t.type === 'VENTE' && t.status !== 'DETTE') return acc + t.price;
        if (t.type === 'RETRAIT') return acc - t.price;
        return acc;
    }, 0), [history]);

    return (
        <HistoryContext.Provider value={{ history, balance, addTransaction, markAsPaid, clearHistory, todayTransactions, refreshHistory: fetchHistory }}>
            {children}
        </HistoryContext.Provider>
    );
};

export const useHistoryContext = () => {
    const context = useContext(HistoryContext);
    if (!context) throw new Error('useHistoryContext must be used within a HistoryProvider');
    return context;
};
