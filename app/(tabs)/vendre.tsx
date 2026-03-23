// Écran Vendre — grille produits par défaut + scanner optionnel en modal
import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
    View, Text, ScrollView, TouchableOpacity, StyleSheet,
    TextInput, Modal, Alert, Animated, Vibration, Dimensions, Image, Platform, useWindowDimensions,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { SafeAreaView } from 'react-native-safe-area-context';
// WebBarcodeScanner = web-only (HTML elements), lazy-load to avoid crash on mobile
const WebBarcodeScanner = Platform.OS === 'web'
    ? require('@/src/components/WebBarcodeScanner').default
    : () => null;
import {
    ShoppingBag, Trash2, CheckCircle, Smartphone, Banknote,
    BookOpen, Plus, Minus, QrCode, X, Flashlight, FlashlightOff, RotateCcw, ChevronLeft,
} from 'lucide-react-native';
import { ScreenHeader } from '@/src/components/ui';
import { useProductContext } from '@/src/context/ProductContext';
import { useStockContext } from '@/src/context/StockContext';
import { useHistoryContext } from '@/src/context/HistoryContext';
import { useAuth } from '@/src/context/AuthContext';
import { useProfileContext } from '@/src/context/ProfileContext';
import { useNetwork } from '@/src/context/NetworkContext';
import { offlineQueue, syncOfflineQueue, PendingTransaction } from '@/src/lib/offlineQueue';
import { colors } from '@/src/lib/colors';
import { supabase } from '@/src/lib/supabase';

// ── Scanner overlay dimensions ──
const { width: SCREEN_W } = Dimensions.get('window');
const FRAME_W = Math.min(SCREEN_W - 80, 300);
const FRAME_H = 190;
const CORNER_SIZE = 24;
const CORNER_T = 4;
const MASK = 'rgba(0,0,0,0.72)';
const CORNER_COLOR = '#22c55e';

interface CartItem {
    id: string;
    name: string;
    price: number;
    quantity: number;
}

const PAYMENT_OPTIONS = [
    { value: 'PAYÉ' as const, label: 'Espèces', icon: Banknote,    color: colors.primary },
    { value: 'MOMO' as const, label: 'Mobile',  icon: Smartphone,  color: '#2563eb' },
    { value: 'DETTE' as const, label: 'Crédit', icon: BookOpen,    color: '#f97316' },
];

const MOMO_OPERATORS = [
    { value: 'ORANGE' as const, label: 'Orange Money', bgColor: '#FFF3E6', borderColor: '#FF6600', textColor: '#FF6600' },
    { value: 'MTN'    as const, label: 'MTN MoMo',     bgColor: '#FFFDE6', borderColor: '#FFCC00', textColor: '#996600' },
    { value: 'WAVE'   as const, label: 'Wave',          bgColor: '#E6F9FC', borderColor: '#1DC4E9', textColor: '#0A8FA8' },
    { value: 'MOOV'   as const, label: 'Moov Money',   bgColor: '#E6F0FF', borderColor: '#0066CC', textColor: '#0066CC' },
];

