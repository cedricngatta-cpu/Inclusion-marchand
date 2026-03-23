// Écran Notifications — groupage par date, marquer tout lu, design professionnel
import React, { useCallback, useMemo, useState } from 'react';
import {
    View, Text, StyleSheet, TouchableOpacity,
    SectionList, Modal, Alert,
} from 'react-native';
import {
    Bell, Trash2, AlertTriangle, ShoppingBag,
    Truck, UserCheck, Package, X, ChevronRight, Users, CheckCheck,
} from 'lucide-react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { useNotifications, Notification } from '@/src/context/NotificationContext';
import { colors } from '@/src/lib/colors';
import { ScreenHeader } from '@/src/components/ui';

// ── Helpers ───────────────────────────────────────────────────────────────────
type IconComponent = React.ComponentType<{ color?: string; size?: number; strokeWidth?: number }>;

function getTypeStyle(type: string): { bg: string; color: string; Icon: IconComponent } {
    switch (type) {
        case 'commande':
            return { bg: '#dbeafe', color: '#2563EB', Icon: ShoppingBag };
        case 'commande_refusee':
            return { bg: '#fee2e2', color: '#DC2626', Icon: ShoppingBag };
        case 'livraison':
            return { bg: '#d1fae5', color: colors.success, Icon: Truck };
        case 'enrolement':
            return { bg: '#fef3c7', color: '#D97706', Icon: UserCheck };
        case 'signalement':
            return { bg: '#fee2e2', color: '#DC2626', Icon: AlertTriangle };
        case 'marche':
            return { bg: '#ede9fe', color: '#7C3AED', Icon: Package };
        case 'achat_groupe':
            return { bg: '#cffafe', color: '#0891B2', Icon: Users };
        case 'vente':
            return { bg: '#d1fae5', color: colors.success, Icon: ShoppingBag };
        default:
            return { bg: '#eff6ff', color: '#2563eb', Icon: Bell };
    }
}

const DATA_LABELS: Record<string, string> = {
    produit_nom:         'Produit',
    quantite:            'Quantité',
    prix:                'Prix',
    marchand:            'Marchand',
    producteur:          'Producteur',
    agent:               'Agent',
    nom:                 'Nom',
    motif:               'Motif',
    raison:              'Raison',
    secteur:             'Secteur',
    cooperative:         'Coopérative',
    cooperative_saisie:  'Coopérative saisie',
    membre:              'Membre',
    createur:            'Créateur',
    type:                'Type',
    livreur:             'Livreur',
    delai:               'Délai livraison',
    date_limite:         'Date limite',
    message_coop:        'Message coopérative',
    total_participants:  'Participants',
};

function formatRelative(ts: number): string {
    const diff = Date.now() - ts;
    const min  = Math.floor(diff / 60000);
    if (min < 1)  return 'À l\'instant';
    if (min < 60) return `il y a ${min} min`;
    const h = Math.floor(min / 60);
    if (h < 24)   return `il y a ${h}h`;
    const d = Math.floor(h / 24);
    if (d === 1)  return 'hier';
    return new Date(ts).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' });
}

function formatFull(ts: number): string {
    return new Date(ts).toLocaleDateString('fr-FR', {
        day: 'numeric', month: 'long', year: 'numeric',
        hour: '2-digit', minute: '2-digit',
    });
}

function formatDataValue(key: string, value: unknown): string {
    if (typeof value === 'number') {
        return key === 'quantite' ? String(value) : `${value.toLocaleString('fr-FR')} F`;
    }
    if (key === 'type') {
        if (value === 'MERCHANT') return 'Marchand';
        if (value === 'PRODUCER') return 'Producteur';
    }
    return String(value);
}

// Groupe les notifs par section de date
function groupByDate(notifs: Notification[]): { title: string; data: Notification[] }[] {
    const now   = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const yesterday = today - 86400000;
    const weekAgo   = today - 7 * 86400000;

    const groups: Record<string, Notification[]> = {
        "Aujourd'hui": [],
        'Hier': [],
        'Cette semaine': [],
        'Plus ancien': [],
    };

    for (const n of notifs) {
        const t = n.created_at;
        if (t >= today)         groups["Aujourd'hui"].push(n);
        else if (t >= yesterday) groups['Hier'].push(n);
        else if (t >= weekAgo)   groups['Cette semaine'].push(n);
        else                     groups['Plus ancien'].push(n);
    }

    return Object.entries(groups)
        .filter(([, data]) => data.length > 0)
        .map(([title, data]) => ({ title, data }));
}

