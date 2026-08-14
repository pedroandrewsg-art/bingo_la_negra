// routes/catalogosImagenes.js — Catálogo persistente de cartones
// personalizados: sets de imágenes ya diseñadas (cartones físicos
// escaneados/diagramados), numeradas en orden, alojadas en repos del admin.
// El admin pega la lista de links (uno por línea = un número de cartón) y
// eso queda guardado en la base de datos, listo para asignarse a un sorteo.
const express = require('express');
const db = require('../db');
const { requireAuth, requireAdmin } = require('../authMiddleware');
const { registrarLog } = require('../logActividad');

const router = express.Router();

function urlsValidas(urls) {
  return Array.isArray(urls) && urls.length > 0 && urls.every((u) => typeof u === 'string' && u.trim());
}

router.get('/', requireAuth, requireAdmin, (req, res) => {
  const rows = db
    .prepare(
      `SELECT c.id, c.nombre, c.color, c.created_at, COUNT(i.id) AS total_imagenes
       FROM catalogos_imagenes c LEFT JOIN catalogo_imagenes_items i ON i.catalogo_id = c.id
       GROUP BY c.id ORDER BY c.id DESC`
    )
    .all();
  res.json({ catalogos: rows });
});

router.get('/:id', requireAuth, requireAdmin, (req, res) => {
  const catalogo = db.prepare('SELECT * FROM catalogos_imagenes WHERE id = ?').get(req.params.id);
  if (!catalogo) return res.status(404).json({ error: 'Catálogo no encontrado' });
  const items = db
    .prepare('SELECT numero, url FROM catalogo_imagenes_items WHERE catalogo_id = ? ORDER BY numero ASC')
    .all(req.params.id);
  res.json({ catalogo: { ...catalogo, items } });
});

router.post('/', requireAuth, requireAdmin, (req, res) => {
  const { nombre, color, urls } = req.body;
  const nombreTrim = (nombre || '').trim();
  if (!nombreTrim) return res.status(400).json({ error: 'Ponle un nombre al catálogo' });
  if (!color) return res.status(400).json({ error: 'Selecciona un color' });
  if (!urlsValidas(urls)) return res.status(400).json({ error: 'Pega al menos un link de imagen' });

  const info = db.prepare('INSERT INTO catalogos_imagenes (nombre, color) VALUES (?, ?)').run(nombreTrim, color);
  const catalogoId = info.lastInsertRowid;
  const insertItem = db.prepare('INSERT INTO catalogo_imagenes_items (catalogo_id, numero, url) VALUES (?, ?, ?)');
  const tx = db.transaction((urls) => {
    urls.forEach((u, i) => insertItem.run(catalogoId, i + 1, u.trim()));
  });
  tx(urls);

  registrarLog(req, 'configuracion', 'Creó un catálogo de cartones personalizados', nombreTrim);
  res.json({ ok: true, id: catalogoId, total: urls.length });
});

// Reemplaza por completo nombre/color/items — más simple y predecible que un
// merge parcial, y cubre tanto "corregir un link" como "agregar más cartones".
router.put('/:id', requireAuth, requireAdmin, (req, res) => {
  const { id } = req.params;
  const catalogo = db.prepare('SELECT * FROM catalogos_imagenes WHERE id = ?').get(id);
  if (!catalogo) return res.status(404).json({ error: 'Catálogo no encontrado' });
  const { nombre, color, urls } = req.body;
  const nombreTrim = (nombre || '').trim();
  if (!nombreTrim) return res.status(400).json({ error: 'Ponle un nombre al catálogo' });
  if (!color) return res.status(400).json({ error: 'Selecciona un color' });
  if (!urlsValidas(urls)) return res.status(400).json({ error: 'Pega al menos un link de imagen' });

  const tx = db.transaction((urls) => {
    db.prepare('UPDATE catalogos_imagenes SET nombre = ?, color = ? WHERE id = ?').run(nombreTrim, color, id);
    db.prepare('DELETE FROM catalogo_imagenes_items WHERE catalogo_id = ?').run(id);
    const insertItem = db.prepare('INSERT INTO catalogo_imagenes_items (catalogo_id, numero, url) VALUES (?, ?, ?)');
    urls.forEach((u, i) => insertItem.run(id, i + 1, u.trim()));
  });
  tx(urls);

  registrarLog(req, 'configuracion', 'Editó un catálogo de cartones personalizados', nombreTrim);
  res.json({ ok: true, total: urls.length });
});

router.delete('/:id', requireAuth, requireAdmin, (req, res) => {
  const catalogo = db.prepare('SELECT nombre FROM catalogos_imagenes WHERE id = ?').get(req.params.id);
  const info = db.prepare('DELETE FROM catalogos_imagenes WHERE id = ?').run(req.params.id);
  if (!info.changes) return res.status(404).json({ error: 'Catálogo no encontrado' });
  registrarLog(req, 'configuracion', 'Eliminó un catálogo de cartones personalizados', catalogo?.nombre);
  res.json({ ok: true });
});

module.exports = router;
