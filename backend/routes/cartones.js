// routes/cartones.js
const express = require('express');
const db = require('../db');
const { requireAuth, requireAdmin } = require('../authMiddleware');
const { generateUniqueCards } = require('../cardGenerator');
const { registrarLog } = require('../logActividad');
const router = express.Router();

function parseCard(c) {
  return { ...c, grid: JSON.parse(c.grid), marcados: JSON.parse(c.marcados) };
}

// Inventario con filtros: numero, color, estado, sorteo_id
router.get('/', requireAuth, requireAdmin, (req, res) => {
  const { numero, color, estado, sorteo_id } = req.query;
  let sql = `SELECT c.*, j.nombre as owner_nombre, j.whatsapp as owner_whatsapp, cii.url AS imagen_url
             FROM cartones c
             LEFT JOIN jugadores j ON j.id = c.owner_id
             LEFT JOIN sorteos s ON s.id = c.sorteo_id
             LEFT JOIN catalogo_imagenes_items cii ON cii.catalogo_id = s.catalogo_imagenes_id AND cii.numero = c.numero
             WHERE 1=1`;
  const params = [];
  if (numero) { sql += ' AND c.numero = ?'; params.push(numero); }
  if (color) { sql += ' AND c.color = ?'; params.push(color); }
  if (estado) { sql += ' AND c.estado = ?'; params.push(estado); }
  if (sorteo_id) { sql += ' AND c.sorteo_id = ?'; params.push(sorteo_id); }
  sql += ' ORDER BY c.numero ASC';
  const rows = db.prepare(sql).all(...params);
  res.json({ cartones: rows.map(parseCard) });
});

// Generar lote masivo independiente (color, desde, hasta), sin sorteo asociado
router.post('/lote', requireAuth, requireAdmin, (req, res) => {
  const { color, desde, hasta } = req.body;
  const d = parseInt(desde, 10);
  const h = parseInt(hasta, 10);
  if (!color || Number.isNaN(d) || Number.isNaN(h) || h < d) {
    return res.status(400).json({ error: 'Datos de lote inválidos' });
  }
  const total = h - d + 1;
  try {
    const grids = generateUniqueCards(total);
    const insert = db.prepare(
      `INSERT INTO cartones (numero, color, grid, sorteo_id, grupo, estado, marcados) VALUES (?, ?, ?, NULL, NULL, 'disponible', '[]')`
    );
    const tx = db.transaction((grids) => {
      grids.forEach((grid, i) => insert.run(d + i, color, JSON.stringify(grid)));
    });
    tx(grids);
  } catch (e) {
    return res.status(400).json({ error: e.message });
  }
  res.json({ ok: true, total });
});

router.put('/disponible', requireAuth, requireAdmin, (req, res) => {
  const { ids } = req.body;
  if (!Array.isArray(ids) || !ids.length) return res.status(400).json({ error: 'Selecciona al menos un cartón' });
  const stmt = db.prepare(`UPDATE cartones SET estado = 'disponible', owner_id = NULL, marcados = '[]' WHERE id = ?`);
  const tx = db.transaction((ids) => ids.forEach((id) => stmt.run(id)));
  tx(ids);
  registrarLog(req, 'cartones', 'Liberó cartón(es) por lote', `${ids.length} cartón(es)`);
  res.json({ ok: true });
});

// ---------- VERIFICACIÓN DE VENTAS (por números de cartón, dentro de un sorteo) ----------
// El admin recibe el comprobante por WhatsApp y confirma el pago aquí.
router.put('/verificar-pago', requireAuth, requireAdmin, (req, res) => {
  const { sorteo_id, numeros } = req.body;
  if (!sorteo_id || !Array.isArray(numeros) || !numeros.length) {
    return res.status(400).json({ error: 'Indica el sorteo y al menos un número de cartón' });
  }
  const sorteo = db.prepare('SELECT tipo_venta FROM sorteos WHERE id = ?').get(sorteo_id);
  // En combos, "Registro de Cartones Vendidos" solo muestra el número de
  // "Carta" (grupo) — nunca el número interno de cada cartón físico — así
  // que el admin siempre escribe el número de carta. En venta individual,
  // numero y grupo son el mismo valor. Buscar por la columna equivocada
  // podría chocar con el numero/grupo de OTRA carta distinta, por eso se
  // elige una sola columna según el tipo de venta, nunca ambas a la vez.
  const columna = sorteo && sorteo.tipo_venta > 1 ? 'grupo' : 'numero';
  const placeholders = numeros.map(() => '?').join(',');
  const rows = db.prepare(`SELECT * FROM cartones WHERE sorteo_id = ? AND ${columna} IN (${placeholders})`).all(sorteo_id, ...numeros);
  const noEncontrados = numeros.filter((n) => !rows.some((r) => r[columna] === n));

  const pagables = rows.filter((c) => c.estado === 'vendido');
  // Dedupe: un combo x4 son 4 filas con el mismo grupo, pero se reporta una sola vez.
  const yaPagados = [...new Set(rows.filter((c) => c.estado === 'pagado').map((c) => c[columna]))];
  const noApartados = [...new Set(rows.filter((c) => c.estado === 'disponible').map((c) => c[columna]))];

  const tx = db.transaction(() => {
    const stmt = db.prepare(`UPDATE cartones SET estado = 'pagado' WHERE id = ?`);
    pagables.forEach((c) => stmt.run(c.id));
  });
  tx();

  if (pagables.length) req.app.get('io').to(`sorteo-${sorteo_id}`).emit('cartones-actualizados', { sorteoId: Number(sorteo_id) });

  const verificados = [...new Set(pagables.map((c) => c[columna]))];
  if (verificados.length) registrarLog(req, 'cartones', 'Confirmó pago', `#${verificados.join(', #')} (Sorteo #${sorteo_id})`);

  res.json({ ok: true, verificados, yaPagados, noApartados, noEncontrados });
});

