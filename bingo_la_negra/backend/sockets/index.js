// sockets/index.js — Salas de sorteo en tiempo real (WebSockets)
//
// BINGOLANEGRA ya no tiene sala de juego automática: el jugador solo compra y
// consulta sus cartones, y el admin registra ganadores a mano (Bingo
// Manual, ver routes/cartones.js). Este módulo solo mantiene las salas por
// sorteo, usadas para refrescar ventas/premios/ganadores en vivo.
function attachSockets(io) {
  io.on('connection', (socket) => {
    socket.on('join-sorteo', ({ sorteoId }) => {
      socket.join(`sorteo-${sorteoId}`);
    });
    socket.on('leave-sorteo', ({ sorteoId }) => {
      socket.leave(`sorteo-${sorteoId}`);
    });
  });
}

module.exports = { attachSockets };