// ── Carte notification ────────────────────────────────────────────────────────
interface NotifCardProps {
    notif: Notification;
    onPress: (notif: Notification) => void;
    onDelete: (id: string) => void;
}

const NotifCard = React.memo(({ notif, onPress, onDelete }: NotifCardProps) => {
    const { bg, color, Icon } = getTypeStyle(notif.type);
    return (
        <View style={[
            s.notifCard,
            notif.lu ? s.notifCardRead : s.notifCardUnread,
            !notif.lu && { borderLeftColor: color },
        ]}>
            <TouchableOpacity
                style={s.notifPressArea}
                onPress={() => onPress(notif)}
                activeOpacity={0.78}
            >
                {/* Icône type */}
                <View style={[s.notifIcon, { backgroundColor: bg }]}>
                    <Icon color={color} size={18} />
                </View>

                {/* Texte */}
                <View style={s.notifContent}>
                    <Text style={[s.notifTitle, notif.lu && s.notifTitleRead]} numberOfLines={1}>
                        {notif.titre}
                    </Text>
                    <Text style={s.notifMessage} numberOfLines={2}>{notif.message}</Text>
                    <Text style={s.notifDate}>{formatRelative(notif.created_at)}</Text>
                </View>

                {/* Badge non lu */}
                {!notif.lu && <View style={[s.unreadDot, { backgroundColor: color }]} />}
            </TouchableOpacity>

            {/* Bouton suppression */}
            <TouchableOpacity
                style={s.deleteBtn}
                onPress={() => onDelete(notif.id)}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                activeOpacity={0.6}
            >
                <Trash2 color={colors.slate200} size={15} />
            </TouchableOpacity>
        </View>
    );
});

