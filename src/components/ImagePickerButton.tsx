// Bouton de selection photo cross-platform
// Mobile : expo-image-picker (camera + galerie) — require() dynamique
// Web : 2 inputs file (camera avec capture + galerie sans capture)
import React, { useRef } from 'react';
import { View, Text, TouchableOpacity, Image, StyleSheet, Platform } from 'react-native';
import { Camera, ImageIcon, X } from 'lucide-react-native';
import { colors } from '@/src/lib/colors';

interface Props {
    imageUri: string | null;
    onImageSelected: (uri: string, file?: File) => void;
    onImageRemoved?: () => void;
    label?: string;
}

export default function ImagePickerButton({
    imageUri,
    onImageSelected,
    onImageRemoved,
    label = 'PHOTO DU PRODUIT',
}: Props) {
    // Refs pour les inputs web — declares au top-level (regles des hooks)
    // Inutilises sur mobile mais inoffensifs
    const cameraInputRef = useRef<HTMLInputElement | null>(null);
    const galleryInputRef = useRef<HTMLInputElement | null>(null);

    // ── Web : handler commun pour les 2 inputs ──────────────────────────────
    const handleWebFileChange = (e: any) => {
        const file = e.target?.files?.[0];
        if (!file) return;
        const uri = URL.createObjectURL(file);
        onImageSelected(uri, file);
        // Reset pour pouvoir re-selectionner le meme fichier
        if (e.target) e.target.value = '';
    };

    // ── Mobile : expo-image-picker (require dynamique) ──────────────────────
    const pickFromCamera = async () => {
        try {
            const ImagePicker = require('expo-image-picker');
            const { status } = await ImagePicker.requestCameraPermissionsAsync();
            if (status !== 'granted') {
                alert('Permission camera necessaire pour prendre une photo');
                return;
            }
            const result = await ImagePicker.launchCameraAsync({
                mediaTypes: 'images',
                allowsEditing: true,
                aspect: [1, 1] as [number, number],
                quality: 0.7,
            });
            if (!result.canceled && result.assets[0]) {
                onImageSelected(result.assets[0].uri);
            }
        } catch (err) {
            console.log('[ImagePicker] Erreur camera:', err);
            alert("Impossible d'ouvrir la camera");
        }
    };

    const pickFromGallery = async () => {
        try {
            const ImagePicker = require('expo-image-picker');
            const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
            if (status !== 'granted') {
                alert('Permission galerie necessaire pour choisir une photo');
                return;
            }
            const result = await ImagePicker.launchImageLibraryAsync({
                mediaTypes: 'images',
                allowsEditing: true,
                aspect: [1, 1] as [number, number],
                quality: 0.7,
            });
            if (!result.canceled && result.assets[0]) {
                onImageSelected(result.assets[0].uri);
            }
        } catch (err) {
            console.log('[ImagePicker] Erreur galerie:', err);
            alert("Impossible d'ouvrir la galerie");
        }
    };

    // ── Preview avec bouton supprimer ────────────────────────────────────────
    if (imageUri) {
        return (
            <View>
                <Text style={styles.label}>{label}</Text>
                <View style={styles.previewContainer}>
                    {Platform.OS === 'web' ? (
                        <img
                            src={imageUri}
                            style={{ width: 120, height: 120, borderRadius: 10, objectFit: 'cover' }}
                        />
                    ) : (
                        <Image source={{ uri: imageUri }} style={styles.preview} />
                    )}
                    {onImageRemoved && (
                        <TouchableOpacity
                            style={styles.removeBtn}
                            onPress={onImageRemoved}
                            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        >
                            <X color={colors.white} size={14} />
                        </TouchableOpacity>
                    )}
                </View>
            </View>
        );
    }

    // ── Boutons camera + galerie ─────────────────────────────────────────────
    return (
        <View>
            <Text style={styles.label}>{label}</Text>
            <View style={styles.buttonsRow}>
                {/* Bouton Camera */}
                <TouchableOpacity
                    style={[styles.btn, styles.btnPrimary]}
                    onPress={Platform.OS === 'web'
                        ? () => cameraInputRef.current?.click()
                        : pickFromCamera
                    }
                    activeOpacity={0.8}
                >
                    <Camera color={colors.white} size={18} />
                    <Text style={styles.btnText}>Photo</Text>
                </TouchableOpacity>

                {/* Bouton Galerie */}
                <TouchableOpacity
                    style={[styles.btn, styles.btnSecondary]}
                    onPress={Platform.OS === 'web'
                        ? () => galleryInputRef.current?.click()
                        : pickFromGallery
                    }
                    activeOpacity={0.8}
                >
                    <ImageIcon color="#ccc" size={18} />
                    <Text style={styles.btnTextSecondary}>Galerie</Text>
                </TouchableOpacity>
            </View>

            {/* Inputs file caches — web uniquement */}
            {Platform.OS === 'web' && (
                <>
                    <input
                        ref={cameraInputRef as any}
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        capture="environment"
                        style={{ display: 'none' }}
                        onChange={handleWebFileChange}
                    />
                    <input
                        ref={galleryInputRef as any}
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        style={{ display: 'none' }}
                        onChange={handleWebFileChange}
                    />
                </>
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    label: {
        fontSize: 11,
        fontWeight: '800',
        color: colors.slate500,
        letterSpacing: 1,
        marginBottom: 8,
    },
    buttonsRow: {
        flexDirection: 'row',
        gap: 12,
        marginBottom: 16,
    },
    btn: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        paddingVertical: 14,
        borderRadius: 10,
    },
    btnPrimary: {
        backgroundColor: colors.primary,
    },
    btnSecondary: {
        backgroundColor: '#333',
    },
    btnText: {
        color: colors.white,
        fontWeight: '700',
        fontSize: 15,
    },
    btnTextSecondary: {
        color: '#ccc',
        fontWeight: '600',
        fontSize: 15,
    },
    previewContainer: {
        alignItems: 'center',
        position: 'relative',
        marginBottom: 16,
    },
    preview: {
        width: 120,
        height: 120,
        borderRadius: 10,
    },
    removeBtn: {
        position: 'absolute',
        top: -8,
        right: '30%' as any,
        width: 26,
        height: 26,
        borderRadius: 8,
        backgroundColor: 'rgba(0,0,0,0.6)',
        alignItems: 'center',
        justifyContent: 'center',
    },
});
