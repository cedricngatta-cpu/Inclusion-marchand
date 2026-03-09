// Écran Notifications — migré depuis Next.js /notifications/page.tsx
import React, { useCallback } from 'react';
import { View, Text, ScrollView, StyleSheet, Pressable } from 'react-native';
import { Bell, Trash2, AlertTriangle, Info } from 'lucide-react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';
import { useNotifications } from '@/src/context/NotificationContext';
import { colors } from '@/src/lib/colors';

export default function NotificationsScreen() {
    const { notifications, unreadCount, markAsRead, deleteNotification, sendNotification, refreshNotifications } = useNotifications();

    useFocusEffect(useCallback(() => { refreshNotifications(); }, [refreshNotifications]));

    const getTypeStyle = (type: string) => {
        switch (type) {
            case 'ALERT': return { bg: '#fef2f2', icon: AlertTriangle, color: colors.error };
            case 'WARNING': return { bg: '#fffbeb', icon: AlertTriangle, color: '#d97706' };
            default: return { bg: '#eff6ff', icon: Info, color: '#2563eb' };
        }
    };

    const formatDate = (ts: number) =>
        new Date(ts).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

    const sendTest = () => sendNotification({
        target_id: 'ALL',
        title: 'Nouvelle commande reçue !',
        message: 'Un marchand a passé une commande de riz parfumé 25kg. Confirmez la livraison.',
        type: 'INFO',
    });

    return (
        <SafeAreaView style={styles.safe} edges={['top']}>
            <View style={styles.header}>
                <View>
                    <Text style={styles.headerTitle}>NOTIFICATIONS</Text>
                    {unreadCount > 0 && <Text style={styles.headerSub}>{unreadCount} non lue{unreadCount > 1 ? 's' : ''}</Text>}
                </View>
                <Pressable
                    style={({ pressed }) => [styles.demoBtn, pressed && { opacity: 0.8 }]}
                    onPress={sendTest}
                >
                    <Text style={styles.demoBtnText}>+ TEST</Text>
                </Pressable>
            </View>

            <ScrollView style={styles.list} contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 32 }}>
                {notifications.length === 0 ? (
                    <View style={styles.empty}>
                        <Bell color={colors.slate200} size={56} />
                        <Text style={styles.emptyTitle}>AUCUNE NOTIFICATION</Text>
                        <Text style={styles.emptyText}>Les alertes et messages apparaîtront ici</Text>
                    </View>
                ) : (
                    notifications.map(notif => {
                        const { bg, icon: Icon, color } = getTypeStyle(notif.type);
                        return (
                            <Pressable
                                key={notif.id}
                                style={({ pressed }) => [
                                    styles.notifCard,
                                    !notif.is_read && styles.notifCardUnread,
                                    pressed && styles.notifCardPressed,
                                ]}
                                onPress={() => markAsRead(notif.id)}
                            >
                                <View style={[styles.notifIcon, { backgroundColor: bg }]}>
                                    <Icon color={color} size={20} />
                                </View>
                                <View style={styles.notifContent}>
                                    <View style={styles.notifTitleRow}>
                                        <Text style={styles.notifTitle} numberOfLines={2}>{notif.title}</Text>
                                        {!notif.is_read && <View style={styles.unreadDot} />}
                                    </View>
                                    <Text style={styles.notifMessage} numberOfLines={3}>{notif.message}</Text>
                                    <Text style={styles.notifDate}>{formatDate(notif.created_at)}</Text>
                                </View>
                                <Pressable
                                    style={({ pressed }) => [styles.deleteBtn, pressed && { opacity: 0.6 }]}
                                    onPress={() => deleteNotification(notif.id)}
                                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                                >
                                    <Trash2 color={colors.slate300} size={16} />
                                </Pressable>
                            </Pressable>
                        );
                    })
                )}
            </ScrollView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.white },
    header: {
        flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
        paddingHorizontal: 20, paddingVertical: 16,
        borderBottomWidth: 1, borderBottomColor: colors.slate100,
    },
    headerTitle: { fontSize: 18, fontWeight: '900', color: colors.slate900, letterSpacing: -0.5 },
    headerSub: { fontSize: 11, color: colors.primary, fontWeight: '700', marginTop: 2 },
    demoBtn: { backgroundColor: colors.primary, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 6 },
    demoBtnText: { color: colors.white, fontSize: 11, fontWeight: '900', letterSpacing: 1 },

    list: { flex: 1, backgroundColor: colors.bgSecondary },
    empty: { alignItems: 'center', paddingTop: 80, gap: 12 },
    emptyTitle: { fontSize: 14, fontWeight: '900', color: colors.slate400, letterSpacing: 2 },
    emptyText: { fontSize: 13, color: colors.slate400, textAlign: 'center' },

    notifCard: {
        backgroundColor: colors.white,
        borderRadius: 10,
        padding: 16,
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: 12,
        borderTopWidth: 1,
        borderRightWidth: 1,
        borderBottomWidth: 1,
        borderLeftWidth: 1,
        borderColor: colors.slate100,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.04,
        shadowRadius: 4,
        elevation: 1,
    },
    notifCardUnread: {
        borderLeftWidth: 3,
        borderLeftColor: colors.primary,
    },
    notifCardPressed: {
        backgroundColor: colors.slate50,
    },
    notifIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
    notifContent: { flex: 1 },
    notifTitleRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginBottom: 4 },
    notifTitle: { fontSize: 14, fontWeight: '800', color: colors.slate900, flex: 1, lineHeight: 20 },
    unreadDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.primary, marginTop: 4, flexShrink: 0 },
    notifMessage: { fontSize: 13, color: colors.slate600, lineHeight: 19 },
    notifDate: { fontSize: 10, color: colors.slate400, marginTop: 6, fontWeight: '600' },
    deleteBtn: { padding: 4, flexShrink: 0 },
});
