// routes/settings.js — Configuración global clave/valor (ej. link del grupo
// de WhatsApp, logo del sitio), editable por el admin desde "Configuración".
const express = require('express');
const path = require('path');
const multer = require('multer');
const db = require('../db');
const { requireAuth, requireAdmin } = require('../authMiddleware');
const { r2, BUCKET, PutObjectCommand, DeleteObjectCommand } = require('../r2');
const whatsappBot = require('../whatsappBot');
const WHATSAPP_LIVE_DEFAULTS = require('../whatsappLiveDefaults');
const WHATSAPP_LIVE_KEYS = Object.keys(WHATSAPP_LIVE_DEFAULTS);
const DEFAULT_LOGIN_SUBTITLE = '75 bolillas · en tiempo real';

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 3 * 1024 * 1024 }, // 3MB
  fileFilter: (req, file, cb) => {
    if (!/^image\/(png|jpe?g|webp|gif)$/.test(file.mimetype)) return cb(new Error('El logo debe ser una imagen (png, jpg, webp o gif)'));
    cb(null, true);
  },
});

const uploadSonido = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 }, // 20MB, alcanza para una canción completa (ej. un tema propio de fondo) — igualado con client_max_body_size del proxy nginx delante de la app
  fileFilter: (req, file, cb) => {
    if (!/^audio\/(mpeg|ogg|wav|x-wav|mp4|webm|m4a|x-m4a)$/.test(file.mimetype)) return cb(new Error('El sonido debe ser un archivo de audio (mp3, ogg, wav o m4a)'));
    cb(null, true);
  },
});

// Categorías de sonido configurable y sus presets (sintetizados con Web
// Audio en el frontend, sin archivos — acá solo viven nombre/etiqueta para
// poblar la biblioteca). El aviso de "reclamo pendiente" del panel admin NO
// es configurable a propósito, queda fuera de esto.
const SOUND_CATEGORIAS = ['alerta', 'fanfarria', 'musica'];
const SOUND_PRESETS = {
  alerta: [
    { nombre: 'arpegio', etiqueta: 'Arpegio (clásico)' },
    { nombre: 'campana', etiqueta: 'Campana' },
    { nombre: 'tambor', etiqueta: 'Tambor' },
    { nombre: 'arcade', etiqueta: 'Arcade' },
    { nombre: 'xilofono', etiqueta: 'Xilófono' },
    { nombre: 'notificacion', etiqueta: 'Notificación' },
    { nombre: 'laser', etiqueta: 'Láser' },
    { nombre: 'burbuja', etiqueta: 'Burbuja' },
  ],
  fanfarria: [
    { nombre: 'fanfarria', etiqueta: 'Fanfarria' },
    { nombre: 'campanario', etiqueta: 'Campanario' },
    { nombre: 'arcade-win', etiqueta: 'Victoria arcade' },
    { nombre: 'sirena', etiqueta: 'Sirena' },
    { nombre: 'coro', etiqueta: 'Coro' },
    { nombre: 'redoble', etiqueta: 'Redoble y platillo' },
  ],
  musica: [
    { nombre: 'suspenso', etiqueta: 'Suspenso' },
    { nombre: 'tension', etiqueta: 'Tensión creciente' },
    { nombre: 'oceano', etiqueta: 'Olas del océano' },
    { nombre: 'latidos', etiqueta: 'Latidos' },
    { nombre: 'electronico', etiqueta: 'Electrónico' },
  ],
};
const SOUND_DEFAULT_SEL = { alerta: 'preset:arpegio', fanfarria: 'preset:fanfarria', musica: 'off' };