// Libera cartones (vendido o pagado) de vuelta a disponible, por número dentro de un sorteo
router.put('/liberar', requireAuth, requireAdmin, (req, res) => {
  const { sorteo_id, numeros } = req.body;
  if (!sorteo_id || !Array.isArray(numeros) || !numeros.length) {
    return res.status(400).json({ error: 'Indica el sorteo y al menos un número de cartón' });
  }
  const sorteo = db.prepare('SELECT tipo_venta FROM sorteos WHERE id = ?').get(sorteo_id);
  // Misma lógica que verificar-pago: una sola columna (grupo para combos,
  // numero para venta individual) para no chocar con otra carta distinta.
  const columna = sorteo && sorteo.tipo_venta > 1 ? 'grupo' : 'numero';
  const placeholders = numeros.map(() => '?').join(',');
  const rows = db.prepare(`SELECT * FROM cartones WHERE sorteo_id = ? AND ${columna} IN (${placeholders})`).all(sorteo_id, ...numeros);
  const noEncontrados = numeros.filter((n) => !rows.some((r) => r[columna] === n));

  const tx = db.transaction(() => {
    const stmt = db.prepare(`UPDATE cartones SET estado = 'disponible', owner_id = NULL, marcados = '[]' WHERE id = ?`);
    rows.forEach((c) => stmt.run(c.id));
  });
  tx();

  if (rows.length) req.app.get('io').to(`sorteo-${sorteo_id}`).emit('cartones-actualizados', { sorteoId: Number(sorteo_id) });

  const liberados = [...new Set(rows.map((c) => c[columna]))];
  if (liberados.length) registrarLog(req, 'cartones', 'Liberó cartón(es)', `#${liberados.join(', #')} (Sorteo #${sorteo_id})`);

  res.json({ ok: true, liberados, noEncontrados });
});

router.delete('/', requireAuth, requireAdmin, (req, res) => {
  const { ids } = req.body;
  if (!Array.isArray(ids) || !ids.length) return res.status(400).json({ error: 'Selecciona al menos un cartón' });
  const stmt = db.prepare('DELETE FROM cartones WHERE id = ?');
  const tx = db.transaction((ids) => ids.forEach((id) => stmt.run(id)));
  tx(ids);
  registrarLog(req, 'cartones', 'Eliminó cartón(es) suelto(s)', `${ids.length} cartón(es)`);
  res.json({ ok: true });
});

// Busca o crea un jugador por nombre (identidad principal ahora que ya no
// hay login de jugador). Si viene whatsapp, dedupe por whatsapp (como antes);
// si no, dedupe por nombre exacto (sin importar mayúsculas) para no crear un
// registro nuevo cada vez que el admin asigna otra carta a la misma persona.
function findOrCreateJugador(nombre, whatsapp) {
  const nombreTrim = nombre.trim();
  const whatsappTrim = (whatsapp || '').trim();
  let jugador = whatsappTrim
    ? db.prepare('SELECT * FROM jugadores WHERE whatsapp = ?').get(whatsappTrim)
    : db.prepare("SELECT * FROM jugadores WHERE nombre = ? COLLATE NOCASE AND (whatsapp IS NULL OR whatsapp = '')").get(nombreTrim);
  if (jugador) {
    if (jugador.nombre !== nombreTrim) {
      db.prepare('UPDATE jugadores SET nombre = ? WHERE id = ?').run(nombreTrim, jugador.id);
      jugador.nombre = nombreTrim;
    }
    return jugador;
  }
  const info = db.prepare('INSERT INTO jugadores (nombre, whatsapp) VALUES (?, ?)').run(nombreTrim, whatsappTrim);
  return db.prepare('SELECT * FROM jugadores WHERE id = ?').get(info.lastInsertRowid);
}

