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
    '.ctrl-caja.ctrl-urgente{border-top:4px solid #f43f5e;}';
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
  function yaVisto(m) {
    try { return (m.una_vez ? localStorage : sessionStorage).getItem(clave(m)) === '1'; } catch (e) { return false; }
  }
  function marcarVisto(m) {
    try { (m.una_vez ? localStorage : sessionStorage).setItem(clave(m), '1'); } catch (e) { /* sin storage: puede repetirse */ }
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

  // ---- Consulta periódica ----------------------------------------------------
  function consultar() {
    fetch(API + '/control/estado', { cache: 'no-store' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) {
        if (!d) return;
        if (d.suspendido) mostrarSuspension(d);
        else { quitarSuspension(); encolar(d.mensajes); }
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
