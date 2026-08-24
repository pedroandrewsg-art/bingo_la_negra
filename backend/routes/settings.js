// routes/settings.js — Configuración global clave/valor (ej. link del grupo
// de WhatsApp, logo del sitio), editable por el admin desde "Configuración".
const express = require('express');
const path = require('path');
const multer = require('multer');
const db = require('../db');
const { requireAuth, requireAdmin } = require('../authMiddleware');
const { r2, BUCKET, PutObjectCommand, DeleteObjectCommand } = require('../r2');
const WHATSAPP_LIVE_DEFAULTS = require('../whatsappLiveDefaults');
const WHATSAPP_LIVE_KEYS = Object.keys(WHATSAPP_LIVE_DEFAULTS);
const DEFAULT_LOGIN_SUBTITLE = '75 bolillas · en tiempo real';

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 3 * 1024 * 1024 }, // 3MB
  fileFilter: (req, file, cb) => {
    if (!/^image\/(png|jpe?g|webp|gif)$/.test(file.mimetype)) return cb(new Error('El logo debe ser una imagen (png, jpg, webp o gif)'));
    cb(null, true);
  },
});

function getSetting(key) {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
  return row ? row.value : '';
}
function setSetting(key, value) {
  const info = db.prepare('UPDATE settings SET value = ? WHERE key = ?').run(value, key);
  if (!info.changes) db.prepare('INSERT INTO settings (key, value) VALUES (?, ?)').run(key, value);
}

// Config pública (sin login): la pantalla de acceso necesita el logo antes
// de que el jugador/admin se identifique.
router.get('/public', (req, res) => {
  res.json({
    logoUrl: getSetting('logo_path') || '',
    loginSubtitle: getSetting('login_subtitle') || DEFAULT_LOGIN_SUBTITLE,
    bloqueoCartonesPendientes: getSetting('bloqueo_cartones_pendientes') === '1',
  });
});

// Bloqueo visual de cartones sin pago verificado: mientras está activo, la
// consulta pública ("Consulta tu Carta") muestra el cartón "vendido"
// (comprado pero sin que el admin confirme el pago) borroso con un candado
// encima, en vez del cartón legible de siempre. No afecta paneles de admin
// ni cartones ya "pagado" (ver MiniCard en el frontend).
router.put('/bloqueo-cartones', requireAuth, requireAdmin, (req, res) => {
  const activo = !!req.body.activo;
  setSetting('bloqueo_cartones_pendientes', activo ? '1' : '0');
  res.json({ ok: true, activo });
});

router.get('/whatsapp', requireAuth, (req, res) => {
  res.json({ link: getSetting('whatsapp_link') });
});

router.put('/whatsapp', requireAuth, requireAdmin, (req, res) => {
  const link = (req.body.link || '').trim();
  if (!link) return res.status(400).json({ error: 'Ponle un link al grupo de WhatsApp' });
  setSetting('whatsapp_link', link);
  res.json({ ok: true, link });
});

// Mensaje configurable debajo del logo en la pantalla de acceso (con
// animación en el frontend). Vacío es válido: cae al default al leerlo.
router.put('/login-subtitle', requireAuth, requireAdmin, (req, res) => {
  const mensaje = typeof req.body.mensaje === 'string' ? req.body.mensaje.trim() : '';
  setSetting('login_subtitle', mensaje);
  res.json({ ok: true, mensaje: mensaje || DEFAULT_LOGIN_SUBTITLE });
});

// Textos/emoji configurables del módulo "WhatsApp Live" (encabezado/pie de
// Disponibles y Pendientes, emoji de Pagado). A diferencia del link de
// WhatsApp de arriba, acá un valor vacío es válido (un admin puede decidir
// no tener pie de página), así que solo se valida el tipo. Nota: sin
// `|| DEFAULT` a propósito — db.js ya siembra estas 5 claves al arrancar (así
// que la fila siempre existe), y como '' también es falsy en JS, un
// `|| DEFAULT` acá repondría el default cada vez que un admin lo borra
// intencionalmente (ver WHATSAPP_LIVE_DEFAULTS solo como valor de siembra, no
// como respaldo de lectura).
router.get('/whatsapp-live', requireAuth, (req, res) => {
  const out = {};
  WHATSAPP_LIVE_KEYS.forEach((k) => { out[k] = getSetting(k); });
  res.json(out);
});

router.put('/whatsapp-live', requireAuth, requireAdmin, (req, res) => {
  for (const k of WHATSAPP_LIVE_KEYS) {
    if (req.body[k] !== undefined && typeof req.body[k] !== 'string') {
      return res.status(400).json({ error: `"${k}" debe ser texto` });
    }
  }
  WHATSAPP_LIVE_KEYS.forEach((k) => { if (req.body[k] !== undefined) setSetting(k, req.body[k]); });
  const out = {};
  WHATSAPP_LIVE_KEYS.forEach((k) => { out[k] = getSetting(k); });
  res.json({ ok: true, ...out });
});

router.post('/logo', requireAuth, requireAdmin, (req, res) => {
  upload.single('logo')(req, res, async (err) => {
    if (err) return res.status(400).json({ error: err.message });
    if (!req.file) return res.status(400).json({ error: 'Selecciona una imagen para el logo' });

    try {
      const filename = `logo-${Date.now()}${path.extname(req.file.originalname).toLowerCase()}`;
      const key = `logo/${filename}`;

      await r2.send(new PutObjectCommand({
        Bucket: BUCKET,
        Key: key,
        Body: req.file.buffer,
        ContentType: req.file.mimetype,
      }));

      const anterior = getSetting('logo_path');
      const logoUrl = `/uploads/logo/${filename}`;
      setSetting('logo_path', logoUrl);

      if (anterior && anterior !== logoUrl) {
        const anteriorKey = anterior.replace(/^\/uploads\//, '');
        r2.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: anteriorKey })).catch(() => {}); // best-effort
      }
      res.json({ ok: true, logoUrl });
    } catch (e) {
      console.error('Error subiendo el logo a R2:', e);
      res.status(500).json({ error: 'No se pudo guardar el logo' });
    }
  });
});

module.exports = router;