function resolverSonido(categoria) {
  const sel = getSetting(`sonido_${categoria}_sel`) || SOUND_DEFAULT_SEL[categoria];
  let base;
  if (sel === 'off' || !sel) base = { tipo: 'off' };
  else if (sel.startsWith('custom:')) {
    const id = Number(sel.slice('custom:'.length));
    const row = db.prepare('SELECT id, nombre, url FROM sound_assets WHERE id = ? AND categoria = ?').get(id, categoria);
    base = row ? { tipo: 'custom', id: row.id, nombre: row.nombre, url: row.url } : { tipo: 'preset', nombre: SOUND_DEFAULT_SEL[categoria].slice('preset:'.length) };
  } else if (sel.startsWith('preset:')) base = { tipo: 'preset', nombre: sel.slice('preset:'.length) };
  else base = { tipo: 'off' };

  // Solo la música de tensión tiene control de frecuencia (continuo / una
  // vez / por tiempo fijo) — el aviso y la fanfarria son siempre un disparo
  // corto único, no necesitan esto.
  if (categoria === 'musica') {
    base.modo = getSetting('sonido_musica_modo') || 'continuo';
    base.duracionSeg = Number(getSetting('sonido_musica_duracion_seg')) || 8;
    // '' (nunca configurado) -> 100 por defecto; 0 es un valor válido (mute),
    // por eso no se puede usar `Number(...) || 100` acá (0 es falsy).
    const volRaw = getSetting('sonido_musica_volumen');
    base.volumen = volRaw === '' ? 100 : Math.min(100, Math.max(0, Number(volRaw)));
  }
  return base;
}

// Formato válido de un id de tema visual (ver CARD_THEMES en frontend/app.js:
// 'ninguno', los 10 propios, y los 62 'gen-xxx' importados del generador de
// cartones). Se valida por FORMATO, no por lista exacta, a propósito — con
// ~73 temas y contando, mantener una copia de la lista completa acá (además
// de la real en app.js) es que tarde o temprano se desincronicen y un tema
// válido se rechace con "Tema de cartón inválido" (bug real que pasó: los 62
// 'gen-*' no estaban en esta lista). Si el id no existe en CARD_THEMES del
// frontend, este simplemente cae al tema por defecto ahí — no rompe nada.
const CARD_THEME_ID_RE = /^[a-z0-9-]{1,40}$/;

function getSetting(key) {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
  return row ? row.value : '';
}
function setSetting(key, value) {
  const info = db.prepare('UPDATE settings SET value = ? WHERE key = ?').run(value, key);
  if (!info.changes) db.prepare('INSERT INTO settings (key, value) VALUES (?, ?)').run(key, value);
}

// Config pública (sin login): la pantalla de acceso necesita el logo antes
// de que el jugador/admin se identifique, y "Consulta tu Carta" (también
// pública) necesita el tema visual y la forma de marcado para pintar los
// cartones igual que en el resto de la app.
router.get('/public', (req, res) => {
  res.json({
    logoUrl: getSetting('logo_path') || '',
    cartonFondoUrl: getSetting('carton_fondo_path') || '',
    cardTheme: getSetting('card_theme') || 'arcoiris',
    cardShape: getSetting('card_shape') || 'circulo',
    bloqueoCartonesPendientes: getSetting('bloqueo_cartones_pendientes') === '1',
    loginSubtitle: getSetting('login_subtitle') || DEFAULT_LOGIN_SUBTITLE,
    sonido: {
      alerta: resolverSonido('alerta'),
      fanfarria: resolverSonido('fanfarria'),
      musica: resolverSonido('musica'),
    },
  });
});

router.put('/card-theme', requireAuth, requireAdmin, (req, res) => {
  const tema = req.body.tema;
  if (typeof tema !== 'string' || !CARD_THEME_ID_RE.test(tema)) return res.status(400).json({ error: 'Tema de cartón inválido' });
  setSetting('card_theme', tema);
  res.json({ ok: true, cardTheme: tema });
});

// Forma de las casillas marcadas/LIBRE cuando hay un tema activo (no aplica
// a "Sin tema", que siempre es cuadrado) — "circulo" (bolita, default) o
// "cuadrado" (mismo tema de colores, sin redondear a círculo).
router.put('/card-shape', requireAuth, requireAdmin, (req, res) => {
  const forma = req.body.forma;
  if (forma !== 'circulo' && forma !== 'cuadrado') return res.status(400).json({ error: 'Forma inválida' });
  setSetting('card_shape', forma);
  res.json({ ok: true, cardShape: forma });
});

