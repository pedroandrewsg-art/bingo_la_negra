// routes/auth.js
const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../db');
const { SECRET, requireAuth, requireAdmin } = require('../authMiddleware');

const router = express.Router();

// ---------- LOGIN ADMINISTRADOR (usuario + contraseña) ----------
router.post('/login', async (req, res) => {
  const { username, password } = req.body;
  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
  if (!user) return res.status(401).json({ error: 'Credenciales inválidas' });
  const ok = await bcrypt.compare(password, user.password);
  if (!ok) return res.status(401).json({ error: 'Credenciales inválidas' });
  const token = jwt.sign({ id: user.id, username: user.username, role: 'admin' }, SECRET, { expiresIn: '30d' });
  res.json({ token, user: { id: user.id, username: user.username, role: 'admin' } });
});

router.get('/me', requireAuth, (req, res) => {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  if (!user) return res.status(404).json({ error: 'No encontrado' });
  res.json({ user: { id: user.id, username: user.username, role: 'admin' } });
});

// ---------- USUARIOS ADMINISTRADORES (gestión desde Configuración) ----------
router.get('/usuarios', requireAuth, requireAdmin, (req, res) => {
  const usuarios = db.prepare('SELECT id, username, created_at FROM users ORDER BY id ASC').all();
  res.json({ usuarios });
});

router.post('/usuarios', requireAuth, requireAdmin, async (req, res) => {
  const username = (req.body.username || '').trim();
  const { password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Usuario y contraseña son obligatorios' });
  if (password.length < 6) return res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres' });
  const existe = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
  if (existe) return res.status(400).json({ error: 'Ya existe un usuario con ese nombre' });
  const hash = await bcrypt.hash(password, 10);
  const info = db.prepare(`INSERT INTO users (username, password, role) VALUES (?, ?, 'admin')`).run(username, hash);
  res.json({ ok: true, usuario: { id: info.lastInsertRowid, username } });
});

router.put('/usuarios/:id/password', requireAuth, requireAdmin, async (req, res) => {
  const { password } = req.body;
  if (!password || password.length < 6) return res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres' });
  const usuario = db.prepare('SELECT id FROM users WHERE id = ?').get(req.params.id);
  if (!usuario) return res.status(404).json({ error: 'Usuario no encontrado' });
  const hash = await bcrypt.hash(password, 10);
  db.prepare('UPDATE users SET password = ? WHERE id = ?').run(hash, req.params.id);
  res.json({ ok: true });
});

router.delete('/usuarios/:id', requireAuth, requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  if (id === req.user.id) return res.status(400).json({ error: 'No podés eliminar tu propio usuario' });
  const total = db.prepare('SELECT COUNT(*) c FROM users').get().c;
  if (total <= 1) return res.status(400).json({ error: 'Debe quedar al menos un usuario administrador' });
  const info = db.prepare('DELETE FROM users WHERE id = ?').run(id);
  if (!info.changes) return res.status(404).json({ error: 'Usuario no encontrado' });
  res.json({ ok: true });
});

module.exports = router;
