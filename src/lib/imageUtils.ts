// Utilitaires d'optimisation des images Supabase Storage
// Ajoute des parametres de redimensionnement pour les thumbnails

/**
 * Retourne une URL avec parametres de taille pour les images Supabase Storage.
 * Si l'URL n'est pas une image Supabase, retourne l'URL inchangee.
 */
export function getImageThumbnail(url: string | undefined | null, width = 200, height = 200): string | undefined {
    if (!url) return undefined;

    // Supabase Storage public URL pattern
    if (url.includes('supabase.co') && url.includes('/storage/')) {
        // Transformer l'URL /object/public/ en /render/image/public/ pour le resize
        const renderUrl = url.replace('/object/public/', '/render/image/public/');
        const separator = renderUrl.includes('?') ? '&' : '?';
        return `${renderUrl}${separator}width=${width}&height=${height}&resize=contain`;
    }

    return url;
}

/**
 * URL pleine resolution (pour les modaux et vues detail)
 */
export function getImageFull(url: string | undefined | null): string | undefined {
    if (!url) return undefined;
    return url;
}
