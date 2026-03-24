// File d'attente hors-ligne WhatsApp-like — sync differee vers Supabase
// Actions typees avec statuts : pending / syncing / synced / failed
// Persiste dans localStorage (web) + AsyncStorage (mobile)
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

const QUEUE_KEY = 'julaba_offline_queue';

// ── Types ────────────────────────────────────────────────────────────────────

export type OfflineActionType =
    | 'SELL'
    | 'UPDATE_STOCK'
    | 'ADD_PRODUCT'
    | 'ADD_DEBT'
    | 'MARK_DEBT_PAID';

export type OfflineActionStatus = 'pending' | 'syncing' | 'synced' | 'failed';

export interface PendingAction {
    id: string;
    type: OfflineActionType;
    data: any;
    status: OfflineActionStatus;
    createdAt: number;
    syncedAt?: number;
    error?: string;
}

// ── Types legacy (compatibilite contexts existants) ──────────────────────────

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

// ── Stockage bas niveau (localStorage web / AsyncStorage mobile) ─────────────

async function rawGet(): Promise<PendingAction[]> {
    try {
        let raw: string | null = null;
        if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
            raw = localStorage.getItem(QUEUE_KEY);
        } else {
            raw = await AsyncStorage.getItem(QUEUE_KEY);
        }
        if (!raw) return [];
        return JSON.parse(raw) as PendingAction[];
    } catch {
        return [];
    }
}

async function rawSet(actions: PendingAction[]): Promise<void> {
    const json = JSON.stringify(actions);
    if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
        localStorage.setItem(QUEUE_KEY, json);
    } else {
        await AsyncStorage.setItem(QUEUE_KEY, json);
    }
}

