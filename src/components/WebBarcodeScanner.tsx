// Scanner code-barres web — 2 moteurs :
//   1. BarcodeDetector API native (Chrome 83+, Edge, Opera) — rapide, zero dep
//   2. html5-qrcode fallback (Firefox, Safari, vieux Chrome) — decodage JS pur
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

const SCAN_INTERVAL = 300;
const COOLDOWN_MS = 2000;
const BD_FORMATS = [
    'ean_13', 'ean_8', 'upc_a', 'upc_e',
    'code_128', 'code_39', 'code_93',
    'itf', 'codabar', 'data_matrix', 'qr_code',
];

// html5-qrcode format IDs (Html5QrcodeSupportedFormats enum values)
const H5_FORMATS = [
    0,  // QR_CODE
    2,  // CODABAR
    3,  // CODE_39
    4,  // CODE_93
    5,  // CODE_128
    8,  // EAN_8
    9,  // EAN_13
    12, // UPC_A
    13, // UPC_E
];

type ScanEngine = 'barcode-detector' | 'html5-qrcode' | null;

export default function WebBarcodeScanner({ onScan, active = true, style }: Props) {
    const onScanRef = useRef(onScan);
    onScanRef.current = onScan;
    const lastScanRef = useRef(0);

    // BarcodeDetector refs
    const videoRef = useRef<HTMLVideoElement | null>(null);
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const detectorRef = useRef<any>(null);
    const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

    // html5-qrcode refs
    const h5ScannerRef = useRef<any>(null);
    const containerId = useRef('jlb-scanner-' + Math.random().toString(36).slice(2, 8));

    const [engine, setEngine] = useState<ScanEngine>(null);
    const [error, setError] = useState<string | null>(null);
    const [ready, setReady] = useState(false);
    const mountedRef = useRef(true);

    // ── Debounce helper ─────────────────────────────────────────────────────
    const emitScan = useCallback((type: string, data: string) => {
        const now = Date.now();
        if (now - lastScanRef.current < COOLDOWN_MS) return;
        lastScanRef.current = now;
        onScanRef.current({ type, data });
    }, []);

    // ── Cleanup tout ────────────────────────────────────────────────────────
    const cleanup = useCallback(async () => {
        // BarcodeDetector cleanup
        if (intervalRef.current) {
            clearInterval(intervalRef.current);
            intervalRef.current = null;
        }
        if (streamRef.current) {
            streamRef.current.getTracks().forEach(t => t.stop());
            streamRef.current = null;
        }
        // html5-qrcode cleanup
        try {
            if (h5ScannerRef.current) {
                const scanner = h5ScannerRef.current;
                if (scanner.isScanning) await scanner.stop();
                scanner.clear();
                h5ScannerRef.current = null;
            }
        } catch { /* ignore */ }
    }, []);

    // ── MODE 1 : BarcodeDetector API ────────────────────────────────────────
    const startBarcodeDetector = useCallback(async () => {
        try {
            detectorRef.current = new window.BarcodeDetector!({ formats: BD_FORMATS });
        } catch {
            return false;
        }

        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
            });
            if (!mountedRef.current) { stream.getTracks().forEach(t => t.stop()); return false; }
            streamRef.current = stream;

            if (videoRef.current) {
                videoRef.current.srcObject = stream;
                await videoRef.current.play();
            }

            setEngine('barcode-detector');
            setReady(true);

            // Boucle de detection
            const video = videoRef.current!;
            const canvas = canvasRef.current!;
            const ctx = canvas.getContext('2d');
            if (!ctx) return true;

            intervalRef.current = setInterval(async () => {
                if (!mountedRef.current || video.readyState < 2 || !detectorRef.current) return;
                canvas.width = video.videoWidth;
                canvas.height = video.videoHeight;
                ctx.drawImage(video, 0, 0);
                try {
                    const barcodes = await detectorRef.current.detect(canvas);
                    if (barcodes.length > 0) {
                        emitScan(barcodes[0].format, barcodes[0].rawValue);
                    }
                } catch { /* retry next frame */ }
            }, SCAN_INTERVAL);

            return true;
        } catch (err: any) {
            if (err?.name === 'NotAllowedError') {
                setError('Camera non autorisee. Autorisez l\'acces dans les parametres du navigateur.');
                return true; // ne pas fallback — c'est un probleme de permission pas de support
            }
            return false;
        }
    }, [emitScan]);

    // ── MODE 2 : html5-qrcode fallback ──────────────────────────────────────
    const startHtml5QrCode = useCallback(async () => {
        try {
            // Import dynamique pour ne pas charger le bundle si BarcodeDetector suffit
            const { Html5Qrcode } = await import('html5-qrcode');
            if (!mountedRef.current) return;

            const scanner = new Html5Qrcode(containerId.current, {
                formatsToSupport: H5_FORMATS,
                verbose: false,
            });
            h5ScannerRef.current = scanner;

            await scanner.start(
                { facingMode: 'environment' },
                {
                    fps: 10,
                    qrbox: { width: 280, height: 160 },
                    aspectRatio: 1.777,
                },
                (decodedText: string, decodedResult: any) => {
                    const fmt = decodedResult?.result?.format?.formatName ?? 'unknown';
                    emitScan(fmt, decodedText);
                },
                () => {} // scan fail silencieux
            );

            if (!mountedRef.current) { await scanner.stop(); scanner.clear(); return; }
            setEngine('html5-qrcode');
            setReady(true);

            // Masquer les UI parasites injectees par html5-qrcode
            requestAnimationFrame(() => {
                try {
                    const container = document.getElementById(containerId.current);
                    if (!container) return;
                    // Masquer le bouton swap camera et les textes injectes
                    const buttons = container.querySelectorAll('button');
                    buttons.forEach(b => { (b as HTMLElement).style.display = 'none'; });
                    const spans = container.querySelectorAll('span');
                    spans.forEach(s => {
                        if (s.textContent?.includes('camera') || s.textContent?.includes('Camera'))
                            (s as HTMLElement).style.display = 'none';
                    });
                    // Stretch video
                    const video = container.querySelector('video');
                    if (video) {
                        video.style.objectFit = 'cover';
                        video.style.width = '100%';
                        video.style.height = '100%';
                        video.style.borderRadius = '0';
                    }
                    // Masquer l'overlay de scan par defaut
                    const img = container.querySelector('img');
                    if (img) img.style.display = 'none';
                } catch { /* best effort */ }
            });
        } catch (err: any) {
            console.error('[WebBarcodeScanner] html5-qrcode error:', err);
            if (err?.message?.includes('NotAllowed') || err?.message?.includes('Permission')) {
                setError('Camera non autorisee. Autorisez l\'acces dans les parametres du navigateur.');
            } else {
                setError('Impossible d\'acceder a la camera. Verifiez les permissions.');
            }
        }
    }, [emitScan]);

    // ── Init : essayer BD d'abord, fallback html5-qrcode ────────────────────
    useEffect(() => {
        if (Platform.OS !== 'web') return;
        mountedRef.current = true;

        (async () => {
            // Essayer BarcodeDetector en premier
            if (typeof window !== 'undefined' && window.BarcodeDetector) {
                const ok = await startBarcodeDetector();
                if (ok) return;
            }
            // Fallback html5-qrcode
            await startHtml5QrCode();
        })();

        return () => {
            mountedRef.current = false;
            cleanup();
        };
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    // ── Pause / reprise ─────────────────────────────────────────────────────
    useEffect(() => {
        if (engine === 'barcode-detector') {
            if (!active && intervalRef.current) {
                clearInterval(intervalRef.current);
                intervalRef.current = null;
            }
            // La reprise se fait au prochain render quand active revient a true
            // On ne relance pas le polling ici car startBarcodeDetector gere tout
        }
        if (engine === 'html5-qrcode' && h5ScannerRef.current) {
            try {
                if (!active && h5ScannerRef.current.isScanning) {
                    h5ScannerRef.current.pause(true);
                } else if (active && !h5ScannerRef.current.isScanning) {
                    // Redemarrer si arrete — pause/resume n'est pas fiable sur h5
                }
            } catch { /* ignore */ }
        }
    }, [active, engine]);

    if (Platform.OS !== 'web') return null;

    // ── Erreur ──────────────────────────────────────────────────────────────
    if (error) {
        return (
            <View style={[styles.container, style]}>
                <View style={styles.errorBox}>
                    <Text style={styles.errorTitle}>Scanner indisponible</Text>
                    <Text style={styles.errorText}>{error}</Text>
                    <TouchableOpacity
                        style={styles.retryBtn}
                        onPress={() => {
                            setError(null);
                            setReady(false);
                            cleanup().then(() => {
                                if (window.BarcodeDetector) startBarcodeDetector().then(ok => { if (!ok) startHtml5QrCode(); });
                                else startHtml5QrCode();
                            });
                        }}
                    >
                        <Text style={styles.retryText}>REESSAYER</Text>
                    </TouchableOpacity>
                </View>
            </View>
        );
    }

    // ── Render ──────────────────────────────────────────────────────────────
    return (
        <View style={[styles.container, style]}>
            {/* BarcodeDetector : video + canvas propres */}
            {engine === 'barcode-detector' && (
                <>
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
                    <canvas ref={canvasRef as any} style={{ display: 'none' }} />
                </>
            )}

            {/* html5-qrcode : div container gere par la lib */}
            {(engine === 'html5-qrcode' || !ready) && (
                <div
                    id={containerId.current}
                    style={{
                        width: '100%',
                        height: '100%',
                        position: 'absolute',
                        top: 0, left: 0,
                    }}
                />
            )}

            {/* Indicateur de chargement */}
            {!ready && !error && (
                <View style={styles.loadingBox}>
                    <Text style={styles.loadingText}>Demarrage de la camera...</Text>
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
});
