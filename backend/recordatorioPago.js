// recordatorioPago.js — Recordatorio de pago para jugadores con cartones
// pendientes (estado 'vendido', sin verificar) vía notificación push (Web
// Push), configurable por el admin (activo/desactivado + texto, ver
// routes/settings.js -> /recordatorio-pago). Corre en segundo plano cada
// minuto: le llega al jugador aunque tenga el navegador minimizado o haya
// cambiado de app (la voz hablada, en cambio, solo puede sonar mientras la
// pestaña siga abierta -- eso lo maneja el frontend, acá solo se manda la
// notificación nativa).
//
// Sin VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY configuradas (ver .env.example),
// esta función simplemente no envía nada -- el resto de la app sigue
// funcionando igual, no hace falta tener Web Push configurado para usar el
// sistema.
const webpush = require('web-push');
const db = require('./db');

const INTERVALO_MS = 60 * 1000;

const vapidListo = !!(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
if (vapidListo) {
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || 'mailto:soporte@example.com',
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
  );
}

function getSetting(key) {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
  return row ? row.value : '';
}

function enviarRecordatorios() {
  if (!vapidListo) return;
  if (getSetting('recordatorio_pago_activo') !== '1') return;

  const jugadoresPendientes = db
    .prepare(`SELECT DISTINCT owner_id FROM cartones WHERE estado = 'vendido' AND owner_id IS NOT NULL`)
    .all()
    .map((r) => r.owner_id);
  if (!jugadoresPendientes.length) return;

  const placeholders = jugadoresPendientes.map(() => '?').join(',');
  const subs = db
    .prepare(`SELECT * FROM push_subscripciones WHERE jugador_id IN (${placeholders})`)
    .all(...jugadoresPendientes);
  if (!subs.length) return;

  const texto = getSetting('recordatorio_pago_texto') || 'Recuerde enviar el pago de sus cartones';
  const payload = JSON.stringify({ title: '🎱 Bingo', body: texto });
  const borrarSub = db.prepare('DELETE FROM push_subscripciones WHERE id = ?');

  subs.forEach((sub) => {
    webpush
      .sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, payload)
      .catch((err) => {
        // 404/410 = el navegador invalidó esta suscripción (desinstaló el
        // sitio, borró datos, etc.) -- ya no sirve, se limpia sola.
        if (err.statusCode === 404 || err.statusCode === 410) {
          borrarSub.run(sub.id);
        } else {
          console.error('[recordatorioPago] error enviando push:', err.message);
        }
      });
  });
}

function iniciarRecordatorioPago() {
  setInterval(() => {
    try { enviarRecordatorios(); } catch (err) { console.error('[recordatorioPago] error:', err); }
  }, INTERVALO_MS);
}

module.exports = { iniciarRecordatorioPago };
