// Écran Stock — avec ajout photo produit
import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
    View, Text, ScrollView, TouchableOpacity, StyleSheet,
    TextInput, Modal, Alert, Animated, Vibration, Dimensions,
    KeyboardAvoidingView, Platform, Image, useWindowDimensions,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import { Package, Plus, Search, X, Check, QrCode, ChevronLeft, Camera } from 'lucide-react-native';
import { useSafeAreaInsets, SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';
import { ScreenHeader } from '@/src/components/ui';
import { useProductContext } from '@/src/context/ProductContext';
import { useStockContext } from '@/src/context/StockContext';
import { supabase } from '@/src/lib/supabase';
import { colors } from '@/src/lib/colors';

const CATEGORIES = ['Alimentation', 'Boissons', 'Hygiène', 'Textile', 'Électronique', 'Autre'];
const BG_COLORS   = ['#ecfdf5', '#eff6ff', '#fff7ed', '#fdf4ff', '#fef2f2', '#f0fdf4'];
const ICON_COLORS = ['#059669', '#2563eb', '#ea580c', '#7c3aed', '#dc2626', '#16a34a'];

const { width: SW } = Dimensions.get('window');
const FRAME_W = Math.min(SW - 80, 300);
const FRAME_H = 180;
const CORNER  = 22;
const CORNER_T = 4;
const MASK = 'rgba(0,0,0,0.72)';

export default function StockScreen() {
    const { products, addProduct, refreshProducts } = useProductContext();
    const { getStockLevel, updateStock, refreshStock } = useStockContext();
    const { width } = useWindowDimensions();
    const isDesktop = Platform.OS === 'web' && width > 768;

    // Recharger stock et produits à chaque retour sur l'écran
    useFocusEffect(useCallback(() => {
        refreshProducts();
        refreshStock();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []));
    const insets = useSafeAreaInsets();

    const [search,       setSearch]       = useState('');
    const [showAddModal, setShowAddModal] = useState(false);
    const [showScanner,  setShowScanner]  = useState(false);
    const [newBarcode,   setNewBarcode]   = useState('');
    const [newName,      setNewName]      = useState('');
    const [newPrice,     setNewPrice]     = useState('');
    const [newCategory,  setNewCategory]  = useState('Alimentation');
    const [imageUri,     setImageUri]     = useState<string | null>(null);
    const [isAdding,     setIsAdding]     = useState(false);
    const [scanPaused,   setScanPaused]   = useState(false);

    const [permission, requestPermission] = useCameraPermissions();
    const scanLineAnim = useRef(new Animated.Value(0)).current;
    const cooldown = useRef(false);

    useEffect(() => {
        if (!showScanner) return;
        const loop = Animated.loop(
            Animated.sequence([
                Animated.timing(scanLineAnim, { toValue: 1, duration: 1800, useNativeDriver: true }),
                Animated.timing(scanLineAnim, { toValue: 0, duration: 0,    useNativeDriver: true }),
            ])
        );
        loop.start();
        return () => loop.stop();
    }, [showScanner]);

    const scanLineY = scanLineAnim.interpolate({ inputRange: [0, 1], outputRange: [0, FRAME_H - 2] });

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
            if (error) { console.warn('[Stock] upload error:', error.message); return null; }
            const { data } = supabase.storage.from('products').getPublicUrl(fileName);
            return data.publicUrl;
        } catch (e) {
            console.warn('[Stock] upload exception:', e);
            return null;
        }
    };

    // ── Scanner ─────────────────────────────────────────────────────────────
    const handleOpenScanner = async () => {
        if (!permission?.granted) { await requestPermission(); }
        setScanPaused(false);
        cooldown.current = false;
        setShowScanner(true);
    };

    const handleBarCodeScanned = ({ data }: { data: string }) => {
        if (cooldown.current || scanPaused) return;
        cooldown.current = true;
        setScanPaused(true);
        Vibration.vibrate(100);
        setNewBarcode(data);
        setShowScanner(false);
        setTimeout(() => { cooldown.current = false; }, 500);
    };

    // ── Formulaire ──────────────────────────────────────────────────────────
    const resetForm = () => {
        setNewBarcode(''); setNewName(''); setNewPrice('');
        setNewCategory('Alimentation'); setImageUri(null);
    };

    const handleAddProduct = async () => {
        if (!newName.trim() || !newPrice) {
            Alert.alert('Erreur', 'Nom et prix sont obligatoires.');
            return;
        }
        setIsAdding(true);

        // Upload photo si sélectionnée
        let photoUrl: string | undefined;
        if (imageUri) {
            const url = await uploadImage(imageUri);
            if (url) photoUrl = url;
        }

        const idx = Math.floor(Math.random() * BG_COLORS.length);
        const success = await addProduct({
            name:      newName.trim(),
            price:     parseFloat(newPrice),
            audioName: newName.trim(),
            category:  newCategory,
            barcode:   newBarcode.trim() || undefined,
            color:     BG_COLORS[idx],
            iconColor: ICON_COLORS[idx],
            imageUrl:  photoUrl,
            store_id:  '',
        });
        if (success) {
            resetForm();
            setShowAddModal(false);
        } else {
            Alert.alert('Erreur', "Impossible d'ajouter le produit.");
        }
        setIsAdding(false);
    };

    const filtered = products.filter(p =>
        p.name.toLowerCase().includes(search.toLowerCase())
    );

    return (
        <View style={styles.safe}>
            <ScreenHeader
                title="Mon Stock"
                showBack={true}
                rightIcon={
                    <TouchableOpacity style={styles.addBtn} onPress={() => { resetForm(); setShowAddModal(true); }}>
                        <Plus color={colors.white} size={20} />
                    </TouchableOpacity>
                }
            />

            {/* Recherche */}
            <View style={styles.searchContainer}>
                <View style={styles.searchWrapper}>
                    <Search color={colors.slate400} size={18} />
                    <TextInput
                        style={styles.searchInput}
                        placeholder="Rechercher un produit..."
                        placeholderTextColor={colors.slate400}
                        value={search}
                        onChangeText={setSearch}
                    />
                </View>
            </View>

            {/* Liste */}
            <ScrollView
                style={styles.list}
                showsVerticalScrollIndicator={false}
                contentContainerStyle={[{ paddingBottom: 24 }, isDesktop && { paddingHorizontal: 24, paddingTop: 16 }]}
            >
                {filtered.length === 0 ? (
                    <View style={styles.empty}>
                        <Package color={colors.slate300} size={48} />
                        <Text style={styles.emptyTitle}>AUCUN PRODUIT</Text>
                        <Text style={styles.emptyText}>Appuyez sur + pour ajouter votre premier produit</Text>
                    </View>
                ) : (
                    <View style={isDesktop ? dtSt.grid : undefined}>
                    {filtered.map(product => {
                        const stock = getStockLevel(product.id);
                        return (
                            <View key={product.id} style={[styles.productRow, isDesktop && dtSt.productCard]}>
                                {/* Photo ou initiale */}
                                {product.imageUrl ? (
                                    <Image source={{ uri: product.imageUrl }} style={styles.productIcon} />
                                ) : (
                                    <View style={[styles.productIcon, { backgroundColor: product.color }]}>
                                        <Text style={[styles.productLetter, { color: product.iconColor }]}>
                                            {product.name.charAt(0).toUpperCase()}
                                        </Text>
                                    </View>
                                )}
                                <View style={styles.productInfo}>
                                    <Text style={styles.productName}>{product.name}</Text>
                                    <Text style={styles.productCategory}>{product.category || 'Non catégorisé'}</Text>
                                </View>
                                <View style={styles.productRight}>
                                    <Text style={styles.productPrice}>{product.price.toLocaleString()}F</Text>
                                    <View style={[styles.stockBadge, stock < 3 && styles.stockBadgeLow]}>
                                        <Text style={[styles.stockText, stock < 3 && styles.stockTextLow]}>{stock} unités</Text>
                                    </View>
                                </View>
                                <View style={styles.qtyControls}>
                                    <TouchableOpacity style={styles.qtyBtn} onPress={() => updateStock(product.id, -1)}>
                                        <Text style={styles.qtyBtnText}>−</Text>
                                    </TouchableOpacity>
                                    <TouchableOpacity style={[styles.qtyBtn, styles.qtyBtnAdd]} onPress={() => updateStock(product.id, 1)}>
                                        <Text style={[styles.qtyBtnText, styles.qtyBtnAddText]}>+</Text>
                                    </TouchableOpacity>
                                </View>
                            </View>
                        );
                    })}
                    </View>
                )}
            </ScrollView>

            {/* ── MODAL AJOUT PRODUIT ── */}
            <Modal visible={showAddModal} transparent animationType="slide" onRequestClose={() => setShowAddModal(false)}>
                <KeyboardAvoidingView
                    style={{ flex: 1 }}
                    behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                >
                    <View style={styles.modalOverlay}>
                        <View style={[styles.modalCard, { paddingBottom: Math.max(insets.bottom, 16) }]}>

                            <View style={styles.modalHeader}>
                                <Text style={styles.modalTitle}>NOUVEAU PRODUIT</Text>
                                <TouchableOpacity
                                    style={styles.xCloseBtn}
                                    onPress={() => setShowAddModal(false)}
                                    hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
                                >
                                    <X color={colors.slate400} size={22} />
                                </TouchableOpacity>
                            </View>

                            <ScrollView
                                showsVerticalScrollIndicator={false}
                                keyboardShouldPersistTaps="handled"
                                contentContainerStyle={{ paddingBottom: 8 }}
                            >
                                {/* 1. Photo */}
                                <Text style={styles.inputLabel}>PHOTO DU PRODUIT</Text>
                                <TouchableOpacity style={styles.photoBtn} onPress={handlePickImage} activeOpacity={0.8}>
                                    {imageUri ? (
                                        <Image source={{ uri: imageUri }} style={styles.photoPreview} />
                                    ) : (
                                        <View style={styles.photoPlaceholder}>
                                            <Camera color={colors.slate300} size={30} />
                                            <Text style={styles.photoHint}>Appuyez pour ajouter une photo</Text>
                                        </View>
                                    )}
                                    {imageUri && (
                                        <TouchableOpacity
                                            style={styles.photoRemove}
                                            onPress={() => setImageUri(null)}
                                            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                                        >
                                            <X color={colors.white} size={14} />
                                        </TouchableOpacity>
                                    )}
                                </TouchableOpacity>

                                {/* 2. Code-barres */}
                                <Text style={styles.inputLabel}>CODE-BARRES</Text>
                                <View style={styles.barcodeRow}>
                                    <TextInput
                                        style={[styles.modalInput, styles.barcodeInput]}
                                        placeholder="Scanner ou saisir manuellement"
                                        placeholderTextColor={colors.slate300}
                                        value={newBarcode}
                                        onChangeText={setNewBarcode}
                                        keyboardType="numeric"
                                        returnKeyType="next"
                                    />
                                    {Platform.OS !== 'web' && (
                                        <TouchableOpacity style={styles.scanBtn} onPress={handleOpenScanner}>
                                            <QrCode color={colors.white} size={20} />
                                        </TouchableOpacity>
                                    )}
                                </View>

                                {/* 3. Nom */}
                                <Text style={styles.inputLabel}>NOM DU PRODUIT</Text>
                                <TextInput
                                    style={styles.modalInput}
                                    placeholder="Ex: Riz Parfumé 25kg"
                                    placeholderTextColor={colors.slate300}
                                    value={newName}
                                    onChangeText={setNewName}
                                    returnKeyType="next"
                                />

                                {/* 4. Prix */}
                                <Text style={styles.inputLabel}>PRIX DE VENTE (F CFA)</Text>
                                <TextInput
                                    style={styles.modalInput}
                                    placeholder="Ex: 2500"
                                    placeholderTextColor={colors.slate300}
                                    value={newPrice}
                                    onChangeText={setNewPrice}
                                    keyboardType="numeric"
                                    returnKeyType="done"
                                />

                                {/* 5. Catégorie */}
                                <Text style={styles.inputLabel}>CATÉGORIE</Text>
                                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 20 }}>
                                    <View style={{ flexDirection: 'row', gap: 8 }}>
                                        {CATEGORIES.map(cat => (
                                            <TouchableOpacity
                                                key={cat}
                                                style={[styles.catBtn, newCategory === cat && styles.catBtnActive]}
                                                onPress={() => setNewCategory(cat)}
                                            >
                                                <Text style={[styles.catBtnText, newCategory === cat && styles.catBtnTextActive]}>{cat}</Text>
                                            </TouchableOpacity>
                                        ))}
                                    </View>
                                </ScrollView>

                                {/* 6. Bouton ajouter */}
                                <TouchableOpacity style={styles.addProductBtn} onPress={handleAddProduct} disabled={isAdding} activeOpacity={0.85}>
                                    <Check color={colors.white} size={18} />
                                    <Text style={styles.addProductBtnText}>{isAdding ? 'AJOUT EN COURS...' : 'AJOUTER LE PRODUIT'}</Text>
                                </TouchableOpacity>
                            </ScrollView>
                        </View>
                    </View>
                </KeyboardAvoidingView>
            </Modal>

            {/* ── MODAL SCANNER ── */}
            <Modal visible={showScanner} transparent animationType="fade" onRequestClose={() => setShowScanner(false)}>
                <View style={styles.scanRoot}>
                    {permission?.granted ? (
                        <CameraView
                            style={StyleSheet.absoluteFillObject}
                            facing="back"
                            barcodeScannerSettings={{
                                barcodeTypes: ['qr', 'ean13', 'ean8', 'code128', 'code39', 'upc_a', 'upc_e'],
                            }}
                            onBarcodeScanned={scanPaused ? undefined : handleBarCodeScanned}
                        />
                    ) : (
                        <View style={styles.noPermBox}>
                            <Text style={styles.noPermText}>Accès caméra non autorisé</Text>
                            <TouchableOpacity style={styles.permBtn} onPress={requestPermission}>
                                <Text style={styles.permBtnText}>AUTORISER</Text>
                            </TouchableOpacity>
                        </View>
                    )}

                    <SafeAreaView edges={['top']} style={styles.scanHeader}>
                        <TouchableOpacity style={styles.scanBack} onPress={() => setShowScanner(false)}>
                            <ChevronLeft color={colors.primary} size={24} />
                        </TouchableOpacity>
                        <Text style={styles.scanTitle}>SCANNER LE CODE-BARRES</Text>
                        <View style={{ width: 40 }} />
                    </SafeAreaView>

                    <View style={styles.scanMaskTop} />
                    <View style={styles.scanMiddle}>
                        <View style={[styles.scanMaskSide]} />
                        <View style={styles.scanFrame}>
                            <View style={[styles.corner, styles.cornerTL]} />
                            <View style={[styles.corner, styles.cornerTR]} />
                            <View style={[styles.corner, styles.cornerBL]} />
                            <View style={[styles.corner, styles.cornerBR]} />
                            <Animated.View style={[styles.scanLine, { transform: [{ translateY: scanLineY }] }]} />
                        </View>
                        <View style={[styles.scanMaskSide]} />
                    </View>
                    <View style={styles.scanMaskBottom}>
                        <Text style={styles.scanHint}>Placez le code-barres dans le cadre</Text>
                    </View>
                </View>
            </Modal>
        </View>
    );
}

