// Client Socket.io — Jùlaba
// Singleton : une seule connexion partagée dans toute l'app
import { io, Socket } from 'socket.io-client';

const SOCKET_URL = process.env.EXPO_PUBLIC_SOCKET_URL || 'https://inclusion-marchand.onrender.com';

// ── Registre d'événements (remplace EventEmitter pour compatibilité RN) ──────
type EventCallback = (data: any) => void;
const registry: Record<string, Set<EventCallback>> = {};

const dispatch = (event: string, data: any) => {
    registry[event]?.forEach(cb => cb(data));
};

/** S'abonner à un événement socket — retourne la fonction de nettoyage */
export const onSocketEvent = (event: string, cb: EventCallback): (() => void) => {
    if (!registry[event]) registry[event] = new Set();
    registry[event].add(cb);
    return () => { registry[event]?.delete(cb); };
};

// ── État de la connexion ──────────────────────────────────────────────────────
let socket: Socket | null = null;
let _userId:  string | null = null;
let _storeId: string | null = null;
let _name:    string | null = null;
let _role:    string | null = null;

const joinRooms = () => {
    if (socket?.connected && _userId) {
        socket.emit('user-connect', { userId: _userId, storeId: _storeId, name: _name, role: _role });
    }
};

// ── Tous les événements métier à proxifier vers le registre ──────────────────
const BUSINESS_EVENTS = [
    'connected',
    // Ventes / Stock
    'nouvelle-vente',
    'stock-update',
    // Enrôlement
    'nouvel-enrolement',
    'enrolement-valide',
    'enrolement-rejete',
    // Marché
    'nouveau-produit-marche',
    'produit-modifie',
    'produit-supprime',
    // Commandes
    'nouvelle-commande',
    'commande-acceptee',
    'commande-refusee',
    // Livraisons
    'livraison-en-cours',
    'livraison-terminee',
    // Dettes / Carnet
    'dette-encaissee',
    // Achats groupés
    'achat-groupe-cree',
    'achat-groupe-rejoint',
    'achat-groupe-finalise',
    // Négociation prix groupé
    'demande-prix-groupe',
    'prix-groupe-propose',
    'prix-groupe-accepte',
    // Coopérative
    'cooperative-inconnue',
    // Conformité & Stats
    'signalement-conformite',
    'stats-reseau-update',
    // Notifications
    'nouvelle-notification',
    // Activité admin
    'nouvelle-activite',
] as const;

export type SocketEvent = typeof BUSINESS_EVENTS[number];

const attachListeners = (s: Socket) => {
    s.on('connect', () => {
        console.log('[Socket] Connecté :', s.id);
        joinRooms();
    });

    s.on('connect_error', (err) => {
        console.warn('[Socket] Erreur connexion :', err.message);
    });

    s.on('disconnect', (reason) => {
        console.log('[Socket] Déconnecté :', reason);
    });

    s.on('reconnect', () => {
        console.log('[Socket] Reconnecté');
        joinRooms();
    });

    // Proxifier tous les événements métier vers le registre React
    BUSINESS_EVENTS.forEach(event => {
        s.on(event, (data) => dispatch(event, data));
    });
};

/** Connexion initiale au serveur (appelé au login) */
export const connectSocket = (userId: string, name?: string, role?: string): void => {
    _userId = userId;
    _name   = name || null;
    _role   = role || null;

    if (socket?.connected) {
        joinRooms();
        return;
    }

    if (socket) {
        socket.removeAllListeners();
        socket.disconnect();
    }

    socket = io(SOCKET_URL, {
        transports: ['websocket', 'polling'],
        reconnection: true,
        reconnectionAttempts: Infinity,
        reconnectionDelay: 2000,
        reconnectionDelayMax: 10000,
        timeout: 10000,
    });

    attachListeners(socket);
};

/** Mettre à jour la room boutique quand le profil actif change */
export const updateSocketStore = (storeId: string, storeName?: string): void => {
    _storeId = storeId;
    if (_name === null && storeName) _name = storeName;
    joinRooms();
};

/** Mettre à jour le rôle (et rejoindre la room de rôle) */
export const updateSocketRole = (role: string): void => {
    _role = role;
    if (socket?.connected) {
        socket.emit('join-role', { role });
    }
};

/** Déconnexion propre (appelé au logout) */
export const disconnectSocket = (): void => {
    if (socket) {
        socket.emit('user-disconnect');
        socket.removeAllListeners();
        socket.disconnect();
        socket = null;
    }
    _userId  = null;
    _storeId = null;
    _name    = null;
    _role    = null;
    // Vider le registre pour éviter les fuites mémoire et callbacks stales
    Object.keys(registry).forEach(key => delete registry[key]);
    console.log('[Socket] Déconnexion propre');
};

/** Émettre un événement vers le serveur */
export const emitEvent = (event: string, data: unknown): void => {
    if (socket?.connected) {
        socket.emit(event, data);
    } else {
        console.warn('[Socket] Non connecté — événement ignoré :', event);
    }
};

export const getSocket  = (): Socket | null => socket;
export const isConnected = (): boolean => socket?.connected ?? false;
