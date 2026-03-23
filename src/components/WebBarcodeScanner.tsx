// Scanner code-barres pour le web — BarcodeDetector API (Chrome 83+)
// Fallback : scan visuel desactive avec message d'erreur
// Utilise getUserMedia + video element + polling toutes les 300ms
import React, { useEffect, useRef, useState, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Platform } from 'react-native';
import { colors } from '@/src/lib/colors';

interface Props {
    onScan: (result: { type: string; data: string }) => void;
    active?: boolean; // permet de pauser le scan
    style?: any;
}

// Types pour BarcodeDetector API (pas dans les types TS standard)
declare global {
    interface Window {
        BarcodeDetector?: new (opts?: { formats: string[] }) => {
            detect: (source: HTMLVideoElement | HTMLCanvasElement | ImageBitmap) => Promise<Array<{ rawValue: string; format: string }>>;
        };
    }
}

const SCAN_INTERVAL = 300; // ms entre chaque tentative de detection
const SUPPORTED_FORMATS = [
    'ean_13', 'ean_8', 'upc_a', 'upc_e',
    'code_128', 'code_39', 'code_93',
    'itf', 'codabar', 'data_matrix', 'qr_code',
];

export default function WebBarcodeScanner({ onScan, active = true, style }: Props) {
    const videoRef = useRef<HTMLVideoElement | null>(null);
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const detectorRef = useRef<InstanceType<NonNullable<typeof window.BarcodeDetector>> | null>(null);
    const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const onScanRef = useRef(onScan);
    onScanRef.current = onScan;

    const [error, setError] = useState<string | null>(null);
    const [hasDetector, setHasDetector] = useState(true);

    // Verifier la disponibilite de BarcodeDetector
    useEffect(() => {
        if (Platform.OS !== 'web') return;
        if (typeof window === 'undefined') return;

        if (!window.BarcodeDetector) {
            setHasDetector(false);
            setError('BarcodeDetector non supporte. Utilisez Chrome, Edge ou Opera.');
            return;
        }

        try {
            detectorRef.current = new window.BarcodeDetector({ formats: SUPPORTED_FORMATS });
        } catch {
            setHasDetector(false);
            setError('Impossible d\'initialiser le detecteur de codes-barres.');
        }
    }, []);

    // Demarrer la camera
    const startCamera = useCallback(async () => {
        if (!hasDetector) return;
        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                video: {
                    facingMode: 'environment',
                    width: { ideal: 1280 },
                    height: { ideal: 720 },
                },
            });
            streamRef.current = stream;
            if (videoRef.current) {
                videoRef.current.srcObject = stream;
                await videoRef.current.play();
            }
        } catch (err: any) {
            if (err?.name === 'NotAllowedError') {
                setError('Camera non autorisee. Autorisez l\'acces dans les parametres du navigateur.');
            } else {
                setError('Impossible d\'acceder a la camera : ' + (err?.message ?? 'erreur inconnue'));
            }
        }
    }, [hasDetector]);

    // Arreter la camera
    const stopCamera = useCallback(() => {
        if (intervalRef.current) {
            clearInterval(intervalRef.current);
            intervalRef.current = null;
        }
        if (streamRef.current) {
            streamRef.current.getTracks().forEach(t => t.stop());
            streamRef.current = null;
        }
    }, []);

    // Boucle de detection
    const startDetection = useCallback(() => {
        if (!detectorRef.current || !videoRef.current || !canvasRef.current) return;

        const video = videoRef.current;
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        intervalRef.current = setInterval(async () => {
            if (!active || video.readyState < 2 || !detectorRef.current) return;

            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            ctx.drawImage(video, 0, 0);

            try {
                const barcodes = await detectorRef.current.detect(canvas);
                if (barcodes.length > 0) {
                    const bc = barcodes[0];
                    onScanRef.current({
                        type: bc.format,
                        data: bc.rawValue,
                    });
                }
            } catch {
                // Erreur de detection silencieuse — on reessaie au prochain interval
            }
        }, SCAN_INTERVAL);
    }, [active]);

    // Lifecycle
    useEffect(() => {
        if (Platform.OS !== 'web') return;

        startCamera().then(() => {
            startDetection();
        });

        return () => {
            stopCamera();
        };
    }, [startCamera, startDetection, stopCamera]);

    // Pause/reprise de la detection
    useEffect(() => {
        if (!active && intervalRef.current) {
            clearInterval(intervalRef.current);
            intervalRef.current = null;
        } else if (active && !intervalRef.current && detectorRef.current) {
            startDetection();
        }
    }, [active, startDetection]);

    if (Platform.OS !== 'web') return null;

    if (error) {
        return (
            <View style={[styles.container, style]}>
                <View style={styles.errorBox}>
                    <Text style={styles.errorTitle}>Scanner indisponible</Text>
                    <Text style={styles.errorText}>{error}</Text>
                    {!hasDetector && (
                        <Text style={styles.errorHint}>
                            Essayez avec Google Chrome (version 83+), Microsoft Edge ou Opera.
                        </Text>
                    )}
                    <TouchableOpacity style={styles.retryBtn} onPress={() => { setError(null); startCamera(); }}>
                        <Text style={styles.retryText}>REESSAYER</Text>
                    </TouchableOpacity>
                </View>
            </View>
        );
    }

    return (
        <View style={[styles.container, style]}>
            {/* Video element (visible) */}
            <video
                ref={videoRef as any}
                style={{
                    position: 'absolute',
                    top: 0, left: 0,
                    width: '100%', height: '100%',
                    objectFit: 'cover',
                }}
                autoPlay
                playsInline
                muted
            />
            {/* Canvas cache pour l'analyse */}
            <canvas
                ref={canvasRef as any}
                style={{ display: 'none' }}
            />
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#000',
        overflow: 'hidden',
    },
    errorBox: {
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
    errorHint: {
        fontSize: 12,
        color: 'rgba(255,255,255,0.5)',
        textAlign: 'center',
        fontStyle: 'italic',
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
});