// Bloqueo visual de cartones sin pago verificado: mientras está activo, la
// sala de juego del propio jugador muestra sus cartones "vendido" (comprados
// pero sin que el admin confirme el pago) borrosos con un candado encima, en
// vez del cartón legible de siempre. No afecta paneles de admin ni cartones
// ya "pagado" (ver MiniCard en el frontend).
router.put('/bloqueo-cartones', requireAuth, requireAdmin, (req, res) => {
  const activo = !!req.body.activo;
  setSetting('bloqueo_cartones_pendientes', activo ? '1' : '0');
  res.json({ ok: true, activo });
});

router.get('/whatsapp', requireAuth, (req, res) => {
  res.json({ link: getSetting('whatsapp_link') });
});

// Vista de "Reclamos de Bingo" en el panel del sorteador: 'carton' (default,
// muestra solo el cartón individual que reclamó) o activada, muestra la
// carta completa (todos los cartones A/B/C/D del combo) con el cartón
// ganador resaltado — para verificar contra el cartón físico completo.
router.get('/reclamos-vista', requireAuth, (req, res) => {
  res.json({ cartaCompleta: getSetting('reclamos_carta_completa') === '1' });
});

router.put('/reclamos-vista', requireAuth, requireAdmin, (req, res) => {
  const activo = !!req.body.activo;
  setSetting('reclamos_carta_completa', activo ? '1' : '0');
  res.json({ ok: true, activo });
});

// Minutos de espera antes de liberar automáticamente un cartón 'vendido'
// (apartado, sin pago verificado) — ver backend/liberarPendientes.js, que
// corre en segundo plano cada 30s y lee esta misma clave. 0 = desactivado.
router.get('/liberacion-pendientes', requireAuth, requireAdmin, (req, res) => {
  res.json({ minutos: Number(getSetting('liberacion_pendientes_minutos')) || 0 });
});

router.put('/liberacion-pendientes', requireAuth, requireAdmin, (req, res) => {
  const minutos = Number(req.body.minutos);
  if (!Number.isFinite(minutos) || minutos < 0 || !Number.isInteger(minutos)) {
    return res.status(400).json({ error: 'Los minutos deben ser un número entero, 0 o mayor' });
  }
  // Tope de una semana -- un valor absurdamente alto (ej. escrito de más)
  // sería indistinguible de "desactivado" en la práctica, pero mejor
  // rechazarlo explícito que dejar un dato sin sentido guardado.
  if (minutos > 10080) {
    return res.status(400).json({ error: 'Máximo 10080 minutos (7 días)' });
  }
  setSetting('liberacion_pendientes_minutos', String(minutos));
  res.json({ ok: true, minutos });
});

// Recordatorio de pago (notificación push + voz, ver
// backend/recordatorioPago.js y frontend RecordatorioPago) — activo/texto.
// `/publico` es sin login: el jugador necesita esto para saber si tiene que
// mostrar el botón de "Activar recordatorio" en la sala de juego, y el texto
// exacto para la voz, antes de que exista ningún reclamo de sesión especial.
router.get('/recordatorio-pago', requireAuth, requireAdmin, (req, res) => {
  res.json({
    activo: getSetting('recordatorio_pago_activo') === '1',
    texto: getSetting('recordatorio_pago_texto') || 'Recuerde enviar el pago de sus cartones',
  });
});

router.get('/recordatorio-pago/publico', requireAuth, (req, res) => {
  res.json({
    activo: getSetting('recordatorio_pago_activo') === '1',
    texto: getSetting('recordatorio_pago_texto') || 'Recuerde enviar el pago de sus cartones',
  });
});

router.put('/recordatorio-pago', requireAuth, requireAdmin, (req, res) => {
  const { activo, texto } = req.body;
  if (typeof activo !== 'boolean') return res.status(400).json({ error: 'Falta indicar activo (true/false)' });
  const textoLimpio = typeof texto === 'string' ? texto.trim().slice(0, 200) : '';
  if (activo && !textoLimpio) return res.status(400).json({ error: 'Escribí el texto del recordatorio' });
  setSetting('recordatorio_pago_activo', activo ? '1' : '0');
  if (textoLimpio) setSetting('recordatorio_pago_texto', textoLimpio);
  res.json({ ok: true, activo, texto: textoLimpio || getSetting('recordatorio_pago_texto') });
});

