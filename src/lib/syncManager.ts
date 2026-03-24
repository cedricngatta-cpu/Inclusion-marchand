// SyncManager — synchronisation automatique offline -> Supabase (WhatsApp-like)
// - Sync auto quand connexion revient (300ms delay)
// - Retry auto toutes les 30s si des actions ont echoue
// - Notifie la progression action par action
// - Callback post-sync pour rafraichir les contextes
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
type PostSyncCallback = () => void;

class SyncManager {
    private listeners: SyncListener[] = [];
    private postSyncCallbacks: PostSyncCallback[] = [];
    private _state: SyncState = 'idle';
    private _lastResult: { synced: number; failed: number } = { synced: 0, failed: 0 };
    private _progress: SyncProgress = { current: 0, total: 0, synced: 0, failed: 0 };
    private _initialized = false;
    private _userRole: string = '';
    private _retryTimer: ReturnType<typeof setInterval> | null = null;
    private _doneTimer: ReturnType<typeof setTimeout> | null = null;

    get state() { return this._state; }
    get lastResult() { return this._lastResult; }
    get progress() { return this._progress; }

    /** Mettre a jour le role utilisateur (appele au login/logout) */
    setUserRole(role: string) {
        this._userRole = role;
        // Demarrer/arreter le retry timer selon l'eligibilite
        if (isOfflineEligible(role)) {
            this.startRetryTimer();
        } else {
            this.stopRetryTimer();
        }
    }

    /** Enregistrer un callback appele apres chaque sync reussie (refresh contextes) */
    onPostSync(cb: PostSyncCallback): () => void {
        this.postSyncCallbacks.push(cb);
        return () => {
            this.postSyncCallbacks = this.postSyncCallbacks.filter(fn => fn !== cb);
        };
    }

    /** Initialiser le listener reseau — appeler une seule fois au demarrage */
    init() {
        if (this._initialized) return;
        this._initialized = true;

        // Ecouter la transition offline -> online
        networkStatus.on(async (online) => {
            if (online && isOfflineEligible(this._userRole)) {
                // Delai 300ms comme WhatsApp — laisser la connexion se stabiliser
                setTimeout(() => this.sync(), 300);
            }
        });

        // Sync au demarrage si des actions sont en attente
        if (networkStatus.isOnline) {
            setTimeout(() => this.syncIfNeeded(), 1000);
        }
    }

    /** Demarrer le retry automatique toutes les 30s pour les actions echouees */
    private startRetryTimer() {
        if (this._retryTimer) return;
        this._retryTimer = setInterval(async () => {
            if (!networkStatus.isOnline || this._state === 'syncing') return;
            const failedCount = await actionQueue.getFailedCount();
            if (failedCount > 0) {
                console.log('[SyncManager] Retry auto:', failedCount, 'action(s) echouee(s)');
                await this.sync();
            }
        }, 30_000);
    }

    /** Arreter le retry timer */
    private stopRetryTimer() {
        if (this._retryTimer) {
            clearInterval(this._retryTimer);
            this._retryTimer = null;
        }
    }

    /** Sync seulement s'il y a des actions pending */
    async syncIfNeeded(): Promise<void> {
        if (!isOfflineEligible(this._userRole)) return;
        const count = await actionQueue.getActionCount();
        const failedCount = await actionQueue.getFailedCount();
        if (count > 0 || failedCount > 0) {
            await this.sync();
        }
    }

    /** Executer la synchronisation complete avec progression */
    async sync(): Promise<{ synced: number; failed: number }> {
        if (this._state === 'syncing') return this._lastResult;
        if (!networkStatus.isOnline) return { synced: 0, failed: 0 };
        if (!isOfflineEligible(this._userRole)) return { synced: 0, failed: 0 };

        const pending = await actionQueue.getPendingActions();
        if (pending.length === 0) return { synced: 0, failed: 0 };

        this._progress = { current: 0, total: pending.length, synced: 0, failed: 0 };
        this.setState('syncing');

        // Annuler le timer done precedent
        if (this._doneTimer) { clearTimeout(this._doneTimer); this._doneTimer = null; }

        try {
            // Sync la queue d'actions avec callback de progression
            const result = await actionQueue.sync((current, total, synced, failed) => {
                this._progress = { current, total, synced, failed };
                this.setState('syncing', undefined, this._progress);
            });
            this._lastResult = result;

            // Purger le cache si necessaire
            await offlineCache.enforceLimit();

            // Notifier le resultat
            if (result.failed > 0) {
                this.setState('error', result);
            } else {
                this.setState('done', result);
                // Appeler les callbacks post-sync (refresh contextes)
                this.postSyncCallbacks.forEach(cb => {
                    try { cb(); } catch (e) { console.warn('[SyncManager] postSync cb error:', e); }
                });
            }

            // Revenir a idle apres 3 secondes
            this._doneTimer = setTimeout(() => {
                if (this._state === 'done' || this._state === 'error') {
                    this.setState('idle');
                }
                this._doneTimer = null;
            }, 3000);

            return result;
        } catch (err) {
            console.error('[SyncManager] sync error:', err);
            this.setState('error', { synced: 0, failed: 0 });
            this._doneTimer = setTimeout(() => {
                this.setState('idle');
                this._doneTimer = null;
            }, 3000);
            return { synced: 0, failed: 0 };
        }
    }

    /** S'abonner aux changements d'etat */
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
