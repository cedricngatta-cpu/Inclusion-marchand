// File d'attente hors-ligne — sync différée vers Supabase
import AsyncStorage from '@react-native-async-storage/async-storage';

const Q = 'offline_queue_';

export interface PendingTransaction {
    id: string;
    store_id: string;
    type: string;
    product_id: string;
    product_name: string;
    quantity: number;
    price: number;
    client_name?: string;
    status: string;
    operator?: string | null;
    client_phone?: string | null;
    created_at: string;
}

export interface PendingStockUpdate {
    store_id: string;
    product_id: string;
    quantity: number;
    updated_at: string;
}

async function safeGetJSON<T>(key: string, fallback: T): Promise<T> {
    try {
        const raw = await AsyncStorage.getItem(key);
        if (!raw) return fallback;
        return JSON.parse(raw) as T;
    } catch {
        // Données corrompues — on purge et on repart de zéro
        await AsyncStorage.removeItem(key);
        return fallback;
    }
}

export const offlineQueue = {
    // ── Transactions ──────────────────────────────────────────────────────────────
    addTransaction: async (storeId: string, tx: PendingTransaction): Promise<void> => {
        const key = `${Q}tx_${storeId}`;
        const queue = await safeGetJSON<PendingTransaction[]>(key, []);
        // Éviter les doublons par id
        if (!queue.find(q => q.id === tx.id)) {
            queue.push(tx);
            await AsyncStorage.setItem(key, JSON.stringify(queue));
        }
    },

    getTransactions: async (storeId: string): Promise<PendingTransaction[]> => {
        return safeGetJSON<PendingTransaction[]>(`${Q}tx_${storeId}`, []);
    },

    clearTransactions: async (storeId: string): Promise<void> => {
        await AsyncStorage.removeItem(`${Q}tx_${storeId}`);
    },

    // ── Stock ─────────────────────────────────────────────────────────────────────
    // On stocke le dernier état par produit (pas chaque delta)
    setStockUpdate: async (storeId: string, productId: string, quantity: number): Promise<void> => {
        const key = `${Q}stock_${storeId}`;
        const map = await safeGetJSON<Record<string, PendingStockUpdate>>(key, {});
        map[productId] = {
            store_id: storeId,
            product_id: productId,
            quantity,
            updated_at: new Date().toISOString(),
        };
        await AsyncStorage.setItem(key, JSON.stringify(map));
    },

    getStockUpdates: async (storeId: string): Promise<PendingStockUpdate[]> => {
        const map = await safeGetJSON<Record<string, PendingStockUpdate>>(`${Q}stock_${storeId}`, {});
        return Object.values(map);
    },

    clearStockUpdates: async (storeId: string): Promise<void> => {
        await AsyncStorage.removeItem(`${Q}stock_${storeId}`);
    },

    // Nombre total d'éléments en attente pour un store
    getPendingCount: async (storeId: string): Promise<number> => {
        const [txList, stockMap] = await Promise.all([
            safeGetJSON<PendingTransaction[]>(`${Q}tx_${storeId}`, []),
            safeGetJSON<Record<string, PendingStockUpdate>>(`${Q}stock_${storeId}`, {}),
        ]);
        return txList.length + Object.keys(stockMap).length;
    },
};

// ── Synchronisation hors-ligne → Supabase ─────────────────────────────────────
export async function syncOfflineQueue(storeId: string): Promise<number> {
    const pending = await offlineQueue.getTransactions(storeId);
    if (pending.length === 0) return 0;

    // Import dynamique pour éviter les dépendances circulaires
    const { supabase } = await import('./supabase');

    let synced = 0;
    const failed: PendingTransaction[] = [];

    for (const tx of pending) {
        try {
            const { error } = await supabase
                .from('transactions')
                .upsert([tx], { onConflict: 'id', ignoreDuplicates: true });
            if (!error) synced++;
            else failed.push(tx);
        } catch {
            failed.push(tx);
        }
    }

    if (failed.length === 0) {
        await offlineQueue.clearTransactions(storeId);
    } else {
        await AsyncStorage.setItem(`${Q}tx_${storeId}`, JSON.stringify(failed));
    }

    return synced;
}
