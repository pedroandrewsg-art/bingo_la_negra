// sockets/index.js — Salas de sorteo en tiempo real (WebSockets)
//
// El sorteador automático interno se eliminó: el organizador ahora usa un
// sorteador externo, y los jugadores marcan sus propios cartones a mano
// (ver routes/cartones.js, que dispara los reclamos de bingo y emite
// 'bingo-ganador'/'bingo-reclamo' a esta misma sala). Este módulo solo
// mantiene las salas por sorteo y dos acciones del administrador: iniciar el
// juego (cierra la venta de cartones) y reiniciar (borra marcas/ganadores/
// reclamos para repetir el mismo sorteo).
const db = require('../db');

// Se pueden vender cartones de varios sorteos a la vez, pero solo uno puede
// estar EN JUEGO en un momento dado -- el bot de WhatsApp que canta números
// (agregarNumeroCantado, ver routes/sorteos.js) no recibe el sorteoId, busca
// "el" sorteo en_juego a ciegas, y con dos activos a la vez quedaría
// ambiguo. Devuelve { error } o { ok: true } para que el admin vea por qué
// se bloqueó (antes este evento no devolvía nada).
function iniciarJuego(sorteoId, io) {
  const otroEnJuego = db.prepare("SELECT id, color, nombre FROM sorteos WHERE estatus = 'en_juego' AND id != ?").get(sorteoId);
  if (otroEnJuego) {
    const etiqueta = otroEnJuego.nombre || `#${otroEnJuego.id} · ${otroEnJuego.color}`;
    return { error: `Ya hay un sorteo en juego (${etiqueta}). Pausalo o finalizalo antes de iniciar este.` };
  }
  db.prepare(`UPDATE sorteos SET estatus = 'en_juego' WHERE id = ?`).run(sorteoId);
  io.to(`sorteo-${sorteoId}`).emit('sorteo-iniciado', { sorteoId });
  io.emit('sorteos-cambio', {});
  return { ok: true };
}

function reiniciarSorteo(sorteoId, io) {
  db.prepare(`UPDATE cartones SET marcados = '[]' WHERE sorteo_id = ?`).run(sorteoId);
  db.prepare(`UPDATE tablero_marcas SET numeros = '[]' WHERE sorteo_id = ?`).run(sorteoId);
  db.prepare('DELETE FROM ganadores WHERE sorteo_id = ?').run(sorteoId);
  db.prepare('DELETE FROM reclamos WHERE sorteo_id = ?').run(sorteoId);
  db.prepare(
    `UPDATE sorteos SET numeros_extraidos = '[]', bola_actual = NULL, estatus = 'activo', ganador_id = NULL WHERE id = ?`
  ).run(sorteoId);
  io.to(`sorteo-${sorteoId}`).emit('sorteo-reiniciado', { sorteoId });
  io.emit('sorteos-cambio', {});
}

function attachSockets(io) {
  io.on('connection', (socket) => {
    socket.on('join-sorteo', ({ sorteoId }) => {
      socket.join(`sorteo-${sorteoId}`);
    });
    socket.on('leave-sorteo', ({ sorteoId }) => {
      socket.leave(`sorteo-${sorteoId}`);
    });
    socket.on('admin:iniciar-sorteo', ({ sorteoId }, cb) => {
      const resultado = iniciarJuego(sorteoId, io);
      if (typeof cb === 'function') cb(resultado);
    });
    socket.on('admin:reiniciar-sorteo', ({ sorteoId }) => reiniciarSorteo(sorteoId, io));
  });
}

module.exports = { attachSockets };
