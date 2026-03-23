// Remplacement de localStorage par AsyncStorage (React Native)
// + Upload images vers Supabase Storage
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { supabase } from './supabase';

// ── Upload image produit vers Supabase Storage (bucket "products") ──────────
export async function uploadProductImage(
    uri: string,
    webFile?: File,
): Promise<string | null> {
    try {
        const fileName = `product_${Date.now()}_${Math.random().toString(36).slice(2, 6)}.jpg`;

        if (Platform.OS === 'web' && webFile) {
            // Web : upload direct du File object
            const { error } = await supabase.storage
                .from('products')
                .upload(fileName, webFile, { contentType: webFile.type, upsert: true });
            if (error) { console.warn('[storage] upload web error:', error.message); return null; }
        } else {
            // Mobile : fetch uri → blob
            const response = await fetch(uri);
            const blob = await response.blob();
            const { error } = await supabase.storage
                .from('products')
                .upload(fileName, blob, { contentType: 'image/jpeg', upsert: true });
            if (error) { console.warn('[storage] upload mobile error:', error.message); return null; }
        }

        const { data } = supabase.storage.from('products').getPublicUrl(fileName);
        return data.publicUrl;
    } catch (e) {
        console.warn('[storage] uploadProductImage exception:', e);
        return null;
    }
}

export const storage = {
    getItem: async (key: string): Promise<string | null> => {
        try {
            return await AsyncStorage.getItem(key);
        } catch {
            return null;
        }
    },

    setItem: async (key: string, value: string): Promise<void> => {
        try {
            await AsyncStorage.setItem(key, value);
        } catch (e) {
            console.error('[storage] setItem error:', e);
        }
    },

    removeItem: async (key: string): Promise<void> => {
        try {
            await AsyncStorage.removeItem(key);
        } catch (e) {
            console.error('[storage] removeItem error:', e);
        }
    },
};
