// SyncManager — synchronisation automatique offline → Supabase
// Ecoute les changements reseau et sync quand online revient
// Ne sync QUE pour les marchands et producteurs (isOfflineEligible)
import { networkStatus } from './networkStatus';
import { actionQueue } from './offlineQueue';
import { offlineCache, isOfflineEligible } from './offlineCache';

export type SyncState = 'idle' | 'syncing' | 'done' | 'error';

export interface SyncProgress {
    current: number;
    total: number;
    synced: number;
    failed: number;
}

type SyncListener = (state: SyncState, detail?: { synced: number; failed: number }, progress?: SyncProgress) => void;

class SyncManager {
    private listeners: SyncListener[] = [];
    private _state: SyncState = 'idle';
    private _lastResult: { synced: number; failed: number } = { synced: 0, failed: 0 };
    private _progress: SyncProgress = { current: 0, total: 0, synced: 0, failed: 0 };
    private _initialized = false;
    private _userRole: string = '';

    get state() { return this._state; }
    get lastResult() { return this._lastResult; }
    get progress() { return this._progress; }

    /** Mettre a jour le role utilisateur (appele au login/logout) */
    setUserRole(role: string) { this._userRole = role; }

    /** Initialiser le listener réseau — appeler une seule fois au démarrage */
    init() {
        if (this._initialized) return;
        this._initialized = true;

        // Écouter la transition offline → online
        networkStatus.on(async (online) => {
            if (online && isOfflineEligible(this._userRole)) {
                setTimeout(() => this.sync(), 300);
            }
        });

        // Sync au démarrage si des actions sont en attente
        if (networkStatus.isOnline) {
            setTimeout(() => this.syncIfNeeded(), 1000);
        }
    }

    /** Sync seulement s'il y a des actions pending */
    async syncIfNeeded(): Promise<void> {
        if (!isOfflineEligible(this._userRole)) return;
        const count = await actionQueue.getPendingCount();
        if (count > 0) {
            await this.sync();
        }
    }

    /** Exécuter la synchronisation complète avec progression */
    async sync(): Promise<{ synced: number; failed: number }> {
        if (this._state === 'syncing') return this._lastResult;
        if (!networkStatus.isOnline) return { synced: 0, failed: 0 };
        if (!isOfflineEligible(this._userRole)) return { synced: 0, failed: 0 };

        const pendingCount = await actionQueue.getPendingCount();
        if (pendingCount === 0) return { synced: 0, failed: 0 };

        this._progress = { current: 0, total: pendingCount, synced: 0, failed: 0 };
        this.setState('syncing');

        try {
            // 1. Sync la queue d'actions avec callback de progression
            const result = await actionQueue.sync((current, total, synced, failed) => {
                this._progress = { current, total, synced, failed };
                this.setState('syncing', undefined, this._progress);
            });
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

    private setState(state: SyncState, detail?: { synced: number; failed: number }, progress?: SyncProgress) {
        this._state = state;
        this.listeners.forEach(fn => fn(state, detail, progress));
    }
}

// Singleton
export const syncManager = new SyncManager();
