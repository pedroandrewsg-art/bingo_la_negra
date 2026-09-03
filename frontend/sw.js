// sw.js — Service worker para notificaciones push (recordatorio de pago,
// ver backend/recordatorioPago.js). Solo maneja push/click de notificación
// -- no cachea nada de la app (esta app no funciona offline a propósito, ya
// que necesita el estado en vivo del sorteo). Vive en la raíz del sitio
// (no en /frontend/) porque el "scope" de un service worker nunca puede ser
// más amplio que la carpeta donde vive el archivo.
self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch (e) { /* payload no-JSON, se ignora */ }
  const title = data.title || '🎱 Bingo';
  const body = data.body || 'Recuerde enviar el pago de sus cartones';
  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: '/logo.png',
      badge: '/logo.png',
      // `tag` fijo: una notificación nueva reemplaza a la anterior en vez
      // de apilarse -- el recordatorio se repite cada minuto, nadie
      // necesita ver 10 copias del mismo aviso en la bandeja.
      tag: 'recordatorio-pago',
      renotify: true,
    })
  );
});

// Al tocar la notificación, lleva al sitio (o enfoca la pestaña si ya está
// abierta) en vez de dejarla ahí sin acción.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((lista) => {
      const existente = lista.find((c) => 'focus' in c);
      if (existente) return existente.focus();
      return clients.openWindow('/');
    })
  );
});
