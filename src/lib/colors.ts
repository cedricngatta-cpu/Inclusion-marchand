// Palette de couleurs — design system unifié
export const colors = {
    // Couleur principale : orange Jùlaba
    primary: '#C47316',
    primaryLight: '#D4882E',
    primaryDark: '#A36012',
    primaryBg: '#FFF8F0',
    primaryBg2: '#FDEBD0',

    // Neutres
    white: '#FFFFFF',
    black: '#000000',
    slate50: '#F9FAFB',
    slate100: '#F3F4F6',
    slate200: '#E5E7EB',
    slate300: '#D1D5DB',
    slate400: '#9CA3AF',
    slate500: '#6B7280',
    slate600: '#4B5563',
    slate700: '#374151',
    slate800: '#1F2937',
    slate900: '#111827',

    // Statuts
    success: '#059669',
    warning: '#D97706',
    error: '#DC2626',
    info: '#2563EB',

    // Couleurs secondaires
    amber500: '#F59E0B',
    blue500: '#3B82F6',
    red500: '#EF4444',
    red600: '#DC2626',

    // Fond global
    bg: '#FFFFFF',
    bgSecondary: '#F9FAFB',

    // Bordures
    border: '#F3F4F6',
    borderLight: '#E5E7EB',

    // Texte
    textPrimary: '#1F2937',
    textSecondary: '#6B7280',
    textMuted: '#9CA3AF',

    // Status badges
    orangeLight: '#FEF3C7',
    orange: '#D97706',
    blueLight: '#EFF6FF',
    blue: '#2563EB',
    redLight: '#FEE2E2',
    red: '#DC2626',
    greenLight: '#ECFDF5',
    green: '#059669',
    purpleLight: '#F3E8FF',
    purple: '#7C3AED',
};

// Typographie standard
export const FONTS = {
    h1: { fontSize: 24, fontWeight: '700' as const },
    h2: { fontSize: 18, fontWeight: '700' as const, letterSpacing: 0.5 as const },
    h3: { fontSize: 15, fontWeight: '600' as const },
    body: { fontSize: 14, fontWeight: '400' as const },
    caption: { fontSize: 12, fontWeight: '400' as const, color: '#6B7280' },
    label: { fontSize: 11, fontWeight: '600' as const, letterSpacing: 1 as const, color: '#6B7280' },
    button: { fontSize: 15, fontWeight: '700' as const, letterSpacing: 0.5 as const },
};

// Ombres standard
export const SHADOWS = {
    sm: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.05,
        shadowRadius: 4,
        elevation: 2,
    },
    md: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.08,
        shadowRadius: 8,
        elevation: 3,
    },
};
