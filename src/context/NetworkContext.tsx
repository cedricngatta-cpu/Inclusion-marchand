// Contexte réseau — détecte la connectivité en temps réel + état de sync + compteur offline
import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import NetInfo from '@react-native-community/netinfo';
import { syncManager, SyncState, SyncProgress } from '@/src/lib/syncManager';
import { actionQueue } from '@/src/lib/offlineQueue';

interface NetworkContextType {
    isOnline: boolean;
    pendingCount: number;
    syncState: SyncState;
    syncResult: { synced: number; failed: number };
    syncProgress: SyncProgress;
    addToPendingCount: (n: number) => void;
    resetPendingCount: () => void;
    triggerSync: () => Promise<void>;
}

const NetworkContext = createContext<NetworkContextType>({
    isOnline: true,
    pendingCount: 0,
    syncState: 'idle',
    syncResult: { synced: 0, failed: 0 },
    syncProgress: { current: 0, total: 0, synced: 0, failed: 0 },
    addToPendingCount: () => {},
    resetPendingCount: () => {},
    triggerSync: async () => {},
});

export const NetworkProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [isOnline, setIsOnline] = useState(true);
    const [pendingCount, setPendingCount] = useState(0);
    const [syncState, setSyncState] = useState<SyncState>('idle');
    const [syncResult, setSyncResult] = useState({ synced: 0, failed: 0 });
    const [syncProgress, setSyncProgress] = useState<SyncProgress>({ current: 0, total: 0, synced: 0, failed: 0 });

    useEffect(() => {
        // Vérification initiale
        NetInfo.fetch().then(state => {
            setIsOnline(state.isConnected === true);
        });

        // Écouter les changements en temps réel
        const unsub = NetInfo.addEventListener(state => {
            setIsOnline(state.isConnected === true);
        });

        return unsub;
    }, []);

    // Écouter les changements d'état du syncManager
    useEffect(() => {
        const unsub = syncManager.on((state, detail, progress) => {
            setSyncState(state);
            if (detail) setSyncResult(detail);
            if (progress) setSyncProgress(progress);
            // Après sync réussi, recalculer le pending count
            if (state === 'done' || state === 'error') {
                actionQueue.getPendingCount().then(setPendingCount);
            }
        });
        return unsub;
    }, []);

    // Rafraîchir le pending count au démarrage et quand isOnline change
    useEffect(() => {
        actionQueue.getPendingCount().then(setPendingCount);
    }, [isOnline]);

    const addToPendingCount = useCallback((n: number) => {
        setPendingCount(prev => prev + n);
    }, []);

    const resetPendingCount = useCallback(() => {
        setPendingCount(0);
    }, []);

    const triggerSync = useCallback(async () => {
        await syncManager.sync();
    }, []);

    return (
        <NetworkContext.Provider value={{
            isOnline, pendingCount, syncState, syncResult, syncProgress,
            addToPendingCount, resetPendingCount, triggerSync,
        }}>
            {children}
        </NetworkContext.Provider>
    );
};

export const useNetwork = () => useContext(NetworkContext);
