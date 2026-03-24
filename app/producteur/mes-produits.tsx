// Mes Produits — Producteur
// Liste + édition/suppression des produits publiés sur le Marché Virtuel
import React, { useState, useCallback } from 'react';
import {
    View, Text, ScrollView, StyleSheet, TouchableOpacity,
    TextInput, Alert, ActivityIndicator, Image, Modal,
    Platform, useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { getImageThumbnail } from '@/src/lib/imageUtils';
import { useRouter, useFocusEffect } from 'expo-router';
import { Camera, X, Edit2, Trash2, Package, ChevronLeft } from 'lucide-react-native';
import { ScreenHeader } from '@/src/components/ui';
import * as ImagePicker from 'expo-image-picker';
import { supabase } from '@/src/lib/supabase';
import { colors } from '@/src/lib/colors';
import { useProfileContext } from '@/src/context/ProfileContext';
import { emitEvent } from '@/src/lib/socket';

// ── Constantes partagées avec publier.tsx ──────────────────────────────────────
const CATEGORIES    = ['Alimentation', 'Céréales', 'Légumes', 'Fruits', 'Élevage', 'Autre'] as const;
const UNITES        = ['kg', 'sac', 'carton', 'unité', 'litre'] as const;
const ZONES_LIVR    = ['Abidjan', 'Bouaké', 'Yamoussoukro', 'San Pédro', 'Daloa', 'Tout le pays'] as const;
const DELAIS_LIVR   = ['Sous 24h', '1-2 jours', '3-5 jours', '1 semaine', '+ de 1 semaine'] as const;
type Categorie = (typeof CATEGORIES)[number];
type Unite     = (typeof UNITES)[number];
type ZoneLivr  = (typeof ZONES_LIVR)[number];
type DelaiLivr = (typeof DELAIS_LIVR)[number];

// ── Type produit ───────────────────────────────────────────────────────────────
interface Produit {
    id: string;
    name: string;
    price: number;
    delivery_price: number | null;
    description: string | null;
    image_url: string | null;
    category: string | null;
    zone_livraison: string | null;
    delai_livraison: string | null;
    store_id: string;
    // quantité depuis table stock
    stock_quantity: number;
}

// ── Composant principal ────────────────────────────────────────────────────────
export default function MesProduits() {
    const router = useRouter();
    const { activeProfile } = useProfileContext();
    const { width } = useWindowDimensions();
    const isDesktop = Platform.OS === 'web' && width > 768;

    const [produits, setProduits]   = useState<Produit[]>([]);
    const [loading, setLoading]     = useState(true);
    const [editModal, setEditModal] = useState(false);
    const [saving, setSaving]       = useState(false);

    // Champs du formulaire d'édition
    const [selectedProduit, setSelectedProduit] = useState<Produit | null>(null);
    const [nom,            setNom]            = useState('');
    const [description,    setDescription]    = useState('');
    const [prix,           setPrix]           = useState('');
    const [prixLivraison,  setPrixLivraison]  = useState('');
    const [quantite,       setQuantite]       = useState('');
    const [categorie,      setCategorie]      = useState<Categorie>('Alimentation');
    const [unite,          setUnite]          = useState<Unite>('unité');
    const [zoneLivraison,  setZoneLivraison]  = useState<ZoneLivr>('Abidjan');
    const [delaiLivraison, setDelaiLivraison] = useState<DelaiLivr>('3-5 jours');
    const [imageUri,       setImageUri]       = useState<string | null>(null);
    const [imageUrl,       setImageUrl]       = useState<string | null>(null); // URL Supabase existante

    // ── Chargement des produits ────────────────────────────────────────────────
    const fetchProduits = useCallback(async () => {
        if (!activeProfile) return;
        setLoading(true);
        try {
            const { data: prods, error } = await supabase
                .from('products')
                .select('id, name, price, delivery_price, description, image_url, category, zone_livraison, delai_livraison, store_id')
                .eq('store_id', activeProfile.id)
                .order('created_at', { ascending: false });

            if (error) throw error;

            // Récupérer les quantités depuis la table stock
            const ids = (prods ?? []).map((p: any) => p.id);
            let stockMap: Record<string, number> = {};
            if (ids.length > 0) {
                const { data: stocks } = await supabase
                    .from('stock')
                    .select('product_id, quantity')
                    .in('product_id', ids)
                    .eq('store_id', activeProfile.id);
                (stocks ?? []).forEach((s: any) => { stockMap[s.product_id] = s.quantity ?? 0; });
            }

            const enriched: Produit[] = (prods ?? []).map((p: any) => ({
                ...p,
                stock_quantity: stockMap[p.id] ?? 0,
            }));
            setProduits(enriched);
        } catch (err: any) {
            console.error('[MesProduits] fetch error:', err.message);
        } finally {
            setLoading(false);
        }
    }, [activeProfile]);

    // Recharge à chaque visite
    useFocusEffect(useCallback(() => { fetchProduits(); }, [fetchProduits]));

    // ── Ouvrir le formulaire d'édition ────────────────────────────────────────
    const openEdit = (p: Produit) => {
        setSelectedProduit(p);
        setNom(p.name);
        setDescription(p.description ?? '');
        setPrix(String(p.price));
        setPrixLivraison(p.delivery_price != null ? String(p.delivery_price) : '');
        setQuantite(String(p.stock_quantity));
        setCategorie((CATEGORIES.includes(p.category as any) ? p.category : 'Alimentation') as Categorie);
        setUnite('unité');
        setZoneLivraison((ZONES_LIVR.includes(p.zone_livraison as any) ? p.zone_livraison : 'Abidjan') as ZoneLivr);
        setDelaiLivraison((DELAIS_LIVR.includes(p.delai_livraison as any) ? p.delai_livraison : '3-5 jours') as DelaiLivr);
        setImageUri(null);
        setImageUrl(p.image_url);
        setEditModal(true);
    };

    // ── Sélection photo ────────────────────────────────────────────────────────
    const handlePickImage = () => {
        Alert.alert('Photo du produit', 'Choisissez une option', [
            { text: 'Prendre une photo', onPress: pickFromCamera },
            { text: 'Choisir dans la galerie', onPress: pickFromGallery },
            { text: 'Annuler', style: 'cancel' },
        ]);
    };

    const pickFromCamera = async () => {
        const perm = await ImagePicker.requestCameraPermissionsAsync();
        if (!perm.granted) { Alert.alert('Permission refusée', 'Activez l\'accès à la caméra.'); return; }
        const result = await ImagePicker.launchCameraAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, allowsEditing: true, aspect: [1, 1], quality: 0.7 });
        if (!result.canceled && result.assets[0]) { setImageUri(result.assets[0].uri); setImageUrl(null); }
    };

    const pickFromGallery = async () => {
        const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, allowsEditing: true, aspect: [1, 1], quality: 0.7 });
        if (!result.canceled && result.assets[0]) { setImageUri(result.assets[0].uri); setImageUrl(null); }
    };

    // ── Upload image ───────────────────────────────────────────────────────────
    const uploadImage = async (uri: string): Promise<string | null> => {
        try {
            const fileName = `product_${Date.now()}.jpg`;
            const response = await fetch(uri);
            const blob = await response.blob();
            const { error } = await supabase.storage.from('products').upload(fileName, blob, { contentType: 'image/jpeg', upsert: true });
            if (error) { console.warn('[MesProduits] upload error:', error.message); return null; }
            const { data } = supabase.storage.from('products').getPublicUrl(fileName);
            return data.publicUrl;
        } catch (e) {
            console.warn('[MesProduits] upload exception:', e);
            return null;
        }
    };

    // ── Enregistrer les modifications ──────────────────────────────────────────
    const handleSave = async () => {
        if (!selectedProduit || !activeProfile) return;
        if (!nom.trim() || !prix) {
            Alert.alert('Champs requis', 'Le nom et le prix sont obligatoires.');
            return;
        }
        setSaving(true);
        try {
            // Upload nouvelle image si changée
            let finalImageUrl = imageUrl;
            if (imageUri) finalImageUrl = await uploadImage(imageUri);

            const updatePayload: any = {
                name:            nom.trim(),
                category:        categorie,
                price:           parseFloat(prix),
                delivery_price:  prixLivraison ? parseFloat(prixLivraison) : null,
                description:     description.trim() || null,
                image_url:       finalImageUrl,
                zone_livraison:  zoneLivraison,
                delai_livraison: delaiLivraison,
            };

            const { error } = await supabase
                .from('products')
                .update(updatePayload)
                .eq('id', selectedProduit.id);
            if (error) throw error;

            // Mettre à jour le stock
            const { error: stockErr } = await supabase
                .from('stock')
                .upsert({
                    product_id: selectedProduit.id,
                    store_id:   activeProfile.id,
                    quantity:   quantite ? parseInt(quantite, 10) : 0,
                    updated_at: new Date().toISOString(),
                });
            if (stockErr) console.warn('[MesProduits] stock upsert error:', stockErr.message);

            // Événement Socket.io
            emitEvent('produit-modifie', {
                productId:     selectedProduit.id,
                productName:   nom.trim(),
                price:         parseFloat(prix),
                deliveryPrice: prixLivraison ? parseFloat(prixLivraison) : 0,
                quantity:      quantite ? parseInt(quantite, 10) : 0,
                storeId:       activeProfile.id,
                producerName:  activeProfile.name,
                imageUrl:      finalImageUrl,
            });

            setEditModal(false);
            fetchProduits();
            Alert.alert('Succès', 'Produit mis à jour avec succès.');
        } catch (err: any) {
            Alert.alert('Erreur', err.message || 'Impossible de mettre à jour le produit.');
        } finally {
            setSaving(false);
        }
    };

    // ── Supprimer un produit ───────────────────────────────────────────────────
    const handleDelete = (p: Produit) => {
        Alert.alert(
            'Supprimer le produit',
            `Voulez-vous vraiment supprimer "${p.name}" ? Cette action est irréversible.`,
            [
                { text: 'Annuler', style: 'cancel' },
                {
                    text: 'Supprimer', style: 'destructive',
                    onPress: async () => {
                        try {
                            // Supprimer le stock associé d'abord
                            await supabase.from('stock').delete().eq('product_id', p.id);
                            const { error } = await supabase.from('products').delete().eq('id', p.id);
                            if (error) throw error;

                            emitEvent('produit-supprime', {
                                productId:    p.id,
                                productName:  p.name,
                                storeId:      activeProfile?.id,
                                producerName: activeProfile?.name,
                            });

                            setEditModal(false);
                            fetchProduits();
                        } catch (err: any) {
                            Alert.alert('Erreur', err.message || 'Impossible de supprimer le produit.');
                        }
                    },
                },
            ]
        );
    };

    // ── Aperçu de l'image dans le formulaire ──────────────────────────────────
    const currentImageSource = imageUri ?? imageUrl;

    // ── Rendu ──────────────────────────────────────────────────────────────────
    return (
        <View style={s.safe}>

            <ScreenHeader title="Mes Produits" subtitle="Marché virtuel" showBack={true} />

            {/* ════ LISTE ════ */}
            {loading ? (
                <View style={s.center}>
                    <ActivityIndicator color={colors.primary} size="large" />
                </View>
            ) : (
                <ScrollView
                    style={s.scroll}
                    contentContainerStyle={[
                        s.scrollContent,
                        isDesktop && dtMp.scrollContent,
                    ]}
                    showsVerticalScrollIndicator={false}
                    bounces={false}
                    overScrollMode="never"
                >
                    {produits.length === 0 ? (
                        <View style={s.emptyCard}>
                            <Package color={colors.slate300} size={48} />
                            <Text style={s.emptyTitle}>AUCUN PRODUIT PUBLIÉ</Text>
                            <Text style={s.emptySub}>Publiez votre première récolte sur le Marché Virtuel</Text>
                            <TouchableOpacity
                                style={s.emptyBtn}
                                onPress={() => router.push('/producteur/publier' as any)}
                                activeOpacity={0.85}
                            >
                                <Text style={s.emptyBtnText}>DÉCLARER UNE RÉCOLTE</Text>
                            </TouchableOpacity>
                        </View>
                    ) : (
                        <>
                            <Text style={s.countLabel}>
                                {produits.length} produit{produits.length > 1 ? 's' : ''} publié{produits.length > 1 ? 's' : ''}
                            </Text>
                            <View style={isDesktop ? dtMp.grid : undefined}>
                            {produits.map(p => (
                                <TouchableOpacity
                                    key={p.id}
                                    style={[
                                        s.productCard,
                                        isDesktop && dtMp.productCard,
                                    ]}
                                    activeOpacity={0.85}
                                    onPress={() => openEdit(p)}
                                >
                                    {/* Photo */}
                                    <View style={s.productImageWrap}>
                                        {p.image_url ? (
                                            <Image source={{ uri: getImageThumbnail(p.image_url)! }} style={s.productImage} />
                                        ) : (
                                            <View style={s.productImagePlaceholder}>
                                                <Package color={colors.slate300} size={28} />
                                            </View>
                                        )}
                                    </View>

                                    {/* Infos */}
                                    <View style={s.productInfo}>
                                        <Text style={s.productName} numberOfLines={1}>{p.name}</Text>
                                        <Text style={s.productCategory}>{p.category ?? 'Non catégorisé'}</Text>
                                        <View style={s.productMeta}>
                                            <Text style={s.productPrice}>{p.price.toLocaleString('fr-FR')} F</Text>
                                            <Text style={s.productSep}>·</Text>
                                            <Text style={[s.productQty, p.stock_quantity === 0 && { color: colors.error }]}>
                                                {p.stock_quantity} en stock
                                            </Text>
                                        </View>
                                        {p.delivery_price != null && (
                                            <Text style={s.productDelivery}>
                                                Livraison : {p.delivery_price === 0 ? 'Gratuite' : `${p.delivery_price.toLocaleString('fr-FR')} F`}
                                            </Text>
                                        )}
                                    </View>

                                    {/* Actions */}
                                    <View style={s.productActions}>
                                        <TouchableOpacity style={s.editBtn} onPress={() => openEdit(p)}>
                                            <Edit2 color={colors.primary} size={16} />
                                        </TouchableOpacity>
                                        <TouchableOpacity style={s.deleteBtn} onPress={() => handleDelete(p)}>
                                            <Trash2 color={colors.error} size={16} />
                                        </TouchableOpacity>
                                    </View>
                                </TouchableOpacity>
                            ))}
                            </View>
                        </>
                    )}
                </ScrollView>
            )}

            {/* ════ MODAL ÉDITION ════ */}
            <Modal
                visible={editModal}
                animationType={isDesktop ? 'fade' : 'slide'}
                presentationStyle={isDesktop ? 'overFullScreen' : 'pageSheet'}
                transparent={isDesktop}
                onRequestClose={() => setEditModal(false)}
            >
                <View style={isDesktop ? dtMp.modalOverlay : { flex: 1 }}>
                <View style={isDesktop ? dtMp.modalContainer : { flex: 1 }}>
                <SafeAreaView style={s.modalSafe} edges={['top', 'bottom']}>
                    {/* Header modal */}
                    <View style={s.modalHeader}>
                        <TouchableOpacity style={s.modalCloseBtn} onPress={() => setEditModal(false)}>
                            <ChevronLeft color={colors.primary} size={20} />
                        </TouchableOpacity>
                        <View style={s.headerTitleBlock}>
                            <Text style={s.headerTitle}>MODIFIER LE PRODUIT</Text>
                            <Text style={s.headerSub} numberOfLines={1}>{selectedProduit?.name}</Text>
                        </View>
                        <TouchableOpacity
                            style={s.deleteHeaderBtn}
                            onPress={() => selectedProduit && handleDelete(selectedProduit)}
                        >
                            <Trash2 color={colors.white} size={18} />
                        </TouchableOpacity>
                    </View>

                    <ScrollView
                        style={s.scroll}
                        contentContainerStyle={s.scrollContent}
                        showsVerticalScrollIndicator={false}
                        keyboardShouldPersistTaps="handled"
                    >
                        {/* Photo */}
                        <View style={s.field}>
                            <Text style={s.label}>Photo du produit</Text>
                            <TouchableOpacity style={s.photoBtn} onPress={handlePickImage} activeOpacity={0.8}>
                                {currentImageSource ? (
                                    <>
                                        <Image source={{ uri: currentImageSource }} style={s.photoPreview} />
                                        <TouchableOpacity
                                            style={s.photoRemove}
                                            onPress={() => { setImageUri(null); setImageUrl(null); }}
                                            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                                        >
                                            <X color={colors.white} size={14} />
                                        </TouchableOpacity>
                                    </>
                                ) : (
                                    <View style={s.photoPlaceholder}>
                                        <Camera color={colors.slate300} size={36} />
                                        <Text style={s.photoHint}>Modifier la photo</Text>
                                        <Text style={s.photoSubHint}>Caméra ou galerie</Text>
                                    </View>
                                )}
                            </TouchableOpacity>
                        </View>

                        {/* Nom */}
                        <View style={s.field}>
                            <Text style={s.label}>Nom du produit *</Text>
                            <TextInput
                                style={s.input}
                                placeholder="Ex : Maïs local, Tomates..."
                                placeholderTextColor={colors.slate400}
                                value={nom}
                                onChangeText={setNom}
                                autoCapitalize="words"
                            />
                        </View>

                        {/* Description */}
                        <View style={s.field}>
                            <Text style={s.label}>Description <Text style={s.optional}>optionnel</Text></Text>
                            <TextInput
                                style={[s.input, s.inputMultiline]}
                                placeholder="Qualité, origine, conditionnement..."
                                placeholderTextColor={colors.slate400}
                                value={description}
                                onChangeText={setDescription}
                                multiline
                                numberOfLines={3}
                                textAlignVertical="top"
                            />
                        </View>

                        {/* Prix */}
                        <View style={s.field}>
                            <Text style={s.label}>Prix unitaire (F CFA) *</Text>
                            <TextInput
                                style={s.input}
                                placeholder="Ex : 500"
                                placeholderTextColor={colors.slate400}
                                value={prix}
                                onChangeText={setPrix}
                                keyboardType="numeric"
                            />
                        </View>

                        {/* Prix livraison */}
                        <View style={s.field}>
                            <Text style={s.label}>Prix de livraison (F CFA) <Text style={s.optional}>optionnel</Text></Text>
                            <TextInput
                                style={s.input}
                                placeholder="Ex : 1000 (0 si gratuit)"
                                placeholderTextColor={colors.slate400}
                                value={prixLivraison}
                                onChangeText={setPrixLivraison}
                                keyboardType="numeric"
                            />
                        </View>

                        {/* Quantité */}
                        <View style={s.field}>
                            <Text style={s.label}>Quantité disponible</Text>
                            <TextInput
                                style={s.input}
                                placeholder="Ex : 50"
                                placeholderTextColor={colors.slate400}
                                value={quantite}
                                onChangeText={setQuantite}
                                keyboardType="numeric"
                            />
                        </View>

                        {/* Unité */}
                        <View style={s.field}>
                            <Text style={s.label}>Unité</Text>
                            <View style={s.chipGrid}>
                                {UNITES.map(u => (
                                    <TouchableOpacity
                                        key={u}
                                        style={[s.chip, unite === u && s.chipActive]}
                                        onPress={() => setUnite(u)}
                                        activeOpacity={0.8}
                                    >
                                        <Text style={[s.chipText, unite === u && s.chipTextActive]}>{u}</Text>
                                    </TouchableOpacity>
                                ))}
                            </View>
                        </View>

                        {/* Zone de livraison */}
                        <View style={s.field}>
                            <Text style={s.label}>Zone de livraison</Text>
                            <View style={s.chipGrid}>
                                {ZONES_LIVR.map(z => (
                                    <TouchableOpacity
                                        key={z}
                                        style={[s.chip, zoneLivraison === z && s.chipActive]}
                                        onPress={() => setZoneLivraison(z)}
                                        activeOpacity={0.8}
                                    >
                                        <Text style={[s.chipText, zoneLivraison === z && s.chipTextActive]}>{z}</Text>
                                    </TouchableOpacity>
                                ))}
                            </View>
                        </View>

                        {/* Délai de livraison */}
                        <View style={s.field}>
                            <Text style={s.label}>Délai de livraison</Text>
                            <View style={s.chipGrid}>
                                {DELAIS_LIVR.map(d => (
                                    <TouchableOpacity
                                        key={d}
                                        style={[s.chip, delaiLivraison === d && s.chipActive]}
                                        onPress={() => setDelaiLivraison(d)}
                                        activeOpacity={0.8}
                                    >
                                        <Text style={[s.chipText, delaiLivraison === d && s.chipTextActive]}>{d}</Text>
                                    </TouchableOpacity>
                                ))}
                            </View>
                        </View>

                        {/* Catégorie */}
                        <View style={s.field}>
                            <Text style={s.label}>Catégorie</Text>
                            <View style={s.chipGrid}>
                                {CATEGORIES.map(cat => (
                                    <TouchableOpacity
                                        key={cat}
                                        style={[s.chip, categorie === cat && s.chipActive]}
                                        onPress={() => setCategorie(cat)}
                                        activeOpacity={0.8}
                                    >
                                        <Text style={[s.chipText, categorie === cat && s.chipTextActive]}>{cat}</Text>
                                    </TouchableOpacity>
                                ))}
                            </View>
                        </View>

                        {/* Bouton Enregistrer */}
                        <TouchableOpacity
                            style={[s.saveBtn, saving && { opacity: 0.6 }]}
                            onPress={handleSave}
                            disabled={saving}
                            activeOpacity={0.85}
                        >
                            {saving ? (
                                <ActivityIndicator color={colors.white} />
                            ) : (
                                <Text style={s.saveBtnText}>ENREGISTRER LES MODIFICATIONS</Text>
                            )}
                        </TouchableOpacity>

                        {/* Bouton Supprimer */}
                        <TouchableOpacity
                            style={s.deleteFullBtn}
                            onPress={() => selectedProduit && handleDelete(selectedProduit)}
                            activeOpacity={0.85}
                        >
                            <Trash2 color={colors.error} size={16} />
                            <Text style={s.deleteFullBtnText}>SUPPRIMER CE PRODUIT</Text>
                        </TouchableOpacity>
                    </ScrollView>
                </SafeAreaView>
                </View>
                </View>
            </Modal>
        </View>
    );
}

