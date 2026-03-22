// Serveur Socket.io — Jùlaba Mobile
// Système realtime complet : 5 rôles, 15+ événements métier
const express = require('express');
const http    = require('http');
const { Server } = require('socket.io');
const cors    = require('cors');

const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN;
if (!ALLOWED_ORIGIN) { console.warn('⚠️ ALLOWED_ORIGIN non défini — CORS restrictif activé'); }
const EMIT_SECRET = process.env.EMIT_SECRET;
if (!EMIT_SECRET) { console.error('❌ EMIT_SECRET manquant — set process.env.EMIT_SECRET'); process.exit(1); }

const app = express();
app.use(cors({ origin: ALLOWED_ORIGIN || false }));
app.use(express.json());

const server = http.createServer(app);

const io = new Server(server, {
    cors: { origin: ALLOWED_ORIGIN || false, methods: ['GET', 'POST'] },
    pingTimeout: 30000,
    pingInterval: 10000,
});

// Registre des clients : socketId → { userId, storeId, name, role }
const clients = new Map();

// Rate limiter : max 100 connexions/minute par IP
const rateLimit = {};
io.use((socket, next) => {
    const ip = socket.handshake.address;
    if (!rateLimit[ip]) rateLimit[ip] = { count: 0, lastReset: Date.now() };
    if (Date.now() - rateLimit[ip].lastReset > 60000) {
        rateLimit[ip] = { count: 0, lastReset: Date.now() };
    }
    rateLimit[ip].count++;
    if (rateLimit[ip].count > 100) {
        return next(new Error('Rate limit exceeded'));
    }
    next();
});

