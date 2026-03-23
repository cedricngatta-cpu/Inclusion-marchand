// Cache offline unifié — AsyncStorage (mobile) / localStorage (web)
// Clés structurées : julaba:<type>:<id>
// TTL optionnel, timestamp de mise à jour, limite de taille
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

const PREFIX = 'julaba:';
const MAX_CACHE_BYTES = 50 * 1024 * 1024; // 50 MB

interface CacheEntry<T = any> {
    data: T;
    updatedAt: number;   // timestamp ms
    expiresAt?: number;  // timestamp ms (null = pas d'expiration)
}

// ── Helpers stockage bas niveau ─────────────────────────────────────────────

async function rawGet(key: string): Promise<string | null> {
    if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
        return localStorage.getItem(key);
    }
    return AsyncStorage.getItem(key);
}

async function rawSet(key: string, value: string): Promise<void> {
    if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
        localStorage.setItem(key, value);
        return;
    }
    await AsyncStorage.setItem(key, value);
}

async function rawRemove(key: string): Promise<void> {
    if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
        localStorage.removeItem(key);
        return;
    }
    await AsyncStorage.removeItem(key);
}

async function rawAllKeys(): Promise<string[]> {
    if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
        const keys: string[] = [];
        for (let i = 0; i < localStorage.length; i++) {
            const k = localStorage.key(i);
            if (k?.startsWith(PREFIX)) keys.push(k);
        }
        return keys;
    }
    const all = await AsyncStorage.getAllKeys();
    return all.filter(k => k.startsWith(PREFIX));
}

// ── API publique ────────────────────────────────────────────────────────────

export const offlineCache = {
    /**
     * Stocker des données avec TTL optionnel (en secondes)
     */
    async set<T>(key: string, data: T, ttlSeconds?: number): Promise<void> {
        const fullKey = PREFIX + key;
        const entry: CacheEntry<T> = {
            data,
            updatedAt: Date.now(),
            expiresAt: ttlSeconds ? Date.now() + ttlSeconds * 1000 : undefined,
        };
        try {
            await rawSet(fullKey, JSON.stringify(entry));
        } catch (err) {
            // Espace plein — purger les anciennes entrées
            console.warn('[offlineCache] set failed, purging old entries:', err);
            await this.purgeOldest(5);
            try { await rawSet(fullKey, JSON.stringify(entry)); } catch { /* abandon */ }
        }
    },

    /**
     * Récupérer des données (null si absent ou expiré)
     */
    async get<T>(key: string): Promise<{ data: T; updatedAt: number } | null> {
        const fullKey = PREFIX + key;
        try {
            const raw = await rawGet(fullKey);
            if (!raw) return null;
            const entry: CacheEntry<T> = JSON.parse(raw);
            // Vérifier l'expiration
            if (entry.expiresAt && Date.now() > entry.expiresAt) {
                await rawRemove(fullKey);
                return null;
            }
            return { data: entry.data, updatedAt: entry.updatedAt };
        } catch {
            // Données corrompues
            await rawRemove(fullKey);
            return null;
        }
    },

    /**
     * Supprimer une entrée
     */
    async remove(key: string): Promise<void> {
        await rawRemove(PREFIX + key);
    },

    /**
     * Vider tout le cache julaba
     */
    async clear(): Promise<void> {
        const keys = await rawAllKeys();
        for (const k of keys) {
            await rawRemove(k);
        }
    },

    /**
     * Purger les N entrées les plus anciennes
     */
    async purgeOldest(count: number): Promise<void> {
        const keys = await rawAllKeys();
        const entries: { key: string; updatedAt: number }[] = [];

        for (const k of keys) {
            try {
                const raw = await rawGet(k);
                if (raw) {
                    const entry: CacheEntry = JSON.parse(raw);
                    entries.push({ key: k, updatedAt: entry.updatedAt });
                }
            } catch {
                // Entrée corrompue, supprimer
                await rawRemove(k);
            }
        }

        entries.sort((a, b) => a.updatedAt - b.updatedAt);
        const toDelete = entries.slice(0, count);
        for (const e of toDelete) {
            await rawRemove(e.key);
        }
    },

    /**
     * Taille estimée du cache en bytes
     */
    async estimateSize(): Promise<number> {
        const keys = await rawAllKeys();
        let total = 0;
        for (const k of keys) {
            const raw = await rawGet(k);
            if (raw) total += raw.length * 2; // UTF-16
        }
        return total;
    },

    /**
     * Vérifier et purger si le cache dépasse la limite
     */
    async enforceLimit(): Promise<void> {
        const size = await this.estimateSize();
        if (size > MAX_CACHE_BYTES) {
            const excess = Math.ceil((size - MAX_CACHE_BYTES * 0.8) / (100 * 1024)); // purger par tranches
            await this.purgeOldest(Math.max(excess, 3));
        }
    },
};

// ── Clés de cache par domaine ───────────────────────────────────────────────
// Utilisées par les contexts pour structurer les clés de manière cohérente

export const CACHE_KEYS = {
    products:      (storeId: string) => `products:${storeId}`,
    stock:         (storeId: string) => `stock:${storeId}`,
    transactions:  (storeId: string) => `transactions:${storeId}`,
    profile:       (userId: string)  => `profile:${userId}`,
    notifications: (userId: string)  => `notifications:${userId}`,
    credits:       (userId: string)  => `credits:${userId}`,
    orders:        (storeId: string) => `orders:${storeId}`,
} as const;

// TTL par priorité (en secondes)
export const CACHE_TTL = {
    CRITICAL: undefined,           // Pas d'expiration (profil, produits, stock)
    IMPORTANT: 7 * 24 * 3600,     // 7 jours (transactions, crédits, commandes)
    OPTIONAL: 24 * 3600,          // 1 jour (notifications, stats)
} as const;

// ── Guard rôle offline ──────────────────────────────────────────────────────
// Seuls les marchands et producteurs bénéficient du mode offline complet.
// Agents, coopératives et admins nécessitent toujours internet.
export function isOfflineEligible(role: string | undefined): boolean {
    return role === 'MERCHANT' || role === 'PRODUCER';
}
