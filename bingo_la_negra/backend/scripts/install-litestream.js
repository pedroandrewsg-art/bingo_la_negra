// scripts/install-litestream.js — Descarga el binario de Litestream durante
// el build en Render (Linux). En desarrollo local (Windows/Mac) no hace
// falta: el backend sigue usando el bingo.db local tal cual siempre.
const { execSync } = require('child_process');
const path = require('path');

const LITESTREAM_VERSION = '0.3.13';

if (process.platform !== 'linux') {
  console.log('[litestream] Plataforma no-Linux detectada, se omite la descarga (solo hace falta en Render).');
  process.exit(0);
}

const arch = process.arch === 'arm64' ? 'arm64' : 'amd64';
const url = `https://github.com/benbjohnson/litestream/releases/download/v${LITESTREAM_VERSION}/litestream-v${LITESTREAM_VERSION}-linux-${arch}.tar.gz`;
const binDir = path.join(__dirname, '..', 'bin');

try {
  console.log(`[litestream] Descargando ${url} ...`);
  execSync(`mkdir -p "${binDir}" && curl -sL "${url}" | tar -xz -C "${binDir}"`, { stdio: 'inherit' });
  execSync(`chmod +x "${path.join(binDir, 'litestream')}"`);
  console.log('[litestream] Instalado en backend/bin/litestream');
} catch (err) {
  console.error('[litestream] No se pudo descargar/instalar. La app va a arrancar sin replicación.', err.message);
}
