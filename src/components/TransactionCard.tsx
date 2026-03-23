// Carte de transaction detaillee — utilisee dans bilan.tsx et revenus.tsx
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { ShoppingBag, Package, Mic, WifiOff, CheckCircle } from 'lucide-react-native';
import { colors } from '@/src/lib/colors';
import type { Transaction } from '@/src/context/HistoryContext';

interface Props {
    transaction: Transaction;
    showBorder?: boolean;
}

const PAY_COLORS: Record<string, { bg: string; text: string; label: string }> = {
    MOMO:  { bg: '#dbeafe', text: '#1d4ed8', label: 'Mobile Money' },
    DETTE: { bg: '#fff7ed', text: '#c2410c', label: 'Credit' },
    PAYÉ:  { bg: '#d1fae5', text: '#065f46', label: 'Especes' },
};

export default function TransactionCard({ transaction: t, showBorder = true }: Props) {
    const unitPrice = t.unitPrice ?? (t.quantity > 0 ? Math.round(t.price / t.quantity) : t.price);
    const date = new Date(t.timestamp);
    const formattedDate = date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })
        + ' a ' + date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });

    const isVocal = t.source === 'voice' || t.source === 'voice_offline';
    const isOffline = t.source === 'voice_offline';
    const pay = PAY_COLORS[t.status || 'PAYÉ'] || PAY_COLORS.PAYÉ;

    const isSale = t.type === 'VENTE';
    const IconComp = isSale ? ShoppingBag : Package;
    const iconBg = isSale ? '#ecfdf5' : '#eff6ff';
    const iconColor = isSale ? colors.primary : '#2563eb';

    return (
        <View style={[styles.card, showBorder && styles.cardBorder]}>
            {/* Ligne 1 : Icone + Produit + Montant */}
            <View style={styles.row1}>
                <View style={[styles.icon, { backgroundColor: iconBg }]}>
                    <IconComp color={iconColor} size={16} />
                </View>
                <Text style={styles.productName} numberOfLines={1}>{t.productName}</Text>
                <Text style={[styles.totalAmount, t.status === 'DETTE' && styles.totalDebt, t.status === 'MOMO' && styles.totalMomo]}>
                    {t.price.toLocaleString('fr-FR')} F
                </Text>
            </View>

            {/* Ligne 2 : Quantite x Prix unitaire */}
            <Text style={styles.detailLine}>
                {t.quantity} unites x {unitPrice.toLocaleString('fr-FR')} F/unite
            </Text>

            {/* Ligne 3 : Client */}
            {t.clientName && t.clientName !== 'Client standard' && (
                <Text style={styles.clientLine}>Client : {t.clientName}</Text>
            )}

            {/* Ligne 4 : Date + operateur MoMo */}
            <View style={styles.dateRow}>
                <Text style={styles.dateLine}>{formattedDate}</Text>
                {t.status === 'MOMO' && t.operator && (
                    <View style={styles.operatorBadge}>
                        <Text style={styles.operatorText}>{t.operator}</Text>
                    </View>
                )}
            </View>

            {/* Ligne 5 : Badges */}
            <View style={styles.badgeRow}>
                <View style={[styles.badge, { backgroundColor: pay.bg }]}>
                    <Text style={[styles.badgeText, { color: pay.text }]}>{pay.label}</Text>
                </View>
                {isVocal && (
                    <View style={[styles.badge, styles.badgeVocal]}>
                        <Mic color="#7c3aed" size={10} />
                        <Text style={styles.badgeVocalText}>Vocal</Text>
                    </View>
                )}
                {isOffline && (
                    <View style={[styles.badge, styles.badgeOffline]}>
                        <WifiOff color="#d97706" size={10} />
                        <Text style={styles.badgeOfflineText}>Hors ligne</Text>
                    </View>
                )}
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    card: {
        paddingVertical: 12,
        paddingHorizontal: 2,
    },
    cardBorder: {
        borderBottomWidth: 1,
        borderBottomColor: colors.slate100,
    },

    // Ligne 1
    row1: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
    },
    icon: {
        width: 36,
        height: 36,
        borderRadius: 10,
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
    },
    productName: {
        flex: 1,
        fontSize: 15,
        fontWeight: '800',
        color: colors.slate900,
    },
    totalAmount: {
        fontSize: 15,
        fontWeight: '900',
        color: colors.primary,
        flexShrink: 0,
    },
    totalDebt: {
        color: '#f97316',
    },
    totalMomo: {
        color: '#0891b2',
    },

    // Ligne 2
    detailLine: {
        fontSize: 12,
        color: colors.slate500,
        marginTop: 4,
        marginLeft: 46,
    },

    // Ligne 3
    clientLine: {
        fontSize: 12,
        color: colors.slate400,
        marginTop: 2,
        marginLeft: 46,
    },

    // Ligne 4
    dateRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        marginTop: 4,
        marginLeft: 46,
    },
    dateLine: {
        fontSize: 11,
        color: colors.slate400,
    },
    operatorBadge: {
        backgroundColor: '#e0f2fe',
        paddingHorizontal: 6,
        paddingVertical: 2,
        borderRadius: 4,
    },
    operatorText: {
        fontSize: 10,
        fontWeight: '800',
        color: '#0891b2',
    },

    // Ligne 5
    badgeRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        marginTop: 8,
        marginLeft: 46,
        flexWrap: 'wrap',
    },
    badge: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        paddingHorizontal: 8,
        paddingVertical: 3,
        borderRadius: 6,
    },
    badgeText: {
        fontSize: 11,
        fontWeight: '700',
    },
    badgeVocal: {
        backgroundColor: '#f3e8ff',
    },
    badgeVocalText: {
        fontSize: 11,
        fontWeight: '700',
        color: '#7c3aed',
    },
    badgeOffline: {
        backgroundColor: '#fef3c7',
    },
    badgeOfflineText: {
        fontSize: 11,
        fontWeight: '700',
        color: '#d97706',
    },
});
