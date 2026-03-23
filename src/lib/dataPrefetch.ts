// Pre-chargement des donnees au login — marchands et producteurs uniquement
// Remplit le cache offline pour que l'app fonctionne sans connexion
import { supabase } from './supabase';
import { offlineCache, CACHE_KEYS, CACHE_TTL, isOfflineEligible } from './offlineCache';

const log = (...args: any[]) => { if (__DEV__) console.log('[Prefetch]', ...args); };

export async function prefetchAllData(
    storeId: string,
    userId: string,
    role: string,
): Promise<void> {
    if (!isOfflineEligible(role)) {
        log('Role', role, '— pas de prefetch offline');
        return;
    }

    log('Demarrage prefetch pour', role, '— store:', storeId);
    const start = Date.now();

    try {
        const [products, stock, transactions, credits, notifications] = await Promise.all([
            supabase.from('products').select('*').eq('store_id', storeId),
            supabase.from('stock').select('*').eq('store_id', storeId),
            supabase.from('transactions').select('*').eq('store_id', storeId)
                .order('created_at', { ascending: false }).limit(500),
            supabase.from('credits_clients').select('*').eq('marchand_id', userId),
            supabase.from('notifications').select('*').eq('user_id', userId)
                .order('created_at', { ascending: false }).limit(100),
        ]);

        await Promise.all([
            products.data && offlineCache.set(CACHE_KEYS.products(storeId), products.data, CACHE_TTL.CRITICAL),
            stock.data && offlineCache.set(CACHE_KEYS.stock(storeId), stock.data, CACHE_TTL.CRITICAL),
            transactions.data && offlineCache.set(CACHE_KEYS.transactions(storeId), transactions.data, CACHE_TTL.IMPORTANT),
            credits.data && offlineCache.set(CACHE_KEYS.credits(userId), credits.data, CACHE_TTL.IMPORTANT),
            notifications.data && offlineCache.set(CACHE_KEYS.notifications(userId), notifications.data, CACHE_TTL.OPTIONAL),
        ]);

        log('Prefetch termine en', Date.now() - start, 'ms —',
            'produits:', products.data?.length ?? 0,
            'stock:', stock.data?.length ?? 0,
            'transactions:', transactions.data?.length ?? 0,
        );
    } catch (err) {
        console.warn('[Prefetch] Erreur (non bloquante):', err);
    }
}
