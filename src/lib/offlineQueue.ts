// File d'attente hors-ligne — sync différée vers Supabase
// Actions typées avec statuts : pending / synced / failed
import AsyncStorage from '@react-native-async-storage/async-storage';

const Q = 'offline_queue_';

// ── Types legacy (utilisés par les contexts existants) ──────────────────────

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
    source?: string;
    created_at: string;
}

export interface PendingStockUpdate {
    store_id: string;
    product_id: string;
    quantity: number;
    updated_at: string;
}

// ── Nouveau système d'actions typées ────────────────────────────────────────

export type OfflineActionType =
    | 'SELL'
    | 'UPDATE_STOCK'
    | 'ADD_PRODUCT'
    | 'CREATE_ORDER'
    | 'UPDATE_CREDIT'
    | 'MARK_PAID';

export type OfflineActionStatus = 'pending' | 'synced' | 'failed';

export interface OfflineAction {
    id: string;
    type: OfflineActionType;
    table: string;         // table Supabase cible
    data: Record<string, any>;
    timestamp: number;     // Date.now() à la création
    status: OfflineActionStatus;
    error?: string;        // message d'erreur si failed
    storeId: string;       // pour filtrer par store
}

const ACTIONS_KEY = `${Q}actions`;

// ── Helpers ─────────────────────────────────────────────────────────────────

async function safeGetJSON<T>(key: string, fallback: T): Promise<T> {
    try {
        const raw = await AsyncStorage.getItem(key);
        if (!raw) return fallback;
        return JSON.parse(raw) as T;
    } catch {
        await AsyncStorage.removeItem(key);
        return fallback;
    }
}

