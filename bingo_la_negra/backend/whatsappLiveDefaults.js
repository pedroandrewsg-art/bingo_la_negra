// whatsappLiveDefaults.js — Claves de settings para el módulo "WhatsApp Live"
// (encabezados/pies de Disponibles y Pendientes, emoji de Pagado). Los
// valores acá son el texto que hoy está hardcodeado en sorteos.js: se usan
// para sembrar la tabla `settings` en db.js y como respaldo defensivo si una
// clave llegara a faltar. `{color}` en disponibles_encabezado se sustituye
// por el color del sorteo al generar el texto.
//
// Nota: a diferencia del repo hermano BINGOZ, acá no hay concepto de
// "regalo" ni "pronto pago" (sin regalo_desde/esRegalo, sin
// pronto_pago_catalogo_id) — así que no hay claves regalo_subtitulo/regalo_emoji.
module.exports = {
  disponibles_encabezado: '🎰 *CARTONES DISPONIBLES — {color}* 🎰',
  disponibles_pie: '*¡Pide el tuyo antes que se agoten!* 💚',
  pendientes_encabezado: '⚠️ *CARTONES PENDIENTES DE PAGO* ⚠️',
  pendientes_pie: '*Por favor confirma tu pago para validar tu cartón* 📩',
  pagado_emoji: '⭐',
};
