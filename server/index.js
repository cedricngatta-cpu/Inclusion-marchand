// Serveur Socket.io — Inclusion Marchand Mobile
// Système realtime complet : 5 rôles, 15+ événements métier
const express = require('express');
const http    = require('http');
const { Server } = require('socket.io');
const cors    = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);

const io = new Server(server, {
    cors: { origin: '*', methods: ['GET', 'POST'] },
    pingTimeout: 30000,
    pingInterval: 10000,
});

// Registre des clients : socketId → { userId, storeId, name, role }
const clients = new Map();

const log = (msg) => console.log(`[${new Date().toLocaleTimeString('fr-FR')}] ${msg}`);

// ── Rooms par rôle ──
const ROLE_ROOMS = {
    MERCHANT:    'marchands',
    PRODUCER:    'producteurs',
    FIELD_AGENT: 'agents',
    COOPERATIVE: 'cooperative',
    SUPERVISOR:  'admin',
};

io.on('connection', (socket) => {
    log(`Nouveau client : ${socket.id}`);

    // ── 1. Enregistrement utilisateur + rooms ──────────────────────────────────
    socket.on('user-connect', (data) => {
        const { userId, storeId, name, role } = data || {};
        if (!userId) return;

        clients.set(socket.id, { userId, storeId, name, role });

        socket.join(userId);
        if (storeId) socket.join(storeId);

        // Room de rôle
        const roleRoom = ROLE_ROOMS[role];
        if (roleRoom) socket.join(roleRoom);

        // Admin aussi dans "superviseurs" pour compatibilité
        if (role === 'SUPERVISOR') socket.join('superviseurs');

        log(`✓ ${name || userId} [${role || '?'}] → rooms [${userId}${storeId ? ', '+storeId : ''}${roleRoom ? ', '+roleRoom : ''}]`);
        socket.emit('connected', { status: 'ok', userId, storeId, role });
    });

    // ── 2. Rejoindre une room de rôle explicitement ────────────────────────────
    socket.on('join-role', (data) => {
        const { role } = data || {};
        const room = ROLE_ROOMS[role];
        if (room) {
            socket.join(room);
            log(`→ ${socket.id} rejoint room "${room}"`);
        }
    });

    // ── 3. Vente (Marchand) ───────────────────────────────────────────────────
    socket.on('nouvelle-vente', (data) => {
        const { storeId, storeName, transaction } = data || {};
        if (!storeId || !transaction) return;
        log(`💰 Vente — ${storeName} : ${transaction.productName} × ${transaction.quantity}`);
        socket.to(storeId).emit('nouvelle-vente', { transaction, storeName });
        io.to('admin').emit('nouvelle-vente', { storeId, storeName, transaction });
        io.to('superviseurs').emit('nouvelle-vente', { storeId, storeName, transaction });
    });

    // ── 4. Stock update (Marchand/Producteur) ─────────────────────────────────
    socket.on('stock-update', (data) => {
        const { storeId, productId, productName, newQty } = data || {};
        if (!storeId || !productId) return;
        log(`📦 Stock — ${productName} → ${newQty} unités`);
        socket.to(storeId).emit('stock-update', { productId, productName, newQty });
    });

    // ── 5. Enrôlement demandé (Agent → Coopérative) ──────────────────────────
    socket.on('nouvel-enrolement', (data) => {
        const { agentId, agentName, marchandId, marchandName, secteur } = data || {};
        log(`👤 Enrôlement — Agent: ${agentName}, Marchand: ${marchandName} (${secteur})`);
        // Notifier toute la coopérative
        io.to('cooperative').emit('nouvel-enrolement', { agentId, agentName, marchandId, marchandName, secteur, timestamp: Date.now() });
        // Notifier l'admin
        io.to('admin').emit('nouvel-enrolement', { agentId, agentName, marchandId, marchandName, secteur, timestamp: Date.now() });
    });

    // ── 6. Enrôlement validé (Coopérative → Agent + Marchand) ────────────────
    socket.on('enrolement-valide', (data) => {
        const { agentId, marchandId, marchandName, cooperativeName, demandId } = data || {};
        log(`✅ Enrôlement validé — Marchand: ${marchandName}`);
        if (agentId)   io.to(agentId).emit('enrolement-valide',   { marchandId, marchandName, cooperativeName, demandId });
        if (marchandId) io.to(marchandId).emit('enrolement-valide', { cooperativeName, demandId });
        io.to('admin').emit('enrolement-valide', { agentId, marchandId, marchandName, cooperativeName, demandId });
    });

    // ── 7. Enrôlement rejeté (Coopérative → Agent) ───────────────────────────
    socket.on('enrolement-rejete', (data) => {
        const { agentId, marchandId, marchandName, reason, demandId } = data || {};
        log(`❌ Enrôlement rejeté — Marchand: ${marchandName}, raison: ${reason}`);
        if (agentId) io.to(agentId).emit('enrolement-rejete', { marchandId, marchandName, reason, demandId });
    });

    // ── 8. Nouveau produit sur le marché (Producteur → Marchands) ────────────
    socket.on('nouveau-produit-marche', (data) => {
        const { productId, productName, price, quantity, unit, producerName, storeId } = data || {};
        log(`🌾 Nouveau produit — ${productName} par ${producerName}`);
        io.to('marchands').emit('nouveau-produit-marche', { productId, productName, price, quantity, unit, producerName, storeId, timestamp: Date.now() });
        io.to('admin').emit('nouveau-produit-marche',     { productId, productName, price, quantity, unit, producerName, storeId, timestamp: Date.now() });
    });

    // ── 9. Nouvelle commande (Marchand → Producteur) ──────────────────────────
    socket.on('nouvelle-commande', (data) => {
        const { sellerStoreId, sellerId, buyerStoreId, buyerName, productName, quantity, totalPrice, orderId } = data || {};
        log(`🛒 Commande — ${buyerName} : ${quantity}× ${productName} → ${sellerStoreId}`);
        if (sellerStoreId) io.to(sellerStoreId).emit('nouvelle-commande', { buyerStoreId, buyerName, productName, quantity, totalPrice, orderId, timestamp: Date.now() });
        if (sellerId)      io.to(sellerId).emit('nouvelle-commande',      { buyerStoreId, buyerName, productName, quantity, totalPrice, orderId, timestamp: Date.now() });
        io.to('admin').emit('nouvelle-commande', { sellerStoreId, buyerStoreId, buyerName, productName, quantity, totalPrice, orderId });
    });

    // ── 10. Commande acceptée (Producteur → Marchand) ─────────────────────────
    socket.on('commande-acceptee', (data) => {
        const { buyerStoreId, buyerId, productName, quantity, orderId, estimatedDelivery } = data || {};
        log(`✅ Commande acceptée — ${productName} × ${quantity} → ${buyerStoreId}`);
        if (buyerStoreId) io.to(buyerStoreId).emit('commande-acceptee', { productName, quantity, orderId, estimatedDelivery, timestamp: Date.now() });
        if (buyerId)      io.to(buyerId).emit('commande-acceptee',      { productName, quantity, orderId, estimatedDelivery, timestamp: Date.now() });
    });

    // ── 11. Commande refusée (Producteur → Marchand) ──────────────────────────
    socket.on('commande-refusee', (data) => {
        const { buyerStoreId, buyerId, productName, quantity, orderId, reason } = data || {};
        log(`❌ Commande refusée — ${productName} × ${quantity} → ${buyerStoreId}`);
        if (buyerStoreId) io.to(buyerStoreId).emit('commande-refusee', { productName, quantity, orderId, reason, timestamp: Date.now() });
        if (buyerId)      io.to(buyerId).emit('commande-refusee',      { productName, quantity, orderId, reason, timestamp: Date.now() });
    });

    // ── 12. Livraison en cours (Producteur → Marchand) ────────────────────────
    socket.on('livraison-en-cours', (data) => {
        const { buyerStoreId, buyerId, productName, quantity, orderId, driverName } = data || {};
        log(`🚚 Livraison en cours — ${productName} → ${buyerStoreId}`);
        if (buyerStoreId) io.to(buyerStoreId).emit('livraison-en-cours', { productName, quantity, orderId, driverName, timestamp: Date.now() });
        if (buyerId)      io.to(buyerId).emit('livraison-en-cours',      { productName, quantity, orderId, driverName, timestamp: Date.now() });
        io.to('admin').emit('livraison-en-cours', { buyerStoreId, productName, quantity, orderId });
    });

    // ── 13. Livraison terminée (Producteur → Marchand + Admin) ───────────────
    socket.on('livraison-terminee', (data) => {
        const { buyerStoreId, buyerId, sellerStoreId, productName, quantity, orderId, totalPrice } = data || {};
        log(`✅ Livraison terminée — ${productName} × ${quantity} livré à ${buyerStoreId}`);
        if (buyerStoreId)  io.to(buyerStoreId).emit('livraison-terminee',  { productName, quantity, orderId, totalPrice, timestamp: Date.now() });
        if (buyerId)       io.to(buyerId).emit('livraison-terminee',       { productName, quantity, orderId, totalPrice, timestamp: Date.now() });
        if (sellerStoreId) io.to(sellerStoreId).emit('livraison-terminee', { productName, quantity, orderId, totalPrice, timestamp: Date.now() });
        io.to('admin').emit('livraison-terminee', { buyerStoreId, sellerStoreId, productName, quantity, orderId, totalPrice });
    });

    // ── 14. Achat groupé créé (Marchand → Marchands) ─────────────────────────
    socket.on('achat-groupe-cree', (data) => {
        const { groupId, creatorName, productName, targetQty, currentQty, pricePerUnit, deadline } = data || {};
        log(`👥 Achat groupé — ${creatorName} : ${productName} (${currentQty}/${targetQty})`);
        io.to('marchands').emit('achat-groupe-cree', { groupId, creatorName, productName, targetQty, currentQty, pricePerUnit, deadline, timestamp: Date.now() });
        io.to('admin').emit('achat-groupe-cree', { groupId, creatorName, productName, targetQty, currentQty });
    });

    // ── 15. Rejoindre achat groupé (Marchand → Créateur) ─────────────────────
    socket.on('achat-groupe-rejoint', (data) => {
        const { groupId, joinerId, joinerName, productName, contribution, ownerId } = data || {};
        log(`➕ Achat groupé rejoint — ${joinerName} → groupe ${groupId}`);
        if (ownerId) io.to(ownerId).emit('achat-groupe-rejoint', { groupId, joinerId, joinerName, productName, contribution, timestamp: Date.now() });
        io.to('marchands').emit('achat-groupe-rejoint', { groupId, joinerName, productName, contribution, timestamp: Date.now() });
        io.to('admin').emit('achat-groupe-rejoint', { groupId, joinerId, joinerName });
    });

    // ── 16. Signalement de conformité (Agent → Coopérative + Admin) ──────────
    socket.on('signalement-conformite', (data) => {
        const { agentId, agentName, marchandId, marchandName, type, description, severity } = data || {};
        log(`⚠️  Signalement — Agent: ${agentName}, Marchand: ${marchandName}, Sévérité: ${severity}`);
        io.to('cooperative').emit('signalement-conformite', { agentId, agentName, marchandId, marchandName, type, description, severity, timestamp: Date.now() });
        io.to('admin').emit('signalement-conformite',       { agentId, agentName, marchandId, marchandName, type, description, severity, timestamp: Date.now() });
    });

    // ── 17. Mise à jour stats réseau (Admin → tous) ───────────────────────────
    socket.on('stats-reseau-update', (data) => {
        const { totalMerchants, totalTransactions, totalRevenue } = data || {};
        log(`📊 Stats réseau — ${totalMerchants} marchands, ${totalTransactions} transactions`);
        io.emit('stats-reseau-update', { totalMerchants, totalTransactions, totalRevenue, timestamp: Date.now() });
    });

    // ── 18. Notification ciblée ───────────────────────────────────────────────
    socket.on('nouvelle-notification', (data) => {
        const { targetId, notification } = data || {};
        if (!notification) return;
        log(`🔔 Notif → ${targetId} : "${notification.title}"`);
        if (targetId === 'ALL')    socket.broadcast.emit('nouvelle-notification', { notification });
        else if (targetId)         io.to(targetId).emit('nouvelle-notification', { notification });
    });

    // ── Déconnexion ───────────────────────────────────────────────────────────
    socket.on('user-disconnect', () => {
        const c = clients.get(socket.id);
        if (c) log(`← ${c.name || c.userId} déconnecté proprement`);
        clients.delete(socket.id);
    });

    socket.on('disconnect', (reason) => {
        const c = clients.get(socket.id);
        if (c) log(`← ${c.name || c.userId} déconnecté (${reason})`);
        clients.delete(socket.id);
    });
});