router.put('/whatsapp', requireAuth, requireAdmin, (req, res) => {
  const link = (req.body.link || '').trim();
  if (!link) return res.status(400).json({ error: 'Ponle un link al grupo de WhatsApp' });
  setSetting('whatsapp_link', link);
  res.json({ ok: true, link });
});

// Mensaje configurable debajo del logo en la pantalla de acceso (con
// animación en el frontend). Vacío es válido: cae al default al leerlo.
router.put('/login-subtitle', requireAuth, requireAdmin, (req, res) => {
  const mensaje = typeof req.body.mensaje === 'string' ? req.body.mensaje.trim() : '';
  setSetting('login_subtitle', mensaje);
  res.json({ ok: true, mensaje: mensaje || DEFAULT_LOGIN_SUBTITLE });
});

// Textos/emoji configurables del módulo "WhatsApp Live" (encabezado/pie de
// Disponibles y Pendientes, emoji de Pagado). A diferencia del link de
// WhatsApp de arriba, acá un valor vacío es válido (un admin puede decidir no
// tener pie de página), así que solo se valida el tipo. Nota: sin `|| DEFAULT`
// a propósito — db.js ya siembra estas 5 claves al arrancar (así que la fila
// siempre existe), y como '' también es falsy en JS, un `|| DEFAULT` acá
// repondría el default cada vez que un admin lo borra intencionalmente (ver
// WHATSAPP_LIVE_DEFAULTS solo como valor de siembra, no como respaldo de
// lectura).
router.get('/whatsapp-live', requireAuth, (req, res) => {
  const out = {};
  WHATSAPP_LIVE_KEYS.forEach((k) => { out[k] = getSetting(k); });
  res.json(out);
});

router.put('/whatsapp-live', requireAuth, requireAdmin, (req, res) => {
  for (const k of WHATSAPP_LIVE_KEYS) {
    if (req.body[k] !== undefined && typeof req.body[k] !== 'string') {
      return res.status(400).json({ error: `"${k}" debe ser texto` });
    }
  }
  WHATSAPP_LIVE_KEYS.forEach((k) => { if (req.body[k] !== undefined) setSetting(k, req.body[k]); });
  const out = {};
  WHATSAPP_LIVE_KEYS.forEach((k) => { out[k] = getSetting(k); });
  res.json({ ok: true, ...out });
});

router.post('/logo', requireAuth, requireAdmin, (req, res) => {
  upload.single('logo')(req, res, async (err) => {
    if (err) return res.status(400).json({ error: err.message });
    if (!req.file) return res.status(400).json({ error: 'Selecciona una imagen para el logo' });

    try {
      const filename = `logo-${Date.now()}${path.extname(req.file.originalname).toLowerCase()}`;
      const key = `logo/${filename}`;

      await r2.send(new PutObjectCommand({
        Bucket: BUCKET,
        Key: key,
        Body: req.file.buffer,
        ContentType: req.file.mimetype,
      }));

      const anterior = getSetting('logo_path');
      const logoUrl = `/uploads/logo/${filename}`;
      setSetting('logo_path', logoUrl);

      if (anterior && anterior !== logoUrl) {
        const anteriorKey = anterior.replace(/^\/uploads\//, '');
        r2.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: anteriorKey })).catch(() => {}); // best-effort
      }
      res.json({ ok: true, logoUrl });
    } catch (e) {
      console.error('Error subiendo el logo a R2:', e);
      res.status(500).json({ error: 'No se pudo guardar el logo' });
    }
  });
});

