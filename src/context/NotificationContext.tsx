// Contexte notifications — rôle-specific, Supabase persistant + cache offline unifié
import React, { createContext, useContext, useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { supabase } from '@/src/lib/supabase';
import { useAuth } from './AuthContext';
import { onSocketEvent } from '@/src/lib/socket';
import { useNetwork } from './NetworkContext';
import { offlineCache, CACHE_KEYS, CACHE_TTL } from '@/src/lib/offlineCache';

// ── Types ──────────────────────────────────────────────────────────────────────
export interface Notification {
    id: string;
    user_id: string | null;
    titre: string;
    message: string;
    type: string;              // commande | livraison | enrolement | signalement | marche | achat_groupe | commande_refusee
    route: string;             // où naviguer au clic
    data: Record<string, any>; // détails bruts (nom produit, quantité, noms des personnes…)
    lu: boolean;
    created_at: number;        // timestamp ms
}

interface NotifPayload {
    titre: string;
    message: string;
    type: string;
    route: string;
    data: Record<string, any>;
}

interface NotificationContextType {
    notifications: Notification[];
    unreadCount: number;
    markAsRead: (id: string) => Promise<void>;
    deleteNotification: (id: string) => Promise<void>;
    refreshNotifications: () => Promise<void>;
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

export const NotificationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const { user } = useAuth();
    const { isOnline } = useNetwork();
    const [notifications, setNotifications] = useState<Notification[]>([]);
    const isFetchingRef = useRef(false);
    const lastFetched = useRef<number>(0);

    // ── Chargement : cache d'abord, puis Supabase si online ─────────────────
    const loadFromStorage = useCallback(async (force = false) => {
        if (isFetchingRef.current) return;
        if (!force && lastFetched.current && Date.now() - lastFetched.current < 60000) return;
        isFetchingRef.current = true;
        try {
            const cacheKey = user?.id ? CACHE_KEYS.notifications(user.id) : null;

            // 1. Cache d'abord (instantané)
            if (cacheKey) {
                const cached = await offlineCache.get<Notification[]>(cacheKey);
                if (cached) setNotifications(cached.data);
            }

            // 2. Puis réseau si online
            if (isOnline && user?.id) {
                try {
                    const { data } = await supabase
                        .from('notifications')
                        .select('id, user_id, titre, message, type, data, lu, created_at')
                        .eq('user_id', user.id)
                        .order('created_at', { ascending: false })
                        .limit(50);

                    if (data?.length) {
                        const mapped: Notification[] = data.map(n => ({
                            id:         n.id,
                            user_id:    n.user_id,
                            titre:      n.titre ?? '',
                            message:    n.message ?? '',
                            type:       n.type ?? 'marche',
                            route:      (n.data as any)?.route ?? '/',
                            data:       (n.data as Record<string, any>) ?? {},
                            lu:         n.lu ?? false,
                            created_at: new Date(n.created_at).getTime(),
                        }));
                        setNotifications(mapped);
                        if (cacheKey) await offlineCache.set(cacheKey, mapped, CACHE_TTL.OPTIONAL);
                    }
                } catch { /* réseau indisponible */ }
            }
        } finally {
            isFetchingRef.current = false;
            lastFetched.current = Date.now();
        }
    }, [user?.id, isOnline]);

    useEffect(() => { loadFromStorage(); }, [loadFromStorage]);

    // ── Handlers socket par rôle ──────────────────────────────────────────────
    useEffect(() => {
        if (!user) return;

        // Crée une notification locale + INSERT Supabase
        const addNotif = async (payload: NotifPayload) => {
            const newNotif: Notification = {
                ...payload,
                id:         Math.random().toString(36).substr(2, 9),
                user_id:    user.id,
                lu:         false,
                created_at: Date.now(),
            };

            try {
                const { data } = await supabase
                    .from('notifications')
                    .insert([{
                        user_id: user.id,
                        titre:   payload.titre,
                        message: payload.message,
                        type:    payload.type,
                        data:    { ...payload.data, route: payload.route },
                        lu:      false,
                    }])
                    .select('id, created_at')
                    .single();
                if (data?.id) {
                    newNotif.id = data.id;
                    newNotif.created_at = new Date(data.created_at).getTime();
                }
            } catch { /* offline — ID local conservé */ }

            setNotifications(prev => {
                const updated = [newNotif, ...prev];
                if (user?.id) offlineCache.set(CACHE_KEYS.notifications(user.id), updated, CACHE_TTL.OPTIONAL);
                return updated;
            });
        };

        const role       = user.role;
        const isMerchant = role === 'MERCHANT';
        const isProducer = role === 'PRODUCER';
        const isAgent    = role === 'FIELD_AGENT';
        const isCoop     = role === 'COOPERATIVE';
        const isAdmin    = role === 'SUPERVISOR';

        const unsubs: (() => void)[] = [];

        // ── MARCHAND ─────────────────────────────────────────────────────────
        if (isMerchant) {
            // Commande acceptée par le producteur
            unsubs.push(onSocketEvent('commande-acceptee', (d: any) => {
                if (d.buyerUserId && d.buyerUserId !== user.id) return;
                const producteur = d.producerName ?? 'Le producteur';
                const delai = d.estimatedDelivery ? ` sous ${d.estimatedDelivery}` : '';
                addNotif({
                    titre:   `${producteur} a accepté votre commande`,
                    message: `${d.quantity ?? ''} ${d.productName ?? 'produit'}${delai ? ' seront livrés' + delai : ''}.`,
                    type:    'commande',
                    route:   '/(tabs)/marche',
                    data:    { produit_nom: d.productName, quantite: d.quantity, producteur, delai: d.estimatedDelivery, commande_id: d.orderId },
                });
            }));

            // Commande refusée par le producteur
            unsubs.push(onSocketEvent('commande-refusee', (d: any) => {
                if (d.buyerUserId && d.buyerUserId !== user.id) return;
                const producteur = d.producerName ?? 'Le producteur';
                const raison = d.reason ? `. Raison : ${d.reason}` : '';
                addNotif({
                    titre:   'Commande refusée',
                    message: `${producteur} a refusé votre commande de ${d.productName ?? 'produit'}${raison}.`,
                    type:    'commande_refusee',
                    route:   '/(tabs)/marche',
                    data:    { produit_nom: d.productName, quantite: d.quantity, producteur, raison: d.reason, commande_id: d.orderId },
                });
            }));

            // Livraison en route
            unsubs.push(onSocketEvent('livraison-en-cours', (d: any) => {
                if (d.buyerUserId && d.buyerUserId !== user.id) return;
                addNotif({
                    titre:   'Livraison en route',
                    message: `Votre commande de ${d.quantity ?? ''} ${d.productName ?? 'produit'} est en route${d.driverName ? ` avec ${d.driverName}` : ''}.`,
                    type:    'livraison',
                    route:   '/(tabs)/marche',
                    data:    { produit_nom: d.productName, quantite: d.quantity, livreur: d.driverName, commande_id: d.orderId },
                });
            }));

            // Livraison terminée → stock mis à jour
            unsubs.push(onSocketEvent('livraison-terminee', (d: any) => {
                if (d.buyerUserId && d.buyerUserId !== user.id) return;
                addNotif({
                    titre:   'Livraison reçue ✓',
                    message: `${d.quantity ?? ''} ${d.productName ?? 'produit'} ajoutés à votre stock.`,
                    type:    'livraison',
                    route:   '/(tabs)/stock',
                    data:    { produit_nom: d.productName, quantite: d.quantity, commande_id: d.orderId },
                });
            }));

            // Nouveau produit sur le marché
            unsubs.push(onSocketEvent('nouveau-produit-marche', (d: any) => {
                const prix = (d.price ?? 0).toLocaleString('fr-FR');
                addNotif({
                    titre:   'Nouveau produit disponible',
                    message: `${d.producerName ?? 'Un producteur'} vend ${d.productName ?? 'un produit'} à ${prix} F.`,
                    type:    'marche',
                    route:   '/(tabs)/marche',
                    data:    { produit_nom: d.productName, prix: d.price, producteur: d.producerName },
                });
            }));

            // Achat groupé ouvert (après acceptation du prix par la coop)
            unsubs.push(onSocketEvent('achat-groupe-cree', (d: any) => {
                const prix = (d.prixNegocie ?? d.pricePerUnit ?? 0).toLocaleString('fr-FR');
                const date = d.deadline ? ` avant le ${new Date(d.deadline).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })}` : '';
                addNotif({
                    titre:   'Achat groupé ouvert',
                    message: `${d.nomProduit ?? d.productName ?? 'Produit'} à ${prix} F — rejoignez${date}.`,
                    type:    'achat_groupe',
                    route:   '/(tabs)/marche',
                    data:    { produit_nom: d.nomProduit ?? d.productName, prix: d.prixNegocie ?? d.pricePerUnit, date_limite: d.deadline },
                });
            }));
        }

        // ── PRODUCTEUR ───────────────────────────────────────────────────────
        if (isProducer) {
            // Nouvelle commande d'un marchand
            unsubs.push(onSocketEvent('nouvelle-commande', (d: any) => {
                if (d.sellerUserId && d.sellerUserId !== user.id) return;
                const total = (d.totalPrice ?? 0).toLocaleString('fr-FR');
                addNotif({
                    titre:   'Nouvelle commande',
                    message: `${d.buyerName ?? 'Un marchand'} veut ${d.quantity ?? ''} ${d.productName ?? 'produit'} pour ${total} F.`,
                    type:    'commande',
                    route:   '/producteur/commandes',
                    data:    { produit_nom: d.productName, quantite: d.quantity, prix: d.totalPrice, marchand: d.buyerName, commande_id: d.orderId },
                });
            }));

            // Demande de prix groupé de la coopérative
            unsubs.push(onSocketEvent('demande-prix-groupe', (d: any) => {
                if (d.producteurId && d.producteurId !== user.id) return;
                addNotif({
                    titre:   'Demande de prix groupé',
                    message: `La coopérative ${d.cooperativeNom ?? ''} demande un prix pour ${d.qtyCible ?? ''} ${d.nomProduit ?? 'produit'}.`,
                    type:    'achat_groupe',
                    route:   '/producteur/commandes',
                    data:    { produit_nom: d.nomProduit, quantite: d.qtyCible, cooperative: d.cooperativeNom, message_coop: d.messageCoop, achat_groupe_id: d.achatGroupeId },
                });
            }));

            // Prix groupé accepté par la coopérative
            unsubs.push(onSocketEvent('prix-groupe-accepte', (d: any) => {
                if (d.producteurId && d.producteurId !== user.id) return;
                const prix = (d.prixNegocie ?? 0).toLocaleString('fr-FR');
                addNotif({
                    titre:   'Prix groupé accepté ✓',
                    message: `Votre prix de ${prix} F pour ${d.nomProduit ?? 'produit'} a été accepté. Les marchands peuvent commander.`,
                    type:    'achat_groupe',
                    route:   '/producteur/commandes',
                    data:    { produit_nom: d.nomProduit, prix: d.prixNegocie, cooperative: d.cooperativeNom, achat_groupe_id: d.achatGroupeId },
                });
            }));

            // Nouveau participant à l'achat groupé
            unsubs.push(onSocketEvent('achat-groupe-rejoint', (d: any) => {
                const nb = d.totalParticipants ? `. Total : ${d.totalParticipants} participants` : '';
                addNotif({
                    titre:   'Nouveau participant',
                    message: `${d.joinerName ?? 'Un marchand'} a rejoint l'achat groupé de ${d.productName ?? 'produit'}${nb}.`,
                    type:    'achat_groupe',
                    route:   '/producteur/commandes',
                    data:    { produit_nom: d.productName, marchand: d.joinerName, quantite: d.contribution, total_participants: d.totalParticipants },
                });
            }));
        }

        // ── AGENT ─────────────────────────────────────────────────────────────
        if (isAgent) {
            // Enrôlement validé par la coopérative
            unsubs.push(onSocketEvent('enrolement-valide', (d: any) => {
                if (d.agentId && d.agentId !== user.id) return;
                const type = d.type === 'MERCHANT' ? 'Marchand' : d.type === 'PRODUCER' ? 'Producteur' : d.type ?? '';
                const coop = d.cooperativeName ? ` par la coopérative ${d.cooperativeName}` : '';
                addNotif({
                    titre:   'Inscription validée ✓',
                    message: `${d.marchandName ?? 'Votre membre'}${type ? ` (${type})` : ''} a été validé${coop}.`,
                    type:    'enrolement',
                    route:   '/agent/activites',
                    data:    { nom: d.marchandName, type: d.type, cooperative: d.cooperativeName },
                });
            }));

            // Enrôlement rejeté
            unsubs.push(onSocketEvent('enrolement-rejete', (d: any) => {
                if (d.agentId && d.agentId !== user.id) return;
                const motif = d.reason ? `. Motif : ${d.reason}` : '';
                addNotif({
                    titre:   'Inscription refusée',
                    message: `${d.marchandName ?? 'Votre membre'} a été refusé${motif}. Veuillez corriger et soumettre à nouveau.`,
                    type:    'signalement',
                    route:   '/agent/activites',
                    data:    { nom: d.marchandName, motif: d.reason },
                });
            }));
        }

        // ── COOPÉRATIVE ───────────────────────────────────────────────────────
        if (isCoop) {
            // Nouveau membre à vérifier — l'agent a inscrit quelqu'un
            unsubs.push(onSocketEvent('nouvel-enrolement', (d: any) => {
                if (d.cooperativeId && d.cooperativeId !== user.id) return;
                const typeLabel = d.type === 'MERCHANT' ? 'Marchand' : d.type === 'PRODUCER' ? 'Producteur' : d.type ?? '';
                addNotif({
                    titre:   'Nouveau membre à vérifier',
                    message: `L'agent ${d.agentName ?? ''} a inscrit ${d.marchandName ?? 'un membre'}${typeLabel ? ` (${typeLabel})` : ''}. Vérifiez que cette personne est bien un de vos membres.`,
                    type:    'enrolement',
                    route:   '/cooperative/demandes',
                    data:    { nom: d.marchandName, agent: d.agentName, type: d.type, adresse: d.adresse },
                });
            }));

            // Commande B2B dans le réseau
            unsubs.push(onSocketEvent('nouvelle-commande', (d: any) => {
                const total = (d.totalPrice ?? 0).toLocaleString('fr-FR');
                addNotif({
                    titre:   'Commande B2B dans le réseau',
                    message: `${d.buyerName ?? 'Marchand'} → ${d.sellerName ?? 'Producteur'} : ${d.quantity ?? ''} ${d.productName ?? 'produit'} pour ${total} F.`,
                    type:    'commande',
                    route:   '/cooperative/achats',
                    data:    { produit_nom: d.productName, quantite: d.quantity, prix: d.totalPrice, marchand: d.buyerName, producteur: d.sellerName, commande_id: d.orderId },
                });
            }));

            // Prix groupé proposé par le producteur
            unsubs.push(onSocketEvent('prix-groupe-propose', (d: any) => {
                if (d.cooperativeId && d.cooperativeId !== user.id) return;
                const prix = (d.prixPropose ?? 0).toLocaleString('fr-FR');
                addNotif({
                    titre:   'Prix groupé reçu',
                    message: `${d.producteurNom ?? 'Le producteur'} propose ${prix} F pour ${d.nomProduit ?? 'produit'}. Accepter ou renégocier ?`,
                    type:    'achat_groupe',
                    route:   '/cooperative/achats',
                    data:    { produit_nom: d.nomProduit, prix: d.prixPropose, producteur: d.producteurNom, achat_groupe_id: d.achatGroupeId },
                });
            }));

            // Signalement de conformité
            unsubs.push(onSocketEvent('signalement-conformite', (d: any) => {
                addNotif({
                    titre:   'Nouveau signalement',
                    message: `Agent ${d.agentName ?? ''} signale ${d.marchandName ?? 'un membre'} : ${d.description ?? d.type ?? ''}.`,
                    type:    'signalement',
                    route:   '/cooperative/membres',
                    data:    { agent: d.agentName, membre: d.marchandName, motif: d.description ?? d.type },
                });
            }));

            // Nouveau participant achat groupé
            unsubs.push(onSocketEvent('achat-groupe-rejoint', (d: any) => {
                const nb = d.totalParticipants ? `${d.totalParticipants}/${d.contribution ?? '?'}` : '';
                addNotif({
                    titre:   'Participation achat groupé',
                    message: `${d.joinerName ?? 'Un marchand'} a rejoint l'achat groupé de ${d.productName ?? 'produit'}${nb ? `. ${nb} participants` : ''}.`,
                    type:    'achat_groupe',
                    route:   '/cooperative/achats',
                    data:    { produit_nom: d.productName, marchand: d.joinerName, total_participants: d.totalParticipants },
                });
            }));
        }

        // ── ADMIN (SUPERVISOR) ────────────────────────────────────────────────
        if (isAdmin) {
            // Vente enregistrée
            unsubs.push(onSocketEvent('nouvelle-vente', (d: any) => {
                const total = (d.transaction?.price ?? 0).toLocaleString('fr-FR');
                addNotif({
                    titre:   'Vente enregistrée',
                    message: `${d.storeName ?? 'Un marchand'} a vendu pour ${total} F.`,
                    type:    'vente',
                    route:   '/admin/transactions',
                    data:    { marchand: d.storeName, produit_nom: d.transaction?.productName, prix: d.transaction?.price },
                });
            }));

            // Nouvel enrôlement
            unsubs.push(onSocketEvent('nouvel-enrolement', (d: any) => {
                const typeLabel = d.type === 'MERCHANT' ? 'Marchand' : d.type === 'PRODUCER' ? 'Producteur' : d.type ?? '';
                addNotif({
                    titre:   "Nouvelle demande d'inscription",
                    message: `Agent ${d.agentName ?? ''} a inscrit ${d.marchandName ?? 'un membre'}${typeLabel ? ` (${typeLabel})` : ''}.`,
                    type:    'enrolement',
                    route:   '/admin/utilisateurs',
                    data:    { nom: d.marchandName, agent: d.agentName, type: d.type },
                });
            }));

            // Commande B2B
            unsubs.push(onSocketEvent('nouvelle-commande', (d: any) => {
                const total = (d.totalPrice ?? 0).toLocaleString('fr-FR');
                addNotif({
                    titre:   'Commande B2B dans le réseau',
                    message: `${d.buyerName ?? 'Marchand'} → ${d.sellerName ?? 'Producteur'} : ${d.quantity ?? ''} ${d.productName ?? 'produit'} pour ${total} F.`,
                    type:    'commande',
                    route:   '/admin/commandes',
                    data:    { produit_nom: d.productName, quantite: d.quantity, prix: d.totalPrice, marchand: d.buyerName, producteur: d.sellerName, commande_id: d.orderId },
                });
            }));

            // Signalement
            unsubs.push(onSocketEvent('signalement-conformite', (d: any) => {
                addNotif({
                    titre:   'Nouveau signalement',
                    message: `Agent ${d.agentName ?? ''} signale ${d.marchandName ?? 'un membre'} : ${d.description ?? d.type ?? ''}.`,
                    type:    'signalement',
                    route:   '/admin/signalements',
                    data:    { agent: d.agentName, membre: d.marchandName, motif: d.description ?? d.type },
                });
            }));

            // Coopérative non listée
            unsubs.push(onSocketEvent('cooperative-inconnue', (d: any) => {
                addNotif({
                    titre:   'Coopérative non listée',
                    message: `Agent ${d.agentName ?? ''} a inscrit ${d.marchandName ?? 'un membre'} avec une coopérative inconnue : ${d.cooperativeNomSaisi ?? ''}. À traiter.`,
                    type:    'signalement',
                    route:   '/admin/utilisateurs',
                    data:    { agent: d.agentName, membre: d.marchandName, cooperative_saisie: d.cooperativeNomSaisi },
                });
            }));
        }

        return () => unsubs.forEach(fn => fn());
    }, [user?.id, user?.role]);

    // ── Actions ───────────────────────────────────────────────────────────────
    const updateAndCache = useCallback((updater: (prev: Notification[]) => Notification[]) => {
        let updatedCopy: Notification[] | null = null;
        setNotifications(prev => {
            const updated = updater(prev);
            updatedCopy = updated;
            return updated;
        });
        // Cache en dehors du setState updater (pas de side-effect dans un updater)
        if (user?.id && updatedCopy) {
            offlineCache.set(CACHE_KEYS.notifications(user.id), updatedCopy, CACHE_TTL.OPTIONAL).catch(() => {});
        }
    }, [user?.id]);

    const markAsRead = useCallback(async (id: string) => {
        updateAndCache(prev => prev.map(n => n.id === id ? { ...n, lu: true } : n));
        try {
            await supabase.from('notifications').update({ lu: true }).eq('id', id);
        } catch (err) {
            console.error('[Notifications] markAsRead sync error:', err);
        }
    }, [updateAndCache]);

    const deleteNotification = useCallback(async (id: string) => {
        updateAndCache(prev => prev.filter(n => n.id !== id));
        try {
            await supabase.from('notifications').delete().eq('id', id);
        } catch (err) {
            console.error('[Notifications] deleteNotification sync error:', err);
        }
    }, [updateAndCache]);

    const unreadCount = useMemo(() => notifications.filter(n => !n.lu).length, [notifications]);

    const contextValue = useMemo(() => ({
        notifications,
        unreadCount,
        markAsRead,
        deleteNotification,
        refreshNotifications: loadFromStorage,
    }), [notifications, unreadCount, markAsRead, deleteNotification, loadFromStorage]);

    return (
        <NotificationContext.Provider value={contextValue}>
            {children}
        </NotificationContext.Provider>
    );
};

const EMPTY_CONTEXT: NotificationContextType = {
    notifications: [],
    unreadCount: 0,
    markAsRead: async () => {},
    deleteNotification: async () => {},
    refreshNotifications: async () => {},
};

export const useNotifications = () => {
    const context = useContext(NotificationContext);
    // Ne jamais throw — retourner un contexte vide si le provider n'est pas monte
    return context ?? EMPTY_CONTEXT;
};
