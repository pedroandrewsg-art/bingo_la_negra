// routes/sorteos.js
const express = require('express');
const db = require('../db');
const { requireAuth, requireAdmin } = require('../authMiddleware');
const { obtenerPlantillas } = require('../plantillas');
const { listPatterns, checkPattern } = require('../patterns');
const WHATSAPP_LIVE_DEFAULTS = require('../whatsappLiveDefaults');
const { registrarLog } = require('../logActividad');

const router = express.Router();

// Encabezado/pie de página se guardan también acá (fuera de la tabla sorteos)
// para que sobrevivan aunque se elimine el sorteo — así el admin no tiene que
// volver a escribirlos cada vez que arma un sorteo nuevo.
function getSetting(key) {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
  return row ? row.value : '';
}
function setSetting(key, value) {
  const info = db.prepare('UPDATE settings SET value = ? WHERE key = ?').run(value, key);
  if (!info.changes) db.prepare('INSERT INTO settings (key, value) VALUES (?, ?)').run(key, value);
}

// Textos/emoji configurables del módulo "WhatsApp Live" (ver whatsappLiveDefaults.js).
// Sin `|| DEFAULT` a propósito: db.js ya siembra estas claves al arrancar, así
// que la fila siempre existe — pero un admin puede guardar un valor vacío
// intencionalmente (ej. "no quiero pie de página"), y '' también es falsy en
// JS, así que `|| DEFAULT` repondría el default cada vez que alguien lo borra.
function getWhatsappLiveSettings() {
  const out = {};
  Object.keys(WHATSAPP_LIVE_DEFAULTS).forEach((k) => { out[k] = getSetting(k); });
  return out;
}

const EMOJI_DIGITS = ['0️⃣', '1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣'];
function numeroAEmojis(num) {
  return String(num).padStart(2, '0').split('').map((d) => EMOJI_DIGITS[+d]).join('');
}

// Cartones de un sorteo (con el nombre de su dueño si tiene) agrupados por conjunto/combo.
// Un conjunto siempre se vende completo, así que comparte estado y dueño entre sus cartones.
function cartonesConDueno(sorteoId) {
  return db
    .prepare(
      `SELECT c.numero, c.estado, c.grupo, j.nombre FROM cartones c LEFT JOIN jugadores j ON j.id = c.owner_id
       WHERE c.sorteo_id = ? ORDER BY c.numero ASC`
    )
    .all(sorteoId);
}

function agruparPorConjunto(rows) {
  const mapa = new Map();
  rows.forEach((r) => {
    if (!mapa.has(r.grupo)) mapa.set(r.grupo, []);
    mapa.get(r.grupo).push(r);
  });
  return [...mapa.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([grupo, cards]) => ({
      grupo,
      numeros: cards.map((c) => c.numero),
      disponible: cards.every((c) => c.estado === 'disponible'),
      pagado: cards.every((c) => c.estado === 'pagado'),
      nombre: cards.find((c) => c.nombre)?.nombre,
    }));
}

// Mismo formato de siempre (#N / dígitos-emoji), pero el número mostrado es el del
// conjunto (grupo de venta), no el del cartón físico individual.
function etiquetaConjunto(g) {
  return '#' + g.grupo;
}
function etiquetaConjuntoEmoji(g) {
  return numeroAEmojis(g.grupo);
}

