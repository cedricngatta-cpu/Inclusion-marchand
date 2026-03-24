// Contexte reseau — detecte la connectivite en temps reel + etat de sync + compteur offline
import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import NetInfo from '@react-native-community/netinfo';
import { syncManager, SyncState, SyncProgress } from '@/src/lib/syncManager';
import { actionQueue } from '@/src/lib/offlineQueue';
import { isOfflineEligible } from '@/src/lib/offlineCache';
import { setOnlineStatus } from '@/src/lib/groqAI';

interface NetworkContextType {
    isOnline: boolean;
    pendingCount: number;
    syncState: SyncState;
    syncResult: { synced: number; failed: number };
    syncProgress: SyncProgress;
    userRole: string;
    addToPendingCount: (n: number) => void;
    resetPendingCount: () => void;
    triggerSync: () => Promise<void>;
    setUserRole: (role: string) => void;
}

const NetworkContext = createContext<NetworkContextType>({
    isOnline: true,
    pendingCount: 0,
    syncState: 'idle',
    syncResult: { synced: 0, failed: 0 },
    syncProgress: { current: 0, total: 0, synced: 0, failed: 0 },
    userRole: '',
    addToPendingCount: () => {},
    resetPendingCount: () => {},
    triggerSync: async () => {},
    setUserRole: () => {},
});

export const NetworkProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [isOnline, setIsOnline] = useState(true);
    const [pendingCount, setPendingCount] = useState(0);
    const [syncState, setSyncState] = useState<SyncState>('idle');
    const [syncResult, setSyncResult] = useState({ synced: 0, failed: 0 });
    const [syncProgress, setSyncProgress] = useState<SyncProgress>({ current: 0, total: 0, synced: 0, failed: 0 });
    const [userRole, setUserRole] = useState('');

    // Rafraichir le compteur pending depuis la queue persistee
    const refreshPendingCount = useCallback(async () => {
        const count = await actionQueue.getActionCount();
        const failed = await actionQueue.getFailedCount();
        setPendingCount(count + failed);
    }, []);

    useEffect(() => {
        // Verification initiale
        NetInfo.fetch().then(state => {
            const connected = state.isConnected === true;
            setIsOnline(connected);
            setOnlineStatus(connected);
        });

        // Ecouter les changements en temps reel
        const unsub = NetInfo.addEventListener(state => {
            const connected = state.isConnected === true;
            setIsOnline(connected);
            setOnlineStatus(connected);
        });

        return unsub;
    }, []);

    // Ecouter les changements d'etat du syncManager
    useEffect(() => {
        const unsub = syncManager.on((state, detail, progress) => {
            setSyncState(state);
            if (detail) setSyncResult(detail);
            if (progress) setSyncProgress(progress);
            // Apres sync reussi ou erreur, recalculer le pending count
            if (state === 'done' || state === 'error') {
                refreshPendingCount();
            }
        });
        return unsub;
    }, [refreshPendingCount]);

    // Rafraichir le pending count au demarrage et quand isOnline change
    useEffect(() => {
        refreshPendingCount();
    }, [isOnline, refreshPendingCount]);

    const addToPendingCount = useCallback((n: number) => {
        setPendingCount(prev => prev + n);
    }, []);

    const resetPendingCount = useCallback(() => {
        setPendingCount(0);
    }, []);

    const triggerSync = useCallback(async () => {
        await syncManager.sync();
    }, []);

    const value = useMemo(() => ({
        isOnline, pendingCount, syncState, syncResult, syncProgress, userRole,
        addToPendingCount, resetPendingCount, triggerSync, setUserRole,
    }), [isOnline, pendingCount, syncState, syncResult, syncProgress, userRole,
        addToPendingCount, resetPendingCount, triggerSync, setUserRole]);

    return (
        <NetworkContext.Provider value={value}>
            {children}
        </NetworkContext.Provider>
    );
};

export const useNetwork = () => useContext(NetworkContext);