// ── Styles ─────────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
    safe:   { flex: 1, backgroundColor: colors.bgSecondary },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center' },

    // ── Scroll ──
    scroll:        { flex: 1 },
    scrollContent: { paddingHorizontal: 16, paddingTop: 20, paddingBottom: 40, gap: 14 },

    countLabel: { fontSize: 11, fontWeight: '700', color: colors.slate400, letterSpacing: 1.5, textTransform: 'uppercase' },

    // ── Carte produit ──
    productCard: {
        flexDirection: 'row', alignItems: 'center',
        backgroundColor: colors.white, borderRadius: 10,
        padding: 12, borderWidth: 1, borderColor: colors.slate200,
        gap: 12,
        shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.05, shadowRadius: 4, elevation: 2,
    },
    productImageWrap: { width: 64, height: 64, borderRadius: 10, overflow: 'hidden', flexShrink: 0 },
    productImage:     { width: '100%', height: '100%', resizeMode: 'cover' },
    productImagePlaceholder: {
        width: '100%', height: '100%',
        backgroundColor: colors.slate100,
        alignItems: 'center', justifyContent: 'center',
    },
    productInfo:    { flex: 1, minWidth: 0, gap: 3 },
    productName:    { fontSize: 13, fontWeight: '700', color: colors.slate800 },
    productCategory:{ fontSize: 11, fontWeight: '600', color: colors.slate400, textTransform: 'uppercase', letterSpacing: 0.5 },
    productMeta:    { flexDirection: 'row', alignItems: 'center', gap: 6 },
    productPrice:   { fontSize: 13, fontWeight: '900', color: colors.primary },
    productSep:     { fontSize: 12, color: colors.slate300 },
    productQty:     { fontSize: 11, fontWeight: '600', color: colors.slate500 },
    productDelivery:{ fontSize: 11, color: colors.slate400, fontWeight: '500' },
    productActions: { flexDirection: 'column', gap: 8, flexShrink: 0 },
    editBtn: {
        width: 34, height: 34, borderRadius: 8,
        backgroundColor: colors.primaryBg,
        alignItems: 'center', justifyContent: 'center',
    },
    deleteBtn: {
        width: 34, height: 34, borderRadius: 8,
        backgroundColor: '#fee2e2',
        alignItems: 'center', justifyContent: 'center',
    },

    // ── Empty ──
    emptyCard: {
        backgroundColor: colors.white, borderRadius: 10, padding: 40,
        alignItems: 'center', borderWidth: 2, borderColor: colors.slate100,
        borderStyle: 'dashed', gap: 10, marginTop: 20,
    },
    emptyTitle: { fontSize: 11, fontWeight: '900', color: colors.slate300, letterSpacing: 2 },
    emptySub:   { fontSize: 12, color: colors.slate400, textAlign: 'center', lineHeight: 18 },
    emptyBtn: {
        backgroundColor: colors.primary, borderRadius: 10,
        paddingHorizontal: 24, paddingVertical: 12, marginTop: 4,
    },
    emptyBtnText: { fontSize: 12, fontWeight: '900', color: colors.white, letterSpacing: 1 },

    // ── Modal ──
    modalSafe:    { flex: 1, backgroundColor: colors.bgSecondary },
    modalHeader: {
        backgroundColor: colors.primary,
        paddingHorizontal: 16, paddingTop: 8, paddingBottom: 24,
        borderBottomLeftRadius: 32, borderBottomRightRadius: 32,
        flexDirection: 'row', alignItems: 'center',
    },
    modalCloseBtn: {
        width: 40, height: 40, borderRadius: 10,
        backgroundColor: '#FFFFFF',
        alignItems: 'center', justifyContent: 'center',
    },
    headerTitleBlock: { flex: 1, alignItems: 'center' },
    headerTitle: { fontSize: 13, fontWeight: '800', color: colors.slate900, letterSpacing: 0.5 },
    headerSub: { fontSize: 11, fontWeight: '500', color: colors.slate500, marginTop: 2 },
    deleteHeaderBtn: {
        width: 40, height: 40, borderRadius: 10,
        backgroundColor: 'rgba(220,38,38,0.3)',
        alignItems: 'center', justifyContent: 'center',
    },

    // ── Formulaire ──
    field:    { gap: 8 },
    label:    { fontSize: 12, fontWeight: '700', color: colors.slate700, letterSpacing: 0.5 },
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
    photoPreview:    { width: '100%', height: '100%', resizeMode: 'cover' },
    photoPlaceholder:{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 6 },
    photoHint:       { fontSize: 13, color: colors.slate500, fontWeight: '700' },
    photoSubHint:    { fontSize: 11, color: colors.slate400, fontWeight: '500' },
    photoRemove: {
        position: 'absolute', top: 8, right: 8,
        width: 28, height: 28, borderRadius: 8,
        backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center',
    },

    // Chips
    chipGrid:      { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    chip: {
        paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8,
        backgroundColor: colors.white, borderWidth: 1, borderColor: colors.slate200,
    },
    chipActive:    { backgroundColor: colors.primary, borderColor: colors.primary },
    chipText:      { fontSize: 12, fontWeight: '700', color: colors.slate600 },
    chipTextActive:{ color: colors.white },

    // Boutons bas de formulaire
    saveBtn: {
        backgroundColor: colors.primary, borderRadius: 10,
        paddingVertical: 16, alignItems: 'center', justifyContent: 'center',
        shadowColor: colors.primary, shadowOpacity: 0.3, shadowRadius: 8, elevation: 4, marginTop: 4,
    },
    saveBtnText: { fontSize: 14, fontWeight: '900', color: colors.white, letterSpacing: 1 },
    deleteFullBtn: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
        borderRadius: 10, paddingVertical: 14,
        borderWidth: 2, borderColor: '#fee2e2', backgroundColor: '#fff5f5',
    },
    deleteFullBtnText: { fontSize: 13, fontWeight: '900', color: colors.error, letterSpacing: 1 },
});

// ── Desktop styles ──────────────────────────────────────────────────────────
const dtMp = StyleSheet.create({
    scrollContent: {
        maxWidth: 1400,
        alignSelf: 'center',
        width: '100%',
        padding: 32,
    },
    grid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 16,
    },
    productCard: {
        width: '31%' as any,
        flexDirection: 'column',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.06,
        shadowRadius: 12,
        elevation: 3,
        borderRadius: 12,
    },
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.5)',
        alignItems: 'center',
        justifyContent: 'center',
    },
    modalContainer: {
        maxWidth: 600,
        width: '90%',
        maxHeight: '90%',
        borderRadius: 12,
        overflow: 'hidden',
    },
});
