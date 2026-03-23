// Bouton de selection photo cross-platform
// Mobile : expo-image-picker (camera + galerie)
// Web : input file avec capture="environment"
import React, { useRef } from 'react';
import { View, Text, TouchableOpacity, Image, StyleSheet, Platform, Alert } from 'react-native';
import { Camera, X } from 'lucide-react-native';
import { colors } from '@/src/lib/colors';

interface ImagePickerResult {
    uri: string;
    file?: File; // disponible uniquement sur web
}

interface Props {
    imageUri: string | null;
    onImageSelected: (result: ImagePickerResult) => void;
    onImageRemoved: () => void;
    label?: string;
    hint?: string;
}

export default function ImagePickerButton({
    imageUri,
    onImageSelected,
    onImageRemoved,
    label = 'PHOTO DU PRODUIT',
    hint = 'Appuyez pour ajouter une photo',
}: Props) {
    const webInputRef = useRef<HTMLInputElement | null>(null);

    // ── Mobile : expo-image-picker ──────────────────────────────────────────
    const handleMobilePick = () => {
        Alert.alert('Photo du produit', 'Choisissez une option', [
            { text: 'Prendre une photo', onPress: pickFromCamera },
            { text: 'Choisir dans la galerie', onPress: pickFromGallery },
            { text: 'Annuler', style: 'cancel' },
        ]);
    };

    const pickFromCamera = async () => {
        const ImagePicker = require('expo-image-picker');
        const perm = await ImagePicker.requestCameraPermissionsAsync();
        if (!perm.granted) {
            Alert.alert('Permission refusée', "Activez l'accès à la caméra dans les paramètres.");
            return;
        }
        const result = await ImagePicker.launchCameraAsync({
            mediaTypes: ImagePicker.MediaTypeOptions.Images,
            allowsEditing: true,
            aspect: [1, 1] as [number, number],
            quality: 0.7,
        });
        if (!result.canceled && result.assets[0]) {
            onImageSelected({ uri: result.assets[0].uri });
        }
    };

    const pickFromGallery = async () => {
        const ImagePicker = require('expo-image-picker');
        const result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ImagePicker.MediaTypeOptions.Images,
            allowsEditing: true,
            aspect: [1, 1] as [number, number],
            quality: 0.7,
        });
        if (!result.canceled && result.assets[0]) {
            onImageSelected({ uri: result.assets[0].uri });
        }
    };

    // ── Web : input file ────────────────────────────────────────────────────
    const handleWebPick = () => {
        webInputRef.current?.click();
    };

    const handleWebFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const uri = URL.createObjectURL(file);
        onImageSelected({ uri, file });
        // Reset input pour pouvoir re-sélectionner le même fichier
        if (webInputRef.current) webInputRef.current.value = '';
    };

    const handlePress = Platform.OS === 'web' ? handleWebPick : handleMobilePick;

    return (
        <View>
            <Text style={styles.label}>{label}</Text>
            <TouchableOpacity style={styles.photoBtn} onPress={handlePress} activeOpacity={0.8}>
                {imageUri ? (
                    <Image source={{ uri: imageUri }} style={styles.preview} />
                ) : (
                    <View style={styles.placeholder}>
                        <Camera color={colors.slate300} size={30} />
                        <Text style={styles.hint}>{hint}</Text>
                    </View>
                )}
                {imageUri && (
                    <TouchableOpacity
                        style={styles.removeBtn}
                        onPress={onImageRemoved}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                        <X color={colors.white} size={14} />
                    </TouchableOpacity>
                )}
            </TouchableOpacity>

            {/* Input file caché pour le web */}
            {Platform.OS === 'web' && (
                <input
                    ref={webInputRef as any}
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    capture="environment"
                    style={{ display: 'none' }}
                    onChange={handleWebFileChange as any}
                />
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
    photoBtn: {
        width: '100%',
        height: 140,
        borderRadius: 10,
        borderWidth: 1.5,
        borderColor: colors.slate200,
        borderStyle: 'dashed',
        overflow: 'hidden',
        marginBottom: 16,
    },
    preview: {
        width: '100%',
        height: '100%',
        borderRadius: 10,
    },
    placeholder: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        backgroundColor: colors.slate50,
    },
    hint: {
        fontSize: 12,
        color: colors.slate400,
        fontWeight: '600',
    },
    removeBtn: {
        position: 'absolute',
        top: 8,
        right: 8,
        width: 26,
        height: 26,
        borderRadius: 8,
        backgroundColor: 'rgba(0,0,0,0.6)',
        alignItems: 'center',
        justifyContent: 'center',
    },
});
