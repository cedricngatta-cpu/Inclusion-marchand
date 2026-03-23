// Service de détection réseau — EventEmitter + hook useNetworkStatus
// Complète NetworkContext avec un bus d'événements pour le syncManager
import { useState, useEffect } from 'react';
import { Platform } from 'react-native';
import NetInfo, { NetInfoState } from '@react-native-community/netinfo';

type NetworkListener = (online: boolean) => void;

class NetworkStatusEmitter {
    private listeners: NetworkListener[] = [];
    private _isOnline = true;

    get isOnline() { return this._isOnline; }
    get isOffline() { return !this._isOnline; }

    constructor() {
        this.init();
    }

    private init() {
        if (Platform.OS === 'web' && typeof window !== 'undefined') {
            this._isOnline = navigator.onLine;
            window.addEventListener('online', () => this.update(true));
            window.addEventListener('offline', () => this.update(false));
        } else {
            NetInfo.fetch().then(state => {
                this._isOnline = state.isConnected === true;
            });
            NetInfo.addEventListener((state: NetInfoState) => {
                this.update(state.isConnected === true);
            });
        }
    }

    private update(online: boolean) {
        const prev = this._isOnline;
        this._isOnline = online;
        if (prev !== online) {
            this.listeners.forEach(fn => fn(online));
        }
    }

    on(listener: NetworkListener): () => void {
        this.listeners.push(listener);
        return () => {
            this.listeners = this.listeners.filter(fn => fn !== listener);
        };
    }
}

// Singleton global
export const networkStatus = new NetworkStatusEmitter();

// Hook React
export function useNetworkStatus() {
    const [isOnline, setIsOnline] = useState(networkStatus.isOnline);

    useEffect(() => {
        setIsOnline(networkStatus.isOnline);
        return networkStatus.on(setIsOnline);
    }, []);

    return { isOnline, isOffline: !isOnline };
}