function computeStats(sorteoId) {
  const sorteo = db.prepare('SELECT * FROM sorteos WHERE id = ?').get(sorteoId);
  if (!sorteo) return null;
  // Se cuenta por "Carta" (grupo/combo), no por cartón físico: un combo x4
  // vendido cuenta como 1, no 4 — la representación numérica es siempre la carta.
  const vendidos = db.prepare("SELECT COUNT(DISTINCT grupo) c FROM cartones WHERE sorteo_id = ? AND estado IN ('vendido','pagado')").get(sorteoId).c;
  const pagados = db.prepare("SELECT COUNT(DISTINCT grupo) c FROM cartones WHERE sorteo_id = ? AND estado = 'pagado'").get(sorteoId).c;
  const totalCartones = db.prepare('SELECT COUNT(DISTINCT grupo) c FROM cartones WHERE sorteo_id = ?').get(sorteoId).c;
  const recaudado = db
    .prepare("SELECT COALESCE(SUM(monto),0) s FROM ventas WHERE sorteo_id = ? AND estatus = 'completado'")
    .get(sorteoId).s;

  const figurasRows = db
    .prepare('SELECT patron, porcentaje, monto, cerrada FROM sorteo_patrones WHERE sorteo_id = ? ORDER BY orden ASC, id ASC')
    .all(sorteoId);

  // La ganancia del admin depende del modo de premio del sorteo:
  //  - porcentaje: la ganancia es el % configurado, el resto es el premio acumulado.
  //  - monto_fijo: los premios ya son montos fijos definidos; la ganancia es
  //    simplemente lo que sobra de lo recaudado (no depende de ningún %).
  //  - sin_premio: todavía no hay montos definidos, así que no hay premio que
  //    restar — todo lo recaudado es ganancia por ahora.
  let gananciaActual;
  let premioAcumulado;
  if (sorteo.modo_premio === 'monto_fijo') {
    const totalMontosFijos = +figurasRows.reduce((s, f) => s + (f.monto || 0), 0).toFixed(2);
    premioAcumulado = totalMontosFijos;
    gananciaActual = +(recaudado - totalMontosFijos).toFixed(2);
  } else if (sorteo.modo_premio === 'sin_premio') {
    premioAcumulado = 0;
    gananciaActual = recaudado;
  } else {
    gananciaActual = +(recaudado * (sorteo.porcentaje_ganancia / 100)).toFixed(2);
    premioAcumulado = +(recaudado - gananciaActual).toFixed(2);
  }

  // Incluye todo lo necesario para reconstruir la ventana de "¡BINGO!" desde
  // esta sola consulta (grid, marcados, color, dueño) — así el frontend no
  // depende únicamente del evento de socket en vivo para mostrarla; puede
  // reconstruirla igual de completa a partir de un simple GET (reconexión,
  // sondeo periódico, etc.), robusto ante desconexiones de WebSocket en
  // celulares (pantalla bloqueada, cambio de red, app en segundo plano).
  // Puede haber varios ganadores para la misma figura (bingo "corrido": 2+
  // jugadores completan la figura casi al mismo tiempo y el admin valida a
  // todos) — por eso esto es un array por patrón, no un ganador único.
  const ganadoresRows = db
    .prepare(
      `SELECT g.id AS ganador_id, g.patron, g.premio, g.fecha, g.jugador_id, g.carton_id,
              j.nombre AS jugador_nombre, c.numero AS carton_numero, c.grupo AS carton_grupo,
              c.letra AS carton_letra, c.color AS carton_color, c.grid AS carton_grid, c.marcados AS carton_marcados
       FROM ganadores g LEFT JOIN jugadores j ON j.id = g.jugador_id LEFT JOIN cartones c ON c.id = g.carton_id
       WHERE g.sorteo_id = ? ORDER BY g.fecha ASC, g.id ASC`
    )
    .all(sorteoId);
  const ganadoresPorPatron = new Map();
  ganadoresRows.forEach((g) => {
    if (!ganadoresPorPatron.has(g.patron)) ganadoresPorPatron.set(g.patron, []);
    ganadoresPorPatron.get(g.patron).push(g);
  });
  const patronesCatalogo = new Map(listPatterns().map((p) => [p.key, p]));
  const figuras = figurasRows.map((f) => {
    const ganadoresFigura = ganadoresPorPatron.get(f.patron) || [];
    const premio = sorteo.modo_premio === 'monto_fijo' ? +(f.monto || 0).toFixed(2)
      : sorteo.modo_premio === 'sin_premio' ? 0
      : +(premioAcumulado * (f.porcentaje / 100)).toFixed(2);
    return {
      patron: f.patron,
      label: patronesCatalogo.get(f.patron)?.label || f.patron,
      preview: patronesCatalogo.get(f.patron)?.preview || null,
      porcentaje: f.porcentaje,
      monto: f.monto,
      premio,
      cerrada: !!f.cerrada,
      ganada: ganadoresFigura.length > 0,
      // Se mantiene `ganador` (singular, el primero) por compatibilidad con
      // código que todavía no fue migrado a la lista; el frontend nuevo usa `ganadores`.
      ganador: ganadoresFigura[0] ? {
        ganadorId: ganadoresFigura[0].ganador_id,
        jugador: ganadoresFigura[0].jugador_nombre,
        jugadorId: ganadoresFigura[0].jugador_id,
        cartonId: ganadoresFigura[0].carton_id,
        cartonNumero: ganadoresFigura[0].carton_numero,
        grupo: ganadoresFigura[0].carton_grupo,
        letra: ganadoresFigura[0].carton_letra,
        color: ganadoresFigura[0].carton_color,
        grid: ganadoresFigura[0].carton_grid ? JSON.parse(ganadoresFigura[0].carton_grid) : null,
        marcados: ganadoresFigura[0].carton_marcados ? JSON.parse(ganadoresFigura[0].carton_marcados) : null,
        fecha: ganadoresFigura[0].fecha,
        premio: ganadoresFigura[0].premio,
      } : null,
      ganadores: ganadoresFigura.map((g) => ({
        ganadorId: g.ganador_id,
        jugador: g.jugador_nombre,
        jugadorId: g.jugador_id,
        cartonId: g.carton_id,
        cartonNumero: g.carton_numero,
        grupo: g.carton_grupo,
        letra: g.carton_letra,
        color: g.carton_color,
        grid: g.carton_grid ? JSON.parse(g.carton_grid) : null,
        marcados: g.carton_marcados ? JSON.parse(g.carton_marcados) : null,
        fecha: g.fecha,
        premio: g.premio,
      })),
    };
  });

  return { ...sorteo, vendidos, pagados, totalCartones, recaudado, gananciaActual, premioAcumulado, figuras };
}

