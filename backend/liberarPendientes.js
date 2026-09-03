// liberarPendientes.js — Libera automáticamente los cartones 'vendido'
// (apartados, pago sin verificar) cuyo tiempo de espera configurado (ver
// settings.liberacion_pendientes_minutos, editable desde Configuración →
// Cartones) ya venció, para que vuelvan a estar disponibles para otro
// jugador. '0' (default de fábrica) = desactivado, nunca libera solo.
//
// Corre en segundo plano cada CHEQUEO_MS -- no depende de que algún jugador
// tenga la app abierta ni de ningún cronjob externo. Reusa exactamente la
// misma limpieza que la liberación manual del admin (PUT /cartones/liberar):
// vuelve el cartón a 'disponible', limpia dueño/marcados y cualquier
// delegación activa.
const db = require('./db');

const CHEQUEO_MS = 30 * 1000;

function getMinutos() {
  const row = db.prepare("SELECT value FROM settings WHERE key = 'liberacion_pendientes_minutos'").get();
  const n = Number(row?.value);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

const insertLog = db.prepare(
  `INSERT INTO logs_actividad (categoria, accion, detalle, usuario_id, usuario_nombre) VALUES (?, ?, ?, ?, ?)`
);

function liberarVencidos(io) {
  const minutos = getMinutos();
  if (!minutos) return;

  // `reservado_en IS NOT NULL` es a propósito: los 'vendido' de antes de
  // tener esta columna (ver migración en db.js) no tienen fecha de
  // referencia real, así que nunca se auto-liberan retroactivamente.
  const vencidos = db
    .prepare(
      `SELECT id, sorteo_id, numero, grupo FROM cartones
       WHERE estado = 'vendido' AND reservado_en IS NOT NULL
         AND reservado_en <= datetime('now', '-' || ? || ' minutes')`
    )
    .all(minutos);
  if (!vencidos.length) return;

  const tx = db.transaction(() => {
    const stmt = db.prepare(
      `UPDATE cartones SET estado = 'disponible', owner_id = NULL, reservado_en = NULL, marcados = '[]' WHERE id = ?`
    );
    const stmtDelegado = db.prepare('DELETE FROM cartones_delegados WHERE carton_id = ?');
    vencidos.forEach((c) => { stmt.run(c.id); stmtDelegado.run(c.id); });
  });
  tx();

  // Misma columna que usa el admin para identificar la carta en combos
  // (grupo) o el cartón suelto (numero) -- ver liberar/verificar-pago en
  // routes/cartones.js.
  const etiquetas = [...new Set(vencidos.map((c) => c.grupo ?? c.numero))];
  insertLog.run(
    'cartones',
    'Liberó cartón(es) automáticamente (tiempo agotado)',
    `#${etiquetas.join(', #')} (${minutos} min sin verificar)`,
    null,
    'Sistema'
  );

  const porSorteo = [...new Set(vencidos.map((c) => c.sorteo_id))];
  porSorteo.forEach((sorteoId) => {
    io.to(`sorteo-${sorteoId}`).emit('cartones-actualizados', { sorteoId: Number(sorteoId) });
  });
}

function iniciarLiberadorPendientes(io) {
  liberarVencidos(io);
  setInterval(() => {
    try { liberarVencidos(io); } catch (err) { console.error('[liberarPendientes] error:', err); }
  }, CHEQUEO_MS);
}

module.exports = { iniciarLiberadorPendientes };
