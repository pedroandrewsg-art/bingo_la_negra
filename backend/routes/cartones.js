// routes/cartones.js
const express = require('express');
const db = require('../db');
const { requireAuth, requireAdmin } = require('../authMiddleware');
const { generateUniqueCards } = require('../cardGenerator');
const { getPatternDef, checkPattern, buildMarkedMatrix, nearWinNumbers, celdasGanadoras } = require('../patterns');
const { figurasActivas, computeStats } = require('./sorteos');
const { registrarLog } = require('../logActividad');

const router = express.Router();

function parseCard(c) {
  return { ...c, grid: JSON.parse(c.grid), marcados: JSON.parse(c.marcados) };
}

// "Jugar por otra persona": ¿quién tiene delegado este cartón (además del
// dueño) para marcarlo en la sala de juego? null si nadie lo tomó.
function delegadoDeCarton(cartonId) {
  return (
    db
      .prepare(
        `SELECT cd.jugador_id, j.nombre FROM cartones_delegados cd
         JOIN jugadores j ON j.id = cd.jugador_id WHERE cd.carton_id = ?`
      )
      .get(cartonId) || null
  );
}

// Para cada figura activa del sorteo que este carton todavia no completó, ¿le
// falta exactamente 1 número? Devuelve [{patron, numeros: [..]}] (un patron
// puede aparecer con más de un número si hay varias líneas a 1 de cerrar).
function cercaDeGanar(carton, activos) {
  const grid = JSON.parse(carton.grid);
  const marcadosSet = new Set(JSON.parse(carton.marcados));
  const out = [];
  for (const patron of activos) {
    const matrix = buildMarkedMatrix(grid, marcadosSet);
    if (checkPattern(patron, matrix)) continue; // ya lo completó (reclamo aparte)
    const numeros = nearWinNumbers(patron, grid, marcadosSet);
    if (numeros.length) out.push({ patron, label: getPatternDef(patron)?.label || patron, numeros });
  }
  return out;
}

// Revisa un carton recién marcado contra las figuras activas del sorteo; por
// cada figura que ahora se completa, crea un reclamo pendiente (si no existe
// ya uno para ese carton+patron, en cualquier estado — evita que un cartón
// invalidado-pero-dejado-en-juego vuelva a reclamar la misma figura en cada
// click posterior). Emite 'bingo-reclamo' por cada reclamo nuevo.
function evaluarReclamos(carton, sorteoId, io) {
  const grid = JSON.parse(carton.grid);
  const marcadosSet = new Set(JSON.parse(carton.marcados));
  const matrix = buildMarkedMatrix(grid, marcadosSet);
  const activos = figurasActivas(sorteoId);
  for (const patron of activos) {
    if (!checkPattern(patron, matrix)) continue;
    const existe = db
      .prepare('SELECT id FROM reclamos WHERE carton_id = ? AND patron = ?')
      .get(carton.id, patron);
    if (existe) continue;
    // Si alguien distinto del dueño está jugando este cartón (delegación),
    // se guarda como snapshot -- así el reclamo conserva quién lo marcó aunque
    // la delegación se suelte después.
    const delegado = delegadoDeCarton(carton.id);
    const jugadoPor = delegado && delegado.jugador_id !== carton.owner_id ? delegado : null;
    const info = db
      .prepare(
        `INSERT INTO reclamos (sorteo_id, carton_id, carton_numero, jugador_id, patron, estado, jugado_por_id, jugado_por_nombre)
         VALUES (?, ?, ?, ?, ?, 'pendiente', ?, ?)`
      )
      .run(sorteoId, carton.id, carton.numero, carton.owner_id, patron, jugadoPor ? jugadoPor.jugador_id : null, jugadoPor ? jugadoPor.nombre : null);
    const jugador = carton.owner_id ? db.prepare('SELECT nombre FROM jugadores WHERE id = ?').get(carton.owner_id) : null;
    io.to(`sorteo-${sorteoId}`).emit('bingo-reclamo', {
      sorteoId: Number(sorteoId),
      reclamoId: info.lastInsertRowid,
      cartonId: carton.id,
      cartonNumero: carton.numero,
      grupo: carton.grupo,
      letra: carton.letra,
      color: carton.color,
      // Grid y marcados van directo en el evento (no solo el patron/carton):
      // el frontend los usaba antes desde su propio estado local
      // (misCartonesRef), que podía no reflejar todavía la última marca por
      // una carrera entre el setState local y la llegada del socket —
      // mandarlos ya resueltos desde el servidor elimina esa carrera.
      grid,
      marcados: [...marcadosSet],
      patron,
      label: getPatternDef(patron)?.label || patron,
      jugador: jugador ? jugador.nombre : 'N/A',
      jugadoPorNombre: jugadoPor ? jugadoPor.nombre : null,
    });
  }
}