// Figuras de un sorteo que todavía aceptan ganadores (compartida con
// routes/cartones.js, que la usa para decidir contra qué figuras evaluar el
// marcado manual de un jugador). Una figura sigue "activa" aunque ya tenga
// uno o más ganadores — varios jugadores pueden pegar bingo legítimamente en
// la misma figura (bingo "corrido") — hasta que el admin la cierra a mano
// con "Cerrar figura" (columna `cerrada`).
function figurasActivas(sorteoId) {
  return db
    .prepare('SELECT patron FROM sorteo_patrones WHERE sorteo_id = ? AND cerrada = 0')
    .all(sorteoId)
    .map((r) => r.patron);
}

router.get('/patrones', (req, res) => {
  res.json({ patrones: listPatterns() });
});

// ---------- VERIFICACIÓN PÚBLICA (sin login) ----------
// Para que un jugador confirme, antes de entrar, si su nombre/número ya
// está en la lista de un sorteo en curso — mismo dato que ya se comparte
// como texto por WhatsApp, solo que buscable dentro de la app.
router.get('/publicos', (req, res) => {
  const rows = db
    .prepare("SELECT id, color, fecha_hora, estatus FROM sorteos WHERE estatus IN ('activo','en_juego') ORDER BY fecha_hora ASC")
    .all();
  res.json({ sorteos: rows });
});

router.get('/:id/lista-publica', (req, res) => {
  const sorteo = db.prepare('SELECT id FROM sorteos WHERE id = ?').get(req.params.id);
  if (!sorteo) return res.status(404).json({ error: 'Sorteo no encontrado' });
  const conjuntos = agruparPorConjunto(cartonesConDueno(req.params.id)).filter((g) => !g.disponible);
  res.json({
    lista: conjuntos.map((g) => ({ etiqueta: etiquetaConjunto(g), nombre: g.nombre || '', pagado: g.pagado })),
  });
});

router.get('/', requireAuth, requireAdmin, (req, res) => {
  const rows = db.prepare('SELECT id FROM sorteos ORDER BY id DESC').all();
  res.json({ sorteos: rows.map((r) => computeStats(r.id)) });
});

router.get('/:id', requireAuth, requireAdmin, (req, res) => {
  const s = computeStats(req.params.id);
  if (!s) return res.status(404).json({ error: 'Sorteo no encontrado' });
  res.json({ sorteo: s });
});

