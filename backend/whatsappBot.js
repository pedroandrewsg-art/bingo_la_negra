// whatsappBot.js — Puente WhatsApp -> App: escucha el grupo de WhatsApp donde
// la admin canta los números (con prefijo de letra, ej. "B2", "N-32") y los
// aplica solo en el sorteo en juego, sin que la admin tenga que tocarlos
// también en el panel. Es un canal ADICIONAL, no un reemplazo: si el bot
// está desconectado, el cantador manual sigue funcionando exactamente igual.
//
// Se conecta como "dispositivo vinculado" a la MISMA WhatsApp que ya usa la
// admin (como WhatsApp Web) -- no hace falta un número nuevo. Solo LEE
// mensajes en v1 (nunca escribe al grupo), así que no hay riesgo real de
// bloqueo por spam: leer no dispara ningún sistema anti-spam de WhatsApp.
//
// Usa Baileys (no oficial -- la API oficial de Meta no soporta grupos). Si
// falla al iniciar o se cae, el resto de la app sigue funcionando igual
// (ver el try/catch en server.js que llama a initWhatsappBot).
const fs = require('fs');
const path = require('path');
const QRCode = require('qrcode');
const pino = require('pino');
const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
} = require('@whiskeysockets/baileys');
const db = require('./db');
const { r2, BUCKET, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } = require('./r2');
const { agregarNumeroCantado } = require('./routes/sorteos');

const dataDir = process.env.DATA_DIR || __dirname;
const authDir = path.join(dataDir, 'whatsapp-bot-auth');
const R2_AUTH_KEY = 'whatsapp-bot/auth-state.json';

// Mismo mapeo que colLetter() en frontend/app.jsx -- se duplica acá (mundo
// backend, no puede importar del frontend) para poder validar que la letra
// que cantó la admin coincide con el número (ej. rechazar "B47": 47 es G).
function colLetter(n) {
  if (n <= 15) return 'B';
  if (n <= 30) return 'I';
  if (n <= 45) return 'N';
  if (n <= 60) return 'G';
  return 'O';
}

// La admin canta con prefijo de letra ("B2", "N-32", "g 58", con o sin
// decoración alrededor). Exige UNA sola letra B/I/N/G/O seguida de UN
// número, nada más de dígitos en todo el mensaje -- así charla normal del
// grupo (o un número de teléfono compartido) no dispara nada por accidente.
function parsearNumeroCantado(texto) {
  const m = (texto || '').trim().match(/^\D*([bingoBINGO])[\s.\-:]*?(\d{1,2})\D*$/);
  if (!m) return null;
  const letra = m[1].toUpperCase();
  const numero = Number(m[2]);
  if (numero < 1 || numero > 75) return null;
  if (colLetter(numero) !== letra) return null;
  return numero;
}

function getSetting(key) {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
  return row ? row.value : '';
}

let sock = null;
let ioRef = null;
let saveCredsTimer = null;
const estado = { conectado: false, conectando: false, qrDataUrl: null, numero: null, grupos: [] };

function emitirEstado() {
  if (ioRef) ioRef.emit('whatsapp-bot-estado', getEstado());
}

function getEstado() {
  return { ...estado, grupoSeleccionado: getSetting('whatsapp_bot_grupo_id') || '' };
}

async function streamToString(stream) {
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  return Buffer.concat(chunks).toString('utf8');
}

// Empaqueta todos los archivos de credenciales (creds.json + las claves de
// sesión que Baileys va agregando) en un solo objeto JSON y lo sube a R2 --
// mismo motivo que Litestream con bingo.db: Render no tiene disco
// persistente, así que sin esto cada redeploy pediría escanear el QR de
// nuevo. Con debounce (ver programarBackupR2) para no golpear R2 en cada
// evento de credenciales (Baileys los dispara seguido).
async function backupCredencialesAR2() {
  try {
    const archivos = fs.readdirSync(authDir).filter((f) => f.endsWith('.json'));
    const contenido = {};
    archivos.forEach((f) => { contenido[f] = fs.readFileSync(path.join(authDir, f), 'utf8'); });
    await r2.send(new PutObjectCommand({
      Bucket: BUCKET,
      Key: R2_AUTH_KEY,
      Body: JSON.stringify(contenido),
      ContentType: 'application/json',
    }));
  } catch (e) {
    console.error('[whatsappBot] error respaldando credenciales a R2:', e.message);
  }
}

function programarBackupR2() {
  clearTimeout(saveCredsTimer);
  saveCredsTimer = setTimeout(backupCredencialesAR2, 30000);
}

// Si ya hay credenciales locales (proceso que nunca se reinició, o Disk
// persistente) no las pisa. Si no hay nada local (típico post-redeploy en
// Render), intenta bajar el último backup de R2 antes de que Baileys arranque
// -- así no hace falta reescanear el QR después de cada deploy.
async function restaurarCredencialesDesdeR2() {
  fs.mkdirSync(authDir, { recursive: true });
  if (fs.existsSync(path.join(authDir, 'creds.json'))) return;
  try {
    const obj = await r2.send(new GetObjectCommand({ Bucket: BUCKET, Key: R2_AUTH_KEY }));
    const texto = await streamToString(obj.Body);
    const contenido = JSON.parse(texto);
    Object.entries(contenido).forEach(([nombre, data]) => {
      fs.writeFileSync(path.join(authDir, nombre), data, 'utf8');
    });
    console.log('[whatsappBot] credenciales restauradas desde R2');
  } catch (e) {
    console.log('[whatsappBot] sin backup en R2 todavía (primera vez que se conecta este bot)');
  }
}