// Imagen de fondo personalizada para los cartones (se ve detrás de la grilla
// de números, ver MiniCard en el frontend) -- a diferencia del logo, esta sí
// tiene botón de eliminar (el logo es "reemplazar" nada más), porque acá el
// admin puede querer volver al fondo de tema normal sin subir otra imagen.
router.post('/carton-fondo', requireAuth, requireAdmin, (req, res) => {
  upload.single('imagen')(req, res, async (err) => {
    if (err) return res.status(400).json({ error: err.message });
    if (!req.file) return res.status(400).json({ error: 'Selecciona una imagen para el fondo del cartón' });

    try {
      const filename = `carton-fondo-${Date.now()}${path.extname(req.file.originalname).toLowerCase()}`;
      const key = `carton-fondo/${filename}`;

      await r2.send(new PutObjectCommand({
        Bucket: BUCKET,
        Key: key,
        Body: req.file.buffer,
        ContentType: req.file.mimetype,
      }));

      const anterior = getSetting('carton_fondo_path');
      const cartonFondoUrl = `/uploads/carton-fondo/${filename}`;
      setSetting('carton_fondo_path', cartonFondoUrl);

      if (anterior && anterior !== cartonFondoUrl) {
        const anteriorKey = anterior.replace(/^\/uploads\//, '');
        r2.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: anteriorKey })).catch(() => {}); // best-effort
      }
      res.json({ ok: true, cartonFondoUrl });
    } catch (e) {
      console.error('Error subiendo la imagen de fondo del cartón a R2:', e);
      res.status(500).json({ error: 'No se pudo guardar la imagen' });
    }
  });
});

router.delete('/carton-fondo', requireAuth, requireAdmin, async (req, res) => {
  const actual = getSetting('carton_fondo_path');
  setSetting('carton_fondo_path', '');
  if (actual) {
    try {
      const key = actual.replace(/^\/uploads\//, '');
      await r2.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }));
    } catch (e) { /* best-effort, la referencia ya se limpió igual */ }
  }
  res.json({ ok: true });
});

// Sonido/música configurable (aviso "cerca de ganar", fanfarria de BINGO,
// música de tensión). Ver resolverSonido() arriba para el formato de
// selección y GET /public para cómo lo consumen jugador/admin sin login.
router.get('/sounds', requireAuth, requireAdmin, (req, res) => {
  const biblioteca = {};
  SOUND_CATEGORIAS.forEach((cat) => {
    const custom = db.prepare('SELECT id, nombre, url FROM sound_assets WHERE categoria = ? ORDER BY id DESC').all(cat);
    biblioteca[cat] = { presets: SOUND_PRESETS[cat], custom };
  });
  res.json({
    seleccion: {
      alerta: resolverSonido('alerta'),
      fanfarria: resolverSonido('fanfarria'),
      musica: resolverSonido('musica'),
    },
    biblioteca,
  });
});

router.post('/sounds/upload', requireAuth, requireAdmin, (req, res) => {
  uploadSonido.single('archivo')(req, res, async (err) => {
    if (err) return res.status(400).json({ error: err.message });
    if (!req.file) return res.status(400).json({ error: 'Selecciona un archivo de audio' });
    const categoria = req.body.categoria;
    if (!SOUND_CATEGORIAS.includes(categoria)) return res.status(400).json({ error: 'Categoría de sonido inválida' });
    const nombre = (req.body.nombre || req.file.originalname || 'Sonido propio').trim().slice(0, 80);

    try {
      const filename = `${Date.now()}${path.extname(req.file.originalname).toLowerCase()}`;
      const key = `sound/${categoria}/${filename}`;

      await r2.send(new PutObjectCommand({
        Bucket: BUCKET,
        Key: key,
        Body: req.file.buffer,
        ContentType: req.file.mimetype,
      }));

      const url = `/uploads/sound/${categoria}/${filename}`;
      const info = db.prepare('INSERT INTO sound_assets (categoria, nombre, url) VALUES (?, ?, ?)').run(categoria, nombre, url);
      res.json({ ok: true, asset: { id: info.lastInsertRowid, categoria, nombre, url } });
    } catch (e) {
      console.error('Error subiendo sonido a R2:', e);
      res.status(500).json({ error: 'No se pudo guardar el sonido' });
    }
  });
});

