// routes/jugadores.js — Listado admin de jugadores (sesiones temporales)
const express = require('express');
const db = require('../db');
const { requireAuth, requireAdmin } = require('../authMiddleware');

const router = express.Router();

function withStats(j) {
  const activos = db.prepare("SELECT COUNT(*) c FROM cartones WHERE owner_id = ? AND estado IN ('vendido','pagado')").get(j.id).c;
  const totalComprado = db
    .prepare("SELECT COALESCE(SUM(monto),0) s FROM ventas WHERE jugador_id = ? AND estatus='completado'")
    .get(j.id).s;
  return { ...j, cartones_activos: activos, total_comprado: totalComprado };
}

router.get('/', requireAuth, requireAdmin, (req, res) => {
  const { q } = req.query;
  let sql = 'SELECT * FROM jugadores WHERE 1=1';
  const params = [];
  if (q) {
    sql += ' AND (nombre LIKE ? OR whatsapp LIKE ?)';
    const like = `%${q}%`;
    params.push(like, like);
  }
  sql += ' ORDER BY id DESC';
  const rows = db.prepare(sql).all(...params);
  res.json({ jugadores: rows.map(withStats) });
});

router.delete('/:id', requireAuth, requireAdmin, (req, res) => {
  db.prepare('DELETE FROM jugadores WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

module.exports = router;