// ── Composant principal ────────────────────────────────────────────────────────
export default function NotificationsScreen() {
    const router = useRouter();
    const { notifications, unreadCount, markAsRead, deleteNotification, refreshNotifications } = useNotifications();
    const [selected, setSelected] = useState<Notification | null>(null);

    useFocusEffect(useCallback(() => { refreshNotifications(); }, [refreshNotifications]));

    const sections = useMemo(() => groupByDate(notifications), [notifications]);

    const handlePress = (notif: Notification) => {
        setSelected(notif);
        if (!notif.lu) setTimeout(() => markAsRead(notif.id), 300);
    };

    const handleDelete = (id: string) => {
        Alert.alert(
            'Supprimer',
            'Supprimer cette notification ?',
            [
                { text: 'Supprimer', style: 'destructive', onPress: () => deleteNotification(id) },
                { text: 'Annuler', style: 'cancel' },
            ]
        );
    };

    const handleMarkAllRead = () => {
        if (unreadCount === 0) return;
        notifications.filter(n => !n.lu).forEach(n => markAsRead(n.id));
    };

    const handleVoir = (route: string) => {
        setSelected(null);
        setTimeout(() => {
            try { router.push(route as any); } catch { /* route invalide — ignore */ }
        }, 350);
    };

    const modalTs    = selected ? getTypeStyle(selected.type) : null;
    const detailRows = selected
        ? Object.entries(selected.data ?? {}).filter(
            ([k, v]) => k !== 'route' && k in DATA_LABELS && v !== undefined && v !== null && v !== ''
          )
        : [];

    return (
        <View style={s.safe}>
            <ScreenHeader
                title="Notifications"
                subtitle={unreadCount > 0 ? `${unreadCount} non lue${unreadCount > 1 ? 's' : ''}` : 'Tout est lu'}
                showBack={true}
                paddingBottom={12}
            >
                {unreadCount > 0 && (
                    <TouchableOpacity style={s.markAllBtn} onPress={handleMarkAllRead} activeOpacity={0.8}>
                        <CheckCheck color="rgba(255,255,255,0.9)" size={14} />
                        <Text style={s.markAllTxt}>Tout marquer comme lu</Text>
                    </TouchableOpacity>
                )}
            </ScreenHeader>

            <SectionList
                sections={sections}
                keyExtractor={(item) => item.id}
                style={s.list}
                contentContainerStyle={[s.listContent, sections.length === 0 && s.listEmpty]}
                showsVerticalScrollIndicator={false}
                stickySectionHeadersEnabled={false}
                renderSectionHeader={({ section: { title } }) => (
                    <View style={s.sectionHeader}>
                        <Text style={s.sectionTitle}>{title}</Text>
                    </View>
                )}
                renderItem={({ item }) => (
                    <NotifCard notif={item} onPress={handlePress} onDelete={handleDelete} />
                )}
                ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
                SectionSeparatorComponent={() => <View style={{ height: 4 }} />}
                ListEmptyComponent={
                    <View style={s.empty}>
                        <View style={s.emptyIcon}>
                            <Bell color={colors.slate300} size={32} />
                        </View>
                        <Text style={s.emptyTitle}>Aucune notification</Text>
                        <Text style={s.emptyText}>Les alertes et mises à jour apparaîtront ici</Text>
                    </View>
                }
            />

            {/* ── Modal de détail ────────────────────────────────────────────── */}
            <Modal
                visible={!!selected}
                transparent
                animationType="slide"
                onRequestClose={() => setSelected(null)}
            >
                <View style={s.overlay}>
                    {selected && modalTs && (
                        <View style={s.sheet}>

                            {/* Header modal : barre + icône + X */}
                            <View style={s.sheetHandle} />
                            <View style={s.sheetTop}>
                                <View style={[s.sheetIcon, { backgroundColor: modalTs.bg }]}>
                                    <modalTs.Icon color={modalTs.color} size={26} />
                                </View>
                                <View style={s.sheetTopText}>
                                    <Text style={s.sheetTitle} numberOfLines={2}>{selected.titre}</Text>
                                    <Text style={s.sheetDate}>{formatFull(selected.created_at)}</Text>
                                </View>
                                <TouchableOpacity
                                    onPress={() => setSelected(null)}
                                    style={s.closeBtn}
                                    activeOpacity={0.7}
                                >
                                    <X color={colors.slate400} size={18} />
                                </TouchableOpacity>
                            </View>

                            {/* Message */}
                            <Text style={s.sheetMessage}>{selected.message}</Text>

                            {/* Détails */}
                            {detailRows.length > 0 && (
                                <View style={s.detailsCard}>
                                    <Text style={s.detailsLabel}>DÉTAILS</Text>
                                    {detailRows.map(([key, value]) => (
                                        <View key={key} style={s.detailRow}>
                                            <Text style={s.detailKey}>{DATA_LABELS[key]}</Text>
                                            <Text style={s.detailValue} numberOfLines={2}>
                                                {formatDataValue(key, value)}
                                            </Text>
                                        </View>
                                    ))}
                                </View>
                            )}

                            {/* Actions */}
                            <View style={s.sheetActions}>
                                {!!selected.route && selected.route !== '/' && (
                                    <TouchableOpacity
                                        style={s.btnVoir}
                                        onPress={() => handleVoir(selected.route)}
                                        activeOpacity={0.85}
                                    >
                                        <Text style={s.btnVoirTxt}>VOIR</Text>
                                        <ChevronRight color={colors.white} size={16} />
                                    </TouchableOpacity>
                                )}
                                <TouchableOpacity
                                    style={[s.btnFermer, !selected.route || selected.route === '/' ? { flex: 1 } : {}]}
                                    onPress={() => setSelected(null)}
                                    activeOpacity={0.85}
                                >
                                    <Text style={s.btnFermerTxt}>Fermer</Text>
                                </TouchableOpacity>
                            </View>
                        </View>
                    )}
                </View>
            </Modal>
        </View>
    );
}

