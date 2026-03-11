// Contexte réseau — détecte la connectivité en temps réel + compteur offline
import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import NetInfo from '@react-native-community/netinfo';

interface NetworkContextType {
    isOnline: boolean;
    pendingCount: number;
    addToPendingCount: (n: number) => void;
    resetPendingCount: () => void;
}

const NetworkContext = createContext<NetworkContextType>({
    isOnline: true,
    pendingCount: 0,
    addToPendingCount: () => {},
    resetPendingCount: () => {},
});

export const NetworkProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [isOnline, setIsOnline] = useState(true);
    const [pendingCount, setPendingCount] = useState(0);

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

    const addToPendingCount = useCallback((n: number) => {
        setPendingCount(prev => prev + n);
    }, []);

    const resetPendingCount = useCallback(() => {
        setPendingCount(0);
    }, []);

    return (
        <NetworkContext.Provider value={{ isOnline, pendingCount, addToPendingCount, resetPendingCount }}>
            {children}
        </NetworkContext.Provider>
    );
};

export const useNetwork = () => useContext(NetworkContext);
