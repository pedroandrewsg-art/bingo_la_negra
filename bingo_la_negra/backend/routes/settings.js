// routes/settings.js — Configuración global clave/valor (ej. link del grupo
// de WhatsApp, logo del sitio), editable por el admin desde "Configuración".
const express = require('express');
const path = require('path');
const multer = require('multer');
const db = require('../db');
const { requireAuth, requireAdmin } = require('../authMiddleware');
const { r2, BUCKET, PutObjectCommand, DeleteObjectCommand } = require('../r2');

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
  res.json({ logoUrl: getSetting('logo_path') || '' });
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
