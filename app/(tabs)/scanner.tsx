// Ecran Scanner — expo-camera (mobile) + BarcodeDetector API (web)
// Camera centree, overlay sombre, ligne de scan animee, coins verts
// Modal ajout produit integre quand code-barres inconnu
import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
    View, Text, StyleSheet, TouchableOpacity, Pressable,
    Animated, Vibration, Dimensions, Platform,
    Modal, TextInput, ScrollView, KeyboardAvoidingView, Alert,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { ChevronLeft, Flashlight, FlashlightOff, RotateCcw, Plus, ShoppingBag, X, Check } from 'lucide-react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useProductContext } from '@/src/context/ProductContext';
import { useStockContext } from '@/src/context/StockContext';
import { offlineCache, CACHE_KEYS } from '@/src/lib/offlineCache';
import { useProfileContext } from '@/src/context/ProfileContext';
import { useNetwork } from '@/src/context/NetworkContext';
import { uploadProductImage } from '@/src/lib/storage';
import { colors } from '@/src/lib/colors';
// WebBarcodeScanner = web-only (HTML elements), lazy-load to avoid crash on mobile
const WebBarcodeScanner = Platform.OS === 'web'
    ? require('@/src/components/WebBarcodeScanner').default
    : () => null;
import ImagePickerButton from '@/src/components/ImagePickerButton';
import { actionQueue } from '@/src/lib/offlineQueue';

const { width: SCREEN_W } = Dimensions.get('window');

// Dimensions du cadre de scan
const FRAME_W = Math.min(SCREEN_W - 80, 300);
const FRAME_H = 190;
const CORNER_SIZE = 24;
const CORNER_T = 4;
const MASK = 'rgba(0,0,0,0.72)';
const CORNER_COLOR = '#22c55e';
const COOLDOWN_MS = 2000;

const CATEGORIES = ['Tubercules', 'Legumes', 'Fruits', 'Cereales', 'Viande', 'Manufactures', 'Autre'];
const UNITS = ['kg', 'unite', 'litre', 'sac', 'tas', 'boite', 'bouteille', 'sachet'];
const BG_COLORS   = ['#ecfdf5', '#eff6ff', '#fff7ed', '#fdf4ff', '#fef2f2', '#f0fdf4', '#fefce8'];
const ICON_COLORS = [colors.primary, '#2563eb', '#ea580c', '#7c3aed', '#dc2626', '#16a34a', '#ca8a04'];

type ScanResult =
    | { found: true; code: string; name: string; price: number; stock?: number }
    | { found: false; code: string }
    | null;