// ---------- ASIGNAR / APARTAR CARTÓN (admin) ----------
// El admin escribe un nombre + números de carta/cartón y quedan reservados
// (estado 'vendido', pendiente de pago) a nombre de esa persona — reemplaza
// la autocompra que antes hacía el propio jugador logueado.
router.put('/asignar', requireAuth, requireAdmin, (req, res) => {
  const { sorteo_id, numeros, nombre, whatsapp } = req.body;
  if (!sorteo_id || !Array.isArray(numeros) || !numeros.length || !nombre || !nombre.trim()) {
    return res.status(400).json({ error: 'Indica el sorteo, al menos un número de carta/cartón y el nombre' });
  }
  const sorteo = db.prepare('SELECT * FROM sorteos WHERE id = ?').get(sorteo_id);
  if (!sorteo) return res.status(404).json({ error: 'Sorteo no encontrado' });

  const columna = sorteo.tipo_venta > 1 ? 'grupo' : 'numero';
  const placeholders = numeros.map(() => '?').join(',');
  const rows = db.prepare(`SELECT * FROM cartones WHERE sorteo_id = ? AND ${columna} IN (${placeholders})`).all(sorteo_id, ...numeros);
  const noEncontrados = numeros.filter((n) => !rows.some((r) => r[columna] === n));

  const asignables = rows.filter((c) => c.estado === 'disponible');
  const yaOcupados = [...new Set(rows.filter((c) => c.estado !== 'disponible').map((c) => c[columna]))];

  let jugador = null;
  if (asignables.length) {
    jugador = findOrCreateJugador(nombre, whatsapp);
    const monto = +(sorteo.costo * new Set(asignables.map((c) => c.grupo)).size).toFixed(2);

    const tx = db.transaction(() => {
      const stmt = db.prepare(`UPDATE cartones SET estado = 'vendido', owner_id = ? WHERE id = ?`);
      asignables.forEach((c) => stmt.run(jugador.id, c.id));
      const numTx = `TX-${Date.now()}-${Math.floor(Math.random() * 9000 + 1000)}`;
      db.prepare(
        `INSERT INTO ventas (numero_transaccion, sorteo_id, cartones_ids, jugador_id, monto, estatus)
         VALUES (?, ?, ?, ?, ?, 'completado')`
      ).run(numTx, sorteo_id, JSON.stringify(asignables.map((c) => c.id)), jugador.id, monto);
    });
    tx();

    const io = req.app.get('io');
    io.to(`sorteo-${sorteo_id}`).emit('cartones-actualizados', { sorteoId: Number(sorteo_id) });
    io.emit('sorteos-cambio', {});

    const numsLog = [...new Set(asignables.map((c) => c[columna]))];
    registrarLog(req, 'cartones', 'Apartó cartón(es)', `#${numsLog.join(', #')} para ${jugador.nombre} (Sorteo #${sorteo_id})`);
  }

  res.json({
    ok: true,
    asignados: [...new Set(asignables.map((c) => c[columna]))],
    yaOcupados,
    noEncontrados,
    jugador: jugador ? { id: jugador.id, nombre: jugador.nombre } : null,
  });
});

// ---------- CONSULTA PÚBLICA DE UNA CARTA/CARTÓN (sin login) ----------
// Cualquiera que sepa el número de carta (o cartón, si el sorteo no vende
// por combo) puede verla y descargarla — no requiere WhatsApp ni ningún
// dato del comprador, por eso no lleva requireAuth. Si el sorteo vende por
// combo, el número ingresado es el de "carta" (grupo) y se devuelven todos
// los cartones de esa carta juntos; si no, es el número del cartón directo.
router.get('/consulta', (req, res) => {
  const sorteoId = Number(req.query.sorteo_id);
  const numero = Number(req.query.numero);
  if (!sorteoId || !numero) {
    return res.status(400).json({ error: 'Indica el sorteo y el número de carta/cartón' });
  }
  const sorteo = db.prepare('SELECT * FROM sorteos WHERE id = ?').get(sorteoId);
  if (!sorteo) return res.status(404).json({ error: 'Sorteo no encontrado' });

  const rows = sorteo.tipo_venta > 1
    ? db.prepare(
        `SELECT c.*, j.nombre AS owner_nombre, cii.url AS imagen_url
         FROM cartones c LEFT JOIN jugadores j ON j.id = c.owner_id
         LEFT JOIN catalogo_imagenes_items cii ON cii.catalogo_id = ? AND cii.numero = c.numero
         WHERE c.sorteo_id = ? AND c.grupo = ? ORDER BY c.letra ASC`
      ).all(sorteo.catalogo_imagenes_id, sorteoId, numero)
    : db.prepare(
        `SELECT c.*, j.nombre AS owner_nombre, cii.url AS imagen_url
         FROM cartones c LEFT JOIN jugadores j ON j.id = c.owner_id
         LEFT JOIN catalogo_imagenes_items cii ON cii.catalogo_id = ? AND cii.numero = c.numero
         WHERE c.sorteo_id = ? AND c.numero = ?`
      ).all(sorteo.catalogo_imagenes_id, sorteoId, numero);

  if (!rows.length) return res.json({ encontrado: false, cartones: [] });

  res.json({
    encontrado: true,
    sorteo: { id: sorteo.id, color: sorteo.color, fecha_hora: sorteo.fecha_hora, estatus: sorteo.estatus, tipo_venta: sorteo.tipo_venta },
    cartones: rows.map(parseCard),
  });
});

