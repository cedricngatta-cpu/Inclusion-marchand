// Contexte historique transactions — migré depuis Next.js
// Dexie/IndexedDB → AsyncStorage, navigator.onLine → NetInfo
import React, { createContext, useContext, useState, useEffect, useMemo } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import { supabase } from '@/src/lib/supabase';
import { useProfileContext } from './ProfileContext';
import { emitEvent, onSocketEvent } from '@/src/lib/socket';

export type TransactionType = 'VENTE' | 'LIVRAISON' | 'RETRAIT';

export interface Transaction {
    id: string;
    type: TransactionType;
    productId: string;
    productName: string;
    quantity: number;
    price: number;
    timestamp: number;
    clientName?: string;
    status?: 'PAYÉ' | 'DETTE' | 'MOMO';
}

interface HistoryContextType {
    history: Transaction[];
    balance: number;
    addTransaction: (transaction: Omit<Transaction, 'id' | 'timestamp'>) => Promise<void>;
    markAsPaid: (transactionId: string) => Promise<void>;
    clearHistory: () => Promise<void>;
    getTodayTransactions: () => Transaction[];
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

    const cacheKey = activeProfile ? `history_${activeProfile.id}` : null;

    const fetchHistory = async () => {
        if (!activeProfile || !cacheKey) return;

        // 1. Cache local AsyncStorage
        const cached = await AsyncStorage.getItem(cacheKey);
        if (cached) {
            setHistory(JSON.parse(cached));
        }

        // 2. Sync depuis Supabase si connecté
        const netState = await NetInfo.fetch();
        if (netState.isConnected) {
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
                    timestamp: new Date(t.created_at).getTime(),
                    clientName: t.client_name,
                    status: t.status,
                }));
                setHistory(mapped);
                await AsyncStorage.setItem(cacheKey, JSON.stringify(mapped));
            }
        }
    };

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
        const unsubscribe = onSocketEvent('nouvelle-vente', ({ transaction }) => {
            if (!transaction) return;
            setHistory(prev => {
                // Éviter les doublons (la vente locale est déjà dans l'historique)
                if (prev.some(t => t.id === transaction.id)) return prev;
                const updated = [transaction, ...prev];
                if (cacheKey) AsyncStorage.setItem(cacheKey, JSON.stringify(updated));
                return updated;
            });
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
        };

        console.log('[HistoryContext] addTransaction — id:', newTx.id, 'type:', newTx.type, 'produit:', newTx.productName, 'prix:', newTx.price);

        // Mise à jour optimiste locale (AsyncStorage)
        const key = cacheKey;
        setHistory(prev => {
            const updated = [newTx, ...prev];
            AsyncStorage.setItem(key, JSON.stringify(updated)).catch(console.error);
            return updated;
        });

        // Sync Supabase si connecté
        const netState = await NetInfo.fetch();
        console.log('[HistoryContext] connecté:', netState.isConnected, '— store_id:', activeProfile.id);

        if (netState.isConnected) {
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
        if (cacheKey) await AsyncStorage.setItem(cacheKey, JSON.stringify(updated));

        const netState = await NetInfo.fetch();
        if (netState.isConnected) {
            const { error } = await supabase
                .from('transactions')
                .update({ status: 'PAYÉ' })
                .eq('id', transactionId);

            if (error) {
                console.error('[HistoryContext] ❌ markAsPaid UPDATE erreur:', error.message);
                // Rollback local si Supabase échoue
                setHistory(history);
                if (cacheKey) await AsyncStorage.setItem(cacheKey, JSON.stringify(history));
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
        if (cacheKey) await AsyncStorage.removeItem(cacheKey);
    };

    const getTodayTransactions = () => {
        const today = new Date().setHours(0, 0, 0, 0);
        return history.filter(t => t.timestamp >= today);
    };

    const balance = useMemo(() => history.reduce((acc, t) => {
        if (t.type === 'VENTE' && t.status !== 'DETTE') return acc + t.price;
        if (t.type === 'RETRAIT') return acc - t.price;
        return acc;
    }, 0), [history]);

    return (
        <HistoryContext.Provider value={{ history, balance, addTransaction, markAsPaid, clearHistory, getTodayTransactions, refreshHistory: fetchHistory }}>
            {children}
        </HistoryContext.Provider>
    );
};

export const useHistoryContext = () => {
    const context = useContext(HistoryContext);
    if (!context) throw new Error('useHistoryContext must be used within a HistoryProvider');
    return context;
};