function borrarCredenciales() {
  clearTimeout(saveCredsTimer);
  try {
    fs.rmSync(authDir, { recursive: true, force: true });
  } catch (e) { /* no-op */ }
  r2.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: R2_AUTH_KEY })).catch(() => {});
}

async function cargarGrupos() {
  try {
    const grupos = await sock.groupFetchAllParticipating();
    estado.grupos = Object.values(grupos).map((g) => ({ id: g.id, nombre: g.subject }));
  } catch (e) {
    console.error('[whatsappBot] error listando grupos:', e.message);
  }
}

function procesarMensaje(m) {
  if (!m.key || !m.key.fromMe) return; // solo cuenta lo que escribe la propia cuenta vinculada (la admin)
  const grupoId = getSetting('whatsapp_bot_grupo_id');
  if (!grupoId || m.key.remoteJid !== grupoId) return;
  const texto = m.message?.conversation || m.message?.extendedTextMessage?.text || '';
  const numero = parsearNumeroCantado(texto);
  if (numero == null) return;
  agregarNumeroCantado(numero, ioRef);
}

async function initWhatsappBot(io) {
  ioRef = io;
  estado.conectando = true;
  // Cierra la conexión anterior antes de abrir una nueva -- en un reconecte
  // (ej. tras el 515 "restart required" normal, o varios QR seguidos sin
  // escanear) sin esto quedaban dos sockets usando las mismas credenciales
  // en simultáneo por un instante, lo que podía terminar en el "conflict"
  // 401 que WhatsApp manda cuando detecta dos sesiones pisándose.
  if (sock) {
    try { sock.ev.removeAllListeners(); sock.end(undefined); } catch (e) { /* no-op */ }
  }
  await restaurarCredencialesDesdeR2();
  const { state, saveCreds } = await useMultiFileAuthState(authDir);

  sock = makeWASocket({
    auth: state,
    logger: pino({ level: 'silent' }),
    printQRInTerminal: false,
  });

  sock.ev.on('creds.update', () => {
    saveCreds();
    programarBackupR2();
  });

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;
    const code = lastDisconnect?.error?.output?.statusCode;
    // Log explícito de cada transición -- este bot conecta/reconecta solo en
    // segundo plano, sin que nadie esté mirando; sin esto, si se queda dando
    // vueltas (ej. reconectando en loop) no hay forma de verlo desde los
    // logs del servidor.
    console.log('[whatsappBot] connection.update:', JSON.stringify({ connection, tieneQr: !!qr, code, motivo: lastDisconnect?.error?.message }));
    if (qr) {
      estado.qrDataUrl = await QRCode.toDataURL(qr);
      estado.conectado = false;
      estado.conectando = false;
      emitirEstado();
    }
    if (connection === 'open') {
      estado.conectado = true;
      estado.conectando = false;
      estado.qrDataUrl = null;
      estado.numero = (sock.user && sock.user.id) ? sock.user.id.split(':')[0] : null;
      await cargarGrupos();
      emitirEstado();
    }
    if (connection === 'close') {
      estado.conectado = false;
      estado.conectando = false;
      emitirEstado();
      if (code === DisconnectReason.loggedOut) {
        // Sesión invalidada -- puede ser un logout real desde el celular, o
        // (visto en producción) un "conflict" 401 justo después de escanear
        // el QR, cuando WhatsApp rechaza el emparejamiento. En cualquier
        // caso hay que escanear un QR nuevo -- pero antes había que venir a
        // reiniciar el bot a mano para que apareciera uno; ahora se borran
        // las credenciales viejas y se pide uno nuevo solo, sin intervención.
        console.log('[whatsappBot] sesión deslogueada/rechazada, pidiendo un QR nuevo automáticamente');
        borrarCredenciales();
        setTimeout(() => initWhatsappBot(io), 3000);
      } else {
        // Cualquier otro corte (red, WhatsApp reiniciando la conexión, el
        // "restartRequired" 515 que manda WhatsApp como parte normal del
        // primer handshake) se reintenta solo, como ya hace WhatsApp Web en
        // el navegador.
        console.log('[whatsappBot] reconectando en 5s...');
        setTimeout(() => initWhatsappBot(io), 5000);
      }
    }
  });

  sock.ev.on('messages.upsert', ({ messages }) => {
    messages.forEach((m) => {
      try { procesarMensaje(m); } catch (e) { console.error('[whatsappBot] error procesando mensaje:', e.message); }
    });
  });
}

// Cierra la sesión activa y borra credenciales (locales + backup en R2),
// para vincular de cero -- ej. otra WhatsApp, o el número de la admin cambió.
async function desconectar() {
  if (sock) {
    // Saca los listeners del socket viejo ANTES de cerrarlo -- si no, el
    // 'close' que dispara logout() lo agarra el listener de
    // connection.update de más arriba, que AHORA TAMBIÉN reconecta solo
    // (ver el fix del "conflict" 401), y se termina llamando a
    // initWhatsappBot() dos veces casi al mismo tiempo: una acá, y otra
    // desde ese listener -- dos sockets peleándose por las mismas
    // credenciales, la misma causa raíz del bug del iPhone.
    try { sock.ev.removeAllListeners(); } catch (e) { /* no-op */ }
    try { await sock.logout(); } catch (e) { /* no-op, puede que ya esté cerrada */ }
    try { sock.end(undefined); } catch (e) { /* no-op */ }
  }
  borrarCredenciales();
  estado.conectado = false;
  estado.qrDataUrl = null;
  estado.numero = null;
  estado.grupos = [];
  emitirEstado();
  if (ioRef) initWhatsappBot(ioRef).catch((e) => console.error('[whatsappBot] error reconectando tras desconectar:', e.message));
}

module.exports = { initWhatsappBot, getEstado, desconectar };
