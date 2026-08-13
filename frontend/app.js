// app.js — Frontend del Sistema de Bingo Virtual Automatizado (React sin build, vía CDN + Babel standalone)
const { useState, useEffect, useContext, createContext, useMemo, useRef } = React;

const API_BASE = window.BINGO_API_BASE || 'http://localhost:4000/api';
const SOCKET_BASE = API_BASE.replace(/\/api\/?$/, '');
const socket = io(SOCKET_BASE, { autoConnect: true, transports: ['websocket', 'polling'] });

const COLORS = ['Verde', 'Morado', 'Amarillo', 'Azul', 'Rojo', 'Naranja', 'Negro', 'Rosado', 'Blanco'];

// Estilo decorativo de cartón según el color asignado al sorteo/lote
const CARD_COLOR_STYLES = {
  Verde: { border: 'border-emerald-500/60', header: 'bg-emerald-500/20 text-emerald-300', mark: 'from-emerald-500 to-emerald-700' },
  Morado: { border: 'border-violet-500/60', header: 'bg-violet-500/20 text-violet-300', mark: 'from-violet-500 to-rose-700' },
  Amarillo: { border: 'border-amber-500/60', header: 'bg-amber-500/20 text-amber-300', mark: 'from-amber-400 to-amber-600' },
  Azul: { border: 'border-sky-500/60', header: 'bg-sky-500/20 text-sky-300', mark: 'from-sky-500 to-blue-700' },
  Rojo: { border: 'border-red-500/60', header: 'bg-red-500/20 text-red-300', mark: 'from-red-500 to-red-700' },
  Naranja: { border: 'border-orange-500/60', header: 'bg-orange-500/20 text-orange-300', mark: 'from-orange-500 to-orange-700' },
  Negro: { border: 'border-slate-500/60', header: 'bg-slate-700/40 text-slate-200', mark: 'from-slate-600 to-slate-900' },
  Rosado: { border: 'border-pink-500/60', header: 'bg-pink-500/20 text-pink-300', mark: 'from-pink-500 to-pink-700' },
  Blanco: { border: 'border-gray-300/60', header: 'bg-gray-200/20 text-gray-100', mark: 'from-gray-200 to-gray-400' },
};
const DEFAULT_CARD_STYLE = { border: 'border-bingopurple/30', header: 'bg-slate-900 text-rose-300', mark: 'from-bingopurple to-bingoaccent' };

// ---------------------------------------------------------------------------
// API helper
// ---------------------------------------------------------------------------
async function apiFetch(path, opts = {}) {
  const token = localStorage.getItem('bingo_token');
  const headers = opts.headers || {};
  const isForm = opts.body instanceof FormData;
  if (!isForm) headers['Content-Type'] = 'application/json';
  if (token) headers['Authorization'] = 'Bearer ' + token;
  const res = await fetch(API_BASE + path, { ...opts, headers });
  let data = {};
  try { data = await res.json(); } catch (e) {}
  if (!res.ok) {
    // El status queda enganchado al error (no solo el mensaje) para que
    // quien lo atrape pueda distinguir un 404 real (el recurso ya no existe)
    // de una falla transitoria de red — celular que se bloquea, cambia de
    // red o vuelve de segundo plano, donde el fetch puede fallar sin que
    // eso signifique que el sorteo/cartón dejó de existir.
    const err = new Error(data.error || ('Error ' + res.status));
    err.status = res.status;
    throw err;
  }
  return data;
}

function money(n) {
  return 'Bs ' + Number(n || 0).toFixed(2);
}

// ---------------------------------------------------------------------------
// Auth context
// ---------------------------------------------------------------------------
const AuthContext = createContext(null);
function useAuth() { return useContext(AuthContext); }

function AuthProvider({ children }) {
  const [token, setToken] = useState(localStorage.getItem('bingo_token'));
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) { setLoading(false); return; }
    apiFetch('/auth/me')
      .then((d) => setUser(d.user))
      .catch((e) => {
        // Mismo cuidado que en la sala de juego: solo un 401/403 real (token
        // inválido o vencido) debe desloguear. Un fallo de red transitorio
        // (app recién abierta sin conexión todavía, timeout) no debe borrar
        // la sesión — antes cualquier error acá deslogueaba al jugador sin
        // motivo real.
        if (e && e.status !== 401 && e.status !== 403) return;
        localStorage.removeItem('bingo_token');
        setToken(null);
      })
      .finally(() => setLoading(false));
  }, [token]);

  function login(tok, u) {
    localStorage.setItem('bingo_token', tok);
    setToken(tok);
    setUser(u);
  }
  function logout() {
    localStorage.removeItem('bingo_token');
    setToken(null);
    setUser(null);
  }
  function refreshUser() {
    return apiFetch('/auth/me').then((d) => setUser(d.user));
  }

  return (
    <AuthContext.Provider value={{ token, user, login, logout, loading, refreshUser, setUser }}>
      {children}
    </AuthContext.Provider>
  );
}

// ---------------------------------------------------------------------------
// Settings context (config global, ej. link del grupo de WhatsApp)
// ---------------------------------------------------------------------------
const SettingsContext = createContext(null);
function useSettings() { return useContext(SettingsContext); }

function SettingsProvider({ children }) {
  const { token } = useAuth();
  const [whatsappLink, setWhatsappLink] = useState('');
  const [logoUrl, setLogoUrl] = useState('');

  function refresh() {
    return apiFetch('/settings/whatsapp').then((d) => setWhatsappLink(d.link || ''));
  }
  // El logo es público: la pantalla de acceso lo necesita antes de identificarse.
  function refreshLogo() {
    return apiFetch('/settings/public').then((d) => setLogoUrl(d.logoUrl || ''));
  }
  useEffect(() => { if (token) refresh(); }, [token]);
  useEffect(refreshLogo, []);

  return (
    <SettingsContext.Provider value={{ whatsappLink, refresh, logoUrl, refreshLogo }}>
      {children}
    </SettingsContext.Provider>
  );
}

// ---------------------------------------------------------------------------
// UI genéricos
// ---------------------------------------------------------------------------
function Card({ children, className }) {
  return (
    <div className={`bg-slate-900/60 backdrop-blur border border-bingopurple/30 rounded-2xl shadow-glow p-5 ${className || ''}`}>
      {children}
    </div>
  );
}

function Button({ children, variant = 'primary', className, ...props }) {
  const base = 'px-4 py-2 rounded-xl font-semibold text-sm transition active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed';
  const styles = {
    primary: 'bg-gradient-to-r from-bingopurple to-bingoaccent text-white hover:brightness-110 shadow-glow',
    ghost: 'bg-slate-800 text-slate-200 hover:bg-slate-700 border border-slate-700',
    danger: 'bg-red-600/80 text-white hover:bg-red-500',
    success: 'bg-emerald-600/80 text-white hover:bg-emerald-500',
  };
  return <button className={`${base} ${styles[variant]} ${className || ''}`} {...props}>{children}</button>;
}

function Input(props) {
  return (
    <input
      {...props}
      className={`w-full bg-slate-800/70 border border-slate-700 focus:border-bingoaccent focus:outline-none rounded-lg px-3 py-2 text-sm text-slate-100 placeholder-slate-500 ${props.className || ''}`}
    />
  );
}

function Select({ children, ...props }) {
  return (
    <select {...props} className={`w-full bg-slate-800/70 border border-slate-700 focus:border-bingoaccent focus:outline-none rounded-lg px-3 py-2 text-sm text-slate-100 ${props.className || ''}`}>
      {children}
    </select>
  );
}

function Label({ children }) {
  return <label className="block text-xs uppercase tracking-wide text-slate-400 mb-1">{children}</label>;
}

function Badge({ children, tone = 'rose' }) {
  const tones = {
    rose: 'bg-bingopurple/30 text-rose-200 border-bingopurple/50',
    green: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40',
    yellow: 'bg-amber-500/20 text-amber-300 border-amber-500/40',
    red: 'bg-red-500/20 text-red-300 border-red-500/40',
    gray: 'bg-slate-600/20 text-slate-300 border-slate-500/40',
  };
  return <span className={`text-[11px] px-2 py-0.5 rounded-full border ${tones[tone]}`}>{children}</span>;
}

