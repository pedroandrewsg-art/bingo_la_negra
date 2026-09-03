// routes/push.js — Suscripción a notificaciones push (Web Push) del propio
// jugador logueado, para recibir el recordatorio de pago (ver
// backend/recordatorioPago.js) aunque tenga el navegador minimizado o haya
// cambiado de app. La clave pública VAPID es la única parte que necesita el
// frontend para armar la suscripción; las privadas nunca salen del backend.
const express = require('express');
const db = require('../db');
const { requireAuth } = require('../authMiddleware');

const router = express.Router();

router.get('/vapid-public-key', (req, res) => {
  res.json({ publicKey: process.env.VAPID_PUBLIC_KEY || '' });
});

// Alta o actualización: si el mismo endpoint (navegador/dispositivo) ya
// estaba suscripto (ej. el jugador cerró sesión y volvió a entrar con otro
// usuario en el mismo celular), se reasigna al jugador actual en vez de
// fallar por la restricción UNIQUE(endpoint).
router.post('/suscribir', requireAuth, (req, res) => {
  const { endpoint, keys } = req.body || {};
  if (!endpoint || !keys?.p256dh || !keys?.auth) {
    return res.status(400).json({ error: 'Suscripción inválida' });
  }
  db.prepare(
    `INSERT INTO push_subscripciones (jugador_id, endpoint, p256dh, auth) VALUES (?, ?, ?, ?)
     ON CONFLICT(endpoint) DO UPDATE SET jugador_id = excluded.jugador_id, p256dh = excluded.p256dh, auth = excluded.auth`
  ).run(req.user.id, endpoint, keys.p256dh, keys.auth);
  res.json({ ok: true });
});

router.delete('/suscribir', requireAuth, (req, res) => {
  const { endpoint } = req.body || {};
  if (endpoint) db.prepare('DELETE FROM push_subscripciones WHERE endpoint = ? AND jugador_id = ?').run(endpoint, req.user.id);
  res.json({ ok: true });
});

module.exports = router;