router.post('/', requireAuth, requireAdmin, (req, res) => {
  const {
    fecha_hora, rango_desde, rango_hasta, tipo_venta, costo, porcentaje_ganancia, figuras, catalogo_imagenes_id,
  } = req.body;
  const modoPremio = ['porcentaje', 'monto_fijo', 'sin_premio'].includes(req.body.modo_premio) ? req.body.modo_premio : 'porcentaje';

  if (!fecha_hora || rango_desde == null || rango_hasta == null || !tipo_venta || costo == null || porcentaje_ganancia == null || !Array.isArray(figuras) || !figuras.length) {
    return res.status(400).json({ error: 'Faltan campos requeridos' });
  }
  // BINGOLANEGRA ya solo juega con cartones personalizados (imágenes reales que
  // el admin sube como catálogo) — ya no se generan grids al azar para vender.
  if (catalogo_imagenes_id == null || catalogo_imagenes_id === '') {
    return res.status(400).json({ error: 'Elige un catálogo de cartones personalizados' });
  }
  // El sistema solo admite un sorteo activo a la vez (el jugador ve las cartas
  // disponibles directo al loguearse, sin tener que elegir entre varios).
  const yaActivo = db.prepare("SELECT id, fecha_hora FROM sorteos WHERE estatus IN ('activo','en_juego','pausado') LIMIT 1").get();
  if (yaActivo) {
    return res.status(400).json({ error: `Ya hay un sorteo activo (#${yaActivo.id}, ${yaActivo.fecha_hora}). Debes finalizarlo o eliminarlo antes de crear uno nuevo.` });
  }
  const patronesValidos = new Set(listPatterns().map((p) => p.key));
  for (const f of figuras) {
    if (!patronesValidos.has(f.patron)) return res.status(400).json({ error: `Patrón inválido: ${f.patron}` });
    if (modoPremio === 'porcentaje' && (typeof f.porcentaje !== 'number' || f.porcentaje <= 0)) {
      return res.status(400).json({ error: 'Cada figura debe tener un % mayor a 0' });
    }
    if (modoPremio === 'monto_fijo' && (typeof f.monto !== 'number' || f.monto <= 0)) {
      return res.status(400).json({ error: 'Cada figura debe tener un monto en Bs mayor a 0' });
    }
  }
  if (modoPremio === 'porcentaje') {
    const sumaPorcentajes = +figuras.reduce((s, f) => s + f.porcentaje, 0).toFixed(2);
    if (sumaPorcentajes !== 100) {
      return res.status(400).json({ error: `El % de las figuras debe sumar 100 (suma actual: ${sumaPorcentajes})` });
    }
  }
  const desde = parseInt(rango_desde, 10);
  const hasta = parseInt(rango_hasta, 10);
  if (hasta < desde) return res.status(400).json({ error: 'El rango es inválido' });
  // El rango (desde-hasta) representa cuántos combos/grupos de venta hay, no cartones físicos:
  // con combo x4, "100" cartones son en realidad 100 grupos de 4 = 400 cartones físicos.
  const totalGrupos = hasta - desde + 1;
  const total = totalGrupos * tipo_venta;

  // El color del sorteo se toma del catálogo (se asigna una sola vez, al
  // crear el catálogo) — ya no se elige por separado al crear el sorteo.
  const catalogo = db.prepare('SELECT id, nombre, color FROM catalogos_imagenes WHERE id = ?').get(catalogo_imagenes_id);
  if (!catalogo) return res.status(400).json({ error: 'El catálogo de cartones personalizados elegido no existe' });
  const disponibles = db.prepare('SELECT COUNT(*) c FROM catalogo_imagenes_items WHERE catalogo_id = ?').get(catalogo_imagenes_id).c;
  if (disponibles < total) {
    return res.status(400).json({ error: `El catálogo "${catalogo.nombre}" solo tiene ${disponibles} imágenes, pero este sorteo necesita ${total}` });
  }
  const catalogoId = catalogo.id;
  const color = catalogo.color;

  const info = db
    .prepare(
      `INSERT INTO sorteos (fecha_hora, rango_desde, rango_hasta, color, tipo_venta, costo, porcentaje_ganancia, modo_premio, patron, estatus, numeros_extraidos, encabezado, pie_pagina, catalogo_imagenes_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'activo', '[]', ?, ?, ?)`
    )
    .run(fecha_hora, desde, hasta, color, tipo_venta, costo, porcentaje_ganancia, modoPremio, figuras[0].patron, getSetting('default_encabezado'), getSetting('default_pie_pagina'), catalogoId);
  const sorteoId = info.lastInsertRowid;

  const insertFigura = db.prepare('INSERT INTO sorteo_patrones (sorteo_id, patron, porcentaje, monto, orden) VALUES (?, ?, ?, ?, ?)');
  figuras.forEach((f, i) => insertFigura.run(sorteoId, f.patron, f.porcentaje || 0, f.monto != null ? f.monto : null, i));

  try {
    const plantillas = obtenerPlantillas(color, tipo_venta, desde, hasta);
    const insertCard = db.prepare(
      `INSERT INTO cartones (numero, color, grid, sorteo_id, grupo, letra, estado, marcados)
       VALUES (?, ?, ?, ?, ?, ?, 'disponible', '[]')`
    );
    const tx = db.transaction((rows) => {
      rows.forEach((p) => insertCard.run(p.numero, color, p.grid, sorteoId, p.carta, p.letra));
    });
    tx(plantillas);
  } catch (e) {
    db.prepare('DELETE FROM sorteos WHERE id = ?').run(sorteoId);
    return res.status(400).json({ error: e.message });
  }

  req.app.get('io').emit('sorteos-cambio', {});
  registrarLog(req, 'sorteos', 'Creó un sorteo', `${color} · ${fecha_hora}`);
  res.json({ sorteo: computeStats(sorteoId) });
});

// Campos que afectan lo que ve cualquiera mirando la lista de sorteos (no solo
// quien está dentro del panel de ese sorteo en particular).
const CAMPOS_VISIBLES_EN_LISTA = ['fecha_hora', 'color', 'costo', 'porcentaje_ganancia', 'estatus'];