// Botón al grupo de WhatsApp (link configurable por el admin en Configuración).
// No se renderiza si todavía no se ha configurado ningún link.
function WhatsAppButton({ className }) {
  const { whatsappLink } = useSettings();
  if (!whatsappLink) return null;
  return (
    <a
      href={whatsappLink}
      target="_blank"
      rel="noopener noreferrer"
      className={`block text-center px-4 py-2 rounded-xl font-semibold text-sm transition active:scale-95 bg-emerald-600/80 text-white hover:bg-emerald-500 ${className || ''}`}
    >
      📲 Ir al grupo de WhatsApp
    </a>
  );
}
function Modal({ title, onClose, children, wide }) {
  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className={`bg-slate-900 border border-bingopurple/40 rounded-2xl shadow-glow p-5 w-full ${wide ? 'max-w-4xl' : 'max-w-lg'} max-h-[90vh] overflow-y-auto pop-in`}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-rose-200">{title}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-white text-xl leading-none">&times;</button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Spinner() {
  return <div className="flex items-center justify-center py-10"><div className="w-8 h-8 border-4 border-bingopurple border-t-transparent rounded-full animate-spin"></div></div>;
}

// ---------------------------------------------------------------------------
// Mockup de WhatsApp — usado por "WhatsApp Live" (WhatsappLivePanel) para
// previsualizar cómo se ve el mensaje antes de copiarlo. Los colores acá son
// los de WhatsApp real (fijos), no los del tema de la app — es una vista
// previa de una app externa, no participa del claro/oscuro de BINGOLANEGRA.
// ---------------------------------------------------------------------------
function WhatsappBubbleLinea({ texto }) {
  const partes = texto.split(/(\*[^*]+\*)/g);
  return partes.map((p, i) => (p.length > 1 && p.startsWith('*') && p.endsWith('*'))
    ? <strong key={i}>{p.slice(1, -1)}</strong>
    : <React.Fragment key={i}>{p}</React.Fragment>);
}

function WhatsappBubble({ texto }) {
  if (!texto) return null;
  const hora = new Date().toLocaleTimeString('es-VE', { hour: 'numeric', minute: '2-digit', hour12: true });
  return (
    <div className="max-w-md ml-auto bg-[#dcf8c6] rounded-lg rounded-tr-none shadow px-3 py-2">
      <div className="whitespace-pre-wrap break-words font-sans text-[13px] text-slate-900 leading-snug max-h-96 overflow-y-auto pr-1">
        {texto.split('\n').map((linea, i) => <div key={i}>{linea ? <WhatsappBubbleLinea texto={linea} /> : ' '}</div>)}
      </div>
      <div className="text-right text-[11px] text-slate-500 mt-1">{hora} <span className="text-sky-500">✔✔</span></div>
    </div>
  );
}

// Encabezado verde tipo "chat" + fondo con textura, para que WhatsappBubble
// se vea dentro de un marco reconocible como WhatsApp.
function WhatsappChatFrame({ titulo, subtitulo, logoUrl, children }) {
  return (
    <div className="rounded-xl overflow-hidden border border-slate-700">
      <div className="bg-emerald-700 px-4 py-3 flex items-center gap-2">
        <div className="w-8 h-8 rounded-full bg-emerald-900/40 flex items-center justify-center text-lg shrink-0 overflow-hidden">
          {logoUrl ? <img src={logoUrl} alt={titulo} className="w-full h-full object-cover" /> : '💬'}
        </div>
        <div>
          <div className="text-white font-semibold text-sm leading-tight">{titulo}</div>
          <div className="text-emerald-200 text-xs leading-tight">{subtitulo}</div>
        </div>
      </div>
      <div className="p-4" style={{ background: '#e5ddd5' }}>
        {children}
      </div>
    </div>
  );
}

// Selector de fondo claro/oscuro — solo alterna el atributo data-theme en <html>,
// el resto del cambio visual lo resuelven los overrides CSS de index.html.
function ThemeToggle() {
  const [theme, setTheme] = useState(() => document.documentElement.getAttribute('data-theme') || 'dark');
  function toggle() {
    const next = theme === 'light' ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('bingo_theme', next);
    setTheme(next);
  }
  return (
    <Button variant="ghost" className="!px-2.5 !py-2" onClick={toggle} title={theme === 'light' ? 'Cambiar a fondo oscuro' : 'Cambiar a fondo claro'}>
      {theme === 'light' ? '🌙' : '☀️'}
    </Button>
  );
}

// Matriz 5x5 de vista previa de un patrón/figura
function PatternGrid({ mask, size = 16 }) {
  if (!mask) return null;
  return (
    <div className="grid grid-cols-5 gap-0.5 inline-grid">
      {mask.map((row, r) => row.map((v, c) => (
        <div key={r + '-' + c} style={{ width: size, height: size }}
          className={`rounded-sm ${v ? 'bg-gradient-to-br from-bingopurple to-bingoaccent' : 'bg-slate-700/60'}`} />
      )))}
    </div>
  );
}

// Miniatura de un cartón de bingo. El marcado real vive en carton.marcados
// (persistido en el servidor — ya no hay sorteador automático que "cante"
// números). onCellClick (opcional) hace clickeable cada casilla para marcar/
// desmarcar directo sobre el cartón. showCercaDeGanar (opcional, solo la sala
// de juego del propio jugador la activa) resalta el cartón y muestra qué
// figura(s)/número(s) le faltan para completar bingo.
// compact=true (default, usado en modales/paneles admin/vista lado-a-lado):
// tamaños chicos ya afinados para caber en columnas angostas. compact=false
// (vista "apilado" de la sala de juego): tamaños originales, más grandes y
// cómodos de tocar, para cuando el cartón tiene todo el ancho disponible.
function MiniCard({ carton, onCellClick, showCercaDeGanar, letra, compact = true, imagenUrl }) {
  const { logoUrl } = useSettings();
  const cols = ['B', 'I', 'N', 'G', 'O'];
  const style = CARD_COLOR_STYLES[carton.color] || DEFAULT_CARD_STYLE;
  const marcadosSet = useMemo(() => new Set(carton.marcados || []), [carton.marcados]);
  const cerca = showCercaDeGanar ? (carton.cercaDeGanar || []) : [];
  const cercaNumeros = useMemo(() => new Set(cerca.flatMap((f) => f.numeros)), [cerca]);
  return (
    <div className={`bg-slate-800/70 border-2 ${style.border} rounded-xl shadow ${compact ? 'p-1.5' : 'p-2'} ${cerca.length ? 'carton-cerca' : ''}`}>
      {letra ? (
        // Dentro de una carta (combo): el cartón no tiene identidad propia —
        // la carta es la que se identifica (nombre, color, estado de pago).
        // Acá solo va la letra que lo distingue de sus hermanos.
        <div className={`text-center font-black text-slate-400 mb-1 ${compact ? 'text-[11px]' : 'text-sm'}`}>{letra}</div>
      ) : (
        <div className={`flex items-center justify-between mb-1 px-1.5 py-0.5 rounded ${style.header}`}>
          <span className="text-xs font-bold">{`#${carton.numero}`}{carton.estado === 'pagado' ? ' ⭐' : ''}</span>
          {carton.estado === 'vendido' ? (
            <span className="text-[10px] font-bold text-amber-400">⏳ Pendiente</span>
          ) : (
            <span className="text-[11px]">{carton.color}</span>
          )}
        </div>
      )}
      {imagenUrl ? (
        // Cartón personalizado real (catálogo de imágenes del sorteo): se
        // muestra tal cual está diseñado, en su relación de aspecto natural
        // (casi nunca es cuadrada) — forzarla a cuadrado la recortaba/achicaba
        // innecesariamente. En modo compacto (grilla chica) se limita el alto
        // para que no domine la cuadrícula; en la vista ampliada (compact=false)
        // se deja crecer lo más posible.
        <img
          src={imagenUrl}
          alt={`Cartón ${carton.numero}`}
          className={`w-full h-auto object-contain rounded-lg mt-1 bg-white ${compact ? 'max-h-56' : 'max-h-[75vh]'}`}
        />
      ) : (
        <div className={`grid grid-cols-5 mt-1 ${compact ? 'gap-0.5' : 'gap-1'}`}>
          {cols.map((c) => <div key={c} className={`text-center font-black text-rose-400 ${compact ? 'text-[10px]' : 'text-xs'}`}>{c}</div>)}
          {carton.grid.map((row, r) => row.map((val, c) => {
            const shown = val === null || marcadosSet.has(val);
            const esCercaCelda = !shown && cercaNumeros.has(val);
            const clickable = !!onCellClick && val !== null;
            const Tag = clickable ? 'button' : 'div';
            return (
              <Tag key={r + '-' + c}
                type={clickable ? 'button' : undefined}
                onClick={clickable ? () => onCellClick(val) : undefined}
                className={`aspect-square flex items-center justify-center rounded overflow-hidden leading-none ${val === null ? (compact ? 'text-[8px]' : 'text-[9px]') : (compact ? 'text-[10px]' : 'text-base')} ${shown ? `bg-gradient-to-br ${style.mark} text-white font-bold` : esCercaCelda ? 'bg-amber-500 text-white font-black celda-cerca' : 'bg-slate-900/80 text-slate-300 font-semibold'} ${clickable ? 'cursor-pointer active:scale-95 transition' : ''}`}>
                {val === null ? (logoUrl ? <img src={logoUrl} alt="LIBRE" className="w-full h-full object-cover" /> : 'LIBRE') : val}
              </Tag>
            );
          }))}
        </div>
      )}
      {cerca.length > 0 && (
        <div className="mt-1.5 text-[11px] text-amber-300 font-semibold space-y-0.5">
          {cerca.map((f, i) => <div key={i}>⚡ Esperando: {f.label} (falta {f.numeros.join(' o ')})</div>)}
        </div>
      )}
    </div>
  );
}

const LETRAS = ['A', 'B', 'C', 'D'];

// "Carta" agrupada: varios cartones de un mismo combo (grupo) presentados
// juntos como una sola unidad visual, cada cartón identificado por su letra
// (A, B, C, D) en vez de su número físico individual.
function ComboCard({ grupo, color, cartones, onCellClick, showCercaDeGanar, compact = true }) {
  const style = CARD_COLOR_STYLES[color] || DEFAULT_CARD_STYLE;
  return (
    <div className={`rounded-2xl border-2 ${style.border} bg-slate-900/60 shadow-glow overflow-hidden`}>
      <div className={`flex items-center justify-between flex-wrap gap-x-2 gap-y-0.5 px-3 py-2 bg-gradient-to-r ${style.mark} text-white`}>
        <span className="font-black text-sm">🎫 Carta {grupo}</span>
        <span className="text-[11px] font-semibold opacity-90">{color} · {cartones.length} cartones</span>
        {/* Estado de pago: los cartones de una carta se compran y se pagan
            siempre juntos, así que el aviso va acá (una sola vez), no
            repetido en cada cartón individual. */}
        {cartones[0]?.estado === 'vendido' && <span className="text-[11px] font-bold text-amber-200">⏳ Pendiente</span>}
        {cartones[0]?.estado === 'pagado' && <span className="text-[11px] font-bold text-emerald-200">⭐ Pagado</span>}
      </div>
      {/* Siempre 2 columnas (mantiene el formato de "carta" reconocible). En
          compact, el piso mínimo va puesto en la COLUMNA del grid (no en el
          hijo): grid-cols-2 de Tailwind fija el mínimo de cada columna en 0,
          así que un min-width en el hijo no lo respeta y los cartones
          terminan superpuestos. Con el mínimo en la columna, si el celular es
          angosto el panel se desliza horizontalmente en vez de superponerse o
          encogerse hasta ser ilegible. Sin compact (vista "apilado", ancho
          completo) no hace falta ningún piso — grid-cols-2 normal alcanza. */}
      <div className={compact ? 'grid grid-cols-[repeat(2,minmax(97px,1fr))] gap-1 p-1 overflow-x-auto' : 'grid grid-cols-2 gap-2 p-2'}>
        {cartones.map((c, i) => (
          <MiniCard
            key={c.id || i}
            carton={c}
            letra={c.letra || LETRAS[i]}
            onCellClick={onCellClick ? (n) => onCellClick(c, n) : undefined}
            showCercaDeGanar={showCercaDeGanar}
            compact={compact}
            imagenUrl={c.imagen_url}
          />
        ))}
      </div>
    </div>
  );
}
// ---------------------------------------------------------------------------
// LOGIN — registro temporal de jugador (nombre + WhatsApp) o acceso admin
// ---------------------------------------------------------------------------
function VerificarListaPanel({ onVolver }) {
  const [sorteosPublicos, setSorteosPublicos] = useState(null);
  const [sorteoElegido, setSorteoElegido] = useState(null);
  const [lista, setLista] = useState(null);
  const [busqueda, setBusqueda] = useState('');

  useEffect(() => {
    apiFetch('/sorteos/publicos').then((d) => {
      setSorteosPublicos(d.sorteos);
      if (d.sorteos.length === 1) setSorteoElegido(d.sorteos[0].id);
    });
  }, []);

  useEffect(() => {
    if (!sorteoElegido) return;
    setLista(null);
    apiFetch(`/sorteos/${sorteoElegido}/lista-publica`).then((d) => setLista(d.lista));
  }, [sorteoElegido]);

  const filtrada = (lista || []).filter((r) => r.nombre.toLowerCase().includes(busqueda.trim().toLowerCase()));

  return (
    <>
      <h2 className="text-center font-bold text-rose-100 mb-4">Verifícate en la Lista</h2>
      {sorteosPublicos && sorteosPublicos.length === 0 && (
        <p className="text-sm text-slate-400 text-center">No hay sorteos en curso en este momento.</p>
      )}
      {sorteosPublicos && sorteosPublicos.length > 1 && !sorteoElegido && (
        <div className="space-y-2">
          <p className="text-sm text-slate-400">Elegí el sorteo:</p>
          {sorteosPublicos.map((s) => (
            <button
              key={s.id}
              onClick={() => setSorteoElegido(s.id)}
              className="w-full text-left bg-slate-800/60 hover:bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-sm text-slate-200 transition"
            >
              {s.color} — {s.fecha_hora?.replace('T', ' ')}
            </button>
          ))}
        </div>
      )}
      {sorteoElegido && (
        <div className="space-y-3">
          <Input value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Buscar por nombre..." />
          {!lista && <Spinner />}
          {lista && (
            <div className="max-h-72 overflow-y-auto space-y-1.5 pr-1">
              {filtrada.length === 0 && <p className="text-sm text-slate-500 text-center">Sin resultados.</p>}
              {filtrada.map((r, i) => (
                <div key={i} className="flex items-center justify-between gap-2 bg-slate-800/50 rounded-lg px-3 py-1.5 text-sm">
                  <span className="text-slate-200">{r.nombre}</span>
                  <span className="flex items-center gap-1.5 shrink-0">
                    <Badge tone="gray">{r.etiqueta}</Badge>
                    {r.pagado && <span className="text-emerald-400 text-xs">✅</span>}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
      <button type="button" onClick={onVolver} className="w-full mt-4 text-sm text-slate-400 hover:text-slate-200 transition">
        &larr; Volver
      </button>
    </>
  );
}

// Colores reales (hex) de cada color de cartón, para dibujar la descarga en
// <canvas> (los estilos normales del cartón usan clases Tailwind, que no
// sirven dentro de un canvas).
const COLOR_HEX = {
  Verde: '#10b981', Morado: '#8b5cf6', Amarillo: '#f59e0b',
  Azul: '#0ea5e9', Rojo: '#ef4444', Naranja: '#f97316',
};

// Dibuja UN cartón dentro de un <canvas> ya existente, en la posición (x0,y0).
function dibujarCartonEnCanvas(ctx, carton, letra, x0, y0) {
  const cols = ['B', 'I', 'N', 'G', 'O'];
  const marcadosSet = new Set(carton.marcados || []);
  const color = COLOR_HEX[carton.color] || '#8b5cf6';
  const cell = 60, headerH = 40, colH = 28, pad = 6;
  const w = cell * 5 + pad * 2;

  ctx.fillStyle = color;
  ctx.fillRect(x0, y0, w, headerH);
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 18px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(letra ? `Cartón ${letra}` : `#${carton.numero}`, x0 + w / 2, y0 + headerH / 2);

  ctx.fillStyle = '#334155';
  ctx.font = 'bold 16px sans-serif';
  cols.forEach((c, i) => ctx.fillText(c, x0 + pad + cell * i + cell / 2, y0 + headerH + colH / 2));

  carton.grid.forEach((row, r) => {
    row.forEach((val, c) => {
      const x = x0 + pad + c * cell;
      const y = y0 + headerH + colH + r * cell;
      const marcado = val === null || marcadosSet.has(val);
      ctx.fillStyle = marcado ? color : '#f1f5f9';
      ctx.fillRect(x + 2, y + 2, cell - 4, cell - 4);
      ctx.strokeStyle = '#cbd5e1';
      ctx.strokeRect(x + 2, y + 2, cell - 4, cell - 4);
      ctx.fillStyle = marcado ? '#ffffff' : '#0f172a';
      ctx.font = val === null ? 'bold 11px sans-serif' : 'bold 20px sans-serif';
      ctx.fillText(val === null ? 'LIBRE' : String(val), x + cell / 2, y + cell / 2);
    });
  });
  return { w, h: headerH + colH + cell * 5 };
}

// Descarga la carta completa como UNA sola imagen: si es un combo, dibuja
// todos sus cartones juntos (no se separan); si es un solo cartón, esa carta
// es justamente ese cartón.
function descargarCartaPNG(cartones, grupo, sorteoColor) {
  const LETRAS = ['A', 'B', 'C', 'D'];
  const cell = 60, headerH = 40, colH = 28, pad = 6, gap = 14, tituloH = grupo != null ? 40 : 0;
  const cardW = cell * 5 + pad * 2;
  const cardH = headerH + colH + cell * 5;
  const cols = cartones.length >= 3 ? 2 : cartones.length;
  const rows = Math.ceil(cartones.length / cols);

  const canvas = document.createElement('canvas');
  canvas.width = cols * cardW + (cols - 1) * gap + gap * 2;
  canvas.height = tituloH + rows * cardH + (rows - 1) * gap + gap * 2 + (tituloH ? gap : 0);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  if (grupo != null) {
    ctx.fillStyle = '#0f172a';
    ctx.font = 'bold 22px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`Carta ${grupo} · ${sorteoColor || ''}`, canvas.width / 2, tituloH / 2 + gap / 2);
  }

  cartones.forEach((c, i) => {
    const col = i % cols, row = Math.floor(i / cols);
    const x = gap + col * (cardW + gap);
    const y = tituloH + (tituloH ? gap : 0) + gap + row * (cardH + gap);
    dibujarCartonEnCanvas(ctx, c, c.letra || LETRAS[i], x, y);
  });

  const a = document.createElement('a');
  a.href = canvas.toDataURL('image/png');
  a.download = grupo != null ? `carta-${grupo}.png` : `carton-${cartones[0].numero}.png`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

// Descarga la imagen real de un cartón (cuando el sorteo tiene un catálogo
// personalizado asignado) trayéndola como blob — un <a download> directo no
// fuerza la descarga en imágenes de otro origen (ej. raw.githubusercontent.com)
// en varios navegadores, solo las abre. Con un solo cartón sin imagen real (o
// un combo, donde cada cartón podría tener una imagen distinta) cae al PNG
// compuesto de siempre.
async function descargarCarton(cartones, grupo, sorteoColor) {
  const soloUno = cartones.length === 1 ? cartones[0] : null;
  if (soloUno?.imagen_url) {
    try {
      const resp = await fetch(soloUno.imagen_url);
      const blob = await resp.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `carton-${soloUno.numero}${(blob.type.split('/')[1] ? '.' + blob.type.split('/')[1] : '.jpg')}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      return;
    } catch (e) {
      window.open(soloUno.imagen_url, '_blank');
      return;
    }
  }
  descargarCartaPNG(cartones, grupo, sorteoColor);
}

// Consulta pública de una carta/cartón: cualquiera que sepa el número puede
// verla y descargarla, sin login ni datos personales. Si el sorteo vende por
// combo, se busca por número de carta y se muestra/descarga completa (todos
// sus cartones juntos, sin separarlos).
function ConsultaCartonesPanel({ onVolver }) {
  const [sorteosPublicos, setSorteosPublicos] = useState(null);
  const [sorteoElegido, setSorteoElegido] = useState(null);
  const [metodo, setMetodo] = useState('numero'); // 'numero' | 'nombre'
  const [numero, setNumero] = useState('');
  const [nombreQuery, setNombreQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [resultado, setResultado] = useState(null);
  const [sorteoNombre, setSorteoNombre] = useState(null);
  const [resultadosNombre, setResultadosNombre] = useState(null);
  const [personaElegida, setPersonaElegida] = useState(null);

  useEffect(() => {
    apiFetch('/sorteos/publicos').then((d) => {
      setSorteosPublicos(d.sorteos);
      if (d.sorteos.length === 1) setSorteoElegido(d.sorteos[0].id);
    });
  }, []);

  function cambiarMetodo(m) {
    setMetodo(m);
    setError('');
    setResultado(null);
    setResultadosNombre(null);
    setPersonaElegida(null);
  }

  async function consultar(e) {
    e.preventDefault();
    setError('');
    setResultado(null);
    setLoading(true);
    try {
      const params = new URLSearchParams({ sorteo_id: sorteoElegido, numero: numero.trim() });
      const d = await apiFetch('/cartones/consulta?' + params.toString());
      if (!d.encontrado) setError('No encontramos ninguna carta con ese número en este sorteo.');
      else setResultado(d);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function consultarPorNombre(e) {
    e.preventDefault();
    setError('');
    setResultadosNombre(null);
    setPersonaElegida(null);
    setLoading(true);
    try {
      const params = new URLSearchParams({ sorteo_id: sorteoElegido, nombre: nombreQuery.trim() });
      const d = await apiFetch('/cartones/consulta-nombre?' + params.toString());
      setSorteoNombre(d.sorteo);
      if (!d.resultados.length) setError('No encontramos cartones a nombre de esa persona en este sorteo.');
      else {
        setResultadosNombre(d.resultados);
        if (d.resultados.length === 1) setPersonaElegida(d.resultados[0]);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <h2 className="text-center font-bold text-sky-100 mb-4">Consulta tu Carta</h2>

      {sorteosPublicos && sorteosPublicos.length === 0 && (
        <p className="text-sm text-slate-400 text-center">No hay sorteos activos en este momento.</p>
      )}
      {sorteosPublicos && sorteosPublicos.length > 1 && !sorteoElegido && (
        <div className="space-y-2">
          <p className="text-sm text-slate-400">Elegí el sorteo:</p>
          {sorteosPublicos.map((s) => (
            <button
              key={s.id}
              onClick={() => setSorteoElegido(s.id)}
              className="w-full text-left bg-slate-800/60 hover:bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-sm text-slate-200 transition"
            >
              {s.color} — {s.fecha_hora?.replace('T', ' ')}
            </button>
          ))}
        </div>
      )}

      {sorteoElegido && (
        <>
          <div className="flex gap-2 mb-3">
            <button
              type="button"
              onClick={() => cambiarMetodo('numero')}
              className={`flex-1 text-sm rounded-xl py-2 border transition ${metodo === 'numero' ? 'bg-bingopurple/30 border-bingoaccent text-white' : 'border-slate-700 text-slate-400 hover:text-slate-200'}`}
            >
              Por número
            </button>
            <button
              type="button"
              onClick={() => cambiarMetodo('nombre')}
              className={`flex-1 text-sm rounded-xl py-2 border transition ${metodo === 'nombre' ? 'bg-bingopurple/30 border-bingoaccent text-white' : 'border-slate-700 text-slate-400 hover:text-slate-200'}`}
            >
              Por nombre
            </button>
          </div>

          {metodo === 'numero' ? (
            <form onSubmit={consultar} className="flex items-end gap-2 mb-3">
              <div className="flex-1">
                <Label>Número de carta o cartón</Label>
                <Input
                  inputMode="numeric" pattern="[0-9]*"
                  value={numero}
                  onChange={(e) => setNumero(e.target.value.replace(/\D/g, ''))}
                  placeholder="Ej: 12"
                />
              </div>
              <Button disabled={loading || !numero.trim()}>{loading ? 'Buscando...' : 'Consultar'}</Button>
            </form>
          ) : (
            <form onSubmit={consultarPorNombre} className="flex items-end gap-2 mb-3">
              <div className="flex-1">
                <Label>Tu nombre</Label>
                <Input value={nombreQuery} onChange={(e) => setNombreQuery(e.target.value)} placeholder="Ej: María Pérez" />
              </div>
              <Button disabled={loading || !nombreQuery.trim()}>{loading ? 'Buscando...' : 'Consultar'}</Button>
            </form>
          )}
        </>
      )}
      {error && <div className="text-red-400 text-sm bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2 mb-3">{error}</div>}

      {resultado && (
        <div className="space-y-3">
          <div className="text-sm text-slate-300 text-center flex items-center justify-center gap-2 flex-wrap">
            Sorteo #{resultado.sorteo.id} · {resultado.sorteo.color} · {resultado.sorteo.fecha_hora?.replace('T', ' ')}
            <Badge tone={resultado.sorteo.estatus === 'en_juego' ? 'yellow' : resultado.sorteo.estatus === 'finalizado' ? 'gray' : 'green'}>{resultado.sorteo.estatus}</Badge>
          </div>
          <div className="text-sm text-slate-200 text-center">
            Propietario: <b>{resultado.cartones[0].owner_nombre || 'Sin dueño (disponible)'}</b>
          </div>
          {resultado.cartones.length > 1
            ? <ComboCard grupo={resultado.cartones[0].grupo} color={resultado.cartones[0].color} cartones={resultado.cartones} compact={false} />
            : <MiniCard carton={resultado.cartones[0]} letra={resultado.cartones[0].letra} imagenUrl={resultado.cartones[0].imagen_url} compact={false} />}
          <Button
            variant="ghost"
            className="w-full"
            onClick={() => descargarCarton(resultado.cartones, resultado.cartones[0].grupo, resultado.sorteo.color)}
          >
            ⬇ Descargar
          </Button>
        </div>
      )}

      {resultadosNombre && resultadosNombre.length > 1 && !personaElegida && (
        <div className="space-y-2">
          <p className="text-sm text-slate-400">Encontramos varias coincidencias — elegí cuál sos:</p>
          {resultadosNombre.map((p) => (
            <button
              key={p.jugador_id}
              onClick={() => setPersonaElegida(p)}
              className="w-full text-left bg-slate-800/60 hover:bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-sm text-slate-200 transition"
            >
              {p.nombre} — {p.grupos.length} carta{p.grupos.length === 1 ? '' : 's'}
            </button>
          ))}
        </div>
      )}

      {personaElegida && sorteoNombre && (
        <div className="space-y-3">
          <div className="text-sm text-slate-300 text-center flex items-center justify-center gap-2 flex-wrap">
            Sorteo #{sorteoNombre.id} · {sorteoNombre.color} · {sorteoNombre.fecha_hora?.replace('T', ' ')}
            <Badge tone={sorteoNombre.estatus === 'en_juego' ? 'yellow' : sorteoNombre.estatus === 'finalizado' ? 'gray' : 'green'}>{sorteoNombre.estatus}</Badge>
          </div>
          <div className="text-sm text-slate-200 text-center">
            Propietario: <b>{personaElegida.nombre}</b>
          </div>
          {!personaElegida.grupos.length && (
            <p className="text-sm text-slate-500 text-center">Todavía no tiene cartones asignados en este sorteo.</p>
          )}
          {personaElegida.grupos.map((g) => (
            <div key={g.grupo} className="space-y-2">
              {g.cartones.length > 1
                ? <ComboCard grupo={g.grupo} color={g.cartones[0].color} cartones={g.cartones} compact={false} />
                : <MiniCard carton={g.cartones[0]} letra={g.cartones[0].letra} imagenUrl={g.cartones[0].imagen_url} compact={false} />}
              <Button
                variant="ghost"
                className="w-full"
                onClick={() => descargarCarton(g.cartones, g.grupo, sorteoNombre.color)}
              >
                ⬇ Descargar
              </Button>
            </div>
          ))}
          {resultadosNombre && resultadosNombre.length > 1 && (
            <button type="button" onClick={() => setPersonaElegida(null)} className="w-full text-sm text-slate-400 hover:text-slate-200 transition">
              &larr; Elegir otra persona
            </button>
          )}
        </div>
      )}

      <button type="button" onClick={onVolver} className="w-full mt-4 text-sm text-slate-400 hover:text-slate-200 transition">
        &larr; Volver
      </button>
    </>
  );
}

function AuthScreen() {
  const { login } = useAuth();
  const { logoUrl } = useSettings();
  // Permite abrir directo en "Verifícate en la Lista" o en "Consulta tus
  // Cartones" con un link tipo ?ver=lista o ?ver=consulta
  const [mode, setMode] = useState(() => {
    const v = new URLSearchParams(window.location.search).get('ver');
    return v === 'lista' || v === 'consulta' ? v : 'inicio';
  }); // 'inicio' | 'admin' | 'lista' | 'consulta'
  const [adminForm, setAdminForm] = useState({ username: '', password: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function entrarAdmin(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const data = await apiFetch('/auth/login', { method: 'POST', body: JSON.stringify(adminForm) });
      login(data.token, data.user);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative">
      <div className="absolute top-4 right-4"><ThemeToggle /></div>
      <div className="w-full max-w-md">
        <div className="text-center mb-6">
          <img src={logoUrl || "logo.png"} alt="Bingo la Negra" className="w-24 h-24 mx-auto mb-2 rounded-full object-cover border-2 border-bingoaccent shadow-glow" />
          <h1 className="text-2xl font-black bg-gradient-to-r from-rose-300 to-pink-300 bg-clip-text text-transparent">Bingo la Negra</h1>
          <p className="text-slate-400 text-sm">75 bolillas · en tiempo real</p>
        </div>
        <Card>
          {mode === 'lista' ? (
            <VerificarListaPanel onVolver={() => setMode('inicio')} />
          ) : mode === 'consulta' ? (
            <ConsultaCartonesPanel onVolver={() => setMode('inicio')} />
          ) : mode === 'inicio' ? (
            <>
              <h2 className="text-center font-bold text-rose-100 mb-4">Bienvenido</h2>
              <button
                type="button"
                onClick={() => setMode('lista')}
                className="w-full text-sm text-slate-400 hover:text-slate-200 border border-slate-700 rounded-xl py-2 transition"
              >
                🔍 Verifícate en la Lista
              </button>
              <button
                type="button"
                onClick={() => setMode('consulta')}
                className="w-full mt-2 text-sm text-slate-400 hover:text-slate-200 border border-slate-700 rounded-xl py-2 transition"
              >
                🧾 Consulta tus Cartones
              </button>
              <button
                type="button"
                onClick={() => { setMode('admin'); setError(''); }}
                className="w-full mt-2 text-sm text-slate-400 hover:text-slate-200 border border-slate-700 rounded-xl py-2 transition"
              >
                💬 Administración
              </button>
            </>
          ) : (
            <>
              <h2 className="text-center font-bold text-rose-100 mb-4">Acceso Administrador</h2>
              <form onSubmit={entrarAdmin} className="space-y-3">
                <div>
                  <Label>Usuario</Label>
                  <Input required value={adminForm.username} onChange={(e) => setAdminForm({ ...adminForm, username: e.target.value })} placeholder="tu_usuario" />
                </div>
                <div>
                  <Label>Contraseña</Label>
                  <Input required type="password" value={adminForm.password} onChange={(e) => setAdminForm({ ...adminForm, password: e.target.value })} placeholder="••••••••" />
                </div>
                {error && <div className="text-red-400 text-sm bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2">{error}</div>}
                <Button className="w-full" disabled={loading}>{loading ? 'Procesando...' : 'Ingresar'}</Button>
              </form>
              <button
                type="button"
                onClick={() => { setMode('inicio'); setError(''); }}
                className="w-full mt-4 text-sm text-slate-400 hover:text-slate-200 transition"
              >
                &larr; Volver
              </button>
            </>
          )}
        </Card>
        <p className="text-center text-sm mt-4 credito-neon">
          ✨ Desarrollado por: <a href="https://wa.me/qr/G7A2RHXJ42C5J1" target="_blank" rel="noopener noreferrer">Andrews Studio</a> ✨
        </p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// LAYOUT
// ---------------------------------------------------------------------------
function Shell({ title, tabs, active, onTab, right, children }) {
  const { logoUrl } = useSettings();
  return (
    <div className="min-h-screen flex">
      <aside className="w-60 shrink-0 bg-slate-950/60 border-r border-bingopurple/20 p-4 hidden md:flex md:flex-col gap-1">
        <div className="flex items-center gap-2 mb-6 px-2">
          <img src={logoUrl || "logo.png"} alt="Bingo la Negra" className="w-9 h-9 rounded-full object-cover shrink-0" />
          <span className="font-black text-rose-200 text-sm leading-tight">Bingo la Negra</span>
        </div>
        {tabs.map((t) => (
          <button key={t.key} onClick={() => onTab(t.key)}
            className={`text-left px-3 py-2 rounded-xl text-sm font-medium flex items-center gap-2 transition ${active === t.key ? 'bg-gradient-to-r from-bingopurple to-bingoaccent text-white shadow-glow' : 'text-slate-400 hover:bg-slate-800/60'}`}>
            <span>{t.icon}</span>{t.label}
          </button>
        ))}
      </aside>
      <div className="flex-1 flex flex-col min-w-0">
        <header className="border-b border-bingopurple/20 bg-slate-950/40 backdrop-blur px-4 md:px-8 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold text-rose-100">{title}</h1>
          </div>
          <div className="flex items-center gap-3">{right}</div>
        </header>
        <div className="flex md:hidden gap-1 overflow-x-auto px-3 py-2 bg-slate-950/50">
          {tabs.map((t) => (
            <button key={t.key} onClick={() => onTab(t.key)} className={`px-3 py-1.5 rounded-lg text-xs whitespace-nowrap ${active === t.key ? 'bg-bingopurple text-white' : 'bg-slate-800 text-slate-400'}`}>{t.icon} {t.label}</button>
          ))}
        </div>
        <main className="flex-1 p-2 md:p-8">{children}</main>
      </div>
    </div>
  );
}

function TopUserMenu() {
  const { user, logout } = useAuth();
  return (
    <div className="flex items-center gap-3">
      <span className="text-sm text-slate-300">{user.username}</span>
      <ThemeToggle />
      <Button variant="ghost" onClick={logout}>Salir</Button>
    </div>
  );
}

// ===========================================================================
// ADMIN · MÓDULO DE SORTEOS
// ===========================================================================
// Editor de figuras personalizadas: cuadrícula 5x5 clickeable (como un
// cartón) para dibujar la figura a mano, con nombre y guardado persistente.
function CustomPatternEditor({ onClose, onCreated }) {
  const [mask, setMask] = useState(() => Array.from({ length: 5 }, () => [0, 0, 0, 0, 0]));
  const [nombre, setNombre] = useState('');
  const [error, setError] = useState('');
  const [guardando, setGuardando] = useState(false);

  function toggle(r, c) {
    if (r === 2 && c === 2) return; // centro = LIBRE, siempre marcado
    setMask((m) => m.map((row, ri) => (ri === r ? row.map((v, ci) => (ci === c ? (v ? 0 : 1) : v)) : row)));
  }

  async function guardar() {
    setError('');
    if (!nombre.trim()) { setError('Ponle un nombre a la figura.'); return; }
    if (!mask.some((row) => row.some((v) => v === 1))) { setError('Marca al menos una casilla.'); return; }
    setGuardando(true);
    try {
      const d = await apiFetch('/patrones-personalizados', { method: 'POST', body: JSON.stringify({ nombre, mascara: mask }) });
      onCreated(d.patron);
      onClose();
    } catch (e) { setError(e.message); }
    finally { setGuardando(false); }
  }

  return (
    <Modal title="Crear figura personalizada" onClose={onClose}>
      <div className="space-y-4">
        <div>
          <Label>Nombre de la figura</Label>
          <Input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Ej: Mi Figura Especial" />
        </div>
        <div>
          <Label>Dibuja la figura sobre el cartón</Label>
          <p className="text-xs text-slate-500 mb-2">Toca las casillas que quieres incluir. El centro (LIBRE) siempre cuenta como marcado.</p>
          <div className="grid grid-cols-5 gap-1.5 max-w-[220px] mx-auto bg-slate-800/40 p-3 rounded-xl border border-bingopurple/20">
            {mask.map((row, r) => row.map((v, c) => {
              const libre = r === 2 && c === 2;
              const activo = v === 1 || libre;
              return (
                <button
                  key={r + '-' + c}
                  type="button"
                  onClick={() => toggle(r, c)}
                  className={`aspect-square rounded flex items-center justify-center text-[9px] font-bold transition ${activo ? 'bg-gradient-to-br from-bingopurple to-bingoaccent text-white' : 'bg-slate-900/80 text-slate-500 hover:bg-slate-700'} ${libre ? 'cursor-default' : 'cursor-pointer active:scale-95'}`}
                >
                  {libre ? 'LIBRE' : ''}
                </button>
              );
            }))}
          </div>
        </div>
        {error && <div className="text-red-400 text-sm bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2">{error}</div>}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button disabled={guardando} onClick={guardar}>{guardando ? 'Guardando...' : 'Guardar figura'}</Button>
        </div>
      </div>
    </Modal>
  );
}
function AdminSorteos() {
  const [sorteos, setSorteos] = useState([]);
  const [patrones, setPatrones] = useState([]);
  const [catalogos, setCatalogos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [panelId, setPanelId] = useState(null);
  const [error, setError] = useState('');
  const [showEditorFigura, setShowEditorFigura] = useState(false);

  const emptyForm = { fecha_hora: '', rango_desde: 1, rango_hasta: 100, color: 'Verde', tipo_venta: 1, costo: 1, porcentaje_ganancia: 30, modo_premio: 'porcentaje', figuras: [], catalogo_imagenes_id: '' };
  const [form, setForm] = useState(emptyForm);

  function toggleFigura(key) {
    setForm((f) => {
      const existe = f.figuras.some((x) => x.patron === key);
      const nuevo = f.modo_premio === 'monto_fijo' ? { patron: key, monto: 0 } : f.modo_premio === 'sin_premio' ? { patron: key } : { patron: key, porcentaje: 0 };
      let figuras = existe ? f.figuras.filter((x) => x.patron !== key) : [...f.figuras, nuevo];
      if (f.modo_premio === 'porcentaje') {
        const n = figuras.length;
        if (n) {
          const base = +(100 / n).toFixed(2);
          figuras = figuras.map((x, i) => ({ ...x, porcentaje: i === n - 1 ? +(100 - base * (n - 1)).toFixed(2) : base }));
        }
      }
      return { ...f, figuras };
    });
  }

  function setFiguraPorcentaje(key, value) {
    setForm((f) => ({ ...f, figuras: f.figuras.map((x) => (x.patron === key ? { ...x, porcentaje: value } : x)) }));
  }

  function setFiguraMonto(key, value) {
    setForm((f) => ({ ...f, figuras: f.figuras.map((x) => (x.patron === key ? { ...x, monto: value } : x)) }));
  }

  // Al cambiar de modo, conserva las figuras elegidas pero reacomoda sus
  // montos/porcentajes al nuevo modo (no se puede mezclar % con Bs fijos).
  function cambiarModoPremio(nuevoModo) {
    setForm((f) => {
      const claves = f.figuras.map((x) => x.patron);
      let figuras;
      if (nuevoModo === 'porcentaje') {
        const n = claves.length;
        const base = n ? +(100 / n).toFixed(2) : 0;
        figuras = claves.map((p, i) => ({ patron: p, porcentaje: i === n - 1 ? +(100 - base * (n - 1)).toFixed(2) : base }));
      } else if (nuevoModo === 'monto_fijo') {
        figuras = claves.map((p) => ({ patron: p, monto: 0 }));
      } else {
        figuras = claves.map((p) => ({ patron: p }));
      }
      return { ...f, modo_premio: nuevoModo, figuras };
    });
  }

  function load() {
    setLoading(true);
    Promise.all([apiFetch('/sorteos'), apiFetch('/sorteos/patrones'), apiFetch('/catalogos-imagenes')])
      .then(([s, p, c]) => { setSorteos(s.sorteos); setPatrones(p.patrones); setCatalogos(c.catalogos); })
      .finally(() => setLoading(false));
  }
  useEffect(load, []);

  // Sincronización absoluta: refresca la lista sola ante cualquier cambio
  // (creación, edición, cambio de estatus, o ventas de otros jugadores).
  useEffect(() => {
    socket.on('sorteos-cambio', load);
    return () => socket.off('sorteos-cambio', load);
  }, []);

  // El rango representa cuántos combos/grupos de venta hay, no cartones físicos:
  // con combo x4, un rango de "100" son en realidad 100 grupos de 4 = 400 cartones físicos.
  const grupos = Math.max(0, (parseInt(form.rango_hasta) || 0) - (parseInt(form.rango_desde) || 0) + 1);
  const total = grupos * (form.tipo_venta || 1);
  const gananciaMax = +(grupos * form.costo * (form.porcentaje_ganancia / 100)).toFixed(2);
  const premioMax = +(grupos * form.costo * (1 - form.porcentaje_ganancia / 100)).toFixed(2);
  const sumaPorcentaje = +form.figuras.reduce((s, f) => s + (Number(f.porcentaje) || 0), 0).toFixed(2);
  const totalMontoFijo = +form.figuras.reduce((s, f) => s + (Number(f.monto) || 0), 0).toFixed(2);
  const faltaMonto = form.modo_premio === 'monto_fijo' && form.figuras.some((f) => !(Number(f.monto) > 0));

  async function crearSorteo(e) {
    e.preventDefault();
    setError('');
    if (!form.catalogo_imagenes_id) { setError('Elige un catálogo de cartones personalizados.'); return; }
    if (!form.figuras.length) { setError('Elige al menos una figura.'); return; }
    if (form.modo_premio === 'porcentaje' && sumaPorcentaje !== 100) {
      setError(`El % de las figuras debe sumar 100 (suma actual: ${sumaPorcentaje}).`);
      return;
    }
    if (form.modo_premio === 'monto_fijo' && faltaMonto) {
      setError('Cada figura debe tener un monto en Bs mayor a 0.');
      return;
    }
    try {
      await apiFetch('/sorteos', { method: 'POST', body: JSON.stringify(form) });
      setShowForm(false);
      setForm(emptyForm);
      load();
    } catch (e) { setError(e.message); }
  }

  async function eliminar(id) {
    if (!confirm('¿Eliminar este sorteo y sus cartones asociados?')) return;
    await apiFetch('/sorteos/' + id, { method: 'DELETE' });
    load();
  }

  async function borrarFigura(key) {
    if (!confirm('¿Eliminar esta figura personalizada?')) return;
    const id = key.replace('custom_', '');
    await apiFetch('/patrones-personalizados/' + id, { method: 'DELETE' });
    setForm((f) => ({ ...f, figuras: f.figuras.filter((x) => x.patron !== key) }));
    load();
  }

  if (panelId) return <SorteoDrawPanel sorteoId={panelId} onClose={() => { setPanelId(null); load(); }} />;

  function alCrearFigura(patron) {
    setPatrones((prev) => [...prev, patron]);
    toggleFigura(patron.key);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-rose-100">Sorteos</h2>
        <Button onClick={() => setShowForm(true)}>+ Crear Sorteo</Button>
      </div>

      {showForm && (
        <Modal title="Nuevo Sorteo" onClose={() => setShowForm(false)} wide>
          <form onSubmit={crearSorteo} className="grid md:grid-cols-2 gap-4">
            <div>
              <Label>Fecha y Hora</Label>
              <Input required type="datetime-local" value={form.fecha_hora} onChange={(e) => setForm({ ...form, fecha_hora: e.target.value })} />
            </div>
            <div>
              <Label>Cartones Personalizados</Label>
              <Select
                required
                value={form.catalogo_imagenes_id}
                onChange={(e) => {
                  const cat = catalogos.find((c) => String(c.id) === e.target.value);
                  setForm({ ...form, catalogo_imagenes_id: e.target.value, color: cat ? cat.color : form.color });
                }}
              >
                <option value="">Elige un catálogo...</option>
                {catalogos.map((c) => <option key={c.id} value={c.id}>{c.nombre} · {c.color} ({c.total_imagenes} imgs)</option>)}
              </Select>
              {!catalogos.length && (
                <p className="text-xs text-amber-400 mt-1">No tienes ningún catálogo todavía — créalo primero en "🖼️ Cartones Personalizados".</p>
              )}
            </div>
            <div>
              <Label>Rango — Desde N°</Label>
              <Input required type="number" min="1" value={form.rango_desde} onChange={(e) => setForm({ ...form, rango_desde: e.target.value })} />
            </div>
            <div>
              <Label>Rango — Hasta N°</Label>
              <Input required type="number" min="1" value={form.rango_hasta} onChange={(e) => setForm({ ...form, rango_hasta: e.target.value })} />
            </div>
            <div>
              <Label>Costo del Cartón / Combo (Bs)</Label>
              <Input required type="number" step="0.01" min="0" value={form.costo} onChange={(e) => setForm({ ...form, costo: Number(e.target.value) })} />
            </div>
            <div>
              <Label>% Ganancia del Administrador</Label>
              <Input required type="number" min="0" max="100" value={form.porcentaje_ganancia} onChange={(e) => setForm({ ...form, porcentaje_ganancia: Number(e.target.value) })} />
            </div>
            <div className="md:col-span-2">
              <Label>Cómo se definen los premios de las figuras</Label>
              <div className="grid sm:grid-cols-3 gap-2">
                {[
                  { key: 'porcentaje', label: '% del acumulado', desc: 'Cada figura se lleva un % del premio acumulado según las ventas' },
                  { key: 'monto_fijo', label: 'Monto fijo (Bs)', desc: 'Cada figura tiene un monto fijo, sin importar cuánto se venda' },
                  { key: 'sin_premio', label: 'Sin montos', desc: 'Solo elige las figuras; el monto se define después' },
                ].map((m) => (
                  <button
                    key={m.key}
                    type="button"
                    onClick={() => cambiarModoPremio(m.key)}
                    className={`text-left rounded-xl border px-3 py-2 transition ${form.modo_premio === m.key ? 'border-bingoaccent bg-bingopurple/10' : 'border-slate-700 bg-slate-800/40 hover:bg-slate-800'}`}
                  >
                    <div className="text-sm font-bold">{m.label}</div>
                    <div className="text-[11px] text-slate-400">{m.desc}</div>
                  </button>
                ))}
              </div>
            </div>
            <div className="md:col-span-2">
              <div className="flex items-center justify-between mb-1">
                <Label>Figuras / Patrones Ganadores (elige una o varias — bingo "corrido")</Label>
                <button type="button" onClick={() => setShowEditorFigura(true)} className="text-xs text-rose-300 hover:text-rose-200 underline shrink-0">+ Crear figura personalizada</button>
              </div>
              <div className="grid sm:grid-cols-2 gap-2 bg-slate-800/40 rounded-xl p-3 border border-bingopurple/20">
                {patrones.map((p) => {
                  const fig = form.figuras.find((f) => f.patron === p.key);
                  return (
                    <div key={p.key} className={`flex items-center gap-2 rounded-lg px-2 py-1.5 border ${fig ? 'border-bingoaccent bg-bingopurple/10' : 'border-transparent'}`}>
                      <input type="checkbox" checked={!!fig} onChange={() => toggleFigura(p.key)} className="accent-bingoaccent" />
                      <PatternGrid mask={p.preview} size={12} />
                      <span className="text-sm flex-1">{p.label}</span>
                      {p.personalizada && (
                        <button type="button" onClick={() => borrarFigura(p.key)} className="text-xs text-red-400 hover:text-red-300" title="Eliminar figura">🗑️</button>
                      )}
                      {fig && form.modo_premio === 'porcentaje' && (
                        <div className="flex items-center gap-1">
                          <input
                            type="number" min="0.01" max="100" step="0.01" value={fig.porcentaje}
                            onChange={(e) => setFiguraPorcentaje(p.key, Number(e.target.value))}
                            className="w-16 bg-slate-900/70 border border-slate-700 rounded px-1.5 py-1 text-xs text-right"
                          />
                          <span className="text-xs text-slate-400">%</span>
                        </div>
                      )}
                      {fig && form.modo_premio === 'monto_fijo' && (
                        <div className="flex items-center gap-1">
                          <span className="text-xs text-slate-400">Bs</span>
                          <input
                            type="number" min="0.01" step="0.01" value={fig.monto}
                            onChange={(e) => setFiguraMonto(p.key, Number(e.target.value))}
                            className="w-20 bg-slate-900/70 border border-slate-700 rounded px-1.5 py-1 text-xs text-right"
                          />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
              {form.figuras.length > 0 && form.modo_premio === 'porcentaje' && (
                <div className={`text-xs mt-1 text-right ${sumaPorcentaje === 100 ? 'text-emerald-400' : 'text-red-400'}`}>
                  Suma de %: {sumaPorcentaje}{sumaPorcentaje !== 100 && ' (debe sumar 100)'}
                </div>
              )}
              {form.figuras.length > 0 && form.modo_premio === 'monto_fijo' && (
                <div className={`text-xs mt-1 text-right ${!faltaMonto ? 'text-emerald-400' : 'text-red-400'}`}>
                  Total premios fijos: {money(totalMontoFijo)}{faltaMonto && ' (falta algún monto)'}
                </div>
              )}
            </div>

            <div className="md:col-span-2 grid md:grid-cols-2 gap-4 items-center bg-slate-800/40 rounded-xl p-4 border border-bingopurple/20">
              <div className="text-center">
                <div className="text-xs text-slate-400">Ganancia Máx. Proyectada (tu ganancia)</div>
                <div className="text-xl font-black text-emerald-400">{money(gananciaMax)}</div>
              </div>
              {form.modo_premio === 'porcentaje' ? (
                <div className="text-center">
                  <div className="text-xs text-slate-400">Premio Máx. Proyectado (total a repartir)</div>
                  <div className="text-xl font-black text-rose-300">{money(premioMax)}</div>
                </div>
              ) : form.modo_premio === 'monto_fijo' ? (
                <div className="text-center">
                  <div className="text-xs text-slate-400">Total Premios Fijos (suma de figuras)</div>
                  <div className="text-xl font-black text-rose-300">{money(totalMontoFijo)}</div>
                </div>
              ) : (
                <div className="text-center">
                  <div className="text-xs text-slate-400">Premios</div>
                  <div className="text-sm text-slate-400">Sin montos definidos todavía</div>
                </div>
              )}
              {form.figuras.length > 0 && form.modo_premio === 'porcentaje' && (
                <div className="md:col-span-2 flex flex-wrap justify-center gap-x-4 gap-y-1 text-xs text-slate-300 border-t border-slate-700/50 pt-3">
                  {form.figuras.map((f) => {
                    const label = patrones.find((p) => p.key === f.patron)?.label || f.patron;
                    return <span key={f.patron}>{label}: <b className="text-rose-300">{money(premioMax * (f.porcentaje / 100))}</b> ({f.porcentaje}%)</span>;
                  })}
                </div>
              )}
              {form.figuras.length > 0 && form.modo_premio === 'monto_fijo' && (
                <div className="md:col-span-2 flex flex-wrap justify-center gap-x-4 gap-y-1 text-xs text-slate-300 border-t border-slate-700/50 pt-3">
                  {form.figuras.map((f) => {
                    const label = patrones.find((p) => p.key === f.patron)?.label || f.patron;
                    return <span key={f.patron}>{label}: <b className="text-rose-300">{money(f.monto)}</b></span>;
                  })}
                </div>
              )}
              <div className="md:col-span-2 text-xs text-slate-500 text-center">{grupos} cartas</div>
            </div>

            {error && <div className="md:col-span-2 text-red-400 text-sm bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2">{error}</div>}
            <div className="md:col-span-2 flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => setShowForm(false)}>Cancelar</Button>
              <Button
                type="submit"
                disabled={!form.figuras.length || (form.modo_premio === 'porcentaje' && sumaPorcentaje !== 100) || (form.modo_premio === 'monto_fijo' && faltaMonto)}
              >
                Crear Sorteo
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {showEditorFigura && (
        <CustomPatternEditor onClose={() => setShowEditorFigura(false)} onCreated={alCrearFigura} />
      )}

      {loading ? <Spinner /> : (
        <Card className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-slate-400 border-b border-slate-800">
                <th className="py-2 pr-3">ID</th>
                <th className="py-2 pr-3">Fecha</th>
                <th className="py-2 pr-3">Color</th>
                <th className="py-2 pr-3">Figura</th>
                <th className="py-2 pr-3">Venta</th>
                <th className="py-2 pr-3">Costo</th>
                <th className="py-2 pr-3">Vendidos</th>
                <th className="py-2 pr-3">Tu Ganancia</th>
                <th className="py-2 pr-3">Premio Acum.</th>
                <th className="py-2 pr-3">Estatus</th>
                <th className="py-2 pr-3">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {sorteos.map((s) => {
                return (
                  <tr key={s.id} className="border-b border-slate-800/60 hover:bg-slate-800/30">
                    <td className="py-2 pr-3 text-slate-400">#{s.id}</td>
                    <td className="py-2 pr-3">{s.fecha_hora?.replace('T', ' ')}</td>
                    <td className="py-2 pr-3"><Badge>{s.color}</Badge></td>
                    <td className="py-2 pr-3">
                      <div className="flex flex-col gap-1">
                        {(s.figuras || []).map((f) => (
                          <div key={f.patron} className="flex items-center gap-1.5">
                            <PatternGrid mask={patrones.find((p) => p.key === f.patron)?.preview} size={8} />
                            <span className="text-xs text-slate-400">
                              {f.label} ({s.modo_premio === 'monto_fijo' ? money(f.monto) : s.modo_premio === 'sin_premio' ? 'sin monto' : `${f.porcentaje}%`}){f.ganada ? ' ✅' : ''}
                            </span>
                          </div>
                        ))}
                      </div>
                    </td>
                    <td className="py-2 pr-3">{s.tipo_venta === 1 ? '1 Cartón' : `Combo x${s.tipo_venta}`}</td>
                    <td className="py-2 pr-3">{money(s.costo)}</td>
                    <td className="py-2 pr-3">{s.vendidos}/{s.totalCartones}</td>
                    <td className="py-2 pr-3 text-emerald-400 font-semibold">{money(s.gananciaActual)}</td>
                    <td className="py-2 pr-3 text-rose-300 font-semibold">{money(s.premioAcumulado)}</td>
                    <td className="py-2 pr-3">
                      <Badge tone={s.estatus === 'activo' ? 'green' : s.estatus === 'en_juego' ? 'yellow' : s.estatus === 'pausado' ? 'red' : 'gray'}>{s.estatus}</Badge>
                    </td>
                    <td className="py-2 pr-3">
                      <div className="flex gap-1">
                        <Button variant="ghost" onClick={() => setPanelId(s.id)}>🎙️ Panel</Button>
                        <Button variant="danger" onClick={() => eliminar(s.id)}>🗑️</Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {!sorteos.length && <tr><td colSpan="11" className="text-center text-slate-500 py-8">No hay sorteos creados aún.</td></tr>}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// PANEL SORTEADOR AUTOMATIZADO (en vivo, vía WebSockets)
// ---------------------------------------------------------------------------
function SorteoDrawPanel({ sorteoId, onClose }) {
  const [sorteo, setSorteo] = useState(null);
  const [patrones, setPatrones] = useState([]);
  useEffect(() => { apiFetch('/sorteos/patrones').then((d) => setPatrones(d.patrones)); }, []);
  const [catalogos, setCatalogos] = useState([]);
  useEffect(() => { apiFetch('/catalogos-imagenes').then((d) => setCatalogos(d.catalogos)); }, []);
  const [cartones, setCartones] = useState([]);
  const [ganadores, setGanadores] = useState([]);
  const [conjuntosAbiertos, setConjuntosAbiertos] = useState(new Set());
  // Ganadores ya avisados (por socket o por sondeo/reconexión), para no
  // repetir el mismo aviso dos veces. null = todavía no se cargó la primera
  // vez (evita re-avisar de golpe todo lo que ya estaba pendiente al abrir el panel).
  const ganadasVistasRef = useRef(null);

  function toggleConjuntoAbierto(grupo) {
    setConjuntosAbiertos((prev) => {
      const s = new Set(prev);
      s.has(grupo) ? s.delete(grupo) : s.add(grupo);
      return s;
    });
  }

  const [numerosInput, setNumerosInput] = useState('');
  const [accionMsg, setAccionMsg] = useState('');
  const [asignarNombre, setAsignarNombre] = useState('');
  const [asignarNumerosInput, setAsignarNumerosInput] = useState('');

  // Edición de figuras (agregar/quitar/cambiar % o monto) y de rango
  // (ampliar o reducir cuántas cartas hay a la venta) de un sorteo ya creado.
  const [editandoFiguras, setEditandoFiguras] = useState(false);
  const [figurasEdit, setFigurasEdit] = useState([]);
  const [nuevaFiguraPatron, setNuevaFiguraPatron] = useState('');
  const [figurasError, setFigurasError] = useState('');
  const [guardandoFiguras, setGuardandoFiguras] = useState(false);
  const [editandoRango, setEditandoRango] = useState(false);
  const [rangoHastaEdit, setRangoHastaEdit] = useState('');
  const [rangoError, setRangoError] = useState('');
  const [editandoCatalogo, setEditandoCatalogo] = useState(false);
  const [catalogoEdit, setCatalogoEdit] = useState('');
  const [catalogoError, setCatalogoError] = useState('');
  const [guardandoCatalogo, setGuardandoCatalogo] = useState(false);
  const [guardandoRango, setGuardandoRango] = useState(false);

  function iniciarEdicionFiguras() {
    setFigurasError('');
    setFigurasEdit((sorteo.figuras || []).filter((f) => !f.ganada).map((f) => ({ patron: f.patron, porcentaje: f.porcentaje || 0, monto: f.monto })));
    setNuevaFiguraPatron('');
    setEditandoFiguras(true);
  }
  function agregarFiguraEdit() {
    if (!nuevaFiguraPatron) return;
    setFigurasEdit((prev) => [...prev, { patron: nuevaFiguraPatron, porcentaje: 0, monto: 0 }]);
    setNuevaFiguraPatron('');
  }
  function quitarFiguraEdit(patron) {
    setFigurasEdit((prev) => prev.filter((f) => f.patron !== patron));
  }
  function setFiguraEditValor(patron, campo, valor) {
    setFigurasEdit((prev) => prev.map((f) => (f.patron === patron ? { ...f, [campo]: valor } : f)));
  }
  async function guardarFiguras() {
    setFigurasError('');
    setGuardandoFiguras(true);
    try {
      const body = figurasEdit.map((f) => ({
        patron: f.patron,
        porcentaje: sorteo.modo_premio === 'porcentaje' ? Number(f.porcentaje) || 0 : undefined,
        monto: sorteo.modo_premio === 'monto_fijo' ? Number(f.monto) || 0 : undefined,
      }));
      await apiFetch('/sorteos/' + sorteoId + '/figuras', { method: 'PUT', body: JSON.stringify({ figuras: body }) });
      setEditandoFiguras(false);
      loadAll();
    } catch (e) { setFigurasError(e.message); }
    finally { setGuardandoFiguras(false); }
  }
  const sumaPorcentajeEdit = +figurasEdit.reduce((s, f) => s + (Number(f.porcentaje) || 0), 0).toFixed(2);
  const sumaGanadasPorcentaje = +(sorteo?.figuras || []).filter((f) => f.ganada).reduce((s, f) => s + (f.porcentaje || 0), 0).toFixed(2);
  const sumaTotalEdit = +(sumaPorcentajeEdit + sumaGanadasPorcentaje).toFixed(2);
  const patronesUsadosEdit = new Set([...(sorteo?.figuras || []).filter((f) => f.ganada).map((f) => f.patron), ...figurasEdit.map((f) => f.patron)]);

  function iniciarEdicionRango() {
    setRangoError('');
    setRangoHastaEdit(String(sorteo.rango_hasta));
    setEditandoRango(true);
  }
  async function guardarRango() {
    setRangoError('');
    setGuardandoRango(true);
    try {
      await apiFetch('/sorteos/' + sorteoId + '/rango', { method: 'PUT', body: JSON.stringify({ rango_hasta: Number(rangoHastaEdit) }) });
      setEditandoRango(false);
      loadAll();
    } catch (e) { setRangoError(e.message); }
    finally { setGuardandoRango(false); }
  }

  function iniciarEdicionCatalogo() {
    setCatalogoError('');
    setCatalogoEdit(sorteo.catalogo_imagenes_id != null ? String(sorteo.catalogo_imagenes_id) : '');
    setEditandoCatalogo(true);
  }
  async function guardarCatalogo() {
    if (!catalogoEdit) { setCatalogoError('Elige un catálogo.'); return; }
    setCatalogoError('');
    setGuardandoCatalogo(true);
    try {
      await apiFetch('/sorteos/' + sorteoId, { method: 'PUT', body: JSON.stringify({ catalogo_imagenes_id: Number(catalogoEdit) }) });
      setEditandoCatalogo(false);
      loadAll();
    } catch (e) { setCatalogoError(e.message); }
    finally { setGuardandoCatalogo(false); }
  }

  function loadAll() {
    apiFetch('/sorteos/' + sorteoId).then((d) => {
      setSorteo(d.sorteo);
      // Respaldo ante desconexiones de WebSocket: si el evento 'bingo-ganador'
      // se perdió, cualquier ganador que aparezca acá y no hayamos registrado
      // todavía se agrega igual al banner. Se rastrea por ganadorId (no por
      // patron) porque una misma figura puede tener varios ganadores
      // legítimos (bingo "corrido") y todos deben avisarse, no solo el primero.
      const nuevos = [];
      (d.sorteo.figuras || []).forEach((f) => {
        (f.ganadores || []).forEach((g) => {
          if (ganadasVistasRef.current?.has(g.ganadorId)) return;
          nuevos.push({
            sorteoId: d.sorteo.id, patron: f.patron, ganadorId: g.ganadorId, usuario: g.jugador, usuarioId: g.jugadorId,
            cartonId: g.cartonId, cartonNumero: g.cartonNumero, grupo: g.grupo,
            letra: g.letra, color: g.color, grid: g.grid, marcados: g.marcados,
            premio: g.premio,
          });
        });
      });
      if (ganadasVistasRef.current === null) {
        ganadasVistasRef.current = new Set((d.sorteo.figuras || []).flatMap((f) => (f.ganadores || []).map((g) => g.ganadorId)));
      } else if (nuevos.length) {
        nuevos.forEach((g) => ganadasVistasRef.current.add(g.ganadorId));
        setGanadores((prev) => [...prev, ...nuevos.filter((g) => !prev.some((p) => p.ganadorId === g.ganadorId))]);
      }
    });
    apiFetch('/cartones?sorteo_id=' + sorteoId).then((d) => setCartones(d.cartones.filter((c) => c.estado !== 'disponible')));
  }

  useEffect(() => {
    ganadasVistasRef.current = null;
    loadAll();
    socket.emit('join-sorteo', { sorteoId });
    const onGanador = (p) => {
      if (p.sorteoId != sorteoId) return;
      if (ganadasVistasRef.current?.has(p.ganadorId)) return loadAll();
      ganadasVistasRef.current?.add(p.ganadorId);
      setGanadores((g) => [...g, p]);
      loadAll();
    };
    const onOtro = (p) => { if (p.sorteoId == sorteoId) loadAll(); };
    const onCompra = (p) => {
      if (p.sorteoId != sorteoId) return;
      setAccionMsg(`🛒 Nueva compra: ${p.jugador} — #${p.numeros.join(', #')} (${money(p.monto)})`);
      loadAll();
    };
    socket.on('bingo-ganador', onGanador);
    socket.on('sorteo-finalizado', onOtro);
    socket.on('cartones-vendidos', onCompra);
    socket.on('cartones-actualizados', onOtro);
    // Respaldo ante desconexiones de WebSocket (celular con pantalla
    // bloqueada, cambio de red, app en segundo plano): al reconectar, y
    // también por sondeo periódico como red de seguridad, se refresca todo
    // desde el servidor — así ningún ganador se queda "colgado" solo porque
    // el evento en vivo no llegó a este dispositivo.
    socket.on('connect', loadAll);
    // Tercera red de seguridad: cuando el celular vuelve a primer plano (se
    // desbloquea la pantalla, se vuelve a esta pestaña), los temporizadores
    // en segundo plano pudieron haberse pausado aunque el socket siguiera
    // "conectado" — refresca todo apenas la página vuelve a ser visible.
    const onVisible = () => { if (document.visibilityState === 'visible') loadAll(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      socket.emit('leave-sorteo', { sorteoId });
      socket.off('bingo-ganador', onGanador);
      socket.off('sorteo-finalizado', onOtro);
      socket.off('cartones-vendidos', onCompra);
      socket.off('cartones-actualizados', onOtro);
      socket.off('connect', loadAll);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [sorteoId]);

  function parseNumeros() {
    return numerosInput.split(/[\s,]+/).map((n) => parseInt(n, 10)).filter((n) => !Number.isNaN(n));
  }

  async function marcarPagado(numeros) {
    const d = await apiFetch('/cartones/verificar-pago', { method: 'PUT', body: JSON.stringify({ sorteo_id: sorteoId, numeros }) });
    let msg = d.verificados.length ? `✅ Pago confirmado: ${d.verificados.join(', ')}` : '';
    if (d.noApartados.length) msg += ` · ⚠️ No estaban apartados: ${d.noApartados.join(', ')}`;
    if (d.noEncontrados.length) msg += ` · ❌ No existen: ${d.noEncontrados.join(', ')}`;
    setAccionMsg(msg);
    loadAll();
  }

  async function liberarNumeros(numeros) {
    const d = await apiFetch('/cartones/liberar', { method: 'PUT', body: JSON.stringify({ sorteo_id: sorteoId, numeros }) });
    setAccionMsg(d.liberados.length ? `♻️ Liberados: ${d.liberados.join(', ')}` : 'No se encontraron esos cartones.');
    loadAll();
  }

  async function confirmarPago() {
    const numeros = parseNumeros();
    if (!numeros.length) return;
    await marcarPagado(numeros);
    setNumerosInput('');
  }

  async function asignarCarton() {
    const numeros = asignarNumerosInput.split(/[\s,]+/).map((n) => parseInt(n, 10)).filter((n) => !Number.isNaN(n));
    if (!numeros.length || !asignarNombre.trim()) return;
    const d = await apiFetch('/cartones/asignar', {
      method: 'PUT',
      body: JSON.stringify({ sorteo_id: sorteoId, numeros, nombre: asignarNombre.trim() }),
    });
    let msg = d.asignados.length ? `📌 Apartado para ${d.jugador.nombre}: ${d.asignados.join(', ')}` : '';
    if (d.yaOcupados.length) msg += ` · ⚠️ Ya estaban ocupados: ${d.yaOcupados.join(', ')}`;
    if (d.noEncontrados.length) msg += ` · ❌ No existen: ${d.noEncontrados.join(', ')}`;
    setAccionMsg(msg);
    setAsignarNombre('');
    setAsignarNumerosInput('');
    loadAll();
  }

  async function ponerDisponible() {
    const numeros = parseNumeros();
    if (!numeros.length) return;
    await liberarNumeros(numeros);
    setNumerosInput('');
  }

  async function liberarPendientes() {
    if (!confirm('¿Liberar todos los cartones apartados que aún no han confirmado el pago?')) return;
    const d = await apiFetch(`/sorteos/${sorteoId}/liberar-pendientes`, { method: 'PUT' });
    setAccionMsg(`🧹 Se liberaron ${d.liberados} cartón(es) pendientes de pago.`);
    loadAll();
  }

  async function eliminarFigura(f) {
    if (!confirm(`¿Sacar "${f.label}" del juego? Ya no se podrá ganar en este sorteo.`)) return;
    await apiFetch(`/sorteos/${sorteoId}/figuras/${f.patron}`, { method: 'DELETE' });
    loadAll();
  }

  // Varios jugadores pueden pegar bingo legítimamente en la misma figura
  // (bingo "corrido"): la figura sigue "en juego" aunque ya tenga uno o más
  // ganadores validados, hasta que el admin decide que ya juntó a todos y la
  // cierra a mano. Cerrarla no borra el historial de ganadores.
  async function cerrarFigura(f) {
    if (!confirm(`¿Cerrar "${f.label}"? Ya no se podrán validar más bingos de esta figura.`)) return;
    await apiFetch(`/sorteos/${sorteoId}/figuras/${f.patron}/cerrar`, { method: 'PUT' });
    loadAll();
  }

  const cartonesPorGrupo = new Map();
  cartones.forEach((c) => {
    if (!cartonesPorGrupo.has(c.grupo)) cartonesPorGrupo.set(c.grupo, []);
    cartonesPorGrupo.get(c.grupo).push(c);
  });
  if (!sorteo) return <Spinner />;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <Button variant="ghost" onClick={onClose}>&larr; Volver a Sorteos</Button>
      </div>

      <Card>
        <div className="flex flex-wrap gap-6 justify-between items-center">
          <div><div className="text-xs text-slate-400">Sorteo</div><div className="font-bold">#{sorteo.id} · {sorteo.color}</div></div>
          <div><div className="text-xs text-slate-400">Fecha</div><div className="font-bold">{sorteo.fecha_hora?.replace('T', ' ')}</div></div>
          <div><div className="text-xs text-slate-400">Costo</div><div className="font-bold">{money(sorteo.costo)}</div></div>
          <div><div className="text-xs text-slate-400">Vendidos</div><div className="font-bold">{sorteo.vendidos}/{sorteo.totalCartones} <span className="text-emerald-400">({sorteo.pagados} pagados)</span></div></div>
          <div>
            <div className="text-xs text-slate-400">Cartas a la venta</div>
            <div className="font-bold flex items-center gap-1.5">
              {sorteo.rango_desde}-{sorteo.rango_hasta}
              <button type="button" onClick={iniciarEdicionRango} title="Ampliar o reducir la cantidad de cartas" className="text-slate-400 hover:text-rose-300 text-xs">✏️</button>
            </div>
          </div>
          <div><div className="text-xs text-slate-400">Tu Ganancia</div><div className="font-bold text-emerald-400">{money(sorteo.gananciaActual)}</div></div>
          <div><div className="text-xs text-slate-400">Premio Acumulado</div><div className="font-bold text-rose-300">{money(sorteo.premioAcumulado)}</div></div>
          <div><div className="text-xs text-slate-400">Estatus</div><Badge tone={sorteo.estatus === 'en_juego' ? 'yellow' : sorteo.estatus === 'pausado' ? 'red' : sorteo.estatus === 'finalizado' ? 'gray' : 'green'}>{sorteo.estatus}</Badge></div>
          <div>
            <div className="text-xs text-slate-400">Cartones Personalizados</div>
            <div className="font-bold flex items-center gap-1.5">
              {sorteo.catalogo_imagenes_id != null ? (catalogos.find((c) => c.id === sorteo.catalogo_imagenes_id)?.nombre || `#${sorteo.catalogo_imagenes_id}`) : (
                <span className="text-red-400">Sin asignar ⚠️</span>
              )}
              <button type="button" onClick={iniciarEdicionCatalogo} title="Cambiar el catálogo de cartones personalizados" className="text-slate-400 hover:text-rose-300 text-xs">✏️</button>
            </div>
          </div>
        </div>
        {editandoRango && (
          <div className="mt-3 pt-3 border-t border-slate-700/50 flex flex-wrap items-end gap-2">
            <div>
              <Label>Nueva última carta (hoy: {sorteo.rango_desde}-{sorteo.rango_hasta})</Label>
              <Input type="number" min={sorteo.rango_desde} value={rangoHastaEdit} onChange={(e) => setRangoHastaEdit(e.target.value)} className="w-32" />
            </div>
            <Button disabled={guardandoRango} onClick={guardarRango}>{guardandoRango ? 'Guardando...' : 'Guardar'}</Button>
            <Button variant="ghost" onClick={() => setEditandoRango(false)}>Cancelar</Button>
            {rangoError && <div className="w-full text-red-400 text-sm bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2">{rangoError}</div>}
            <p className="w-full text-xs text-slate-500">
              Un número más alto agrega cartas nuevas a la venta. Uno más bajo las quita — solo funciona si esas cartas todavía están disponibles (no apartadas ni vendidas).
            </p>
          </div>
        )}
        {editandoCatalogo && (
          <div className="mt-3 pt-3 border-t border-slate-700/50 flex flex-wrap items-end gap-2">
            <div className="flex-1 min-w-[220px]">
              <Label>Catálogo de cartones personalizados</Label>
              <Select value={catalogoEdit} onChange={(e) => setCatalogoEdit(e.target.value)}>
                <option value="">Elige un catálogo...</option>
                {catalogos.map((c) => <option key={c.id} value={c.id}>{c.nombre} · {c.color} ({c.total_imagenes} imgs)</option>)}
              </Select>
            </div>
            <Button disabled={guardandoCatalogo} onClick={guardarCatalogo}>{guardandoCatalogo ? 'Guardando...' : 'Guardar'}</Button>
            <Button variant="ghost" onClick={() => setEditandoCatalogo(false)}>Cancelar</Button>
            {catalogoError && <div className="w-full text-red-400 text-sm bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2">{catalogoError}</div>}
            <p className="w-full text-xs text-slate-500">
              Cambia qué imágenes se muestran para los cartones de este sorteo. No cambia el color del sorteo ya creado ni afecta las ventas ya hechas.
            </p>
          </div>
        )}
      </Card>

      {ganadores.length > 0 && (
        <div className="space-y-2">
          {ganadores.map((g, i) => (
            <Card key={i} className="border-emerald-500/60 bg-emerald-500/10 text-center">
              <div className="text-2xl font-black text-emerald-300">🎉 ¡BINGO! 🎉</div>
              <div className="text-slate-200 mt-1">
                Figura <b>{sorteo.figuras.find((f) => f.patron === g.patron)?.label || g.patron}</b> — Ganador: <b>{g.usuario}</b> — Cartón #{g.cartonNumero} — Premio {money(g.premio)}
              </div>
            </Card>
          ))}
        </div>
      )}

            <Card className="space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-rose-100">Figuras del Sorteo</h3>
          {!editandoFiguras && <Button variant="ghost" onClick={iniciarEdicionFiguras}>✏️ Editar figuras</Button>}
        </div>
        {!editandoFiguras ? (
          (sorteo.figuras || []).map((f) => (
            <div key={f.patron} className="flex flex-col gap-1.5 bg-slate-800/40 rounded-lg px-3 py-2">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-sm">{f.label}</span>
                  <span className="text-xs text-slate-400">
                    {sorteo.modo_premio === 'sin_premio' ? '(sin monto definido)' : `(${sorteo.modo_premio === 'monto_fijo' ? 'monto fijo' : `${f.porcentaje}%`} · ${money(f.premio)})`}
                  </span>
                </div>
                {f.cerrada ? (
                  <span className="text-xs text-slate-500 font-semibold shrink-0">🔒 Cerrada</span>
                ) : (
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-xs text-amber-400">⏳ En juego{f.ganada ? ` · ${f.ganadores.length} ganador${f.ganadores.length > 1 ? 'es' : ''}` : ''}</span>
                    {f.ganada ? (
                      <button
                        type="button"
                        onClick={() => cerrarFigura(f)}
                        title="Cerrar figura (ya no aceptar más bingos de esta figura)"
                        className="text-slate-400 hover:text-slate-200 text-xs"
                      >🔓</button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => eliminarFigura(f)}
                        title="Sacar esta figura del juego"
                        className="text-red-400 hover:text-red-300 text-xs"
                      >🗑️</button>
                    )}
                  </div>
                )}
              </div>
              {f.ganada && (
                <div className="space-y-0.5 pl-1 border-l-2 border-emerald-500/40">
                  {f.ganadores.map((g) => (
                    <div key={g.ganadorId} className="text-xs text-emerald-400 font-semibold pl-2">
                      ✅ {g.jugador || 'N/A'} — {g.grupo ? `Carta ${g.grupo}${g.letra ? ` · Cartón ${g.letra}` : ''}` : `Cartón #${g.cartonNumero}`} · {money(g.premio)}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))
        ) : (
          <div className="space-y-3">
            {(sorteo.figuras || []).filter((f) => f.ganada).map((f) => (
              <div key={f.patron} className="flex items-center justify-between gap-3 bg-slate-800/20 rounded-lg px-3 py-2 opacity-70">
                <span className="font-semibold text-sm">{f.label}</span>
                <span className="text-xs text-emerald-400 font-semibold">✅ Ya ganada (no se puede editar)</span>
              </div>
            ))}
            {figurasEdit.map((f) => {
              const def = patrones.find((p) => p.key === f.patron);
              return (
                <div key={f.patron} className="flex items-center gap-2 bg-slate-800/40 rounded-lg px-3 py-2">
                  <span className="font-semibold text-sm flex-1">{def?.label || f.patron}</span>
                  {sorteo.modo_premio === 'porcentaje' && (
                    <Input type="number" min="0" max="100" value={f.porcentaje} onChange={(e) => setFiguraEditValor(f.patron, 'porcentaje', Number(e.target.value))} className="w-20" />
                  )}
                  {sorteo.modo_premio === 'porcentaje' && <span className="text-xs text-slate-400">%</span>}
                  {sorteo.modo_premio === 'monto_fijo' && (
                    <>
                      <span className="text-xs text-slate-400">Bs</span>
                      <Input type="number" min="0" value={f.monto} onChange={(e) => setFiguraEditValor(f.patron, 'monto', Number(e.target.value))} className="w-24" />
                    </>
                  )}
                  <button type="button" onClick={() => quitarFiguraEdit(f.patron)} title="Quitar" className="text-red-400 hover:text-red-300 text-xs">🗑️</button>
                </div>
              );
            })}
            {!figurasEdit.length && <p className="text-xs text-slate-500">No hay figuras en juego. Agrega al menos una.</p>}
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <Select value={nuevaFiguraPatron} onChange={(e) => setNuevaFiguraPatron(e.target.value)} className="flex-1 min-w-[160px]">
                <option value="">+ Elegir figura para agregar...</option>
                {patrones.filter((p) => !patronesUsadosEdit.has(p.key)).map((p) => (
                  <option key={p.key} value={p.key}>{p.label}</option>
                ))}
              </Select>
              <Button variant="ghost" disabled={!nuevaFiguraPatron} onClick={agregarFiguraEdit}>+ Agregar</Button>
            </div>
            {sorteo.modo_premio === 'porcentaje' && (
              <div className={`text-xs text-right ${sumaTotalEdit === 100 ? 'text-emerald-400' : 'text-red-400'}`}>
                Suma de % (incluidas las ya ganadas): {sumaTotalEdit}{sumaTotalEdit !== 100 && ' (debe sumar 100)'}
              </div>
            )}
            {figurasError && <div className="text-red-400 text-sm bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2">{figurasError}</div>}
            <div className="flex justify-end gap-2 pt-1">
              <Button variant="ghost" onClick={() => setEditandoFiguras(false)}>Cancelar</Button>
              <Button
                disabled={guardandoFiguras || (sorteo.modo_premio === 'porcentaje' && sumaTotalEdit !== 100)}
                onClick={guardarFiguras}
              >{guardandoFiguras ? 'Guardando...' : 'Guardar cambios'}</Button>
            </div>
          </div>
        )}
      </Card>

      <Card className="space-y-4">
        <h3 className="font-bold text-rose-100">🧾 Verificación de Ventas</h3>

        <div className="flex flex-wrap items-end gap-2">
          <div className="flex-1 min-w-[200px]">
            <Label>Números de Carta (separados por espacio o coma)</Label>
            <Input value={numerosInput} onChange={(e) => setNumerosInput(e.target.value)} placeholder="Ej: 1, 5, 12" />
          </div>
          <Button variant="success" onClick={confirmarPago}>✅ Confirmar Pago</Button>
          <Button variant="ghost" onClick={ponerDisponible}>♻️ Poner Disponible</Button>
          <Button variant="danger" onClick={liberarPendientes}>🧹 Liberar Pendientes</Button>
        </div>

        <div className="pt-3 border-t border-slate-700/50 flex flex-wrap items-end gap-2">
          <div className="min-w-[160px]">
            <Label>Nombre</Label>
            <Input value={asignarNombre} onChange={(e) => setAsignarNombre(e.target.value)} placeholder="Nombre completo" />
          </div>
          <div className="flex-1 min-w-[160px]">
            <Label>Números de Carta a Apartar</Label>
            <Input value={asignarNumerosInput} onChange={(e) => setAsignarNumerosInput(e.target.value)} placeholder="Ej: 3, 7" />
          </div>
          <Button onClick={asignarCarton} disabled={!asignarNombre.trim() || !asignarNumerosInput.trim()}>📌 Asignar/Apartar</Button>
        </div>
        {accionMsg && <div className="text-sm text-rose-300 bg-rose-500/10 border border-bingopurple/30 rounded-lg px-3 py-2">{accionMsg}</div>}
      </Card>

      <WhatsappLivePanel sorteoId={sorteoId} />

      <Card>
        <h3 className="font-bold text-rose-100 mb-3">Registro de Cartas Vendidas ({cartonesPorGrupo.size})</h3>
        {(
          <div className="space-y-2">
            {[...cartonesPorGrupo.entries()].sort((a, b) => a[0] - b[0]).map(([grupo, cards]) => {
              const abierto = conjuntosAbiertos.has(grupo);
              const pagado = cards.every((c) => c.estado === 'pagado');
              // El backend siempre identifica por Carta (grupo) — para venta
              // individual (sin combo), grupo y número físico son el mismo valor.
              const numerosConjunto = [grupo];
              const etiqueta = cards.length > 1 ? `🎫 Carta ${grupo}` : `#${cards[0].numero}`;
              return (
                <div key={grupo} className="bg-slate-800/40 rounded-lg overflow-hidden border border-slate-700/50 px-3 py-2">
                  <div className="flex items-center justify-between gap-2">
                    <button onClick={() => toggleConjuntoAbierto(grupo)} className="font-semibold text-rose-100 text-sm hover:opacity-80 transition">
                      {etiqueta}{pagado ? ' ⭐' : ''}
                    </button>
                    <div className="flex gap-1.5 shrink-0">
                      {!pagado && (
                        <Button variant="success" className="!px-2 !py-1 !text-xs" onClick={() => marcarPagado(numerosConjunto)}>✅ Pagado</Button>
                      )}
                      <Button
                        variant="ghost"
                        className="!px-2 !py-1 !text-xs"
                        onClick={() => { if (confirm(`¿Liberar ${etiqueta}? Quedará disponible para la venta de nuevo.`)) liberarNumeros(numerosConjunto); }}
                      >
                        ↩ Liberar
                      </Button>
                    </div>
                  </div>
                  <button onClick={() => toggleConjuntoAbierto(grupo)} className="w-full text-left text-slate-400 text-xs mt-0.5 hover:text-slate-300 transition">
                    {cards[0].owner_nombre || 'N/A'} · {abierto ? '▲ ocultar' : '▼ ver cartón'}
                  </button>
                  {abierto && (
                    <div className="mt-2 pt-2 border-t border-slate-700/50">
                      {cards.length > 1 ? (
                        <ComboCard grupo={grupo} color={cards[0].color} cartones={cards} />
                      ) : (
                        <div className="max-w-[220px]"><MiniCard carton={cards[0]} imagenUrl={cards[0].imagen_url} /></div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
            {!cartones.length && <span className="text-slate-500 text-sm">Todavía no hay cartones vendidos para este sorteo.</span>}
          </div>
        )}
      </Card>
    </div>
  );
}

// ===========================================================================
// ADMIN · MÓDULO DE CARTONES
// ===========================================================================
function AdminCartones() {
  const [sorteos, setSorteos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState(null);
  const [cartones, setCartones] = useState([]);
  const [loadingCartones, setLoadingCartones] = useState(false);

  useEffect(() => {
    apiFetch('/sorteos').then((d) => {
      setSorteos(d.sorteos);
      if (d.sorteos.length) setSelectedId(d.sorteos[0].id);
    }).finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!selectedId) { setCartones([]); return; }
    setLoadingCartones(true);
    apiFetch('/cartones?sorteo_id=' + selectedId).then((d) => setCartones(d.cartones)).finally(() => setLoadingCartones(false));
  }, [selectedId]);

  const disponibles = cartones.filter((c) => c.estado === 'disponible');
  const apartados = cartones.filter((c) => c.estado === 'vendido');
  const pagados = cartones.filter((c) => c.estado === 'pagado');
  const sorteoSel = sorteos.find((s) => s.id === selectedId);

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-bold text-rose-100">Cartones</h2>

      {loading ? <Spinner /> : !sorteos.length ? (
        <Card><span className="text-slate-500 text-sm">Todavía no hay sorteos creados. Los cartones se generan automáticamente al crear un sorteo (pestaña Sorteos).</span></Card>
      ) : (
        <>
          <Card>
            <Label>Sorteo</Label>
            <Select value={selectedId || ''} onChange={(e) => setSelectedId(Number(e.target.value))}>
              {sorteos.map((s) => (
                <option key={s.id} value={s.id}>#{s.id} · {s.fecha_hora} · {s.color} · {s.totalCartones} cartones</option>
              ))}
            </Select>
          </Card>

          {sorteoSel && (
            <Card>
              <div className="flex flex-wrap items-center gap-3 mb-4 text-sm">
                <Badge>Sorteo #{sorteoSel.id}</Badge>
                <span className="text-slate-400">{sorteoSel.fecha_hora}</span>
                <Badge>{sorteoSel.color}</Badge>
                <span className="text-slate-300 font-semibold">{sorteoSel.totalCartones} cartas en total</span>
              </div>
              {loadingCartones ? <Spinner /> : (
                <div className="grid md:grid-cols-3 gap-6">
                  <div>
                    <h3 className="font-bold text-emerald-300 mb-2">Disponibles ({disponibles.length})</h3>
                    <div className="flex flex-wrap gap-2 max-h-[420px] overflow-y-auto">
                      {disponibles.map((c) => <Badge key={c.id} tone="green">#{c.numero}</Badge>)}
                      {!disponibles.length && <span className="text-slate-500 text-sm">Sin cartones disponibles.</span>}
                    </div>
                  </div>
                  <div>
                    <h3 className="font-bold text-amber-300 mb-2">Apartados, sin pago verificado ({apartados.length})</h3>
                    <div className="flex flex-wrap gap-2 max-h-[420px] overflow-y-auto">
                      {apartados.map((c) => <Badge key={c.id} tone="yellow">#{c.numero}{c.owner_nombre ? ' · ' + c.owner_nombre : ''}</Badge>)}
                      {!apartados.length && <span className="text-slate-500 text-sm">Sin cartones apartados.</span>}
                    </div>
                  </div>
                  <div>
                    <h3 className="font-bold text-rose-300 mb-2">Pagados ⭐ ({pagados.length})</h3>
                    <div className="flex flex-wrap gap-2 max-h-[420px] overflow-y-auto">
                      {pagados.map((c) => <Badge key={c.id}>#{c.numero}{c.owner_nombre ? ' · ' + c.owner_nombre : ''}</Badge>)}
                      {!pagados.length && <span className="text-slate-500 text-sm">Sin cartones pagados.</span>}
                    </div>
                  </div>
                </div>
              )}
            </Card>
          )}
        </>
      )}
    </div>
  );
}

// ===========================================================================
// ADMIN · MÓDULO DE VENTAS Y GANANCIAS
// ===========================================================================
function AdminVentas() {
  const [kpis, setKpis] = useState(null);
  const [premios, setPremios] = useState([]);
  const [ganadores, setGanadores] = useState([]);
  const [historial, setHistorial] = useState([]);

  function load() {
    apiFetch('/ventas/kpis').then((d) => setKpis(d));
    apiFetch('/ventas/premios-activos').then((d) => setPremios(d.sorteos));
    apiFetch('/ventas/ganadores').then((d) => setGanadores(d.ganadores));
    apiFetch('/ventas/historial').then((d) => setHistorial(d.ventas));
  }
  useEffect(() => {
    socket.on('sorteos-cambio', load);
    return () => socket.off('sorteos-cambio', load);
  }, []);
  useEffect(load, []);

  async function pagar(id) { await apiFetch(`/ventas/ganadores/${id}/pagar`, { method: 'PUT' }); load(); }

  // Corrige un ganador registrado por error (cartón equivocado, figura equivocada).
  async function deshacer(g) {
    if (!confirm(`¿Deshacer este ganador? Se borrará el registro de "${g.patron}" — ${g.nombre || 'N/A'} (${money(g.premio)}).`)) return;
    await apiFetch(`/cartones/ganadores/${g.id}`, { method: 'DELETE' });
    load();
  }

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-bold text-rose-100">Ventas y Ganancias</h2>

      <div className="grid sm:grid-cols-1 lg:grid-cols-3 gap-4">
        <Card><div className="text-xs text-slate-400">Ventas del Mes</div><div className="text-2xl font-black text-rose-200">{kpis ? money(kpis.ventasMes) : '—'}</div></Card>
        <Card><div className="text-xs text-slate-400">Tu Ganancia del Mes</div><div className="text-2xl font-black text-emerald-400">{kpis ? money(kpis.gananciaMes) : '—'}</div></Card>
        <Card><div className="text-xs text-slate-400">Histórico Recaudado</div><div className="text-2xl font-black text-rose-200">{kpis ? money(kpis.historicoRecaudado) : '—'}</div></Card>
      </div>

      <Card>
        <h3 className="font-bold text-rose-100 mb-3">Premios Acumulados — Sorteos en Ejecución</h3>
        <div className="flex gap-3 overflow-x-auto">
          {premios.map((s) => (
            <div key={s.id} className="shrink-0 bg-slate-800/60 border border-bingopurple/30 rounded-xl px-4 py-3 min-w-[180px]">
              <div className="text-xs text-slate-400">#{s.id} · {s.color}</div>
              <div className="text-lg font-black text-rose-300">{money(s.premioAcumulado)}</div>
              <Badge tone={s.estatus === 'en_juego' ? 'yellow' : 'green'}>{s.estatus}</Badge>
            </div>
          ))}
          {!premios.length && <span className="text-slate-500 text-sm">No hay sorteos activos.</span>}
        </div>
      </Card>

      <Card className="overflow-x-auto">
        <h3 className="font-bold text-rose-100 mb-3">Ganadores Históricos</h3>
        <table className="w-full text-sm">
          <thead><tr className="text-left text-slate-400 border-b border-slate-800">
            <th className="py-2 pr-3">Sorteo</th><th className="py-2 pr-3">Usuario</th><th className="py-2 pr-3">Patrón</th><th className="py-2 pr-3">Premio</th><th className="py-2 pr-3">Fecha</th><th className="py-2 pr-3">Estado</th><th className="py-2 pr-3">Acción</th>
          </tr></thead>
          <tbody>
            {ganadores.map((g) => (
              <tr key={g.id} className="border-b border-slate-800/60 hover:bg-slate-800/30">
                <td className="py-2 pr-3">#{g.sorteo_id} · {g.color}</td>
                <td className="py-2 pr-3">{g.nombre}</td>
                <td className="py-2 pr-3 text-slate-400">{g.patron}</td>
                <td className="py-2 pr-3 font-semibold text-rose-300">{money(g.premio)}</td>
                <td className="py-2 pr-3 text-slate-400">{g.fecha}</td>
                <td className="py-2 pr-3"><Badge tone={g.pagado ? 'green' : 'yellow'}>{g.pagado ? 'Pagado' : 'Pendiente'}</Badge></td>
                <td className="py-2 pr-3">
                  <div className="flex gap-1.5">
                    {!g.pagado && <Button variant="success" className="!text-xs !px-2 !py-1" onClick={() => pagar(g.id)}>Marcar Pagado</Button>}
                    <Button variant="danger" className="!text-xs !px-2 !py-1" onClick={() => deshacer(g)}>🗑️ Deshacer</Button>
                  </div>
                </td>
              </tr>
            ))}
            {!ganadores.length && <tr><td colSpan="7" className="text-center text-slate-500 py-6">Aún no hay ganadores registrados.</td></tr>}
          </tbody>
        </table>
      </Card>

      <Card className="overflow-x-auto">
        <h3 className="font-bold text-rose-100 mb-3">Historial Detallado de Ventas</h3>
        <table className="w-full text-sm">
          <thead><tr className="text-left text-slate-400 border-b border-slate-800">
            <th className="py-2 pr-3">N° Transacción</th><th className="py-2 pr-3">Sorteo</th><th className="py-2 pr-3">Cartones</th><th className="py-2 pr-3">Usuario</th><th className="py-2 pr-3">Monto</th><th className="py-2 pr-3">Fecha</th><th className="py-2 pr-3">Estatus</th>
          </tr></thead>
          <tbody>
            {historial.map((v) => (
              <tr key={v.id} className="border-b border-slate-800/60 hover:bg-slate-800/30">
                <td className="py-2 pr-3 text-slate-400">{v.numero_transaccion}</td>
                <td className="py-2 pr-3">#{v.sorteo_id}</td>
                <td className="py-2 pr-3 text-slate-400">{v.cartones_ids.length} cartón(es)</td>
                <td className="py-2 pr-3">{v.nombre}</td>
                <td className="py-2 pr-3 font-semibold">{money(v.monto)}</td>
                <td className="py-2 pr-3 text-slate-400">{v.fecha}</td>
                <td className="py-2 pr-3"><Badge tone={v.estatus === 'completado' ? 'green' : 'gray'}>{v.estatus}</Badge></td>
              </tr>
            ))}
            {!historial.length && <tr><td colSpan="7" className="text-center text-slate-500 py-6">Sin ventas registradas.</td></tr>}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

// ===========================================================================
// ADMIN · MÓDULO DE JUGADORES (registros temporales, solo lectura)
// ===========================================================================
function AdminJugadores() {
  const [jugadores, setJugadores] = useState([]);
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(true);
  const [verCartones, setVerCartones] = useState(null);
  const [cartonesJugador, setCartonesJugador] = useState([]);

  function load() {
    setLoading(true);
    apiFetch('/jugadores' + (q ? '?q=' + encodeURIComponent(q) : '')).then((d) => setJugadores(d.jugadores)).finally(() => setLoading(false));
  }
  useEffect(load, [q]);

  async function eliminar(j) {
    if (!confirm(`¿Eliminar el registro de ${j.nombre}?`)) return;
    await apiFetch(`/jugadores/${j.id}`, { method: 'DELETE' });
    load();
  }
  async function abrirCartones(j) {
    setVerCartones(j);
    const d = await apiFetch(`/cartones/jugador/${j.id}`);
    setCartonesJugador(d.cartones);
  }

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-bold text-rose-100">Jugadores</h2>
      <p className="text-sm text-slate-400 -mt-4">Personas con cartones asignados por el administrador (botón "Asignar/Apartar" en cada sorteo).</p>

      <Card>
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-bold text-rose-100">Jugadores</h3>
          <Input placeholder="Buscar por nombre o WhatsApp..." className="w-64" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        {loading ? <Spinner /> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="text-left text-slate-400 border-b border-slate-800">
                <th className="py-2 pr-3">Nombre</th><th className="py-2 pr-3">WhatsApp</th><th className="py-2 pr-3">Comprado</th><th className="py-2 pr-3">Cartones Activos</th><th className="py-2 pr-3">Ingresó</th><th className="py-2 pr-3">Acciones</th>
              </tr></thead>
              <tbody>
                {jugadores.map((j) => (
                  <tr key={j.id} className="border-b border-slate-800/60 hover:bg-slate-800/30">
                    <td className="py-2 pr-3 font-semibold">{j.nombre}</td>
                    <td className="py-2 pr-3 text-slate-400">{j.whatsapp}</td>
                    <td className="py-2 pr-3 text-slate-400">{money(j.total_comprado)}</td>
                    <td className="py-2 pr-3"><button onClick={() => abrirCartones(j)} className="text-rose-300 underline">{j.cartones_activos} cartón(es)</button></td>
                    <td className="py-2 pr-3 text-slate-400">{j.created_at}</td>
                    <td className="py-2 pr-3">
                      <Button variant="danger" onClick={() => eliminar(j)}>🗑️</Button>
                    </td>
                  </tr>
                ))}
                {!jugadores.length && <tr><td colSpan="6" className="text-center text-slate-500 py-8">Sin jugadores registrados.</td></tr>}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {verCartones && (
        <Modal title={`Cartones de ${verCartones.nombre}`} onClose={() => setVerCartones(null)} wide>
          <div className="grid sm:grid-cols-2 gap-3">
            {[...new Map(cartonesJugador.map((c) => [c.grupo, c])).keys()].map((grupo) => {
              const cards = cartonesJugador.filter((c) => c.grupo === grupo);
              return cards.length > 1 ? (
                <ComboCard key={grupo} grupo={grupo} color={cards[0].color} cartones={cards} />
              ) : (
                <MiniCard key={grupo} carton={cards[0]} imagenUrl={cards[0].imagen_url} />
              );
            })}
            {!cartonesJugador.length && <span className="text-slate-500 text-sm">Este jugador no tiene cartones activos.</span>}
          </div>
        </Modal>
      )}
    </div>
  );
}

// ===========================================================================
// LAYOUT ADMIN
// ===========================================================================
function AdminConfiguracion() {
  const { user } = useAuth();
  const { whatsappLink, refresh, logoUrl, refreshLogo } = useSettings();
  const [link, setLink] = useState(whatsappLink);
  const [guardando, setGuardando] = useState(false);
  const [msg, setMsg] = useState('');
  useEffect(() => { setLink(whatsappLink); }, [whatsappLink]);

  const [logoFile, setLogoFile] = useState(null);
  const [logoPreview, setLogoPreview] = useState('');
  const [subiendoLogo, setSubiendoLogo] = useState(false);
  const [msgLogo, setMsgLogo] = useState('');

  const [usuarios, setUsuarios] = useState([]);
  const [nuevoUsuario, setNuevoUsuario] = useState('');
  const [nuevaClave, setNuevaClave] = useState('');
  const [creandoUsuario, setCreandoUsuario] = useState(false);
  const [msgUsuario, setMsgUsuario] = useState('');
  const [editandoClaveId, setEditandoClaveId] = useState(null);
  const [claveNueva, setClaveNueva] = useState('');
  const [guardandoClave, setGuardandoClave] = useState(false);

  function cargarUsuarios() {
    apiFetch('/auth/usuarios').then((d) => setUsuarios(d.usuarios));
  }
  useEffect(() => { cargarUsuarios(); }, []);

  async function crearUsuario() {
    setCreandoUsuario(true);
    setMsgUsuario('');
    try {
      await apiFetch('/auth/usuarios', { method: 'POST', body: JSON.stringify({ username: nuevoUsuario, password: nuevaClave }) });
      setNuevoUsuario('');
      setNuevaClave('');
      setMsgUsuario('✅ Usuario creado');
      cargarUsuarios();
      setTimeout(() => setMsgUsuario(''), 2000);
    } catch (e) { setMsgUsuario(e.message); }
    finally { setCreandoUsuario(false); }
  }

  async function cambiarClaveUsuario(id) {
    if (!claveNueva || claveNueva.length < 6) { setMsgUsuario('La contraseña debe tener al menos 6 caracteres'); return; }
    setGuardandoClave(true);
    setMsgUsuario('');
    try {
      await apiFetch(`/auth/usuarios/${id}/password`, { method: 'PUT', body: JSON.stringify({ password: claveNueva }) });
      setEditandoClaveId(null);
      setClaveNueva('');
      setMsgUsuario('✅ Contraseña actualizada');
      setTimeout(() => setMsgUsuario(''), 2000);
    } catch (e) { setMsgUsuario(e.message); }
    finally { setGuardandoClave(false); }
  }

  async function eliminarUsuario(u) {
    if (!confirm(`¿Eliminar el usuario "${u.username}"? No vas a poder deshacer esto.`)) return;
    setMsgUsuario('');
    try {
      await apiFetch(`/auth/usuarios/${u.id}`, { method: 'DELETE' });
      cargarUsuarios();
    } catch (e) { setMsgUsuario(e.message); }
  }

  async function guardar() {
    setGuardando(true);
    setMsg('');
    try {
      await apiFetch('/settings/whatsapp', { method: 'PUT', body: JSON.stringify({ link }) });
      await refresh();
      setMsg('✅ Link guardado');
      setTimeout(() => setMsg(''), 2000);
    } catch (e) { setMsg(e.message); }
    finally { setGuardando(false); }
  }

  function elegirLogo(e) {
    const f = e.target.files[0];
    setLogoFile(f || null);
    setLogoPreview(f ? URL.createObjectURL(f) : '');
  }

  async function subirLogo() {
    if (!logoFile) return;
    setSubiendoLogo(true);
    setMsgLogo('');
    try {
      const fd = new FormData();
      fd.append('logo', logoFile);
      await apiFetch('/settings/logo', { method: 'POST', body: fd });
      await refreshLogo();
      setLogoFile(null);
      setLogoPreview('');
      setMsgLogo('✅ Logo actualizado');
      setTimeout(() => setMsgLogo(''), 2000);
    } catch (e) { setMsgLogo(e.message); }
    finally { setSubiendoLogo(false); }
  }

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-bold text-rose-100">Configuración</h2>
      <Card className="space-y-3 max-w-xl">
        <div>
          <Label>Link del grupo de WhatsApp</Label>
          <Input value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://chat.whatsapp.com/xxxxxxxx" />
          <p className="text-xs text-slate-500 mt-1">Este botón aparece a los jugadores al comprar cartones y al ganar un BINGO.</p>
        </div>
        {msg && <div className="text-sm text-emerald-400">{msg}</div>}
        <Button disabled={guardando} onClick={guardar}>{guardando ? 'Guardando...' : 'Guardar'}</Button>
      </Card>

      <Card className="space-y-3 max-w-xl">
        <div>
          <Label>Logo del sitio</Label>
          <p className="text-xs text-slate-500 mb-2">Se muestra en la pantalla de acceso, en el menú lateral y en el centro (LIBRE) de todos los cartones.</p>
          <div className="flex items-center gap-4">
            <img src={logoPreview || logoUrl || 'logo.png'} alt="Logo actual" className="w-16 h-16 rounded-full object-cover border-2 border-bingoaccent shrink-0" />
            <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={elegirLogo} className="text-sm text-slate-300" />
          </div>
        </div>
        {msgLogo && <div className="text-sm text-emerald-400">{msgLogo}</div>}
        <Button disabled={!logoFile || subiendoLogo} onClick={subirLogo}>{subiendoLogo ? 'Subiendo...' : 'Subir logo'}</Button>
      </Card>

      <Card className="space-y-3 max-w-xl">
        <Label>Usuarios administradores</Label>
        <div className="space-y-2">
          {usuarios.map((u) => (
            <div key={u.id} className="bg-slate-800/40 rounded-lg px-3 py-2 space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Badge tone="gray">{u.username}{u.id === user.id ? ' (vos)' : ''}</Badge>
                <div className="flex gap-1.5">
                  <Button variant="ghost" className="!px-2 !py-1 !text-xs" onClick={() => { setEditandoClaveId(editandoClaveId === u.id ? null : u.id); setClaveNueva(''); }}>🔑 Cambiar clave</Button>
                  <Button
                    variant="danger"
                    className="!px-2 !py-1 !text-xs"
                    disabled={u.id === user.id || usuarios.length <= 1}
                    onClick={() => eliminarUsuario(u)}
                  >🗑️ Eliminar</Button>
                </div>
              </div>
              {editandoClaveId === u.id && (
                <div className="flex flex-wrap items-center gap-2">
                  <Input
                    className="flex-1 min-w-[160px]"
                    value={claveNueva}
                    onChange={(e) => setClaveNueva(e.target.value)}
                    type="password"
                    placeholder="Nueva contraseña (mín. 6 caracteres)"
                  />
                  <Button variant="success" className="!px-3 !py-1.5 !text-xs" disabled={guardandoClave} onClick={() => cambiarClaveUsuario(u.id)}>
                    {guardandoClave ? 'Guardando...' : 'Guardar'}
                  </Button>
                </div>
              )}
            </div>
          ))}
        </div>
        <div className="grid sm:grid-cols-2 gap-3">
          <Input value={nuevoUsuario} onChange={(e) => setNuevoUsuario(e.target.value)} placeholder="Nombre de usuario" />
          <Input value={nuevaClave} onChange={(e) => setNuevaClave(e.target.value)} type="password" placeholder="Contraseña (mín. 6 caracteres)" />
        </div>
        {msgUsuario && <div className={`text-sm ${msgUsuario.startsWith('✅') ? 'text-emerald-400' : 'text-red-400'}`}>{msgUsuario}</div>}
        <Button disabled={!nuevoUsuario || !nuevaClave || creandoUsuario} onClick={crearUsuario}>{creandoUsuario ? 'Creando...' : '+ Crear usuario admin'}</Button>
      </Card>
    </div>
  );
}
// Catálogo persistente de cartones personalizados: el admin le pone nombre y
// color a un set de imágenes ya diseñadas, y pega los links en orden (línea 1
// = cartón #1, línea 2 = #2, etc.). Un sorteo puede asignar uno de estos
// catálogos para que sus cartones muestren la imagen real en vez del grid
// calculado al azar (ver MiniCard/ComboCard, prop `imagenUrl`).
function AdminCatalogos() {
  const [catalogos, setCatalogos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editando, setEditando] = useState(null); // null = cerrado, {} = nuevo, objeto = editando uno existente
  const [nombre, setNombre] = useState('');
  const [color, setColor] = useState(COLORS[0]);
  const [texto, setTexto] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');

  function load() {
    setLoading(true);
    apiFetch('/catalogos-imagenes').then((d) => setCatalogos(d.catalogos)).finally(() => setLoading(false));
  }
  useEffect(load, []);

  const urls = useMemo(() => texto.split('\n').map((s) => s.trim()).filter(Boolean), [texto]);

  function nuevoCatalogo() {
    setError('');
    setNombre('');
    setColor(COLORS[0]);
    setTexto('');
    setEditando({});
  }

  async function editarCatalogo(c) {
    setError('');
    const d = await apiFetch(`/catalogos-imagenes/${c.id}`);
    setNombre(d.catalogo.nombre);
    setColor(d.catalogo.color);
    setTexto(d.catalogo.items.map((i) => i.url).join('\n'));
    setEditando(d.catalogo);
  }

  async function guardar() {
    setError('');
    setGuardando(true);
    try {
      const body = { nombre, color, urls };
      if (editando?.id) {
        await apiFetch(`/catalogos-imagenes/${editando.id}`, { method: 'PUT', body: JSON.stringify(body) });
      } else {
        await apiFetch('/catalogos-imagenes', { method: 'POST', body: JSON.stringify(body) });
      }
      setEditando(null);
      load();
    } catch (e) { setError(e.message); }
    finally { setGuardando(false); }
  }

  async function eliminar(c) {
    if (!confirm(`¿Eliminar el catálogo "${c.nombre}"? Los sorteos que lo usan volverán a mostrar el grid calculado.`)) return;
    await apiFetch(`/catalogos-imagenes/${c.id}`, { method: 'DELETE' });
    load();
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="text-xl font-bold text-rose-100">Cartones Personalizados</h2>
          <p className="text-sm text-slate-400">Sets de imágenes reales de cartones — un link por línea, en orden (línea 1 = cartón #1, línea 2 = #2, etc.).</p>
        </div>
        {!editando && <Button onClick={nuevoCatalogo}>+ Nuevo catálogo</Button>}
      </div>

      {editando && (
        <Card className="space-y-3">
          <h3 className="font-bold text-rose-100">{editando.id ? `Editar "${editando.nombre}"` : 'Nuevo catálogo'}</h3>
          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <Label>Nombre</Label>
              <Input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Ej: Verdes JY" />
            </div>
            <div>
              <Label>Color</Label>
              <Select value={color} onChange={(e) => setColor(e.target.value)}>
                {COLORS.map((c) => <option key={c} value={c}>{c}</option>)}
              </Select>
            </div>
          </div>
          <div>
            <Label>Links de las imágenes (uno por línea, en orden)</Label>
            <textarea
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              rows={10}
              placeholder={'https://raw.githubusercontent.com/usuario/repo/main/1.jpg\nhttps://raw.githubusercontent.com/usuario/repo/main/2.jpg\n...'}
              className="w-full bg-slate-800/70 border border-slate-700 focus:border-bingoaccent focus:outline-none rounded-lg px-3 py-2 text-xs text-slate-100 placeholder-slate-500 font-mono"
            />
            <p className="text-xs text-slate-500 mt-1">{urls.length} link(s) detectado(s).</p>
          </div>
          {error && <div className="text-red-400 text-sm bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2">{error}</div>}
          <div className="flex gap-2">
            <Button disabled={guardando || !nombre.trim() || !urls.length} onClick={guardar}>{guardando ? 'Guardando...' : 'Guardar'}</Button>
            <Button variant="ghost" onClick={() => setEditando(null)}>Cancelar</Button>
          </div>
        </Card>
      )}

      <Card>
        {loading ? <Spinner /> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="text-left text-slate-400 border-b border-slate-800">
                <th className="py-2 pr-3">Nombre</th><th className="py-2 pr-3">Color</th><th className="py-2 pr-3">Imágenes</th><th className="py-2 pr-3">Acciones</th>
              </tr></thead>
              <tbody>
                {catalogos.map((c) => (
                  <tr key={c.id} className="border-b border-slate-800/60 hover:bg-slate-800/30">
                    <td className="py-2 pr-3 font-semibold">{c.nombre}</td>
                    <td className="py-2 pr-3 text-slate-400">{c.color}</td>
                    <td className="py-2 pr-3 text-slate-400">{c.total_imagenes}</td>
                    <td className="py-2 pr-3">
                      <div className="flex gap-1.5">
                        <Button variant="ghost" className="!text-xs !px-2 !py-1" onClick={() => editarCatalogo(c)}>✏️ Editar</Button>
                        <Button variant="danger" className="!text-xs !px-2 !py-1" onClick={() => eliminar(c)}>🗑️</Button>
                      </div>
                    </td>
                  </tr>
                ))}
                {!catalogos.length && <tr><td colSpan="4" className="text-center text-slate-500 py-8">Todavía no hay catálogos creados.</td></tr>}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

// Configuración + previsualización en vivo de los mensajes de WhatsApp
// (Disponibles/Pendientes/Lista completa) armados por sorteos.js. Vive DENTRO
// del panel de cada sorteo (SorteoDrawPanel), no como sección aparte — junto
// a la config global (headers/emoji), que también se edita acá mismo. La
// lista/burbuja quedan siempre visibles — lo único que se minimiza (arranca
// minimizado) es la tarjeta de Configuración de Textos, que se usa poco y no
// debe ocuparle pantalla al admin mientras usa el resto del panel.
//
// El texto se arma acá mismo, en el cliente (no por round-trip al servidor en
// cada tecla) para que la burbuja cambie al instante mientras se edita,
// incluso antes de guardar — por eso textoTodo/textoLibres/textoDeudas son un
// mirror de lista-texto/disponibles-texto/pendientes-texto en
// backend/routes/sorteos.js: si se edita el formato de una, hay que editar
// la otra para que no se desalineen.
function WhatsappLivePanel({ sorteoId }) {
  const { logoUrl } = useSettings();
  const [configMinimizada, setConfigMinimizada] = useState(true);
  const [datos, setDatos] = useState(null);
  const [config, setConfig] = useState(null);
  const [encabezado, setEncabezado] = useState('');
  const [piePagina, setPiePagina] = useState('');
  const [subTab, setSubTab] = useState('todo');
  const [busqueda, setBusqueda] = useState('');
  const [copiado, setCopiado] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [msg, setMsg] = useState('');

  // Sin join-sorteo/leave-sorteo acá: SorteoDrawPanel (el padre) ya se
  // suscribió a la sala de este sorteo — este widget solo escucha en el mismo
  // socket. La lista/preview están siempre activas mientras el panel del
  // sorteo esté abierto (no dependen de si la config está minimizada).
  useEffect(() => {
    if (!sorteoId) return;
    setDatos(null);
    apiFetch('/settings/whatsapp-live').then(setConfig);
    // Semilla el encabezado/pie del sorteo una sola vez por apertura (no en
    // cada refresco de los 5s) para no pisar lo que el admin esté escribiendo.
    let primeraCarga = true;
    const cargarDatos = () => apiFetch(`/sorteos/${sorteoId}/whatsapp-live-datos`).then((d) => {
      setDatos(d);
      if (primeraCarga) {
        setEncabezado(d.sorteo.encabezado || '');
        setPiePagina(d.sorteo.pie_pagina || '');
        primeraCarga = false;
      }
    });
    cargarDatos();
    const onCambio = (p) => { if (p.sorteoId == sorteoId) cargarDatos(); };
    socket.on('cartones-actualizados', onCambio);
    socket.on('cartones-vendidos', onCambio);
    socket.on('connect', cargarDatos);
    const onVisible = () => { if (document.visibilityState === 'visible') cargarDatos(); };
    document.addEventListener('visibilitychange', onVisible);
    const interval = setInterval(cargarDatos, 5000);
    return () => {
      socket.off('cartones-actualizados', onCambio);
      socket.off('cartones-vendidos', onCambio);
      socket.off('connect', cargarDatos);
      document.removeEventListener('visibilitychange', onVisible);
      clearInterval(interval);
    };
  }, [sorteoId]);

  function setCampo(key, value) {
    setConfig((c) => ({ ...c, [key]: value }));
  }

  async function guardarConfig() {
    setGuardando(true);
    setMsg('');
    try {
      const [actualizado] = await Promise.all([
        apiFetch('/settings/whatsapp-live', { method: 'PUT', body: JSON.stringify(config) }),
        apiFetch('/sorteos/' + sorteoId, { method: 'PUT', body: JSON.stringify({ encabezado, pie_pagina: piePagina }) }),
      ]);
      delete actualizado.ok;
      setConfig(actualizado);
      setMsg('✅ Configuración guardada');
      setTimeout(() => setMsg(''), 2000);
    } catch (e) { setMsg(e.message); }
    finally { setGuardando(false); }
  }

  async function copiarTexto(tab, texto) {
    await navigator.clipboard.writeText(texto);
    setCopiado(tab);
    setTimeout(() => setCopiado(''), 1500);
  }

  const conjuntos = datos?.conjuntos || [];

  // mirror de lista-texto (backend/routes/sorteos.js) — mantener en sync
  function textoTodo() {
    if (!config) return '';
    const linea = (g) => {
      const num = g.etiquetaEmoji;
      if (g.disponible) return num;
      const marca = g.pagado ? ` ${config.pagado_emoji}` : ` ${config.pendiente_emoji}`;
      return `${num} ${g.nombre || ''}${marca}`;
    };
    const cuerpo = conjuntos.map(linea).join('\n');
    return [encabezado, '', cuerpo, '', piePagina].filter((s) => s !== undefined && s !== null).join('\n').trim();
  }

  // mirror de disponibles-texto
  function textoLibres() {
    if (!config) return '';
    const disponibles = conjuntos.filter((g) => g.disponible);
    const total = disponibles.length;
    const enc = config.disponibles_encabezado.replace(/\{color\}/gi, (datos?.sorteo?.color || '').toUpperCase());
    let texto = `${enc}\n\n`;
    if (total) texto += `*Quedan ${total} cartones libres:*\n\n`;
    texto += total ? disponibles.map((g) => g.etiquetaEmoji).join('\n') : 'No quedan cartones disponibles.';
    if (total) texto += `\n\n${config.disponibles_pie}`;
    return texto.trim();
  }

  // mirror de pendientes-texto
  function textoDeudas() {
    if (!config) return '';
    const pendientes = conjuntos.filter((g) => !g.disponible && !g.pagado);
    const total = pendientes.length;
    const linea = (g) => `${g.etiquetaEmoji} ${(g.nombre || 'N/A').toUpperCase()} ${config.pendiente_emoji}`;
    let texto = `${config.pendientes_encabezado}\n\n`;
    if (total) texto += `*Pendientes por pagar: ${total} cartones:*\n\n`;
    texto += total ? pendientes.map(linea).join('\n') : 'No hay cartones pendientes de pago.';
    if (total) texto += `\n\n${config.pendientes_pie}`;
    return texto.trim();
  }

  const totalPendientes = conjuntos.filter((g) => !g.disponible && !g.pagado).length;
  const resultadosNombres = conjuntos.filter((g) => g.nombre && g.nombre.toLowerCase().includes(busqueda.trim().toLowerCase()));
  const TABS = [['todo', 'Todo'], ['libres', 'Libres'], ['deudas', 'Deudas'], ['nombres', 'Nombres']];
  const textareaClass = 'w-full bg-slate-800/70 border border-slate-700 focus:border-bingoaccent focus:outline-none rounded-lg px-3 py-2 text-sm text-slate-100 placeholder-slate-500';
  const textoTabActual = subTab === 'todo' ? textoTodo() : subTab === 'libres' ? textoLibres() : subTab === 'deudas' ? textoDeudas() : '';

  return (
    <Card className="space-y-3">
      <h3 className="font-bold text-rose-100 flex items-center gap-1.5">
        <svg viewBox="0 0 24 24" className="w-4 h-4 shrink-0" fill="#25D366"><path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.79.47 3.47 1.29 4.93L2 22l5.25-1.38c1.41.77 3.02 1.21 4.79 1.21 5.46 0 9.91-4.45 9.91-9.91C21.95 6.45 17.5 2 12.04 2zm5.61 14.02c-.23.65-1.36 1.28-1.87 1.35-.51.07-1.02.31-3.43-.72-2.9-1.24-4.77-4.24-4.91-4.44-.14-.2-1.17-1.56-1.17-2.98 0-1.42.75-2.11 1.02-2.4.27-.29.58-.36.78-.36.2 0 .39 0 .56.01.18.01.42-.07.66.5.24.58.83 1.99.9 2.13.07.14.12.31.02.5-.1.19-.15.31-.3.48-.15.17-.31.38-.44.51-.15.15-.3.31-.13.6.17.29.75 1.24 1.61 2.01 1.11.99 2.04 1.3 2.33 1.44.29.14.46.12.63-.07.17-.19.72-.84.91-1.13.19-.29.38-.24.64-.14.26.1 1.65.78 1.93.92.28.14.47.21.54.33.07.12.07.68-.16 1.33z"/></svg>
        Lista de WhatsApp
      </h3>

      <div className="flex gap-2">
        {TABS.map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setSubTab(key)}
            className={`flex-1 text-sm rounded-xl py-2 border transition ${subTab === key ? 'bg-bingopurple/30 border-bingoaccent text-white' : 'border-slate-700 text-slate-400 hover:text-slate-200'}`}
          >
            {label}
          </button>
        ))}
      </div>

      {(!datos || !config) ? <Spinner /> : (
        <>
          {subTab !== 'nombres' && (
            <div className="flex items-center justify-between gap-2">
              {subTab === 'deudas'
                ? <p className="text-xs text-slate-400">Pendientes por pagar: <b>{totalPendientes}</b> cartones</p>
                : <span />}
              <Button variant="ghost" className="!py-2 !px-5 text-sm" onClick={() => copiarTexto(subTab, textoTabActual)}>
                {copiado === subTab ? '✅ Copiado' : '📋 Copiar'}
              </Button>
            </div>
          )}

          <WhatsappChatFrame titulo="Bingo la Negra" subtitulo="En línea" logoUrl={logoUrl}>
            {subTab === 'nombres' ? (
              <div className="space-y-2">
                <Input value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Buscar participante..." />
                <div className="max-h-72 overflow-y-auto space-y-1.5 pr-1">
                  {busqueda.trim() && resultadosNombres.length === 0 && (
                    <p className="text-sm text-slate-600 text-center bg-white/70 rounded-lg py-2">Sin resultados.</p>
                  )}
                  {resultadosNombres.map((g) => (
                    <div key={g.grupo} className="flex items-center justify-between gap-2 bg-white/80 rounded-lg px-3 py-1.5 text-sm">
                      <span className="text-slate-800">{g.nombre}</span>
                      <span className="flex items-center gap-1.5 shrink-0">
                        <Badge tone="gray">{g.etiquetaEmoji}</Badge>
                        {g.pagado ? (
                          <span className="text-emerald-600 text-xs">{config.pagado_emoji} Pagado</span>
                        ) : (
                          <span className="text-amber-600 text-xs">{config.pendiente_emoji} Pendiente</span>
                        )}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <WhatsappBubble texto={textoTabActual} />
            )}
          </WhatsappChatFrame>
        </>
      )}

      <div className="pt-2 border-t border-slate-700/50">
        <div className="flex items-center justify-between">
          <h4 className="text-sm font-semibold text-slate-300">⚙️ Configuración de Textos</h4>
          <Button variant="ghost" className="!py-1 !px-3 text-xs" onClick={() => setConfigMinimizada((m) => !m)}>
            {configMinimizada ? '▼ Mostrar' : '▲ Minimizar'}
          </Button>
        </div>

        {!configMinimizada && (!config ? <Spinner /> : (
          <div className="space-y-4 mt-3">
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <Label>Encabezado — Todo (Lista Completa)</Label>
                <textarea rows={2} value={encabezado} onChange={(e) => setEncabezado(e.target.value)}
                  placeholder="Ej: *BINGO MORADO — Hoy 8pm*" className={textareaClass} />
              </div>
              <div>
                <Label>Pie de página — Todo</Label>
                <textarea rows={2} value={piePagina} onChange={(e) => setPiePagina(e.target.value)}
                  placeholder="Ej: Pagos por Pago Móvil al 0412-0000000" className={textareaClass} />
              </div>
              <div>
                <Label>Encabezado — Disponibles</Label>
                <textarea rows={2} value={config.disponibles_encabezado} onChange={(e) => setCampo('disponibles_encabezado', e.target.value)}
                  placeholder="Ej: 🎰 *CARTONES DISPONIBLES — {color}* 🎰" className={textareaClass} />
                <p className="text-xs text-slate-500 mt-1">{'Usá {color} para el color del sorteo.'}</p>
              </div>
              <div>
                <Label>Pie de página — Disponibles</Label>
                <textarea rows={2} value={config.disponibles_pie} onChange={(e) => setCampo('disponibles_pie', e.target.value)} className={textareaClass} />
              </div>
              <div>
                <Label>Encabezado — Pendientes</Label>
                <textarea rows={2} value={config.pendientes_encabezado} onChange={(e) => setCampo('pendientes_encabezado', e.target.value)} className={textareaClass} />
              </div>
              <div>
                <Label>Pie de página — Pendientes</Label>
                <textarea rows={2} value={config.pendientes_pie} onChange={(e) => setCampo('pendientes_pie', e.target.value)} className={textareaClass} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 max-w-[340px]">
              <div>
                <Label>Emoji — Pagado</Label>
                <Input value={config.pagado_emoji} onChange={(e) => setCampo('pagado_emoji', e.target.value)} />
              </div>
              <div>
                <Label>Emoji — Pendiente</Label>
                <Input value={config.pendiente_emoji} onChange={(e) => setCampo('pendiente_emoji', e.target.value)} />
              </div>
            </div>
            {msg && <div className={`text-sm ${msg.startsWith('✅') ? 'text-emerald-400' : 'text-red-400'}`}>{msg}</div>}
            <Button disabled={guardando} onClick={guardarConfig}>{guardando ? 'Guardando...' : 'Guardar configuración'}</Button>
          </div>
        ))}
      </div>
    </Card>
  );
}

function AdminApp() {
  const [tab, setTab] = useState('sorteos');
  const tabs = [
    { key: 'sorteos', label: 'Sorteos', icon: '🎯' },
    { key: 'cartones', label: 'Cartones', icon: '🎫' },
    { key: 'catalogos', label: 'Cartones Personalizados', icon: '🖼️' },
    { key: 'ventas', label: 'Ventas', icon: '💹' },
    { key: 'jugadores', label: 'Jugadores', icon: '👥' },
    { key: 'config', label: 'Configuración', icon: '⚙️' },
  ];
  return (
    <Shell title="Panel de Administración" tabs={tabs} active={tab} onTab={setTab} right={<TopUserMenu />}>
      {tab === 'sorteos' && <AdminSorteos />}
      {tab === 'cartones' && <AdminCartones />}
      {tab === 'catalogos' && <AdminCatalogos />}
      {tab === 'ventas' && <AdminVentas />}
      {tab === 'jugadores' && <AdminJugadores />}
      {tab === 'config' && <AdminConfiguracion />}
    </Shell>
  );
}

// ===========================================================================
// RAÍZ DE LA APLICACIÓN
// ===========================================================================
function Root() {
  const { user, loading } = useAuth();
  if (loading) return <div className="min-h-screen flex items-center justify-center"><Spinner /></div>;
  if (!user) return <AuthScreen />;
  return <AdminApp />;
}

function App() {
  return (
    <AuthProvider>
      <SettingsProvider>
        <Root />
      </SettingsProvider>
    </AuthProvider>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
