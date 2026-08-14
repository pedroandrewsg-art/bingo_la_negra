// routes/logs.js — Registro de actividad (auditoría). Ver logActividad.js
// para el helper que escribe acá desde el resto de las rutas.
const express = require('express');
const db = require('../db');
const { requireAuth, requireAdmin } = require('../authMiddleware');

const router = express.Router();

const CATEGORIAS = ['login', 'cartones', 'sorteos', 'ventas', 'usuarios', 'configuracion'];

router.get('/', requireAuth, requireAdmin, (req, res) => {
  const categoria = req.query.categoria;
  const limit = Math.min(Number(req.query.limit) || 300, 2000);

  const logs = categoria
    ? db.prepare('SELECT * FROM logs_actividad WHERE categoria = ? ORDER BY id DESC LIMIT ?').all(categoria, limit)
    : db.prepare('SELECT * FROM logs_actividad ORDER BY id DESC LIMIT ?').all(limit);

  // Los conteos son siempre sobre el total (no filtrado), para que los chips
  // no cambien de número según cuál esté activo.
  const conteos = Object.fromEntries(CATEGORIAS.map((c) => [c, 0]));
  db.prepare('SELECT categoria, COUNT(*) c FROM logs_actividad GROUP BY categoria').all().forEach((row) => {
    conteos[row.categoria] = row.c;
  });
  conteos.total = Object.values(conteos).reduce((a, b) => a + b, 0);

  res.json({ logs, conteos });
});

router.delete('/', requireAuth, requireAdmin, (req, res) => {
  const categoria = req.query.categoria;
  const info = categoria
    ? db.prepare('DELETE FROM logs_actividad WHERE categoria = ?').run(categoria)
    : db.prepare('DELETE FROM logs_actividad').run();
  res.json({ ok: true, eliminados: info.changes });
});

module.exports = router;
