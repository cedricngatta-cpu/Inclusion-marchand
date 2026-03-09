// Contexte notifications — migré depuis Next.js
// localStorage → AsyncStorage, window.addEventListener → supprimé (pas de cross-tab sur mobile)
import React, { createContext, useContext, useState, useEffect } from 'react';
import { storage } from '@/src/lib/storage';
import { useAuth } from './AuthContext';
import { onSocketEvent } from '@/src/lib/socket';

export interface Notification {
    id: string;
    target_id: string;
    title: string;
    message: string;
    type: 'INFO' | 'WARNING' | 'ALERT';
    is_read: boolean;
    created_at: number;
}

interface NotificationContextType {
    notifications: Notification[];
    unreadCount: number;
    sendNotification: (notification: Omit<Notification, 'id' | 'created_at' | 'is_read'>) => Promise<void>;
    markAsRead: (id: string) => Promise<void>;
    deleteNotification: (id: string) => Promise<void>;
    refreshNotifications: () => Promise<void>;
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

export const NotificationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const { user } = useAuth();
    const [notifications, setNotifications] = useState<Notification[]>([]);

    const loadFromStorage = async () => {
        const saved = await storage.getItem('app_notifications');
        if (saved) setNotifications(JSON.parse(saved));
    };

    useEffect(() => { loadFromStorage(); }, []);

    // Ajouter une notification locale depuis un événement socket
    const addSocketNotif = (notif: Omit<Notification, 'id' | 'created_at' | 'is_read'>) => {
        const newNotif: Notification = {
            ...notif,
            id: Math.random().toString(36).substr(2, 9),
            is_read: false,
            created_at: Date.now(),
        };
        setNotifications(prev => {
            const updated = [newNotif, ...prev];
            storage.setItem('app_notifications', JSON.stringify(updated));
            return updated;
        });
    };

    // Écouter les notifications socket en temps réel
    useEffect(() => {
        const unsubs = [
            onSocketEvent('nouvelle-notification', ({ notification }) => {
                if (!notification) return;
                setNotifications(prev => {
                    if (prev.some(n => n.id === notification.id)) return prev;
                    const updated = [notification, ...prev];
                    storage.setItem('app_notifications', JSON.stringify(updated));
                    return updated;
                });
            }),
            onSocketEvent('nouveau-produit-marche', (data) => {
                addSocketNotif({
                    target_id: 'ALL',
                    title: 'Nouveau produit disponible',
                    message: `${data.producerName} vient de publier "${data.productName}" — ${data.price?.toLocaleString('fr-FR')} F`,
                    type: 'INFO',
                });
            }),
            onSocketEvent('commande-acceptee', (data) => {
                addSocketNotif({
                    target_id: user?.id ?? 'ALL',
                    title: 'Commande acceptée !',
                    message: `Votre commande de ${data.quantity}× ${data.productName} a été acceptée.`,
                    type: 'INFO',
                });
            }),
            onSocketEvent('commande-refusee', (data) => {
                addSocketNotif({
                    target_id: user?.id ?? 'ALL',
                    title: 'Commande refusée',
                    message: `Votre commande de ${data.quantity}× ${data.productName} a été refusée.`,
                    type: 'WARNING',
                });
            }),
            onSocketEvent('livraison-en-cours', (data) => {
                addSocketNotif({
                    target_id: user?.id ?? 'ALL',
                    title: 'Livraison en cours',
                    message: `Votre commande de ${data.productName} est en route !`,
                    type: 'INFO',
                });
            }),
            onSocketEvent('livraison-terminee', (data) => {
                addSocketNotif({
                    target_id: user?.id ?? 'ALL',
                    title: 'Livraison effectuée',
                    message: `${data.productName} × ${data.quantity} livré avec succès.`,
                    type: 'INFO',
                });
            }),
            onSocketEvent('enrolement-valide', (data) => {
                addSocketNotif({
                    target_id: user?.id ?? 'ALL',
                    title: 'Enrôlement validé',
                    message: `${data.marchandName} a été validé par ${data.cooperativeName ?? 'la coopérative'}.`,
                    type: 'INFO',
                });
            }),
            onSocketEvent('enrolement-rejete', (data) => {
                addSocketNotif({
                    target_id: user?.id ?? 'ALL',
                    title: 'Enrôlement rejeté',
                    message: `Le dossier de ${data.marchandName} a été rejeté.`,
                    type: 'WARNING',
                });
            }),
            onSocketEvent('signalement-conformite', (data) => {
                addSocketNotif({
                    target_id: user?.id ?? 'ALL',
                    title: 'Nouveau signalement',
                    message: `Agent ${data.agentName} : ${data.type} signalé sur ${data.marchandName}.`,
                    type: 'ALERT',
                });
            }),
            onSocketEvent('achat-groupe-cree', (data) => {
                addSocketNotif({
                    target_id: 'ALL',
                    title: 'Achat groupé ouvert',
                    message: `${data.creatorName} lance un achat groupé pour "${data.productName}".`,
                    type: 'INFO',
                });
            }),
        ];
        return () => unsubs.forEach(fn => fn());
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [user?.id]);

    const saveNotifications = async (newItems: Notification[]) => {
        setNotifications(newItems);
        await storage.setItem('app_notifications', JSON.stringify(newItems));
    };

    const sendNotification = async (data: Omit<Notification, 'id' | 'created_at' | 'is_read'>) => {
        const newNotif: Notification = {
            ...data,
            id: Math.random().toString(36).substr(2, 9),
            is_read: false,
            created_at: Date.now(),
        };
        await saveNotifications([newNotif, ...notifications]);
    };

    const markAsRead = async (id: string) => {
        await saveNotifications(notifications.map(n => n.id === id ? { ...n, is_read: true } : n));
    };

    const deleteNotification = async (id: string) => {
        await saveNotifications(notifications.filter(n => n.id !== id));
    };

    const relevantNotifications = user?.role === 'SUPERVISOR'
        ? notifications
        : notifications.filter(n => n.target_id === 'ALL' || n.target_id === user?.id);

    const unreadCount = relevantNotifications.filter(n => !n.is_read).length;

    return (
        <NotificationContext.Provider value={{
            notifications: relevantNotifications,
            unreadCount,
            sendNotification,
            markAsRead,
            deleteNotification,
            refreshNotifications: loadFromStorage,
        }}>
            {children}
        </NotificationContext.Provider>
    );
};

export const useNotifications = () => {
    const context = useContext(NotificationContext);
    if (!context) throw new Error('useNotifications must be used within a NotificationProvider');
    return context;
};
