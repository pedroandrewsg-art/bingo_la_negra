// scripts/start.js — Punto de arranque en producción (Render).
// Si Litestream está disponible (Linux + binario instalado + credenciales
// R2 configuradas), restaura el último snapshot de bingo.db y arranca el
// server bajo "litestream replicate -exec" para que siga replicando en
// segundo plano. Si no (ej. desarrollo local), arranca el server directo.
const { spawnSync, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const backendDir = path.join(__dirname, '..');
const litestreamBin = path.join(backendDir, 'bin', 'litestream');
const configPath = path.join(backendDir, 'litestream.yml');
const dbPath = path.join(backendDir, 'bingo.db');

const canUseLitestream =
  process.platform === 'linux' &&
  fs.existsSync(litestreamBin) &&
  !!process.env.R2_BUCKET &&
  !!process.env.R2_ENDPOINT &&
  !!process.env.R2_ACCESS_KEY_ID &&
  !!process.env.R2_SECRET_ACCESS_KEY;

if (!canUseLitestream) {
  console.log('[start] Litestream no configurado, arrancando server.js directamente.');
  require(path.join(backendDir, 'server.js'));
} else {
  console.log('[start] Restaurando bingo.db desde R2 (si existe)...');
  const restore = spawnSync(
    litestreamBin,
    ['restore', '-if-replica-exists', '-config', configPath, dbPath],
    { stdio: 'inherit', cwd: backendDir }
  );
  if (restore.status !== 0) {
    console.warn('[start] litestream restore terminó con código', restore.status, '- continuando igual.');
  }

  console.log('[start] Arrancando server.js bajo litestream replicate...');
  const child = spawn(
    litestreamBin,
    ['replicate', '-config', configPath, '-exec', 'node server.js'],
    { stdio: 'inherit', cwd: backendDir }
  );
  child.on('exit', (code) => process.exit(code === null ? 1 : code));
}
