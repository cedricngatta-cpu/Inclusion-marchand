// Publier un produit — Producteur (avec photo + unité)
import React, { useState } from 'react';
import {
    View, Text, ScrollView, StyleSheet, TouchableOpacity,
    TextInput, Alert, ActivityIndicator, Image, KeyboardAvoidingView, Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Camera, X } from 'lucide-react-native';
import { ScreenHeader } from '@/src/components/ui';
import * as ImagePicker from 'expo-image-picker';
import { supabase } from '@/src/lib/supabase';
import { colors } from '@/src/lib/colors';
import { useProfileContext } from '@/src/context/ProfileContext';
import { emitEvent } from '@/src/lib/socket';

const CATEGORIES    = ['Alimentation', 'Céréales', 'Légumes', 'Fruits', 'Élevage', 'Autre'] as const;
const UNITES        = ['kg', 'sac', 'carton', 'unité', 'litre'] as const;
const ZONES_LIVR    = ['Abidjan', 'Bouaké', 'Yamoussoukro', 'San Pédro', 'Daloa', 'Tout le pays'] as const;
const DELAIS_LIVR   = ['Sous 24h', '1-2 jours', '3-5 jours', '1 semaine', '+ de 1 semaine'] as const;
type Categorie   = (typeof CATEGORIES)[number];
type Unite       = (typeof UNITES)[number];
type ZoneLivr    = (typeof ZONES_LIVR)[number];
type DelaiLivr   = (typeof DELAIS_LIVR)[number];