router.put('/sounds/seleccion', requireAuth, requireAdmin, (req, res) => {
  const { categoria, seleccion } = req.body;
  if (!SOUND_CATEGORIAS.includes(categoria)) return res.status(400).json({ error: 'Categoría de sonido inválida' });
  const valida = seleccion === 'off'
    || (typeof seleccion === 'string' && /^preset:[a-z0-9-]+$/.test(seleccion) && SOUND_PRESETS[categoria].some((p) => `preset:${p.nombre}` === seleccion))
    || (typeof seleccion === 'string' && /^custom:\d+$/.test(seleccion) && db.prepare('SELECT 1 FROM sound_assets WHERE id = ? AND categoria = ?').get(Number(seleccion.slice(7)), categoria));
  if (!valida) return res.status(400).json({ error: 'Selección de sonido inválida' });
  setSetting(`sonido_${categoria}_sel`, seleccion);
  res.json({ ok: true, seleccion: resolverSonido(categoria) });
});

// Frecuencia de la música de tensión (ver resolverSonido arriba): 'continuo'
// mantiene el comportamiento original (suena mientras dure la tensión),
// 'una_vez' dispara un solo sonido corto al entrar en tensión, y 'duracion'
// dispara `duracionSeg` segundos fijos. La duración se acepta y clampea
// siempre (3-60s), aunque solo se use en modo 'duracion', para no perder el
// valor que el admin ya haya cargado si cambia de modo y vuelve.
router.put('/sounds/musica-modo', requireAuth, requireAdmin, (req, res) => {
  const { modo, duracionSeg } = req.body;
  if (!['continuo', 'una_vez', 'duracion'].includes(modo)) return res.status(400).json({ error: 'Modo inválido' });
  let seg = Number(duracionSeg);
  if (!Number.isFinite(seg)) seg = 8;
  seg = Math.min(60, Math.max(3, Math.round(seg)));
  setSetting('sonido_musica_modo', modo);
  setSetting('sonido_musica_duracion_seg', String(seg));
  res.json({ ok: true, modo, duracionSeg: seg });
});

// Volumen de la música de tensión (0-100, % del nivel original ya afinado
// para cada preset/archivo — 100 preserva el comportamiento de siempre).
router.put('/sounds/musica-volumen', requireAuth, requireAdmin, (req, res) => {
  let vol = Number(req.body.volumen);
  if (!Number.isFinite(vol)) vol = 100;
  vol = Math.min(100, Math.max(0, Math.round(vol)));
  setSetting('sonido_musica_volumen', String(vol));
  res.json({ ok: true, volumen: vol });
});

router.delete('/sounds/:id', requireAuth, requireAdmin, async (req, res) => {
  const row = db.prepare('SELECT id, categoria, url FROM sound_assets WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Sonido no encontrado' });

  db.prepare('DELETE FROM sound_assets WHERE id = ?').run(row.id);
  const key = row.url.replace(/^\/uploads\//, '');
  r2.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key })).catch(() => {}); // best-effort

  const activo = getSetting(`sonido_${row.categoria}_sel`);
  if (activo === `custom:${row.id}`) setSetting(`sonido_${row.categoria}_sel`, SOUND_DEFAULT_SEL[row.categoria]);

  res.json({ ok: true });
});

// ---------- BOT DE WHATSAPP (puente números cantados) ----------
// Ver backend/whatsappBot.js -- estado en memoria del módulo (no vive en
// `settings`, solo el grupo elegido persiste ahí).
router.get('/whatsapp-bot/estado', requireAuth, requireAdmin, (req, res) => {
  res.json(whatsappBot.getEstado());
});

router.put('/whatsapp-bot/grupo', requireAuth, requireAdmin, (req, res) => {
  const grupoId = (req.body.grupoId || '').trim();
  if (!grupoId) return res.status(400).json({ error: 'Elige un grupo' });
  setSetting('whatsapp_bot_grupo_id', grupoId);
  res.json({ ok: true, grupoId });
});

router.post('/whatsapp-bot/desconectar', requireAuth, requireAdmin, async (req, res) => {
  await whatsappBot.desconectar();
  res.json({ ok: true });
});

module.exports = router;
