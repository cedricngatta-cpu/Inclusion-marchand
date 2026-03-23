// SyncManager — synchronisation automatique offline → Supabase
// Écoute les changements réseau et sync quand online revient
import { networkStatus } from './networkStatus';
import { actionQueue } from './offlineQueue';
import { offlineCache } from './offlineCache';

export type SyncState = 'idle' | 'syncing' | 'done' | 'error';

type SyncListener = (state: SyncState, detail?: { synced: number; failed: number }) => void;

class SyncManager {
    private listeners: SyncListener[] = [];
    private _state: SyncState = 'idle';
    private _lastResult: { synced: number; failed: number } = { synced: 0, failed: 0 };
    private _initialized = false;

    get state() { return this._state; }
    get lastResult() { return this._lastResult; }

    /** Initialiser le listener réseau — appeler une seule fois au démarrage */
    init() {
        if (this._initialized) return;
        this._initialized = true;

        // Écouter la transition offline → online
        networkStatus.on(async (online) => {
            if (online) {
                // Petit délai pour laisser le réseau se stabiliser
                setTimeout(() => this.sync(), 1500);
            }
        });

        // Sync au démarrage si des actions sont en attente
        if (networkStatus.isOnline) {
            setTimeout(() => this.syncIfNeeded(), 3000);
        }
    }

    /** Sync seulement s'il y a des actions pending */
    async syncIfNeeded(): Promise<void> {
        const count = await actionQueue.getPendingCount();
        if (count > 0) {
            await this.sync();
        }
    }

    /** Exécuter la synchronisation complète */
    async sync(): Promise<{ synced: number; failed: number }> {
        if (this._state === 'syncing') return this._lastResult;
        if (!networkStatus.isOnline) return { synced: 0, failed: 0 };

        const pendingCount = await actionQueue.getPendingCount();
        if (pendingCount === 0) return { synced: 0, failed: 0 };

        this.setState('syncing');

        try {
            // 1. Sync la queue d'actions
            const result = await actionQueue.sync();
            this._lastResult = result;

            // 2. Purger le cache si nécessaire
            await offlineCache.enforceLimit();

            // 3. Notifier le résultat
            if (result.failed > 0) {
                this.setState('error', result);
            } else {
                this.setState('done', result);
            }

            // Revenir à idle après 3 secondes
            setTimeout(() => {
                if (this._state === 'done' || this._state === 'error') {
                    this.setState('idle');
                }
            }, 3000);

            return result;
        } catch (err) {
            console.error('[SyncManager] sync error:', err);
            this.setState('error', { synced: 0, failed: 0 });
            setTimeout(() => this.setState('idle'), 3000);
            return { synced: 0, failed: 0 };
        }
    }

    /** S'abonner aux changements d'état */
    on(listener: SyncListener): () => void {
        this.listeners.push(listener);
        return () => {
            this.listeners = this.listeners.filter(fn => fn !== listener);
        };
    }

    private setState(state: SyncState, detail?: { synced: number; failed: number }) {
        this._state = state;
        this.listeners.forEach(fn => fn(state, detail));
    }
}

// Singleton
export const syncManager = new SyncManager();
