// Contexte produits — migré depuis Next.js
// Dexie/IndexedDB → AsyncStorage
import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import { supabase } from '@/src/lib/supabase';
import { colors } from '@/src/lib/colors';
import { useProfileContext } from './ProfileContext';

export interface Product {
    id: string;
    name: string;
    price: number;
    delivery_price?: number;
    audioName: string;
    category?: string;
    barcode?: string;
    imageUrl?: string;
    color: string;
    iconColor: string;
    store_id: string;
}

interface ProductContextType {
    products: Product[];
    isLoading: boolean;
    addProduct: (product: Omit<Product, 'id'>) => Promise<boolean>;
    updateProduct: (id: string, updates: Partial<Product>) => Promise<boolean>;
    deleteProduct: (id: string) => Promise<boolean>;
    refreshProducts: () => Promise<void>;
}

const ProductContext = createContext<ProductContextType | undefined>(undefined);

export const ProductProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const { activeProfile } = useProfileContext();
    const [products, setProducts] = useState<Product[]>([]);
    const [isLoading, setIsLoading] = useState(false);

    const cacheKey = activeProfile ? `products_${activeProfile.id}` : null;

    const fetchProducts = useCallback(async () => {
        if (!activeProfile || !cacheKey) return;
        setIsLoading(true);

        // Cache local
        const cached = await AsyncStorage.getItem(cacheKey);
        if (cached) setProducts(JSON.parse(cached));

        // Sync Supabase
        const netState = await NetInfo.fetch();
        if (netState.isConnected) {
            const { data } = await supabase
                .from('products')
                .select('*')
                .eq('store_id', activeProfile.id);

            if (data) {
                const mapped: Product[] = data.map(p => ({
                    id: p.id,
                    name: p.name,
                    price: p.price,
                    delivery_price: p.delivery_price,
                    audioName: p.audio_name || p.name,
                    category: p.category,
                    barcode: p.barcode,
                    imageUrl: p.image_url,
                    color: p.color || '#ecfdf5',
                    iconColor: p.icon_color || colors.primary,
                    store_id: p.store_id,
                }));
                setProducts(mapped);
                await AsyncStorage.setItem(cacheKey, JSON.stringify(mapped));
            }
        }
        setIsLoading(false);
    }, [activeProfile]);

    useEffect(() => {
        if (!activeProfile) { setProducts([]); return; }
        fetchProducts();

        const subscription = supabase
            .channel(`products_${activeProfile.id}`)
            .on('postgres_changes' as any, {
                event: '*', schema: 'public', table: 'products',
                filter: `store_id=eq.${activeProfile.id}`,
            }, () => fetchProducts())
            .subscribe();

        return () => { supabase.removeChannel(subscription); };
    }, [activeProfile?.id]);

    const addProduct = async (product: Omit<Product, 'id'>): Promise<boolean> => {
        if (!activeProfile) {
            console.error('[ProductContext] addProduct — activeProfile null');
            return false;
        }
        const netState = await NetInfo.fetch();
        if (!netState.isConnected) {
            console.warn('[ProductContext] addProduct — hors-ligne, impossible d\'ajouter');
            return false;
        }

        const insertPayload = {
            name:       product.name,
            price:      product.price,
            audio_name: product.audioName,
            category:   product.category,
            barcode:    product.barcode,
            image_url:  product.imageUrl,
            color:      product.color,
            icon_color: product.iconColor,
            store_id:   activeProfile.id,
        };
        console.log('[ProductContext] INSERT products payload:', insertPayload);

        const { data, error } = await supabase
            .from('products')
            .insert([insertPayload])
            .select()
            .single();

        if (error) {
            console.error('[ProductContext] ❌ INSERT products ERREUR:', error.message, '| code:', error.code, '| details:', error.details);
            return false;
        }
        console.log('[ProductContext] ✅ INSERT products OK — id:', data?.id, 'nom:', data?.name);
        await fetchProducts();
        return true;
    };

    const updateProduct = async (id: string, updates: Partial<Product>): Promise<boolean> => {
        console.log('[ProductContext] UPDATE products — id:', id, 'updates:', updates);
        // Ne mettre à jour que les champs explicitement définis (éviter d'écraser avec undefined)
        const payload: Record<string, any> = {};
        if (updates.name      !== undefined) payload.name       = updates.name;
        if (updates.price     !== undefined) payload.price      = updates.price;
        if (updates.audioName !== undefined) payload.audio_name = updates.audioName;
        if (updates.category  !== undefined) payload.category   = updates.category;
        if (updates.barcode   !== undefined) payload.barcode    = updates.barcode;
        if (updates.imageUrl  !== undefined) payload.image_url  = updates.imageUrl;
        if (updates.color     !== undefined) payload.color      = updates.color;
        if (updates.iconColor !== undefined) payload.icon_color = updates.iconColor;
        const { error } = await supabase.from('products').update(payload).eq('id', id);
        if (error) {
            console.error('[ProductContext] ❌ UPDATE products ERREUR:', error.message);
            return false;
        }
        console.log('[ProductContext] ✅ UPDATE products OK — id:', id);
        await fetchProducts();
        return true;
    };

    const deleteProduct = async (id: string): Promise<boolean> => {
        console.log('[ProductContext] DELETE products — id:', id);
        const { error } = await supabase.from('products').delete().eq('id', id);
        if (error) {
            console.error('[ProductContext] ❌ DELETE products ERREUR:', error.message);
            return false;
        }
        console.log('[ProductContext] ✅ DELETE products OK — id:', id);
        await fetchProducts();
        return true;
    };

    return (
        <ProductContext.Provider value={{ products, isLoading, addProduct, updateProduct, deleteProduct, refreshProducts: fetchProducts }}>
            {children}
        </ProductContext.Provider>
    );
};

export const useProductContext = () => {
    const context = useContext(ProductContext);
    if (!context) throw new Error('useProductContext must be used within a ProductProvider');
    return context;
};