router.put('/:id', requireAuth, requireAdmin, (req, res) => {
  const id = req.params.id;
  const existing = db.prepare('SELECT * FROM sorteos WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ error: 'No encontrado' });
  const fields = ['fecha_hora', 'color', 'costo', 'porcentaje_ganancia', 'estatus', 'encabezado', 'pie_pagina', 'catalogo_imagenes_id'];
  const updates = [];
  const values = [];
  fields.forEach((f) => {
    if (req.body[f] !== undefined) {
      updates.push(`${f} = ?`);
      values.push(req.body[f]);
    }
  });
  if (updates.length) {
    values.push(id);
    db.prepare(`UPDATE sorteos SET ${updates.join(', ')} WHERE id = ?`).run(...values);
  }
  // Guarda una copia fuera de la tabla sorteos: así el encabezado/pie que el
  // admin ya armó sigue disponible (y se usa de nuevo en el próximo sorteo)
  // aunque este sorteo se elimine más adelante.
  if (req.body.encabezado !== undefined) setSetting('default_encabezado', req.body.encabezado);
  if (req.body.pie_pagina !== undefined) setSetting('default_pie_pagina', req.body.pie_pagina);
  if (CAMPOS_VISIBLES_EN_LISTA.some((f) => req.body[f] !== undefined)) {
    req.app.get('io').emit('sorteos-cambio', {});
  }
  // encabezado/pie_pagina quedan afuera del log: WhatsappLivePanel los
  // autoguarda solo (cada vez que el admin deja de escribir), asi que
  // registrarlos aca inundaria el registro con un "Editó un sorteo" por
  // cada tecla -- esta ruta generica tambien recibe esas dos llamadas.
  const huboCambioRelevante =
    ['fecha_hora', 'color', 'costo', 'porcentaje_ganancia', 'estatus', 'catalogo_imagenes_id'].some((f) => req.body[f] !== undefined) ||
    req.body.pronto_pago_activo !== undefined;
  if (huboCambioRelevante) registrarLog(req, 'sorteos', 'Editó un sorteo', `Sorteo #${id} (${existing.color})`);
  res.json({ sorteo: computeStats(id) });
});

router.delete('/:id', requireAuth, requireAdmin, (req, res) => {
  const sorteo = db.prepare('SELECT color, fecha_hora FROM sorteos WHERE id = ?').get(req.params.id);
  db.prepare('DELETE FROM reclamos WHERE sorteo_id = ?').run(req.params.id);
  db.prepare('DELETE FROM ganadores WHERE sorteo_id = ?').run(req.params.id);
  db.prepare('DELETE FROM ventas WHERE sorteo_id = ?').run(req.params.id);
  db.prepare('DELETE FROM cartones WHERE sorteo_id = ?').run(req.params.id);
  db.prepare('DELETE FROM tablero_marcas WHERE sorteo_id = ?').run(req.params.id);
  db.prepare('DELETE FROM sorteos WHERE id = ?').run(req.params.id);
  req.app.get('io').emit('sorteos-cambio', {});
  registrarLog(req, 'sorteos', 'Eliminó un sorteo', sorteo ? `Sorteo #${req.params.id} (${sorteo.color} · ${sorteo.fecha_hora})` : `Sorteo #${req.params.id}`);
  res.json({ ok: true });
});

// Saca una figura del juego activo (ej. se decide no jugarla más). No se puede
// quitar una figura que ya tiene ganador registrado.
router.delete('/:id/figuras/:patron', requireAuth, requireAdmin, (req, res) => {
  const { id, patron } = req.params;
  const yaGanada = db.prepare('SELECT id FROM ganadores WHERE sorteo_id = ? AND patron = ?').get(id, patron);
  if (yaGanada) return res.status(400).json({ error: 'No se puede eliminar una figura que ya fue ganada' });
  const info = db.prepare('DELETE FROM sorteo_patrones WHERE sorteo_id = ? AND patron = ?').run(id, patron);
  if (!info.changes) return res.status(404).json({ error: 'Figura no encontrada en este sorteo' });

  const io = req.app.get('io');
  io.emit('sorteos-cambio', {});
  io.to(`sorteo-${id}`).emit('cartones-actualizados', { sorteoId: Number(id) });

  if (!figurasActivas(id).length) {
    db.prepare(`UPDATE sorteos SET estatus = 'finalizado' WHERE id = ?`).run(id);
    io.to(`sorteo-${id}`).emit('sorteo-finalizado', { sorteoId: Number(id) });
    io.emit('sorteos-cambio', {});
  }

  registrarLog(req, 'sorteos', 'Quitó una figura', `${patron} (Sorteo #${id})`);
  res.json({ sorteo: computeStats(id) });
});

// Cierra una figura que ya tiene uno o más ganadores validados, para dejar
// de aceptar más reclamos de esa figura (bingo "corrido": el admin junta
// todos los bingos simultáneos y después cierra). A diferencia de DELETE
// /figuras/:patron (que saca una figura sin ganador), acá la figura y su(s)
// ganador(es) quedan intactos como historial — solo se marca `cerrada`.
router.put('/:id/figuras/:patron/cerrar', requireAuth, requireAdmin, (req, res) => {
  const { id, patron } = req.params;
  const info = db.prepare('UPDATE sorteo_patrones SET cerrada = 1 WHERE sorteo_id = ? AND patron = ?').run(id, patron);
  if (!info.changes) return res.status(404).json({ error: 'Figura no encontrada en este sorteo' });

  const io = req.app.get('io');
  io.emit('sorteos-cambio', {});
  io.to(`sorteo-${id}`).emit('cartones-actualizados', { sorteoId: Number(id) });

  if (!figurasActivas(id).length) {
    db.prepare(`UPDATE sorteos SET estatus = 'finalizado' WHERE id = ?`).run(id);
    io.to(`sorteo-${id}`).emit('sorteo-finalizado', { sorteoId: Number(id) });
    io.emit('sorteos-cambio', {});
  }

  registrarLog(req, 'sorteos', 'Cerró una figura', `${patron} (Sorteo #${id})`);
  res.json({ sorteo: computeStats(id) });
});

// Reemplaza el conjunto de figuras "en juego" (todavía sin ganador) de un
// sorteo ya creado: permite agregar figuras nuevas, sacar las que sobren y
// cambiar montos/porcentajes, sin tocar las que ya tienen ganador registrado
// (esas quedan tal cual, como historial). Misma validación que al crear el
// sorteo: cada figura necesita %/monto válido, y en modo "porcentaje" la
// suma de TODAS las figuras (ganadas + las nuevas) debe dar 100.
router.put('/:id/figuras', requireAuth, requireAdmin, (req, res) => {
  const { id } = req.params;
  const sorteo = db.prepare('SELECT * FROM sorteos WHERE id = ?').get(id);
  if (!sorteo) return res.status(404).json({ error: 'Sorteo no encontrado' });
  const { figuras } = req.body;
  if (!Array.isArray(figuras)) return res.status(400).json({ error: 'Falta la lista de figuras' });

  const ganadasSet = new Set(db.prepare('SELECT DISTINCT patron FROM ganadores WHERE sorteo_id = ?').all(id).map((r) => r.patron));
  const ganadasRows = db.prepare('SELECT * FROM sorteo_patrones WHERE sorteo_id = ?').all(id).filter((r) => ganadasSet.has(r.patron));

  const patronesValidos = new Set(listPatterns().map((p) => p.key));
  const vistos = new Set();
  for (const f of figuras) {
    if (!patronesValidos.has(f.patron)) return res.status(400).json({ error: `Patrón inválido: ${f.patron}` });
    if (ganadasSet.has(f.patron)) return res.status(400).json({ error: `"${f.patron}" ya tiene ganador, no se puede modificar` });
    if (vistos.has(f.patron)) return res.status(400).json({ error: `Figura repetida: ${f.patron}` });
    vistos.add(f.patron);
    if (sorteo.modo_premio === 'porcentaje' && (typeof f.porcentaje !== 'number' || f.porcentaje <= 0)) {
      return res.status(400).json({ error: 'Cada figura debe tener un % mayor a 0' });
    }
    if (sorteo.modo_premio === 'monto_fijo' && (typeof f.monto !== 'number' || f.monto <= 0)) {
      return res.status(400).json({ error: 'Cada figura debe tener un monto en Bs mayor a 0' });
    }
  }
  if (!figuras.length && !ganadasRows.length) {
    return res.status(400).json({ error: 'El sorteo debe tener al menos una figura' });
  }
  if (sorteo.modo_premio === 'porcentaje') {
    const sumaGanadas = ganadasRows.reduce((s, f) => s + f.porcentaje, 0);
    const sumaNuevas = figuras.reduce((s, f) => s + f.porcentaje, 0);
    const suma = +(sumaGanadas + sumaNuevas).toFixed(2);
    if (suma !== 100) {
      return res.status(400).json({ error: `El % de todas las figuras (incluidas las ya ganadas) debe sumar 100 (suma actual: ${suma})` });
    }
  }

  const tx = db.transaction(() => {
    const actuales = db.prepare('SELECT patron FROM sorteo_patrones WHERE sorteo_id = ?').all(id);
    const delStmt = db.prepare('DELETE FROM sorteo_patrones WHERE sorteo_id = ? AND patron = ?');
    actuales.forEach((r) => { if (!ganadasSet.has(r.patron)) delStmt.run(id, r.patron); });
    const insertFigura = db.prepare('INSERT INTO sorteo_patrones (sorteo_id, patron, porcentaje, monto, orden) VALUES (?, ?, ?, ?, ?)');
    const ordenBase = ganadasRows.length;
    figuras.forEach((f, i) => insertFigura.run(id, f.patron, f.porcentaje || 0, f.monto != null ? f.monto : null, ordenBase + i));
  });
  tx();

  // Si el sorteo se había finalizado (ej. se habían quitado todas las
  // figuras) y ahora vuelve a tener alguna en juego, lo reabre.
  if (sorteo.estatus === 'finalizado' && figurasActivas(id).length) {
    db.prepare("UPDATE sorteos SET estatus = 'en_juego' WHERE id = ?").run(id);
  }

  const io = req.app.get('io');
  io.emit('sorteos-cambio', {});
  io.to(`sorteo-${id}`).emit('cartones-actualizados', { sorteoId: Number(id) });
  registrarLog(req, 'sorteos', 'Actualizó las figuras', `Sorteo #${id}`);
  res.json({ sorteo: computeStats(id) });
});

// Amplía o reduce la cantidad de cartas/combos a la venta de un sorteo ya
// creado. Ampliar genera cartones nuevos para los números agregados (mismo
// catálogo de plantillas que al crear el sorteo). Reducir solo se permite si
// ninguno de los cartones que quedarían fuera del rango ya fue apartado o
// vendido — para no borrarle un cartón a alguien que ya pagó o reservó.
router.put('/:id/rango', requireAuth, requireAdmin, (req, res) => {
  const { id } = req.params;
  const sorteo = db.prepare('SELECT * FROM sorteos WHERE id = ?').get(id);
  if (!sorteo) return res.status(404).json({ error: 'Sorteo no encontrado' });
  const nuevoHasta = parseInt(req.body.rango_hasta, 10);
  if (!Number.isFinite(nuevoHasta) || nuevoHasta < sorteo.rango_desde) {
    return res.status(400).json({ error: 'Rango inválido' });
  }
  if (nuevoHasta === sorteo.rango_hasta) {
    return res.json({ sorteo: computeStats(id) });
  }

  if (nuevoHasta > sorteo.rango_hasta) {
    try {
      const plantillas = obtenerPlantillas(sorteo.color, sorteo.tipo_venta, sorteo.rango_hasta + 1, nuevoHasta);
      const insertCard = db.prepare(
        `INSERT INTO cartones (numero, color, grid, sorteo_id, grupo, letra, estado, marcados)
         VALUES (?, ?, ?, ?, ?, ?, 'disponible', '[]')`
      );
      const tx = db.transaction((rows) => {
        rows.forEach((p) => insertCard.run(p.numero, sorteo.color, p.grid, id, p.carta, p.letra));
      });
      tx(plantillas);
    } catch (e) {
      return res.status(400).json({ error: e.message });
    }
  } else {
    const noDisponibles = db
      .prepare("SELECT COUNT(*) AS n FROM cartones WHERE sorteo_id = ? AND grupo > ? AND estado != 'disponible'")
      .get(id, nuevoHasta).n;
    if (noDisponibles > 0) {
      return res.status(400).json({ error: `No se puede reducir: hay ${noDisponibles} cartón(es) ya apartados o vendidos en las cartas que se quitarían.` });
    }
    db.prepare('DELETE FROM cartones WHERE sorteo_id = ? AND grupo > ?').run(id, nuevoHasta);
  }

  db.prepare('UPDATE sorteos SET rango_hasta = ? WHERE id = ?').run(nuevoHasta, id);
  const io = req.app.get('io');
  io.emit('sorteos-cambio', {});
  io.to(`sorteo-${id}`).emit('cartones-actualizados', { sorteoId: Number(id) });
  registrarLog(req, 'sorteos', 'Cambió el rango de cartas', `Sorteo #${id}: hasta #${nuevoHasta}`);
  res.json({ sorteo: computeStats(id) });
});

// Texto formateado para WhatsApp
router.get('/:id/vendidos-texto', requireAuth, requireAdmin, (req, res) => {
  const sorteo = db.prepare('SELECT * FROM sorteos WHERE id = ?').get(req.params.id);
  if (!sorteo) return res.status(404).json({ error: 'No encontrado' });
  const conjuntos = agruparPorConjunto(cartonesConDueno(req.params.id)).filter((g) => !g.disponible);
  let text = `*BINGO ${sorteo.color.toUpperCase()} - VENDIDOS*\nFecha: ${sorteo.fecha_hora}\n\n`;
  text += conjuntos.map((g) => `${etiquetaConjunto(g)} - ${g.nombre || 'N/A'}${g.pagado ? ' ⭐' : ''}`).join('\n');
  text += `\n\nTotal vendidos: ${conjuntos.length}`;
  res.json({ texto: text });
});

router.get('/:id/disponibles-texto', requireAuth, requireAdmin, (req, res) => {
  const sorteo = db.prepare('SELECT * FROM sorteos WHERE id = ?').get(req.params.id);
  if (!sorteo) return res.status(404).json({ error: 'No encontrado' });
  const cfg = getWhatsappLiveSettings();
  const conjuntos = agruparPorConjunto(cartonesConDueno(req.params.id)).filter((g) => g.disponible);
  const total = conjuntos.length;
  const encabezado = cfg.disponibles_encabezado.replace(/\{color\}/gi, sorteo.color.toUpperCase());
  let text = `${encabezado}\n\n`;
  if (total) text += `*Quedan ${total} cartones libres:*\n\n`;
  text += total ? conjuntos.map((g) => etiquetaConjuntoEmoji(g)).join('\n') : 'No quedan cartones disponibles.';
  if (total) text += `\n\n${cfg.disponibles_pie}`;
  res.json({ texto: text.trim() });
});

// Lista completa (disponibles + apartados + pagados) con encabezado/pie configurables,
// lista para copiar y enviar al grupo de WhatsApp.
router.get('/:id/lista-texto', requireAuth, requireAdmin, (req, res) => {
  const sorteo = db.prepare('SELECT * FROM sorteos WHERE id = ?').get(req.params.id);
  if (!sorteo) return res.status(404).json({ error: 'No encontrado' });
  const cfg = getWhatsappLiveSettings();
  const conjuntos = agruparPorConjunto(cartonesConDueno(req.params.id));
  const cuerpo = conjuntos
    .map((g) => {
      const num = etiquetaConjuntoEmoji(g);
      if (g.disponible) return num;
      const marca = g.pagado ? ` ${cfg.pagado_emoji}` : '';
      return `${num} ${g.nombre || ''}${marca}`;
    })
    .join('\n');
  const texto = [sorteo.encabezado, '', cuerpo, '', sorteo.pie_pagina].filter((s) => s !== undefined).join('\n').trim();
  res.json({ texto });
});

// Cartones apartados (vendido) que aún no han confirmado el pago — para recordarles.
router.get('/:id/pendientes-texto', requireAuth, requireAdmin, (req, res) => {
  const sorteo = db.prepare('SELECT * FROM sorteos WHERE id = ?').get(req.params.id);
  if (!sorteo) return res.status(404).json({ error: 'No encontrado' });
  const cfg = getWhatsappLiveSettings();
  const conjuntos = agruparPorConjunto(cartonesConDueno(req.params.id)).filter((g) => !g.disponible && !g.pagado);
  const total = conjuntos.length;
  let texto = `${cfg.pendientes_encabezado}\n\n`;
  if (total) texto += `*Pendientes por pagar: ${total} cartones:*\n\n`;
  texto += total
    ? conjuntos.map((g) => `${etiquetaConjuntoEmoji(g)} ${(g.nombre || 'N/A').toUpperCase()} ${cfg.pendiente_emoji}`).join('\n')
    : 'No hay cartones pendientes de pago.';
  if (total) texto += `\n\n${cfg.pendientes_pie}`;
  res.json({ texto: texto.trim() });
});

// Datos crudos (sin formatear a texto) para armar la vista previa "WhatsApp
// Live" en el frontend — evita reimplementar acá numeroAEmojis/agrupación;
// el armado final (encabezado/pie/emoji configurables) se hace en el cliente,
// mirror de las rutas *-texto de arriba (mantener ambos lados en sync).
router.get('/:id/whatsapp-live-datos', requireAuth, requireAdmin, (req, res) => {
  const sorteo = db.prepare('SELECT * FROM sorteos WHERE id = ?').get(req.params.id);
  if (!sorteo) return res.status(404).json({ error: 'No encontrado' });
  const conjuntos = agruparPorConjunto(cartonesConDueno(req.params.id)).map((g) => ({
    grupo: g.grupo,
    etiquetaEmoji: etiquetaConjuntoEmoji(g),
    nombre: g.nombre || null,
    disponible: g.disponible,
    pagado: g.pagado,
  }));
  res.json({
    sorteo: {
      id: sorteo.id,
      color: sorteo.color,
      fecha_hora: sorteo.fecha_hora,
      estatus: sorteo.estatus,
      encabezado: sorteo.encabezado,
      pie_pagina: sorteo.pie_pagina,
    },
    conjuntos,
  });
});

// Libera en bloque todos los cartones apartados (vendido) sin pago confirmado
router.put('/:id/liberar-pendientes', requireAuth, requireAdmin, (req, res) => {
  const info = db
    .prepare(`UPDATE cartones SET estado = 'disponible', owner_id = NULL, marcados = '[]' WHERE sorteo_id = ? AND estado = 'vendido'`)
    .run(req.params.id);
  if (info.changes) req.app.get('io').to(`sorteo-${req.params.id}`).emit('cartones-actualizados', { sorteoId: Number(req.params.id) });
  if (info.changes) registrarLog(req, 'cartones', 'Liberó pendientes en bloque', `${info.changes} cartón(es) (Sorteo #${req.params.id})`);
  res.json({ ok: true, liberados: info.changes });
});

module.exports = { router, computeStats, figurasActivas };