export default function VendreScreen() {
    const { user } = useAuth();
    const { activeProfile } = useProfileContext();
    const { width } = useWindowDimensions();
    const isDesktop = Platform.OS === 'web' && width > 768;
    const { products } = useProductContext();
    const { updateStock, getStockLevel, refreshStock } = useStockContext();
    const { addTransaction, refreshHistory } = useHistoryContext();
    const { isOnline, addToPendingCount, resetPendingCount } = useNetwork();

    // ── Blocage des touches au montage (web : le clic de navigation se propage) ──
    const [touchReady, setTouchReady] = useState(Platform.OS !== 'web');
    useEffect(() => {
        if (Platform.OS === 'web') {
            const t = setTimeout(() => setTouchReady(true), 250);
            return () => clearTimeout(t);
        }
    }, []);

    // ── Panier ──
    const [cart, setCart]             = useState<CartItem[]>([]);
    const [clientName, setClientName] = useState('');
    const [paymentStatus, setPaymentStatus] = useState<'PAYÉ' | 'DETTE' | 'MOMO'>('PAYÉ');
    const [momoOperator, setMomoOperator]   = useState<'ORANGE' | 'MTN' | 'WAVE' | 'MOOV' | null>(null);
    const [clientPhone,  setClientPhone]    = useState('');
    const [showSuccess, setShowSuccess]     = useState(false);
    const [offlineSale, setOfflineSale]     = useState(false);
    const [isLoading, setIsLoading]         = useState(false);

    const total     = cart.reduce((acc, i) => acc + i.price * i.quantity, 0);

    // ── Scanner modal ──
    const [showScanner, setShowScanner]       = useState(false);
    const [permission, requestPermission]     = useCameraPermissions();
    const [torch, setTorch]                   = useState(false);
    const [scanFeedback, setScanFeedback]     = useState<'found' | 'unknown' | null>(null);
    const [scanFeedbackName, setScanFeedbackName] = useState('');
    const cooldown       = useRef(false);
    const scanTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Nettoyage du timeout scanner au démontage
    useEffect(() => {
        return () => {
            if (scanTimeoutRef.current) clearTimeout(scanTimeoutRef.current);
        };
    }, []);

    // Synchronisation hors-ligne → Supabase à la reconnexion
    const prevIsOnlineRef = useRef(isOnline);
    useEffect(() => {
        if (!prevIsOnlineRef.current && isOnline && user?.id) {
            syncOfflineQueue(user.id)
                .then(count => { if (count > 0) resetPendingCount(); })
                .catch(() => {});
        }
        prevIsOnlineRef.current = isOnline;
    }, [isOnline]);

    // Animation ligne de scan
    const scanAnim = useRef(new Animated.Value(0)).current;
    useEffect(() => {
        if (!showScanner) return;
        const loop = Animated.loop(
            Animated.sequence([
                Animated.timing(scanAnim, { toValue: 1, duration: 1800, useNativeDriver: Platform.OS !== 'web' }),
                Animated.timing(scanAnim, { toValue: 0, duration: 0,    useNativeDriver: Platform.OS !== 'web' }),
            ])
        );
        loop.start();
        return () => loop.stop();
    }, [showScanner]);

    const scanLineY = scanAnim.interpolate({ inputRange: [0, 1], outputRange: [0, FRAME_H - 2] });

    // ── Ajouter au panier (avec vérification stock) ──
    const addToCart = useCallback((product: { id: string; name: string; price: number }) => {
        const availableStock = getStockLevel(product.id);

        if (availableStock <= 0) {
            Alert.alert('Stock épuisé', `"${product.name}" n'est plus disponible.`);
            return;
        }

        setCart(prev => {
            const existing = prev.find(i => i.id === product.id);
            if (existing) {
                if (existing.quantity >= availableStock) return prev; // limite atteinte
                return prev.map(i => i.id === product.id ? { ...i, quantity: i.quantity + 1 } : i);
            }
            return [...prev, { id: product.id, name: product.name, price: product.price, quantity: 1 }];
        });
    }, [getStockLevel]);

    const changeQty = (id: string, delta: number) => {
        const availableStock = getStockLevel(id);
        setCart(prev => {
            const item = prev.find(i => i.id === id);
            if (!item) return prev;
            const newQty = item.quantity + delta;
            if (newQty <= 0) return prev.filter(i => i.id !== id);
            if (delta > 0 && newQty > availableStock) return prev; // cap au stock disponible
            return prev.map(i => i.id === id ? { ...i, quantity: newQty } : i);
        });
    };

    // ── Scan barcode ──
    const lastScanTimeRef = useRef<number>(0);
    const handleBarCodeScanned = ({ data }: { type?: string; data: string }) => {
        const now = Date.now();
        if (now - lastScanTimeRef.current < 2000) return;
        if (cooldown.current) return;
        cooldown.current = true;
        lastScanTimeRef.current = now;
        if (Platform.OS !== 'web') Vibration.vibrate(80);

        const product = products.find(p => p.barcode === data);
        if (product) {
            addToCart(product);
            setScanFeedbackName(product.name);
            setScanFeedback('found');
        } else {
            setScanFeedback('unknown');
        }

        if (scanTimeoutRef.current) clearTimeout(scanTimeoutRef.current);
        scanTimeoutRef.current = setTimeout(() => {
            setScanFeedback(null);
            setScanFeedbackName('');
            cooldown.current = false;
        }, 2000);
    };

    const closeScanner = () => {
        setShowScanner(false);
        setTorch(false);
        setScanFeedback(null);
        cooldown.current = false;
    };

    // ── Valider la vente ──
    const handleFinish = useCallback(async () => {
        if (cart.length === 0) {
            Alert.alert('Panier vide', 'Ajoutez des produits avant de valider.');
            return;
        }

        // ── Étape 1 : pré-validation du stock pour tous les articles ──
        const insufficients = cart.filter(item => getStockLevel(item.id) < item.quantity);
        if (insufficients.length > 0) {
            const detail = insufficients
                .map(i => `• ${i.name} : demandé ${i.quantity}, disponible ${getStockLevel(i.id)}`)
                .join('\n');
            Alert.alert('Stock insuffisant', `Réduisez la quantité pour :\n${detail}`);
            return;
        }

        setIsLoading(true);

        // ── Chemin hors-ligne : mise en file d'attente locale ──
        if (!isOnline) {
            const storeId = activeProfile?.id ?? user?.id ?? '';
            for (const item of cart) {
                const tx: PendingTransaction = {
                    id: `offline_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
                    store_id: storeId,
                    type: 'VENTE',
                    product_id: item.id,
                    product_name: item.name,
                    quantity: item.quantity,
                    price: item.price * item.quantity,
                    client_name: clientName || undefined,
                    status: paymentStatus,
                    operator: paymentStatus === 'MOMO' ? (momoOperator ?? undefined) : undefined,
                    client_phone: paymentStatus === 'MOMO' && clientPhone ? clientPhone : undefined,
                    created_at: new Date().toISOString(),
                };
                await offlineQueue.addTransaction(storeId, tx);
            }
            addToPendingCount(cart.length);
            setIsLoading(false);
            setOfflineSale(true);
            setShowSuccess(true);
            setTimeout(() => {
                setCart([]);
                setClientName('');
                setClientPhone('');
                setPaymentStatus('PAYÉ');
                setMomoOperator(null);
                setShowSuccess(false);
                setOfflineSale(false);
            }, 2500);
            return;
        }

        const skipped: string[] = [];

        try {
            // ── Étape 2 : traiter chaque article séquentiellement ──
            for (const item of cart) {
                // Re-vérifier le stock en temps réel (autre appareil peut avoir vendu entre-temps)
                const currentStock = getStockLevel(item.id);
                if (currentStock < item.quantity) {
                    skipped.push(`${item.name} (stock actuel : ${currentStock})`);
                    continue;
                }

                // Décrémenter le stock de la quantité réelle vendue
                await updateStock(item.id, -item.quantity);

                // Enregistrer la transaction avec le prix total de la ligne
                await addTransaction({
                    type:        'VENTE',
                    productId:   item.id,
                    productName: item.name,
                    quantity:    item.quantity,
                    price:       item.price * item.quantity,
                    clientName:  clientName || undefined,
                    status:      paymentStatus,
                    operator:    paymentStatus === 'MOMO' ? (momoOperator ?? undefined) : undefined,
                    clientPhone: paymentStatus === 'MOMO' && clientPhone ? clientPhone : undefined,
                });
            }

            // ── Étape 3 : log activité ──
            try {
                await supabase.from('activity_logs').insert([{
                    user_id:   user?.id ?? null,
                    user_name: user?.name ?? 'Marchand',
                    action:    `Vente validée — ${cart.length} produit(s) pour ${total.toLocaleString('fr-FR')} F (${paymentStatus})`,
                    type:      'vente',
                }]);
            } catch {}

            // ── Étape 4 : rafraîchir les contextes depuis Supabase ──
            refreshHistory().catch(console.error);
            refreshStock().catch(console.error);

            // ── Étape 5 : succès ──
            setShowSuccess(true);
            setTimeout(() => {
                setCart([]);
                setClientName('');
                setClientPhone('');
                setPaymentStatus('PAYÉ');
                setMomoOperator(null);
                setShowSuccess(false);
            }, 2500);

            // Avertir si certains articles ont été ignorés
            if (skipped.length > 0) {
                setTimeout(() => {
                    Alert.alert(
                        'Articles ignorés',
                        `Stock épuisé entre-temps :\n${skipped.map(s => `• ${s}`).join('\n')}`,
                    );
                }, 2600);
            }
        } catch (err) {
            console.error('[Vendre] handleFinish error:', err);
            Alert.alert('Erreur', 'Une erreur est survenue lors de la validation. Réessayez.');
        } finally {
            setIsLoading(false);
        }
    }, [cart, paymentStatus, clientName, getStockLevel, updateStock, addTransaction, refreshHistory, refreshStock, isOnline, addToPendingCount]);

    return (
        <View style={styles.safe}>
            <ScreenHeader
                title="Vendre"
                showBack={true}
                rightIcon={
                    <View style={styles.headerRight}>
                        <TouchableOpacity style={styles.headerIconBtn} onPress={() => setShowScanner(true)} activeOpacity={0.8}>
                            <QrCode color={colors.white} size={20} />
                        </TouchableOpacity>
                        {cart.length > 0 && (
                            <TouchableOpacity style={styles.headerIconBtn} onPress={() => setCart([])} activeOpacity={0.8}>
                                <Trash2 color={colors.white} size={20} />
                            </TouchableOpacity>
                        )}
                    </View>
                }
            />

            <View style={[styles.container, isDesktop && dtVd.container]}>

                {/* ── Grille produits ── */}
                <ScrollView style={[styles.productsScroll, isDesktop && dtVd.productsScroll]} contentContainerStyle={isDesktop && { padding: 24 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                    {products.length === 0 ? (
                        <View style={styles.empty}>
                            <ShoppingBag color={colors.slate300} size={40} />
                            <Text style={styles.emptyText}>AUCUN PRODUIT</Text>
                            <Text style={styles.emptySubtext}>Ajoutez des produits dans l'onglet Stock</Text>
                        </View>
                    ) : (
                        <View style={[styles.productsGrid, isDesktop && dtVd.productsGrid, { pointerEvents: touchReady ? 'auto' : 'none' }]}>
                            {products.map(product => {
                                const stock    = getStockLevel(product.id);
                                const epuise   = stock <= 0;
                                const inCart   = cart.find(i => i.id === product.id);
                                return (
                                    <TouchableOpacity
                                        key={product.id}
                                        style={[
                                            styles.productCard,
                                            isDesktop && dtVd.productCard,
                                            inCart  && styles.productCardActive,
                                            epuise  && styles.productCardDisabled,
                                        ]}
                                        onPress={() => addToCart(product)}
                                        activeOpacity={epuise ? 1 : 0.8}
                                        disabled={epuise}
                                    >
                                        {product.imageUrl ? (
                                            <Image
                                                source={{ uri: product.imageUrl }}
                                                style={[styles.productIcon, { opacity: epuise ? 0.4 : 1 }]}
                                            />
                                        ) : (
                                            <View style={[styles.productIcon, { backgroundColor: epuise ? '#94a3b8' : product.color }]}>
                                                <Text style={styles.productEmoji}>{product.name.charAt(0).toUpperCase()}</Text>
                                            </View>
                                        )}
                                        <Text style={[styles.productName, epuise && styles.textDisabled]} numberOfLines={1}>
                                            {product.name}
                                        </Text>
                                        <Text style={[styles.productPrice, epuise && styles.textDisabled]}>
                                            {product.price.toLocaleString()} F
                                        </Text>
                                        <Text style={[
                                            styles.productStock,
                                            stock < 3 && !epuise && styles.productStockLow,
                                            epuise && styles.textDisabled,
                                        ]}>
                                            {epuise ? '—' : `${stock} en stock`}
                                        </Text>
                                        {inCart && !epuise && (
                                            <View style={styles.productBadge}>
                                                <Text style={styles.productBadgeText}>{inCart.quantity}</Text>
                                            </View>
                                        )}
                                        {epuise && (
                                            <View style={styles.epuiseBadge}>
                                                <Text style={styles.epuiseBadgeText}>ÉPUISÉ</Text>
                                            </View>
                                        )}
                                    </TouchableOpacity>
                                );
                            })}
                        </View>
                    )}

                    {!isDesktop && <View style={{ height: cart.length > 0 ? 280 : 100 }} />}
                    {isDesktop && <View style={{ height: 32 }} />}
                </ScrollView>

                {/* ── Panier desktop : panneau latéral droit ── */}
                {isDesktop && (
                    <View style={dtVd.sideCart}>
                        <Text style={dtVd.sideCartTitle}>Panier ({cart.reduce((a, i) => a + i.quantity, 0)})</Text>

                        {cart.length === 0 ? (
                            <View style={dtVd.sideCartEmpty}>
                                <ShoppingBag color={colors.slate300} size={32} />
                                <Text style={{ fontSize: 13, color: colors.slate400, marginTop: 8 }}>Cliquez sur un produit pour l'ajouter</Text>
                            </View>
                        ) : (
                            <>
                                <ScrollView style={{ maxHeight: 260 }} showsVerticalScrollIndicator={false}>
                                    {cart.map(item => (
                                        <View key={item.id} style={styles.cartItem}>
                                            <Text style={styles.cartItemName} numberOfLines={1}>{item.name}</Text>
                                            <View style={styles.cartQtyRow}>
                                                <TouchableOpacity onPress={() => changeQty(item.id, -1)} style={styles.qtyBtn}>
                                                    <Minus color={colors.slate600} size={14} />
                                                </TouchableOpacity>
                                                <Text style={styles.qtyText}>{item.quantity}</Text>
                                                <TouchableOpacity onPress={() => changeQty(item.id, 1)} style={styles.qtyBtn}>
                                                    <Plus color={colors.slate600} size={14} />
                                                </TouchableOpacity>
                                            </View>
                                            <Text style={styles.cartItemPrice}>{(item.price * item.quantity).toLocaleString()} F</Text>
                                        </View>
                                    ))}
                                </ScrollView>

                                <View style={dtVd.sideCartDivider} />

                                <TextInput
                                    style={styles.clientInput}
                                    placeholder="Nom du client (optionnel)"
                                    placeholderTextColor={colors.slate400}
                                    value={clientName}
                                    onChangeText={setClientName}
                                />

                                <View style={styles.paymentRow}>
                                    {PAYMENT_OPTIONS.map(opt => (
                                        <TouchableOpacity
                                            key={opt.value}
                                            style={[styles.payBtn, paymentStatus === opt.value && { backgroundColor: opt.color, borderColor: opt.color }]}
                                            onPress={() => { setPaymentStatus(opt.value); if (opt.value !== 'MOMO') setMomoOperator(null); }}
                                        >
                                            <opt.icon color={paymentStatus === opt.value ? colors.white : colors.slate400} size={14} />
                                            <Text style={[styles.payBtnText, paymentStatus === opt.value && { color: colors.white }]}>{opt.label}</Text>
                                        </TouchableOpacity>
                                    ))}
                                </View>

                                {paymentStatus === 'MOMO' && (
                                    <>
                                        <View style={styles.operatorGrid}>
                                            {MOMO_OPERATORS.map(op => (
                                                <TouchableOpacity
                                                    key={op.value}
                                                    style={[
                                                        styles.operatorBtn,
                                                        { backgroundColor: op.bgColor, borderColor: momoOperator === op.value ? colors.primary : op.borderColor },
                                                    ]}
                                                    onPress={() => setMomoOperator(op.value)}
                                                    activeOpacity={0.8}
                                                >
                                                    {momoOperator === op.value && (
                                                        <View style={styles.operatorCheck}>
                                                            <CheckCircle color={colors.primary} size={12} />
                                                        </View>
                                                    )}
                                                    <Text style={[styles.operatorName, { color: op.textColor }]} numberOfLines={1}>
                                                        {op.label}
                                                    </Text>
                                                </TouchableOpacity>
                                            ))}
                                        </View>
                                        <TextInput
                                            style={styles.clientInput}
                                            placeholder="Numéro Mobile Money client (optionnel)"
                                            placeholderTextColor={colors.slate400}
                                            value={clientPhone}
                                            onChangeText={setClientPhone}
                                            keyboardType="phone-pad"
                                        />
                                    </>
                                )}

                                <View style={dtVd.totalRow}>
                                    <Text style={dtVd.totalLabel}>TOTAL</Text>
                                    <Text style={dtVd.totalValue}>{total.toLocaleString()} F</Text>
                                </View>

                                <TouchableOpacity
                                    style={[styles.validateBtn, isLoading && { opacity: 0.7 }]}
                                    onPress={handleFinish}
                                    activeOpacity={0.85}
                                    disabled={isLoading}
                                >
                                    <Text style={styles.validateBtnText}>VALIDER LA VENTE</Text>
                                </TouchableOpacity>
                            </>
                        )}
                    </View>
                )}

                {/* ── Panier mobile (collé en bas) ── */}
                {!isDesktop && cart.length > 0 && (
                    <View style={styles.cartPanel}>
                        <ScrollView style={{ maxHeight: 130 }} showsVerticalScrollIndicator={false}>
                            {cart.map(item => (
                                <View key={item.id} style={styles.cartItem}>
                                    <Text style={styles.cartItemName} numberOfLines={1}>{item.name}</Text>
                                    <View style={styles.cartQtyRow}>
                                        <TouchableOpacity onPress={() => changeQty(item.id, -1)} style={styles.qtyBtn}>
                                            <Minus color={colors.slate600} size={14} />
                                        </TouchableOpacity>
                                        <Text style={styles.qtyText}>{item.quantity}</Text>
                                        <TouchableOpacity onPress={() => changeQty(item.id, 1)} style={styles.qtyBtn}>
                                            <Plus color={colors.slate600} size={14} />
                                        </TouchableOpacity>
                                    </View>
                                    <Text style={styles.cartItemPrice}>{(item.price * item.quantity).toLocaleString()} F</Text>
                                </View>
                            ))}
                        </ScrollView>

                        <TextInput
                            style={styles.clientInput}
                            placeholder="Nom du client (optionnel)"
                            placeholderTextColor={colors.slate400}
                            value={clientName}
                            onChangeText={setClientName}
                        />

                        <View style={styles.paymentRow}>
                            {PAYMENT_OPTIONS.map(opt => (
                                <TouchableOpacity
                                    key={opt.value}
                                    style={[styles.payBtn, paymentStatus === opt.value && { backgroundColor: opt.color, borderColor: opt.color }]}
                                    onPress={() => { setPaymentStatus(opt.value); if (opt.value !== 'MOMO') setMomoOperator(null); }}
                                >
                                    <opt.icon color={paymentStatus === opt.value ? colors.white : colors.slate400} size={14} />
                                    <Text style={[styles.payBtnText, paymentStatus === opt.value && { color: colors.white }]}>{opt.label}</Text>
                                </TouchableOpacity>
                            ))}
                        </View>

                        {paymentStatus === 'MOMO' && (
                            <>
                                <View style={styles.operatorGrid}>
                                    {MOMO_OPERATORS.map(op => (
                                        <TouchableOpacity
                                            key={op.value}
                                            style={[
                                                styles.operatorBtn,
                                                { backgroundColor: op.bgColor, borderColor: momoOperator === op.value ? colors.primary : op.borderColor },
                                            ]}
                                            onPress={() => setMomoOperator(op.value)}
                                            activeOpacity={0.8}
                                        >
                                            {momoOperator === op.value && (
                                                <View style={styles.operatorCheck}>
                                                    <CheckCircle color={colors.primary} size={12} />
                                                </View>
                                            )}
                                            <Text style={[styles.operatorName, { color: op.textColor }]} numberOfLines={1}>
                                                {op.label}
                                            </Text>
                                        </TouchableOpacity>
                                    ))}
                                </View>
                                <TextInput
                                    style={styles.clientInput}
                                    placeholder="Numéro Mobile Money client (optionnel)"
                                    placeholderTextColor={colors.slate400}
                                    value={clientPhone}
                                    onChangeText={setClientPhone}
                                    keyboardType="phone-pad"
                                />
                            </>
                        )}

                        <TouchableOpacity
                            style={[styles.validateBtn, isLoading && { opacity: 0.7 }]}
                            onPress={handleFinish}
                            activeOpacity={0.85}
                            disabled={isLoading}
                        >
                            <Text style={styles.validateBtnText}>VALIDER  •  {total.toLocaleString()} F</Text>
                        </TouchableOpacity>
                    </View>
                )}

            </View>

            {/* ── Modal Scanner ── */}
            <Modal visible={showScanner} animationType="slide" statusBarTranslucent>
                {Platform.OS !== 'web' && !permission ? (
                    <View style={styles.fullDark}>
                        <Text style={styles.permText}>Verification des permissions...</Text>
                    </View>
                ) : Platform.OS !== 'web' && !permission?.granted ? (
                    <View style={styles.fullDark}>
                        <Text style={styles.permTitle}>Acces Camera Requis</Text>
                        <Text style={styles.permText}>Necessaire pour scanner les codes-barres.</Text>
                        <TouchableOpacity style={styles.permBtn} onPress={requestPermission}>
                            <Text style={styles.permBtnText}>AUTORISER LA CAMERA</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.backTextBtn} onPress={closeScanner}>
                            <Text style={styles.backTextBtnText}>FERMER</Text>
                        </TouchableOpacity>
                    </View>
                ) : (
                    <View style={styles.scannerContainer}>
                        {/* Camera : WebBarcodeScanner sur web, CameraView sur mobile */}
                        {Platform.OS === 'web' ? (
                            <WebBarcodeScanner
                                style={StyleSheet.absoluteFillObject}
                                onScan={handleBarCodeScanned}
                                active={!cooldown.current}
                            />
                        ) : (
                            <CameraView
                                style={StyleSheet.absoluteFillObject}
                                facing="back"
                                enableTorch={torch}
                                barcodeScannerSettings={{
                                    barcodeTypes: ['qr', 'ean13', 'ean8', 'code128', 'code39', 'code93', 'upc_a', 'upc_e', 'itf14', 'codabar'],
                                }}
                                onBarcodeScanned={handleBarCodeScanned}
                            />
                        )}

                        <SafeAreaView style={styles.scanLayout} edges={['top', 'bottom']}>

                            {/* Header scanner */}
                            <View style={styles.scanHeaderMask}>
                                <TouchableOpacity style={styles.scanIconBtn} onPress={closeScanner}>
                                    <X color={colors.white} size={22} />
                                </TouchableOpacity>
                                <Text style={styles.scanHeaderTitle}>SCANNER UN PRODUIT</Text>
                                <TouchableOpacity style={styles.scanIconBtn} onPress={() => setTorch(v => !v)}>
                                    {torch
                                        ? <FlashlightOff color={colors.white} size={20} />
                                        : <Flashlight    color={colors.white} size={20} />
                                    }
                                </TouchableOpacity>
                            </View>

                            <View style={styles.topMask} />

                            <View style={styles.middleRow}>
                                <View style={styles.sideMask} />
                                <View style={styles.scanFrame}>
                                    <View style={[styles.corner, styles.cornerTL]} />
                                    <View style={[styles.corner, styles.cornerTR]} />
                                    <View style={[styles.corner, styles.cornerBL]} />
                                    <View style={[styles.corner, styles.cornerBR]} />
                                    <Animated.View style={[styles.scanLine, { transform: [{ translateY: scanLineY }] }]} />
                                </View>
                                <View style={styles.sideMask} />
                            </View>

                            {/* Zone basse — feedback + bouton fermer */}
                            <View style={styles.scanBottomMask}>

                                {scanFeedback === 'found' && (
                                    <View style={[styles.feedbackBadge, styles.feedbackFound]}>
                                        <Text style={styles.feedbackText}>✓  {scanFeedbackName} ajouté au panier</Text>
                                    </View>
                                )}
                                {scanFeedback === 'unknown' && (
                                    <View style={[styles.feedbackBadge, styles.feedbackUnknown]}>
                                        <Text style={styles.feedbackText}>✗  Produit inconnu</Text>
                                    </View>
                                )}
                                {!scanFeedback && (
                                    <Text style={styles.scanHint}>Placez le code-barres dans le cadre</Text>
                                )}

                                <TouchableOpacity style={styles.closeScanBtn} onPress={closeScanner}>
                                    <RotateCcw color={colors.white} size={16} />
                                    <Text style={styles.closeScanBtnText}>
                                        VOIR LE PANIER{cart.length > 0 ? ` (${cart.reduce((a, i) => a + i.quantity, 0)})` : ''}
                                    </Text>
                                </TouchableOpacity>

                            </View>
                        </SafeAreaView>
                    </View>
                )}
            </Modal>

            {/* ── Modal succès ── */}
            <Modal visible={showSuccess} transparent animationType="fade">
                <View style={styles.successOverlay}>
                    <View style={styles.successCard}>
                        <CheckCircle color={offlineSale ? '#b45309' : colors.primary} size={56} />
                        <Text style={styles.successTitle}>
                            {offlineSale ? 'VENTE ENREGISTRÉE' : 'VENTE VALIDÉE !'}
                        </Text>
                        <Text style={styles.successAmount}>{total.toLocaleString()} F</Text>
                        {offlineSale && (
                            <Text style={styles.successOfflineHint}>
                                Sera synchronisée au retour du réseau
                            </Text>
                        )}
                    </View>
                </View>
            </Modal>

        </View>
    );
}

const styles = StyleSheet.create({
    safe:           { flex: 1, backgroundColor: colors.bgSecondary },
    headerRight:    { flexDirection: 'row', gap: 8 },
    headerIconBtn:  { width: 44, height: 44, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' },

    container: { flex: 1, backgroundColor: colors.bgSecondary },

    // ── Grille produits ──
    productsScroll: { flex: 1, padding: 16 },
    productsGrid:   { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
    productCard: {
        width: '47%', backgroundColor: colors.white, borderRadius: 10,
        padding: 14, borderWidth: 2, borderColor: colors.slate100,
        alignItems: 'center', gap: 6, position: 'relative',
    },
    productCardActive:   { borderColor: colors.primary, backgroundColor: '#f0fdf4' },
    productCardDisabled: { borderColor: colors.slate200, backgroundColor: colors.slate50, opacity: 0.6 },
    textDisabled:        { color: colors.slate400 },
    productIcon:       { width: 48, height: 48, borderRadius: 10, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
    productEmoji:      { fontSize: 22, fontWeight: '900', color: colors.white },
    productName:       { fontSize: 13, fontWeight: '700', color: colors.slate800, textAlign: 'center' },
    productPrice:      { fontSize: 14, fontWeight: '900', color: colors.primary },
    productStock:      { fontSize: 11, color: colors.slate400, fontWeight: '600' },
    productStockLow:   { color: colors.error },
    productBadge: {
        position: 'absolute', top: -6, right: -6,
        width: 22, height: 22, borderRadius: 7,
        backgroundColor: colors.primary, borderWidth: 2, borderColor: colors.white,
        alignItems: 'center', justifyContent: 'center',
    },
    productBadgeText:  { fontSize: 11, fontWeight: '900', color: colors.white },

    epuiseBadge: {
        position: 'absolute', top: 6, right: 6,
        backgroundColor: colors.slate400,
        paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4,
    },
    epuiseBadgeText: { fontSize: 11, fontWeight: '900', color: colors.white, letterSpacing: 0.5 },

    // ── Panier ──
    cartPanel: {
        backgroundColor: colors.white, borderTopLeftRadius: 10, borderTopRightRadius: 10,
        padding: 16, gap: 10,
        shadowColor: '#000', shadowOffset: { width: 0, height: -4 },
        shadowOpacity: 0.08, shadowRadius: 12, elevation: 8,
    },
    cartItem:      { flexDirection: 'row', alignItems: 'center', paddingVertical: 6, gap: 8 },
    cartItemName:  { flex: 1, fontSize: 13, fontWeight: '600', color: colors.slate700 },
    cartQtyRow:    { flexDirection: 'row', alignItems: 'center', gap: 8 },
    qtyBtn:        { width: 26, height: 26, borderRadius: 8, backgroundColor: colors.slate100, alignItems: 'center', justifyContent: 'center' },
    qtyText:       { fontSize: 14, fontWeight: '900', color: colors.slate900, minWidth: 20, textAlign: 'center' },
    cartItemPrice: { fontSize: 13, fontWeight: '900', color: colors.slate900, minWidth: 60, textAlign: 'right' },

    clientInput: {
        backgroundColor: colors.slate50, borderWidth: 1, borderColor: colors.slate200,
        borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10,
        fontSize: 14, color: colors.slate800,
    },
    paymentRow: { flexDirection: 'row', gap: 8 },
    payBtn: {
        flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4,
        paddingVertical: 10, borderRadius: 12,
        borderWidth: 2, borderColor: colors.slate200, backgroundColor: colors.white,
    },
    payBtnText: { fontSize: 11, fontWeight: '700', color: colors.slate400 },

    operatorGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    operatorBtn: {
        width: '47%', borderRadius: 10, borderWidth: 2,
        paddingVertical: 10, paddingHorizontal: 10,
        alignItems: 'center', justifyContent: 'center', position: 'relative',
    },
    operatorCheck: { position: 'absolute', top: 4, right: 4 },
    operatorName: { fontSize: 12, fontWeight: '800' },

    validateBtn: {
        backgroundColor: colors.primary, borderRadius: 10,
        paddingVertical: 16, alignItems: 'center',
    },
    validateBtnText: { color: colors.white, fontSize: 15, fontWeight: '900', letterSpacing: 1 },

    // ── Empty ──
    empty:        { alignItems: 'center', paddingTop: 80, gap: 12 },
    emptyText:    { fontSize: 12, fontWeight: '900', color: colors.slate400, letterSpacing: 2 },
    emptySubtext: { fontSize: 12, color: colors.slate400, textAlign: 'center' },

    // ── Modal scanner ──
    fullDark: { flex: 1, backgroundColor: '#0f172a', alignItems: 'center', justifyContent: 'center', padding: 32, gap: 16 },
    permTitle:       { fontSize: 20, fontWeight: '900', color: colors.white, textAlign: 'center' },
    permText:        { fontSize: 14, color: colors.slate400, textAlign: 'center', lineHeight: 20 },
    permBtn:         { backgroundColor: colors.primary, borderRadius: 10, paddingHorizontal: 24, paddingVertical: 14, marginTop: 8 },
    permBtnText:     { color: colors.white, fontWeight: '900', fontSize: 13, letterSpacing: 1 },
    backTextBtn:     { paddingVertical: 12 },
    backTextBtnText: { color: colors.slate400, fontWeight: '700', fontSize: 12, letterSpacing: 2 },

    scannerContainer: { flex: 1, backgroundColor: '#000' },
    scanLayout:       { flex: 1 },

    scanHeaderMask: {
        backgroundColor: MASK,
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        paddingHorizontal: 16, paddingVertical: 12,
    },
    scanIconBtn: {
        width: 44, height: 44, borderRadius: 10,
        backgroundColor: 'rgba(255,255,255,0.15)',
        alignItems: 'center', justifyContent: 'center',
    },
    scanHeaderTitle: { fontSize: 13, fontWeight: '900', color: colors.white, letterSpacing: 2 },

    topMask:   { flex: 1, backgroundColor: MASK },
    middleRow: { flexDirection: 'row', height: FRAME_H },
    sideMask:  { flex: 1, backgroundColor: MASK },
    scanFrame: { width: FRAME_W, height: FRAME_H, overflow: 'hidden', position: 'relative' },

    corner:   { position: 'absolute', width: CORNER_SIZE, height: CORNER_SIZE, borderColor: CORNER_COLOR },
    cornerTL: { top: 0, left: 0,     borderTopWidth: CORNER_T,    borderLeftWidth:  CORNER_T, borderTopLeftRadius:     5 },
    cornerTR: { top: 0, right: 0,    borderTopWidth: CORNER_T,    borderRightWidth: CORNER_T, borderTopRightRadius:    5 },
    cornerBL: { bottom: 0, left: 0,  borderBottomWidth: CORNER_T, borderLeftWidth:  CORNER_T, borderBottomLeftRadius:  5 },
    cornerBR: { bottom: 0, right: 0, borderBottomWidth: CORNER_T, borderRightWidth: CORNER_T, borderBottomRightRadius: 5 },

    scanLine: {
        position: 'absolute', top: 0, left: 8, right: 8, height: 2,
        backgroundColor: '#ef4444', borderRadius: 2,
        shadowColor: '#ef4444', shadowOpacity: 0.9, shadowRadius: 6, elevation: 4,
    },

    scanBottomMask: {
        flex: 1.4, backgroundColor: MASK,
        alignItems: 'center', justifyContent: 'center',
        paddingHorizontal: 20, paddingVertical: 16, gap: 16,
    },
    scanHint: { fontSize: 12, color: 'rgba(255,255,255,0.65)', fontWeight: '600', letterSpacing: 0.4, textAlign: 'center' },

    feedbackBadge:   { paddingHorizontal: 20, paddingVertical: 10, borderRadius: 10 },
    feedbackFound:   { backgroundColor: '#16a34a' },
    feedbackUnknown: { backgroundColor: '#dc2626' },
    feedbackText:    { fontSize: 13, fontWeight: '900', color: colors.white, letterSpacing: 0.5 },

    closeScanBtn: {
        flexDirection: 'row', alignItems: 'center', gap: 8,
        paddingVertical: 14, paddingHorizontal: 28, borderRadius: 10,
        backgroundColor: colors.primary,
        shadowColor: colors.primary, shadowOpacity: 0.4, shadowRadius: 10, elevation: 6,
    },
    closeScanBtnText: { fontSize: 13, fontWeight: '900', color: colors.white, letterSpacing: 1 },

    // ── Succès ──
    successOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center' },
    successCard: {
        backgroundColor: colors.white, borderRadius: 10, padding: 48,
        alignItems: 'center', gap: 16,
        shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.15, shadowRadius: 24, elevation: 12,
    },
    successTitle:  { fontSize: 22, fontWeight: '900', color: colors.slate900, letterSpacing: -0.5 },
    successAmount: { fontSize: 32, fontWeight: '900', color: colors.primary },
    successOfflineHint: { fontSize: 12, color: '#b45309', fontWeight: '600', marginTop: 6, textAlign: 'center' as const },
});

// ── Styles desktop uniquement ─────────────────────────────────────────────
const dtVd = StyleSheet.create({
    container:     { flexDirection: 'row', maxWidth: 1400, alignSelf: 'center', width: '100%' },
    productsScroll: { flex: 1 },
    productsGrid:  { gap: 16 },
    productCard: {
        width: '23%',
        borderWidth: 0,
        shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.06, shadowRadius: 10, elevation: 3,
    },
    sideCart: {
        width: 380, backgroundColor: '#FFF', borderLeftWidth: 1, borderLeftColor: '#F3F4F6',
        padding: 24, gap: 12,
    },
    sideCartTitle: {
        fontSize: 16, fontWeight: '900', color: '#1F2937', marginBottom: 4,
    },
    sideCartEmpty: {
        flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 40,
    },
    sideCartDivider: {
        height: 1, backgroundColor: '#F3F4F6', marginVertical: 4,
    },
    totalRow: {
        flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
        paddingVertical: 12, borderTopWidth: 1, borderTopColor: '#F3F4F6', marginTop: 4,
    },
    totalLabel: { fontSize: 12, fontWeight: '800', color: '#6B7280', letterSpacing: 1 },
    totalValue: { fontSize: 22, fontWeight: '900', color: '#1F2937' },
});
