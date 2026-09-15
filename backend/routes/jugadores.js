// routes/jugadores.js — Listado admin de jugadores (sesiones temporales)
const express = require('express');
const db = require('../db');
const { requireAuth, requireAdmin } = require('../authMiddleware');
const { registrarLog } = require('../logActividad');

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

// No se puede borrar un jugador que ya tiene cartones o historial real (compras,
// premios, tablero marcado): la base lo bloquea con una FK constraint (ventas/
// ganadores/tablero_marcas apuntan a jugadores sin CASCADE ni SET NULL, a
// propósito -- ese historial no debería poder desaparecer por accidente al
// borrar el registro de sesión de alguien). Antes esto tiraba un 500 crudo
// (SqliteError: FOREIGN KEY constraint failed) sin ningún aviso legible.
router.delete('/:id', requireAuth, requireAdmin, (req, res) => {
  const jugador = db.prepare('SELECT nombre FROM jugadores WHERE id = ?').get(req.params.id);
  if (!jugador) return res.status(404).json({ error: 'Jugador no encontrado' });
  const tieneActividad =
    db.prepare('SELECT 1 FROM cartones WHERE owner_id = ? LIMIT 1').get(req.params.id) ||
    db.prepare('SELECT 1 FROM ventas WHERE jugador_id = ? LIMIT 1').get(req.params.id) ||
    db.prepare('SELECT 1 FROM ganadores WHERE jugador_id = ? LIMIT 1').get(req.params.id) ||
    db.prepare('SELECT 1 FROM tablero_marcas WHERE jugador_id = ? LIMIT 1').get(req.params.id);
  if (tieneActividad) {
    return res.status(400).json({ error: 'No se puede eliminar: este jugador tiene cartones, compras o historial de premios. Solo se pueden eliminar jugadores sin actividad.' });
  }
  db.prepare('DELETE FROM jugadores WHERE id = ?').run(req.params.id);
  registrarLog(req, 'cartones', 'Eliminó un jugador', jugador.nombre);
  res.json({ ok: true });
});

module.exports = router;
