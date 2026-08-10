// routes/ventas.js
const express = require('express');
const db = require('../db');
const { requireAuth, requireAdmin } = require('../authMiddleware');

const router = express.Router();

// ---------- KPIs ADMIN ----------
router.get('/kpis', requireAuth, requireAdmin, (req, res) => {
  const ventasMes = db
    .prepare(`SELECT COALESCE(SUM(monto),0) s FROM ventas WHERE estatus='completado' AND strftime('%Y-%m', fecha) = strftime('%Y-%m','now')`)
    .get().s;
  const sorteosMes = db.prepare(`SELECT id, porcentaje_ganancia FROM sorteos`).all();
  let gananciaMes = 0;
  const ventasPorSorteoMes = db
    .prepare(`SELECT sorteo_id, SUM(monto) monto FROM ventas WHERE estatus='completado' AND strftime('%Y-%m', fecha) = strftime('%Y-%m','now') GROUP BY sorteo_id`)
    .all();
  ventasPorSorteoMes.forEach((v) => {
    const s = sorteosMes.find((s) => s.id === v.sorteo_id);
    if (s) gananciaMes += v.monto * (s.porcentaje_ganancia / 100);
  });
  const historicoRecaudado = db.prepare(`SELECT COALESCE(SUM(monto),0) s FROM ventas WHERE estatus='completado'`).get().s;
  res.json({
    ventasMes,
    gananciaMes: +gananciaMes.toFixed(2),
    historicoRecaudado,
  });
});

router.get('/historial', requireAuth, requireAdmin, (req, res) => {
  const rows = db
    .prepare(
      `SELECT v.id, v.numero_transaccion, v.sorteo_id, v.cartones_ids, v.jugador_id, j.nombre, j.whatsapp, v.monto, v.fecha, v.estatus
       FROM ventas v LEFT JOIN jugadores j ON j.id = v.jugador_id ORDER BY v.fecha DESC LIMIT 500`
    )
    .all();
  res.json({ ventas: rows.map((v) => ({ ...v, cartones_ids: JSON.parse(v.cartones_ids) })) });
});

// ---------- PREMIOS ACTIVOS ----------
router.get('/premios-activos', requireAuth, (req, res) => {
  const rows = db.prepare(`SELECT * FROM sorteos WHERE estatus IN ('activo','en_juego') ORDER BY fecha_hora ASC`).all();
  const out = rows.map((s) => {
    const recaudado = db.prepare(`SELECT COALESCE(SUM(monto),0) s FROM ventas WHERE sorteo_id=? AND estatus='completado'`).get(s.id).s;
    const premioAcumulado = +(recaudado * (1 - s.porcentaje_ganancia / 100)).toFixed(2);
    return { ...s, premioAcumulado };
  });
  res.json({ sorteos: out });
});

// ---------- GANADORES ----------
router.get('/ganadores', requireAuth, requireAdmin, (req, res) => {
  const rows = db
    .prepare(
      `SELECT g.*, j.nombre, j.whatsapp, s.color, s.fecha_hora FROM ganadores g
       LEFT JOIN jugadores j ON j.id = g.jugador_id LEFT JOIN sorteos s ON s.id = g.sorteo_id
       ORDER BY g.fecha DESC`
    )
    .all();
  res.json({ ganadores: rows });
});

router.put('/ganadores/:id/pagar', requireAuth, requireAdmin, (req, res) => {
  db.prepare('UPDATE ganadores SET pagado = 1 WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

module.exports = router;