// ── Route santé ──────────────────────────────────────────────────────────────
app.get('/health', (req, res) => {
    const byRole = {};
    for (const c of clients.values()) {
        const role = c.role || 'unknown';
        byRole[role] = (byRole[role] || 0) + 1;
    }
    res.json({
        status: 'ok',
        connected: clients.size,
        byRole,
        uptime: Math.floor(process.uptime()) + 's',
        clients: Array.from(clients.values()).map(c => ({ name: c.name || c.userId, role: c.role, storeId: c.storeId })),
    });
});

// ── Notification externe (ex: Supabase webhook) ──────────────────────────────
app.post('/notify', (req, res) => {
    const { targetId, title, message, type } = req.body;
    if (!targetId || !title) return res.status(400).json({ error: 'targetId et title requis' });

    const notification = {
        id: Math.random().toString(36).substr(2, 9),
        target_id: targetId,
        title,
        message: message || '',
        type: type || 'INFO',
        is_read: false,
        created_at: Date.now(),
    };

    if (targetId === 'ALL') io.emit('nouvelle-notification', { notification });
    else                    io.to(targetId).emit('nouvelle-notification', { notification });

    log(`📮 POST /notify → ${targetId} : "${title}"`);
    res.json({ success: true, notification });
});

// ── Émettre un événement métier depuis l'extérieur ───────────────────────────
app.post('/emit', (req, res) => {
    const { event, room, data } = req.body;
    if (!event) return res.status(400).json({ error: 'event requis' });

    if (room) io.to(room).emit(event, data || {});
    else      io.emit(event, data || {});

    log(`📮 POST /emit → "${event}" vers "${room || 'ALL'}"`);
    res.json({ success: true, event, room });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, '0.0.0.0', () => {
    console.log('\n╔══════════════════════════════════════╗');
    console.log('║  Inclusion Marchand — Serveur Realtime ║');
    console.log('╠══════════════════════════════════════╣');
    console.log(`║  Port    : ${PORT}                         ║`);
    console.log(`║  Health  : http://localhost:${PORT}/health  ║`);
    console.log(`║  Notify  : POST /notify                ║`);
    console.log(`║  Emit    : POST /emit                  ║`);
    console.log('╚══════════════════════════════════════╝\n');
    console.log('Événements supportés:');
    console.log('  • nouvelle-vente, stock-update');
    console.log('  • nouvel-enrolement, enrolement-valide/rejete');
    console.log('  • nouveau-produit-marche');
    console.log('  • nouvelle-commande, commande-acceptee/refusee');
    console.log('  • livraison-en-cours, livraison-terminee');
    console.log('  • achat-groupe-cree, achat-groupe-rejoint');
    console.log('  • signalement-conformite, stats-reseau-update');
    console.log('  • nouvelle-notification\n');
});
