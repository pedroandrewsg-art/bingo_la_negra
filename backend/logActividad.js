// logActividad.js -- helper unico para insertar en logs_actividad. Se llama
// al final de cada ruta mutante, DESPUES de que la operacion tuvo exito (no
// se registra si la operacion fallo -- la excepcion es el login fallido, que
// se registra a proposito porque en si mismo es el evento a auditar).
const db = require("./db");

const insertLog = db.prepare(
  `INSERT INTO logs_actividad (categoria, accion, detalle, usuario_id, usuario_nombre) VALUES (?, ?, ?, ?, ?)`
);

// `req` solo necesita traer `req.user` ({ id, username } o { id: null, username }
// para logins fallidos, donde requireAuth todavia no corrio).
function registrarLog(req, categoria, accion, detalle) {
  insertLog.run(categoria, accion, detalle || null, req.user?.id ?? null, req.user?.username ?? null);
}

module.exports = { registrarLog };
