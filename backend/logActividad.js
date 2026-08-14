// logActividad.js — helper único para insertar en logs_actividad. Se llama
// al final de cada ruta mutante, DESPUÉS de que la operación tuvo éxito (no
// se registra si la operación falló — la excepción es el login fallido, que
// se registra a propósito porque en sí mismo es el evento a auditar).
const db = require('./db');

const insertLog = db.prepare(
  `INSERT INTO logs_actividad (categoria, accion, detalle, usuario_id, usuario_nombre) VALUES (?, ?, ?, ?, ?)`
);

// `req` solo necesita traer `req.user` ({ id, username } o { id: null, username }
// para logins fallidos, donde requireAuth todavía no corrió).
function registrarLog(req, categoria, accion, detalle) {
  insertLog.run(categoria, accion, detalle || null, req.user?.id ?? null, req.user?.username ?? null);
}

const buscarLogReciente = db.prepare(
  `SELECT id FROM logs_actividad
   WHERE categoria = ? AND accion = ? AND usuario_id IS ? AND detalle LIKE ?
     AND created_at >= datetime('now', '-' || ? || ' minutes')
   ORDER BY id DESC LIMIT 1`
);
const actualizarLog = db.prepare(`UPDATE logs_actividad SET detalle = ?, created_at = datetime('now') WHERE id = ?`);

// Para acciones que autoguardan mientras el admin escribe (ej. el encabezado
// de WhatsApp Live por sorteo, debounce de 800ms): en vez de una fila nueva
// por cada autoguardado, se agrupan en una sola entrada por "sesión de
// edición" — si ya existe una fila de esta misma categoría+acción+usuario
// cuyo detalle contiene `claveGrupo` (ej. "Sorteo #4 (Verde)") y quedó
// escrita dentro de los últimos `ventanaMin` minutos, se actualiza esa
// misma fila (nuevo detalle + timestamp más reciente) en vez de insertar
// una nueva. Una pausa más larga que la ventana cuenta como sesión nueva.
function registrarLogAgrupado(req, categoria, accion, detalle, claveGrupo, ventanaMin = 2) {
  const reciente = buscarLogReciente.get(categoria, accion, req.user?.id ?? null, `%${claveGrupo}%`, ventanaMin);
  if (reciente) {
    actualizarLog.run(detalle || null, reciente.id);
  } else {
    registrarLog(req, categoria, accion, detalle);
  }
}

module.exports = { registrarLog, registrarLogAgrupado };
