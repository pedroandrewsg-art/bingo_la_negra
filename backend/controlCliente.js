// controlCliente.js — Módulo de control remoto para sistemas de bingo.
//
// Se copia a backend/ de cada sistema (ver instalar.js) y lo conecta con el
// Panel de Control: cada 30s consulta si el sistema está suspendido y qué
// mensajes emergentes mostrar. No usa dependencias externas (solo fetch de
// Node 18+).
//
// Variables de entorno (backend/.env):
//   PANEL_URL      https://panel.tudominio.com
//   PANEL_API_KEY  la clave que muestra el panel para este sistema
// Si faltan, el módulo no hace nada (el sistema funciona normal).
//
// Garantías de seguridad para tu cliente:
//  - Si el panel no responde, se mantiene el último estado conocido: una caída
//    del panel NUNCA bloquea a un sistema que estaba funcionando.
//  - Suspendido bloquea solo las rutas /api/* (salvo salud y estado): el sitio
//    carga y muestra el aviso, pero nadie puede operar.

const VERSION = '1.0';
const INTERVALO_MS = 30 * 1000;
const TIMEOUT_MS = 8000;
const RUTAS_LIBRES = ['/api/health', '/api/control/estado'];

let estado = { suspendido: false, mensaje_admin: '', mensaje_jugadores: '', mensajes: [] };
let ultimoOk = null;
let iniciado = false;

function configurado() {
  return !!(process.env.PANEL_URL && process.env.PANEL_API_KEY);
}

async function consultar() {
  const url = process.env.PANEL_URL.replace(/\/+$/, '') + '/api/modulo/estado?v=' + VERSION;
  try {
    const res = await fetch(url, {
      headers: { 'X-Api-Key': process.env.PANEL_API_KEY },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    if (typeof data.suspendido === 'boolean') {
      if (data.suspendido !== estado.suspendido) {
        console.log(`[control] Estado cambió: ${data.suspendido ? 'SUSPENDIDO' : 'ACTIVO'}`);
      }
      estado = data;
      ultimoOk = Date.now();
    }
  } catch (e) {
    // Panel caído o sin red: se conserva el último estado conocido.
    if (!ultimoOk || Date.now() - ultimoOk > 10 * 60 * 1000) {
      console.warn('[control] No se pudo consultar el panel:', e.message);
      ultimoOk = Date.now(); // para no repetir el aviso en cada intento
    }
  }
}

function iniciar() {
  if (iniciado) return;
  iniciado = true;
  if (!configurado()) {
    console.log('[control] PANEL_URL/PANEL_API_KEY no configurados: control remoto desactivado.');
    return;
  }
  consultar();
  setInterval(consultar, INTERVALO_MS).unref();
}

// Debe montarse ANTES de las rutas /api en server.js.
function middleware() {
  return (req, res, next) => {
    if (req.path === '/api/control/estado') {
      return res.json({
        suspendido: estado.suspendido,
        mensaje_admin: estado.mensaje_admin,
        mensaje_jugadores: estado.mensaje_jugadores,
        mensajes: estado.mensajes || [],
      });
    }
    if (estado.suspendido && req.path.startsWith('/api/') && !RUTAS_LIBRES.includes(req.path)) {
      return res.status(503).json({
        error: 'Servicio suspendido',
        suspendido: true,
        mensaje_admin: estado.mensaje_admin,
        mensaje_jugadores: estado.mensaje_jugadores,
      });
    }
    next();
  };
}

module.exports = { iniciar, middleware, VERSION };
