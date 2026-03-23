// Écran Stock — avec ajout photo produit
import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
    View, Text, ScrollView, TouchableOpacity, StyleSheet,
    TextInput, Modal, Alert, Animated, Vibration, Dimensions,
    KeyboardAvoidingView, Platform, Image, useWindowDimensions,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
// WebBarcodeScanner = web-only (HTML elements), lazy-load to avoid crash on mobile
const WebBarcodeScanner = Platform.OS === 'web'
    ? require('@/src/components/WebBarcodeScanner').default
    : () => null;
import ImagePickerButton from '@/src/components/ImagePickerButton';
import { Package, Plus, Search, X, Check, QrCode, ChevronLeft } from 'lucide-react-native';
import { useSafeAreaInsets, SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';
import { ScreenHeader } from '@/src/components/ui';
import { useProductContext } from '@/src/context/ProductContext';
import { useStockContext } from '@/src/context/StockContext';
import { uploadProductImage } from '@/src/lib/storage';
import { colors } from '@/src/lib/colors';

const CATEGORIES = ['Alimentation', 'Boissons', 'Hygiène', 'Textile', 'Électronique', 'Autre'];
const BG_COLORS   = ['#ecfdf5', '#eff6ff', '#fff7ed', '#fdf4ff', '#fef2f2', '#f0fdf4'];
const ICON_COLORS = [colors.primary, '#2563eb', '#ea580c', '#7c3aed', '#dc2626', '#16a34a'];

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
    const [webFile,      setWebFile]      = useState<File | undefined>(undefined);
    const [isAdding,     setIsAdding]     = useState(false);
    const [scanPaused,   setScanPaused]   = useState(false);

    const [permission, requestPermission] = useCameraPermissions();
    const scanLineAnim = useRef(new Animated.Value(0)).current;
    const cooldown = useRef(false);

    useEffect(() => {
        if (!showScanner) return;
        const loop = Animated.loop(
            Animated.sequence([
                Animated.timing(scanLineAnim, { toValue: 1, duration: 1800, useNativeDriver: Platform.OS !== 'web' }),
                Animated.timing(scanLineAnim, { toValue: 0, duration: 0,    useNativeDriver: Platform.OS !== 'web' }),
            ])
        );
        loop.start();
        return () => loop.stop();
    }, [showScanner]);

    const scanLineY = scanLineAnim.interpolate({ inputRange: [0, 1], outputRange: [0, FRAME_H - 2] });

    // ── Scanner ─────────────────────────────────────────────────────────────
    const handleOpenScanner = async () => {
        if (!permission?.granted) { await requestPermission(); }
        setScanPaused(false);
        cooldown.current = false;
        setShowScanner(true);
    };

    const lastScanTimeRef = useRef<number>(0);
    const handleBarCodeScanned = ({ data }: { type?: string; data: string }) => {
        const now = Date.now();
        if (now - lastScanTimeRef.current < 2000) return;
        if (cooldown.current || scanPaused) return;
        cooldown.current = true;
        lastScanTimeRef.current = now;
        setScanPaused(true);
        if (Platform.OS !== 'web') Vibration.vibrate(100);
        setNewBarcode(data);
        setShowScanner(false);
        setTimeout(() => { cooldown.current = false; }, 2000);
    };

    // ── Formulaire ──────────────────────────────────────────────────────────
    const resetForm = () => {
        setNewBarcode(''); setNewName(''); setNewPrice('');
        setNewCategory('Alimentation'); setImageUri(null); setWebFile(undefined);
    };

    const handleAddProduct = async () => {
        if (!newName.trim() || !newPrice) {
            Alert.alert('Erreur', 'Nom et prix sont obligatoires.');
            return;
        }
        setIsAdding(true);

        // Upload photo si selectionnee
        let photoUrl: string | undefined;
        if (imageUri) {
            const url = await uploadProductImage(imageUri, webFile);
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
            <View style={[styles.searchContainer, isDesktop && dtSt.searchContainer]}>
                <View style={[styles.searchWrapper, isDesktop && dtSt.searchWrapper]}>
                    <Search color={colors.slate400} size={18} />
                    <TextInput
                        style={styles.searchInput}
                        placeholder="Rechercher un produit..."
                        placeholderTextColor={colors.slate400}
                        value={search}
                        onChangeText={setSearch}
                    />
                </View>
                {isDesktop && (
                    <Text style={dtSt.countText}>{filtered.length} produit{filtered.length > 1 ? 's' : ''}</Text>
                )}
            </View>

            {/* Liste */}
            <ScrollView
                style={styles.list}
                showsVerticalScrollIndicator={false}
                contentContainerStyle={[{ paddingBottom: 24 }, isDesktop && dtSt.scrollContent]}
            >
                {filtered.length === 0 ? (
                    <View style={styles.empty}>
                        <Package color={colors.slate300} size={48} />
                        <Text style={styles.emptyTitle}>AUCUN PRODUIT</Text>
                        <Text style={styles.emptyText}>Appuyez sur + pour ajouter votre premier produit</Text>
                    </View>
                ) : isDesktop ? (
                    <View style={dtSt.tableCard}>
                        {/* En-tête tableau */}
                        <View style={dtSt.tableHeader}>
                            <Text style={[dtSt.thCell, { flex: 2 }]}>Produit</Text>
                            <Text style={[dtSt.thCell, { flex: 1 }]}>Catégorie</Text>
                            <Text style={[dtSt.thCell, { flex: 1, textAlign: 'right' }]}>Prix</Text>
                            <Text style={[dtSt.thCell, { flex: 1, textAlign: 'center' }]}>Stock</Text>
                            <Text style={[dtSt.thCell, { width: 80, textAlign: 'center' }]}>Actions</Text>
                        </View>
                        {filtered.map((product, idx) => {
                            const stock = getStockLevel(product.id);
                            return (
                                <View key={product.id} style={[dtSt.tableRow, idx % 2 === 1 && dtSt.tableRowAlt]}>
                                    <View style={[dtSt.tdProduct, { flex: 2 }]}>
                                        {product.imageUrl ? (
                                            <Image source={{ uri: product.imageUrl }} style={styles.productIcon} />
                                        ) : (
                                            <View style={[styles.productIcon, { backgroundColor: product.color }]}>
                                                <Text style={[styles.productLetter, { color: product.iconColor }]}>
                                                    {product.name.charAt(0).toUpperCase()}
                                                </Text>
                                            </View>
                                        )}
                                        <Text style={styles.productName} numberOfLines={1}>{product.name}</Text>
                                    </View>
                                    <Text style={[dtSt.tdText, { flex: 1 }]}>{product.category || '—'}</Text>
                                    <Text style={[dtSt.tdPrice, { flex: 1 }]}>{product.price.toLocaleString()} F</Text>
                                    <View style={{ flex: 1, alignItems: 'center' }}>
                                        <View style={[styles.stockBadge, stock < 3 && styles.stockBadgeLow]}>
                                            <Text style={[styles.stockText, stock < 3 && styles.stockTextLow]}>{stock} unités</Text>
                                        </View>
                                    </View>
                                    <View style={[styles.qtyControls, { width: 80, justifyContent: 'center' }]}>
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
                ) : (
                    filtered.map(product => {
                        const stock = getStockLevel(product.id);
                        return (
                            <View key={product.id} style={styles.productRow}>
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
                    })
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
                                <ImagePickerButton
                                    imageUri={imageUri}
                                    onImageSelected={(uri, file) => { setImageUri(uri); setWebFile(file); }}
                                    onImageRemoved={() => { setImageUri(null); setWebFile(undefined); }}
                                />

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
                                    <TouchableOpacity style={styles.scanBtn} onPress={handleOpenScanner}>
                                        <QrCode color={colors.white} size={20} />
                                    </TouchableOpacity>
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
                    {Platform.OS === 'web' ? (
                        <WebBarcodeScanner
                            style={StyleSheet.absoluteFillObject}
                            onScan={handleBarCodeScanned}
                            active={!scanPaused}
                        />
                    ) : permission?.granted ? (
                        <CameraView
                            style={StyleSheet.absoluteFillObject}
                            facing="back"
                            barcodeScannerSettings={{
                                barcodeTypes: ['qr', 'ean13', 'ean8', 'code128', 'code39', 'code93', 'upc_a', 'upc_e', 'itf14', 'codabar'],
                            }}
                            onBarcodeScanned={scanPaused ? undefined : handleBarCodeScanned}
                        />
                    ) : (
                        <View style={styles.noPermBox}>
                            <Text style={styles.noPermText}>Acces camera non autorise</Text>
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

// ── Styles desktop ─────────────────────────────────────────────────
const dtSt = StyleSheet.create({
    searchContainer: {
        maxWidth: 1400, alignSelf: 'center', width: '100%',
        paddingHorizontal: 32, flexDirection: 'row', alignItems: 'center', gap: 16,
    },
    searchWrapper: { flex: 1, maxWidth: 500 },
    countText: { fontSize: 13, fontWeight: '700', color: colors.slate400 },
    scrollContent: { maxWidth: 1400, alignSelf: 'center', width: '100%', paddingHorizontal: 32, paddingTop: 8 },
    tableCard: {
        backgroundColor: '#FFF', borderRadius: 12, overflow: 'hidden',
        shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.06, shadowRadius: 12, elevation: 3,
    },
    tableHeader: {
        flexDirection: 'row', alignItems: 'center',
        backgroundColor: '#F9FAFB', paddingHorizontal: 20, paddingVertical: 12,
        borderBottomWidth: 1, borderBottomColor: '#F3F4F6',
    },
    thCell: {
        fontSize: 11, fontWeight: '800', color: '#6B7280', letterSpacing: 1, textTransform: 'uppercase',
    },
    tableRow: {
        flexDirection: 'row', alignItems: 'center',
        paddingHorizontal: 20, paddingVertical: 14,
        borderBottomWidth: 1, borderBottomColor: '#F9FAFB',
    },
    tableRowAlt: { backgroundColor: '#FAFBFC' },
    tdProduct: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    tdText: { fontSize: 13, color: '#6B7280' },
    tdPrice: { fontSize: 14, fontWeight: '800', color: '#1F2937', textAlign: 'right' },
});
