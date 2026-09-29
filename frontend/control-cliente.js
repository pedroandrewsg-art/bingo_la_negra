/* control-cliente.js — Parte visible del módulo de control remoto.
 *
 * Se copia a frontend/ de cada sistema y se incluye con:
 *     <script src="control-cliente.js"></script>
 * No depende de React ni de ninguna librería: funciona igual en cualquier
 * sistema. Muestra (1) la pantalla de suspensión y (2) los mensajes emergentes
 * que el dueño programa desde el Panel de Control.
 */
(function () {
  'use strict';
  if (window.__controlClienteCargado) return;
  window.__controlClienteCargado = true;

  var API = (window.BINGO_API_BASE || (location.origin + '/api')).replace(/\/+$/, '');
  var INTERVALO_MS = 45 * 1000;

  // ---- Quién está mirando: admin, jugador o visitante (sin sesión) ----------
  // Se lee el rol del JWT guardado en localStorage (sin verificarlo: solo sirve
  // para elegir qué texto mostrar, nunca para dar acceso a nada).
  function rolActual() {
    var rol = 'visitante';
    try {
      for (var i = 0; i < localStorage.length; i++) {
        var v = localStorage.getItem(localStorage.key(i));
        if (!v || !/^eyJ[\w-]+\.[\w-]+\.[\w-]+$/.test(v)) continue;
        var payload = JSON.parse(atob(v.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
        if (payload && payload.role === 'admin') return 'admin';
        if (payload) rol = 'jugador';
      }
    } catch (e) { /* localStorage bloqueado o token raro: se trata como visitante */ }
    return rol;
  }

  // ---- Estilos (con prefijo para no chocar con los del sistema) -------------
  var css = document.createElement('style');
  css.textContent =
    '.ctrl-capa{position:fixed;inset:0;display:flex;align-items:center;justify-content:center;padding:20px;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;}' +
    '.ctrl-suspension{z-index:2147483647;background:radial-gradient(circle at 30% 20%,#1e293b,#0b1120);}' +
    '.ctrl-popup{z-index:2147483000;background:rgba(2,6,23,.72);backdrop-filter:blur(3px);}' +
    '.ctrl-caja{width:100%;max-width:440px;background:#0f172a;color:#e2e8f0;border:1px solid #334155;border-radius:20px;padding:26px 24px;text-align:center;box-shadow:0 20px 60px rgba(0,0,0,.5);}' +
    '.ctrl-icono{font-size:46px;line-height:1;margin-bottom:12px;}' +
    '.ctrl-titulo{font-size:21px;font-weight:800;margin:0 0 10px;color:#f8fafc;}' +
    '.ctrl-texto{font-size:15.5px;line-height:1.55;white-space:pre-wrap;color:#cbd5e1;margin:0;}' +
    '.ctrl-btn{margin-top:20px;width:100%;border:0;border-radius:12px;padding:12px 16px;font-size:15px;font-weight:700;cursor:pointer;color:#fff;background:#4f46e5;}' +
    '.ctrl-btn:hover{filter:brightness(1.1);}' +
    '.ctrl-enlace{display:inline-block;margin-top:18px;font-size:12px;color:#64748b;background:none;border:0;cursor:pointer;text-decoration:underline;}' +
    '.ctrl-caja.ctrl-info{border-top:4px solid #38bdf8;}' +
    '.ctrl-caja.ctrl-aviso{border-top:4px solid #fbbf24;}' +
    '.ctrl-caja.ctrl-urgente{border-top:4px solid #f43f5e;}' +
    '.ctrl-ads{position:fixed;left:0;right:0;bottom:0;z-index:40;display:flex;align-items:center;justify-content:center;gap:6px;background:rgba(2,6,23,.85);backdrop-filter:blur(2px);padding:4px 8px;padding-bottom:calc(4px + env(safe-area-inset-bottom));}' +
    '.ctrl-ads-caja{max-width:100%;overflow:hidden;display:flex;align-items:center;justify-content:center;}' +
    '.ctrl-ads-cerrar{flex-shrink:0;width:24px;height:24px;border-radius:999px;border:1px solid #334155;background:#0f172a;color:#94a3b8;font-size:15px;line-height:1;cursor:pointer;}';
  document.head.appendChild(css);

  function el(tag, cls, texto) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (texto !== undefined) e.textContent = texto; // textContent: los mensajes nunca se interpretan como HTML
    return e;
  }

  // ---- Pantalla de suspensión ----------------------------------------------
  var capaSuspension = null;
  var datosSusp = null;
  var verAdmin = false;
  function pintarSuspension() {
    var rol = rolActual();
    capaSuspension.textContent = '';
    var caja = el('div', 'ctrl-caja');
    caja.appendChild(el('div', 'ctrl-icono', verAdmin ? '⛔' : '🛠️'));
    caja.appendChild(el('h2', 'ctrl-titulo', verAdmin ? 'Servicio suspendido' : 'Sistema en mantenimiento'));
    caja.appendChild(el('p', 'ctrl-texto', verAdmin ? datosSusp.mensaje_admin : datosSusp.mensaje_jugadores));
    if (rol !== 'jugador') {
      var b = el('button', 'ctrl-enlace', verAdmin ? 'Volver' : 'Soy el administrador');
      b.onclick = function () { verAdmin = !verAdmin; pintarSuspension(); };
      caja.appendChild(b);
    }
    capaSuspension.appendChild(caja);
  }
  // Se llama seguido (cada consulta y cada 503 que recibe el sistema): solo
  // repinta si el texto cambió, para no perder el "Soy el administrador".
  function mostrarSuspension(d) {
    var cambio = !datosSusp || datosSusp.mensaje_admin !== d.mensaje_admin || datosSusp.mensaje_jugadores !== d.mensaje_jugadores;
    datosSusp = d;
    if (!capaSuspension) {
      verAdmin = rolActual() === 'admin';
      capaSuspension = el('div', 'ctrl-capa ctrl-suspension');
      document.body.appendChild(capaSuspension);
      cambio = true;
    }
    if (cambio) pintarSuspension();
    estaSuspendido = true;
  }
  function quitarSuspension() {
    if (capaSuspension) { capaSuspension.remove(); capaSuspension = null; datosSusp = null; }
    if (estaSuspendido) { estaSuspendido = false; location.reload(); }
  }
  var estaSuspendido = false;

  // ---- Mensajes emergentes ---------------------------------------------------
  var cola = [];
  var mostrando = false;
  function clave(m) { return 'ctrlmsg:' + m.id + ':' + m.updated_at; }
  // modo_repeticion: 'una_vez' (para siempre, localStorage) | 'sesion' (hasta
  // que se cierre la pestaña, sessionStorage) | 'intervalo' (se repite cada
  // frecuencia_horas, guardando cuándo se mostró por última vez). Si el panel
  // aún no manda modo_repeticion (versión vieja de la API) se cae al
  // comportamiento anterior según una_vez.
  function modoDe(m) { return m.modo_repeticion || (m.una_vez ? 'una_vez' : 'sesion'); }
  function yaVisto(m) {
    try {
      var modo = modoDe(m);
      if (modo === 'intervalo') {
        var ultimo = Number(localStorage.getItem(clave(m)));
        if (!ultimo) return false;
        var horasMs = (Number(m.frecuencia_horas) || 0) * 3600000;
        return horasMs > 0 && (Date.now() - ultimo) < horasMs;
      }
      return (modo === 'sesion' ? sessionStorage : localStorage).getItem(clave(m)) === '1';
    } catch (e) { return false; }
  }
  function marcarVisto(m) {
    try {
      var modo = modoDe(m);
      if (modo === 'intervalo') { localStorage.setItem(clave(m), String(Date.now())); return; }
      (modo === 'sesion' ? sessionStorage : localStorage).setItem(clave(m), '1');
    } catch (e) { /* sin storage: puede repetirse */ }
  }

  function siguiente() {
    if (mostrando || estaSuspendido) return;
    var m = cola.shift();
    if (!m) return;
    mostrando = true;
    var capa = el('div', 'ctrl-capa ctrl-popup');
    var caja = el('div', 'ctrl-caja ctrl-' + (m.tipo || 'info'));
    caja.appendChild(el('div', 'ctrl-icono', m.tipo === 'urgente' ? '🚨' : m.tipo === 'aviso' ? '⚠️' : '💬'));
    if (m.titulo) caja.appendChild(el('h2', 'ctrl-titulo', m.titulo));
    caja.appendChild(el('p', 'ctrl-texto', m.cuerpo));
    var b = el('button', 'ctrl-btn', 'Entendido');
    b.onclick = function () { marcarVisto(m); capa.remove(); mostrando = false; siguiente(); };
    caja.appendChild(b);
    capa.appendChild(caja);
    document.body.appendChild(capa);
  }

  function encolar(mensajes) {
    var rol = rolActual();
    var destino = rol === 'admin' ? 'admin' : 'jugadores';
    (mensajes || []).forEach(function (m) {
      if (m.destino !== 'todos' && m.destino !== destino) return;
      if (yaVisto(m)) return;
      if (cola.some(function (x) { return x.id === m.id; })) return;
      cola.push(m);
    });
    siguiente();
  }

  // ---- Publicidad (barra discreta, no intrusiva) -----------------------------
  // Se sortea UNA sola vez por carga de página (no en cada consulta de 45s,
  // para que no cambie de red mientras el jugador está viendo la misma
  // pestaña) y respeta el peso (%) que el dueño configuró para cada red.
  var anuncioDecidido = false;
  var barraAnuncio = null;

  function elegirSlot(slots) {
    var total = slots.reduce(function (a, s) { return a + (Number(s.peso) || 0); }, 0);
    if (total <= 0) return slots[0];
    var r = Math.random() * total;
    for (var i = 0; i < slots.length; i++) {
      r -= (Number(slots[i].peso) || 0);
      if (r <= 0) return slots[i];
    }
    return slots[slots.length - 1];
  }

  // innerHTML no ejecuta <script>: hay que recrearlos a mano para que el
  // código de la red de publicidad realmente corra.
  function insertarConScripts(contenedor, html) {
    var tmp = document.createElement('div');
    tmp.innerHTML = html;
    Array.prototype.slice.call(tmp.childNodes).forEach(function (nodo) {
      if (nodo.tagName === 'SCRIPT') {
        var s = document.createElement('script');
        Array.prototype.forEach.call(nodo.attributes, function (a) { s.setAttribute(a.name, a.value); });
        s.text = nodo.textContent;
        contenedor.appendChild(s);
      } else {
        contenedor.appendChild(nodo);
      }
    });
  }

  function ocultarAnuncio() {
    if (barraAnuncio) { barraAnuncio.remove(); barraAnuncio = null; }
  }

  function mostrarAnuncio(anuncio) {
    if (anuncioDecidido || estaSuspendido) return;
    if (!anuncio || !anuncio.activo || !anuncio.slots || !anuncio.slots.length) return;
    anuncioDecidido = true; // una sola vez por carga de página, aunque vuelva a consultar
    try { if (sessionStorage.getItem('ctrlads:cerrado') === '1') return; } catch (e) {}

    var slot = elegirSlot(anuncio.slots);
    if (!slot || !slot.html) return;

    barraAnuncio = el('div', 'ctrl-ads');
    var caja = el('div', 'ctrl-ads-caja');
    insertarConScripts(caja, slot.html);
    var cerrar = el('button', 'ctrl-ads-cerrar', '×');
    cerrar.onclick = function () {
      try { sessionStorage.setItem('ctrlads:cerrado', '1'); } catch (e) {}
      ocultarAnuncio();
    };
    barraAnuncio.appendChild(caja);
    barraAnuncio.appendChild(cerrar);
    document.body.appendChild(barraAnuncio);

    var segundos = Number(anuncio.segundos) || 0;
    if (segundos > 0) setTimeout(ocultarAnuncio, segundos * 1000);
  }

  // ---- Consulta periódica ----------------------------------------------------
  function consultar() {
    fetch(API + '/control/estado', { cache: 'no-store' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) {
        if (!d) return;
        if (d.suspendido) { mostrarSuspension(d); ocultarAnuncio(); }
        else { quitarSuspension(); encolar(d.mensajes); mostrarAnuncio(d.anuncio); }
      })
      .catch(function () { /* sin red: no se toca nada */ });
  }

  // Si una llamada normal del sistema recibe 503 "suspendido", se muestra el
  // aviso al instante en vez de esperar a la próxima consulta.
  var fetchOriginal = window.fetch;
  window.fetch = function () {
    return fetchOriginal.apply(this, arguments).then(function (res) {
      if (res.status === 503) {
        res.clone().json().then(function (d) { if (d && d.suspendido) mostrarSuspension(d); }).catch(function () {});
      }
      return res;
    });
  };

  function arrancar() {
    consultar();
    setInterval(consultar, INTERVALO_MS);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', arrancar);
  else arrancar();
})();
