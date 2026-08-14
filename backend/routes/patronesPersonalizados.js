// routes/patronesPersonalizados.js — Figuras/patrones ganadores dibujados a
// mano por el admin (además del catálogo fijo de patterns.js), persistentes
// para reusarse en cualquier sorteo futuro.
const express = require('express');
const db = require('../db');
const { requireAuth, requireAdmin } = require('../authMiddleware');
const { registrarLog } = require('../logActividad');

const router = express.Router();

function mascaraValida(mascara) {
  if (!Array.isArray(mascara) || mascara.length !== 5) return false;
  return mascara.every((fila) => Array.isArray(fila) && fila.length === 5 && fila.every((v) => v === 0 || v === 1));
}

router.post('/', requireAuth, requireAdmin, (req, res) => {
  const { nombre, mascara } = req.body;
  const nombreTrim = (nombre || '').trim();
  if (!nombreTrim) return res.status(400).json({ error: 'Ponle un nombre a la figura' });
  if (!mascaraValida(mascara)) return res.status(400).json({ error: 'La figura debe ser una máscara 5x5 de 0/1' });
  const tieneAlMenosUna = mascara.some((fila) => fila.some((v) => v === 1));
  if (!tieneAlMenosUna) return res.status(400).json({ error: 'Marca al menos una casilla de la figura' });

  // El centro (LIBRE) siempre cuenta como marcado en un cartón real.
  const mascaraFinal = mascara.map((fila) => fila.slice());
  mascaraFinal[2][2] = 1;

  const info = db
    .prepare('INSERT INTO patrones_personalizados (nombre, mascara) VALUES (?, ?)')
    .run(nombreTrim, JSON.stringify(mascaraFinal));
  registrarLog(req, 'configuracion', 'Creó una figura personalizada', nombreTrim);
  res.json({ patron: { key: `custom_${info.lastInsertRowid}`, label: nombreTrim, preview: mascaraFinal, personalizada: true } });
});

router.delete('/:id', requireAuth, requireAdmin, (req, res) => {
  const figura = db.prepare('SELECT nombre FROM patrones_personalizados WHERE id = ?').get(req.params.id);
  const info = db.prepare('DELETE FROM patrones_personalizados WHERE id = ?').run(req.params.id);
  if (!info.changes) return res.status(404).json({ error: 'Figura no encontrada' });
  registrarLog(req, 'configuracion', 'Eliminó una figura personalizada', figura?.nombre);
  res.json({ ok: true });
});

module.exports = router;
