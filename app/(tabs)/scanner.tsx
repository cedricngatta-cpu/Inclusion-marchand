// Ecran Scanner — expo-camera (mobile) + BarcodeDetector API (web)
// Camera centree, overlay sombre, ligne de scan animee, coins verts
import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
    View, Text, StyleSheet, TouchableOpacity, Pressable,
    Animated, Vibration, Dimensions, Platform,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { ChevronLeft, Flashlight, FlashlightOff, RotateCcw, Plus, ShoppingBag } from 'lucide-react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useProductContext } from '@/src/context/ProductContext';
import { offlineCache, CACHE_KEYS } from '@/src/lib/offlineCache';
import { useProfileContext } from '@/src/context/ProfileContext';
import { colors } from '@/src/lib/colors';
import WebBarcodeScanner from '@/src/components/WebBarcodeScanner';

const { width: SCREEN_W } = Dimensions.get('window');

// Dimensions du cadre de scan
const FRAME_W = Math.min(SCREEN_W - 80, 300);
const FRAME_H = 190;
const CORNER_SIZE = 24;
const CORNER_T = 4;
const MASK = 'rgba(0,0,0,0.72)';
const CORNER_COLOR = '#22c55e';
const COOLDOWN_MS = 2000;

type ScanResult =
    | { found: true; code: string; name: string; price: number; stock?: number }
    | { found: false; code: string }
    | null;

export default function ScannerScreen() {
    const router = useRouter();
    const { products } = useProductContext();
    const { activeProfile } = useProfileContext();
    const storeId = activeProfile?.id as string | undefined;

    const [permission, requestPermission] = useCameraPermissions();
    const [torch, setTorch] = useState(false);
    const [paused, setPaused] = useState(false);
    const [result, setResult] = useState<ScanResult>(null);
    const lastScanRef = useRef<number>(0);

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
        // 1. Chercher dans le contexte ProductContext (memoire)
        const found = products.find(p => p.barcode === code);
        if (found) return { name: found.name, price: found.price, id: found.id };

        // 2. Chercher dans le cache offline si un storeId est disponible
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
        // Debounce : ignorer si scan recent
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
                        {/* Coins verts */}
                        <View style={[styles.corner, styles.cornerTL]} />
                        <View style={[styles.corner, styles.cornerTR]} />
                        <View style={[styles.corner, styles.cornerBL]} />
                        <View style={[styles.corner, styles.cornerBR]} />

                        {/* Ligne de scan animee */}
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
                                    onPress={() => router.push('/(tabs)/stock')}
                                >
                                    <Plus color={colors.white} size={14} />
                                    <Text style={styles.btnPrimaryText}>AJOUTER</Text>
                                </Pressable>
                            </View>
                        </View>
                    )}
                </View>

            </SafeAreaView>
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

    // Cadre transparent (la camera est visible derriere)
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
});
