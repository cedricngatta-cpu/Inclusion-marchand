// Remplacement de localStorage par AsyncStorage (React Native)
import AsyncStorage from '@react-native-async-storage/async-storage';

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