function generateId(): string {
    return `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

// ── API principale ───────────────────────────────────────────────────────────

export const actionQueue = {
    /** Ajouter une action a la queue — retourne l'id */
    async addAction(type: OfflineActionType, data: any): Promise<string> {
        const action: PendingAction = {
            id: generateId(),
            type,
            data,
            status: 'pending',
            createdAt: Date.now(),
        };
        const all = await rawGet();
        all.push(action);
        await rawSet(all);
        return action.id;
    },

    /** Toutes les actions pending ou failed */
    async getPendingActions(): Promise<PendingAction[]> {
        const all = await rawGet();
        return all
            .filter(a => a.status === 'pending' || a.status === 'failed')
            .sort((a, b) => a.createdAt - b.createdAt);
    },

    /** Mettre a jour le statut d'une action */
    async updateActionStatus(id: string, status: OfflineActionStatus, error?: string): Promise<void> {
        const all = await rawGet();
        const idx = all.findIndex(a => a.id === id);
        if (idx >= 0) {
            all[idx].status = status;
            if (status === 'synced') all[idx].syncedAt = Date.now();
            if (error !== undefined) all[idx].error = error;
            else if (status !== 'failed') delete all[idx].error;
            await rawSet(all);
        }
    },

    /** Supprimer les actions synced */
    async removeSyncedActions(): Promise<void> {
        const all = await rawGet();
        const remaining = all.filter(a => a.status !== 'synced');
        await rawSet(remaining);
    },

    /** Nombre d'actions en pending */
    async getActionCount(): Promise<number> {
        const all = await rawGet();
        return all.filter(a => a.status === 'pending').length;
    },

    /** Nombre d'actions failed */
    async getFailedCount(): Promise<number> {
        const all = await rawGet();
        return all.filter(a => a.status === 'failed').length;
    },

    /** Toutes les actions (pour debug / affichage) */
    async getAll(): Promise<PendingAction[]> {
        return rawGet();
    },

    /** Vider toute la queue */
    async clear(): Promise<void> {
        await rawSet([]);
    },

    /** Sync toutes les actions pending vers Supabase — FIFO, timeout 5s par action */
    async sync(
        onProgress?: (current: number, total: number, synced: number, failed: number) => void,
    ): Promise<{ synced: number; failed: number }> {
        const pending = await this.getPendingActions();
        if (pending.length === 0) return { synced: 0, failed: 0 };

        const { supabase } = await import('./supabase');
        let synced = 0;
        let failed = 0;
        const total = pending.length;

        const withTimeout = <T>(promiseLike: PromiseLike<T>, ms = 5000): Promise<T> =>
            Promise.race([
                Promise.resolve(promiseLike),
                new Promise<never>((_, reject) => setTimeout(() => reject(new Error('Timeout')), ms)),
            ]);

        type SupaResult = { error: { message: string } | null };

        // FIFO : traiter une par une dans l'ordre de creation
        for (const action of pending) {
            await this.updateActionStatus(action.id, 'syncing');
            onProgress?.(synced + failed, total, synced, failed);

            try {
                let error: { message: string } | null = null;

                switch (action.type) {
                    case 'SELL': {
                        // INSERT simple — la transaction n'existe pas encore dans Supabase
                        // Colonnes exactes du schema : id, store_id, type, product_id, product_name,
                        // quantity, price, client_name, status, operator, client_phone, source, created_at
                        const d = action.data;
                        const row: Record<string, any> = {
                            store_id:     d.store_id,
                            type:         d.type || 'VENTE',
                            product_id:   d.product_id || null,
                            product_name: d.product_name,
                            quantity:     d.quantity,
                            price:        d.price,
                            client_name:  d.client_name || null,
                            status:       d.status || 'PAYE',
                            operator:     d.operator || null,
                            client_phone: d.client_phone || null,
                            source:       d.source || 'manual',
                            created_at:   d.created_at || new Date().toISOString(),
                        };
                        // Inclure l'id seulement s'il est un UUID valide (pas temp_xxx)
                        if (d.id && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(d.id)) {
                            row.id = d.id;
                        }
                        const res = await withTimeout<SupaResult>(
                            supabase.from('transactions').insert(row)
                        );
                        error = res.error;
                        break;
                    }
                    case 'UPDATE_STOCK': {
                        // Stock upsert sur product_id (cle composite store_id + product_id)
                        const d = action.data;
                        const res = await withTimeout<SupaResult>(
                            supabase.from('stock').upsert({
                                store_id:   d.store_id,
                                product_id: d.product_id,
                                quantity:   d.quantity,
                                updated_at: d.updated_at || new Date().toISOString(),
                            })
                        );
                        error = res.error;
                        break;
                    }
                    case 'ADD_PRODUCT': {
                        const res = await withTimeout<SupaResult>(
                            supabase.from('products').insert([action.data])
                        );
                        error = res.error;
                        break;
                    }
                    case 'ADD_DEBT': {
                        const res = await withTimeout<SupaResult>(
                            supabase.from('credits_clients').insert([action.data])
                        );
                        error = res.error;
                        break;
                    }
                    case 'MARK_DEBT_PAID': {
                        const { id: creditId, transactionId, ...rest } = action.data;
                        if (creditId) {
                            const res = await withTimeout<SupaResult>(
                                supabase.from('credits_clients').update(rest).eq('id', creditId)
                            );
                            error = res.error;
                        } else if (transactionId) {
                            const res = await withTimeout<SupaResult>(
                                supabase.from('transactions').update({ status: 'PAYE' }).eq('id', transactionId)
                            );
                            error = res.error;
                        }
                        break;
                    }
                }

                if (error) {
                    await this.updateActionStatus(action.id, 'failed', error.message);
                    failed++;
                } else {
                    await this.updateActionStatus(action.id, 'synced');
                    synced++;
                }
            } catch (err: any) {
                await this.updateActionStatus(action.id, 'failed', err?.message ?? 'Timeout');
                failed++;
            }
            onProgress?.(synced + failed, total, synced, failed);
        }

        // Nettoyer les actions synchronisees apres un delai court
        setTimeout(() => { this.removeSyncedActions().catch(() => {}); }, 60_000);

        return { synced, failed };
    },
};

// ── API legacy (compatibilite avec HistoryContext / StockContext) ─────────────

const Q = 'offline_queue_';

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
        await actionQueue.addAction('SELL', tx);
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
        await actionQueue.addAction('UPDATE_STOCK', update);
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

// ── Synchronisation legacy (conservee pour compatibilite) ────────────────────
// IMPORTANT : utilise INSERT simple, pas upsert (les transactions offline n'existent pas dans Supabase)
export async function syncOfflineQueue(storeId: string): Promise<number> {
    const pending = await offlineQueue.getTransactions(storeId);
    if (pending.length === 0) return 0;

    const { supabase } = await import('./supabase');

    let synced = 0;
    const failed: PendingTransaction[] = [];

    for (const tx of pending) {
        try {
            const row: Record<string, any> = {
                store_id:     tx.store_id,
                type:         tx.type || 'VENTE',
                product_id:   tx.product_id || null,
                product_name: tx.product_name,
                quantity:     tx.quantity,
                price:        tx.price,
                client_name:  tx.client_name || null,
                status:       tx.status || 'PAYE',
                operator:     tx.operator || null,
                client_phone: tx.client_phone || null,
                source:       tx.source || 'manual',
                created_at:   tx.created_at || new Date().toISOString(),
            };
            if (tx.id && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(tx.id)) {
                row.id = tx.id;
            }
            const { error } = await supabase.from('transactions').insert(row);
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