const styles = StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.bgSecondary },
    addBtn: { width: 44, height: 44, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' },

    searchContainer: { paddingHorizontal: 16, paddingVertical: 12 },
    searchWrapper: {
        flexDirection: 'row', alignItems: 'center', gap: 10,
        backgroundColor: colors.slate50, borderRadius: 10,
        paddingHorizontal: 14, paddingVertical: 10,
        borderWidth: 1, borderColor: colors.slate100,
    },
    searchInput: { flex: 1, fontSize: 14, color: colors.slate800 },

    list: { flex: 1, paddingHorizontal: 16 },
    empty: { alignItems: 'center', paddingTop: 80, gap: 12 },
    emptyTitle: { fontSize: 14, fontWeight: '900', color: colors.slate400, letterSpacing: 2 },
    emptyText: { fontSize: 13, color: colors.slate400, textAlign: 'center', lineHeight: 20 },

    productRow: {
        flexDirection: 'row', alignItems: 'center', paddingVertical: 14,
        borderBottomWidth: 1, borderBottomColor: colors.slate100, gap: 12,
    },
    productIcon: { width: 44, height: 44, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
    productLetter: { fontSize: 18, fontWeight: '900' },
    productInfo: { flex: 1 },
    productName: { fontSize: 14, fontWeight: '700', color: colors.slate800 },
    productCategory: { fontSize: 11, color: colors.slate400, marginTop: 2 },
    productRight: { alignItems: 'flex-end', gap: 4 },
    productPrice: { fontSize: 14, fontWeight: '900', color: colors.slate900 },
    stockBadge: { backgroundColor: '#ecfdf5', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 2 },
    stockBadgeLow: { backgroundColor: '#fff7ed' },
    stockText: { fontSize: 11, fontWeight: '700', color: colors.primary },
    stockTextLow: { color: '#ea580c' },
    qtyControls: { flexDirection: 'row', gap: 4 },
    qtyBtn: { width: 30, height: 30, borderRadius: 10, backgroundColor: colors.slate100, alignItems: 'center', justifyContent: 'center' },
    qtyBtnText: { fontSize: 18, fontWeight: '900', color: colors.slate600, lineHeight: 22 },
    qtyBtnAdd: { backgroundColor: colors.primaryBg },
    qtyBtnAddText: { color: colors.primary },

    // ── Modal ajout ──
    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
    modalCard: { backgroundColor: colors.white, borderTopLeftRadius: 10, borderTopRightRadius: 10, padding: 24, gap: 4, maxHeight: '92%' },
    modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
    xCloseBtn:   { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
    modalTitle: { fontSize: 16, fontWeight: '900', color: colors.slate900, letterSpacing: 1 },
    inputLabel: { fontSize: 11, fontWeight: '900', color: colors.slate400, letterSpacing: 3, textTransform: 'uppercase', marginTop: 10, marginBottom: 6 },
    modalInput: {
        backgroundColor: colors.slate50, borderWidth: 1, borderColor: colors.slate200,
        borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12,
        fontSize: 15, fontWeight: '600', color: colors.slate800,
    },

    // Photo
    photoBtn: {
        height: 110, borderRadius: 10, borderWidth: 1.5, borderColor: colors.slate200,
        borderStyle: 'dashed', overflow: 'hidden', marginBottom: 4, position: 'relative',
    },
    photoPreview: { width: '100%', height: '100%', resizeMode: 'cover' },
    photoPlaceholder: {
        flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8,
        backgroundColor: colors.slate50,
    },
    photoHint: { fontSize: 11, color: colors.slate400, fontWeight: '600', textAlign: 'center' },
    photoRemove: {
        position: 'absolute', top: 6, right: 6,
        width: 24, height: 24, borderRadius: 6,
        backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center',
    },

    // Code-barres
    barcodeRow: { flexDirection: 'row', gap: 10, alignItems: 'center' },
    barcodeInput: { flex: 1 },
    scanBtn: {
        width: 48, height: 48, borderRadius: 10,
        backgroundColor: colors.primary,
        alignItems: 'center', justifyContent: 'center', flexShrink: 0,
    },

    catBtn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 12, backgroundColor: colors.slate100 },
    catBtnActive: { backgroundColor: colors.primary },
    catBtnText: { fontSize: 12, fontWeight: '700', color: colors.slate500 },
    catBtnTextActive: { color: colors.white },
    addProductBtn: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
        backgroundColor: colors.primary, borderRadius: 10, paddingVertical: 16, marginTop: 8,
    },
    addProductBtnText: { color: colors.white, fontSize: 14, fontWeight: '900', letterSpacing: 1 },

    // ── Modal scanner ──
    scanRoot: { flex: 1, backgroundColor: '#000' },
    scanHeader: {
        position: 'absolute', top: 0, left: 0, right: 0, zIndex: 20,
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        paddingHorizontal: 16, paddingVertical: 12,
        backgroundColor: 'rgba(0,0,0,0.55)',
    },
    scanBack: { width: 40, height: 40, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center' },
    scanTitle: { fontSize: 13, fontWeight: '900', color: colors.white, letterSpacing: 1.5 },
    scanMaskTop:    { flex: 1, backgroundColor: MASK },
    scanMiddle:     { flexDirection: 'row', height: FRAME_H },
    scanMaskSide:   { flex: 1, backgroundColor: MASK },
    scanMaskBottom: { flex: 1.2, backgroundColor: MASK, alignItems: 'center', justifyContent: 'center' },
    scanHint:       { fontSize: 12, color: 'rgba(255,255,255,0.65)', fontWeight: '600', letterSpacing: 0.4 },
    scanFrame: { width: FRAME_W, height: FRAME_H, overflow: 'hidden', position: 'relative' },
    corner: { position: 'absolute', width: CORNER, height: CORNER, borderColor: '#22c55e' },
    cornerTL: { top: 0, left: 0, borderTopWidth: CORNER_T, borderLeftWidth: CORNER_T, borderTopLeftRadius: 5 },
    cornerTR: { top: 0, right: 0, borderTopWidth: CORNER_T, borderRightWidth: CORNER_T, borderTopRightRadius: 5 },
    cornerBL: { bottom: 0, left: 0, borderBottomWidth: CORNER_T, borderLeftWidth: CORNER_T, borderBottomLeftRadius: 5 },
    cornerBR: { bottom: 0, right: 0, borderBottomWidth: CORNER_T, borderRightWidth: CORNER_T, borderBottomRightRadius: 5 },
    scanLine: {
        position: 'absolute', top: 0, left: 8, right: 8, height: 2,
        backgroundColor: '#ef4444', borderRadius: 2,
        shadowColor: '#ef4444', shadowOpacity: 0.9, shadowRadius: 6, elevation: 4,
    },
    noPermBox: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16 },
    noPermText: { color: colors.white, fontSize: 15, fontWeight: '700' },
    permBtn: { backgroundColor: colors.primary, borderRadius: 10, paddingHorizontal: 20, paddingVertical: 12 },
    permBtnText: { color: colors.white, fontWeight: '900', fontSize: 13 },
});

// ── Styles grille desktop ─────────────────────────────────────────────────
const dtSt = StyleSheet.create({
    grid: {
        flexDirection: 'row', flexWrap: 'wrap', gap: 12,
    },
    productCard: {
        width: '48.5%',
        borderBottomWidth: 0,
        backgroundColor: colors.white,
        borderRadius: 10,
        borderWidth: 1, borderColor: colors.slate100,
        padding: 14,
        shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.04, shadowRadius: 4, elevation: 1,
    },
});
