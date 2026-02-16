require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' }
});

// --- Config ---
const PORT = process.env.PORT || 3000;
const API_TOKEN = process.env.API_TOKEN || 'dev-token-local';
const N8N_WEBHOOK_ACCEPT_URL = process.env.N8N_WEBHOOK_ACCEPT_URL || '';

// --- Middleware ---
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// --- Stockage en mémoire (MVP, pas de base de données) ---
const deals = new Map();

// --- Middleware d'authentification par token ---
function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || authHeader !== `Bearer ${API_TOKEN}`) {
    return res.status(401).json({ error: 'Token invalide ou manquant' });
  }
  next();
}

// --- ENDPOINTS ---

/**
 * POST /api/deal
 * Appelé par n8n quand un nouveau deal éligible est détecté.
 * Déclenche l'alerte en temps réel vers le frontend.
 */
app.post('/api/deal', authMiddleware, (req, res) => {
  const { dealId, canal, source, formation, telephone, hubspotUrl } = req.body;

  // Validation basique
  if (!dealId || !telephone) {
    return res.status(400).json({ error: 'dealId et telephone sont requis' });
  }

  // Stocker le deal (avec le téléphone, mais on ne l'envoie pas au frontend tout de suite)
  const deal = {
    dealId,
    canal: canal || 'Non renseigné',
    source: source || 'Non renseigné',
    formation: formation || 'Non renseigné',
    telephone,
    hubspotUrl: hubspotUrl || '',
    receivedAt: new Date().toISOString(),
    status: 'pending' // pending, accepted, skipped
  };

  deals.set(dealId, deal);

  // Émettre l'alerte vers le frontend (SANS le téléphone)
  io.emit('new-deal', {
    dealId: deal.dealId,
    canal: deal.canal,
    source: deal.source,
    formation: deal.formation,
    hubspotUrl: deal.hubspotUrl,
    receivedAt: deal.receivedAt
  });

  console.log(`[DEAL] Nouveau deal reçu: ${dealId} - ${formation} - ${canal}`);

  res.json({ success: true, message: 'Alerte envoyée' });
});

/**
 * POST /api/deal/:id/accept
 * Appelé par le frontend quand le commercial clique "J'appelle".
 * Retourne le téléphone et notifie n8n.
 */
app.post('/api/deal/:id/accept', async (req, res) => {
  const { id } = req.params;
  const deal = deals.get(id);

  if (!deal) {
    return res.status(404).json({ error: 'Deal non trouvé' });
  }

  if (deal.status !== 'pending') {
    return res.status(409).json({ error: 'Deal déjà traité' });
  }

  // Mettre à jour le statut
  deal.status = 'accepted';
  deal.acceptedAt = new Date().toISOString();

  console.log(`[ACCEPT] Deal accepté: ${id} à ${deal.acceptedAt}`);

  // Notifier n8n de manière asynchrone (on n'attend pas la réponse pour ne pas bloquer le commercial)
  if (N8N_WEBHOOK_ACCEPT_URL) {
    fetch(N8N_WEBHOOK_ACCEPT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        dealId: id,
        acceptedAt: deal.acceptedAt
      })
    }).then(() => {
      console.log(`[N8N] Webhook envoyé pour deal ${id}`);
    }).catch((err) => {
      console.error(`[N8N] Erreur webhook pour deal ${id}:`, err.message);
    });
  } else {
    console.log(`[N8N] Pas de webhook configuré (N8N_WEBHOOK_ACCEPT_URL vide)`);
  }

  // Retourner le téléphone au frontend
  res.json({
    success: true,
    telephone: deal.telephone,
    hubspotUrl: deal.hubspotUrl
  });
});

/**
 * POST /api/deal/:id/skip
 * Appelé par le frontend quand le commercial clique "Passer" ou que le timer expire.
 */
app.post('/api/deal/:id/skip', (req, res) => {
  const { id } = req.params;
  const { reason } = req.body; // "skip" ou "timeout"
  const deal = deals.get(id);

  if (!deal) {
    return res.status(404).json({ error: 'Deal non trouvé' });
  }

  if (deal.status !== 'pending') {
    return res.status(409).json({ error: 'Deal déjà traité' });
  }

  deal.status = 'skipped';
  deal.skippedAt = new Date().toISOString();
  deal.skipReason = reason || 'unknown';

  console.log(`[SKIP] Deal passé: ${id} - Raison: ${deal.skipReason}`);

  res.json({ success: true });
});

/**
 * GET /api/health
 * Endpoint de santé pour vérifier que l'app tourne.
 */
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    uptime: Math.floor(process.uptime()),
    dealsInMemory: deals.size
  });
});

/**
 * GET /api/test-deal
 * Endpoint de test : simule l'envoi d'un deal pour tester sans n8n.
 * À SUPPRIMER en production.
 */
app.get('/api/test-deal', (req, res) => {
  const testDeal = {
    dealId: 'test-' + Date.now(),
    canal: 'Facebook Ads',
    source: 'Créer son entreprise - Février 2026',
    formation: 'Création d\'entreprise',
    telephone: '06 12 34 56 78',
    hubspotUrl: 'https://app.hubspot.com/contacts/xxx/deal/test',
    receivedAt: new Date().toISOString(),
    status: 'pending'
  };

  deals.set(testDeal.dealId, testDeal);

  io.emit('new-deal', {
    dealId: testDeal.dealId,
    canal: testDeal.canal,
    source: testDeal.source,
    formation: testDeal.formation,
    hubspotUrl: testDeal.hubspotUrl,
    receivedAt: testDeal.receivedAt
  });

  console.log(`[TEST] Deal test envoyé: ${testDeal.dealId}`);

  res.json({ success: true, message: 'Deal test envoyé', dealId: testDeal.dealId });
});

// --- Socket.io ---
io.on('connection', (socket) => {
  console.log(`[SOCKET] Client connecté: ${socket.id}`);

  socket.on('disconnect', () => {
    console.log(`[SOCKET] Client déconnecté: ${socket.id}`);
  });
});

// --- Nettoyage périodique des vieux deals en mémoire (toutes les heures) ---
setInterval(() => {
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  let cleaned = 0;
  for (const [id, deal] of deals) {
    if (deal.receivedAt < oneHourAgo) {
      deals.delete(id);
      cleaned++;
    }
  }
  if (cleaned > 0) {
    console.log(`[CLEANUP] ${cleaned} vieux deals supprimés de la mémoire`);
  }
}, 60 * 60 * 1000);

// --- Démarrage ---
server.listen(PORT, () => {
  console.log(`
╔══════════════════════════════════════════════╗
║   🔥 Sonic Calling - LiveMentor MVP         ║
║   Serveur démarré sur le port ${PORT}            ║
║   http://localhost:${PORT}                      ║
╚══════════════════════════════════════════════╝
  `);
  if (!N8N_WEBHOOK_ACCEPT_URL) {
    console.log('⚠️  N8N_WEBHOOK_ACCEPT_URL non configuré — les acceptations ne seront pas envoyées à n8n');
  }
});
