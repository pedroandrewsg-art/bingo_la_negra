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

function iniciarJuego(sorteoId, io) {
  db.prepare(`UPDATE sorteos SET estatus = 'en_juego' WHERE id = ?`).run(sorteoId);
  io.to(`sorteo-${sorteoId}`).emit('sorteo-iniciado', { sorteoId });
  io.emit('sorteos-cambio', {});
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
    socket.on('admin:iniciar-sorteo', ({ sorteoId }) => iniciarJuego(sorteoId, io));
    socket.on('admin:reiniciar-sorteo', ({ sorteoId }) => reiniciarSorteo(sorteoId, io));
  });
}

module.exports = { attachSockets };