// ---------- CONSULTA PÚBLICA POR NOMBRE (sin login) ----------
// Alternativa a /consulta cuando el usuario no sabe su número de carta:
// busca por nombre (parcial, sin importar mayúsculas) entre quienes ya
// tienen cartones asignados en ese sorteo y devuelve, por cada coincidencia,
// sus cartas agrupadas.
router.get('/consulta-nombre', (req, res) => {
  const sorteoId = Number(req.query.sorteo_id);
  const nombre = (req.query.nombre || '').trim();
  if (!sorteoId || !nombre) {
    return res.status(400).json({ error: 'Indica el sorteo y tu nombre' });
  }
  const sorteo = db.prepare('SELECT * FROM sorteos WHERE id = ?').get(sorteoId);
  if (!sorteo) return res.status(404).json({ error: 'Sorteo no encontrado' });

  const jugadoresMatch = db
    .prepare(
      `SELECT DISTINCT j.* FROM jugadores j
       JOIN cartones c ON c.owner_id = j.id AND c.sorteo_id = ?
       WHERE j.nombre LIKE ? COLLATE NOCASE
       ORDER BY j.nombre ASC LIMIT 20`
    )
    .all(sorteoId, `%${nombre}%`);

  const resultados = jugadoresMatch.map((j) => {
    const rows = db
      .prepare(
        `SELECT c.*, cii.url AS imagen_url
         FROM cartones c
         LEFT JOIN catalogo_imagenes_items cii ON cii.catalogo_id = ? AND cii.numero = c.numero
         WHERE c.sorteo_id = ? AND c.owner_id = ? ORDER BY c.grupo ASC, c.letra ASC`
      )
      .all(sorteo.catalogo_imagenes_id, sorteoId, j.id);
    const porGrupo = new Map();
    rows.forEach((r) => {
      const g = r.grupo != null ? r.grupo : r.numero;
      if (!porGrupo.has(g)) porGrupo.set(g, []);
      porGrupo.get(g).push(parseCard(r));
    });
    return {
      jugador_id: j.id,
      nombre: j.nombre,
      grupos: [...porGrupo.entries()].map(([grupo, cartones]) => ({ grupo, cartones })),
    };
  });

  res.json({
    sorteo: { id: sorteo.id, color: sorteo.color, fecha_hora: sorteo.fecha_hora, estatus: sorteo.estatus, tipo_venta: sorteo.tipo_venta },
    resultados,
  });
});

// Cartones de un jugador específico (admin)
router.get('/jugador/:jugadorId', requireAuth, requireAdmin, (req, res) => {
  const rows = db
    .prepare(
      `SELECT c.*, cii.url AS imagen_url
       FROM cartones c
       LEFT JOIN sorteos s ON s.id = c.sorteo_id
       LEFT JOIN catalogo_imagenes_items cii ON cii.catalogo_id = s.catalogo_imagenes_id AND cii.numero = c.numero
       WHERE c.owner_id = ? ORDER BY c.numero ASC`
    )
    .all(req.params.jugadorId);
  res.json({ cartones: rows.map(parseCard) });
});

// Deshace un ganador registrado por error.
// Simple: borra el registro de `ganadores`; si la figura ya había quedado
// `cerrada` por esto, se mantiene así (reabrirla es una acción aparte).
router.delete('/ganadores/:id', requireAuth, requireAdmin, (req, res) => {
  const ganador = db.prepare('SELECT patron, nombre FROM ganadores WHERE id = ?').get(req.params.id);
  const info = db.prepare('DELETE FROM ganadores WHERE id = ?').run(req.params.id);
  if (!info.changes) return res.status(404).json({ error: 'Ganador no encontrado' });
  req.app.get('io').emit('sorteos-cambio', {});
  registrarLog(req, 'ventas', 'Deshizo un registro de ganador', `${ganador?.patron} — ${ganador?.nombre || 'N/A'}`);
  res.json({ ok: true });
});

module.exports = router;