export default function PublierScreen() {
    const router = useRouter();
    const { activeProfile } = useProfileContext();

    const [imageUri,          setImageUri]          = useState<string | null>(null);
    const [nom,               setNom]               = useState('');
    const [description,       setDescription]       = useState('');
    const [prix,              setPrix]              = useState('');
    const [prixLivraison,     setPrixLivraison]     = useState('');
    const [quantite,          setQuantite]          = useState('');
    const [unite,             setUnite]             = useState<Unite>('unité');
    const [zoneLivraison,     setZoneLivraison]     = useState<ZoneLivr>('Abidjan');
    const [delaiLivraison,    setDelaiLivraison]    = useState<DelaiLivr>('3-5 jours');
    const [livreurNom,        setLivreurNom]        = useState('');
    const [livreurTelephone,  setLivreurTelephone]  = useState('');
    const [categorie,         setCategorie]         = useState<Categorie>('Alimentation');
    const [loading,           setLoading]           = useState(false);

    // ── Sélection photo ─────────────────────────────────────────────────────
    const handlePickImage = () => {
        Alert.alert('Photo du produit', 'Choisissez une option', [
            { text: 'Prendre une photo', onPress: pickFromCamera },
            { text: 'Choisir dans la galerie', onPress: pickFromGallery },
            { text: 'Annuler', style: 'cancel' },
        ]);
    };

    const pickFromCamera = async () => {
        const perm = await ImagePicker.requestCameraPermissionsAsync();
        if (!perm.granted) { Alert.alert('Permission refusée', 'Activez l\'accès à la caméra dans les paramètres.'); return; }
        const result = await ImagePicker.launchCameraAsync({
            mediaTypes: ImagePicker.MediaTypeOptions.Images,
            allowsEditing: true, aspect: [1, 1], quality: 0.7,
        });
        if (!result.canceled && result.assets[0]) setImageUri(result.assets[0].uri);
    };

    const pickFromGallery = async () => {
        const result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ImagePicker.MediaTypeOptions.Images,
            allowsEditing: true, aspect: [1, 1], quality: 0.7,
        });
        if (!result.canceled && result.assets[0]) setImageUri(result.assets[0].uri);
    };

    // ── Upload Supabase Storage ─────────────────────────────────────────────
    const uploadImage = async (uri: string): Promise<string | null> => {
        try {
            const fileName = `product_${Date.now()}.jpg`;
            const response = await fetch(uri);
            const blob = await response.blob();
            const { error } = await supabase.storage
                .from('products')
                .upload(fileName, blob, { contentType: 'image/jpeg', upsert: true });
            if (error) { console.warn('[Publier] upload error:', error.message); return null; }
            const { data } = supabase.storage.from('products').getPublicUrl(fileName);
            return data.publicUrl;
        } catch (e) {
            console.warn('[Publier] upload exception:', e);
            return null;
        }
    };

    // ── Soumission ──────────────────────────────────────────────────────────
    const handlePublish = async () => {
        if (!nom.trim() || !prix) {
            Alert.alert('Champs requis', 'Le nom et le prix sont obligatoires.');
            return;
        }
        if (!activeProfile) return;

        setLoading(true);
        try {
            // Upload photo si sélectionnée
            let imageUrl: string | null = null;
            if (imageUri) imageUrl = await uploadImage(imageUri);

            const insertPayload = {
                store_id:           activeProfile.id,
                name:               nom.trim(),
                category:           categorie,
                price:              parseFloat(prix),
                delivery_price:     prixLivraison ? parseFloat(prixLivraison) : null,
                description:        description.trim() || null,
                image_url:          imageUrl,
                zone_livraison:     zoneLivraison,
                delai_livraison:    delaiLivraison,
                unite:              unite,
                livreur_nom:        livreurNom.trim() || null,
                livreur_telephone:  livreurTelephone.trim() || null,
            };

            const { data, error } = await supabase
                .from('products')
                .insert([insertPayload])
                .select()
                .single();

            if (error) throw error;

            if (data && quantite) {
                const stockPayload = {
                    product_id: data.id,
                    store_id:   activeProfile.id,
                    quantity:   parseInt(quantite, 10),
                    updated_at: new Date().toISOString(),
                };
                const { error: stockErr } = await supabase.from('stock').upsert(stockPayload);
                if (stockErr) console.warn('[Publier] stock upsert:', stockErr.message);
            }

            emitEvent('nouveau-produit-marche', {
                productId:       data?.id,
                productName:     nom.trim(),
                price:           parseFloat(prix),
                deliveryPrice:   prixLivraison ? parseFloat(prixLivraison) : 0,
                quantity:        quantite ? parseInt(quantite, 10) : 0,
                unit:            unite,
                zoneLivraison,
                delaiLivraison,
                producerName:    activeProfile.name,
                storeId:         activeProfile.id,
                imageUrl,
            });

            // Log activité
            try {
                await supabase.from('activity_logs').insert([{
                    user_id:   activeProfile.id ?? null,
                    user_name: activeProfile.name ?? 'Producteur',
                    action:    `Produit publié : ${nom.trim()} — ${parseFloat(prix).toLocaleString('fr-FR')} F (${categorie})`,
                    type:      'publication',
                }]);
            } catch {}

            Alert.alert('Succès', 'Produit publié sur le Marché Virtuel !',
                [{ text: 'OK', onPress: () => router.back() }]
            );
        } catch (err: any) {
            Alert.alert('Erreur', err.message || 'Impossible de publier le produit.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <KeyboardAvoidingView
            style={styles.safe}
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
            <ScreenHeader
                title="Publier un produit"
                subtitle="Marché virtuel"
                showBack={true}
            />

            {/* ── FORMULAIRE ── */}
            <ScrollView
                style={styles.scroll}
                contentContainerStyle={styles.scrollContent}
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
            >
                {/* 1. Photo */}
                <View style={styles.field}>
                    <Text style={styles.label}>Photo du produit</Text>
                    <TouchableOpacity style={styles.photoBtn} onPress={handlePickImage} activeOpacity={0.8}>
                        {imageUri ? (
                            <>
                                <Image source={{ uri: imageUri }} style={styles.photoPreview} />
                                <TouchableOpacity
                                    style={styles.photoRemove}
                                    onPress={() => setImageUri(null)}
                                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                                >
                                    <X color={colors.white} size={14} />
                                </TouchableOpacity>
                            </>
                        ) : (
                            <View style={styles.photoPlaceholder}>
                                <Camera color={colors.slate300} size={36} />
                                <Text style={styles.photoHint}>Ajouter une photo</Text>
                                <Text style={styles.photoSubHint}>Caméra ou galerie</Text>
                            </View>
                        )}
                    </TouchableOpacity>
                </View>

                {/* 2. Nom */}
                <View style={styles.field}>
                    <Text style={styles.label}>Nom du produit *</Text>
                    <TextInput
                        style={styles.input}
                        placeholder="Ex : Maïs local, Tomates..."
                        placeholderTextColor={colors.slate400}
                        value={nom}
                        onChangeText={setNom}
                        autoCapitalize="words"
                    />
                </View>

                {/* 3. Description */}
                <View style={styles.field}>
                    <Text style={styles.label}>Description <Text style={styles.optional}>optionnel</Text></Text>
                    <TextInput
                        style={[styles.input, styles.inputMultiline]}
                        placeholder="Décrivez votre produit : qualité, origine, conditionnement..."
                        placeholderTextColor={colors.slate400}
                        value={description}
                        onChangeText={setDescription}
                        multiline
                        numberOfLines={3}
                        textAlignVertical="top"
                    />
                </View>

                {/* 4. Prix unitaire */}
                <View style={styles.field}>
                    <Text style={styles.label}>Prix unitaire (F CFA) *</Text>
                    <TextInput
                        style={styles.input}
                        placeholder="Ex : 500"
                        placeholderTextColor={colors.slate400}
                        value={prix}
                        onChangeText={setPrix}
                        keyboardType="numeric"
                    />
                </View>

                {/* 5. Prix de livraison */}
                <View style={styles.field}>
                    <Text style={styles.label}>Prix de livraison (F CFA) <Text style={styles.optional}>optionnel</Text></Text>
                    <TextInput
                        style={styles.input}
                        placeholder="Ex : 1000 (0 si gratuit)"
                        placeholderTextColor={colors.slate400}
                        value={prixLivraison}
                        onChangeText={setPrixLivraison}
                        keyboardType="numeric"
                    />
                </View>

                {/* 6. Quantité */}
                <View style={styles.field}>
                    <Text style={styles.label}>Quantité disponible</Text>
                    <TextInput
                        style={styles.input}
                        placeholder="Ex : 50"
                        placeholderTextColor={colors.slate400}
                        value={quantite}
                        onChangeText={setQuantite}
                        keyboardType="numeric"
                    />
                </View>

                {/* 7. Unité */}
                <View style={styles.field}>
                    <Text style={styles.label}>Unité</Text>
                    <View style={styles.categoryGrid}>
                        {UNITES.map(u => (
                            <TouchableOpacity
                                key={u}
                                style={[styles.categoryBtn, unite === u && styles.categoryBtnActive]}
                                onPress={() => setUnite(u)}
                                activeOpacity={0.8}
                            >
                                <Text style={[styles.categoryBtnText, unite === u && styles.categoryBtnTextActive]}>{u}</Text>
                            </TouchableOpacity>
                        ))}
                    </View>
                </View>

                {/* 8. Zone de livraison */}
                <View style={styles.field}>
                    <Text style={styles.label}>Zone de livraison</Text>
                    <View style={styles.categoryGrid}>
                        {ZONES_LIVR.map(z => (
                            <TouchableOpacity
                                key={z}
                                style={[styles.categoryBtn, zoneLivraison === z && styles.categoryBtnActive]}
                                onPress={() => setZoneLivraison(z)}
                                activeOpacity={0.8}
                            >
                                <Text style={[styles.categoryBtnText, zoneLivraison === z && styles.categoryBtnTextActive]}>{z}</Text>
                            </TouchableOpacity>
                        ))}
                    </View>
                </View>

                {/* 9. Délai de livraison */}
                <View style={styles.field}>
                    <Text style={styles.label}>Délai de livraison estimé</Text>
                    <View style={styles.categoryGrid}>
                        {DELAIS_LIVR.map(d => (
                            <TouchableOpacity
                                key={d}
                                style={[styles.categoryBtn, delaiLivraison === d && styles.categoryBtnActive]}
                                onPress={() => setDelaiLivraison(d)}
                                activeOpacity={0.8}
                            >
                                <Text style={[styles.categoryBtnText, delaiLivraison === d && styles.categoryBtnTextActive]}>{d}</Text>
                            </TouchableOpacity>
                        ))}
                    </View>
                </View>

                {/* 10. Informations livreur */}
                <View style={styles.field}>
                    <Text style={styles.label}>Nom du livreur <Text style={styles.optional}>optionnel</Text></Text>
                    <TextInput
                        style={styles.input}
                        placeholder="Ex : Koné Moussa"
                        placeholderTextColor={colors.slate400}
                        value={livreurNom}
                        onChangeText={setLivreurNom}
                        autoCapitalize="words"
                    />
                </View>

                <View style={styles.field}>
                    <Text style={styles.label}>Téléphone du livreur <Text style={styles.optional}>optionnel</Text></Text>
                    <TextInput
                        style={styles.input}
                        placeholder="Ex : 0701020304"
                        placeholderTextColor={colors.slate400}
                        value={livreurTelephone}
                        onChangeText={setLivreurTelephone}
                        keyboardType="phone-pad"
                    />
                </View>

                {/* 12. Catégorie */}
                <View style={styles.field}>
                    <Text style={styles.label}>Catégorie</Text>
                    <View style={styles.categoryGrid}>
                        {CATEGORIES.map(cat => (
                            <TouchableOpacity
                                key={cat}
                                style={[styles.categoryBtn, categorie === cat && styles.categoryBtnActive]}
                                onPress={() => setCategorie(cat)}
                                activeOpacity={0.8}
                            >
                                <Text style={[styles.categoryBtnText, categorie === cat && styles.categoryBtnTextActive]}>{cat}</Text>
                            </TouchableOpacity>
                        ))}
                    </View>
                </View>

                {/* 13. Bouton publier */}
                <TouchableOpacity
                    style={[styles.publishBtn, loading && { opacity: 0.6 }]}
                    onPress={handlePublish}
                    disabled={loading}
                    activeOpacity={0.85}
                >
                    {loading ? (
                        <ActivityIndicator color={colors.white} />
                    ) : (
                        <Text style={styles.publishBtnText}>PUBLIER SUR LE MARCHÉ</Text>
                    )}
                </TouchableOpacity>
            </ScrollView>
        </KeyboardAvoidingView>
    );
}

const styles = StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.bgSecondary },

    scroll:        { flex: 1 },
    scrollContent: { paddingHorizontal: 16, paddingTop: 24, paddingBottom: 40, gap: 16 },

    field: { gap: 8 },
    label: { fontSize: 12, fontWeight: '700', color: colors.slate700, letterSpacing: 0.5 },
    optional: { fontSize: 11, fontWeight: '500', color: colors.slate400 },
    input: {
        backgroundColor: colors.white, borderRadius: 10, borderWidth: 1, borderColor: colors.slate200,
        paddingHorizontal: 14, height: 50, fontSize: 14, fontWeight: '600', color: colors.slate800,
        shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 4, elevation: 1,
    },
    inputMultiline: { height: 90, paddingTop: 14 },

    // Photo
    photoBtn: {
        height: 140, borderRadius: 10, borderWidth: 1.5, borderColor: colors.slate200,
        borderStyle: 'dashed', overflow: 'hidden', position: 'relative',
        backgroundColor: colors.white,
    },
    photoPreview: { width: '100%', height: '100%', resizeMode: 'cover' },
    photoPlaceholder: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 6 },
    photoHint:    { fontSize: 13, color: colors.slate500, fontWeight: '700' },
    photoSubHint: { fontSize: 11, color: colors.slate400, fontWeight: '500' },
    photoRemove: {
        position: 'absolute', top: 8, right: 8,
        width: 28, height: 28, borderRadius: 8,
        backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center',
    },

    // Catégories / unités
    categoryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    categoryBtn: {
        paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8,
        backgroundColor: colors.white, borderWidth: 1, borderColor: colors.slate200,
    },
    categoryBtnActive:     { backgroundColor: colors.primary, borderColor: colors.primary },
    categoryBtnText:       { fontSize: 12, fontWeight: '700', color: colors.slate600 },
    categoryBtnTextActive: { color: colors.white },

    publishBtn: {
        backgroundColor: colors.primary, borderRadius: 10,
        paddingVertical: 16, alignItems: 'center', justifyContent: 'center',
        shadowColor: colors.primary, shadowOpacity: 0.3, shadowRadius: 8, elevation: 4, marginTop: 4,
    },
    publishBtnText: { fontSize: 14, fontWeight: '900', color: colors.white, letterSpacing: 1 },
});
