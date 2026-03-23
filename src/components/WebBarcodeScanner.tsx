// Scanner code-barres web — getUserMedia + BarcodeDetector API
// Chrome/Edge/Opera : scan en direct via requestAnimationFrame
// Firefox/Safari : fallback upload photo de code-barres
import React, { useEffect, useRef, useState, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Platform } from 'react-native';
import { colors } from '@/src/lib/colors';

interface Props {
    onScan: (result: { type: string; data: string }) => void;
    active?: boolean;
    style?: any;
}

// Types BarcodeDetector (non standard TS)
declare global {
    interface Window {
        BarcodeDetector?: new (opts?: { formats: string[] }) => {
            detect: (source: HTMLVideoElement | HTMLCanvasElement | ImageBitmap) => Promise<Array<{ rawValue: string; format: string }>>;
        };
    }
}

const COOLDOWN_MS = 2000;
const BD_FORMATS = [
    'ean_13', 'ean_8', 'upc_a', 'upc_e',
    'code_128', 'code_39', 'code_93',
    'itf', 'codabar', 'data_matrix', 'qr_code',
];

export default function WebBarcodeScanner({ onScan, active = true, style }: Props) {
    const onScanRef = useRef(onScan);
    onScanRef.current = onScan;

    const videoRef = useRef<HTMLVideoElement | null>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const rafRef = useRef<number>(0);
    const lastScanRef = useRef(0);
    const mountedRef = useRef(true);

    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [manualMode, setManualMode] = useState(false);

    const emitScan = useCallback((type: string, data: string) => {
        const now = Date.now();
        if (now - lastScanRef.current < COOLDOWN_MS) return;
        lastScanRef.current = now;
        onScanRef.current({ type, data });
    }, []);

    // ── Cleanup camera ────────────────────────────────────────────────────
    const cleanup = useCallback(() => {
        if (rafRef.current) {
            cancelAnimationFrame(rafRef.current);
            rafRef.current = 0;
        }
        if (streamRef.current) {
            streamRef.current.getTracks().forEach(t => t.stop());
            streamRef.current = null;
        }
    }, []);

    // ── Demarrage camera + scan loop ──────────────────────────────────────
    useEffect(() => {
        if (Platform.OS !== 'web' || !active) return;
        mountedRef.current = true;
        let cancelled = false;

        (async () => {
            try {
                const stream = await navigator.mediaDevices.getUserMedia({
                    video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
                });
                if (cancelled) { stream.getTracks().forEach(t => t.stop()); return; }
                streamRef.current = stream;

                if (videoRef.current) {
                    videoRef.current.srcObject = stream;
                    await videoRef.current.play();
                    if (!cancelled) setLoading(false);
                }

                // BarcodeDetector disponible → scan en direct
                if (typeof window !== 'undefined' && window.BarcodeDetector) {
                    let detector: any;
                    try {
                        detector = new window.BarcodeDetector!({ formats: BD_FORMATS });
                    } catch {
                        if (!cancelled) setManualMode(true);
                        return;
                    }

                    const scanFrame = () => {
                        if (cancelled || !mountedRef.current) return;
                        const video = videoRef.current;
                        if (!video || video.readyState < 2) {
                            rafRef.current = requestAnimationFrame(scanFrame);
                            return;
                        }
                        detector.detect(video)
                            .then((barcodes: Array<{ rawValue: string; format: string }>) => {
                                if (barcodes.length > 0) {
                                    emitScan(barcodes[0].format, barcodes[0].rawValue);
                                }
                            })
                            .catch(() => {});
                        rafRef.current = requestAnimationFrame(scanFrame);
                    };
                    rafRef.current = requestAnimationFrame(scanFrame);
                } else {
                    // Pas de BarcodeDetector → mode photo manuelle
                    if (!cancelled) setManualMode(true);
                }
            } catch (err: any) {
                if (cancelled) return;
                console.error('[WebBarcodeScanner] camera error:', err);
                if (err?.name === 'NotAllowedError') {
                    setError('Camera non autorisee. Autorisez l\'acces dans les parametres du navigateur.');
                } else {
                    setError('Impossible d\'acceder a la camera. Verifiez les permissions.');
                }
            }
        })();

        return () => {
            cancelled = true;
            mountedRef.current = false;
            cleanup();
        };
    }, [active, emitScan, cleanup]);

    // ── Handler upload photo (fallback Firefox/Safari) ────────────────────
    const handleFileUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        // Reset input pour re-selection possible
        e.target.value = '';

        if (!window.BarcodeDetector) {
            // Aucun decoder dispo du tout
            alert('Votre navigateur ne supporte pas le decodage de codes-barres. Utilisez Chrome ou Edge.');
            return;
        }
        try {
            const img = await createImageBitmap(file);
            const detector = new window.BarcodeDetector!({ formats: BD_FORMATS });
            const results = await detector.detect(img);
            if (results.length > 0) {
                emitScan(results[0].format, results[0].rawValue);
            } else {
                alert('Aucun code-barres detecte dans l\'image. Reessayez avec une photo plus nette.');
            }
        } catch {
            alert('Erreur lors de l\'analyse de l\'image.');
        }
    }, [emitScan]);

    if (Platform.OS !== 'web') return null;

    // ── Erreur camera ────────────────────────────────────────────────────
    if (error) {
        return (
            <View style={[styles.container, style]}>
                <View style={styles.centerBox}>
                    <Text style={styles.errorTitle}>Scanner indisponible</Text>
                    <Text style={styles.errorText}>{error}</Text>
                    <TouchableOpacity
                        style={styles.retryBtn}
                        onPress={() => {
                            setError(null);
                            setLoading(true);
                            setManualMode(false);
                            cleanup();
                        }}
                    >
                        <Text style={styles.retryText}>REESSAYER</Text>
                    </TouchableOpacity>
                </View>
            </View>
        );
    }

    // ── Render ────────────────────────────────────────────────────────────
    return (
        <View style={[styles.container, style]}>
            {/* Video camera — toujours rendu (meme en mode manuel pour le fond) */}
            <video
                ref={videoRef as any}
                style={{
                    position: 'absolute', top: 0, left: 0,
                    width: '100%', height: '100%',
                    objectFit: 'cover',
                }}
                autoPlay
                playsInline
                muted
            />

            {/* Loading */}
            {loading && !error && (
                <View style={styles.loadingBox}>
                    <Text style={styles.loadingText}>Demarrage de la camera...</Text>
                </View>
            )}

            {/* Bandeau fallback : upload photo (Firefox/Safari sans BarcodeDetector) */}
            {manualMode && !loading && (
                <View style={styles.manualBanner}>
                    <Text style={styles.manualText}>
                        Scan en direct non supporte sur ce navigateur.
                    </Text>
                    <label style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 8,
                        padding: '10px 20px',
                        background: '#C47316',
                        borderRadius: 10,
                        cursor: 'pointer',
                        fontWeight: '800',
                        fontSize: 13,
                        color: '#fff',
                        letterSpacing: 0.5,
                        marginTop: 8,
                    }}>
                        PHOTOGRAPHIER LE CODE-BARRES
                        <input
                            type="file"
                            accept="image/*"
                            capture="environment"
                            style={{ display: 'none' }}
                            onChange={handleFileUpload as any}
                        />
                    </label>
                    <Text style={styles.manualHint}>
                        Utilisez Chrome ou Edge pour le scan en direct
                    </Text>
                </View>
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#000',
        overflow: 'hidden',
    },
    centerBox: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        padding: 32,
        gap: 12,
    },
    errorTitle: {
        fontSize: 18,
        fontWeight: '900',
        color: colors.white,
    },
    errorText: {
        fontSize: 14,
        color: 'rgba(255,255,255,0.7)',
        textAlign: 'center',
        lineHeight: 20,
    },
    retryBtn: {
        backgroundColor: colors.primary,
        borderRadius: 10,
        paddingHorizontal: 24,
        paddingVertical: 12,
        marginTop: 8,
    },
    retryText: {
        color: colors.white,
        fontWeight: '900',
        fontSize: 13,
        letterSpacing: 1,
    },
    loadingBox: {
        position: 'absolute',
        top: 0, left: 0, right: 0, bottom: 0,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(0,0,0,0.7)',
    },
    loadingText: {
        color: 'rgba(255,255,255,0.8)',
        fontSize: 14,
        fontWeight: '600',
    },
    manualBanner: {
        position: 'absolute',
        bottom: 0, left: 0, right: 0,
        backgroundColor: 'rgba(0,0,0,0.85)',
        alignItems: 'center',
        paddingVertical: 20,
        paddingHorizontal: 24,
        gap: 6,
    },
    manualText: {
        color: 'rgba(255,255,255,0.9)',
        fontSize: 13,
        fontWeight: '700',
        textAlign: 'center',
    },
    manualHint: {
        color: 'rgba(255,255,255,0.5)',
        fontSize: 11,
        fontWeight: '600',
        textAlign: 'center',
        marginTop: 4,
    },
});