// ── Styles ─────────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.bgSecondary },
    list: { flex: 1 },
    listContent: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 40 },
    listEmpty:   { flex: 1 },

    // Bouton "Tout marquer lu" dans le header
    markAllBtn: {
        flexDirection: 'row', alignItems: 'center', gap: 6,
        backgroundColor: 'rgba(255,255,255,0.15)',
        borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8,
        alignSelf: 'flex-start', marginTop: 8,
    },
    markAllTxt: { fontSize: 12, fontWeight: '700', color: 'rgba(255,255,255,0.9)' },

    // Section de date
    sectionHeader: { paddingVertical: 8, paddingTop: 12 },
    sectionTitle:  { fontSize: 11, fontWeight: '900', color: colors.slate400, letterSpacing: 1.5, textTransform: 'uppercase' },

    // Carte
    notifCard: {
        backgroundColor: colors.white,
        borderRadius: 10,
        borderWidth: 1,
        borderColor: colors.slate100,
        borderLeftWidth: 4,
        borderLeftColor: colors.slate200,
        flexDirection: 'row',
        alignItems: 'center',
        overflow: 'hidden',
        elevation: 1,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.04,
        shadowRadius: 3,
    },
    notifCardUnread: { backgroundColor: colors.white, borderLeftWidth: 4 },
    notifCardRead:   { backgroundColor: colors.slate50, borderLeftWidth: 4, borderLeftColor: colors.slate200 },

    // Zone cliquable
    notifPressArea: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 },

    notifIcon:    { width: 38, height: 38, borderRadius: 10, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
    notifContent: { flex: 1, minWidth: 0, gap: 3 },

    notifTitle:     { fontSize: 13, fontWeight: '800', color: colors.slate900, lineHeight: 18 },
    notifTitleRead: { fontWeight: '600', color: colors.slate600 },
    notifMessage:   { fontSize: 12, color: colors.slate500, lineHeight: 17 },
    notifDate:      { fontSize: 11, color: colors.slate400, fontWeight: '600' },

    unreadDot: { width: 7, height: 7, borderRadius: 4, flexShrink: 0, marginRight: 2 },

    // Bouton suppression
    deleteBtn: { paddingHorizontal: 12, paddingVertical: 22, alignItems: 'center', justifyContent: 'center' },

    // État vide
    empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingBottom: 60, gap: 12 },
    emptyIcon: {
        width: 64, height: 64, borderRadius: 12,
        backgroundColor: colors.slate100,
        alignItems: 'center', justifyContent: 'center',
    },
    emptyTitle: { fontSize: 15, fontWeight: '800', color: colors.slate500 },
    emptyText:  { fontSize: 13, color: colors.slate400, textAlign: 'center', lineHeight: 20 },

    // Overlay modal
    overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
    sheet: {
        backgroundColor: colors.white,
        borderTopLeftRadius: 16, borderTopRightRadius: 16,
        padding: 20, paddingBottom: 44,
    },
    sheetHandle: {
        width: 36, height: 4, borderRadius: 2,
        backgroundColor: colors.slate200,
        alignSelf: 'center', marginBottom: 16,
    },
    sheetTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginBottom: 16 },
    sheetIcon: { width: 48, height: 48, borderRadius: 10, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
    sheetTopText: { flex: 1 },
    sheetTitle:   { fontSize: 15, fontWeight: '800', color: colors.slate900, lineHeight: 22, marginBottom: 2 },
    sheetDate:    { fontSize: 11, color: colors.slate400, fontWeight: '600' },
    closeBtn:     { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
    sheetMessage: { fontSize: 14, color: colors.slate700, lineHeight: 22, marginBottom: 16 },

    // Détails
    detailsCard:  { backgroundColor: colors.slate50, borderRadius: 10, padding: 14, gap: 10, marginBottom: 20 },
    detailsLabel: { fontSize: 11, fontWeight: '900', color: colors.slate400, letterSpacing: 2, marginBottom: 2 },
    detailRow:    { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
    detailKey:    { fontSize: 12, fontWeight: '600', color: colors.slate500, flex: 1 },
    detailValue:  { fontSize: 12, fontWeight: '700', color: colors.slate800, flex: 1, textAlign: 'right' },

    // Boutons actions
    sheetActions: { flexDirection: 'row', gap: 10 },
    btnVoir: {
        flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
        backgroundColor: colors.primary, borderRadius: 10, paddingVertical: 14, gap: 6,
    },
    btnVoirTxt:   { fontSize: 13, fontWeight: '900', color: colors.white, letterSpacing: 1 },
    btnFermer: {
        alignItems: 'center', justifyContent: 'center',
        backgroundColor: colors.slate100, borderRadius: 10, paddingVertical: 14, paddingHorizontal: 20,
    },
    btnFermerTxt: { fontSize: 13, fontWeight: '700', color: colors.slate600 },
});