function generateId(): string {
    return `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

// ── API actions typées ──────────────────────────────────────────────────────

export const actionQueue = {
    async add(action: Omit<OfflineAction, 'id' | 'timestamp' | 'status'>): Promise<OfflineAction> {
        const newAction: OfflineAction = {
            ...action,
            id: generateId(),
            timestamp: Date.now(),
            status: 'pending',
        };
        const all = await safeGetJSON<OfflineAction[]>(ACTIONS_KEY, []);
        all.push(newAction);
        await AsyncStorage.setItem(ACTIONS_KEY, JSON.stringify(all));
        return newAction;
    },

    async getAll(): Promise<OfflineAction[]> {
        return safeGetJSON<OfflineAction[]>(ACTIONS_KEY, []);
    },

    async getPending(): Promise<OfflineAction[]> {
        const all = await this.getAll();
        return all.filter(a => a.status === 'pending').sort((a, b) => a.timestamp - b.timestamp);
    },

    async getFailed(): Promise<OfflineAction[]> {
        const all = await this.getAll();
        return all.filter(a => a.status === 'failed');
    },

    async getPendingCount(): Promise<number> {
        const all = await this.getAll();
        return all.filter(a => a.status === 'pending').length;
    },

    async updateStatus(id: string, status: OfflineActionStatus, error?: string): Promise<void> {
        const all = await this.getAll();
        const idx = all.findIndex(a => a.id === id);
        if (idx >= 0) {
            all[idx].status = status;
            if (error) all[idx].error = error;
            await AsyncStorage.setItem(ACTIONS_KEY, JSON.stringify(all));
        }
    },

    async clearSynced(): Promise<void> {
        const all = await this.getAll();
        const remaining = all.filter(a => a.status !== 'synced');
        await AsyncStorage.setItem(ACTIONS_KEY, JSON.stringify(remaining));
    },

    async clear(): Promise<void> {
        await AsyncStorage.removeItem(ACTIONS_KEY);
    },

    /** Sync toutes les actions pending vers Supabase — batch par type quand possible */
    async sync(
        onProgress?: (current: number, total: number, synced: number, failed: number) => void,
    ): Promise<{ synced: number; failed: number }> {
        const pending = await this.getPending();
        if (pending.length === 0) return { synced: 0, failed: 0 };

        const { supabase } = await import('./supabase');
        let synced = 0;
        let failed = 0;
        const total = pending.length;

        // Regrouper par type pour batch les inserts
        const byType = new Map<OfflineActionType, OfflineAction[]>();
        for (const action of pending) {
            const list = byType.get(action.type) ?? [];
            list.push(action);
            byType.set(action.type, list);
        }

        const withTimeout = <T>(promiseLike: PromiseLike<T>, ms = 5000): Promise<T> =>
            Promise.race([
                Promise.resolve(promiseLike),
                new Promise<never>((_, reject) => setTimeout(() => reject(new Error('Timeout')), ms)),
            ]);

        type SupaResult = { error: { message: string } | null };

        // Batch SELL : upsert toutes les transactions d'un coup
        const sells = byType.get('SELL') ?? [];
        if (sells.length > 0) {
            try {
                const rows = sells.map(a => a.data);
                const { error } = await withTimeout<SupaResult>(
                    supabase.from('transactions').upsert(rows, { onConflict: 'id', ignoreDuplicates: true })
                );
                if (error) {
                    for (const a of sells) { await this.updateStatus(a.id, 'failed', error.message); failed++; }
                } else {
                    for (const a of sells) { await this.updateStatus(a.id, 'synced'); synced++; }
                }
            } catch (err: any) {
                for (const a of sells) { await this.updateStatus(a.id, 'failed', err?.message ?? 'Timeout'); failed++; }
            }
            onProgress?.(synced + failed, total, synced, failed);
        }

        // Batch UPDATE_STOCK : upsert tous les stocks d'un coup
        const stocks = byType.get('UPDATE_STOCK') ?? [];
        if (stocks.length > 0) {
            try {
                const rows = stocks.map(a => a.data);
                const { error } = await withTimeout<SupaResult>(
                    supabase.from('stock').upsert(rows)
                );
                if (error) {
                    for (const a of stocks) { await this.updateStatus(a.id, 'failed', error.message); failed++; }
                } else {
                    for (const a of stocks) { await this.updateStatus(a.id, 'synced'); synced++; }
                }
            } catch (err: any) {
                for (const a of stocks) { await this.updateStatus(a.id, 'failed', err?.message ?? 'Timeout'); failed++; }
            }
            onProgress?.(synced + failed, total, synced, failed);
        }

        // Reste des types : traiter séquentiellement (pas de batch possible)
        const remaining = pending.filter(a => a.type !== 'SELL' && a.type !== 'UPDATE_STOCK');
        for (const action of remaining) {
            try {
                let error: { message: string } | null = null;

                switch (action.type) {
                    case 'ADD_PRODUCT': {
                        const res = await withTimeout<SupaResult>(supabase.from('products').insert([action.data]));
                        error = res.error;
                        break;
                    }
                    case 'CREATE_ORDER': {
                        const res = await withTimeout<SupaResult>(supabase.from('orders').insert([action.data]));
                        error = res.error;
                        break;
                    }
                    case 'UPDATE_CREDIT': {
                        const { id: creditId, ...rest } = action.data;
                        const res = creditId
                            ? await withTimeout<SupaResult>(supabase.from('credits_clients').update(rest).eq('id', creditId))
                            : await withTimeout<SupaResult>(supabase.from('credits_clients').insert([rest]));
                        error = res.error;
                        break;
                    }
                    case 'MARK_PAID': {
                        const res = await withTimeout<SupaResult>(
                            supabase.from('transactions').update({ status: 'PAYÉ' }).eq('id', action.data.id)
                        );
                        error = res.error;
                        break;
                    }
                }

                if (error) {
                    await this.updateStatus(action.id, 'failed', error.message);
                    failed++;
                } else {
                    await this.updateStatus(action.id, 'synced');
                    synced++;
                }
            } catch (err: any) {
                await this.updateStatus(action.id, 'failed', err?.message ?? 'Erreur inconnue');
                failed++;
            }
            onProgress?.(synced + failed, total, synced, failed);
        }

        // Nettoyer les actions synchronisées
        await this.clearSynced();
        return { synced, failed };
    },
};

// ── API legacy (compatibilité avec les contexts existants) ──────────────────

export const offlineQueue = {
    // ── Transactions ────────────────────────────────────────────────────────
    addTransaction: async (storeId: string, tx: PendingTransaction): Promise<void> => {
        const key = `${Q}tx_${storeId}`;
        const queue = await safeGetJSON<PendingTransaction[]>(key, []);
        if (!queue.find(q => q.id === tx.id)) {
            queue.push(tx);
            await AsyncStorage.setItem(key, JSON.stringify(queue));
        }
        // Aussi ajouter dans la nouvelle action queue pour le syncManager
        await actionQueue.add({
            type: 'SELL',
            table: 'transactions',
            data: tx,
            storeId,
        });
    },

    getTransactions: async (storeId: string): Promise<PendingTransaction[]> => {
        return safeGetJSON<PendingTransaction[]>(`${Q}tx_${storeId}`, []);
    },

    clearTransactions: async (storeId: string): Promise<void> => {
        await AsyncStorage.removeItem(`${Q}tx_${storeId}`);
    },

    // ── Stock ───────────────────────────────────────────────────────────────
    setStockUpdate: async (storeId: string, productId: string, quantity: number): Promise<void> => {
        const key = `${Q}stock_${storeId}`;
        const map = await safeGetJSON<Record<string, PendingStockUpdate>>(key, {});
        const update: PendingStockUpdate = {
            store_id: storeId,
            product_id: productId,
            quantity,
            updated_at: new Date().toISOString(),
        };
        map[productId] = update;
        await AsyncStorage.setItem(key, JSON.stringify(map));
        // Aussi ajouter dans la nouvelle action queue
        await actionQueue.add({
            type: 'UPDATE_STOCK',
            table: 'stock',
            data: update,
            storeId,
        });
    },

    getStockUpdates: async (storeId: string): Promise<PendingStockUpdate[]> => {
        const map = await safeGetJSON<Record<string, PendingStockUpdate>>(`${Q}stock_${storeId}`, {});
        return Object.values(map);
    },

    clearStockUpdates: async (storeId: string): Promise<void> => {
        await AsyncStorage.removeItem(`${Q}stock_${storeId}`);
    },

    getPendingCount: async (storeId: string): Promise<number> => {
        const [txList, stockMap] = await Promise.all([
            safeGetJSON<PendingTransaction[]>(`${Q}tx_${storeId}`, []),
            safeGetJSON<Record<string, PendingStockUpdate>>(`${Q}stock_${storeId}`, {}),
        ]);
        return txList.length + Object.keys(stockMap).length;
    },
};

// ── Synchronisation legacy (conservée pour compatibilité) ───────────────────
export async function syncOfflineQueue(storeId: string): Promise<number> {
    const pending = await offlineQueue.getTransactions(storeId);
    if (pending.length === 0) return 0;

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