// Registra un ganador (tabla ganadores), anuncia por socket y cierra la
// figura del sorteo. Usada tanto al validar un reclamo (marcado en la app)
// como al confirmar un "Bingo Manual" (jugador de cartón físico/papel).
function confirmarGanador({ sorteoId, cartonId, patron, io }) {
  const stats = computeStats(sorteoId);
  const figura = stats.figuras.find((f) => f.patron === patron);
  const premio = figura ? figura.premio : 0;
  const cartonFull = cartonId ? db.prepare('SELECT * FROM cartones WHERE id = ?').get(cartonId) : null;
  const jugador = cartonFull && cartonFull.owner_id
    ? db.prepare('SELECT nombre FROM jugadores WHERE id = ?').get(cartonFull.owner_id)
    : null;
  // Snapshot de quién jugó el cartón si no fue el dueño (ver evaluarReclamos).
  const delegado = cartonFull ? delegadoDeCarton(cartonFull.id) : null;
  const jugadoPor = delegado && cartonFull && delegado.jugador_id !== cartonFull.owner_id ? delegado : null;

  const insertInfo = db.prepare(
    `INSERT INTO ganadores (sorteo_id, jugador_id, carton_id, patron, premio, jugado_por_id, jugado_por_nombre) VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(sorteoId, cartonFull ? cartonFull.owner_id : null, cartonId, patron, premio, jugadoPor ? jugadoPor.jugador_id : null, jugadoPor ? jugadoPor.nombre : null);

  // Ya NO se invalidan automáticamente otros reclamos pendientes de la misma
  // figura: varios jugadores pueden pegar bingo legítimamente en la misma
  // figura (bingo "corrido") y el admin debe poder validar a cada uno. La
  // figura sigue aceptando reclamos hasta que el admin la cierre a mano
  // (PUT /sorteos/:id/figuras/:patron/cerrar).

  io.to(`sorteo-${sorteoId}`).emit('bingo-ganador', {
    sorteoId: Number(sorteoId),
    ganadorId: insertInfo.lastInsertRowid,
    usuario: jugador ? jugador.nombre : 'N/A',
    usuarioId: cartonFull ? cartonFull.owner_id : null,
    cartonId,
    cartonNumero: cartonFull ? cartonFull.numero : null,
    grupo: cartonFull ? cartonFull.grupo : null,
    letra: cartonFull ? cartonFull.letra : null,
    color: cartonFull ? cartonFull.color : null,
    grid: cartonFull ? JSON.parse(cartonFull.grid) : null,
    marcados: cartonFull ? JSON.parse(cartonFull.marcados) : null,
    numerosGanadores: cartonFull ? celdasGanadoras(patron, JSON.parse(cartonFull.grid), new Set(JSON.parse(cartonFull.marcados))) : [],
    patron,
    premio,
    jugadoPorNombre: jugadoPor ? jugadoPor.nombre : null,
  });
  io.emit('sorteos-cambio', {});

  if (!figurasActivas(sorteoId).length) {
    db.prepare(`UPDATE sorteos SET estatus = 'finalizado' WHERE id = ?`).run(sorteoId);
    io.to(`sorteo-${sorteoId}`).emit('sorteo-finalizado', { sorteoId });
    io.emit('sorteos-cambio', {});
  }
}

// Inventario con filtros: numero, color, estado, sorteo_id
router.get('/', requireAuth, requireAdmin, (req, res) => {
  const { numero, color, estado, sorteo_id } = req.query;
  let sql = `SELECT c.*, j.nombre as owner_nombre, j.whatsapp as owner_whatsapp FROM cartones c LEFT JOIN jugadores j ON j.id = c.owner_id WHERE 1=1`;
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
  const stmtDelegado = db.prepare('DELETE FROM cartones_delegados WHERE carton_id = ?');
  const tx = db.transaction((ids) => ids.forEach((id) => { stmt.run(id); stmtDelegado.run(id); }));
  tx(ids);
  registrarLog(req, 'cartones', 'Liberó cartón(es) por lote', `${ids.length} cartón(es)`);
  res.json({ ok: true });
});

// Busca cartones de un sorteo por el nombre del dueño (coincidencia parcial,
// sin importar mayúsculas). Si el match trae más de una persona distinta, no
// se elige ninguna — se devuelve el listado para que el admin sea más
// específico, en vez de arriesgarse a tocar los cartones de otra persona.
function cartonesPorNombre(sorteoId, nombre) {
  const rows = db
    .prepare(
      `SELECT c.*, j.nombre AS owner_nombre FROM cartones c
       JOIN jugadores j ON j.id = c.owner_id
       WHERE c.sorteo_id = ? AND j.nombre LIKE ? COLLATE NOCASE`
    )
    .all(sorteoId, `%${nombre}%`);
  const nombresDistintos = [...new Set(rows.map((r) => r.owner_nombre))];
  if (nombresDistintos.length > 1) {
    // Si el texto escrito coincide EXACTO con uno de los nombres, se usa ese
    // (ignora los demás parciales) — así escribir el nombre completo de
    // alguien nunca queda ambiguo solo porque además es substring de otro.
    const exacto = nombresDistintos.find((n) => n.toLowerCase() === nombre.toLowerCase());
    if (exacto) return { rows: rows.filter((r) => r.owner_nombre === exacto) };
    return { error: `Hay varias personas que coinciden con "${nombre}": ${nombresDistintos.join(', ')}. Sé más específico.` };
  }
  return { rows };
}

// Candidatos para el selector de "verificar/liberar por nombre" del admin —
// a diferencia de cartonesPorNombre() (que exige que el texto resuelva a UNA
// sola persona o falla con error), esto siempre devuelve la lista completa de
// coincidencias para que el admin elija a mano — necesario porque nombres con
// emojis/apodos/apellidos parecidos ("Pedro 🎉" vs "Pedro Gómez") son
// substrings unos de otros y texto libre nunca puede distinguirlos con certeza.
function jugadoresPorNombre(sorteoId, nombre, columna) {
  const rows = db
    .prepare(
      `SELECT DISTINCT c.owner_id, j.nombre AS owner_nombre, c.${columna} AS num, c.estado
       FROM cartones c JOIN jugadores j ON j.id = c.owner_id
       WHERE c.sorteo_id = ? AND j.nombre LIKE ? COLLATE NOCASE`
    )
    .all(sorteoId, `%${nombre}%`);
  const porJugador = new Map();
  rows.forEach((r) => {
    if (!porJugador.has(r.owner_id)) {
      porJugador.set(r.owner_id, { jugadorId: r.owner_id, nombre: r.owner_nombre, cartas: new Set(), pagadas: 0, pendientes: 0 });
    }
    const j = porJugador.get(r.owner_id);
    if (!j.cartas.has(r.num)) {
      j.cartas.add(r.num);
      if (r.estado === 'pagado') j.pagadas++; else j.pendientes++;
    }
  });
  return [...porJugador.values()]
    .map((j) => ({ jugadorId: j.jugadorId, nombre: j.nombre, totalCartas: j.cartas.size, pagadas: j.pagadas, pendientes: j.pendientes }))
    .sort((a, b) => a.nombre.localeCompare(b.nombre));
}

router.get('/buscar-jugadores', requireAuth, requireAdmin, (req, res) => {
  const { sorteo_id, nombre } = req.query;
  if (!sorteo_id || !nombre || !nombre.trim()) return res.json({ jugadores: [] });
  const sorteo = db.prepare('SELECT tipo_venta FROM sorteos WHERE id = ?').get(sorteo_id);
  const columna = sorteo && sorteo.tipo_venta > 1 ? 'grupo' : 'numero';
  res.json({ jugadores: jugadoresPorNombre(sorteo_id, nombre.trim(), columna) });
});

// ---------- VERIFICACIÓN DE VENTAS (por números de cartón, por jugador elegido del selector, o por nombre suelto) ----------
// El admin recibe el comprobante por WhatsApp y confirma el pago aquí.
router.put('/verificar-pago', requireAuth, requireAdmin, (req, res) => {
  const { sorteo_id, numeros, nombre, jugador_id } = req.body;
  if (!sorteo_id || (!jugador_id && !nombre && (!Array.isArray(numeros) || !numeros.length))) {
    return res.status(400).json({ error: 'Indica el sorteo y al menos un número de cartón, un jugador o un nombre' });
  }
  const sorteo = db.prepare('SELECT tipo_venta FROM sorteos WHERE id = ?').get(sorteo_id);
  // En combos, "Registro de Cartas Vendidas" solo muestra el número de
  // "Carta" (grupo) — nunca el número interno de cada cartón físico — así
  // que el admin siempre escribe el número de carta. En venta individual,
  // numero y grupo son el mismo valor. Buscar por la columna equivocada
  // podría chocar con el numero/grupo de OTRA carta distinta, por eso se
  // elige una sola columna según el tipo de venta, nunca ambas a la vez.
  const columna = sorteo && sorteo.tipo_venta > 1 ? 'grupo' : 'numero';

  let rows, noEncontrados;
  if (jugador_id) {
    // Match exacto por ID (viene del selector de "buscar-jugadores") — sin
    // ambigüedad posible, a diferencia de la búsqueda por texto de abajo.
    rows = db.prepare(`SELECT * FROM cartones WHERE sorteo_id = ? AND owner_id = ?`).all(sorteo_id, jugador_id);
    noEncontrados = [];
  } else if (nombre && nombre.trim()) {
    const resultado = cartonesPorNombre(sorteo_id, nombre.trim());
    if (resultado.error) return res.status(400).json({ error: resultado.error });
    rows = resultado.rows;
    noEncontrados = rows.length ? [] : [nombre.trim()];
  } else {
    const placeholders = numeros.map(() => '?').join(',');
    rows = db.prepare(`SELECT * FROM cartones WHERE sorteo_id = ? AND ${columna} IN (${placeholders})`).all(sorteo_id, ...numeros);
    noEncontrados = numeros.filter((n) => !rows.some((r) => r[columna] === n));
  }

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

// Libera cartones (vendido o pagado) de vuelta a disponible, por número o por nombre del dueño, dentro de un sorteo
router.put('/liberar', requireAuth, requireAdmin, (req, res) => {
  const { sorteo_id, numeros, nombre, jugador_id } = req.body;
  if (!sorteo_id || (!jugador_id && !nombre && (!Array.isArray(numeros) || !numeros.length))) {
    return res.status(400).json({ error: 'Indica el sorteo y al menos un número de cartón, un jugador o un nombre' });
  }
  const sorteo = db.prepare('SELECT tipo_venta FROM sorteos WHERE id = ?').get(sorteo_id);
  // Misma lógica que verificar-pago: una sola columna (grupo para combos,
  // numero para venta individual) para no chocar con otra carta distinta.
  const columna = sorteo && sorteo.tipo_venta > 1 ? 'grupo' : 'numero';

  let rows, noEncontrados;
  if (jugador_id) {
    rows = db.prepare(`SELECT * FROM cartones WHERE sorteo_id = ? AND owner_id = ?`).all(sorteo_id, jugador_id);
    noEncontrados = [];
  } else if (nombre && nombre.trim()) {
    const resultado = cartonesPorNombre(sorteo_id, nombre.trim());
    if (resultado.error) return res.status(400).json({ error: resultado.error });
    rows = resultado.rows;
    noEncontrados = rows.length ? [] : [nombre.trim()];
  } else {
    const placeholders = numeros.map(() => '?').join(',');
    rows = db.prepare(`SELECT * FROM cartones WHERE sorteo_id = ? AND ${columna} IN (${placeholders})`).all(sorteo_id, ...numeros);
    noEncontrados = numeros.filter((n) => !rows.some((r) => r[columna] === n));
  }

  const tx = db.transaction(() => {
    const stmt = db.prepare(`UPDATE cartones SET estado = 'disponible', owner_id = NULL, marcados = '[]' WHERE id = ?`);
    const stmtDelegado = db.prepare('DELETE FROM cartones_delegados WHERE carton_id = ?');
    rows.forEach((c) => { stmt.run(c.id); stmtDelegado.run(c.id); });
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

// Listado ligero (numero + estado) de un sorteo, para la grilla de selección
// del jugador al comprar. No requiere permisos de admin.
router.get('/disponibles/:sorteoId', requireAuth, (req, res) => {
  const rows = db
    .prepare('SELECT id, numero, estado, grupo FROM cartones WHERE sorteo_id = ? ORDER BY numero ASC')
    .all(req.params.sorteoId);
  res.json({ cartones: rows });
});

// Cartones propios del jugador autenticado
// Historial de figuras que el jugador autenticado ya ganó en un sorteo —
// para mostrarlo de forma persistente en la sala de juego (no solo el aviso
// que aparece un instante y se cierra).
router.get('/mis-ganadores/:sorteoId', requireAuth, (req, res) => {
  const rows = db
    .prepare(
      `SELECT g.patron, g.premio, g.fecha, c.numero AS carton_numero, c.grupo, c.letra
       FROM ganadores g LEFT JOIN cartones c ON c.id = g.carton_id
       LEFT JOIN cartones_delegados cd ON cd.carton_id = g.carton_id
       WHERE g.sorteo_id = ? AND (g.jugador_id = ? OR cd.jugador_id = ?)
       ORDER BY g.fecha ASC`
    )
    .all(req.params.sorteoId, req.user.id, req.user.id);
  res.json({
    ganadores: rows.map((r) => ({ ...r, label: getPatternDef(r.patron)?.label || r.patron })),
  });
});

// Cartones propios Y los que juego por delegación de otro (ver POST/DELETE
// /delegar más abajo) -- la propiedad (owner_id, a quién le toca el premio)
// no cambia, esto solo amplía qué cartones puede VER/MARCAR req.user en la
// sala de juego.
router.get('/mias', requireAuth, (req, res) => {
  const { sorteo_id } = req.query;
  let sql = `
    SELECT c.*, (c.owner_id = ?) AS propio, owner.nombre AS dueno_nombre,
           cd.jugador_id AS delegado_id, dg.nombre AS delegado_nombre
    FROM cartones c
    LEFT JOIN jugadores owner ON owner.id = c.owner_id
    LEFT JOIN cartones_delegados cd ON cd.carton_id = c.id
    LEFT JOIN jugadores dg ON dg.id = cd.jugador_id
    WHERE (c.owner_id = ? OR cd.jugador_id = ?)`;
  const params = [req.user.id, req.user.id, req.user.id];
  if (sorteo_id) { sql += ' AND c.sorteo_id = ?'; params.push(sorteo_id); }
  sql += ' ORDER BY c.numero ASC';
  const rows = db.prepare(sql).all(...params);
  const activosPorSorteo = new Map();
  res.json({
    cartones: rows.map((c) => {
      if (!activosPorSorteo.has(c.sorteo_id)) activosPorSorteo.set(c.sorteo_id, figurasActivas(c.sorteo_id));
      return {
        ...parseCard(c),
        propio: !!c.propio,
        duenoNombre: c.dueno_nombre,
        jugadoPorId: c.delegado_id,
        jugadoPorNombre: c.delegado_id && c.delegado_id !== c.owner_id ? c.delegado_nombre : null,
        cercaDeGanar: cercaDeGanar(c, activosPorSorteo.get(c.sorteo_id)),
      };
    }),
  });
});

// ---------- JUGAR POR OTRA PERSONA (delegación de cartones) ----------
// Un jugador que compró cartas pero no puede estar presente deja que otro
// las juegue por él: se busca al dueño por nombre o WhatsApp DENTRO del
// mismo sorteo (no expone al resto de la base de jugadores), se listan sus
// cartas y se eligen cuáles tomar. La propiedad (owner_id / a quién le toca
// el premio) nunca cambia -- ver GET /mias, que ya devuelve juntas las
// propias y las delegadas.

// Búsqueda de candidatos para delegar: solo entre quienes tienen cartones
// vendidos/pagados en ESTE sorteo (no toda la base de jugadores).
router.get('/buscar-jugador', requireAuth, (req, res) => {
  const sorteoId = Number(req.query.sorteo_id);
  const q = (req.query.q || '').trim();
  if (!sorteoId || !q) return res.json({ jugadores: [] });
  const rows = db
    .prepare(
      `SELECT DISTINCT j.id, j.nombre, j.whatsapp
       FROM jugadores j JOIN cartones c ON c.owner_id = j.id
       WHERE c.sorteo_id = ? AND c.estado IN ('vendido','pagado') AND j.id != ?
         AND (j.nombre LIKE ? COLLATE NOCASE OR j.whatsapp LIKE ?)
       ORDER BY j.nombre ASC LIMIT 20`
    )
    .all(sorteoId, req.user.id, `%${q}%`, `%${q}%`);
  res.json({ jugadores: rows });
});

// Cartas (agrupadas por carta/combo) de otro jugador en un sorteo, para
// elegir cuáles tomar. Incluye si ya alguien la está jugando.
router.get('/de-jugador/:jugadorId', requireAuth, (req, res) => {
  const sorteoId = Number(req.query.sorteo_id);
  const jugadorId = Number(req.params.jugadorId);
  if (!sorteoId) return res.status(400).json({ error: 'Falta sorteo_id' });
  const rows = db
    .prepare(
      `SELECT * FROM cartones WHERE sorteo_id = ? AND owner_id = ? AND estado IN ('vendido','pagado')
       ORDER BY grupo ASC, letra ASC`
    )
    .all(sorteoId, jugadorId);
  const porGrupo = new Map();
  rows.forEach((c) => {
    const g = c.grupo != null ? c.grupo : c.numero;
    if (!porGrupo.has(g)) porGrupo.set(g, []);
    porGrupo.get(g).push(c);
  });
  const grupos = [...porGrupo.entries()].map(([grupo, cartones]) => {
    const delegado = delegadoDeCarton(cartones[0].id);
    return {
      grupo,
      cartones: cartones.map(parseCard),
      delegadoId: delegado ? delegado.jugador_id : null,
      delegadoNombre: delegado ? delegado.nombre : null,
      delegadoSoyYo: delegado ? delegado.jugador_id === req.user.id : false,
    };
  });
  res.json({ grupos });
});

// Toma una o más cartas de otro jugador para jugarlas en su lugar en la sala
// de juego. No cambia owner_id -- el premio sigue siendo de quien compró.
router.post('/delegar', requireAuth, (req, res) => {
  const { sorteo_id, jugador_id, grupos } = req.body;
  if (!sorteo_id || !jugador_id || !Array.isArray(grupos) || !grupos.length) {
    return res.status(400).json({ error: 'Faltan sorteo_id, jugador_id o grupos' });
  }
  if (Number(jugador_id) === req.user.id) {
    return res.status(400).json({ error: 'No puedes jugar tus propias cartas de esta forma' });
  }
  const placeholders = grupos.map(() => '?').join(',');
  const rows = db
    .prepare(`SELECT * FROM cartones WHERE sorteo_id = ? AND owner_id = ? AND grupo IN (${placeholders})`)
    .all(sorteo_id, jugador_id, ...grupos);
  if (!rows.length) return res.status(404).json({ error: 'No se encontraron esas cartas' });

  const tomadas = [];
  const yaTomadas = [];
  const upsert = db.prepare(
    `INSERT INTO cartones_delegados (carton_id, jugador_id) VALUES (?, ?)
     ON CONFLICT(carton_id) DO UPDATE SET jugador_id = excluded.jugador_id, creado_en = datetime('now')`
  );
  const tx = db.transaction(() => {
    rows.forEach((c) => {
      const actual = delegadoDeCarton(c.id);
      if (actual && actual.jugador_id !== req.user.id) {
        yaTomadas.push({ grupo: c.grupo, nombre: actual.nombre });
        return;
      }
      upsert.run(c.id, req.user.id);
      tomadas.push(c.grupo);
    });
  });
  tx();

  if (tomadas.length) req.app.get('io').to(`sorteo-${sorteo_id}`).emit('cartones-actualizados', { sorteoId: Number(sorteo_id) });
  res.json({ ok: true, tomadas: [...new Set(tomadas)], yaTomadas });
});

// Suelta cartas que se habían tomado -- puede hacerlo quien las tomó o el
// dueño real (para recuperar el control si ya no quiere que otro las juegue).
router.delete('/delegar', requireAuth, (req, res) => {
  const { sorteo_id, jugador_id, grupos } = req.body;
  if (!sorteo_id || !jugador_id || !Array.isArray(grupos) || !grupos.length) {
    return res.status(400).json({ error: 'Faltan sorteo_id, jugador_id o grupos' });
  }
  const placeholders = grupos.map(() => '?').join(',');
  const rows = db
    .prepare(`SELECT * FROM cartones WHERE sorteo_id = ? AND owner_id = ? AND grupo IN (${placeholders})`)
    .all(sorteo_id, jugador_id, ...grupos);
  const stmtBorrar = db.prepare('DELETE FROM cartones_delegados WHERE carton_id = ?');
  const tx = db.transaction(() => {
    rows.forEach((c) => {
      const actual = delegadoDeCarton(c.id);
      const puedeQuitar = c.owner_id === req.user.id || (actual && actual.jugador_id === req.user.id);
      if (puedeQuitar) stmtBorrar.run(c.id);
    });
  });
  tx();
  if (rows.length) req.app.get('io').to(`sorteo-${sorteo_id}`).emit('cartones-actualizados', { sorteoId: Number(sorteo_id) });
  res.json({ ok: true });
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
        `SELECT c.*, j.nombre AS owner_nombre FROM cartones c LEFT JOIN jugadores j ON j.id = c.owner_id
         WHERE c.sorteo_id = ? AND c.grupo = ? ORDER BY c.letra ASC`
      ).all(sorteoId, numero)
    : db.prepare(
        `SELECT c.*, j.nombre AS owner_nombre FROM cartones c LEFT JOIN jugadores j ON j.id = c.owner_id
         WHERE c.sorteo_id = ? AND c.numero = ?`
      ).all(sorteoId, numero);

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
      .prepare('SELECT * FROM cartones WHERE sorteo_id = ? AND owner_id = ? ORDER BY grupo ASC, letra ASC')
      .all(sorteoId, j.id);
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
  const rows = db.prepare('SELECT * FROM cartones WHERE owner_id = ? ORDER BY numero ASC').all(req.params.jugadorId);
  res.json({ cartones: rows.map(parseCard) });
});

// Marca/desmarca un número en UN cartón propio (tocar la casilla directo en
// el cartón). El marcado es manual porque ya no hay sorteador automático
// interno — el jugador escucha las bolillas de un sorteador externo.
router.put('/:id/marcar', requireAuth, (req, res) => {
  const { numero } = req.body;
  const carton = db.prepare('SELECT * FROM cartones WHERE id = ?').get(req.params.id);
  if (!carton) return res.status(404).json({ error: 'Cartón no encontrado' });
  const delegadoAuth = delegadoDeCarton(carton.id);
  const autorizado = carton.owner_id === req.user.id || req.user.role === 'admin' || (delegadoAuth && delegadoAuth.jugador_id === req.user.id);
  if (!autorizado) {
    return res.status(403).json({ error: 'No autorizado' });
  }
  const sorteo = db.prepare('SELECT * FROM sorteos WHERE id = ?').get(carton.sorteo_id);
  if (!sorteo || sorteo.estatus !== 'en_juego') {
    return res.status(400).json({ error: 'Este sorteo no está en juego todavía' });
  }
  const marcados = new Set(JSON.parse(carton.marcados));
  if (marcados.has(numero)) marcados.delete(numero); else marcados.add(numero);
  db.prepare('UPDATE cartones SET marcados = ? WHERE id = ?').run(JSON.stringify([...marcados]), carton.id);

  const actualizado = db.prepare('SELECT * FROM cartones WHERE id = ?').get(carton.id);
  const io = req.app.get('io');
  evaluarReclamos(actualizado, carton.sorteo_id, io);
  const activos = figurasActivas(carton.sorteo_id);
  res.json({ ok: true, marcados: [...marcados], cercaDeGanar: cercaDeGanar(actualizado, activos) });
});

// Marca/desmarca un número en TODOS los cartones propios de un sorteo que lo
// contengan a la vez (tablero de apoyo 1-75). Una sola vuelta de red en vez
// de repetir la llamada anterior por cada cartón.
// Estado del panel de apoyo 1-75 del jugador para un sorteo — separado de
// los cartones, para que el número quede marcado ahí aunque no esté en
// ninguno de sus cartones (el panel también sirve como anotador de qué
// números ya se cantaron).
function getTableroRow(jugadorId, sorteoId) {
  let row = db.prepare('SELECT * FROM tablero_marcas WHERE jugador_id = ? AND sorteo_id = ?').get(jugadorId, sorteoId);
  if (!row) {
    db.prepare('INSERT INTO tablero_marcas (jugador_id, sorteo_id, numeros) VALUES (?, ?, ?)').run(jugadorId, sorteoId, '[]');
    row = db.prepare('SELECT * FROM tablero_marcas WHERE jugador_id = ? AND sorteo_id = ?').get(jugadorId, sorteoId);
  }
  return row;
}

// Mis marcas del panel de apoyo para un sorteo (para cargarlas al entrar o
// reconectar a la sala de juego).
router.get('/tablero/:sorteoId', requireAuth, (req, res) => {
  const row = getTableroRow(req.user.id, req.params.sorteoId);
  res.json({ marcados: JSON.parse(row.numeros) });
});

router.put('/marcar-numero', requireAuth, (req, res) => {
  const { sorteo_id, numero } = req.body;
  const n = Number(numero);
  if (!sorteo_id || !n) return res.status(400).json({ error: 'Faltan sorteo_id o numero' });
  const sorteo = db.prepare('SELECT * FROM sorteos WHERE id = ?').get(sorteo_id);
  if (!sorteo || sorteo.estatus !== 'en_juego') {
    return res.status(400).json({ error: 'Este sorteo no está en juego todavía' });
  }
  const propios = db
    .prepare(
      `SELECT DISTINCT c.* FROM cartones c
       LEFT JOIN cartones_delegados cd ON cd.carton_id = c.id
       WHERE (c.owner_id = ? OR cd.jugador_id = ?) AND c.sorteo_id = ?`
    )
    .all(req.user.id, req.user.id, sorteo_id)
    .filter((c) => JSON.parse(c.grid).some((fila) => fila.includes(n)));

  // El panel manda la dirección del toggle (marcar o desmarcar), y esa misma
  // dirección se aplica a los cartones propios que tengan el número — así
  // tocar el número en el panel o directo en un cartón siempre da el mismo
  // resultado en los dos lugares, tenga o no tenga el número algún cartón.
  const tableroRow = getTableroRow(req.user.id, sorteo_id);
  const tableroSet = new Set(JSON.parse(tableroRow.numeros));
  const marcando = !tableroSet.has(n);
  if (marcando) tableroSet.add(n); else tableroSet.delete(n);

  const io = req.app.get('io');
  const tx = db.transaction((cartones) => {
    db.prepare('UPDATE tablero_marcas SET numeros = ? WHERE id = ?').run(JSON.stringify([...tableroSet]), tableroRow.id);
    cartones.forEach((c) => {
      const marcados = new Set(JSON.parse(c.marcados));
      if (marcando) marcados.add(n); else marcados.delete(n);
      db.prepare('UPDATE cartones SET marcados = ? WHERE id = ?').run(JSON.stringify([...marcados]), c.id);
    });
  });
  tx(propios);

  const activos = figurasActivas(sorteo_id);
  const actualizados = propios.map((c) => db.prepare('SELECT * FROM cartones WHERE id = ?').get(c.id));
  actualizados.forEach((c) => evaluarReclamos(c, sorteo_id, io));
  res.json({
    ok: true,
    tableroMarcados: [...tableroSet],
    cartones: actualizados.map((c) => ({
      id: c.id,
      marcados: JSON.parse(c.marcados),
      cercaDeGanar: cercaDeGanar(c, activos),
    })),
  });
});

// ---------- RECLAMOS DE BINGO (revisión del administrador) ----------

// Reclamos pendientes de un sorteo, con la info del cartón para poder
// inspeccionarlo visualmente antes de decidir.
router.get('/reclamos', requireAuth, requireAdmin, (req, res) => {
  const { sorteo_id } = req.query;
  let sql = `
    SELECT r.*, j.nombre AS jugador_nombre, j.whatsapp AS jugador_whatsapp,
           c.grid AS carton_grid, c.marcados AS carton_marcados, c.color AS carton_color,
           c.grupo AS carton_grupo, c.letra AS carton_letra
    FROM reclamos r
    LEFT JOIN jugadores j ON j.id = r.jugador_id
    LEFT JOIN cartones c ON c.id = r.carton_id
    WHERE r.estado = 'pendiente'`;
  const params = [];
  if (sorteo_id) { sql += ' AND r.sorteo_id = ?'; params.push(sorteo_id); }
  sql += ' ORDER BY r.fecha ASC';
  const rows = db.prepare(sql).all(...params);
  res.json({
    reclamos: rows.map((r) => ({
      ...r,
      label: getPatternDef(r.patron)?.label || r.patron,
      carton_grid: r.carton_grid ? JSON.parse(r.carton_grid) : null,
      carton_marcados: r.carton_marcados ? JSON.parse(r.carton_marcados) : null,
      // Números que forman la figura reclamada -- se resaltan igual que en
      // un ganador ya confirmado, para que el admin vea de un vistazo qué
      // completó el cartón antes de decidir si validar o invalidar.
      numerosGanadores: r.carton_grid
        ? celdasGanadoras(r.patron, JSON.parse(r.carton_grid), new Set(r.carton_marcados ? JSON.parse(r.carton_marcados) : []))
        : [],
      // Cartones hermanos de la misma carta (combo), para la vista "Carta
      // completa" (ver setting reclamos_carta_completa) — el admin puede
      // querer verificar contra el cartón físico completo (A/B/C/D) en vez
      // de solo el cartón individual que reclamó el bingo.
      cartones_grupo: r.carton_grupo != null
        ? db
            .prepare('SELECT id, numero, letra, grid, marcados, color, estado FROM cartones WHERE sorteo_id = ? AND grupo = ? ORDER BY letra ASC')
            .all(r.sorteo_id, r.carton_grupo)
            .map(parseCard)
        : null,
    })),
  });
});

// Reclamos propios del jugador logueado en un sorteo — para que el sondeo del
// frontend detecte que un reclamo fue validado/invalidado aunque el evento de
// socket en vivo no haya llegado (desconexión de celular), y así el aviso "en
// espera" no se quede pegado en pantalla para siempre.
router.get('/mis-reclamos', requireAuth, (req, res) => {
  const { sorteo_id } = req.query;
  if (!sorteo_id) return res.status(400).json({ error: 'Falta sorteo_id' });
  const rows = db
    .prepare(
      `SELECT r.id, r.estado, r.carton_id, r.carton_numero, r.patron, r.jugado_por_nombre,
              c.grupo, c.letra, c.color, c.grid, c.marcados
       FROM reclamos r LEFT JOIN cartones c ON c.id = r.carton_id
       LEFT JOIN cartones_delegados cd ON cd.carton_id = r.carton_id
       WHERE (r.jugador_id = ? OR cd.jugador_id = ?) AND r.sorteo_id = ?`
    )
    .all(req.user.id, req.user.id, sorteo_id);
  res.json({
    reclamos: rows.map((r) => ({
      ...r,
      label: getPatternDef(r.patron)?.label || r.patron,
      grid: r.grid ? JSON.parse(r.grid) : null,
      marcados: r.marcados ? JSON.parse(r.marcados) : null,
    })),
  });
});

router.put('/reclamos/:id/validar', requireAuth, requireAdmin, (req, res) => {
  const reclamo = db.prepare('SELECT * FROM reclamos WHERE id = ?').get(req.params.id);
  if (!reclamo) return res.status(404).json({ error: 'Reclamo no encontrado' });
  const info = db
    .prepare(`UPDATE reclamos SET estado = 'valido' WHERE id = ? AND estado = 'pendiente'`)
    .run(req.params.id);
  if (info.changes !== 1) return res.status(409).json({ error: 'Este reclamo ya fue resuelto' });

  confirmarGanador({ sorteoId: reclamo.sorteo_id, cartonId: reclamo.carton_id, patron: reclamo.patron, io: req.app.get('io') });

  registrarLog(req, 'ventas', 'Validó un reclamo de bingo', `${getPatternDef(reclamo.patron)?.label || reclamo.patron} (Sorteo #${reclamo.sorteo_id})`);
  res.json({ ok: true });
});

// ---------- BINGO MANUAL (jugadores de cartón físico/papel, fuera de la app) ----------
// El admin busca el cartón por número/combo (ya lo tiene cargado en el panel),
// confirma visualmente que la figura está completa, y la registra como
// ganadora — mismo resultado que validar un reclamo, sin depender de que el
// jugador haya marcado algo dentro de la app.
router.post('/bingo-manual', requireAuth, requireAdmin, (req, res) => {
  const { sorteo_id, carton_id, patron, marcados } = req.body;
  if (!sorteo_id || !carton_id || !patron) {
    return res.status(400).json({ error: 'Faltan sorteo_id, carton_id o patron' });
  }
  const carton = db.prepare('SELECT * FROM cartones WHERE id = ? AND sorteo_id = ?').get(carton_id, sorteo_id);
  if (!carton) return res.status(404).json({ error: 'Ese cartón no pertenece a este sorteo' });

  if (!figurasActivas(sorteo_id).includes(patron)) {
    return res.status(400).json({ error: 'Esa figura ya fue ganada o no pertenece a este sorteo' });
  }

  // El admin "dibuja" a mano los números marcados del cartón de papel; se
  // guardan para que el anuncio de ganador muestre la figura completa.
  if (Array.isArray(marcados)) {
    db.prepare('UPDATE cartones SET marcados = ? WHERE id = ?').run(JSON.stringify(marcados), carton.id);
  }

  confirmarGanador({ sorteoId: Number(sorteo_id), cartonId: carton.id, patron, io: req.app.get('io') });
  registrarLog(req, 'ventas', 'Registró un bingo manual', `${getPatternDef(patron)?.label || patron} (Sorteo #${sorteo_id})`);
  res.json({ ok: true });
});

router.put('/reclamos/:id/invalidar', requireAuth, requireAdmin, (req, res) => {
  const { eliminarCarton } = req.body;
  const reclamo = db.prepare('SELECT * FROM reclamos WHERE id = ?').get(req.params.id);
  if (!reclamo) return res.status(404).json({ error: 'Reclamo no encontrado' });
  const info = db
    .prepare(`UPDATE reclamos SET estado = 'invalido' WHERE id = ? AND estado = 'pendiente'`)
    .run(req.params.id);
  if (info.changes !== 1) return res.status(409).json({ error: 'Este reclamo ya fue resuelto' });

  const io = req.app.get('io');
  if (eliminarCarton && reclamo.carton_id) {
    db.prepare('DELETE FROM cartones WHERE id = ?').run(reclamo.carton_id);
    io.to(`sorteo-${reclamo.sorteo_id}`).emit('cartones-actualizados', { sorteoId: reclamo.sorteo_id });
  }
  // Avisa al jugador que reclamó (si sigue con la sala de juego abierta) que
  // su reclamo se resolvió como inválido, para que su aviso de "en espera" no
  // se quede colgado.
  io.to(`sorteo-${reclamo.sorteo_id}`).emit('bingo-reclamo-resuelto', {
    sorteoId: reclamo.sorteo_id,
    reclamoId: reclamo.id,
    cartonId: reclamo.carton_id,
    cartonNumero: reclamo.carton_numero,
    patron: reclamo.patron,
    estado: 'invalido',
  });
  registrarLog(req, 'ventas', 'Invalidó un reclamo de bingo', `${getPatternDef(reclamo.patron)?.label || reclamo.patron} (Sorteo #${reclamo.sorteo_id})`);
  res.json({ ok: true });
});

module.exports = router;