const isDev = process.env.NODE_ENV !== 'production';
const log = (msg) => { if (isDev) console.log(`[${new Date().toLocaleTimeString('fr-FR')}] ${msg}`); };

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

    // ── Rate limit par event : max 30 events/10s par type d'event ────────────
    const eventLimits = {};
    socket.use(([event, ...args], next) => {
        const now = Date.now();
        if (!eventLimits[event]) eventLimits[event] = { count: 0, reset: now + 10000 };
        if (now > eventLimits[event].reset) {
            eventLimits[event] = { count: 0, reset: now + 10000 };
        }
        eventLimits[event].count++;
        if (eventLimits[event].count > 30) {
            return next(new Error(`Rate limit dépassé : ${event}`));
        }
        next();
    });

    // ── 1. Enregistrement utilisateur + rooms ──────────────────────────────────
    socket.on('user-connect', (data) => {
        const { userId, storeId, name, role } = data || {};
        if (!userId) return;
        // TODO: vérifier userId et role contre Supabase pour empêcher l'usurpation

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
        const { agentId, agentName, marchandId, marchandName, secteur, type, adresse, cooperativeId } = data || {};
        log(`👤 Enrôlement — Agent: ${agentName}, Marchand: ${marchandName} (${secteur})`);
        const payload = { agentId, agentName, marchandId, marchandName, secteur, type, adresse, cooperativeId, timestamp: Date.now() };
        // Notifier la coopérative ciblée ou toutes les coopératives
        if (cooperativeId) io.to(cooperativeId).emit('nouvel-enrolement', payload);
        else               io.to('cooperative').emit('nouvel-enrolement', payload);
        io.to('admin').emit('nouvel-enrolement', payload);
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
        const { sellerStoreId, sellerId, sellerName, buyerStoreId, buyerName, productName, quantity, totalPrice, orderId } = data || {};
        log(`🛒 Commande — ${buyerName} : ${quantity}× ${productName} → ${sellerStoreId}`);
        const cmdPayload = { buyerStoreId, buyerName, sellerName, productName, quantity, totalPrice, orderId, timestamp: Date.now() };
        if (sellerStoreId) io.to(sellerStoreId).emit('nouvelle-commande', cmdPayload);
        if (sellerId)      io.to(sellerId).emit('nouvelle-commande',      cmdPayload);
        io.to('cooperative').emit('nouvelle-commande', cmdPayload);
        io.to('admin').emit('nouvelle-commande', { sellerStoreId, ...cmdPayload });
    });

    // ── 10. Commande acceptée (Producteur → Marchand) ─────────────────────────
    socket.on('commande-acceptee', (data) => {
        const { buyerStoreId, buyerId, productName, quantity, orderId, estimatedDelivery, producerName } = data || {};
        log(`✅ Commande acceptée — ${productName} × ${quantity} → ${buyerStoreId}`);
        const accPayload = { productName, quantity, orderId, estimatedDelivery, producerName, timestamp: Date.now() };
        if (buyerStoreId) io.to(buyerStoreId).emit('commande-acceptee', accPayload);
        if (buyerId)      io.to(buyerId).emit('commande-acceptee',      accPayload);
    });

    // ── 11. Commande refusée (Producteur → Marchand) ──────────────────────────
    socket.on('commande-refusee', (data) => {
        const { buyerStoreId, buyerId, productName, quantity, orderId, reason, producerName } = data || {};
        log(`❌ Commande refusée — ${productName} × ${quantity} → ${buyerStoreId}`);
        const refPayload = { productName, quantity, orderId, reason, producerName, timestamp: Date.now() };
        if (buyerStoreId) io.to(buyerStoreId).emit('commande-refusee', refPayload);
        if (buyerId)      io.to(buyerId).emit('commande-refusee',      refPayload);
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
        const { groupId, joinerId, joinerName, productName, contribution, ownerId, producteurId, totalParticipants } = data || {};
        log(`➕ Achat groupé rejoint — ${joinerName} → groupe ${groupId}`);
        const joinPayload = { groupId, joinerId, joinerName, productName, contribution, totalParticipants, timestamp: Date.now() };
        if (ownerId)      io.to(ownerId).emit('achat-groupe-rejoint',     joinPayload);
        if (producteurId) io.to(producteurId).emit('achat-groupe-rejoint', joinPayload);
        io.to('cooperative').emit('achat-groupe-rejoint', joinPayload);
        io.to('admin').emit('achat-groupe-rejoint', { groupId, joinerId, joinerName });
    });

    // ── 15b. Demande de prix groupé (Coopérative → Producteur) ───────────────
    socket.on('demande-prix-groupe', (data) => {
        const { achatGroupeId, producteurId, nomProduit, qtyCible, qtyMin, dateLimite, messageCoop, cooperativeNom, cooperativeId } = data || {};
        log(`📋 Demande prix groupé — ${cooperativeNom} : ${nomProduit} × ${qtyCible}`);
        if (producteurId) io.to(producteurId).emit('demande-prix-groupe', { achatGroupeId, nomProduit, qtyCible, qtyMin, dateLimite, messageCoop, cooperativeNom, cooperativeId, timestamp: Date.now() });
        io.to('admin').emit('demande-prix-groupe', { achatGroupeId, nomProduit, qtyCible, cooperativeNom });
    });

    // ── 15c. Prix proposé par le producteur (Producteur → Coopérative) ────────
    socket.on('prix-groupe-propose', (data) => {
        const { achatGroupeId, cooperativeId, nomProduit, prixPropose, producteurNom } = data || {};
        log(`💬 Prix groupé proposé — ${producteurNom} : ${nomProduit} à ${prixPropose} F`);
        if (cooperativeId) io.to(cooperativeId).emit('prix-groupe-propose', { achatGroupeId, nomProduit, prixPropose, producteurNom, timestamp: Date.now() });
        io.to('admin').emit('prix-groupe-propose', { achatGroupeId, nomProduit, prixPropose, producteurNom });
    });

    // ── 15d. Prix accepté par la coopérative (Coopérative → Producteur + Marchands) ──
    socket.on('prix-groupe-accepte', (data) => {
        const { achatGroupeId, producteurId, nomProduit, prixNegocie, cooperativeNom } = data || {};
        log(`✅ Prix groupé accepté — ${nomProduit} à ${prixNegocie} F`);
        if (producteurId) io.to(producteurId).emit('prix-groupe-accepte', { achatGroupeId, nomProduit, prixNegocie, cooperativeNom, timestamp: Date.now() });
        io.to('marchands').emit('achat-groupe-cree', { achatGroupeId, nomProduit, prixNegocie, cooperativeNom, timestamp: Date.now() });
        io.to('admin').emit('prix-groupe-accepte', { achatGroupeId, nomProduit, prixNegocie });
    });

    // ── 15e. Coopérative non listée (Agent → Admin) ───────────────────────────
    socket.on('cooperative-inconnue', (data) => {
        const { agentId, agentName, marchandName, cooperativeNomSaisi } = data || {};
        log(`⚠️  Coopérative inconnue — Agent: ${agentName}, coopérative: "${cooperativeNomSaisi}"`);
        io.to('admin').emit('cooperative-inconnue', { agentId, agentName, marchandName, cooperativeNomSaisi, timestamp: Date.now() });
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

    // ── 18. Log d'activité (tous rôles → Admin) ──────────────────────────────
    socket.on('nouvelle-activite', (data) => {
        const { user_name, action, type, created_at } = data || {};
        if (!action) return;
        const typeEmoji = {
            vente:       '💰',
            publication: '🌾',
            enrolement:  '👤',
            commande:    '🛒',
            livraison:   '🚚',
            signalement: '⚠️',
            sanction:    '🚫',
        }[type] ?? '📋';
        log(`${typeEmoji} Activité [${type}] — ${user_name} : ${action}`);
        io.to('admin').emit('nouvelle-activite', { user_name, action, type, created_at: created_at || new Date().toISOString() });
        io.to('superviseurs').emit('nouvelle-activite', { user_name, action, type, created_at: created_at || new Date().toISOString() });
    });

    // ── 19. Notification ciblée ───────────────────────────────────────────────
    socket.on('nouvelle-notification', (data) => {
        const { targetId, notification } = data || {};
        if (!notification) return;
        log(`🔔 Notif → ${targetId} : "${notification.title}"`);
        if (targetId === 'ALL')    socket.broadcast.emit('nouvelle-notification', { notification });
        else if (targetId)         io.to(targetId).emit('nouvelle-notification', { notification });
    });

    // ── Monitoring erreurs temps réel (app → terminal) ────────────────────────
    socket.on('app-error', (report) => {
        const emoji = report.severity === 'critical' ? '🔴' : report.severity === 'major' ? '🟡' : '🟢';
        const time  = new Date(report.timestamp).toLocaleTimeString('fr-FR');

        console.log('\n════════════════════════════════════════');
        console.log(`${emoji} ERREUR ${(report.severity || '?').toUpperCase()} — ${time}`);
        console.log(`📱 ${report.platform || '?'} | 👤 ${report.role || '?'} | 📍 ${report.screen || '?'}`);
        console.log(`💬 [${report.type}] ${report.message}`);
        if (report.extra && Object.keys(report.extra).length > 0) {
            console.log('📋 Détails:', JSON.stringify(report.extra, null, 2));
        }
        if (report.stack) {
            console.log('📚 Stack:', report.stack.split('\n').slice(0, 5).join('\n'));
        }
        console.log('════════════════════════════════════════\n');

        // Stocker dans error-log.txt
        const fs = require('fs');
        const logLine = `${time} | ${emoji} ${report.severity} | ${report.type} | ${report.screen || '-'} | ${report.message}\n`;
        try { fs.appendFileSync('error-log.txt', logLine); } catch (_) { /* ignorer si dossier inaccessible */ }
    });

    // ── 20. Achat groupé finalisé (Coopérative → Marchands + Admin) ──────────
    socket.on('achat-groupe-finalise', (data) => {
        log(`✅ Achat groupé finalisé`);
        if (data.cooperativeId) io.to(data.cooperativeId).emit('achat-groupe-finalise', data);
        io.to('marchands').emit('achat-groupe-finalise', data);
        io.to('admin').emit('achat-groupe-finalise', data);
    });

    // ── 21. Dette encaissée (Marchand → Admin) ─────────────────────────────
    socket.on('dette-encaissee', (data) => {
        log(`💰 Dette encaissée`);
        if (data.storeId) io.to(data.storeId).emit('dette-encaissee', data);
        io.to('admin').emit('dette-encaissee', data);
    });

    // ── 22. Produit modifié (Producteur → Marchands + Admin) ────────────────
    socket.on('produit-modifie', (data) => {
        log(`✏️  Produit modifié`);
        io.to('marchands').emit('produit-modifie', data);
        io.to('admin').emit('produit-modifie', data);
    });

    // ── 23. Produit supprimé (Producteur → Marchands + Admin) ───────────────
    socket.on('produit-supprime', (data) => {
        log(`🗑️  Produit supprimé`);
        io.to('marchands').emit('produit-supprime', data);
        io.to('admin').emit('produit-supprime', data);
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
    });
});

