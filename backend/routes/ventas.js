// routes/ventas.js
const express = require('express');
const db = require('../db');
const { requireAuth, requireAdmin } = require('../authMiddleware');
const { registrarLog } = require('../logActividad');

const router = express.Router();

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ---------- COMPRA DE CARTONES ----------
// Body: { sorteo_id, numeros: [n1, n2, ...] } para selección manual,
// o { sorteo_id, cantidad } para selección al azar.
// El pago se coordina fuera de la app (comprobante enviado al grupo de
// WhatsApp); aquí solo se reserva/confirma la venta.
router.post('/comprar', requireAuth, (req, res) => {
  const { sorteo_id, numeros, cantidad } = req.body;
  const sorteo = db.prepare('SELECT * FROM sorteos WHERE id = ?').get(sorteo_id);
  if (!sorteo) return res.status(404).json({ error: 'Sorteo no encontrado' });
  if (sorteo.estatus !== 'activo') return res.status(400).json({ error: 'Este sorteo ya no admite ventas' });
  if (!sorteo.ventas_habilitadas) return res.status(400).json({ error: 'Las ventas de este sorteo todavía no están habilitadas' });

  // Cuando el sorteo vende por combo (tipo_venta > 1), los cartones de un mismo
  // `grupo` deben reservarse siempre juntos — nunca parcialmente.
  let cartones;
  if (Array.isArray(numeros) && numeros.length) {
    const placeholders = numeros.map(() => '?').join(',');
    cartones = db
      .prepare(`SELECT * FROM cartones WHERE sorteo_id = ? AND numero IN (${placeholders})`)
      .all(sorteo_id, ...numeros);
    if (cartones.length !== numeros.length) {
      return res.status(404).json({ error: 'Uno o más cartones seleccionados no existen' });
    }
    if (cartones.some((c) => c.estado !== 'disponible')) {
      return res.status(409).json({ error: 'Uno o más cartones seleccionados ya fueron vendidos' });
    }
    const gruposTocados = [...new Set(cartones.map((c) => c.grupo))];
    const gPlaceholders = gruposTocados.map(() => '?').join(',');
    const totalEnGrupos = db
      .prepare(`SELECT COUNT(*) c FROM cartones WHERE sorteo_id = ? AND grupo IN (${gPlaceholders})`)
      .get(sorteo_id, ...gruposTocados).c;
    if (totalEnGrupos !== cartones.length) {
      return res.status(400).json({ error: 'Los cartones de un mismo combo deben comprarse juntos, como grupo completo' });
    }
  } else {
    const n = parseInt(cantidad, 10);
    if (!n || n < 1) return res.status(400).json({ error: 'Indica cuántos combos deseas al azar' });
    const disponibles = db.prepare(`SELECT * FROM cartones WHERE sorteo_id = ? AND estado = 'disponible'`).all(sorteo_id);
    const totalPorGrupo = db.prepare(`SELECT grupo, COUNT(*) c FROM cartones WHERE sorteo_id = ? GROUP BY grupo`).all(sorteo_id);
    const totalMap = new Map(totalPorGrupo.map((r) => [r.grupo, r.c]));
    const porGrupo = new Map();
    disponibles.forEach((c) => {
      if (!porGrupo.has(c.grupo)) porGrupo.set(c.grupo, []);
      porGrupo.get(c.grupo).push(c);
    });
    const gruposCompletos = [...porGrupo.values()].filter((cards) => cards.length === totalMap.get(cards[0].grupo));
    if (gruposCompletos.length < n) {
      return res.status(409).json({ error: `Solo quedan ${gruposCompletos.length} combo(s) disponibles` });
    }
    cartones = shuffle(gruposCompletos).slice(0, n).flat();
  }

  const monto = +(sorteo.costo * new Set(cartones.map((c) => c.grupo)).size).toFixed(2);

  const tx = db.transaction(() => {
    const marcarVendido = db.prepare(`UPDATE cartones SET estado = 'vendido', owner_id = ? WHERE id = ?`);
    cartones.forEach((c) => marcarVendido.run(req.user.id, c.id));
    const numTx = `TX-${Date.now()}-${Math.floor(Math.random() * 9000 + 1000)}`;
    db.prepare(
      `INSERT INTO ventas (numero_transaccion, sorteo_id, cartones_ids, jugador_id, monto, estatus)
       VALUES (?, ?, ?, ?, ?, 'completado')`
    ).run(numTx, sorteo_id, JSON.stringify(cartones.map((c) => c.id)), req.user.id, monto);
  });
  tx();

  const io = req.app.get('io');
  io.to(`sorteo-${sorteo_id}`).emit('cartones-vendidos', {
    sorteoId: Number(sorteo_id),
    jugador: req.user.nombre || 'N/A',
    numeros: cartones.map((c) => c.numero).sort((a, b) => a - b),
    monto,
  });
  // Además de avisar a quien ya está viendo este sorteo, se avisa a todos los que
  // tengan la lista de sorteos abierta (afecta el Premio Acumulado mostrado ahí).
  io.emit('sorteos-cambio', {});

  res.json({
    ok: true,
    cartonesIds: cartones.map((c) => c.id),
    cartonesNumeros: cartones.map((c) => c.numero).sort((a, b) => a - b),
    monto,
  });
});

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
      `SELECT g.*, j.nombre, j.whatsapp, s.color, s.fecha_hora, g.jugado_por_nombre AS jugadoPorNombre
       FROM ganadores g
       LEFT JOIN jugadores j ON j.id = g.jugador_id LEFT JOIN sorteos s ON s.id = g.sorteo_id
       ORDER BY g.fecha DESC`
    )
    .all();
  res.json({ ganadores: rows });
});

router.put('/ganadores/:id/pagar', requireAuth, requireAdmin, (req, res) => {
  const ganador = db.prepare('SELECT patron, nombre, premio FROM ganadores WHERE id = ?').get(req.params.id);
  db.prepare('UPDATE ganadores SET pagado = 1 WHERE id = ?').run(req.params.id);
  registrarLog(req, 'ventas', 'Pagó un premio', ganador ? `${ganador.patron} — ${ganador.nombre || 'N/A'} (Bs ${ganador.premio})` : `Ganador #${req.params.id}`);
  res.json({ ok: true });
});

module.exports = router;
