// server.js — Punto de entrada del backend
require('dotenv').config();
const express = require('express');
const http = require('http');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { Server } = require('socket.io');

const authRoutes = require('./routes/auth');
const { router: sorteosRoutes } = require('./routes/sorteos');
const cartonesRoutes = require('./routes/cartones');
const ventasRoutes = require('./routes/ventas');
const jugadoresRoutes = require('./routes/jugadores');
const patronesPersonalizadosRoutes = require('./routes/patronesPersonalizados');
const catalogosImagenesRoutes = require('./routes/catalogosImagenes');
const settingsRoutes = require('./routes/settings');
const logsRoutes = require('./routes/logs');
const { attachSockets } = require('./sockets');
const { r2, BUCKET, GetObjectCommand } = require('./r2');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });
app.set('io', io);

const dataDir = process.env.DATA_DIR || __dirname;
const uploadsDir = path.join(dataDir, 'uploads');
fs.mkdirSync(uploadsDir, { recursive: true });

app.use(cors());
app.use(express.json());
app.use('/uploads', express.static(uploadsDir));

// El logo se guarda en Cloudflare R2 (ver routes/settings.js). Si no está en
// disco local (siempre el caso en producción), se sirve proxy-eando el objeto.
app.get('/uploads/logo/:filename', async (req, res) => {
  try {
    const obj = await r2.send(new GetObjectCommand({ Bucket: BUCKET, Key: `logo/${req.params.filename}` }));
    res.set('Content-Type', obj.ContentType || 'application/octet-stream');
    res.set('Cache-Control', 'public, max-age=31536000, immutable');
    obj.Body.pipe(res);
  } catch (err) {
    res.status(404).end();
  }
});

app.use(express.static(path.join(__dirname, '../frontend')));

app.use('/api/auth', authRoutes);
app.use('/api/sorteos', sorteosRoutes);
app.use('/api/cartones', cartonesRoutes);
app.use('/api/ventas', ventasRoutes);
app.use('/api/jugadores', jugadoresRoutes);
app.use('/api/patrones-personalizados', patronesPersonalizadosRoutes);
app.use('/api/catalogos-imagenes', catalogosImagenesRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/logs', logsRoutes);

app.get('/api/health', (req, res) => res.json({ ok: true, time: new Date().toISOString() }));

// Red de seguridad: un error sin capturar en CUALQUIER handler (ej. un
// endpoint async que rechaza una promesa) por defecto tumba TODO el proceso
// en Node, cortando a TODOS los usuarios conectados por un solo pedido malo
// (visto en producción: un bot pegándole a /api/auth/login sin body dejó el
// server en loop de reinicios). Loguear y seguir vivo es mucho mejor que eso.
process.on('unhandledRejection', (err) => {
  console.error('[server] unhandledRejection:', err);
});
process.on('uncaughtException', (err) => {
  console.error('[server] uncaughtException:', err);
});

attachSockets(io);

const PORT = process.env.PORT || 4000;
server.listen(PORT, () => {
  console.log(`Bingo backend escuchando en http://localhost:${PORT}`);
});