// ── Notification externe (ex: Supabase webhook) ──────────────────────────────
app.post('/notify', (req, res) => {
    const authHeader = req.headers['authorization'];
    if (authHeader !== `Bearer ${EMIT_SECRET}`) {
        return res.status(401).json({ error: 'Non autorisé' });
    }
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
    const token = req.headers['x-emit-token'];
    if (token !== EMIT_SECRET) return res.status(403).json({ error: 'Non autorisé' });
    const { event, room, data } = req.body;
    if (!event) return res.status(400).json({ error: 'event requis' });

    if (room) io.to(room).emit(event, data || {});
    else      io.emit(event, data || {});

    log(`📮 POST /emit → "${event}" vers "${room || 'ALL'}"`);
    res.json({ success: true, event, room });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, '0.0.0.0', () => {
    log('\n╔══════════════════════════════════════╗');
    log('║  Jùlaba — Serveur Realtime ║');
    log('╠══════════════════════════════════════╣');
    log(`║  Port    : ${PORT}                         ║`);
    log(`║  Health  : http://localhost:${PORT}/health  ║`);
    log(`║  Notify  : POST /notify                ║`);
    log(`║  Emit    : POST /emit                  ║`);
    log('╚══════════════════════════════════════╝\n');
    log('Événements supportés:');
    log('  • nouvelle-vente, stock-update');
    log('  • nouvel-enrolement, enrolement-valide/rejete');
    log('  • nouveau-produit-marche');
    log('  • nouvelle-commande, commande-acceptee/refusee');
    log('  • livraison-en-cours, livraison-terminee');
    log('  • achat-groupe-cree, achat-groupe-rejoint');
    log('  • demande-prix-groupe, prix-groupe-propose, prix-groupe-accepte');
    log('  • signalement-conformite, stats-reseau-update');
    log('  • achat-groupe-finalise, dette-encaissee');
    log('  • produit-modifie, produit-supprime');
    log('  • nouvelle-activite → admin room (realtime feed)');
    log('  • nouvelle-notification');
    log('  • app-error → monitoring erreurs temps réel\n');
});