export default function ScannerScreen() {
    const router = useRouter();
    const insets = useSafeAreaInsets();
    const { products, addProduct } = useProductContext();
    const { updateStock } = useStockContext();
    const { activeProfile } = useProfileContext();
    const { isOnline } = useNetwork();
    const storeId = activeProfile?.id as string | undefined;

    const [permission, requestPermission] = useCameraPermissions();
    const [torch, setTorch] = useState(false);
    const [paused, setPaused] = useState(false);
    const [result, setResult] = useState<ScanResult>(null);
    const lastScanRef = useRef<number>(0);

    // Modal nouveau produit
    const [showAddModal, setShowAddModal] = useState(false);
    const [newName, setNewName] = useState('');
    const [newPrice, setNewPrice] = useState('');
    const [newCategory, setNewCategory] = useState('Autre');
    const [newUnit, setNewUnit] = useState('unite');
    const [newQty, setNewQty] = useState('');
    const [newAlertThreshold, setNewAlertThreshold] = useState('');
    const [imageUri, setImageUri] = useState<string | null>(null);
    const [webFile, setWebFile] = useState<File | undefined>(undefined);
    const [isAdding, setIsAdding] = useState(false);

    // Animation de la ligne de scan
    const scanAnim = useRef(new Animated.Value(0)).current;
    useEffect(() => {
        const loop = Animated.loop(
            Animated.sequence([
                Animated.timing(scanAnim, { toValue: 1, duration: 1800, useNativeDriver: Platform.OS !== 'web' }),
                Animated.timing(scanAnim, { toValue: 0, duration: 0, useNativeDriver: Platform.OS !== 'web' }),
            ])
        );
        loop.start();
        return () => loop.stop();
    }, []);

    const scanLineY = scanAnim.interpolate({
        inputRange: [0, 1],
        outputRange: [0, FRAME_H - 2],
    });

    // Recherche produit : contexte en memoire + cache offline
    const lookupProduct = useCallback(async (code: string) => {
        const found = products.find(p => p.barcode === code);
        if (found) return { name: found.name, price: found.price, id: found.id };

        if (storeId) {
            try {
                const cached = await offlineCache.get<any[]>(CACHE_KEYS.products(storeId));
                if (cached?.data) {
                    const offlineProduct = cached.data.find((p: any) => p.barcode === code);
                    if (offlineProduct) return { name: offlineProduct.name, price: offlineProduct.price, id: offlineProduct.id };
                }
            } catch { /* pas grave */ }
        }

        return null;
    }, [products, storeId]);

    const handleBarCodeScanned = useCallback(async ({ data }: { type?: string; data: string }) => {
        const now = Date.now();
        if (now - lastScanRef.current < COOLDOWN_MS) return;
        if (paused) return;

        lastScanRef.current = now;
        setPaused(true);
        if (Platform.OS !== 'web') Vibration.vibrate(100);

        const product = await lookupProduct(data);
        if (product) {
            setResult({ found: true, code: data, name: product.name, price: product.price });
        } else {
            setResult({ found: false, code: data });
        }
    }, [paused, lookupProduct]);

    const handleScanAgain = () => {
        setResult(null);
        setPaused(false);
        lastScanRef.current = 0;
    };

    // ── Modal Nouveau Produit ─────────────────────────────────────────────
    const scannedBarcode = result && !result.found ? result.code : '';

    const openAddModal = () => {
        setNewName('');
        setNewPrice('');
        setNewCategory('Autre');
        setNewUnit('unite');
        setNewQty('');
        setNewAlertThreshold('');
        setImageUri(null);
        setWebFile(undefined);
        setShowAddModal(true);
    };

    const handleAddProduct = async () => {
        if (!newName.trim() || !newPrice) {
            Alert.alert('Erreur', 'Nom et prix sont obligatoires.');
            return;
        }
        setIsAdding(true);

        let photoUrl: string | undefined;
        if (imageUri && isOnline) {
            const url = await uploadProductImage(imageUri, webFile);
            if (url) photoUrl = url;
        }

        const idx = Math.floor(Math.random() * BG_COLORS.length);
        const productData = {
            name:      newName.trim(),
            price:     parseFloat(newPrice),
            audioName: newName.trim(),
            category:  newCategory,
            barcode:   scannedBarcode || undefined,
            color:     BG_COLORS[idx],
            iconColor: ICON_COLORS[idx],
            imageUrl:  photoUrl,
            store_id:  '',
        };

        if (isOnline) {
            const success = await addProduct(productData);
            if (success) {
                // Ajouter le stock initial si quantite specifiee
                if (newQty && parseInt(newQty) > 0) {
                    const addedProduct = products.find(p => p.barcode === scannedBarcode && p.name === newName.trim());
                    if (addedProduct) {
                        await updateStock(addedProduct.id, parseInt(newQty));
                    }
                }
                setShowAddModal(false);
                // Passer en mode "produit trouve"
                setResult({ found: true, code: scannedBarcode, name: productData.name, price: productData.price });
            } else {
                Alert.alert('Erreur', "Impossible d'ajouter le produit.");
            }
        } else {
            // Mode offline : sauvegarder dans la queue
            try {
                await actionQueue.add({
                    type: 'ADD_PRODUCT',
                    table: 'products',
                    data: {
                        ...productData,
                        store_id: storeId,
                        image_uri: imageUri, // sera uploadee a la sync
                    },
                    storeId: storeId || 'unknown',
                });
                setShowAddModal(false);
                setResult({ found: true, code: scannedBarcode, name: productData.name, price: productData.price });
                Alert.alert('Sauvegarde hors-ligne', 'Le produit sera synchronise quand vous serez connecte.');
            } catch {
                Alert.alert('Erreur', "Impossible de sauvegarder le produit.");
            }
        }
        setIsAdding(false);
    };

    // ── Permission en attente (mobile seulement) ──
    if (Platform.OS !== 'web' && !permission) {
        return (
            <View style={styles.fullDark}>
                <Text style={styles.permText}>Verification des permissions...</Text>
            </View>
        );
    }

    // ── Permission refusee (mobile seulement) ──
    if (Platform.OS !== 'web' && !permission?.granted) {
        return (
            <View style={styles.fullDark}>
                <Text style={styles.permTitle}>Acces Camera Requis</Text>
                <Text style={styles.permText}>Necessaire pour scanner les codes-barres.</Text>
                <TouchableOpacity style={styles.permBtn} onPress={requestPermission}>
                    <Text style={styles.permBtnText}>AUTORISER LA CAMERA</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.backTextBtn} onPress={() => router.back()}>
                    <Text style={styles.backTextBtnText}>RETOUR</Text>
                </TouchableOpacity>
            </View>
        );
    }

    // ── Ecran principal ──
    return (
        <View style={styles.container}>
            {/* Camera : WebBarcodeScanner sur web, CameraView sur mobile */}
            {Platform.OS === 'web' ? (
                <WebBarcodeScanner
                    style={StyleSheet.absoluteFillObject}
                    onScan={handleBarCodeScanned}
                    active={!paused}
                />
            ) : (
                <CameraView
                    style={StyleSheet.absoluteFillObject}
                    facing="back"
                    enableTorch={torch}
                    barcodeScannerSettings={{
                        barcodeTypes: ['qr', 'ean13', 'ean8', 'code128', 'code39', 'code93', 'upc_a', 'upc_e', 'itf14', 'codabar'],
                    }}
                    onBarcodeScanned={paused ? undefined : handleBarCodeScanned}
                />
            )}

            {/* ── LAYOUT OVERLAY ── */}
            <SafeAreaView style={styles.layout} edges={['top', 'bottom']} pointerEvents="box-none">

                {/* Header avec fond sombre */}
                <View style={styles.headerMask}>
                    <TouchableOpacity style={styles.iconBtn} onPress={() => router.back()}>
                        <ChevronLeft color={colors.primary} size={24} />
                    </TouchableOpacity>
                    <Text style={styles.headerTitle}>SCANNER PRODUIT</Text>
                    {Platform.OS !== 'web' ? (
                        <TouchableOpacity style={styles.iconBtn} onPress={() => setTorch(v => !v)}>
                            {torch
                                ? <FlashlightOff color={colors.white} size={22} />
                                : <Flashlight color={colors.white} size={22} />
                            }
                        </TouchableOpacity>
                    ) : (
                        <View style={styles.iconBtn} />
                    )}
                </View>

                {/* Zone au-dessus du cadre */}
                <View style={styles.topMask} />

                {/* Rangee centrale : masque gauche | cadre transparent | masque droit */}
                <View style={styles.middleRow}>
                    <View style={styles.sideMask} />

                    {/* Cadre de scan */}
                    <View style={styles.scanFrame}>
                        <View style={[styles.corner, styles.cornerTL]} />
                        <View style={[styles.corner, styles.cornerTR]} />
                        <View style={[styles.corner, styles.cornerBL]} />
                        <View style={[styles.corner, styles.cornerBR]} />
                        <Animated.View
                            style={[styles.scanLine, { transform: [{ translateY: scanLineY }] }]}
                        />
                    </View>

                    <View style={styles.sideMask} />
                </View>

                {/* Zone en dessous du cadre + bandeau resultat */}
                <View style={styles.bottomMask}>
                    {!result ? (
                        <Text style={styles.hint}>Placez le code-barres dans le cadre</Text>
                    ) : result.found ? (
                        /* ── Produit trouve ── */
                        <View style={styles.resultCard}>
                            <Text style={styles.resultFoundTag}>PRODUIT TROUVE</Text>
                            <Text style={styles.resultName}>{result.name}</Text>
                            <Text style={styles.resultPrice}>{result.price.toLocaleString()} F CFA</Text>
                            <View style={styles.resultActions}>
                                <Pressable
                                    style={({ pressed }) => [styles.btnSecondary, pressed && { opacity: 0.75 }]}
                                    onPress={handleScanAgain}
                                >
                                    <RotateCcw color={colors.slate600} size={14} />
                                    <Text style={styles.btnSecondaryText}>RESCANNER</Text>
                                </Pressable>
                                <Pressable
                                    style={({ pressed }) => [styles.btnPrimary, pressed && { opacity: 0.85 }]}
                                    onPress={() => router.push('/(tabs)/vendre')}
                                >
                                    <ShoppingBag color={colors.white} size={14} />
                                    <Text style={styles.btnPrimaryText}>VENDRE</Text>
                                </Pressable>
                            </View>
                        </View>
                    ) : (
                        /* ── Produit non trouve ── */
                        <View style={styles.resultCard}>
                            <Text style={styles.resultNotFoundTag}>PRODUIT INCONNU</Text>
                            <Text style={styles.resultCode}>{result.code}</Text>
                            <Text style={styles.resultCodeLabel}>Ce produit n'est pas dans votre catalogue</Text>
                            <View style={styles.resultActions}>
                                <Pressable
                                    style={({ pressed }) => [styles.btnSecondary, pressed && { opacity: 0.75 }]}
                                    onPress={handleScanAgain}
                                >
                                    <RotateCcw color={colors.slate600} size={14} />
                                    <Text style={styles.btnSecondaryText}>RESCANNER</Text>
                                </Pressable>
                                <Pressable
                                    style={({ pressed }) => [styles.btnPrimary, pressed && { opacity: 0.85 }]}
                                    onPress={openAddModal}
                                >
                                    <Plus color={colors.white} size={14} />
                                    <Text style={styles.btnPrimaryText}>AJOUTER</Text>
                                </Pressable>
                            </View>
                        </View>
                    )}
                </View>

            </SafeAreaView>

            {/* ── MODAL NOUVEAU PRODUIT ── */}
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
                                {/* Code-barres pre-rempli */}
                                <Text style={styles.inputLabel}>CODE-BARRES</Text>
                                <View style={styles.barcodeBadge}>
                                    <Text style={styles.barcodeBadgeText}>{scannedBarcode}</Text>
                                </View>

                                {/* Photo */}
                                <ImagePickerButton
                                    imageUri={imageUri}
                                    onImageSelected={(uri, file) => { setImageUri(uri); setWebFile(file); }}
                                    onImageRemoved={() => { setImageUri(null); setWebFile(undefined); }}
                                />

                                {/* Nom */}
                                <Text style={styles.inputLabel}>NOM DU PRODUIT *</Text>
                                <TextInput
                                    style={styles.modalInput}
                                    placeholder="Ex: Riz Parfume 25kg"
                                    placeholderTextColor={colors.slate300}
                                    value={newName}
                                    onChangeText={setNewName}
                                    returnKeyType="next"
                                />

                                {/* Categorie */}
                                <Text style={styles.inputLabel}>CATEGORIE</Text>
                                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 16 }}>
                                    <View style={{ flexDirection: 'row', gap: 8 }}>
                                        {CATEGORIES.map(cat => (
                                            <TouchableOpacity
                                                key={cat}
                                                style={[styles.chipBtn, newCategory === cat && styles.chipBtnActive]}
                                                onPress={() => setNewCategory(cat)}
                                            >
                                                <Text style={[styles.chipText, newCategory === cat && styles.chipTextActive]}>{cat}</Text>
                                            </TouchableOpacity>
                                        ))}
                                    </View>
                                </ScrollView>

                                {/* Prix */}
                                <Text style={styles.inputLabel}>PRIX DE VENTE (F CFA) *</Text>
                                <TextInput
                                    style={styles.modalInput}
                                    placeholder="Ex: 2500"
                                    placeholderTextColor={colors.slate300}
                                    value={newPrice}
                                    onChangeText={setNewPrice}
                                    keyboardType="numeric"
                                    returnKeyType="next"
                                />

                                {/* Unite */}
                                <Text style={styles.inputLabel}>UNITE DE MESURE</Text>
                                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 16 }}>
                                    <View style={{ flexDirection: 'row', gap: 8 }}>
                                        {UNITS.map(u => (
                                            <TouchableOpacity
                                                key={u}
                                                style={[styles.chipBtn, newUnit === u && styles.chipBtnActive]}
                                                onPress={() => setNewUnit(u)}
                                            >
                                                <Text style={[styles.chipText, newUnit === u && styles.chipTextActive]}>{u}</Text>
                                            </TouchableOpacity>
                                        ))}
                                    </View>
                                </ScrollView>

                                {/* Quantite initiale + seuil alerte */}
                                <View style={styles.rowInputs}>
                                    <View style={{ flex: 1 }}>
                                        <Text style={styles.inputLabel}>STOCK INITIAL</Text>
                                        <TextInput
                                            style={styles.modalInput}
                                            placeholder="0"
                                            placeholderTextColor={colors.slate300}
                                            value={newQty}
                                            onChangeText={setNewQty}
                                            keyboardType="numeric"
                                        />
                                    </View>
                                    <View style={{ width: 12 }} />
                                    <View style={{ flex: 1 }}>
                                        <Text style={styles.inputLabel}>SEUIL ALERTE</Text>
                                        <TextInput
                                            style={styles.modalInput}
                                            placeholder="5"
                                            placeholderTextColor={colors.slate300}
                                            value={newAlertThreshold}
                                            onChangeText={setNewAlertThreshold}
                                            keyboardType="numeric"
                                        />
                                    </View>
                                </View>

                                {/* Bouton ajouter */}
                                <TouchableOpacity
                                    style={[styles.addProductBtn, isAdding && { opacity: 0.6 }]}
                                    onPress={handleAddProduct}
                                    disabled={isAdding}
                                    activeOpacity={0.85}
                                >
                                    <Check color={colors.white} size={18} />
                                    <Text style={styles.addProductBtnText}>
                                        {isAdding ? 'AJOUT EN COURS...' : (isOnline ? 'AJOUTER LE PRODUIT' : 'SAUVEGARDER HORS-LIGNE')}
                                    </Text>
                                </TouchableOpacity>
                            </ScrollView>
                        </View>
                    </View>
                </KeyboardAvoidingView>
            </Modal>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#000' },

    // Permission screens
    fullDark: { flex: 1, backgroundColor: '#0f172a', alignItems: 'center', justifyContent: 'center', padding: 32, gap: 16 },
    permTitle: { fontSize: 20, fontWeight: '900', color: colors.white, textAlign: 'center' },
    permText: { fontSize: 14, color: colors.slate400, textAlign: 'center', lineHeight: 20 },
    permBtn: { backgroundColor: colors.primary, borderRadius: 10, paddingHorizontal: 24, paddingVertical: 14, marginTop: 8 },
    permBtnText: { color: colors.white, fontWeight: '900', fontSize: 13, letterSpacing: 1 },
    backTextBtn: { paddingVertical: 12 },
    backTextBtnText: { color: colors.slate400, fontWeight: '700', fontSize: 12, letterSpacing: 2 },

    // Layout overlay
    layout: { flex: 1 },

    // Header avec fond sombre
    headerMask: {
        backgroundColor: MASK,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        paddingVertical: 12,
    },
    iconBtn: {
        width: 40, height: 40, borderRadius: 10,
        backgroundColor: 'rgba(255,255,255,0.15)',
        alignItems: 'center', justifyContent: 'center',
    },
    headerTitle: { fontSize: 14, fontWeight: '900', color: colors.white, letterSpacing: 2 },

    // Masque au-dessus du cadre
    topMask: { flex: 1, backgroundColor: MASK },

    // Rangee centrale
    middleRow: { flexDirection: 'row', height: FRAME_H },
    sideMask: { flex: 1, backgroundColor: MASK },

    // Cadre transparent
    scanFrame: {
        width: FRAME_W,
        height: FRAME_H,
        overflow: 'hidden',
        position: 'relative',
    },

    // Coins verts
    corner: {
        position: 'absolute',
        width: CORNER_SIZE,
        height: CORNER_SIZE,
        borderColor: CORNER_COLOR,
    },
    cornerTL: { top: 0, left: 0, borderTopWidth: CORNER_T, borderLeftWidth: CORNER_T, borderTopLeftRadius: 5 },
    cornerTR: { top: 0, right: 0, borderTopWidth: CORNER_T, borderRightWidth: CORNER_T, borderTopRightRadius: 5 },
    cornerBL: { bottom: 0, left: 0, borderBottomWidth: CORNER_T, borderLeftWidth: CORNER_T, borderBottomLeftRadius: 5 },
    cornerBR: { bottom: 0, right: 0, borderBottomWidth: CORNER_T, borderRightWidth: CORNER_T, borderBottomRightRadius: 5 },

    // Ligne de scan rouge animee
    scanLine: {
        position: 'absolute',
        top: 0,
        left: 8,
        right: 8,
        height: 2,
        backgroundColor: '#ef4444',
        borderRadius: 2,
        shadowColor: '#ef4444',
        shadowOpacity: 0.9,
        shadowRadius: 6,
        elevation: 4,
    },

    // Zone en bas
    bottomMask: {
        flex: 1.4,
        backgroundColor: MASK,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 20,
        paddingVertical: 12,
        gap: 12,
    },
    hint: {
        fontSize: 12,
        color: 'rgba(255,255,255,0.65)',
        fontWeight: '600',
        letterSpacing: 0.4,
        textAlign: 'center',
    },

    // Bandeau resultat
    resultCard: {
        width: '100%',
        backgroundColor: colors.white,
        borderRadius: 10,
        padding: 18,
        alignItems: 'center',
        gap: 6,
    },
    resultFoundTag: {
        fontSize: 11, fontWeight: '900', color: '#16a34a', letterSpacing: 2, textTransform: 'uppercase',
    },
    resultNotFoundTag: {
        fontSize: 11, fontWeight: '900', color: '#dc2626', letterSpacing: 2, textTransform: 'uppercase',
    },
    resultName: { fontSize: 18, fontWeight: '900', color: colors.slate900, textAlign: 'center' },
    resultPrice: { fontSize: 22, fontWeight: '900', color: colors.primary },
    resultCode: { fontSize: 16, fontWeight: '800', color: colors.slate700, letterSpacing: 1 },
    resultCodeLabel: { fontSize: 12, color: colors.slate400, textAlign: 'center' },

    resultActions: { flexDirection: 'row', gap: 10, marginTop: 6, width: '100%' },
    btnSecondary: {
        flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
        gap: 6, paddingVertical: 11, borderRadius: 10,
        borderWidth: 1.5, borderColor: colors.slate200,
    },
    btnSecondaryText: { fontSize: 11, fontWeight: '900', color: colors.slate600, letterSpacing: 0.5 },
    btnPrimary: {
        flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
        gap: 6, paddingVertical: 11, borderRadius: 10,
        backgroundColor: colors.primary,
    },
    btnPrimaryText: { fontSize: 11, fontWeight: '900', color: colors.white, letterSpacing: 0.5 },

    // ── Modal Nouveau Produit ──
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.55)',
        justifyContent: 'flex-end',
    },
    modalCard: {
        backgroundColor: colors.white,
        borderTopLeftRadius: 12,
        borderTopRightRadius: 12,
        padding: 20,
        maxHeight: '88%',
    },
    modalHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 16,
    },
    modalTitle: {
        fontSize: 15,
        fontWeight: '900',
        color: colors.slate900,
        letterSpacing: 1.5,
    },
    xCloseBtn: {
        width: 34,
        height: 34,
        borderRadius: 10,
        backgroundColor: colors.slate100,
        alignItems: 'center',
        justifyContent: 'center',
    },
    barcodeBadge: {
        backgroundColor: colors.slate100,
        borderRadius: 8,
        paddingHorizontal: 14,
        paddingVertical: 10,
        marginBottom: 16,
    },
    barcodeBadgeText: {
        fontSize: 15,
        fontWeight: '800',
        color: colors.slate700,
        letterSpacing: 1,
        textAlign: 'center',
    },
    inputLabel: {
        fontSize: 11,
        fontWeight: '800',
        color: colors.slate500,
        letterSpacing: 1,
        marginBottom: 6,
    },
    modalInput: {
        backgroundColor: colors.slate50,
        borderRadius: 10,
        borderWidth: 1,
        borderColor: colors.slate200,
        paddingHorizontal: 14,
        paddingVertical: 12,
        fontSize: 15,
        color: colors.slate800,
        marginBottom: 16,
    },
    chipBtn: {
        paddingHorizontal: 14,
        paddingVertical: 8,
        borderRadius: 10,
        borderWidth: 1.5,
        borderColor: colors.slate200,
        backgroundColor: colors.white,
    },
    chipBtnActive: {
        backgroundColor: colors.primary,
        borderColor: colors.primary,
    },
    chipText: {
        fontSize: 12,
        fontWeight: '700',
        color: colors.slate600,
    },
    chipTextActive: {
        color: colors.white,
    },
    rowInputs: {
        flexDirection: 'row',
        marginBottom: 4,
    },
    addProductBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        backgroundColor: colors.primary,
        borderRadius: 10,
        paddingVertical: 14,
        marginTop: 4,
    },
    addProductBtnText: {
        color: colors.white,
        fontWeight: '900',
        fontSize: 13,
        letterSpacing: 0.5,
    },
});
