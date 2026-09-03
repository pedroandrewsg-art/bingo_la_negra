// db.js — Inicialización y esquema de la base de datos SQLite
const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const WHATSAPP_LIVE_DEFAULTS = require('./whatsappLiveDefaults');

// En producción (Render), DATA_DIR debe apuntar al disco persistente montado
// (ej. /var/data) para que bingo.db sobreviva a reinicios/deploys. Sin esa
// variable, cae en la carpeta del backend (comportamiento local de siempre).
const dataDir = process.env.DATA_DIR || __dirname;
fs.mkdirSync(dataDir, { recursive: true });

const db = new Database(path.join(dataDir, 'bingo.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Migración: el esquema anterior guardaba a los jugadores en `users` (con
// saldo/recargas). Ahora los jugadores son sesiones temporales (jugadores)
// y `users` queda solo para administradores. Si detectamos el esquema
// viejo, se recrean las tablas afectadas desde cero (datos de demo/dev).
const usersInfo = db.prepare("PRAGMA table_info(users)").all();
const isOldSchema = usersInfo.some((c) => c.name === 'saldo');
if (isOldSchema) {
  db.exec(`
    DROP TABLE IF EXISTS ganadores;
    DROP TABLE IF EXISTS ventas;
    DROP TABLE IF EXISTS recargas;
    DROP TABLE IF EXISTS cartones;
    DROP TABLE IF EXISTS sorteos;
    DROP TABLE IF EXISTS users;
  `);
}

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  password TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'admin',
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS jugadores (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre TEXT NOT NULL,
  whatsapp TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sorteos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  fecha_hora TEXT NOT NULL,
  rango_desde INTEGER NOT NULL,
  rango_hasta INTEGER NOT NULL,
  color TEXT NOT NULL,
  tipo_venta INTEGER NOT NULL DEFAULT 1, -- tamaño del combo: 1,2,3,4
  costo REAL NOT NULL, -- costo por cartón individual
  porcentaje_ganancia REAL NOT NULL,
  modo_premio TEXT NOT NULL DEFAULT 'porcentaje', -- porcentaje (% del premio acumulado) | monto_fijo (Bs fijos por figura) | sin_premio (sin montos definidos)
  patron TEXT NOT NULL, -- linea_horizontal, linea_vertical, diagonal, cruz_x, diamante, cuatro_esquinas, carton_lleno, letra_l, letra_t
  estatus TEXT NOT NULL DEFAULT 'activo', -- activo | en_juego | finalizado
  numeros_extraidos TEXT NOT NULL DEFAULT '[]',
  bola_actual INTEGER,
  ganador_id INTEGER,
  encabezado TEXT NOT NULL DEFAULT '', -- texto libre para el mensaje de WhatsApp
  pie_pagina TEXT NOT NULL DEFAULT '',
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS cartones (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  numero INTEGER NOT NULL,
  color TEXT NOT NULL,
  grid TEXT NOT NULL, -- JSON 5x5 (fila x columna B-I-N-G-O), centro = null (LIBRE)
  sorteo_id INTEGER REFERENCES sorteos(id) ON DELETE SET NULL,
  grupo INTEGER, -- número de grupo/combo dentro del sorteo
  estado TEXT NOT NULL DEFAULT 'disponible', -- disponible | vendido (apartado, sin verificar) | pagado (verificado por admin)
  owner_id INTEGER REFERENCES jugadores(id) ON DELETE SET NULL,
  marcados TEXT NOT NULL DEFAULT '[]',
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS ventas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  numero_transaccion TEXT UNIQUE NOT NULL,
  sorteo_id INTEGER REFERENCES sorteos(id),
  cartones_ids TEXT NOT NULL, -- JSON array
  jugador_id INTEGER REFERENCES jugadores(id),
  monto REAL NOT NULL,
  fecha TEXT DEFAULT (datetime('now')),
  estatus TEXT NOT NULL DEFAULT 'completado' -- completado | cancelado
);

CREATE TABLE IF NOT EXISTS ganadores (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sorteo_id INTEGER REFERENCES sorteos(id),
  jugador_id INTEGER REFERENCES jugadores(id),
  carton_id INTEGER REFERENCES cartones(id),
  patron TEXT,
  premio REAL,
  fecha TEXT DEFAULT (datetime('now')),
  pagado INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS sorteo_patrones (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sorteo_id INTEGER NOT NULL REFERENCES sorteos(id) ON DELETE CASCADE,
  patron TEXT NOT NULL,
  porcentaje REAL NOT NULL DEFAULT 0, -- % del premio acumulado (modo_premio = 'porcentaje'); suman 100 entre las figuras del sorteo
  monto REAL, -- Bs fijos para esta figura (modo_premio = 'monto_fijo'); NULL en los demás modos
  orden INTEGER NOT NULL DEFAULT 0
);

-- Reclamos de BINGO: el jugador marca su cartón manualmente (ya no hay
-- sorteador automático interno) y cuando su marcado completa una figura se
-- crea un reclamo pendiente que el administrador debe validar o invalidar
-- antes de que cuente como ganador oficial (tabla ganadores).
CREATE TABLE IF NOT EXISTS reclamos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sorteo_id INTEGER NOT NULL REFERENCES sorteos(id),
  carton_id INTEGER REFERENCES cartones(id) ON DELETE SET NULL,
  carton_numero INTEGER, -- snapshot: se conserva aunque el cartón se elimine luego
  jugador_id INTEGER REFERENCES jugadores(id) ON DELETE SET NULL,
  patron TEXT NOT NULL,
  estado TEXT NOT NULL DEFAULT 'pendiente', -- pendiente | valido | invalido
  fecha TEXT DEFAULT (datetime('now'))
);

-- Catálogo persistente: el grid de la Carta N de un color+combo es siempre
-- el mismo entre sorteos (no se regenera al azar cada vez). cartones sigue
-- siendo la instancia por sorteo (estado de venta/marcado); esta tabla es la
-- fuente de verdad del contenido fijo (grid) por color+tipo_venta+carta+letra.
CREATE TABLE IF NOT EXISTS plantillas_cartones (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  color TEXT NOT NULL,
  tipo_venta INTEGER NOT NULL,
  carta INTEGER NOT NULL,
  letra TEXT NOT NULL,
  numero INTEGER NOT NULL,
  grid TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_plantillas_unica ON plantillas_cartones(color, tipo_venta, carta, letra);

-- Figuras/patrones ganadores definidos por el admin (además de las fijas de
-- patterns.js), dibujadas a mano sobre una máscara 5x5 y guardadas para
-- reusarse en cualquier sorteo futuro.
CREATE TABLE IF NOT EXISTS patrones_personalizados (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre TEXT NOT NULL,
  mascara TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);

-- Configuración global clave/valor (ej. link del grupo de WhatsApp).
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL DEFAULT ''
);

-- Marcado del panel de apoyo 1-75, independiente de los cartones del
-- jugador: el panel sirve para llevar la cuenta de qué números ya se
-- cantaron, tenga o no tenga ese número en algún cartón propio — antes solo
-- se podía marcar un número ahí si estaba en al menos un cartón del jugador.
CREATE TABLE IF NOT EXISTS tablero_marcas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  jugador_id INTEGER NOT NULL REFERENCES jugadores(id),
  sorteo_id INTEGER NOT NULL REFERENCES sorteos(id),
  numeros TEXT NOT NULL DEFAULT '[]'
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_tablero_marcas_unico ON tablero_marcas(jugador_id, sorteo_id);

-- Registro de actividad (auditoria): quien hizo que y cuando. usuario_nombre
-- va duplicado ademas del FK a proposito -- si se borra el usuario admin, el
-- historial no pierde legibilidad (mismo criterio que owner_id en cartones).
-- Login fallido guarda usuario_id NULL (no hay usuario valido todavia) y
-- usuario_nombre con el username que se intento.
CREATE TABLE IF NOT EXISTS logs_actividad (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  categoria TEXT NOT NULL,
  accion TEXT NOT NULL,
  detalle TEXT,
  usuario_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  usuario_nombre TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_logs_actividad_categoria ON logs_actividad(categoria);

-- Biblioteca de sonidos/música propios subidos por el admin (aviso de
-- "cerca de ganar", fanfarria de BINGO, música de tensión). Persistente y
-- separada de 'settings': a diferencia del logo (que se sobreescribe), acá
-- cada subida queda guardada para poder re-seleccionarla más adelante sin
-- volver a subir el archivo.
CREATE TABLE IF NOT EXISTS sound_assets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  categoria TEXT NOT NULL,
  nombre TEXT NOT NULL,
  url TEXT NOT NULL,
  creado_en TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_sound_assets_categoria ON sound_assets(categoria);

-- "Jugar por otra persona": un jugador que no puede estar presente deja que
-- otro marque sus cartas en la sala de juego. No cambia la propiedad (owner_id
-- en cartones sigue siendo quien compró, y por lo tanto quien cobra el
-- premio) -- esto solo habilita a jugador_id a VER/MARCAR ese cartón además
-- del dueño. Un solo delegado activo por cartón (índice único): si alguien
-- más ya lo estaba jugando, el siguiente que lo toma lo reemplaza.
CREATE TABLE IF NOT EXISTS cartones_delegados (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  carton_id INTEGER NOT NULL REFERENCES cartones(id) ON DELETE CASCADE,
  jugador_id INTEGER NOT NULL REFERENCES jugadores(id) ON DELETE CASCADE,
  creado_en TEXT DEFAULT (datetime('now'))
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_cartones_delegados_carton ON cartones_delegados(carton_id);
`);

// Migración incremental: agrega columnas nuevas a `sorteos` si la tabla ya
// existía de una versión anterior sin encabezado/pie_pagina.
const sorteosInfo = db.prepare("PRAGMA table_info(sorteos)").all();
if (!sorteosInfo.some((c) => c.name === 'encabezado')) {
  db.exec("ALTER TABLE sorteos ADD COLUMN encabezado TEXT NOT NULL DEFAULT ''");
}
if (!sorteosInfo.some((c) => c.name === 'pie_pagina')) {
  db.exec("ALTER TABLE sorteos ADD COLUMN pie_pagina TEXT NOT NULL DEFAULT ''");
}
if (!sorteosInfo.some((c) => c.name === 'modo_premio')) {
  db.exec("ALTER TABLE sorteos ADD COLUMN modo_premio TEXT NOT NULL DEFAULT 'porcentaje'");
}
// Interruptor del "Números Cantados" (bola grande + tablero 1-75 que el admin
// usa para ir cantando lo que saca del bombo) — el admin puede no querer
// usarlo en un sorteo puntual (ej. ya tiene su propio sorteador físico
// aparte). DEFAULT 1: el sorteo nuevo lo trae activo, se apaga a mano si no
// se quiere.
if (!sorteosInfo.some((c) => c.name === 'cantador_activo')) {
  db.exec("ALTER TABLE sorteos ADD COLUMN cantador_activo INTEGER NOT NULL DEFAULT 1");
}
// Anuncio por voz (gratis, Web Speech API del navegador del jugador) de cada
// número cantado -- independiente del "cantador_activo" de arriba a propósito:
// el admin puede tener el tablero visual apagado (usa su propio sorteador
// físico) y aun así querer que el bot de WhatsApp siga anunciando por voz.
// DEFAULT 0: es una función nueva, el admin la prende a propósito por sorteo.
if (!sorteosInfo.some((c) => c.name === 'voz_anunciante_activo')) {
  db.exec("ALTER TABLE sorteos ADD COLUMN voz_anunciante_activo INTEGER NOT NULL DEFAULT 0");
}
// Si las ventas arrancan abiertas o cerradas al crear el sorteo (el admin lo
// elige en el form) — DEFAULT 1 acá es solo para no romper sorteos ya
// existentes al migrar; el default real para sorteos NUEVOS se decide
// explícito en POST /sorteos (ver ahí).
if (!sorteosInfo.some((c) => c.name === 'ventas_habilitadas')) {
  db.exec("ALTER TABLE sorteos ADD COLUMN ventas_habilitadas INTEGER NOT NULL DEFAULT 1");
}

// Migración incremental: agrega `monto` (premio fijo en Bs por figura) a
// `sorteo_patrones` si la tabla ya existía de una versión anterior sin esa
// columna (antes solo se soportaba porcentaje del premio acumulado).
const sorteoPatronesInfo = db.prepare("PRAGMA table_info(sorteo_patrones)").all();
if (!sorteoPatronesInfo.some((c) => c.name === 'monto')) {
  db.exec("ALTER TABLE sorteo_patrones ADD COLUMN monto REAL");
}
// Migración incremental: `cerrada` marca que una figura ya no acepta más
// ganadores (el admin la cierra a mano tras juntar todos los bingos
// simultáneos de esa figura). Antes, una figura se consideraba "cerrada" en
// cuanto tenía UN ganador, lo que impedía validar 2+ bingos legítimos de la
// misma figura — ahora eso lo decide el admin explícitamente.
if (!sorteoPatronesInfo.some((c) => c.name === 'cerrada')) {
  db.exec("ALTER TABLE sorteo_patrones ADD COLUMN cerrada INTEGER NOT NULL DEFAULT 0");
}
// Migración incremental: `activa_tras` guarda el patron (si lo hay) del que
// depende esta figura para volverse jugable -- hoy solo la usa "Picado"
// (Cartón Lleno extra, jugado después de que el Cartón Lleno original ya
// tenga ganador). NULL = figura normal, sin dependencia.
if (!sorteoPatronesInfo.some((c) => c.name === 'activa_tras')) {
  db.exec("ALTER TABLE sorteo_patrones ADD COLUMN activa_tras TEXT");
}

// Migración incremental: agrega `letra` (A/B/C/D dentro de su carta/combo) a
// `cartones` si la tabla ya existía de una versión anterior sin esa columna.
const cartonesInfo = db.prepare("PRAGMA table_info(cartones)").all();
if (!cartonesInfo.some((c) => c.name === 'letra')) {
  db.exec("ALTER TABLE cartones ADD COLUMN letra TEXT");
}

// Migración incremental: `reservado_en` en `cartones` — momento exacto en
// que un cartón pasó a 'vendido' (apartado, ver routes/ventas.js), usado
// por liberarPendientes.js para saber cuánto tiempo lleva esperando su
// verificación de pago. NULL a propósito para cartones ya 'vendido' antes
// de esta migración (nunca se auto-liberan retroactivamente sin una fecha
// real de referencia) — solo los apartados DESPUÉS de este cambio quedan
// sujetos al temporizador.
if (!cartonesInfo.some((c) => c.name === 'reservado_en')) {
  db.exec("ALTER TABLE cartones ADD COLUMN reservado_en TEXT");
}

// Migración incremental: `jugado_por_id`/`jugado_por_nombre` en `reclamos` y
// `ganadores` -- snapshot de quién estaba jugando el cartón (si era distinto
// del dueño) en el momento exacto del reclamo/premio. Es snapshot y no un
// JOIN en vivo contra cartones_delegados a propósito: la delegación se puede
// soltar después y el historial no debe cambiar retroactivamente.
const reclamosInfo = db.prepare("PRAGMA table_info(reclamos)").all();
if (!reclamosInfo.some((c) => c.name === 'jugado_por_id')) {
  db.exec("ALTER TABLE reclamos ADD COLUMN jugado_por_id INTEGER");
  db.exec("ALTER TABLE reclamos ADD COLUMN jugado_por_nombre TEXT");
}
const ganadoresInfo = db.prepare("PRAGMA table_info(ganadores)").all();
if (!ganadoresInfo.some((c) => c.name === 'jugado_por_id')) {
  db.exec("ALTER TABLE ganadores ADD COLUMN jugado_por_id INTEGER");
  db.exec("ALTER TABLE ganadores ADD COLUMN jugado_por_nombre TEXT");
}

// Backfill: sorteos creados antes de soportar múltiples figuras no tienen
// filas en sorteo_patrones. Se les asigna su única figura original al 100%.
const sorteosSinFiguras = db
  .prepare(`SELECT id, patron FROM sorteos WHERE id NOT IN (SELECT DISTINCT sorteo_id FROM sorteo_patrones)`)
  .all();
if (sorteosSinFiguras.length) {
  const insertFigura = db.prepare(
    `INSERT INTO sorteo_patrones (sorteo_id, patron, porcentaje, orden) VALUES (?, ?, 100, 0)`
  );
  const tx = db.transaction((rows) => rows.forEach((s) => insertFigura.run(s.id, s.patron)));
  tx(sorteosSinFiguras);
}

// Seed admin por defecto si no existe ningún usuario
const userCount = db.prepare('SELECT COUNT(*) c FROM users').get().c;
if (userCount === 0) {
  const hash = bcrypt.hashSync('admin123', 10);
  db.prepare(`INSERT INTO users (username, password, role) VALUES (?, ?, 'admin')`).run('admin', hash);
  console.log('Usuario admin creado -> usuario: admin / clave: admin123');
}

// Seed de configuración por defecto (link del grupo de WhatsApp, editable
// luego por el admin desde el panel de Configuración).
const whatsappSetting = db.prepare("SELECT value FROM settings WHERE key = 'whatsapp_link'").get();
if (!whatsappSetting) {
  db.prepare("INSERT INTO settings (key, value) VALUES ('whatsapp_link', '')").run();
}

// Seed de los textos/emoji configurables del módulo "WhatsApp Live" — solo si
// la clave no existe todavía, para no pisar un valor (incluso vacío) que un
// admin ya haya guardado a propósito.
const insertSettingSiFalta = db.prepare(
  'INSERT INTO settings (key, value) SELECT ?, ? WHERE NOT EXISTS (SELECT 1 FROM settings WHERE key = ?)'
);
Object.entries(WHATSAPP_LIVE_DEFAULTS).forEach(([key, valor]) => insertSettingSiFalta.run(key, valor, key));
insertSettingSiFalta.run('login_subtitle', '75 bolillas · en tiempo real', 'login_subtitle');

// Seed de la selección de sonido/música por categoría. Los avisos (alerta,
// fanfarria) arrancan con el preset por defecto para no cambiar el
// comportamiento de siempre; la música de tensión arranca apagada porque es
// la más intrusiva de las tres — el admin la prende a mano si la quiere.
insertSettingSiFalta.run('sonido_alerta_sel', 'preset:arpegio', 'sonido_alerta_sel');
insertSettingSiFalta.run('sonido_fanfarria_sel', 'preset:fanfarria', 'sonido_fanfarria_sel');
insertSettingSiFalta.run('sonido_musica_sel', 'off', 'sonido_musica_sel');
// Frecuencia de la música de tensión: 'continuo' (suena todo el tiempo que
// haya tensión, comportamiento original), 'una_vez' (un solo disparo al
// entrar en tensión) o 'duracion' (disparo de sonido_musica_duracion_seg
// segundos fijos).
insertSettingSiFalta.run('sonido_musica_modo', 'continuo', 'sonido_musica_modo');
insertSettingSiFalta.run('sonido_musica_duracion_seg', '8', 'sonido_musica_duracion_seg');

// Minutos de espera antes de liberar automáticamente un cartón 'vendido'
// (apartado, sin pago verificado) — ver liberarPendientes.js. '0' (default)
// = desactivado, nunca libera solo.
insertSettingSiFalta.run('liberacion_pendientes_minutos', '0', 'liberacion_pendientes_minutos');

module.exports = db;
