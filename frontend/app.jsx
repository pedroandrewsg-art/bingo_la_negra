// app.js — Frontend del Sistema de Bingo Virtual Automatizado (React sin build, vía CDN + Babel standalone)
const { useState, useEffect, useContext, createContext, useMemo, useRef } = React;

const API_BASE = window.BINGO_API_BASE || 'http://localhost:4000/api';
const SOCKET_BASE = API_BASE.replace(/\/api\/?$/, '');
const socket = io(SOCKET_BASE, { autoConnect: true, transports: ['websocket', 'polling'] });

// Paleta ampliada a propósito (20 colores) — cada color del sorteo es
// independiente del tema visual del cartón (ver CARD_THEMES/TemaCartonPicker
// más abajo), así que cuantos más colores haya para combinar con los ~73
// temas, más variedad real de apariencia entre sorteos distintos.
const COLORS = [
  'Verde', 'Morado', 'Amarillo', 'Azul', 'Rojo', 'Naranja', 'Negro',
  'Rosa', 'Fucsia', 'Turquesa', 'Celeste', 'Índigo', 'Dorado', 'Plateado',
  'Blanco', 'Vino', 'Lima', 'Menta', 'Marrón', 'Gris',
];
const COMBOS = [1, 2, 3, 4];

// Espejo de DEPENDENCIAS_FIGURAS en backend/routes/sorteos.js: "Picado" solo
// se puede elegir si también se elige su figura base (Cartón Lleno) -- se
// valida acá además de en el servidor para dar el error al instante, antes
// de mandar el form.
const DEPENDENCIAS_FIGURAS = { carton_lleno_picado: 'carton_lleno' };

// Estilo decorativo de cartón según el color asignado al sorteo/lote — NO
// es el tema visual (ver CARD_THEMES): esto solo define la "bolita" de los
// números marcados (style.mark) y, en modo "Sin tema", también el borde y
// la barra de encabezado del cartón (style.border/style.header).
// `markText` = color de texto legible sobre el degradado `mark` — la mayoría
// son oscuros y usan texto blanco, pero los colores claros (Blanco, Plateado,
// Dorado, Lima, Menta, Amarillo) necesitan texto oscuro o quedan casi
// invisibles (ej. "Carta 1" en blanco sobre un cartón Blanco).
const CARD_COLOR_STYLES = {
  Verde: { border: 'border-emerald-500/60', header: 'bg-emerald-500/20 text-emerald-300', mark: 'from-emerald-500 to-emerald-700', markText: 'text-white' },
  Morado: { border: 'border-violet-500/60', header: 'bg-violet-500/20 text-violet-300', mark: 'from-violet-500 to-purple-700', markText: 'text-white' },
  Amarillo: { border: 'border-amber-500/60', header: 'bg-amber-500/20 text-amber-300', mark: 'from-amber-400 to-amber-600', markText: 'text-slate-900' },
  Azul: { border: 'border-blue-500/60', header: 'bg-blue-500/20 text-blue-300', mark: 'from-blue-500 to-blue-700', markText: 'text-white' },
  Rojo: { border: 'border-red-500/60', header: 'bg-red-500/20 text-red-300', mark: 'from-red-500 to-red-700', markText: 'text-white' },
  Naranja: { border: 'border-orange-500/60', header: 'bg-orange-500/20 text-orange-300', mark: 'from-orange-500 to-orange-700', markText: 'text-white' },
  Negro: { border: 'border-slate-500/60', header: 'bg-slate-700/40 text-slate-200', mark: 'from-slate-600 to-slate-900', markText: 'text-white' },
  Rosa: { border: 'border-pink-500/60', header: 'bg-pink-500/20 text-pink-300', mark: 'from-pink-500 to-pink-700', markText: 'text-white' },
  Fucsia: { border: 'border-fuchsia-500/60', header: 'bg-fuchsia-500/20 text-fuchsia-300', mark: 'from-fuchsia-500 to-fuchsia-700', markText: 'text-white' },
  Turquesa: { border: 'border-teal-500/60', header: 'bg-teal-500/20 text-teal-300', mark: 'from-teal-400 to-teal-600', markText: 'text-white' },
  Celeste: { border: 'border-cyan-500/60', header: 'bg-cyan-500/20 text-cyan-300', mark: 'from-cyan-400 to-cyan-600', markText: 'text-white' },
  Índigo: { border: 'border-indigo-500/60', header: 'bg-indigo-500/20 text-indigo-300', mark: 'from-indigo-500 to-indigo-700', markText: 'text-white' },
  Dorado: { border: 'border-yellow-500/60', header: 'bg-yellow-500/20 text-yellow-200', mark: 'from-yellow-300 to-amber-500', markText: 'text-slate-900' },
  Plateado: { border: 'border-zinc-400/60', header: 'bg-zinc-400/20 text-zinc-200', mark: 'from-zinc-300 to-zinc-500', markText: 'text-slate-900' },
  Blanco: { border: 'border-slate-300/60', header: 'bg-slate-200/20 text-slate-100', mark: 'from-slate-100 to-slate-300', markText: 'text-slate-900' },
  Vino: { border: 'border-rose-800/60', header: 'bg-rose-800/20 text-rose-300', mark: 'from-rose-700 to-rose-900', markText: 'text-white' },
  Lima: { border: 'border-lime-500/60', header: 'bg-lime-500/20 text-lime-300', mark: 'from-lime-400 to-lime-600', markText: 'text-slate-900' },
  Menta: { border: 'border-emerald-300/60', header: 'bg-emerald-300/20 text-emerald-200', mark: 'from-teal-300 to-emerald-400', markText: 'text-slate-900' },
  Marrón: { border: 'border-amber-800/60', header: 'bg-amber-800/20 text-amber-300', mark: 'from-amber-700 to-amber-900', markText: 'text-white' },
  Gris: { border: 'border-gray-500/60', header: 'bg-gray-500/20 text-gray-300', mark: 'from-gray-500 to-gray-700', markText: 'text-white' },
};
const DEFAULT_CARD_STYLE = { border: 'border-bingopurple/30', header: 'bg-slate-900 text-fuchsia-300', mark: 'from-bingopurple to-bingoaccent', markText: 'text-white' };

// Temas visuales del cartón — SOLO decorativos (encabezado B-I-N-G-O + ícono
// de la casilla LIBRE), independientes de `color` (que es dato de negocio:
// precio/catálogo del sorteo). El admin elige uno en Configuración (ver
// TemaCartonPicker) y aplica a TODOS los cartones de la app por igual — la
// bolita de un número marcado sigue usando el color del sorteo (CARD_COLOR_STYLES),
// no el tema, para no perder esa información de un vistazo.
// Temas visuales del cartón — SOLO decorativos (encabezado B-I-N-G-O, casilla
// LIBRE, fondo/borde del cartón), independientes de `color` (dato de negocio:
// precio/catálogo del sorteo). El admin elige uno en Configuración (ver
// TemaCartonPicker) y aplica a TODOS los cartones de la app por igual — la
// "bolita" de un número marcado SIEMPRE usa el color del sorteo
// (CARD_COLOR_STYLES/style.mark), nunca el tema, para no perder esa
// información de un vistazo. Todos los temas (menos "ninguno") usan colores
// hex directos vía `style` inline en MiniCard, NO clases Tailwind — así un
// mismo cartón puede pintarse con cualquiera de los 62 temas importados del
// generador de cartones (PDF) sin tener que escribir clases a mano para cada
// uno (ver CARD_THEMES_GENERADOR más abajo).
const CARD_THEMES = {
  ninguno: {
    // "Sin tema" — el look clásico de antes de tener temas: header sin
    // colores (solo texto), LIBRE en vez de ícono, marcas cuadradas en vez
    // de "bolita", fondo/borde del cartón atados al color del sorteo (no a
    // un tema). `plano: true` es el flag que MiniCard usa para saltarse
    // TODO el resto de los campos de abajo (headerColores, cartonFondo...).
    nombre: 'Sin tema (clásico)',
    plano: true,
  },
  arcoiris: {
    nombre: 'Arcoíris Clásico',
    headerColores: ['#e11d48', '#f97316', '#f59e0b', '#059669', '#2563eb'],
    headerTexto: '#ffffff',
    numeroFondo: '#0f172a',
    numeroTexto: '#cbd5e1',
    cartonFondo: ['#2e1065', '#1e293b', '#4c0519'],
    bordeColor: '#f0abfc',
    libre: '★',
  },
  neon: {
    nombre: 'Neón Nocturno',
    headerColores: ['#0f0620', '#0f0620', '#0f0620', '#0f0620', '#0f0620'],
    headerTexto: ['#e879f9', '#22d3ee', '#a3e635', '#fbbf24', '#a78bfa'],
    glow: true, // agrega brillo de neón (text-shadow) al texto del header
    numeroFondo: '#0f172a',
    numeroTexto: '#e2e8f0',
    cartonFondo: ['#020617', '#4a044e', '#083344'],
    bordeColor: '#e879f9',
    libre: '✦',
  },
  dorado: {
    nombre: 'Dorado Elegante',
    headerColores: ['#fcd34d', '#fde047', '#f59e0b', '#eab308', '#fbbf24'],
    headerTexto: '#451a03',
    numeroFondo: '#fffbeb',
    numeroTexto: '#78350f',
    cartonFondo: ['#451a03', '#1c1917'],
    bordeColor: '#fcd34d',
    libre: '👑',
  },
  tropical: {
    nombre: 'Tropical',
    headerColores: ['#2dd4bf', '#10b981', '#a3e635', '#eab308', '#fb923c'],
    headerTexto: ['#ffffff', '#ffffff', '#052e16', '#422006', '#ffffff'],
    numeroFondo: '#f0fdfa',
    numeroTexto: '#134e4a',
    cartonFondo: ['#134e4a', '#166534'],
    bordeColor: '#5eead4',
    libre: '🌴',
  },
  fiesta: {
    nombre: 'Fiesta',
    headerColores: ['#ec4899', '#a855f7', '#eab308', '#3b82f6', '#22c55e'],
    headerTexto: ['#ffffff', '#ffffff', '#422006', '#ffffff', '#ffffff'],
    numeroFondo: '#fdf4ff',
    numeroTexto: '#581c87',
    cartonFondo: ['#701a75', '#1e293b'],
    bordeColor: '#f0abfc',
    libre: '🎉',
  },
  pastel: {
    nombre: 'Pastel Soñado',
    headerColores: ['#fbcfe8', '#ddd6fe', '#a7f3d0', '#fed7aa', '#bae6fd'],
    headerTexto: '#3f3f46',
    numeroFondo: '#fdf2f8',
    numeroTexto: '#831843',
    cartonFondo: ['#500724', '#312e81'],
    bordeColor: '#f9a8d4',
    libre: '🦋',
  },
  real: {
    nombre: 'Realeza',
    headerColores: ['#6d28d9', '#fbbf24', '#6d28d9', '#fbbf24', '#6d28d9'],
    headerTexto: ['#ffffff', '#422006', '#ffffff', '#422006', '#ffffff'],
    numeroFondo: '#faf5ff',
    numeroTexto: '#4c1d95',
    cartonFondo: ['#3b0764', '#1e1b4b'],
    bordeColor: '#fbbf24',
    libre: '👑',
  },
  deportivo: {
    nombre: 'Deportivo',
    headerColores: ['#16a34a', '#f8fafc', '#0f172a', '#dc2626', '#2563eb'],
    headerTexto: ['#ffffff', '#0f172a', '#ffffff', '#ffffff', '#ffffff'],
    numeroFondo: '#f8fafc',
    numeroTexto: '#0f172a',
    cartonFondo: ['#052e16', '#0f172a'],
    bordeColor: '#22c55e',
    libre: '⚽',
  },
  navideno: {
    nombre: 'Navideño',
    headerColores: ['#dc2626', '#16a34a', '#fbbf24', '#16a34a', '#dc2626'],
    headerTexto: '#ffffff',
    numeroFondo: '#fef2f2',
    numeroTexto: '#7f1d1d',
    cartonFondo: ['#7f1d1d', '#14532d'],
    bordeColor: '#fbbf24',
    libre: '🎄',
  },
  halloween: {
    nombre: 'Halloween',
    headerColores: ['#f97316', '#581c87', '#0f0620', '#581c87', '#f97316'],
    headerTexto: ['#ffffff', '#ffffff', '#fb923c', '#ffffff', '#ffffff'],
    numeroFondo: '#1c1917',
    numeroTexto: '#fed7aa',
    cartonFondo: ['#1c1917', '#3b0764'],
    bordeColor: '#f97316',
    libre: '🎃',
  },
};

// Temas importados 1:1 desde el "Generador de Cartones Bingo" (temasPredefinidos.js,
// backend/render/temasPredefinidos.js) — mismos colores exactos que usa el PDF, para
// que el cartón interactivo se vea igual que el cartón impreso de ese tema. A diferencia
// de los 10 temas base de arriba (definidos con clases Tailwind), estos usan colores hex
// directos vía `style` inline (ver MiniCard) porque son datos, no clases pensadas de antemano.
const CARD_THEMES_GENERADOR = {
  "gen-neon-nocturno": {
    nombre: "Neón Nocturno",
    headerColores: ["#f472b6","#c084fc","#818cf8","#38bdf8","#34d399"],
    headerTexto: "#0b0f2a",
    numeroFondo: "#ffffff",
    numeroTexto: "#1a1a2e",
    cartonFondo: ["#7c3aed","#0ea5e9"],
    bordeColor: "#f0abfc",
    libre: "✨",
  },
  "gen-carnaval": {
    nombre: "Carnaval",
    headerColores: ["#dc2626","#f97316","#facc15","#16a34a","#2563eb"],
    headerTexto: "#ffffff",
    numeroFondo: "#ffffff",
    numeroTexto: "#1a1a2e",
    cartonFondo: ["#ffffff"],
    bordeColor: "#facc15",
    libre: "🎊",
  },
  "gen-elegante-oro": {
    nombre: "Elegante Oro",
    headerColores: ["#d4af37","#e5c76b","#d4af37","#e5c76b","#d4af37"],
    headerTexto: "#1c1917",
    numeroFondo: "#f5f1e6",
    numeroTexto: "#1c1917",
    cartonFondo: ["#1c1917","#292524"],
    bordeColor: "#d4af37",
    libre: "♛",
  },
  "gen-pastel-fiesta": {
    nombre: "Pastel Fiesta",
    headerColores: ["#f9a8d4","#c4b5fd","#93c5fd","#6ee7b7","#fde68a"],
    headerTexto: "#3f3f46",
    numeroFondo: "#fafafa",
    numeroTexto: "#3f3f46",
    cartonFondo: ["#ffffff"],
    bordeColor: "#f9a8d4",
    libre: "🎈",
  },
  "gen-navidad-clasica": {
    nombre: "Navidad Clásica",
    headerColores: ["#dc2626","#16a34a","#dc2626","#16a34a","#dc2626"],
    headerTexto: "#ffffff",
    numeroFondo: "#ffffff",
    numeroTexto: "#1a1a2e",
    cartonFondo: ["#ffffff"],
    bordeColor: "#dc2626",
    libre: "🎄",
  },
  "gen-halloween": {
    nombre: "Halloween Terrorífico",
    headerColores: ["#f97316","#000000","#f97316","#000000","#f97316"],
    headerTexto: "#ffffff",
    numeroFondo: "#fef3c7",
    numeroTexto: "#1c1917",
    cartonFondo: ["#1c1917","#292524"],
    bordeColor: "#f97316",
    libre: "🎃",
  },
  "gen-ano-nuevo": {
    nombre: "Año Nuevo Dorado",
    headerColores: ["#d4af37","#f0d878","#d4af37","#f0d878","#d4af37"],
    headerTexto: "#1a1a2e",
    numeroFondo: "#ffffff",
    numeroTexto: "#1a1a2e",
    cartonFondo: ["#ffffff"],
    bordeColor: "#d4af37",
    libre: "🎆",
  },
  "gen-san-valentin": {
    nombre: "San Valentín",
    headerColores: ["#ec4899","#f472b6","#ec4899","#f472b6","#ec4899"],
    headerTexto: "#ffffff",
    numeroFondo: "#ffffff",
    numeroTexto: "#1a1a2e",
    cartonFondo: ["#ffffff"],
    bordeColor: "#ec4899",
    libre: "💕",
  },
  "gen-pascua": {
    nombre: "Pascua Primaveral",
    headerColores: ["#fca5a5","#fde68a","#bef264","#93c5fd","#c4b5fd"],
    headerTexto: "#3f3f46",
    numeroFondo: "#ffffff",
    numeroTexto: "#1a1a2e",
    cartonFondo: ["#ffffff"],
    bordeColor: "#a78bfa",
    libre: "🐰",
  },
  "gen-dia-madre": {
    nombre: "Día de la Madre",
    headerColores: ["#f472b6","#f9a8d4","#f472b6","#f9a8d4","#f472b6"],
    headerTexto: "#831843",
    numeroFondo: "#ffffff",
    numeroTexto: "#1a1a2e",
    cartonFondo: ["#ffffff"],
    bordeColor: "#f472b6",
    libre: "💐",
  },
  "gen-dia-padre": {
    nombre: "Día del Padre",
    headerColores: ["#1e40af","#2563eb","#1e40af","#2563eb","#1e40af"],
    headerTexto: "#ffffff",
    numeroFondo: "#ffffff",
    numeroTexto: "#1a1a2e",
    cartonFondo: ["#ffffff"],
    bordeColor: "#3b82f6",
    libre: "🎉",
  },
  "gen-patriotico": {
    nombre: "Fiesta Patriótica",
    headerColores: ["#dc2626","#2563eb","#dc2626","#2563eb","#dc2626"],
    headerTexto: "#ffffff",
    numeroFondo: "#ffffff",
    numeroTexto: "#1a1a2e",
    cartonFondo: ["#ffffff"],
    bordeColor: "#dc2626",
    libre: "🎉",
  },
  "gen-verano": {
    nombre: "Verano Playero",
    headerColores: ["#0ea5e9","#38bdf8","#0ea5e9","#38bdf8","#0ea5e9"],
    headerTexto: "#ffffff",
    numeroFondo: "#ffffff",
    numeroTexto: "#1a1a2e",
    cartonFondo: ["#ffffff"],
    bordeColor: "#facc15",
    libre: "🏖️",
  },
  "gen-otono": {
    nombre: "Otoño Dorado",
    headerColores: ["#ea580c","#d97706","#ea580c","#d97706","#ea580c"],
    headerTexto: "#ffffff",
    numeroFondo: "#ffffff",
    numeroTexto: "#1a1a2e",
    cartonFondo: ["#fffbeb"],
    bordeColor: "#ea580c",
    libre: "🍂",
  },
  "gen-invierno": {
    nombre: "Invierno Nevado",
    headerColores: ["#0284c7","#38bdf8","#0284c7","#38bdf8","#0284c7"],
    headerTexto: "#ffffff",
    numeroFondo: "#ffffff",
    numeroTexto: "#1a1a2e",
    cartonFondo: ["#ffffff"],
    bordeColor: "#7dd3fc",
    libre: "⛄",
  },
  "gen-primavera": {
    nombre: "Primavera Floral",
    headerColores: ["#f9a8d4","#bef264","#fde68a","#93c5fd","#c4b5fd"],
    headerTexto: "#3f3f46",
    numeroFondo: "#ffffff",
    numeroTexto: "#1a1a2e",
    cartonFondo: ["#ffffff"],
    bordeColor: "#84cc16",
    libre: "🌸",
  },
  "gen-espacio": {
    nombre: "Espacio Galáctico",
    headerColores: ["#7c3aed","#a78bfa","#7c3aed","#a78bfa","#7c3aed"],
    headerTexto: "#ffffff",
    numeroFondo: "#e0e7ff",
    numeroTexto: "#1e1b4b",
    cartonFondo: ["#1e1b4b","#312e81"],
    bordeColor: "#a78bfa",
    libre: "🚀",
  },
  "gen-dinosaurios": {
    nombre: "Dinosaurios Jurásicos",
    headerColores: ["#65a30d","#84cc16","#65a30d","#84cc16","#65a30d"],
    headerTexto: "#052e16",
    numeroFondo: "#ffffff",
    numeroTexto: "#1a1a2e",
    cartonFondo: ["#f0fdf4"],
    bordeColor: "#65a30d",
    libre: "🦖",
  },
  "gen-safari": {
    nombre: "Safari Aventura",
    headerColores: ["#b45309","#d97706","#b45309","#d97706","#b45309"],
    headerTexto: "#ffffff",
    numeroFondo: "#ffffff",
    numeroTexto: "#1a1a2e",
    cartonFondo: ["#fef3c7"],
    bordeColor: "#b45309",
    libre: "🦁",
  },
  "gen-piratas": {
    nombre: "Piratas del Caribe",
    headerColores: ["#78350f","#a16207","#78350f","#a16207","#78350f"],
    headerTexto: "#ffffff",
    numeroFondo: "#f5f1e6",
    numeroTexto: "#1c1917",
    cartonFondo: ["#f5f1e6"],
    bordeColor: "#a16207",
    libre: "🏴‍☠️",
  },
  "gen-unicornios": {
    nombre: "Unicornios Mágicos",
    headerColores: ["#f9a8d4","#d8b4fe","#93c5fd","#a7f3d0","#fde68a"],
    headerTexto: "#581c87",
    numeroFondo: "#ffffff",
    numeroTexto: "#1a1a2e",
    cartonFondo: ["#ffffff"],
    bordeColor: "#d8b4fe",
    libre: "🦄",
  },
  "gen-circo": {
    nombre: "Circo Divertido",
    headerColores: ["#dc2626","#ef4444","#dc2626","#ef4444","#dc2626"],
    headerTexto: "#ffffff",
    numeroFondo: "#ffffff",
    numeroTexto: "#1a1a2e",
    cartonFondo: ["#ffffff"],
    bordeColor: "#facc15",
    libre: "🎪",
  },
  "gen-superheroes": {
    nombre: "Superhéroes en Acción",
    headerColores: ["#dc2626","#2563eb","#dc2626","#2563eb","#dc2626"],
    headerTexto: "#ffffff",
    numeroFondo: "#ffffff",
    numeroTexto: "#1a1a2e",
    cartonFondo: ["#ffffff"],
    bordeColor: "#dc2626",
    libre: "🦸",
  },
  "gen-arcade": {
    nombre: "Retro Arcade",
    headerColores: ["#22d3ee","#f472b6","#22d3ee","#f472b6","#22d3ee"],
    headerTexto: "#000000",
    numeroFondo: "#e4e4e7",
    numeroTexto: "#18181b",
    cartonFondo: ["#18181b","#27272a"],
    bordeColor: "#22d3ee",
    libre: "👾",
  },
  "gen-futbol": {
    nombre: "Fútbol Campeón",
    headerColores: ["#16a34a","#22c55e","#16a34a","#22c55e","#16a34a"],
    headerTexto: "#ffffff",
    numeroFondo: "#ffffff",
    numeroTexto: "#1a1a2e",
    cartonFondo: ["#ffffff"],
    bordeColor: "#16a34a",
    libre: "⚽",
  },
  "gen-payasos": {
    nombre: "Payasos Alegres",
    headerColores: ["#dc2626","#f97316","#facc15","#16a34a","#2563eb"],
    headerTexto: "#ffffff",
    numeroFondo: "#ffffff",
    numeroTexto: "#1a1a2e",
    cartonFondo: ["#ffffff"],
    bordeColor: "#facc15",
    libre: "🤡",
  },
  "gen-dulces": {
    nombre: "Dulces y Caramelos",
    headerColores: ["#f9a8d4","#c4b5fd","#93c5fd","#6ee7b7","#fde68a"],
    headerTexto: "#3f3f46",
    numeroFondo: "#ffffff",
    numeroTexto: "#1a1a2e",
    cartonFondo: ["#ffffff"],
    bordeColor: "#f472b6",
    libre: "🍬",
  },
  "gen-robots": {
    nombre: "Robots del Futuro",
    headerColores: ["#334155","#64748b","#334155","#64748b","#334155"],
    headerTexto: "#ffffff",
    numeroFondo: "#ffffff",
    numeroTexto: "#1a1a2e",
    cartonFondo: ["#f1f5f9"],
    bordeColor: "#64748b",
    libre: "🤖",
  },
  "gen-casino": {
    nombre: "Casino Las Vegas",
    headerColores: ["#d4af37","#e5c76b","#d4af37","#e5c76b","#d4af37"],
    headerTexto: "#1c1917",
    numeroFondo: "#f5f1e6",
    numeroTexto: "#1c1917",
    cartonFondo: ["#1c1917","#292524"],
    bordeColor: "#d4af37",
    libre: "🎰",
  },
  "gen-gala-plateada": {
    nombre: "Gala Plateada",
    headerColores: ["#52525b","#a1a1aa","#52525b","#a1a1aa","#52525b"],
    headerTexto: "#ffffff",
    numeroFondo: "#ffffff",
    numeroTexto: "#1a1a2e",
    cartonFondo: ["#ffffff"],
    bordeColor: "#a1a1aa",
    libre: "🥂",
  },
  "gen-art-deco": {
    nombre: "Art Déco Dorado",
    headerColores: ["#d4af37","#1c1917","#d4af37","#1c1917","#d4af37"],
    headerTexto: "#ffffff",
    numeroFondo: "#ffffff",
    numeroTexto: "#1a1a2e",
    cartonFondo: ["#fffbeb"],
    bordeColor: "#d4af37",
    libre: "✨",
  },
  "gen-vintage": {
    nombre: "Vintage Sepia",
    headerColores: ["#92400e","#b45309","#92400e","#b45309","#92400e"],
    headerTexto: "#ffffff",
    numeroFondo: "#ffffff",
    numeroTexto: "#1a1a2e",
    cartonFondo: ["#fef3c7"],
    bordeColor: "#92400e",
    libre: "📜",
  },
  "gen-minimalista": {
    nombre: "Minimalista Blanco y Negro",
    headerColores: ["#18181b","#27272a","#18181b","#27272a","#18181b"],
    headerTexto: "#ffffff",
    numeroFondo: "#ffffff",
    numeroTexto: "#1a1a2e",
    cartonFondo: ["#ffffff"],
    bordeColor: "#18181b",
    libre: "⚪",
  },
  "gen-champagne": {
    nombre: "Champagne Elegante",
    headerColores: ["#d4af37","#e5c76b","#d4af37","#e5c76b","#d4af37"],
    headerTexto: "#78350f",
    numeroFondo: "#ffffff",
    numeroTexto: "#1a1a2e",
    cartonFondo: ["#fffbeb"],
    bordeColor: "#d4af37",
    libre: "🥂",
  },
  "gen-esmeralda": {
    nombre: "Esmeralda Real",
    headerColores: ["#059669","#10b981","#059669","#10b981","#059669"],
    headerTexto: "#ffffff",
    numeroFondo: "#ffffff",
    numeroTexto: "#1a1a2e",
    cartonFondo: ["#f0fdf4"],
    bordeColor: "#d4af37",
    libre: "💎",
  },
  "gen-zafiro": {
    nombre: "Zafiro Nocturno",
    headerColores: ["#1d4ed8","#3b82f6","#1d4ed8","#3b82f6","#1d4ed8"],
    headerTexto: "#ffffff",
    numeroFondo: "#ffffff",
    numeroTexto: "#1a1a2e",
    cartonFondo: ["#ffffff"],
    bordeColor: "#60a5fa",
    libre: "💠",
  },
  "gen-tropical": {
    nombre: "Paraíso Tropical",
    headerColores: ["#f97316","#eab308","#22c55e","#06b6d4","#ec4899"],
    headerTexto: "#ffffff",
    numeroFondo: "#ffffff",
    numeroTexto: "#1a1a2e",
    cartonFondo: ["#ffffff"],
    bordeColor: "#fb923c",
    libre: "🌴",
  },
  "gen-playa": {
    nombre: "Playa Caribeña",
    headerColores: ["#0891b2","#22d3ee","#0891b2","#22d3ee","#0891b2"],
    headerTexto: "#ffffff",
    numeroFondo: "#ffffff",
    numeroTexto: "#1a1a2e",
    cartonFondo: ["#fffbeb"],
    bordeColor: "#f59e0b",
    libre: "🐚",
  },
  "gen-bosque": {
    nombre: "Bosque Encantado",
    headerColores: ["#166534","#16a34a","#166534","#16a34a","#166534"],
    headerTexto: "#ffffff",
    numeroFondo: "#ffffff",
    numeroTexto: "#1a1a2e",
    cartonFondo: ["#f0fdf4"],
    bordeColor: "#84cc16",
    libre: "🍄",
  },
  "gen-jardin": {
    nombre: "Jardín Floral",
    headerColores: ["#f472b6","#d946ef","#a78bfa","#60a5fa","#34d399"],
    headerTexto: "#ffffff",
    numeroFondo: "#ffffff",
    numeroTexto: "#1a1a2e",
    cartonFondo: ["#ffffff"],
    bordeColor: "#d946ef",
    libre: "🌷",
  },
  "gen-oceano": {
    nombre: "Océano Profundo",
    headerColores: ["#0e7490","#06b6d4","#0e7490","#06b6d4","#0e7490"],
    headerTexto: "#ffffff",
    numeroFondo: "#ffffff",
    numeroTexto: "#1a1a2e",
    cartonFondo: ["#ffffff"],
    bordeColor: "#22d3ee",
    libre: "🐬",
  },
  "gen-desierto": {
    nombre: "Desierto Dorado",
    headerColores: ["#c2410c","#ea580c","#c2410c","#ea580c","#c2410c"],
    headerTexto: "#ffffff",
    numeroFondo: "#ffffff",
    numeroTexto: "#1a1a2e",
    cartonFondo: ["#fef3c7"],
    bordeColor: "#ea580c",
    libre: "🌵",
  },
  "gen-montana": {
    nombre: "Montaña Nevada",
    headerColores: ["#0369a1","#0ea5e9","#0369a1","#0ea5e9","#0369a1"],
    headerTexto: "#ffffff",
    numeroFondo: "#ffffff",
    numeroTexto: "#1a1a2e",
    cartonFondo: ["#ffffff"],
    bordeColor: "#0284c7",
    libre: "🏔️",
  },
  "gen-arcoiris": {
    nombre: "Arcoíris Pastel",
    headerColores: ["#f87171","#fb923c","#facc15","#4ade80","#60a5fa"],
    headerTexto: "#3f3f46",
    numeroFondo: "#ffffff",
    numeroTexto: "#1a1a2e",
    cartonFondo: ["#ffffff"],
    bordeColor: "#a78bfa",
    libre: "🌈",
  },
  "gen-atardecer": {
    nombre: "Atardecer Sunset",
    headerColores: ["#f97316","#ec4899","#f97316","#ec4899","#f97316"],
    headerTexto: "#ffffff",
    numeroFondo: "#ffffff",
    numeroTexto: "#1a1a2e",
    cartonFondo: ["#ffffff"],
    bordeColor: "#fb923c",
    libre: "🌅",
  },
  "gen-azul-mono": {
    nombre: "Azul Monocromático",
    headerColores: ["#1e40af","#2563eb","#3b82f6","#2563eb","#1e40af"],
    headerTexto: "#ffffff",
    numeroFondo: "#ffffff",
    numeroTexto: "#1a1a2e",
    cartonFondo: ["#ffffff"],
    bordeColor: "#3b82f6",
    libre: "💙",
  },
  "gen-rosa-mono": {
    nombre: "Rosa Monocromático",
    headerColores: ["#9d174d","#db2777","#ec4899","#db2777","#9d174d"],
    headerTexto: "#ffffff",
    numeroFondo: "#ffffff",
    numeroTexto: "#1a1a2e",
    cartonFondo: ["#ffffff"],
    bordeColor: "#ec4899",
    libre: "💗",
  },
  "gen-blanco-dorado": {
    nombre: "Blanco y Dorado",
    headerColores: ["#d4af37","#e5c76b","#d4af37","#e5c76b","#d4af37"],
    headerTexto: "#78350f",
    numeroFondo: "#ffffff",
    numeroTexto: "#1a1a2e",
    cartonFondo: ["#ffffff"],
    bordeColor: "#d4af37",
    libre: "⭐",
  },
  "gen-lavanda": {
    nombre: "Lavanda Suave",
    headerColores: ["#6d28d9","#8b5cf6","#6d28d9","#8b5cf6","#6d28d9"],
    headerTexto: "#ffffff",
    numeroFondo: "#ffffff",
    numeroTexto: "#1a1a2e",
    cartonFondo: ["#ffffff"],
    bordeColor: "#c4b5fd",
    libre: "💜",
  },
  "gen-menta": {
    nombre: "Menta Fresca",
    headerColores: ["#0d9488","#14b8a6","#0d9488","#14b8a6","#0d9488"],
    headerTexto: "#ffffff",
    numeroFondo: "#ffffff",
    numeroTexto: "#1a1a2e",
    cartonFondo: ["#ffffff"],
    bordeColor: "#2dd4bf",
    libre: "🌿",
  },
  "gen-fiesta-mexicana": {
    nombre: "Fiesta Mexicana",
    headerColores: ["#16a34a","#fbbf24","#dc2626","#fbbf24","#16a34a"],
    headerTexto: "#ffffff",
    numeroFondo: "#ffffff",
    numeroTexto: "#1a1a2e",
    cartonFondo: ["#ffffff"],
    bordeColor: "#f97316",
    libre: "💃",
  },
  "gen-oktoberfest": {
    nombre: "Oktoberfest",
    headerColores: ["#1d4ed8","#facc15","#1d4ed8","#facc15","#1d4ed8"],
    headerTexto: "#ffffff",
    numeroFondo: "#ffffff",
    numeroTexto: "#1a1a2e",
    cartonFondo: ["#fef3c7"],
    bordeColor: "#b45309",
    libre: "🍺",
  },
  "gen-hawaiana": {
    nombre: "Fiesta Hawaiana",
    headerColores: ["#ec4899","#f97316","#22d3ee","#facc15","#22c55e"],
    headerTexto: "#ffffff",
    numeroFondo: "#ffffff",
    numeroTexto: "#1a1a2e",
    cartonFondo: ["#ffffff"],
    bordeColor: "#22d3ee",
    libre: "🌺",
  },
  "gen-mardi-gras": {
    nombre: "Mardi Gras",
    headerColores: ["#7c3aed","#16a34a","#d4af37","#16a34a","#7c3aed"],
    headerTexto: "#ffffff",
    numeroFondo: "#ffffff",
    numeroTexto: "#1a1a2e",
    cartonFondo: ["#ffffff"],
    bordeColor: "#d4af37",
    libre: "🎭",
  },
  "gen-carnaval-brasil": {
    nombre: "Carnaval Brasileño",
    headerColores: ["#16a34a","#facc15","#2563eb","#facc15","#16a34a"],
    headerTexto: "#ffffff",
    numeroFondo: "#ffffff",
    numeroTexto: "#1a1a2e",
    cartonFondo: ["#ffffff"],
    bordeColor: "#2563eb",
    libre: "🥁",
  },
  "gen-cumpleanos": {
    nombre: "Cumpleaños Festivo",
    headerColores: ["#ec4899","#f97316","#facc15","#22c55e","#3b82f6"],
    headerTexto: "#ffffff",
    numeroFondo: "#ffffff",
    numeroTexto: "#1a1a2e",
    cartonFondo: ["#ffffff"],
    bordeColor: "#facc15",
    libre: "🎂",
  },
  "gen-baby-shower-celeste": {
    nombre: "Baby Shower Celeste",
    headerColores: ["#93c5fd","#60a5fa","#93c5fd","#60a5fa","#93c5fd"],
    headerTexto: "#1e3a8a",
    numeroFondo: "#ffffff",
    numeroTexto: "#1a1a2e",
    cartonFondo: ["#ffffff"],
    bordeColor: "#60a5fa",
    libre: "👶",
  },
  "gen-baby-shower-rosa": {
    nombre: "Baby Shower Rosa",
    headerColores: ["#f9a8d4","#f472b6","#f9a8d4","#f472b6","#f9a8d4"],
    headerTexto: "#831843",
    numeroFondo: "#ffffff",
    numeroTexto: "#1a1a2e",
    cartonFondo: ["#ffffff"],
    bordeColor: "#f472b6",
    libre: "👶",
  },
  "gen-boda": {
    nombre: "Boda Elegante",
    headerColores: ["#d4af37","#f5d78e","#d4af37","#f5d78e","#d4af37"],
    headerTexto: "#78350f",
    numeroFondo: "#ffffff",
    numeroTexto: "#1a1a2e",
    cartonFondo: ["#ffffff"],
    bordeColor: "#d4af37",
    libre: "💍",
  },
  "gen-regreso-clases": {
    nombre: "Regreso a Clases",
    headerColores: ["#dc2626","#eab308","#2563eb","#16a34a","#f97316"],
    headerTexto: "#ffffff",
    numeroFondo: "#ffffff",
    numeroTexto: "#1a1a2e",
    cartonFondo: ["#ffffff"],
    bordeColor: "#eab308",
    libre: "🍎",
  },
  "gen-graduacion": {
    nombre: "Graduación",
    headerColores: ["#1e3a8a","#d4af37","#1e3a8a","#d4af37","#1e3a8a"],
    headerTexto: "#ffffff",
    numeroFondo: "#ffffff",
    numeroTexto: "#1a1a2e",
    cartonFondo: ["#ffffff"],
    bordeColor: "#d4af37",
    libre: "🎓",
  },
  "gen-ojo-turco": {
    nombre: "Ojo Turco",
    headerColores: ["#1e3a8a","#0ea5e9","#1e3a8a","#0ea5e9","#1e3a8a"],
    headerTexto: "#ffffff",
    numeroFondo: "#ffffff",
    numeroTexto: "#1a1a2e",
    cartonFondo: ["#ffffff"],
    bordeColor: "#1d4ed8",
    libre: "🧿",
  },
};
const CARD_THEMES_GENERADOR_IDS = Object.keys(CARD_THEMES_GENERADOR);

// Se fusionan en un solo diccionario (mismas claves conviven con las 10 de
// arriba) para que MiniCard/TemaCartonPicker busquen siempre en un solo
// lugar (CARD_THEMES[id]) sin importar de dónde vino el tema.
Object.assign(CARD_THEMES, CARD_THEMES_GENERADOR);
// "ninguno" primero (el "apagado"), después los 10 curados, después los 62
// del generador en el mismo orden/categorías que trae temasPredefinidos.js.
const CARD_THEME_IDS = [
  'ninguno',
  'arcoiris', 'neon', 'dorado', 'tropical', 'fiesta', 'pastel', 'real', 'deportivo', 'navideno', 'halloween',
  ...CARD_THEMES_GENERADOR_IDS,
];
const DEFAULT_CARD_THEME = 'arcoiris';

// 1 color = sólido, 2+ = degradado lineal en ese orden — mismo criterio que
// fondoCss() en el generador de cartones (backend/render/sheetTemplate.js).
function cartonFondoCss(colores) {
  if (!colores || !colores.length) return '#1e293b';
  if (colores.length === 1) return colores[0];
  return `linear-gradient(135deg, ${colores.join(', ')})`;
}

function hexToRgb(hex) {
  const h = hex.replace('#', '');
  return [parseInt(h.substr(0, 2), 16), parseInt(h.substr(2, 2), 16), parseInt(h.substr(4, 2), 16)];
}
function mezclarColor(hexBase, hexColor, t) {
  const [r1, g1, b1] = hexToRgb(hexBase);
  const [r2, g2, b2] = hexToRgb(hexColor);
  const r = Math.round(r1 + (r2 - r1) * t);
  const g = Math.round(g1 + (g2 - g1) * t);
  const b = Math.round(b1 + (b2 - b1) * t);
  return `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}
// Luminancia percibida — > 235 es "blanco o casi blanco".
function esCasiBlanco(hex) {
  const [r, g, b] = hexToRgb(hex);
  return (0.299 * r + 0.587 * g + 0.114 * b) > 235;
}
// Fondo real del cartón para un tema: usa tema.cartonFondo tal cual, SALVO
// que sea blanco/casi blanco puro (43 de los 62 temas del generador lo son
// — ahí tenía sentido porque el header/borde de color ya llevaban la
// personalidad del tema sobre una hoja física impresa). En la app, un
// cartón blanco al lado de otros temas se ve como si el tema no cambiara
// nada — acá se reemplaza por un tinte suave derivado del propio borde y
// primer color del encabezado, para que TODOS los temas se noten también
// en el fondo del cartón, no solo en el encabezado.
function fondoCartonReal(tema) {
  const colores = tema.cartonFondo;
  if (colores.length === 1 && esCasiBlanco(colores[0])) {
    const c1 = mezclarColor('#ffffff', tema.bordeColor, 0.22);
    const c2 = mezclarColor('#ffffff', tema.headerColores[0], 0.16);
    return `linear-gradient(135deg, ${c1}, ${c2})`;
  }
  return cartonFondoCss(colores);
}

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

// Arpegio corto vía Web Audio API (sin archivos de audio) para avisar que un
// cartón entró en "cerca de ganar" — tres notas ascendentes, más festivo que
// un pitido plano.
function reproducirBeep() {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    const ctx = new AudioCtx();
    [660, 880, 1100].forEach((freq, i) => {
      const t0 = ctx.currentTime + i * 0.12;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.001, t0);
      gain.gain.exponentialRampToValueAtTime(0.3, t0 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, t0 + 0.22);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(t0);
      osc.stop(t0 + 0.24);
    });
  } catch (e) { /* Web Audio no disponible, no es crítico */ }
}

// ---------------------------------------------------------------------------
// Motor de sonido configurable: aviso "cerca de ganar", fanfarria de BINGO y
// música de tensión (ver Configuración -> Sonido). Los presets se sintetizan
// con Web Audio (mismo enfoque que reproducirBeep, sin archivos externos);
// el admin puede reemplazar cualquiera por un archivo propio, guardado en
// R2 y reproducido con un <audio> normal. El aviso de "reclamo pendiente"
// del panel admin sigue usando reproducirBeep() directo, sin pasar por acá
// — no es configurable a propósito.
// ---------------------------------------------------------------------------
let audioCtxSingleton = null;
function getAudioCtx() {
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtx) return null;
  if (!audioCtxSingleton) audioCtxSingleton = new AudioCtx();
  if (audioCtxSingleton.state === 'suspended') audioCtxSingleton.resume().catch(() => {});
  return audioCtxSingleton;
}

// `destino` es opcional (default ctx.destination) — la música de tensión lo
// usa para enrutar todo a un GainNode maestro y así poder controlar su
// volumen (ver iniciarSonidoMusica); alerta/fanfarria no lo pasan nunca.
function tono(ctx, t0, freq, dur, { type = 'sine', peak = 0.3, destino } = {}) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(0.001, t0);
  gain.gain.exponentialRampToValueAtTime(peak, t0 + Math.min(0.02, dur / 4));
  gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
  osc.connect(gain);
  gain.connect(destino || ctx.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

// Ruido blanco filtrado, corto — sirve tanto para el "golpe" de un tambor
// como para el pulso tipo latido de la música de suspenso.
function ruidoCorto(ctx, t0, dur, { peak = 0.4, freq = 1200, destino } = {}) {
  const bufferSize = Math.max(1, Math.ceil(ctx.sampleRate * dur));
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
  const noise = ctx.createBufferSource();
  noise.buffer = buffer;
  const filtro = ctx.createBiquadFilter();
  filtro.type = 'bandpass';
  filtro.frequency.value = freq;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(peak, t0);
  gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
  noise.connect(filtro);
  filtro.connect(gain);
  gain.connect(destino || ctx.destination);
  noise.start(t0);
  noise.stop(t0 + dur + 0.02);
}

const SOUND_PRESETS = {
  alerta: {
    // Reusa el beep original tal cual (mismo sonido de siempre por default).
    arpegio: () => reproducirBeep(),
    campana: (ctx) => {
      const t0 = ctx.currentTime;
      tono(ctx, t0, 1046.5, 1.1, { type: 'sine', peak: 0.25 });
      tono(ctx, t0, 1568, 1.0, { type: 'sine', peak: 0.1 });
    },
    tambor: (ctx) => {
      const t0 = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(110, t0);
      osc.frequency.exponentialRampToValueAtTime(40, t0 + 0.15);
      gain.gain.setValueAtTime(0.5, t0);
      gain.gain.exponentialRampToValueAtTime(0.001, t0 + 0.18);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(t0);
      osc.stop(t0 + 0.2);
      ruidoCorto(ctx, t0, 0.08, { peak: 0.3, freq: 1800 });
    },
    arcade: (ctx) => {
      const t0 = ctx.currentTime;
      tono(ctx, t0, 440, 0.09, { type: 'square', peak: 0.2 });
      tono(ctx, t0 + 0.1, 660, 0.12, { type: 'square', peak: 0.2 });
    },
    xilofono: (ctx) => {
      const t0 = ctx.currentTime;
      tono(ctx, t0, 1760, 0.35, { type: 'triangle', peak: 0.28 });
      tono(ctx, t0 + 0.08, 2093, 0.3, { type: 'triangle', peak: 0.2 });
    },
    notificacion: (ctx) => {
      const t0 = ctx.currentTime;
      tono(ctx, t0, 988, 0.12, { type: 'sine', peak: 0.28 });
      tono(ctx, t0 + 0.14, 1319, 0.16, { type: 'sine', peak: 0.28 });
    },
    laser: (ctx) => {
      const t0 = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(1800, t0);
      osc.frequency.exponentialRampToValueAtTime(200, t0 + 0.25);
      gain.gain.setValueAtTime(0.25, t0);
      gain.gain.exponentialRampToValueAtTime(0.001, t0 + 0.28);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(t0);
      osc.stop(t0 + 0.3);
    },
    burbuja: (ctx) => {
      const t0 = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(300, t0);
      osc.frequency.exponentialRampToValueAtTime(900, t0 + 0.12);
      gain.gain.setValueAtTime(0.3, t0);
      gain.gain.exponentialRampToValueAtTime(0.001, t0 + 0.14);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(t0);
      osc.stop(t0 + 0.16);
    },
  },
  fanfarria: {
    fanfarria: (ctx) => {
      const t0 = ctx.currentTime;
      const notas = [523.25, 659.25, 783.99, 1046.5]; // C5 E5 G5 C6
      notas.forEach((f, i) => tono(ctx, t0 + i * 0.1, f, 0.25, { type: 'sawtooth', peak: 0.18 }));
      notas.forEach((f) => tono(ctx, t0 + 0.45, f, 0.7, { type: 'sawtooth', peak: 0.12 }));
    },
    campanario: (ctx) => {
      const t0 = ctx.currentTime;
      const notas = [1568, 1318.5, 1046.5, 783.99];
      notas.forEach((f, i) => tono(ctx, t0 + i * 0.14, f, 0.5, { type: 'sine', peak: 0.22 }));
      tono(ctx, t0 + 0.6, 1046.5, 1.0, { type: 'sine', peak: 0.2 });
      tono(ctx, t0 + 0.6, 1568, 1.0, { type: 'sine', peak: 0.12 });
    },
    'arcade-win': (ctx) => {
      const t0 = ctx.currentTime;
      [523.25, 659.25, 783.99, 1046.5, 1318.5].forEach((f, i) => tono(ctx, t0 + i * 0.09, f, 0.12, { type: 'square', peak: 0.18 }));
      tono(ctx, t0 + 0.5, 1568, 0.4, { type: 'square', peak: 0.2 });
    },
    sirena: (ctx) => {
      const t0 = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sawtooth';
      gain.gain.setValueAtTime(0.001, t0);
      gain.gain.exponentialRampToValueAtTime(0.22, t0 + 0.05);
      osc.frequency.setValueAtTime(600, t0);
      osc.frequency.linearRampToValueAtTime(1200, t0 + 0.3);
      osc.frequency.linearRampToValueAtTime(600, t0 + 0.6);
      osc.frequency.linearRampToValueAtTime(1200, t0 + 0.9);
      gain.gain.setValueAtTime(0.22, t0 + 0.9);
      gain.gain.exponentialRampToValueAtTime(0.001, t0 + 1.0);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(t0);
      osc.stop(t0 + 1.05);
    },
    coro: (ctx) => {
      const t0 = ctx.currentTime;
      [523.25, 659.25, 783.99].forEach((f) => tono(ctx, t0, f, 0.9, { type: 'triangle', peak: 0.15 }));
    },
    redoble: (ctx) => {
      const t0 = ctx.currentTime;
      for (let i = 0; i < 10; i++) ruidoCorto(ctx, t0 + i * 0.05, 0.05, { peak: 0.15 + i * 0.01, freq: 200 });
      ruidoCorto(ctx, t0 + 0.55, 0.5, { peak: 0.3, freq: 4000 });
      tono(ctx, t0 + 0.55, 800, 0.5, { type: 'square', peak: 0.15 });
    },
  },
  musica: {
    // Pad grave (dos osciladores levemente desafinados + filtro, más audible
    // en parlantes chicos que un seno puro) con tremolo lento para que
    // "respire", más un latido grave+tic agudo cada ~1s. El diseño anterior
    // era un seno de 55Hz casi inaudible en celular/laptop — se reemplazó
    // por algo con armónicos que sí se escuchan en esos parlantes.
    suspenso: (ctx, destino) => {
      const t0 = ctx.currentTime;
      const filtro = ctx.createBiquadFilter();
      filtro.type = 'lowpass';
      filtro.frequency.value = 600;
      const padGain = ctx.createGain();
      padGain.gain.setValueAtTime(0.0001, t0);
      padGain.gain.linearRampToValueAtTime(0.18, t0 + 1.2);
      filtro.connect(padGain);
      padGain.connect(destino || ctx.destination);

      const oscs = [110, 110 * 1.01].map((freq) => {
        const osc = ctx.createOscillator();
        osc.type = 'sawtooth';
        osc.frequency.value = freq;
        osc.connect(filtro);
        osc.start(t0);
        return osc;
      });

      // Tremolo lento (LFO sobre la ganancia del pad) — le da movimiento,
      // sensación de "algo se acerca", en vez de un tono fijo y plano.
      const lfo = ctx.createOscillator();
      const lfoGain = ctx.createGain();
      lfo.frequency.value = 0.3;
      lfoGain.gain.value = 0.08;
      lfo.connect(lfoGain);
      lfoGain.connect(padGain.gain);
      lfo.start(t0);

      let activo = true;
      let timeoutId = null;
      function latido() {
        if (!activo) return;
        const tp = ctx.currentTime;
        const golpe = ctx.createOscillator();
        const golpeGain = ctx.createGain();
        golpe.type = 'sine';
        golpe.frequency.setValueAtTime(150, tp);
        golpe.frequency.exponentialRampToValueAtTime(50, tp + 0.2);
        golpeGain.gain.setValueAtTime(0.35, tp);
        golpeGain.gain.exponentialRampToValueAtTime(0.001, tp + 0.25);
        golpe.connect(golpeGain);
        golpeGain.connect(destino || ctx.destination);
        golpe.start(tp);
        golpe.stop(tp + 0.3);
        ruidoCorto(ctx, tp, 0.05, { peak: 0.2, freq: 2500, destino });
        timeoutId = setTimeout(latido, 1000);
      }
      latido();

      return {
        stop() {
          activo = false;
          clearTimeout(timeoutId);
          const tf = ctx.currentTime;
          padGain.gain.exponentialRampToValueAtTime(0.0001, tf + 0.4);
          oscs.forEach((o) => o.stop(tf + 0.45));
          lfo.stop(tf + 0.45);
        },
      };
    },
    // Ostinato de dos notas cercanas tipo reloj, ritmo fijo (sin acelerar)
    // — onda cuadrada + un tic agudo encima para que se note bien incluso
    // en parlantes chicos (el triángulo original a bajo volumen se
    // escuchaba muy débil).
    tension: (ctx, destino) => {
      let activo = true;
      let timeoutId = null;
      let paso = 0;
      function pulso() {
        if (!activo) return;
        const tp = ctx.currentTime;
        const freq = paso % 2 === 0 ? 220 : 233;
        tono(ctx, tp, freq, 0.22, { type: 'square', peak: 0.3, destino });
        ruidoCorto(ctx, tp, 0.04, { peak: 0.15, freq: 3000, destino });
        paso++;
        timeoutId = setTimeout(pulso, 420);
      }
      pulso();
      return {
        stop() {
          activo = false;
          clearTimeout(timeoutId);
        },
      };
    },
    // Ruido blanco en loop con filtro paso-bajo barrido lento (simula el
    // vaivén de las olas) + un pad grave suave de fondo. Más relajado que
    // "Suspenso"/"Tensión creciente" — pensado para una tensión más sutil.
    oceano: (ctx, destino) => {
      const t0 = ctx.currentTime;
      const bufferSize = ctx.sampleRate * 2;
      const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
      const noise = ctx.createBufferSource();
      noise.buffer = buffer;
      noise.loop = true;

      const filtro = ctx.createBiquadFilter();
      filtro.type = 'lowpass';
      filtro.Q.value = 1.2;
      filtro.frequency.value = 600;
      const filtroLfo = ctx.createOscillator();
      const filtroLfoGain = ctx.createGain();
      filtroLfo.frequency.value = 0.15;
      filtroLfoGain.gain.value = 500;
      filtroLfo.connect(filtroLfoGain);
      filtroLfoGain.connect(filtro.frequency);

      const noiseGain = ctx.createGain();
      noiseGain.gain.setValueAtTime(0.0001, t0);
      noiseGain.gain.linearRampToValueAtTime(0.2, t0 + 1.2);
      noise.connect(filtro);
      filtro.connect(noiseGain);
      noiseGain.connect(destino || ctx.destination);

      const pad = ctx.createOscillator();
      const padGain = ctx.createGain();
      pad.type = 'sine';
      pad.frequency.value = 130.81; // C3
      padGain.gain.value = 0.06;
      pad.connect(padGain);
      padGain.connect(destino || ctx.destination);

      noise.start(t0);
      filtroLfo.start(t0);
      pad.start(t0);

      return {
        stop() {
          const tf = ctx.currentTime;
          noiseGain.gain.exponentialRampToValueAtTime(0.0001, tf + 0.5);
          padGain.gain.exponentialRampToValueAtTime(0.0001, tf + 0.5);
          noise.stop(tf + 0.55);
          filtroLfo.stop(tf + 0.55);
          pad.stop(tf + 0.55);
        },
      };
    },
    // "Lub-dub" de latido, sin nada más encima — la opción más minimalista.
    latidos: (ctx, destino) => {
      let activo = true;
      let timeoutId = null;
      function golpe(tp, freq, peak, dur) {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, tp);
        osc.frequency.exponentialRampToValueAtTime(freq * 0.4, tp + dur);
        gain.gain.setValueAtTime(peak, tp);
        gain.gain.exponentialRampToValueAtTime(0.001, tp + dur);
        osc.connect(gain);
        gain.connect(destino || ctx.destination);
        osc.start(tp);
        osc.stop(tp + dur + 0.02);
      }
      function latir() {
        if (!activo) return;
        const tp = ctx.currentTime;
        golpe(tp, 140, 0.65, 0.16); // "lub"
        golpe(tp + 0.22, 120, 0.5, 0.14); // "dub"
        timeoutId = setTimeout(latir, 950);
      }
      latir();
      return {
        stop() {
          activo = false;
          clearTimeout(timeoutId);
        },
      };
    },
    // Arpegio synth pulsante, más energético/videojuego que las demás.
    electronico: (ctx, destino) => {
      let activo = true;
      let timeoutId = null;
      let paso = 0;
      const notas = [220, 277.18, 329.63, 277.18];
      function pulso() {
        if (!activo) return;
        tono(ctx, ctx.currentTime, notas[paso % notas.length], 0.16, { type: 'sawtooth', peak: 0.22, destino });
        paso++;
        timeoutId = setTimeout(pulso, 170);
      }
      pulso();
      return {
        stop() {
          activo = false;
          clearTimeout(timeoutId);
        },
      };
    },
  },
};

// Reproduce un sonido de una sola vez (aviso "cerca de ganar" o fanfarria de
// BINGO) según la config que llega de /settings/public (SettingsContext).
function reproducirSonido(categoria, config) {
  if (!config || config.tipo === 'off') return;
  try {
    if (config.tipo === 'custom' && config.url) {
      const audio = new Audio(config.url);
      audio.volume = 0.6;
      audio.play().catch(() => {});
      return;
    }
    const ctx = getAudioCtx();
    const fn = ctx && SOUND_PRESETS[categoria] && SOUND_PRESETS[categoria][config.nombre];
    if (fn) fn(ctx);
  } catch (e) { /* Web Audio no disponible, no es crítico */ }
}

// config.volumen es 0-100 (% del nivel original ya afinado por preset/
// archivo — 100 preserva el volumen de siempre); undefined también cae en
// 100 para no cambiar el comportamiento de llamadas viejas.
function volumenMultiplicador(config) {
  const v = config && config.volumen;
  return (typeof v === 'number' && Number.isFinite(v) ? Math.min(100, Math.max(0, v)) : 100) / 100;
}

// Arranca un sonido/loop de música de tensión (preset o archivo propio).
// `loop` controla si se repite indefinidamente (lo corta quien llama,
// nunca solo); `onFinalizar` solo aplica a un archivo propio sin loop —
// avisa cuando termina por su cuenta, para poder disparar de nuevo en la
// próxima racha de tensión. El handle devuelto trae `setVolumen(mult)`
// además de `stop()`, para poder mover el volumen en vivo mientras suena
// (ver el medidor de volumen en Configuración -> Sonido).
function iniciarSonidoMusica(config, { loop, onFinalizar } = {}) {
  const mult = volumenMultiplicador(config);
  if (config.tipo === 'custom' && config.url) {
    const audio = new Audio(config.url);
    audio.loop = !!loop;
    audio.volume = 0.35 * mult;
    if (!loop && onFinalizar) audio.addEventListener('ended', onFinalizar, { once: true });
    audio.play().catch(() => {});
    return { stop: () => audio.pause(), setVolumen: (m) => { audio.volume = 0.35 * m; } };
  }
  const ctx = getAudioCtx();
  const fn = ctx && SOUND_PRESETS.musica[config.nombre];
  if (!fn) return null;
  const masterGain = ctx.createGain();
  masterGain.gain.value = mult;
  masterGain.connect(ctx.destination);
  const handle = fn(ctx, masterGain);
  if (!handle) return null;
  return {
    stop: () => { handle.stop(); masterGain.disconnect(); },
    setVolumen: (m) => { masterGain.gain.value = m; },
  };
}

// Controla la música de tensión según `activo` (hay o no cartones "cerca de
// ganar") y el modo elegido en Configuración:
// - 'continuo' (default, comportamiento original): suena mientras `activo`
//   sea true, se corta apenas deja de serlo.
// - 'una_vez': un solo disparo por cada racha de tensión (flanco de subida
//   de `activo`) — no se corta si la tensión termina antes, y no vuelve a
//   sonar hasta la próxima racha.
// - 'duracion': igual que 'una_vez' pero con un tiempo fijo configurable
//   (config.duracionSeg) en vez de la duración natural/por defecto.
function useMusicaTension(activo, config) {
  const stRef = useRef({ prevActivo: false, handle: null, timeoutId: null, ducked: false });

  // Corta cualquier música en curso al desmontar (ej. salir de la sala de juego).
  useEffect(() => () => {
    clearTimeout(stRef.current.timeoutId);
    stRef.current.handle && stRef.current.handle.stop();
  }, []);

  useEffect(() => {
    const st = stRef.current;
    const subiendo = activo && !st.prevActivo;
    const bajando = !activo && st.prevActivo;
    st.prevActivo = activo;
    if (!config || config.tipo === 'off') return;
    const modo = config.modo || 'continuo';

    try {
      if (modo === 'continuo') {
        if (subiendo) st.handle = iniciarSonidoMusica(config, { loop: true });
        else if (bajando && st.handle) { st.handle.stop(); st.handle = null; }
        return;
      }

      if (!subiendo || st.handle) return; // un solo disparo por racha, sin solaparse consigo mismo
      const limpiar = () => { st.handle = null; };
      if (modo === 'duracion') {
        st.handle = iniciarSonidoMusica(config, { loop: true });
        st.timeoutId = setTimeout(() => { st.handle && st.handle.stop(); limpiar(); }, (config.duracionSeg || 8) * 1000);
      } else if (config.tipo === 'custom') {
        // 'una_vez' con archivo propio: se deja terminar solo, sin loop.
        st.handle = iniciarSonidoMusica(config, { loop: false, onFinalizar: limpiar });
      } else {
        // 'una_vez' con preset (sin fin natural, es un loop generado): se
        // limita a una duración corta fija.
        st.handle = iniciarSonidoMusica(config, { loop: true });
        st.timeoutId = setTimeout(() => { st.handle && st.handle.stop(); limpiar(); }, 6000);
      }
    } catch (e) { /* Web Audio no disponible, no es crítico */ }
  }, [activo, config && config.tipo, config && config.nombre, config && config.url, config && config.modo, config && config.duracionSeg]);

  // Si el admin mueve el volumen mientras la música ya está sonando, se
  // ajusta en vivo sin cortar ni reiniciar el loop en curso.
  useEffect(() => {
    if (stRef.current.handle) stRef.current.handle.setVolumen(volumenMultiplicador(config));
  }, [config && config.volumen]);

  // "Duckea" la música mientras se anuncia un número por voz (ver
  // anunciarNumero) -- la voz siempre tiene que escucharse por encima. Idempotente:
  // llamar duckMusica()/unduckMusica() varias veces seguidas no hace nada raro,
  // así que cada anuncio puede llamarlas sin llevar la cuenta de si ya estaba
  // duckeada por un anuncio anterior en la misma racha.
  function duckMusica() {
    const st = stRef.current;
    if (st.handle && !st.ducked) {
      st.ducked = true;
      st.handle.setVolumen(volumenMultiplicador(config) * 0.15);
    }
  }
  function unduckMusica() {
    const st = stRef.current;
    if (st.handle && st.ducked) {
      st.ducked = false;
      st.handle.setVolumen(volumenMultiplicador(config));
    }
  }
  return { duckMusica, unduckMusica };
}

function colLetter(n) {
  if (n <= 15) return 'B';
  if (n <= 30) return 'I';
  if (n <= 45) return 'N';
  if (n <= 60) return 'G';
  return 'O';
}

const COL_COLORS = { B: 'bg-sky-500', I: 'bg-purple-500', N: 'bg-fuchsia-500', G: 'bg-violet-500', O: 'bg-indigo-500' };

// Anuncio por voz de un número cantado, con la voz nativa del navegador
// (gratis, sin backend) -- si el navegador no soporta Web Speech API, no
// hace nada (no rompe el resto de la app). Llamadas sucesivas se encolan
// solas (comportamiento por defecto de speechSynthesis), no se pisan entre sí.
// `onStart`/`onEnd` son los duckMusica()/unduckMusica() de useMusicaTension --
// la voz siempre tiene que escucharse por encima de la música de tensión.
function anunciarNumero(n, { onStart, onEnd } = {}) {
  if (!('speechSynthesis' in window)) return;
  const u = new SpeechSynthesisUtterance(`${colLetter(n)}, ${n}`);
  u.lang = 'es-ES';
  u.rate = 0.95;
  if (onStart) u.onstart = onStart;
  if (onEnd) { u.onend = onEnd; u.onerror = onEnd; }
  window.speechSynthesis.speak(u);
}

// Igual que anunciarNumero pero para un texto arbitrario (ver
// RecordatorioPago) -- solo suena mientras la pestaña siga abierta (aunque
// esté minimizada o el navegador esté en otra app); si el navegador
// realmente la cierra/mata, ahí la única forma de avisar es la notificación
// push nativa (ver frontend/sw.js), que no puede hablar.
function anunciarTexto(texto) {
  if (!('speechSynthesis' in window) || !texto) return;
  const u = new SpeechSynthesisUtterance(texto);
  u.lang = 'es-ES';
  u.rate = 0.95;
  window.speechSynthesis.speak(u);
}

// Convierte la clave pública VAPID (base64url, la que devuelve el backend)
// al Uint8Array que pide PushManager.subscribe -- transformación estándar,
// documentada en cualquier guía de Web Push (no es específica de este repo).
function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
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
const DEFAULT_LOGIN_SUBTITLE = '75 bolillas · en tiempo real';

// Settings context (config global, ej. link del grupo de WhatsApp)
// ---------------------------------------------------------------------------
const SettingsContext = createContext(null);
function useSettings() { return useContext(SettingsContext); }

const DEFAULT_SOUND_CONFIG = {
  alerta: { tipo: 'preset', nombre: 'arpegio' },
  fanfarria: { tipo: 'preset', nombre: 'fanfarria' },
  musica: { tipo: 'off', modo: 'continuo', duracionSeg: 8 },
};

function SettingsProvider({ children }) {
  const { token } = useAuth();
  const [whatsappLink, setWhatsappLink] = useState('');
  const [logoUrl, setLogoUrl] = useState('');
  const [cartonFondoUrl, setCartonFondoUrl] = useState('');
  const [cardTheme, setCardTheme] = useState(DEFAULT_CARD_THEME);
  const [cardShape, setCardShape] = useState('circulo');
  const [bloqueoCartonesPendientes, setBloqueoCartonesPendientes] = useState(false);
  const [loginSubtitle, setLoginSubtitle] = useState(DEFAULT_LOGIN_SUBTITLE);
  const [soundConfig, setSoundConfig] = useState(DEFAULT_SOUND_CONFIG);
  const [reclamosCartaCompleta, setReclamosCartaCompleta] = useState(false);

  function refresh() {
    return Promise.all([
      apiFetch('/settings/whatsapp').then((d) => setWhatsappLink(d.link || '')),
      apiFetch('/settings/reclamos-vista').then((d) => setReclamosCartaCompleta(!!d.cartaCompleta)),
    ]);
  }
  // Público (sin login): el logo, el tema, la forma de marcado, el mensaje
  // bajo el logo y el sonido/música elegidos hacen falta antes de
  // identificarse (pantalla de acceso, "Consulta tu Carta", sala de juego).
  function refreshLogo() {
    return apiFetch('/settings/public').then((d) => {
      setLogoUrl(d.logoUrl || '');
      setCartonFondoUrl(d.cartonFondoUrl || '');
      setCardTheme(d.cardTheme || DEFAULT_CARD_THEME);
      setCardShape(d.cardShape || 'circulo');
      setBloqueoCartonesPendientes(!!d.bloqueoCartonesPendientes);
      setLoginSubtitle(d.loginSubtitle || DEFAULT_LOGIN_SUBTITLE);
      setSoundConfig(d.sonido || DEFAULT_SOUND_CONFIG);
    });
  }
  useEffect(() => { if (token) refresh(); }, [token]);
  useEffect(refreshLogo, []);

  return (
    <SettingsContext.Provider value={{ whatsappLink, refresh, logoUrl, cartonFondoUrl, refreshLogo, cardTheme, cardShape, bloqueoCartonesPendientes, loginSubtitle, soundConfig, reclamosCartaCompleta }}>
      {children}
    </SettingsContext.Provider>
  );
}

// ---------------------------------------------------------------------------
// UI genéricos
// ---------------------------------------------------------------------------
const Card = React.forwardRef(function Card({ children, className }, ref) {
  return (
    <div ref={ref} className={`bg-slate-900/60 backdrop-blur border border-bingopurple/30 rounded-2xl shadow-glow p-5 ${className || ''}`}>
      {children}
    </div>
  );
});

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

function Badge({ children, tone = 'purple' }) {
  const tones = {
    purple: 'bg-bingopurple/30 text-fuchsia-200 border-bingopurple/50',
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
// `centerTitle`: para modales celebratorios (Compra Registrada, ¡BINGO!) donde
// el título es el protagonista visual -- ahí la fila título-a-la-izquierda +
// × a-la-derecha (el layout normal) se leía como "descentrado". El resto de
// los modales sigue con el layout de siempre, sin tocarlos.
function Modal({ title, onClose, children, wide, centerTitle }) {
  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className={`relative bg-slate-900 border border-bingopurple/40 rounded-2xl shadow-glow p-5 w-full ${wide ? 'max-w-4xl' : 'max-w-lg'} max-h-[90vh] overflow-y-auto pop-in`}>
        {centerTitle ? (
          <>
            <h3 className="text-lg font-bold text-fuchsia-200 text-center mb-4 px-6">{title}</h3>
            <button onClick={onClose} className="absolute top-4 right-4 text-slate-400 hover:text-white text-xl leading-none">&times;</button>
          </>
        ) : (
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-bold text-fuchsia-200">{title}</h3>
            <button onClick={onClose} className="text-slate-400 hover:text-white text-xl leading-none">&times;</button>
          </div>
        )}
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
// previa de una app externa, no participa del claro/oscuro de BINGOJULIETA.
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
      <div className="text-right text-[11px] text-slate-500 mt-1">{hora} <span className="text-fuchsia-500">✔✔</span></div>
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
// `badge`: marca chica en la esquina para distinguir visualmente figuras que
// comparten la misma máscara que otra (hoy solo carton_lleno_picado, cuya
// máscara es igual a carton_lleno a propósito -- misma figura, ronda
// distinta) -- sin este badge, las dos se ven como el mismo cuadrito lleno.
function PatternGrid({ mask, size = 16, badge }) {
  if (!mask) return null;
  return (
    <div className="relative inline-block">
      <div className="grid grid-cols-5 gap-0.5 inline-grid">
        {mask.map((row, r) => row.map((v, c) => (
          <div key={r + '-' + c} style={{ width: size, height: size }}
            className={`rounded-sm ${v ? 'bg-gradient-to-br from-bingopurple to-bingoaccent' : 'bg-slate-700/60'}`} />
        )))}
      </div>
      {badge && (
        <span className="absolute -top-1.5 -right-1.5 text-[10px] leading-none bg-amber-400 text-slate-900 rounded-full w-3.5 h-3.5 flex items-center justify-center font-black shadow">{badge}</span>
      )}
    </div>
  );
}

// Único caso hoy: carton_lleno_picado reusa la máscara de carton_lleno
// (misma figura física, ronda extra) -- este badge es lo que las distingue
// a simple vista en cualquier listado.
function badgeDePatron(patron) { return patron === 'carton_lleno_picado' ? '2' : null; }

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
// `respetarBloqueo` es la señal explícita de "esta vista es de un jugador
// (propio o consultando públicamente su carta), no de un admin" — la única
// que debe honrar el toggle "Bloquear cartones sin pago verificado" de
// Configuración. Es un prop aparte de `showCercaDeGanar` a propósito: la
// consulta pública ("Consulta tu Carta") también debe bloquear el cartón,
// pero no por eso empieza a mostrar los avisos de "cerca de ganar".
function MiniCard({ carton, onCellClick, showCercaDeGanar, letra, compact = true, enCombo = false, respetarBloqueo = false, resaltado = false, numerosGanadores }) {
  const { logoUrl, cartonFondoUrl, cardTheme, cardShape, bloqueoCartonesPendientes } = useSettings();
  const cols = ['B', 'I', 'N', 'G', 'O'];
  const style = CARD_COLOR_STYLES[carton.color] || DEFAULT_CARD_STYLE;
  const tema = CARD_THEMES[cardTheme] || CARD_THEMES[DEFAULT_CARD_THEME];
  const marcadosSet = useMemo(() => new Set(carton.marcados || []), [carton.marcados]);
  const bloqueado = bloqueoCartonesPendientes && respetarBloqueo && carton.estado === 'vendido';
  const cerca = (showCercaDeGanar && !bloqueado) ? (carton.cercaDeGanar || []) : [];
  const cercaNumeros = useMemo(() => new Set(cerca.flatMap((f) => f.numeros)), [cerca]);
  // Números que forman la figura YA ganada (distinto de "cerca de ganar") --
  // se resaltan con su propio color/animación festiva sobre la celda ya
  // marcada, tanto en la vista del jugador que ganó como en la del admin.
  // `libre`: si el centro (LIBRE) es parte de la figura, se le pone un borde
  // sin animación (esa celda no "salta" como las numeradas).
  const ganadoraNumeros = useMemo(() => new Set(numerosGanadores?.numeros || []), [numerosGanadores]);
  const libreGanador = !!numerosGanadores?.libre;
  const plano = !!tema.plano;
  // Fondo/borde del cartón: con tema, colores hex del tema (inline style);
  // "sin tema", clases Tailwind atadas al color del sorteo (como antes). Si el
  // admin subió una imagen de fondo personalizada (Configuración > Cartones),
  // se usa esa en vez del degradé del tema, con un tinte translúcido del color
  // del tema encima -- las celdas de números siguen pintando su propio fondo
  // sólido por separado (ver más abajo), así que la legibilidad de los
  // números no depende de este fondo; el tinte es solo para que la foto no
  // choque visualmente con los colores del tema.
  const cardStyle = plano
    ? undefined
    : cartonFondoUrl
    ? {
        backgroundImage: `linear-gradient(${tema.bordeColor}55, ${tema.bordeColor}55), url(${cartonFondoUrl})`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        borderColor: tema.bordeColor,
      }
    : { background: fondoCartonReal(tema), borderColor: tema.bordeColor };
  return (
    <div
      className={`${plano ? '' : 'font-carton'} ${plano ? `bg-slate-800/70 ${style.border}` : ''} border-2 ${plano ? 'rounded-xl shadow' : 'rounded-2xl shadow-lg shadow-black/30'} ${compact ? 'p-1.5' : 'p-2'} ${cerca.length ? 'carton-cerca' : ''} ${resaltado ? 'carton-ganador' : ''}`}
      style={cardStyle}
    >
      {/* Nombre del tema visual activo — solo en la vista grande de un
          cartón suelto (no dentro de una carta combo, eso ya lo muestra
          ComboCard una sola vez arriba de todos sus cartones). Se usa
          `enCombo`, NO `letra`, para decidir esto — en algunos sorteos un
          cartón individual (fuera de cualquier combo) igual trae `letra`
          poblada en los datos, y con `!letra` el badge no aparecía ahí. */}
      {!plano && !compact && !enCombo && (
        <div className="flex justify-center mb-2">
          <span
            className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold"
            style={{ background: `${tema.bordeColor}22`, color: tema.bordeColor, border: `1px solid ${tema.bordeColor}66` }}
          >
            <span className="text-sm leading-none">{tema.libre}</span>
            {tema.nombre}
          </span>
        </div>
      )}
      {letra ? (
        // Dentro de una carta (combo): el cartón no tiene identidad propia —
        // la carta es la que se identifica (nombre, color, estado de pago).
        // Con tema: ficha redonda. "Sin tema": solo la letra en texto plano.
        plano ? (
          <div className={`text-center font-black text-slate-400 mb-1 ${compact ? 'text-[11px]' : 'text-sm'}`}>{letra}</div>
        ) : (
          <div className="flex justify-center mb-1">
            <span className={`inline-flex items-center justify-center rounded-full font-black bg-gradient-to-br ${style.mark} ${style.markText} shadow ${compact ? 'w-4 h-4 text-[9px]' : 'w-6 h-6 text-xs'}`}>{letra}</span>
          </div>
        )
      ) : plano ? (
        <div className={`flex items-center justify-between mb-1 px-1.5 py-0.5 rounded ${style.header}`}>
          <span className="text-xs font-bold">{`#${carton.numero}`}{carton.estado === 'pagado' ? ' ✅' : ''}</span>
          {carton.estado === 'vendido' ? (
            <span className="text-[10px] font-bold text-amber-400">⏳ Pendiente</span>
          ) : (
            <span className="text-[11px]">{carton.color}</span>
          )}
        </div>
      ) : (
        <div className="flex items-center justify-between mb-1.5 gap-1">
          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-black bg-gradient-to-r ${style.mark} ${style.markText} shadow ${compact ? 'text-[10px]' : 'text-xs'}`}>
            {`#${carton.numero}`}{carton.estado === 'pagado' ? ' ✅' : ''}
          </span>
          {carton.estado === 'vendido' ? (
            <span className="text-[10px] font-bold text-amber-400">⏳ Pendiente</span>
          ) : (
            <span className="text-[11px] text-slate-400">{carton.color}</span>
          )}
        </div>
      )}
      {/* Encabezado B-I-N-G-O con el tema visual elegido en Configuración
          (ver CARD_THEMES) — look clásico de cartón de bingo, independiente
          del color/precio del sorteo. "Sin tema" no pinta nada acá. */}
      <div className="relative">
      <div className={`grid grid-cols-5 mt-1 ${compact ? 'gap-0.5' : 'gap-1'} ${bloqueado ? 'blur-sm select-none' : ''}`}>
        {cols.map((c, i) => {
          const headerTxt = Array.isArray(tema.headerTexto) ? tema.headerTexto[i] : tema.headerTexto;
          return (
            <div
              key={c}
              className={`text-center font-black ${plano ? 'text-fuchsia-400' : 'rounded-md shadow-sm'} ${compact ? 'text-[10px] py-0.5' : 'text-sm py-1'}`}
              style={plano ? undefined : {
                background: tema.headerColores[i],
                color: headerTxt,
                textShadow: tema.glow ? `0 0 5px ${tema.headerColores[i]}, 0 0 10px ${tema.headerColores[i]}` : undefined,
              }}
            >
              {c}
            </div>
          );
        })}
        {carton.grid.map((row, r) => row.map((val, c) => {
          const shown = val === null || marcadosSet.has(val);
          const esCercaCelda = !shown && cercaNumeros.has(val);
          const esCeldaGanadora = shown && ganadoraNumeros.has(val);
          const clickable = !!onCellClick && val !== null && !bloqueado;
          const Tag = clickable ? 'button' : 'div';
          // Con tema: casillas marcadas/LIBRE = "bolita" redonda con brillo
          // (imitando una ficha de bingo real) si cardShape es 'circulo'
          // (elegido en Configuración), o se quedan cuadradas (mismos
          // colores) si es 'cuadrado'; sin marcar = celda cuadrada suave con
          // los colores hex del tema (numeroFondo/numeroTexto). "Sin tema":
          // todo cuadrado, sin ring/brillo, colores fijos — el look clásico
          // de antes (cardShape no le aplica). La "bolita"/celda marcada
          // SIEMPRE usa el color del sorteo (style.mark), nunca el tema.
          const shapeClass = plano
            ? 'rounded'
            : (cardShape === 'cuadrado' ? 'rounded-lg' : ((shown || esCercaCelda) ? 'rounded-full' : 'rounded-lg'));
          let cellClass = '';
          let cellStyle;
          if (val === null) {
            if (plano) { cellClass = `bg-slate-900/80 text-slate-300 font-semibold ${libreGanador ? 'ring-2 ring-amber-400' : ''}`; }
            else {
              cellClass = `text-white shadow-[inset_0_-3px_5px_rgba(0,0,0,0.35),inset_0_2px_3px_rgba(255,255,255,0.5)] ${libreGanador ? 'ring-2 ring-amber-400' : 'ring-2 ring-white/70'}`;
              cellStyle = { background: `linear-gradient(135deg, ${tema.headerColores[0]}, ${tema.bordeColor})` };
            }
          } else if (shown && esCeldaGanadora) {
            cellClass = plano
              ? 'bg-gradient-to-br from-amber-400 to-yellow-500 text-white font-black celda-ganadora'
              : 'bg-gradient-to-br from-amber-400 to-yellow-500 text-white font-black ring-2 ring-white/80 celda-ganadora shadow-[inset_0_-3px_5px_rgba(0,0,0,0.35),inset_0_2px_3px_rgba(255,255,255,0.5)]';
          } else if (shown) {
            cellClass = plano
              ? `bg-gradient-to-br ${style.mark} ${style.markText} font-bold`
              : `bg-gradient-to-br ${style.mark} ${style.markText} font-black ring-2 ring-white/60 shadow-[inset_0_-3px_5px_rgba(0,0,0,0.35),inset_0_2px_3px_rgba(255,255,255,0.5)]`;
          } else if (esCercaCelda) {
            cellClass = `bg-amber-500 text-white font-black celda-cerca ${plano ? '' : 'ring-2 ring-white/70'}`;
          } else if (plano) {
            cellClass = 'bg-slate-900/80 text-slate-300 font-semibold border border-white/5';
          } else {
            cellStyle = { background: tema.numeroFondo, color: tema.numeroTexto };
          }
          return (
            <Tag key={r + '-' + c}
              type={clickable ? 'button' : undefined}
              onClick={clickable ? () => onCellClick(val) : undefined}
              style={cellStyle}
              className={`aspect-square flex items-center justify-center overflow-hidden leading-none ${shapeClass} ${cellClass} ${val === null ? (compact ? 'text-[8px]' : 'text-[9px]') : (compact ? 'text-[10px]' : 'text-base')} ${clickable ? 'cursor-pointer active:scale-95 transition' : ''}`}>
              {val === null ? (logoUrl ? <img src={logoUrl} alt="LIBRE" className="w-full h-full object-cover rounded-full" /> : (plano ? 'LIBRE' : tema.libre)) : val}
            </Tag>
          );
        }))}
      </div>
      {bloqueado && (
        // Colores fijos por `style` (no clases de Tailwind): el tema claro
        // reescribe text-amber-200/text-slate-300 a tonos oscuros para verse
        // bien sobre fondos claros, pero acá el fondo del candado siempre es
        // oscuro — con esas clases el texto quedaba casi invisible en tema
        // claro. Mismo criterio que owner-neon-board/-text, más abajo.
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 rounded-xl text-center px-2" style={{ background: 'rgba(2,6,23,0.85)' }}>
          <span className={compact ? 'text-3xl leading-none' : 'text-5xl leading-none'}>🔒</span>
          <span className={`font-black ${compact ? 'text-[10px]' : 'text-xs'}`} style={{ color: '#fde68a' }}>Pago pendiente</span>
          {!compact && <span className="text-[11px] leading-tight" style={{ color: '#e2e8f0' }}>Envía tu comprobante para ver tu cartón</span>}
        </div>
      )}
      </div>
      {cerca.length > 0 && (
        <div className="mt-1.5 text-[11px] text-amber-300 font-semibold space-y-0.5 bg-slate-950/60 rounded-md px-1.5 py-1">
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
function ComboCard({ grupo, color, cartones, onCellClick, showCercaDeGanar, compact = true, respetarBloqueo = false, cartonGanadorId = null, numerosGanadores }) {
  const { cardTheme } = useSettings();
  const style = CARD_COLOR_STYLES[color] || DEFAULT_CARD_STYLE;
  const tema = CARD_THEMES[cardTheme] || CARD_THEMES[DEFAULT_CARD_THEME];
  return (
    <div className={`font-carton rounded-2xl border-2 ${style.border} bg-slate-900/60 shadow-glow overflow-hidden`}>
      <div className={`flex items-center justify-between flex-wrap gap-x-2 gap-y-0.5 px-3 py-2 bg-gradient-to-r ${style.mark} ${style.markText}`}>
        <span className="font-black text-sm">🎫 Carta {grupo}</span>
        <span className="text-[11px] font-semibold opacity-90">{color} · {cartones.length} cartones</span>
        {/* Estado de pago: los cartones de una carta se compran y se pagan
            siempre juntos, así que el aviso va acá (una sola vez), no
            repetido en cada cartón individual. */}
        {cartones[0]?.estado === 'vendido' && <span className="text-[11px] font-bold text-amber-200">⏳ Pendiente</span>}
        {cartones[0]?.estado === 'pagado' && <span className="text-[11px] font-bold text-emerald-200">✅ Pagado</span>}
      </div>
      {/* Nombre del tema visual — una sola vez acá (no repetido en cada
          MiniCard de adentro), y solo en la vista grande (no compact). */}
      {!tema.plano && !compact && (
        <div className="flex justify-center pt-2">
          <span
            className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold"
            style={{ background: `${tema.bordeColor}22`, color: tema.bordeColor, border: `1px solid ${tema.bordeColor}66` }}
          >
            <span className="text-sm leading-none">{tema.libre}</span>
            {tema.nombre}
          </span>
        </div>
      )}
      {/* Siempre 2 columnas (mantiene el formato de "carta" reconocible). En
          compact, el piso mínimo va puesto en la COLUMNA del grid (no en el
          hijo): grid-cols-2 de Tailwind fija el mínimo de cada columna en 0,
          así que un min-width en el hijo no lo respeta y los cartones
          terminan superpuestos. Con el mínimo en la columna, si el celular es
          angosto el panel se desliza horizontalmente en vez de superponerse o
          encogerse hasta ser ilegible. Sin compact (vista "apilado", ancho
          completo) no hace falta ningún piso — grid-cols-2 normal alcanza. */}
      <div className={`relative ${compact ? 'grid grid-cols-[repeat(2,minmax(97px,1fr))] gap-1 p-1 overflow-x-auto' : 'grid grid-cols-2 gap-2 p-2'}`}>
        {cartones.map((c, i) => (
          <MiniCard
            key={c.id || i}
            carton={c}
            letra={c.letra || LETRAS[i]}
            onCellClick={onCellClick ? (n) => onCellClick(c, n) : undefined}
            showCercaDeGanar={showCercaDeGanar}
            respetarBloqueo={respetarBloqueo}
            resaltado={cartonGanadorId != null && c.id === cartonGanadorId}
            numerosGanadores={cartonGanadorId != null && c.id === cartonGanadorId ? numerosGanadores : undefined}
            compact={compact}
            enCombo
          />
        ))}
        {/* Bola con el número de la carta, justo en la intersección de los 4
            cartones — solo tiene sentido geométrico con exactamente 4 (grilla
            2x2 pareja); con 2 o 3 no hay un centro real que marcar. */}
        {cartones.length === 4 && (
          <div
            className={`absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-10 flex items-center justify-center rounded-full font-black text-white shadow-lg ring-2 ring-white/90 bg-gradient-to-br ${style.mark} ${compact ? 'w-6 h-6 text-[11px]' : 'w-10 h-10 text-base'}`}
          >
            {grupo}
          </div>
        )}
      </div>
    </div>
  );
}
// Panel de apoyo con los números 1-75 (B-I-N-G-O). Ya no hay bolillas
// "cantadas" por el sistema — todos los números están siempre disponibles
// para tocar. Tocar uno marca/desmarca ese número en todos los cartones
// propios del sorteo que lo contengan, a la vez.
function NumberBoard75({ marcadosGlobal, cercaGlobal, onToggle, compact = true }) {
  const cols = { B: [], I: [], N: [], G: [], O: [] };
  for (let n = 1; n <= 75; n++) cols[colLetter(n)].push(n);
  return (
    <div className={`grid grid-cols-5 select-none ${compact ? 'gap-0.5' : 'gap-1'}`}>
      {Object.entries(cols).map(([letter, nums]) => (
        <div key={letter} className={`flex flex-col items-center ${compact ? 'gap-0.5' : 'gap-1'}`}>
          <div className={`w-full text-center font-black text-white rounded ${COL_COLORS[letter]} py-1 overflow-hidden ${compact ? 'text-[10px]' : 'text-xs'}`}>{letter}</div>
          {nums.map((n) => {
            const active = marcadosGlobal.has(n);
            // Un número que a algún cartón le falta para bingo se resalta acá
            // también (no solo dentro del cartón) — solo tiene sentido si
            // todavía no está marcado.
            const esperando = !active && cercaGlobal && cercaGlobal.has(n);
            return (
              <button
                key={n}
                onClick={() => onToggle && onToggle(n)}
                className={`w-full min-w-0 overflow-hidden leading-none font-bold rounded py-1.5 border transition ${compact ? 'text-[10px]' : 'text-sm'} ${
                  active
                    ? 'bg-gradient-to-br from-bingopurple to-bingoaccent text-white border-bingoaccent font-bold'
                    : esperando
                    ? 'bg-amber-500 text-white border-amber-300 font-black celda-cerca'
                    : 'bg-slate-700 text-slate-200 border-slate-600 hover:bg-slate-600'
                }`}
              >
                {n}
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}

// Bola grande con el último número cantado (el que el admin va sacando del
// bombo a mano). Se muestra igual en el panel del admin (que la controla
// tocando el NumberBoard75 de al lado) y en la sala del jugador (solo
// lectura, se actualiza sola por socket) — mismo `numerosExtraidos` en
// ambos lados, viene de sorteo.numerosExtraidos (ver computeStats).
// `onBolaClick` (opcional, solo lo pasa el jugador, no el admin): tocar la
// bola grande marca/desmarca ese número en el panel de apoyo (y en todos los
// cartones propios que lo tengan) — mismo efecto que tocarlo directo en el
// NumberBoard75 de abajo, así no hace falta buscarlo en la grilla. `marcado`
// dice si ese número YA está marcado, para el ✓ y que quede claro qué toca.
function BolaActual({ numerosExtraidos, onBolaClick, marcadosGlobal }) {
  const ultimo = numerosExtraidos.length ? numerosExtraidos[numerosExtraidos.length - 1] : null;
  const marcado = ultimo != null && marcadosGlobal && marcadosGlobal.has(ultimo);
  const clickable = ultimo != null && !!onBolaClick;
  const BolaTag = clickable ? 'button' : 'div';
  return (
    <div className="flex flex-col items-center">
      {ultimo != null ? (
        <BolaTag
          key={ultimo}
          type={clickable ? 'button' : undefined}
          onClick={clickable ? () => onBolaClick(ultimo) : undefined}
          className={`relative bingo-ball pop-in w-24 h-24 rounded-full flex flex-col items-center justify-center font-black text-white ${COL_COLORS[colLetter(ultimo)]} ${clickable ? 'cursor-pointer active:scale-95 transition' : ''}`}
        >
          <span className="text-xs leading-none opacity-90">{colLetter(ultimo)}</span>
          <span className="text-3xl leading-none">{ultimo}</span>
          {marcado && (
            <span className="absolute -top-1 -right-1 bg-emerald-500 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs border-2 border-slate-900">✓</span>
          )}
        </BolaTag>
      ) : (
        <div className="w-24 h-24 rounded-full flex items-center justify-center font-bold text-slate-500 border-2 border-dashed border-slate-600 text-xs text-center px-2 leading-tight">
          Esperando el primer número...
        </div>
      )}
      <span className="text-xs text-slate-400 mt-1.5">
        {numerosExtraidos.length} cantados de 75{clickable ? ' · toca la bola para marcarla' : ''}
      </span>
    </div>
  );
}

// Historial de bolitas chicas en orden real de salida (cronológico, la
// primera cantada a la izquierda) — todas las cantadas antes de la última
// (que muestra BolaActual). Antes usaban scroll horizontal: con muchos
// números cantados había que scrollear para encontrar uno, y daba la
// sensación de que algunos "desaparecían" o no se reflejaban. Ahora
// envuelven en vez de scrollear, así ninguno queda fuera de vista sin
// importar cuántos se hayan cantado.
function HistorialBolas({ numerosExtraidos }) {
  const historial = numerosExtraidos.length > 1 ? numerosExtraidos.slice(0, -1) : [];
  if (!historial.length) return null;
  return (
    <div className="flex flex-wrap gap-1.5 max-w-full pb-1 px-1 justify-center">
      {historial.map((n) => (
        <div key={n} className={`shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold text-white ${COL_COLORS[colLetter(n)]}`}>
          {n}
        </div>
      ))}
    </div>
  );
}

// Combina bola grande + historial — se usa donde van juntas (panel del
// admin). En la sala del jugador van separadas: ver UserJugar (la bola se
// movió adentro del Panel de apoyo, el historial se quedó en su tarjeta).
function LlamadorBolas({ numerosExtraidos, onBolaClick, marcadosGlobal }) {
  return (
    <div className="flex flex-col items-center gap-3">
      <BolaActual numerosExtraidos={numerosExtraidos} onBolaClick={onBolaClick} marcadosGlobal={marcadosGlobal} />
      <HistorialBolas numerosExtraidos={numerosExtraidos} />
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
      <h2 className="text-center font-bold text-fuchsia-100 mb-4">Verifícate en la Lista</h2>
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

// Consulta pública de una carta/cartón: cualquiera que sepa el número puede
// verla y descargarla, sin login ni datos personales. Si el sorteo vende por
// combo, se busca por número de carta y se muestra/descarga completa (todos
// sus cartones juntos, sin separarlos).
// Pill con el ícono + nombre del tema visual activo (ver CARD_THEMES) — se
// muestra junto al resultado de una consulta para que el jugador sepa qué
// tema está puesto, sin tener que adivinarlo solo por los colores del
// cartón. "ninguno" (el clásico sin tema) no muestra nada: no hay tema que anunciar.
function TemaBadge({ temaId }) {
  const tema = CARD_THEMES[temaId];
  if (!tema || tema.plano) return null;
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold transition duration-300 hover:scale-105 hover:shadow-[0_0_12px_var(--tema-glow)]"
      style={{
        borderColor: tema.bordeColor,
        color: tema.bordeColor,
        backgroundColor: `${tema.bordeColor}1a`,
        '--tema-glow': tema.bordeColor,
      }}
      title={`Tema visual: ${tema.nombre}`}
    >
      <span className="text-sm">{tema.libre}</span>
      Tema: {tema.nombre}
    </span>
  );
}

function ConsultaCartonesPanel({ onVolver }) {
  const { cardTheme, bloqueoCartonesPendientes } = useSettings();
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
  const numeroBuscadoRef = useRef(''); // último valor efectivamente buscado (no el input en vivo, que puede diferir sin haber tocado "Consultar")
  const nombreBuscadoRef = useRef('');

  useEffect(() => {
    apiFetch('/sorteos/publicos').then((d) => {
      setSorteosPublicos(d.sorteos);
      if (d.sorteos.length === 1) setSorteoElegido(d.sorteos[0].id);
    });
  }, []);

  // Sin esto, un cartón bloqueado (pago pendiente) quedaba borroso para
  // siempre hasta que la persona volviera a buscar a mano: esta pantalla es
  // pública/sin login y no tenía ningún listener de socket. Re-consulta en
  // silencio (sin tocar `loading`, para no hacer parpadear la UI) apenas el
  // admin confirma el pago de este sorteo — así se desbloquea solo, igual
  // que en la sala de juego.
  useEffect(() => {
    if (!sorteoElegido) return;
    socket.emit('join-sorteo', { sorteoId: sorteoElegido });
    const onCambio = (p) => {
      if (p.sorteoId != sorteoElegido) return;
      if (resultado && numeroBuscadoRef.current) {
        const params = new URLSearchParams({ sorteo_id: sorteoElegido, numero: numeroBuscadoRef.current });
        apiFetch('/cartones/consulta?' + params.toString()).then((d) => { if (d.encontrado) setResultado(d); }).catch(() => {});
      }
      if (personaElegida) {
        const params = new URLSearchParams({ sorteo_id: sorteoElegido, nombre: nombreBuscadoRef.current });
        apiFetch('/cartones/consulta-nombre?' + params.toString()).then((d) => {
          const fresca = d.resultados.find((p) => p.jugador_id === personaElegida.jugador_id);
          if (fresca) setPersonaElegida(fresca);
        }).catch(() => {});
      }
    };
    socket.on('cartones-actualizados', onCambio);
    return () => {
      socket.emit('leave-sorteo', { sorteoId: sorteoElegido });
      socket.off('cartones-actualizados', onCambio);
    };
  }, [sorteoElegido, resultado, personaElegida]);

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
    numeroBuscadoRef.current = numero.trim();
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
    nombreBuscadoRef.current = nombreQuery.trim();
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
      <h2 className="text-center font-bold text-fuchsia-100 mb-4">Consulta tu Carta</h2>

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
          <div className="flex justify-center"><TemaBadge temaId={cardTheme} /></div>
          <div className="text-center">
            <div className="text-[11px] uppercase tracking-widest text-slate-400 mb-1">Este cartón pertenece a</div>
            <div className="owner-neon-board">
              <span className="owner-neon-text">{resultado.cartones[0].owner_nombre || 'Sin dueño (disponible)'}</span>
            </div>
          </div>
          {resultado.cartones.length > 1
            ? <ComboCard grupo={resultado.cartones[0].grupo} color={resultado.cartones[0].color} cartones={resultado.cartones} compact={false} respetarBloqueo />
            : <MiniCard carton={resultado.cartones[0]} letra={resultado.cartones[0].letra} compact={false} respetarBloqueo />}
          {/* Sin descarga mientras esté bloqueado — el PNG se genera aparte
              del DOM (no hereda el blur), así que mostraría el cartón limpio. */}
          {!(bloqueoCartonesPendientes && resultado.cartones[0]?.estado === 'vendido') && (
            <Button
              variant="ghost"
              className="w-full"
              onClick={() => descargarCartaPNG(resultado.cartones, resultado.cartones[0].grupo, resultado.sorteo.color)}
            >
              ⬇ Descargar
            </Button>
          )}
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
          <div className="flex justify-center"><TemaBadge temaId={cardTheme} /></div>
          <div className="text-center">
            <div className="text-[11px] uppercase tracking-widest text-slate-400 mb-1">Este cartón pertenece a</div>
            <div className="owner-neon-board">
              <span className="owner-neon-text">{personaElegida.nombre}</span>
            </div>
          </div>
          {!personaElegida.grupos.length && (
            <p className="text-sm text-slate-500 text-center">Todavía no tiene cartones asignados en este sorteo.</p>
          )}
          {personaElegida.grupos.map((g) => (
            <div key={g.grupo} className="space-y-2">
              {g.cartones.length > 1
                ? <ComboCard grupo={g.grupo} color={g.cartones[0].color} cartones={g.cartones} compact={false} respetarBloqueo />
                : <MiniCard carton={g.cartones[0]} letra={g.cartones[0].letra} compact={false} respetarBloqueo />}
              {!(bloqueoCartonesPendientes && g.cartones[0]?.estado === 'vendido') && (
              <Button
                variant="ghost"
                className="w-full"
                onClick={() => descargarCartaPNG(g.cartones, g.grupo, sorteoNombre.color)}
              >
                ⬇ Descargar
              </Button>
              )}
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

// "Recordarme": guarda nombre+whatsapp en este dispositivo para no tener que
// volver a tipearlos cada vez que se abre la app (ej. después de cerrar
// sesión, o cuando el token de 30 días venció). Es independiente de la
// sesión (el token) -- solo precompleta el formulario, no mantiene logueado
// a nadie por su cuenta.
const RECORDAR_JUGADOR_KEY = 'bingo_jugador_recordado';
function cargarJugadorRecordado() {
  try {
    const guardado = JSON.parse(localStorage.getItem(RECORDAR_JUGADOR_KEY) || 'null');
    return guardado && guardado.nombre && guardado.whatsapp ? guardado : null;
  } catch (e) { return null; }
}

function AuthScreen() {
  const { login } = useAuth();
  const { logoUrl, loginSubtitle } = useSettings();
  // Permite abrir directo en "Verifícate en la Lista" o en "Consulta tus
  // Cartones" con un link tipo ?ver=lista o ?ver=consulta
  const [mode, setMode] = useState(() => {
    const v = new URLSearchParams(window.location.search).get('ver');
    return v === 'lista' || v === 'consulta' ? v : 'jugador';
  }); // 'jugador' | 'admin' | 'lista' | 'consulta'
  const jugadorRecordado = cargarJugadorRecordado();
  const [jugadorForm, setJugadorForm] = useState(jugadorRecordado || { nombre: '', whatsapp: '' });
  // Marcado por defecto (incluso la primera vez, sin nada guardado todavía):
  // el jugador ya queda logueado 30 días sin pedir permiso, así que precompletar
  // el formulario la próxima vez es una molestia menor comparada con eso.
  const [recordarme, setRecordarme] = useState(true);
  const [adminForm, setAdminForm] = useState({ username: '', password: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function entrarJugador(e) {
    e.preventDefault();
    setError('');
    if (!/^\d{10,11}$/.test(jugadorForm.whatsapp)) {
      setError('El WhatsApp debe tener entre 10 y 11 dígitos, solo números.');
      return;
    }
    setLoading(true);
    try {
      const data = await apiFetch('/auth/jugador', { method: 'POST', body: JSON.stringify(jugadorForm) });
      if (recordarme) localStorage.setItem(RECORDAR_JUGADOR_KEY, JSON.stringify(jugadorForm));
      else localStorage.removeItem(RECORDAR_JUGADOR_KEY);
      login(data.token, data.user);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

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
      {mode !== 'admin' && (
        <button
          type="button"
          onClick={() => { setMode('admin'); setError(''); }}
          title="Administración"
          aria-label="Administración"
          className="absolute top-4 left-4 text-slate-600/40 hover:text-slate-400 hover:opacity-100 opacity-50 transition text-lg leading-none p-2"
        >
          🔒
        </button>
      )}
      <div className={`w-full ${mode === 'consulta' ? 'max-w-2xl' : 'max-w-md'}`}>
        <div className="text-center mb-6">
          <img src={logoUrl || "logo.png"} alt="Bingo la Negra" className="w-24 h-24 mx-auto mb-2 rounded-full object-cover border-2 border-bingoaccent shadow-glow" />
          <h1 className="text-2xl font-black bg-gradient-to-r from-fuchsia-300 to-pink-400 bg-clip-text text-transparent">Bingo la Negra</h1>
          <p className="text-sm subtitulo-animado credito-neon">{loginSubtitle}</p>
        </div>
        <Card>
          {mode === 'lista' ? (
            <VerificarListaPanel onVolver={() => setMode('jugador')} />
          ) : mode === 'consulta' ? (
            <ConsultaCartonesPanel onVolver={() => setMode('jugador')} />
          ) : mode === 'jugador' ? (
            <>
              <h2 className="text-center font-bold text-fuchsia-100 mb-4">Ingresa para continuar</h2>
              <form onSubmit={entrarJugador} className="space-y-3">
                <div>
                  <Label>Nombre completo</Label>
                  <Input required value={jugadorForm.nombre} onChange={(e) => setJugadorForm({ ...jugadorForm, nombre: e.target.value })} placeholder="Tu nombre completo" />
                </div>
                <div>
                  <Label>Número de WhatsApp</Label>
                  <Input required inputMode="numeric" pattern="[0-9]*" maxLength={11} value={jugadorForm.whatsapp} onChange={(e) => setJugadorForm({ ...jugadorForm, whatsapp: e.target.value.replace(/\D/g, '').slice(0, 11) })} placeholder="04121234567" />
                </div>
                <label className="flex items-center gap-2 text-sm text-slate-300">
                  <input type="checkbox" checked={recordarme} onChange={(e) => setRecordarme(e.target.checked)} />
                  Recordarme en este dispositivo
                </label>
                {error && <div className="text-red-400 text-sm bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2">{error}</div>}
                <Button className="w-full" disabled={loading}>{loading ? 'Ingresando...' : 'Entrar'}</Button>
              </form>
              <button
                type="button"
                onClick={() => setMode('lista')}
                className="w-full mt-3 text-sm text-slate-400 hover:text-slate-200 border border-slate-700 rounded-xl py-2 transition"
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
            </>
          ) : (
            <>
              <h2 className="text-center font-bold text-fuchsia-100 mb-4">Acceso Administrador</h2>
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
                onClick={() => { setMode('jugador'); setError(''); }}
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
function Shell({ title, tabs, active, onTab, right, children, neonTitle }) {
  const { logoUrl } = useSettings();
  return (
    <div className="min-h-screen flex">
      <aside className="w-60 shrink-0 bg-slate-950/60 border-r border-bingopurple/20 p-4 hidden md:flex md:flex-col gap-1">
        <div className="flex items-center gap-2 mb-6 px-2">
          <img src={logoUrl || "logo.png"} alt="Bingo la Negra" className="w-9 h-9 rounded-full object-cover shrink-0" />
          <span className="font-black text-fuchsia-200 text-sm leading-tight">Bingo la Negra</span>
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
            {/* El título de la sala del jugador usa el mismo brillo neón
                (credito-neon) que el login, para que se sienta parte del
                mismo diseño en vez de un genérico "Mi Bingo". */}
            <h1 className={neonTitle ? 'text-xl credito-neon' : 'text-lg font-bold text-fuchsia-100'}>{title}</h1>
          </div>
          <div className="flex items-center gap-3">{right}</div>
        </header>
        <div className="flex md:hidden flex-wrap gap-1.5 px-3 py-2 bg-slate-950/50">
          {tabs.map((t) => (
            <button key={t.key} onClick={() => onTab(t.key)} className={`flex-1 min-w-[105px] px-2 py-1.5 rounded-lg text-xs text-center leading-tight ${active === t.key ? 'bg-bingopurple text-white' : 'bg-slate-800 text-slate-400'}`}>{t.icon} {t.label}</button>
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
      {user.role === 'jugador' && <Badge tone="green">📱 {user.whatsapp}</Badge>}
      <span className="text-sm text-slate-300">{user.role === 'admin' ? user.username : user.nombre}</span>
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
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [panelId, setPanelId] = useState(null);
  const [error, setError] = useState('');
  const [showEditorFigura, setShowEditorFigura] = useState(false);

  const emptyForm = { fecha_hora: '', rango_desde: 1, rango_hasta: 100, color: 'Verde', tipo_venta: 1, costo: 1, porcentaje_ganancia: 30, modo_premio: 'porcentaje', figuras: [], ventas_habilitadas: false };
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
    Promise.all([apiFetch('/sorteos'), apiFetch('/sorteos/patrones')])
      .then(([s, p]) => { setSorteos(s.sorteos); setPatrones(p.patrones); })
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
    if (!form.figuras.length) { setError('Elige al menos una figura.'); return; }
    if (form.modo_premio === 'porcentaje' && sumaPorcentaje !== 100) {
      setError(`El % de las figuras debe sumar 100 (suma actual: ${sumaPorcentaje}).`);
      return;
    }
    if (form.modo_premio === 'monto_fijo' && faltaMonto) {
      setError('Cada figura debe tener un monto en Bs mayor a 0.');
      return;
    }
    const patronesElegidos = new Set(form.figuras.map((f) => f.patron));
    for (const f of form.figuras) {
      const base = DEPENDENCIAS_FIGURAS[f.patron];
      if (base && !patronesElegidos.has(base)) {
        setError(`Para jugar "${patrones.find((p) => p.key === f.patron)?.label || f.patron}" primero debes elegir "${patrones.find((p) => p.key === base)?.label || base}".`);
        return;
      }
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
        <h2 className="text-xl font-bold text-fuchsia-100">Sorteos</h2>
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
              <Label>Color del Cartón</Label>
              <Select value={form.color} onChange={(e) => setForm({ ...form, color: e.target.value })}>
                {COLORS.map((c) => <option key={c} value={c}>{c}</option>)}
              </Select>
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
              <Label>Tipo de Venta (Combo)</Label>
              <Select value={form.tipo_venta} onChange={(e) => setForm({ ...form, tipo_venta: Number(e.target.value) })}>
                {COMBOS.map((c) => <option key={c} value={c}>{c === 1 ? '1 Cartón' : `Combo x${c}`}</option>)}
              </Select>
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
                <button type="button" onClick={() => setShowEditorFigura(true)} className="text-xs text-fuchsia-300 hover:text-fuchsia-200 underline shrink-0">+ Crear figura personalizada</button>
              </div>
              <div className="grid sm:grid-cols-2 gap-2 bg-slate-800/40 rounded-xl p-3 border border-bingopurple/20 max-h-72 overflow-y-auto">
                {patrones.map((p) => {
                  const fig = form.figuras.find((f) => f.patron === p.key);
                  return (
                    <div key={p.key} className={`flex items-center gap-2 rounded-lg px-2 py-1.5 border ${fig ? 'border-bingoaccent bg-bingopurple/10' : 'border-transparent'}`}>
                      <input type="checkbox" checked={!!fig} onChange={() => toggleFigura(p.key)} className="accent-bingoaccent" />
                      <PatternGrid mask={p.preview} size={12} badge={badgeDePatron(p.key)} />
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
                  <div className="text-xl font-black text-fuchsia-300">{money(premioMax)}</div>
                </div>
              ) : form.modo_premio === 'monto_fijo' ? (
                <div className="text-center">
                  <div className="text-xs text-slate-400">Total Premios Fijos (suma de figuras)</div>
                  <div className="text-xl font-black text-fuchsia-300">{money(totalMontoFijo)}</div>
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
                    return <span key={f.patron}>{label}: <b className="text-fuchsia-300">{money(premioMax * (f.porcentaje / 100))}</b> ({f.porcentaje}%)</span>;
                  })}
                </div>
              )}
              {form.figuras.length > 0 && form.modo_premio === 'monto_fijo' && (
                <div className="md:col-span-2 flex flex-wrap justify-center gap-x-4 gap-y-1 text-xs text-slate-300 border-t border-slate-700/50 pt-3">
                  {form.figuras.map((f) => {
                    const label = patrones.find((p) => p.key === f.patron)?.label || f.patron;
                    return <span key={f.patron}>{label}: <b className="text-fuchsia-300">{money(f.monto)}</b></span>;
                  })}
                </div>
              )}
              <div className="md:col-span-2 text-xs text-slate-500 text-center">{grupos} cartas</div>
            </div>

            <div className="md:col-span-2 flex items-center gap-2">
              <input type="checkbox" id="ventas_habilitadas" checked={form.ventas_habilitadas} onChange={(e) => setForm({ ...form, ventas_habilitadas: e.target.checked })} className="accent-bingoaccent" />
              <label htmlFor="ventas_habilitadas" className="text-sm text-slate-300">
                🔓 Empezar con las ventas ya habilitadas (si lo dejas sin marcar, el sorteo nace cerrado — 🔒 lo habilitas vos después desde el panel)
              </label>
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
        <>
          {/* Tabla completa — solo en pantallas anchas (sm+). En celular se
              lee mejor como tarjetas apiladas (ver bloque de abajo) que
              forzando scroll horizontal para ver las 11 columnas. */}
          <Card className="hidden sm:block overflow-x-auto">
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
                              <PatternGrid mask={patrones.find((p) => p.key === f.patron)?.preview} size={8} badge={badgeDePatron(f.patron)} />
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
                      <td className="py-2 pr-3 text-fuchsia-300 font-semibold">{money(s.premioAcumulado)}</td>
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

          {/* Tarjetas — solo en celular (debajo de sm). Mismos datos que la
              tabla de arriba, apilados en vez de en columnas, para no
              necesitar scroll horizontal. */}
          <div className="sm:hidden space-y-3">
            {sorteos.map((s) => (
              <Card key={s.id} className="space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="text-slate-400 text-sm">#{s.id}</span>
                    <Badge>{s.color}</Badge>
                  </div>
                  <Badge tone={s.estatus === 'activo' ? 'green' : s.estatus === 'en_juego' ? 'yellow' : s.estatus === 'pausado' ? 'red' : 'gray'}>{s.estatus}</Badge>
                </div>
                <div className="text-xs text-slate-400">{s.fecha_hora?.replace('T', ' ')}</div>
                <div className="flex flex-col gap-1">
                  {(s.figuras || []).map((f) => (
                    <div key={f.patron} className="flex items-center gap-1.5">
                      <PatternGrid mask={patrones.find((p) => p.key === f.patron)?.preview} size={8} badge={badgeDePatron(f.patron)} />
                      <span className="text-xs text-slate-400">
                        {f.label} ({s.modo_premio === 'monto_fijo' ? money(f.monto) : s.modo_premio === 'sin_premio' ? 'sin monto' : `${f.porcentaje}%`}){f.ganada ? ' ✅' : ''}
                      </span>
                    </div>
                  ))}
                </div>
                <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-sm pt-2 border-t border-slate-700/50">
                  <div><span className="text-slate-500 text-xs block">Venta</span>{s.tipo_venta === 1 ? '1 Cartón' : `Combo x${s.tipo_venta}`}</div>
                  <div><span className="text-slate-500 text-xs block">Costo</span>{money(s.costo)}</div>
                  <div><span className="text-slate-500 text-xs block">Vendidos</span>{s.vendidos}/{s.totalCartones}</div>
                  <div><span className="text-slate-500 text-xs block">Tu Ganancia</span><span className="text-emerald-400 font-semibold">{money(s.gananciaActual)}</span></div>
                  <div className="col-span-2"><span className="text-slate-500 text-xs block">Premio Acumulado</span><span className="text-fuchsia-300 font-semibold">{money(s.premioAcumulado)}</span></div>
                </div>
                <div className="flex gap-2 pt-1">
                  <Button variant="ghost" className="flex-1" onClick={() => setPanelId(s.id)}>🎙️ Panel</Button>
                  <Button variant="danger" onClick={() => eliminar(s.id)}>🗑️</Button>
                </div>
              </Card>
            ))}
            {!sorteos.length && <p className="text-center text-slate-500 py-8">No hay sorteos creados aún.</p>}
          </div>
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// PANEL SORTEADOR AUTOMATIZADO (en vivo, vía WebSockets)
// ---------------------------------------------------------------------------
function SorteoDrawPanel({ sorteoId, onClose }) {
  const { reclamosCartaCompleta } = useSettings();
  const [sorteo, setSorteo] = useState(null);
  const [patrones, setPatrones] = useState([]);
  useEffect(() => { apiFetch('/sorteos/patrones').then((d) => setPatrones(d.patrones)); }, []);
  const [cartones, setCartones] = useState([]);
  const [ganadores, setGanadores] = useState([]);
  // Los avisos de "¡BINGO!" se ocultan solos a los 30s (o antes con la ×) para
  // que no se queden estorbando la pantalla mientras se sigue jugando.
  function ocultarGanador(ganadorId) { setGanadores((prev) => prev.filter((g) => g.ganadorId !== ganadorId)); }
  function programarAutoOcultar(ganadorId) { setTimeout(() => ocultarGanador(ganadorId), 30000); }
  const [reclamos, setReclamos] = useState([]);
  const [avisosReclamo, setAvisosReclamo] = useState([]); // avisos grandes de reclamos nuevos, sin confirmar
  const [confirmInvalidar, setConfirmInvalidar] = useState(null); // reclamo pendiente de confirmar en el modal de invalidar (null = cerrado)
  const [bingoManualQuery, setBingoManualQuery] = useState(''); // búsqueda por número de cartón/combo
  const [bingoManualResultados, setBingoManualResultados] = useState(null); // null = sin buscar aún
  const [bingoManualCarton, setBingoManualCarton] = useState(null); // cartón elegido para confirmar
  const [bingoManualPatron, setBingoManualPatron] = useState('');
  const [bingoManualMarcados, setBingoManualMarcados] = useState([]); // marcado a mano, solo local hasta confirmar
  const [conjuntosAbiertos, setConjuntosAbiertos] = useState(new Set());
  // Reclamos/ganadores ya avisados (por socket o por sondeo/reconexión), para
  // no repetir el mismo aviso dos veces. null = todavía no se cargó la
  // primera vez (evita re-avisar de golpe todo lo que ya estaba pendiente al
  // abrir el panel).
  const reclamosVistosRef = useRef(null);
  const ganadasVistasRef = useRef(null);

  function toggleConjuntoAbierto(grupo) {
    setConjuntosAbiertos((prev) => {
      const s = new Set(prev);
      s.has(grupo) ? s.delete(grupo) : s.add(grupo);
      return s;
    });
  }

  const [numerosInput, setNumerosInput] = useState('');
  const [modoAccion, setModoAccion] = useState('numero'); // 'numero' | 'nombre'
  const [nombreAccionInput, setNombreAccionInput] = useState('');
  // Selector de persona (en vez de texto libre): nombres con emojis/apodos/
  // apellidos parecidos hacen que un match de substring sea ambiguo o
  // directamente falle — se busca a medida que se escribe y el admin elige
  // UNA persona de la lista antes de poder verificar/liberar, así la acción
  // siempre cae sobre el jugador exacto (jugador_id), nunca por texto suelto.
  const [resultadosNombre, setResultadosNombre] = useState([]);
  const [jugadorSeleccionado, setJugadorSeleccionado] = useState(null);
  const [accionMsg, setAccionMsg] = useState('');

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
    for (const f of figurasEdit) {
      const base = DEPENDENCIAS_FIGURAS[f.patron];
      if (base && !patronesUsadosEdit.has(base)) {
        setFigurasError(`Para jugar "${patrones.find((p) => p.key === f.patron)?.label || f.patron}" primero debes elegir "${patrones.find((p) => p.key === base)?.label || base}".`);
        return;
      }
    }
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
        setGanadores((prev) => {
          const agregados = nuevos.filter((g) => !prev.some((p) => p.ganadorId === g.ganadorId));
          agregados.forEach((g) => programarAutoOcultar(g.ganadorId));
          return [...prev, ...agregados];
        });
      }
    });
    apiFetch('/cartones?sorteo_id=' + sorteoId).then((d) => setCartones(d.cartones.filter((c) => c.estado !== 'disponible')));
    loadReclamos();
  }

  // Cantar/deshacer un número del bombo (tablero 1-75 de abajo) — toggle: si
  // ya estaba cantado, tocarlo de nuevo lo deshace. El estado real vive en el
  // servidor (sorteo.numerosExtraidos); acá solo se dispara el pedido, el
  // socket 'numeros-cantados' (o la respuesta misma) actualiza la vista.
  async function llamarNumero(numero) {
    try {
      const d = await apiFetch(`/sorteos/${sorteoId}/llamar-numero`, { method: 'PUT', body: JSON.stringify({ numero }) });
      setSorteo((prev) => (prev ? { ...prev, numerosExtraidos: d.numerosExtraidos } : prev));
    } catch (e) { setAccionMsg(e.message); }
  }

  // "Minimizar" es solo visual (no se guarda, cada admin lo deja como
  // prefiera al entrar). El interruptor de activar/desactivar SÍ se guarda
  // en el sorteo (cantador_activo) porque afecta también lo que ve el
  // jugador en su sala.
  const [cantadorAbierto, setCantadorAbierto] = useState(true);
  const [guardandoCantador, setGuardandoCantador] = useState(false);
  async function toggleCantadorActivo() {
    setGuardandoCantador(true);
    try {
      const nuevoActivo = !sorteo.cantadorActivo;
      await apiFetch(`/sorteos/${sorteoId}/cantador`, { method: 'PUT', body: JSON.stringify({ activo: nuevoActivo }) });
      setSorteo((prev) => (prev ? { ...prev, cantadorActivo: nuevoActivo } : prev));
    } catch (e) { setAccionMsg(e.message); }
    finally { setGuardandoCantador(false); }
  }

  // Independiente del cantador de arriba a propósito -- el admin puede querer
  // que el bot anuncie por voz aunque tenga el tablero visual apagado (ver
  // agregarNumeroCantado en el backend).
  const [guardandoVoz, setGuardandoVoz] = useState(false);
  async function toggleVozAnunciante() {
    setGuardandoVoz(true);
    try {
      const nuevoActivo = !sorteo.vozAnuncianteActiva;
      await apiFetch(`/sorteos/${sorteoId}/voz-anunciante`, { method: 'PUT', body: JSON.stringify({ activo: nuevoActivo }) });
      setSorteo((prev) => (prev ? { ...prev, vozAnuncianteActiva: nuevoActivo } : prev));
    } catch (e) { setAccionMsg(e.message); }
    finally { setGuardandoVoz(false); }
  }

  async function toggleVentasHabilitadas() {
    await apiFetch('/sorteos/' + sorteoId, { method: 'PUT', body: JSON.stringify({ ventas_habilitadas: sorteo.ventas_habilitadas ? 0 : 1 }) });
    loadAll();
  }

  function loadReclamos() {
    apiFetch('/cartones/reclamos?sorteo_id=' + sorteoId).then((d) => {
      setReclamos(d.reclamos);
      // Mismo respaldo, para el aviso emergente "🔔 ¡BINGO!" de reclamos
      // pendientes: si el evento de socket no llegó, el próximo sondeo o
      // reconexión lo detecta solo comparando contra lo ya avisado.
      if (reclamosVistosRef.current === null) {
        reclamosVistosRef.current = new Set(d.reclamos.map((r) => r.id));
        return;
      }
      d.reclamos.forEach((r) => {
        if (reclamosVistosRef.current.has(r.id)) return;
        reclamosVistosRef.current.add(r.id);
        reproducirBeep();
        setAvisosReclamo((prev) => prev.some((a) => a.reclamoId === r.id) ? prev : [
          ...prev,
          { reclamoId: r.id, cartonNumero: r.carton_numero, grupo: r.carton_grupo, letra: r.carton_letra, label: r.label, jugador: r.jugador_nombre, patron: r.patron, jugadoPorNombre: r.jugado_por_nombre },
        ]);
      });
    });
  }

  useEffect(() => {
    reclamosVistosRef.current = null;
    ganadasVistasRef.current = null;
    loadAll();
    socket.emit('join-sorteo', { sorteoId });
    const onGanador = (p) => {
      if (p.sorteoId != sorteoId) return;
      if (ganadasVistasRef.current?.has(p.ganadorId)) return loadAll();
      ganadasVistasRef.current?.add(p.ganadorId);
      setGanadores((g) => [...g, p]);
      programarAutoOcultar(p.ganadorId);
      loadAll();
    };
    const onReclamo = (p) => {
      if (p.sorteoId != sorteoId) return;
      reclamosVistosRef.current?.add(p.reclamoId);
      reproducirBeep();
      setAvisosReclamo((prev) => [...prev.filter((r) => r.reclamoId !== p.reclamoId), { reclamoId: p.reclamoId, cartonNumero: p.cartonNumero, grupo: p.grupo, letra: p.letra, label: p.label, jugador: p.jugador, patron: p.patron, jugadoPorNombre: p.jugadoPorNombre }]);
      loadReclamos();
    };
    const onReset = (p) => { if (p.sorteoId == sorteoId) { setGanadores([]); ganadasVistasRef.current = new Set(); loadAll(); } };
    const onOtro = (p) => { if (p.sorteoId == sorteoId) loadAll(); };
    const onCompra = (p) => {
      if (p.sorteoId != sorteoId) return;
      setAccionMsg(`🛒 Nueva compra: ${p.jugador} — #${p.numeros.join(', #')} (${money(p.monto)})`);
      loadAll();
    };
    socket.on('bingo-ganador', onGanador);
    socket.on('bingo-reclamo', onReclamo);
    socket.on('sorteo-reiniciado', onReset);
    socket.on('sorteo-iniciado', onOtro);
    socket.on('sorteo-finalizado', onOtro);
    socket.on('cartones-vendidos', onCompra);
    socket.on('cartones-actualizados', onOtro);
    socket.on('numeros-cantados', onOtro);
    // Respaldo ante desconexiones de WebSocket (celular con pantalla
    // bloqueada, cambio de red, app en segundo plano): al reconectar, y
    // también por sondeo periódico como red de seguridad, se refresca todo
    // desde el servidor — así ningún reclamo ni ganador se queda "colgado"
    // solo porque el evento en vivo no llegó a este dispositivo.
    socket.on('connect', loadAll);
    // Tercera red de seguridad: cuando el celular vuelve a primer plano (se
    // desbloquea la pantalla, se vuelve a esta pestaña), los temporizadores
    // en segundo plano pudieron haberse pausado aunque el socket siguiera
    // "conectado" — refresca todo apenas la página vuelve a ser visible.
    const onVisible = () => { if (document.visibilityState === 'visible') loadAll(); };
    document.addEventListener('visibilitychange', onVisible);
    const reclamosInterval = setInterval(loadReclamos, 4000);
    return () => {
      socket.emit('leave-sorteo', { sorteoId });
      socket.off('bingo-ganador', onGanador);
      socket.off('bingo-reclamo', onReclamo);
      socket.off('sorteo-reiniciado', onReset);
      socket.off('sorteo-iniciado', onOtro);
      socket.off('sorteo-finalizado', onOtro);
      socket.off('cartones-vendidos', onCompra);
      socket.off('cartones-actualizados', onOtro);
      socket.off('numeros-cantados', onOtro);
      socket.off('connect', loadAll);
      document.removeEventListener('visibilitychange', onVisible);
      clearInterval(reclamosInterval);
    };
  }, [sorteoId]);

  async function validarReclamo(r) {
    await apiFetch(`/cartones/reclamos/${r.id}/validar`, { method: 'PUT' });
    setAvisosReclamo((prev) => prev.filter((a) => a.reclamoId !== r.id));
    // Con bingo "corrido" (varios ganadores por figura) es fácil olvidarse de
    // cerrarla a mano: si este era el último reclamo pendiente de la figura,
    // se le pregunta al admin acá mismo en vez de depender de que se acuerde.
    const quedanPendientes = reclamos.some((x) => x.patron === r.patron && x.id !== r.id);
    loadReclamos();
    if (r.patron && !quedanPendientes) {
      const figura = sorteo?.figuras?.find((f) => f.patron === r.patron);
      if (figura && !figura.cerrada && confirm(`Ya no quedan más reclamos pendientes de "${figura.label}". ¿Cerrar esta figura ahora?`)) {
        await apiFetch(`/sorteos/${sorteoId}/figuras/${r.patron}/cerrar`, { method: 'PUT' });
        loadAll();
      }
    }
  }

  // El confirm() nativo del navegador no permite personalizar el texto de
  // los botones (siempre dice "Aceptar"/"Cancelar", genérico y confuso acá
  // porque las dos opciones son dos formas distintas de invalidar, no un
  // sí/no) -- por eso pide confirmación con un modal propio en vez de
  // confirm(), armado en ejecutarInvalidacion() más abajo.
  function invalidarReclamo(r) {
    setConfirmInvalidar(r);
  }

  async function ejecutarInvalidacion(r, eliminarCarton) {
    setConfirmInvalidar(null);
    setAvisosReclamo((prev) => prev.filter((a) => a.reclamoId !== r.id));
    await apiFetch(`/cartones/reclamos/${r.id}/invalidar`, { method: 'PUT', body: JSON.stringify({ eliminarCarton }) });
    loadReclamos();
    loadAll();
  }

  function buscarCartonManual() {
    const q = bingoManualQuery.trim();
    setBingoManualCarton(null);
    setBingoManualPatron('');
    setBingoManualMarcados([]);
    if (!q) return setBingoManualResultados(null);
    const encontrados = cartones.filter((c) => (c.grupo != null ? String(c.grupo) === q : String(c.numero) === q));
    setBingoManualResultados(encontrados);
  }

  function elegirCartonManual(c) {
    setBingoManualCarton(c);
    setBingoManualMarcados(c.marcados || []);
  }

  function toggleMarcadoManual(numero) {
    setBingoManualMarcados((prev) => (prev.includes(numero) ? prev.filter((n) => n !== numero) : [...prev, numero]));
  }

  function limpiarBusquedaManual() {
    setBingoManualQuery('');
    setBingoManualResultados(null);
    setBingoManualCarton(null);
    setBingoManualPatron('');
    setBingoManualMarcados([]);
  }

  async function confirmarBingoManual() {
    if (!bingoManualCarton || !bingoManualPatron) return;
    await apiFetch('/cartones/bingo-manual', {
      method: 'POST',
      body: JSON.stringify({ sorteo_id: sorteoId, carton_id: bingoManualCarton.id, patron: bingoManualPatron, marcados: bingoManualMarcados }),
    });
    limpiarBusquedaManual();
    loadAll();
  }

  function parseNumeros() {
    return numerosInput.split(/[\s,]+/).map((n) => parseInt(n, 10)).filter((n) => !Number.isNaN(n));
  }

  // Busca a medida que se escribe (debounce 300ms) — se limpia sola si ya
  // hay una persona elegida (no tiene sentido seguir buscando) o si el texto
  // queda vacío. No usa una ref de "última búsqueda vigente": el cleanup de
  // useEffect (clearTimeout) ya evita que una búsqueda vieja pise el
  // resultado de una más nueva.
  useEffect(() => {
    if (modoAccion !== 'nombre' || jugadorSeleccionado || !nombreAccionInput.trim()) {
      setResultadosNombre([]);
      return;
    }
    const t = setTimeout(() => {
      apiFetch(`/cartones/buscar-jugadores?sorteo_id=${sorteoId}&nombre=${encodeURIComponent(nombreAccionInput.trim())}`)
        .then((d) => setResultadosNombre(d.jugadores))
        .catch(() => setResultadosNombre([]));
    }, 300);
    return () => clearTimeout(t);
  }, [nombreAccionInput, modoAccion, jugadorSeleccionado, sorteoId]);

  // `criterio` es { numeros: [...] } o { jugador_id: N } — según `modoAccion`,
  // para aplicar la acción a cartones puntuales o a todas las cartas de la
  // persona elegida en el selector.
  function criterioAccion() {
    return modoAccion === 'nombre'
      ? (jugadorSeleccionado ? { jugador_id: jugadorSeleccionado.jugadorId } : null)
      : { numeros: parseNumeros() };
  }
  function criterioVacio(criterio) {
    if (!criterio) return true;
    return criterio.jugador_id !== undefined ? false : !criterio.numeros.length;
  }

  async function marcarPagado(criterio) {
    try {
      const d = await apiFetch('/cartones/verificar-pago', { method: 'PUT', body: JSON.stringify({ sorteo_id: sorteoId, ...criterio }) });
      let msg = d.verificados.length ? `✅ Pago confirmado: ${d.verificados.join(', ')}` : '';
      if (d.noApartados.length) msg += ` · ⚠️ No estaban apartados: ${d.noApartados.join(', ')}`;
      if (d.noEncontrados.length) msg += ` · ❌ No existen: ${d.noEncontrados.join(', ')}`;
      setAccionMsg(msg);
      loadAll();
    } catch (e) { setAccionMsg(`❌ ${e.message}`); }
  }

  async function liberarNumeros(criterio) {
    try {
      const d = await apiFetch('/cartones/liberar', { method: 'PUT', body: JSON.stringify({ sorteo_id: sorteoId, ...criterio }) });
      setAccionMsg(d.liberados.length ? `♻️ Liberados: ${d.liberados.join(', ')}` : 'No se encontraron esos cartones.');
      loadAll();
    } catch (e) { setAccionMsg(`❌ ${e.message}`); }
  }

  async function confirmarPago() {
    const criterio = criterioAccion();
    if (criterioVacio(criterio)) return;
    await marcarPagado(criterio);
    setNumerosInput('');
    setNombreAccionInput('');
    setJugadorSeleccionado(null);
  }

  async function ponerDisponible() {
    const criterio = criterioAccion();
    if (criterioVacio(criterio)) return;
    await liberarNumeros(criterio);
    setNumerosInput('');
    setNombreAccionInput('');
    setJugadorSeleccionado(null);
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
      {avisosReclamo.length > 0 && (
        <div className="fixed bottom-4 right-4 z-40 space-y-2 max-w-sm w-full">
          {avisosReclamo.map((a) => (
            <div key={a.reclamoId} className="pop-in bg-gradient-to-br from-bingopurple to-bingoaccent text-white rounded-xl shadow-glow px-4 py-3 space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div className="text-sm leading-tight">
                  <div className="font-black">🔔 ¡BINGO! {a.grupo ? `Carta ${a.grupo} · Cartón ${a.letra}` : `Cartón #${a.cartonNumero}`}</div>
                  <div className="text-xs opacity-90">{a.label} — {a.jugador}{a.jugadoPorNombre && ` (JUGADO POR ${a.jugadoPorNombre})`}</div>
                </div>
                <button onClick={() => setAvisosReclamo((prev) => prev.filter((x) => x.reclamoId !== a.reclamoId))} className="text-white/70 hover:text-white text-lg leading-none shrink-0">&times;</button>
              </div>
              <div className="flex gap-1.5">
                <Button variant="success" className="!px-2 !py-1 !text-xs flex-1" onClick={() => validarReclamo({ id: a.reclamoId, carton_numero: a.cartonNumero, label: a.label, patron: a.patron })}>✅ Validar</Button>
                <Button variant="danger" className="!px-2 !py-1 !text-xs flex-1" onClick={() => invalidarReclamo({ id: a.reclamoId, carton_numero: a.cartonNumero, label: a.label })}>❌ Invalidar</Button>
              </div>
            </div>
          ))}
        </div>
      )}
      {confirmInvalidar && (
        <Modal title="Invalidar reclamo" onClose={() => setConfirmInvalidar(null)}>
          <div className="space-y-4">
            <p className="text-sm text-slate-300">
              Cartón <strong className="text-fuchsia-200">#{confirmInvalidar.carton_numero}</strong> — <strong className="text-fuchsia-200">{confirmInvalidar.label}</strong> se va a marcar como{' '}
              <strong className="text-red-400">NO válido</strong>.
            </p>
            <div className="space-y-2">
              <Button variant="danger" className="w-full" onClick={() => ejecutarInvalidacion(confirmInvalidar, true)}>
                Invalidar y eliminar cartón
              </Button>
              <p className="text-xs text-slate-400 px-1">Saca ese cartón del sorteo por completo.</p>
              <Button variant="ghost" className="w-full" onClick={() => ejecutarInvalidacion(confirmInvalidar, false)}>
                Invalidar pero conservar cartón
              </Button>
              <p className="text-xs text-slate-400 px-1">El cartón sigue en juego y puede marcar otras figuras, solo se invalida este reclamo puntual.</p>
            </div>
          </div>
        </Modal>
      )}
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
              <button type="button" onClick={iniciarEdicionRango} title="Ampliar o reducir la cantidad de cartas" className="text-slate-400 hover:text-fuchsia-300 text-xs">✏️</button>
            </div>
          </div>
          <div><div className="text-xs text-slate-400">Tu Ganancia</div><div className="font-bold text-emerald-400">{money(sorteo.gananciaActual)}</div></div>
          <div><div className="text-xs text-slate-400">Premio Acumulado</div><div className="font-bold text-fuchsia-300">{money(sorteo.premioAcumulado)}</div></div>
          <div><div className="text-xs text-slate-400">Estatus</div><Badge tone={sorteo.estatus === 'en_juego' ? 'yellow' : sorteo.estatus === 'pausado' ? 'red' : sorteo.estatus === 'finalizado' ? 'gray' : 'green'}>{sorteo.estatus}</Badge></div>
          <div>
            <div className="text-xs text-slate-400">Ventas</div>
            <div className="font-bold flex items-center gap-1.5">
              <Badge tone={sorteo.ventas_habilitadas ? 'green' : 'red'}>{sorteo.ventas_habilitadas ? '🔓 Habilitadas' : '🔒 Cerradas'}</Badge>
              <button
                type="button"
                onClick={toggleVentasHabilitadas}
                title={sorteo.ventas_habilitadas ? 'Cerrar ventas (nadie podrá comprar)' : 'Habilitar ventas (los jugadores ya podrán comprar)'}
                className="text-slate-400 hover:text-fuchsia-300 text-xs"
              >
                {sorteo.ventas_habilitadas ? '🔒 Cerrar' : '🔓 Habilitar'}
              </button>
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
      </Card>

      {ganadores.length > 0 && (
        <div className="space-y-2">
          {ganadores.map((g, i) => (
            <Card key={i} className="border-emerald-500/60 bg-emerald-500/10 text-center relative">
              <button onClick={() => ocultarGanador(g.ganadorId)} className="absolute top-2 right-2 text-emerald-300/70 hover:text-emerald-100 text-lg leading-none" title="Ocultar aviso">&times;</button>
              <div className="text-2xl font-black text-emerald-300">🎉 ¡BINGO! 🎉</div>
              <div className="text-slate-200 mt-1">
                Figura <b>{sorteo.figuras.find((f) => f.patron === g.patron)?.label || g.patron}</b> — Ganador: <b>{g.usuario}</b>{g.jugadoPorNombre && <span className="text-amber-300"> (JUGADO POR {g.jugadoPorNombre})</span>} — Cartón #{g.cartonNumero} — Premio {money(g.premio)}
              </div>
              {g.grid && (
                <div className="max-w-[220px] mx-auto mt-2">
                  <MiniCard carton={{ grid: g.grid, marcados: g.marcados, color: g.color, numero: g.cartonNumero }} letra={g.grupo ? g.letra : undefined} numerosGanadores={g.numerosGanadores} />
                </div>
              )}
            </Card>
          ))}
        </div>
      )}

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="font-bold text-fuchsia-100">Control del Juego</h3>
          <div className="flex flex-wrap items-center gap-2">
            {sorteo.estatus === 'activo' && (
              <Button variant="success" onClick={() => socket.emit('admin:iniciar-sorteo', { sorteoId })}>▶ Iniciar Juego</Button>
            )}
            {sorteo.estatus === 'en_juego' && <Badge tone="yellow">En juego — venta cerrada</Badge>}
            {sorteo.estatus === 'finalizado' && <Badge tone="gray">Finalizado</Badge>}
            <Button
              variant="danger"
              onClick={() => { if (confirm('¿Reiniciar el sorteo? Se borrarán las marcas de los cartones, los ganadores y los reclamos.')) socket.emit('admin:reiniciar-sorteo', { sorteoId }); }}
            >⟲ Reiniciar</Button>
          </div>
        </div>
        <p className="text-xs text-slate-400 mt-2">"Iniciar Juego" cierra la venta de cartones. Los ganadores aparecerán en "Reclamos de Bingo" para que los valides.</p>
      </Card>

      <Card className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-bold text-fuchsia-100">🎙️ Números Cantados</h3>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={toggleCantadorActivo}
              disabled={guardandoCantador}
              title="Activar o desactivar el cantador para este sorteo"
              className={`text-xs px-2.5 py-1 rounded-full border transition disabled:opacity-50 ${sorteo.cantadorActivo ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-300' : 'bg-slate-800/60 border-slate-700 text-slate-400'}`}
            >
              {sorteo.cantadorActivo ? '✅ Activado' : '⭘ Desactivado'}
            </button>
            <button
              type="button"
              onClick={toggleVozAnunciante}
              disabled={guardandoVoz}
              title="Anuncia por voz cada número cantado en la sala del jugador -- funciona aunque el cantador de arriba esté desactivado"
              className={`text-xs px-2.5 py-1 rounded-full border transition disabled:opacity-50 ${sorteo.vozAnuncianteActiva ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-300' : 'bg-slate-800/60 border-slate-700 text-slate-400'}`}
            >
              {sorteo.vozAnuncianteActiva ? '🔊 Voz activada' : '🔇 Voz desactivada'}
            </button>
            {sorteo.cantadorActivo && (
              <button type="button" onClick={() => setCantadorAbierto((v) => !v)} className="text-xs text-slate-400 hover:text-slate-200 transition">
                {cantadorAbierto ? '▲ Minimizar' : '▼ Mostrar tablero'}
              </button>
            )}
          </div>
        </div>
        {!sorteo.cantadorActivo ? (
          <p className="text-xs text-slate-500">Desactivado para este sorteo — ni vos ni los jugadores van a ver el cantador (por ejemplo, si vas a usar un sorteador físico aparte). Tocá "Activado" arriba si lo querés usar.</p>
        ) : (
          <>
            <LlamadorBolas numerosExtraidos={sorteo.numerosExtraidos || []} />
            {cantadorAbierto && (
              sorteo.estatus === 'en_juego' ? (
                <>
                  <p className="text-xs text-slate-400">Toca un número a medida que lo vayas sacando del bombo — se refleja en vivo en la pantalla de todos los jugadores. Tocarlo de nuevo lo deshace.</p>
                  <NumberBoard75 marcadosGlobal={new Set(sorteo.numerosExtraidos || [])} onToggle={llamarNumero} />
                </>
              ) : (
                <p className="text-xs text-amber-300 bg-amber-500/10 border border-amber-500/30 rounded-lg px-3 py-2 text-center">⏳ Iniciá el juego (arriba, "▶ Iniciar Juego") para poder empezar a cantar números.</p>
              )
            )}
          </>
        )}
      </Card>

      <Card className="space-y-2">
        <h3 className="font-bold text-fuchsia-100 flex items-center gap-2">
          Reclamos de Bingo {reclamos.length > 0 && <Badge tone="yellow">{reclamos.length} pendiente{reclamos.length > 1 ? 's' : ''}</Badge>}
        </h3>
        {!reclamos.length && <span className="text-slate-500 text-sm">No hay reclamos pendientes de revisión.</span>}
        {reclamos.map((r) => (
          <div key={r.id} className="bg-slate-800/40 rounded-lg px-3 py-2 space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-sm">
{r.carton_grupo ? <>Carta <b>{r.carton_grupo}</b> · Cartón <b>{r.carton_letra}</b></> : <>Cartón <b>#{r.carton_numero}</b></>} — <b>{r.label}</b> — {r.jugador_nombre || 'N/A'} {r.jugador_whatsapp ? `(${r.jugador_whatsapp})` : ''}{r.jugado_por_nombre && <span className="text-amber-300"> (JUGADO POR {r.jugado_por_nombre})</span>}
              </div>
              <div className="flex gap-1.5 shrink-0">
                <Button variant="success" className="!px-2 !py-1 !text-xs" onClick={() => validarReclamo(r)}>✅ Validar</Button>
                <Button variant="danger" className="!px-2 !py-1 !text-xs" onClick={() => invalidarReclamo(r)}>❌ Invalidar</Button>
              </div>
            </div>
            {reclamosCartaCompleta && r.cartones_grupo?.length ? (
              <div className="max-w-[280px]">
                <ComboCard grupo={r.carton_grupo} color={r.carton_color} cartones={r.cartones_grupo} cartonGanadorId={r.carton_id} numerosGanadores={r.numerosGanadores} />
              </div>
            ) : r.carton_grid && (
              <div className="max-w-[220px]">
                <MiniCard carton={{ grid: r.carton_grid, marcados: r.carton_marcados, numero: r.carton_numero, color: r.carton_color }} letra={r.carton_letra} numerosGanadores={r.numerosGanadores} />
              </div>
            )}
          </div>
        ))}
      </Card>

      <Card className="space-y-3">
        <h3 className="font-bold text-fuchsia-100">🖊️ Bingo Manual</h3>
        <p className="text-xs text-slate-400">
          Para jugadores que juegan con cartón de papel fuera del sistema: buscá su cartón por número (o número de combo), confirmá visualmente que hizo la figura, y registrala como ganadora.
        </p>
        <div className="flex flex-wrap items-end gap-2">
          <div className="flex-1 min-w-[160px]">
            <Label>Número de cartón / combo</Label>
            <Input
              value={bingoManualQuery}
              onChange={(e) => setBingoManualQuery(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') buscarCartonManual(); }}
              placeholder="Ej: 37"
            />
          </div>
          <Button variant="ghost" onClick={buscarCartonManual}>🔍 Buscar</Button>
          {(bingoManualQuery || bingoManualResultados) && (
            <Button variant="ghost" onClick={limpiarBusquedaManual}>🧹 Limpiar</Button>
          )}
        </div>

        {bingoManualResultados && bingoManualResultados.length === 0 && (
          <span className="text-slate-500 text-sm">No se encontró ningún cartón vendido con ese número en este sorteo.</span>
        )}

        {bingoManualResultados && bingoManualResultados.length > 0 && !bingoManualCarton && (
          <div className="flex flex-wrap gap-2">
            {bingoManualResultados.map((c) => (
              <Button key={c.id} variant="ghost" className="!text-xs" onClick={() => elegirCartonManual(c)}>
                {c.grupo ? `Carta ${c.grupo} · Cartón ${c.letra}` : `Cartón #${c.numero}`} — {c.owner_nombre || 'Sin dueño'}
              </Button>
            ))}
          </div>
        )}

        {bingoManualCarton && (
          <div className="bg-slate-800/40 rounded-lg px-3 py-2 space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-sm">
                {bingoManualCarton.grupo ? <>Carta <b>{bingoManualCarton.grupo}</b> · Cartón <b>{bingoManualCarton.letra}</b></> : <>Cartón <b>#{bingoManualCarton.numero}</b></>}
                {' — '}{bingoManualCarton.owner_nombre || 'Sin dueño'} {bingoManualCarton.owner_whatsapp ? `(${bingoManualCarton.owner_whatsapp})` : ''}
              </div>
              <button onClick={() => setBingoManualCarton(null)} className="text-slate-400 hover:text-slate-200 text-xs shrink-0">cambiar cartón</button>
            </div>
            <p className="text-xs text-slate-400">Tocá los números que el jugador tiene marcados en su cartón de papel, para dibujar la figura.</p>
            <div className="max-w-[220px]">
              <MiniCard
                carton={{ ...bingoManualCarton, marcados: bingoManualMarcados }}
                letra={bingoManualCarton.letra}
                onCellClick={toggleMarcadoManual}
              />
            </div>
            {bingoManualMarcados.length === 0 && (
              <p className="text-xs text-amber-300">⚠️ Marcá los números de la figura antes de confirmar.</p>
            )}
            <div className="flex flex-wrap items-end gap-2">
              <div className="flex-1 min-w-[180px]">
                <Label>Figura que completó</Label>
                <select
                  value={bingoManualPatron}
                  onChange={(e) => setBingoManualPatron(e.target.value)}
                  className="w-full bg-slate-800/70 border border-slate-700 focus:border-bingoaccent focus:outline-none rounded-lg px-3 py-2 text-sm text-slate-100"
                >
                  <option value="">Elegí la figura...</option>
                  {(sorteo.figuras || []).filter((f) => !f.cerrada).map((f) => (
                    <option key={f.patron} value={f.patron}>{f.label}{f.ganada ? ` (${f.ganadores.length} ganador${f.ganadores.length > 1 ? 'es' : ''})` : ''}</option>
                  ))}
                </select>
              </div>
              <Button variant="success" disabled={!bingoManualPatron || bingoManualMarcados.length === 0} onClick={confirmarBingoManual}>✅ Confirmar Bingo</Button>
            </div>
          </div>
        )}
      </Card>

      <Card className="space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-fuchsia-100">Figuras del Sorteo</h3>
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
                ) : f.bloqueada ? (
                  <span className="text-xs text-slate-500 font-semibold shrink-0">🔒 Se activa tras {f.activaTrasLabel}</span>
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
                      ✅ {g.jugador || 'N/A'}{g.jugadoPorNombre && <span className="text-amber-300"> (JUGADO POR {g.jugadoPorNombre})</span>} — {g.grupo ? `Carta ${g.grupo}${g.letra ? ` · Cartón ${g.letra}` : ''}` : `Cartón #${g.cartonNumero}`} · {money(g.premio)}
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
        <h3 className="font-bold text-fuchsia-100">🧾 Verificación de Ventas</h3>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setModoAccion('numero')}
            className={`flex-1 text-sm rounded-xl py-1.5 border transition ${modoAccion === 'numero' ? 'bg-bingopurple/30 border-bingoaccent text-white' : 'border-slate-700 text-slate-400 hover:text-slate-200'}`}
          >
            Por número
          </button>
          <button
            type="button"
            onClick={() => setModoAccion('nombre')}
            className={`flex-1 text-sm rounded-xl py-1.5 border transition ${modoAccion === 'nombre' ? 'bg-bingopurple/30 border-bingoaccent text-white' : 'border-slate-700 text-slate-400 hover:text-slate-200'}`}
          >
            Por nombre
          </button>
        </div>

        <div className="flex flex-wrap items-end gap-2">
          {modoAccion === 'numero' ? (
            <div className="flex-1 min-w-[200px]">
              <Label>Números de Carta (separados por espacio o coma)</Label>
              <Input value={numerosInput} onChange={(e) => setNumerosInput(e.target.value)} placeholder="Ej: 1, 5, 12" />
            </div>
          ) : (
            <div className="flex-1 min-w-[200px] relative">
              <Label>Nombre del jugador (afecta todas sus cartas en este sorteo)</Label>
              {jugadorSeleccionado ? (
                <div className="flex items-center justify-between gap-2 bg-bingopurple/10 border border-bingoaccent/50 rounded-lg px-3 py-1.5">
                  <span className="text-sm text-slate-200">
                    👤 <b>{jugadorSeleccionado.nombre}</b> — {jugadorSeleccionado.totalCartas} carta(s) ({jugadorSeleccionado.pagadas} pagadas, {jugadorSeleccionado.pendientes} pendientes)
                  </span>
                  <button type="button" onClick={() => { setJugadorSeleccionado(null); setNombreAccionInput(''); }} className="text-xs text-slate-400 hover:text-slate-200 shrink-0">✕ Cambiar</button>
                </div>
              ) : (
                <>
                  <Input value={nombreAccionInput} onChange={(e) => setNombreAccionInput(e.target.value)} placeholder="Escribí para buscar... ej: María" />
                  {resultadosNombre.length > 0 && (
                    <div className="absolute z-10 mt-1 w-full bg-slate-800 border border-slate-700 rounded-lg max-h-56 overflow-y-auto shadow-xl">
                      {resultadosNombre.map((j) => (
                        <button
                          key={j.jugadorId}
                          type="button"
                          onClick={() => { setJugadorSeleccionado(j); setResultadosNombre([]); }}
                          className="w-full text-left px-3 py-2 text-sm hover:bg-slate-700/60 border-b border-slate-700/40 last:border-0"
                        >
                          <div className="font-semibold text-slate-100">{j.nombre}</div>
                          <div className="text-xs text-slate-400">{j.totalCartas} carta(s) · {j.pagadas} pagada(s) · {j.pendientes} pendiente(s)</div>
                        </button>
                      ))}
                    </div>
                  )}
                  {nombreAccionInput.trim() && !resultadosNombre.length && (
                    <p className="text-xs text-slate-500 mt-1">Sin coincidencias todavía...</p>
                  )}
                </>
              )}
            </div>
          )}
          <Button variant="success" onClick={confirmarPago} disabled={modoAccion === 'nombre' && !jugadorSeleccionado}>✅ Confirmar Pago</Button>
          <Button variant="ghost" onClick={ponerDisponible} disabled={modoAccion === 'nombre' && !jugadorSeleccionado}>♻️ Poner Disponible</Button>
          <Button variant="danger" onClick={liberarPendientes}>🧹 Liberar Pendientes</Button>
        </div>
        {accionMsg && <div className="text-sm text-fuchsia-300 bg-fuchsia-500/10 border border-bingopurple/30 rounded-lg px-3 py-2">{accionMsg}</div>}
      </Card>

      <WhatsappLivePanel sorteoId={sorteoId} />
      <LiberacionPendientesConfig />
      <RecordatorioPagoConfig />

      <Card>
        <h3 className="font-bold text-fuchsia-100 mb-3">Registro de Cartas Vendidas ({cartonesPorGrupo.size})</h3>
        {(
          <div className="space-y-2 max-h-[32rem] overflow-y-auto pr-1 -mr-1">
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
                    <button onClick={() => toggleConjuntoAbierto(grupo)} className="font-semibold text-fuchsia-100 text-sm hover:opacity-80 transition">
                      {etiqueta}{pagado ? ' ✅' : ''}
                    </button>
                    <div className="flex gap-1.5 shrink-0">
                      {!pagado && (
                        <Button variant="success" className="!px-2 !py-1 !text-xs" onClick={() => marcarPagado({ numeros: numerosConjunto })}>✅ Pagado</Button>
                      )}
                      <Button
                        variant="ghost"
                        className="!px-2 !py-1 !text-xs"
                        onClick={() => { if (confirm(`¿Liberar ${etiqueta}? Quedará disponible para la venta de nuevo.`)) liberarNumeros({ numeros: numerosConjunto }); }}
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
                        <div className="max-w-[220px]"><MiniCard carton={cards[0]} /></div>
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
// WHATSAPP LIVE — configuración de textos + previsualización en vivo
// ===========================================================================
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
//
// Este repo (BINGOJULIETA) no tiene "cartones de regalo" ni "pronto pago" —
// a diferencia de otros repos hermanos de este mismo sistema (ej. BINGOZ),
// así que acá no hay separación normales/regalo en ningún lado de este panel.
// (Si algún día se agrega "regalo": los cartones de regalo nunca deben
// aparecer en la pestaña Deudas ni contar como pendientes de pago, porque son
// gratis — no generan deuda que cobrar.)
function WhatsappLivePanel({ sorteoId }) {
  const { logoUrl } = useSettings();
  const [configMinimizada, setConfigMinimizada] = useState(true);
  const [datos, setDatos] = useState(null);
  const [config, setConfig] = useState(null);
  const [encabezado, setEncabezado] = useState('');
  const [piePagina, setPiePagina] = useState('');
  const [estadoEncabezado, setEstadoEncabezado] = useState(''); // '', 'guardando', 'guardado', 'error'
  const skipNextAutosave = useRef(true);
  const [subTab, setSubTab] = useState('todo');
  const [busqueda, setBusqueda] = useState('');
  const [copiado, setCopiado] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [msg, setMsg] = useState('');
  const [pagandoGrupo, setPagandoGrupo] = useState(null);

  // Sin join-sorteo/leave-sorteo acá: SorteoDrawPanel (el padre) ya se
  // suscribió a la sala de este sorteo — este widget solo escucha en el mismo
  // socket. La lista/preview están siempre activas mientras el panel del
  // sorteo esté abierto (no dependen de si la config está minimizada).
  useEffect(() => {
    if (!sorteoId) return;
    setDatos(null);
    // Al abrir un sorteo (o cambiar a otro), el próximo cambio de
    // encabezado/piePagina que dispare el efecto de autoguardado va a ser el
    // de la semilla de abajo, no algo que el admin escribió — se descarta.
    skipNextAutosave.current = true;
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

  // Autoguarda el encabezado/pie DE ESTE SORTEO apenas el admin deja de
  // escribir (a diferencia de la config de abajo, que es global a los 9
  // sistemas y sí requiere el botón "Guardar" a propósito). Antes, si el
  // admin escribía un encabezado nuevo y cerraba el panel del sorteo sin
  // acordarse de tocar "Guardar" — para revisar otra pestaña, o porque el
  // navegador del celular recargó la página en segundo plano — el texto se
  // perdía en silencio y volvía a aparecer el último que sí había quedado
  // guardado (p. ej. el de horas antes). Ver diagnóstico de "lista vieja"
  // reportado por bingo_la_negra.
  useEffect(() => {
    if (!sorteoId) return;
    if (skipNextAutosave.current) { skipNextAutosave.current = false; return; }
    setEstadoEncabezado('guardando');
    const t = setTimeout(() => {
      apiFetch('/sorteos/' + sorteoId, { method: 'PUT', body: JSON.stringify({ encabezado, pie_pagina: piePagina }) })
        .then(() => { setEstadoEncabezado('guardado'); setTimeout(() => setEstadoEncabezado((s) => (s === 'guardado' ? '' : s)), 1500); })
        .catch(() => setEstadoEncabezado('error'));
    }, 800);
    return () => clearTimeout(t);
  }, [encabezado, piePagina, sorteoId]);

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

  // Verifica el pago de una carta directo desde la búsqueda por nombre de la
  // "Lista de WhatsApp" — mismo endpoint que "Registro de Cartas Vendidas".
  async function marcarPagado(grupo) {
    setPagandoGrupo(grupo);
    try {
      await apiFetch('/cartones/verificar-pago', { method: 'PUT', body: JSON.stringify({ sorteo_id: sorteoId, numeros: [grupo] }) });
      const d = await apiFetch(`/sorteos/${sorteoId}/whatsapp-live-datos`);
      setDatos(d);
    } finally {
      setPagandoGrupo(null);
    }
  }

  const conjuntos = datos?.conjuntos || [];

  // mirror de lista-texto (backend/routes/sorteos.js) — mantener en sync
  function textoTodo() {
    if (!config) return '';
    const linea = (g) => {
      const num = g.etiquetaEmoji;
      if (g.disponible) return num;
      const marca = g.pagado ? ` ${config.pagado_emoji}` : '';
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
      <h3 className="font-bold text-fuchsia-100 flex items-center gap-1.5">
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
                        {!g.pagado && (
                          <Button
                            variant="success"
                            className="!px-2 !py-1 !text-[11px]"
                            disabled={pagandoGrupo === g.grupo}
                            onClick={() => marcarPagado(g.grupo)}
                          >
                            {pagandoGrupo === g.grupo ? '...' : '✅ Verificar pago'}
                          </Button>
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
                <div className="flex items-center justify-between">
                  <Label>Encabezado — Todo (Lista Completa, de este sorteo)</Label>
                  {estadoEncabezado === 'guardando' && <span className="text-[11px] text-slate-500">Guardando...</span>}
                  {estadoEncabezado === 'guardado' && <span className="text-[11px] text-emerald-400">✓ Guardado</span>}
                  {estadoEncabezado === 'error' && <span className="text-[11px] text-red-400">Error al guardar</span>}
                </div>
                <textarea rows={2} value={encabezado} onChange={(e) => setEncabezado(e.target.value)}
                  placeholder="Ej: *BINGO MORADO — Hoy 8pm*" className={textareaClass} />
              </div>
              <div>
                <Label>Pie de página — Todo (de este sorteo)</Label>
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

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-bold text-fuchsia-100">Ventas y Ganancias</h2>

      <div className="grid sm:grid-cols-1 lg:grid-cols-3 gap-4">
        <Card><div className="text-xs text-slate-400">Ventas del Mes</div><div className="text-2xl font-black text-fuchsia-200">{kpis ? money(kpis.ventasMes) : '—'}</div></Card>
        <Card><div className="text-xs text-slate-400">Tu Ganancia del Mes</div><div className="text-2xl font-black text-emerald-400">{kpis ? money(kpis.gananciaMes) : '—'}</div></Card>
        <Card><div className="text-xs text-slate-400">Histórico Recaudado</div><div className="text-2xl font-black text-fuchsia-200">{kpis ? money(kpis.historicoRecaudado) : '—'}</div></Card>
      </div>

      <Card>
        <h3 className="font-bold text-fuchsia-100 mb-3">Premios Acumulados — Sorteos en Ejecución</h3>
        <div className="flex gap-3 overflow-x-auto">
          {premios.map((s) => (
            <div key={s.id} className="shrink-0 bg-slate-800/60 border border-bingopurple/30 rounded-xl px-4 py-3 min-w-[180px]">
              <div className="text-xs text-slate-400">#{s.id} · {s.color}</div>
              <div className="text-lg font-black text-fuchsia-300">{money(s.premioAcumulado)}</div>
              <Badge tone={s.estatus === 'en_juego' ? 'yellow' : 'green'}>{s.estatus}</Badge>
            </div>
          ))}
          {!premios.length && <span className="text-slate-500 text-sm">No hay sorteos activos.</span>}
        </div>
      </Card>

      <Card className="overflow-x-auto">
        <h3 className="font-bold text-fuchsia-100 mb-3">Ganadores Históricos</h3>
        <table className="w-full text-sm">
          <thead><tr className="text-left text-slate-400 border-b border-slate-800">
            <th className="py-2 pr-3">Sorteo</th><th className="py-2 pr-3">Usuario</th><th className="py-2 pr-3">Patrón</th><th className="py-2 pr-3">Premio</th><th className="py-2 pr-3">Fecha</th><th className="py-2 pr-3">Estado</th><th className="py-2 pr-3">Acción</th>
          </tr></thead>
          <tbody>
            {ganadores.map((g) => (
              <tr key={g.id} className="border-b border-slate-800/60 hover:bg-slate-800/30">
                <td className="py-2 pr-3">#{g.sorteo_id} · {g.color}</td>
                <td className="py-2 pr-3">{g.nombre}{g.jugadoPorNombre && <span className="text-amber-500 text-xs"> (JUGADO POR {g.jugadoPorNombre})</span>}</td>
                <td className="py-2 pr-3 text-slate-400">{g.patron}</td>
                <td className="py-2 pr-3 font-semibold text-fuchsia-300">{money(g.premio)}</td>
                <td className="py-2 pr-3 text-slate-400">{g.fecha}</td>
                <td className="py-2 pr-3"><Badge tone={g.pagado ? 'green' : 'yellow'}>{g.pagado ? 'Pagado' : 'Pendiente'}</Badge></td>
                <td className="py-2 pr-3">{!g.pagado && <Button variant="success" onClick={() => pagar(g.id)}>Marcar Pagado</Button>}</td>
              </tr>
            ))}
            {!ganadores.length && <tr><td colSpan="7" className="text-center text-slate-500 py-6">Aún no hay ganadores registrados.</td></tr>}
          </tbody>
        </table>
      </Card>

      <Card className="overflow-x-auto">
        <h3 className="font-bold text-fuchsia-100 mb-3">Historial Detallado de Ventas</h3>
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
  const [pagandoGrupo, setPagandoGrupo] = useState(null);

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
  // Verifica el pago de una carta puntual del jugador, sin tener que ir a
  // buscarla dentro del sorteo — usa el mismo endpoint que "Registro de
  // Cartas Vendidas" (por número/grupo), solo que disparado desde aquí.
  async function marcarPagadoJugador(sorteoId, grupo) {
    const clave = `${sorteoId}-${grupo}`;
    setPagandoGrupo(clave);
    try {
      await apiFetch('/cartones/verificar-pago', { method: 'PUT', body: JSON.stringify({ sorteo_id: sorteoId, numeros: [grupo] }) });
      const d = await apiFetch(`/cartones/jugador/${verCartones.id}`);
      setCartonesJugador(d.cartones);
    } finally {
      setPagandoGrupo(null);
    }
  }

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-bold text-fuchsia-100">Jugadores</h2>
      <p className="text-sm text-slate-400 -mt-4">Registros temporales creados al ingresar con nombre y WhatsApp. No manejan clave ni saldo.</p>

      <Card>
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-bold text-fuchsia-100">Sesiones de Jugadores</h3>
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
                    <td className="py-2 pr-3"><button onClick={() => abrirCartones(j)} className="text-fuchsia-300 underline">{j.cartones_activos} cartón(es)</button></td>
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
            {/* Se agrupa por sorteo+grupo (no solo grupo) porque el mismo número
                de carta puede repetirse en sorteos distintos. */}
            {[...new Map(cartonesJugador.map((c) => [`${c.sorteo_id}-${c.grupo}`, c])).keys()].map((clave) => {
              const cards = cartonesJugador.filter((c) => `${c.sorteo_id}-${c.grupo}` === clave);
              const grupo = cards[0].grupo;
              const sorteoId = cards[0].sorteo_id;
              const pagado = cards.every((c) => c.estado === 'pagado');
              return (
                <div key={clave} className="space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <Badge tone={pagado ? 'green' : 'yellow'}>{pagado ? '⭐ Pagado' : '⏳ Pendiente'}</Badge>
                    {!pagado && (
                      <Button
                        variant="success"
                        className="!px-2 !py-1 !text-xs"
                        disabled={pagandoGrupo === clave}
                        onClick={() => marcarPagadoJugador(sorteoId, grupo)}
                      >
                        {pagandoGrupo === clave ? 'Verificando...' : '✅ Verificar pago'}
                      </Button>
                    )}
                  </div>
                  {cards.length > 1 ? (
                    <ComboCard grupo={grupo} color={cards[0].color} cartones={cards} />
                  ) : (
                    <MiniCard carton={cards[0]} />
                  )}
                </div>
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
// USUARIO · JUGAR (selección de sorteo, compra de cartones y sala de juego)
// ===========================================================================
// Banner de recordatorio de pago para el jugador: mientras tenga cartones
// "vendido" (pago sin confirmar) y el admin haya activado la función (ver
// RecordatorioPagoConfig), repite el aviso cada minuto por voz (mientras la
// pestaña siga abierta) y ofrece activar la notificación push nativa del
// navegador (llega aunque esté minimizado o el jugador cambie de app -- ver
// backend/recordatorioPago.js y frontend/sw.js). Autocontenido: pide su
// propia info al backend en vez de depender del estado de UserJugar.
function RecordatorioPago() {
  const [config, setConfig] = useState(null); // { activo, texto }
  const [tienePendientes, setTienePendientes] = useState(false);
  const [permiso, setPermiso] = useState(() => (typeof Notification !== 'undefined' ? Notification.permission : 'unsupported'));
  const [activando, setActivando] = useState(false);
  const [errorActivar, setErrorActivar] = useState('');
  const vozIntervalRef = useRef(null);

  useEffect(() => {
    apiFetch('/settings/recordatorio-pago/publico').then(setConfig).catch(() => {});
  }, []);

  function chequearPendientes() {
    apiFetch('/cartones/mias').then((d) => {
      setTienePendientes(d.cartones.some((c) => c.estado === 'vendido'));
    }).catch(() => {});
  }
  useEffect(() => {
    chequearPendientes();
    socket.on('cartones-actualizados', chequearPendientes);
    socket.on('cartones-vendidos', chequearPendientes);
    return () => {
      socket.off('cartones-actualizados', chequearPendientes);
      socket.off('cartones-vendidos', chequearPendientes);
    };
  }, []);

  // Voz cada minuto mientras la pestaña siga abierta -- se re-arma solo si
  // cambia el texto/activo/pendientes, nunca deja timers duplicados vivos.
  useEffect(() => {
    clearInterval(vozIntervalRef.current);
    if (!config?.activo || !tienePendientes) return;
    const hablar = () => anunciarTexto(config.texto);
    hablar();
    vozIntervalRef.current = setInterval(hablar, 60000);
    return () => clearInterval(vozIntervalRef.current);
  }, [config?.activo, config?.texto, tienePendientes]);

  async function activarPush() {
    if (activando) return;
    setActivando(true);
    setErrorActivar('');
    try {
      const perm = await Notification.requestPermission();
      setPermiso(perm);
      if (perm !== 'granted') return;
      const reg = await navigator.serviceWorker.register('/sw.js');
      const { publicKey } = await apiFetch('/push/vapid-public-key');
      if (!publicKey) { setErrorActivar('El servidor todavía no tiene notificaciones configuradas'); return; }
      const existente = await reg.pushManager.getSubscription();
      const sub = existente || await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });
      await apiFetch('/push/suscribir', { method: 'POST', body: JSON.stringify(sub.toJSON()) });
    } catch (e) {
      setErrorActivar('No se pudo activar: ' + e.message);
    } finally {
      setActivando(false);
    }
  }

  if (!config?.activo || !tienePendientes) return null;

  return (
    <div className="rounded-xl border-2 border-amber-500/40 bg-amber-500/10 px-4 py-3 mb-4 flex items-center justify-between gap-3 flex-wrap">
      <div className="text-sm text-amber-200">⏰ {config.texto}</div>
      {permiso === 'granted' && <div className="text-xs text-amber-300/80 shrink-0">🔔 Notificaciones activadas</div>}
      {permiso === 'denied' && <div className="text-xs text-amber-300/80 shrink-0">🔕 Notificaciones bloqueadas por el navegador</div>}
      {permiso !== 'granted' && permiso !== 'denied' && permiso !== 'unsupported' && (
        <Button variant="ghost" className="!py-1 !px-3 text-xs shrink-0" disabled={activando} onClick={activarPush}>
          {activando ? 'Activando...' : '🔔 Activar notificación'}
        </Button>
      )}
      {errorActivar && <div className="text-xs text-red-400 w-full">{errorActivar}</div>}
    </div>
  );
}

function UserJugar() {
  const { user } = useAuth();
  const { soundConfig } = useSettings();
  const [patrones, setPatrones] = useState([]);
  const [sorteosActivos, setSorteosActivos] = useState([]);
  const [selectedSorteoId, setSelectedSorteoId] = useState(null);
  const [cartonesGrid, setCartonesGrid] = useState([]);
  const [seleccionados, setSeleccionados] = useState(new Set());
  const [cantidadAzar, setCantidadAzar] = useState(1);
  const [comprando, setComprando] = useState(false);
  const [error, setError] = useState('');
  const [comprado, setComprado] = useState(0); // dispara refresco de "mis sorteos" tras confirmar
  const [compraInfo, setCompraInfo] = useState(null);

  // Vista de la sala de juego: "lado" (panel al costado, fijo/compacto) o
  // "apilado" (como era antes: panel arriba a todo el ancho, cartones abajo
  // más grandes). Se recuerda la preferencia del jugador entre sesiones.
  const [vistaJuego, setVistaJuego] = useState(() => localStorage.getItem('bingo_vista_juego') || 'lado');
  useEffect(() => { localStorage.setItem('bingo_vista_juego', vistaJuego); }, [vistaJuego]);

  // Anuncio por voz de cada número cantado (ver anunciarNumero más abajo) --
  // encendida por defecto, cada jugador puede apagarla para sí mismo sin que
  // afecte al resto (independiente del interruptor del admin, que decide si
  // la función existe siquiera para este sorteo).
  const [vozActiva, setVozActiva] = useState(() => {
    const guardado = localStorage.getItem('bingo_voz_anunciante');
    return guardado === null ? true : guardado === '1';
  });
  useEffect(() => { localStorage.setItem('bingo_voz_anunciante', vozActiva ? '1' : '0'); }, [vozActiva]);
  // null = todavía no se estableció la base al entrar/reconectar -- evita
  // recitar todo el historial de números ya cantados, solo los nuevos de acá
  // en adelante (mismo criterio que primeraCargaSorteoRef, más abajo).
  const numerosHabladosRef = useRef(null);

  const [juegoSorteoId, setJuegoSorteoId] = useState(null);
  const [misCartones, setMisCartones] = useState([]);
  const [misSorteos, setMisSorteos] = useState([]);
  const [sorteoJuego, setSorteoJuego] = useState(null);

  // Música de tensión: solo suena mientras haya al menos un cartón "cerca de
  // ganar" (ver también el efecto de abajo que dispara el aviso puntual).
  const hayTension = useMemo(() => misCartones.some((c) => (c.cercaDeGanar || []).length > 0), [misCartones]);
  const { duckMusica, unduckMusica } = useMusicaTension(hayTension, soundConfig.musica);
  // IDs de cartones que puedo ver en mi sala (propios + los que juego por
  // delegación de otro) — para decidir "¡Ganaste!" contra la carta que ganó,
  // no solo contra el dueño (quien pega el bingo puede ser un delegado).
  const misCartonesIdSet = useMemo(() => new Set(misCartones.map((c) => c.id)), [misCartones]);

  // Cola de ventanas "¡BINGO!" pendientes de cerrar. Es un array (no un solo
  // objeto) porque puede haber más de un ganador casi al mismo tiempo —ya sea
  // el propio jugador ganando en 2+ cartones, o 2+ jugadores distintos
  // pegando bingo en la misma figura— y cada uno necesita su propia ventana
  // con su propia info, ninguna debe taparse ni perderse.
  const [ganadoresInfo, setGanadoresInfo] = useState([]);
  const [misGanadas, setMisGanadas] = useState([]); // historial persistente de figuras que ya gané en este sorteo
  const [figurasAbiertas, setFigurasAbiertas] = useState(new Set());
  function toggleFiguraAbierta(patron) {
    setFigurasAbiertas((prev) => {
      const next = new Set(prev);
      if (next.has(patron)) next.delete(patron); else next.add(patron);
      return next;
    });
  }
  const [marcarError, setMarcarError] = useState('');
  const [reclamosPropios, setReclamosPropios] = useState([]); // mis reclamos en espera de confirmación
  const [invalidoMsg, setInvalidoMsg] = useState('');
  const [cercaToasts, setCercaToasts] = useState([]); // avisos "te falta el N" apilados — uno por cada cartón/figura que entra cerca de ganar, no solo el primero
  const [marcarEnCarton, setMarcarEnCarton] = useState(true); // permite tocar los números directo en el cartón
  // El aviso "en espera" tapaba toda la pantalla sin poder seguir marcando
  // números mientras el admin valida — se puede minimizar a una pastilla
  // flotante y volver a abrirlo cuando quiera.
  const [reclamosMinimizados, setReclamosMinimizados] = useState(new Set());
  function toggleReclamoMinimizado(reclamoId) {
    setReclamosMinimizados((prev) => {
      const next = new Set(prev);
      next.has(reclamoId) ? next.delete(reclamoId) : next.add(reclamoId);
      return next;
    });
  }
  const cercaPrevRef = useRef(new Set());
  const misCartonesRef = useRef([]);
  useEffect(() => { misCartonesRef.current = misCartones; }, [misCartones]);

  // --- "Jugar por otra persona": buscar a alguien (nombre/WhatsApp) dentro
  // del mismo sorteo, ver sus cartas y elegir cuáles tomar para marcarlas en
  // esta sala. No cambia el dueño (owner_id) ni a quién le toca el premio.
  const [delegarAbierto, setDelegarAbierto] = useState(false);
  const [delegarQuery, setDelegarQuery] = useState('');
  const [delegarResultados, setDelegarResultados] = useState([]);
  const [delegarBuscando, setDelegarBuscando] = useState(false);
  const [delegarJugador, setDelegarJugador] = useState(null);
  const [delegarGrupos, setDelegarGrupos] = useState([]);
  const [delegarSeleccion, setDelegarSeleccion] = useState(new Set());
  const [delegarError, setDelegarError] = useState('');
  const [delegarGuardando, setDelegarGuardando] = useState(false);

  function abrirDelegar() {
    setDelegarAbierto(true);
    setDelegarQuery('');
    setDelegarResultados([]);
    setDelegarJugador(null);
    setDelegarGrupos([]);
    setDelegarSeleccion(new Set());
    setDelegarError('');
  }

  // El sistema solo admite un sorteo activo a la vez -- si el jugador todavía
  // no compró/tomó ninguna carta propia, juegoSorteoId está vacío, pero igual
  // puede buscar y tomar cartas de otro (el único caso real posible es
  // alguien que entra SOLO a jugar por otro, sin cartas propias).
  const delegarSorteoId = juegoSorteoId || sorteosActivos[0]?.id || null;

  async function buscarParaDelegar(q) {
    setDelegarQuery(q);
    if (!q.trim() || !delegarSorteoId) { setDelegarResultados([]); return; }
    setDelegarBuscando(true);
    try {
      const d = await apiFetch(`/cartones/buscar-jugador?sorteo_id=${delegarSorteoId}&q=${encodeURIComponent(q.trim())}`);
      setDelegarResultados(d.jugadores);
    } catch (e) { /* la búsqueda falla en silencio, no interrumpe al jugador */ }
    finally { setDelegarBuscando(false); }
  }

  async function elegirJugadorDelegar(j) {
    setDelegarJugador(j);
    setDelegarError('');
    try {
      const d = await apiFetch(`/cartones/de-jugador/${j.id}?sorteo_id=${delegarSorteoId}`);
      setDelegarGrupos(d.grupos);
      setDelegarSeleccion(new Set(d.grupos.filter((g) => g.delegadoSoyYo).map((g) => g.grupo)));
    } catch (e) { setDelegarError(e.message); }
  }

  function toggleDelegarGrupo(g) {
    if (g.delegadoId && !g.delegadoSoyYo) return; // ya la está jugando otra persona
    setDelegarSeleccion((prev) => {
      const next = new Set(prev);
      next.has(g.grupo) ? next.delete(g.grupo) : next.add(g.grupo);
      return next;
    });
  }

  async function confirmarDelegar() {
    if (!delegarJugador || !delegarSeleccion.size) return;
    setDelegarGuardando(true);
    setDelegarError('');
    try {
      const d = await apiFetch('/cartones/delegar', {
        method: 'POST',
        body: JSON.stringify({ sorteo_id: delegarSorteoId, jugador_id: delegarJugador.id, grupos: [...delegarSeleccion] }),
      });
      cargarMisSorteos();
      cargarMisCartonesJuego();
      if (d.yaTomadas && d.yaTomadas.length) {
        setDelegarError(`Alguien más ya está jugando: ${d.yaTomadas.map((x) => `Carta ${x.grupo} (${x.nombre})`).join(', ')}`);
      } else {
        setDelegarAbierto(false);
      }
    } catch (e) { setDelegarError(e.message); }
    finally { setDelegarGuardando(false); }
  }

  async function soltarCarta(duenoId, grupo) {
    try {
      await apiFetch('/cartones/delegar', { method: 'DELETE', body: JSON.stringify({ sorteo_id: juegoSorteoId, jugador_id: duenoId, grupos: [grupo] }) });
      cargarMisCartonesJuego();
    } catch (e) { setMarcarError(e.message); }
  }
  // Figuras cuyo ganador ya se notificó (por socket o por sondeo/reconexión),
  // para no mostrar la misma ventana de "¡BINGO!" dos veces. Se reinician al
  // cambiar de sorteo. primeraCargaSorteoRef evita reabrir wins ya viejos
  // justo al entrar/reconectar a un sorteo que ya tenía figuras ganadas.
  const ganadasNotificadasRef = useRef(new Set());
  const primeraCargaSorteoRef = useRef(true);

  function loadActivos() {
    apiFetch('/sorteos/patrones').then((d) => setPatrones(d.patrones));
    apiFetch('/sorteos/activos').then((d) => setSorteosActivos(d.sorteos));
  }
  useEffect(loadActivos, []);

  // Sincronización absoluta: si se crea/edita/elimina un sorteo o cambia de estatus
  // (en cualquier navegador), esta lista se refresca sola, sin recargar la página.
  useEffect(() => {
    socket.on('sorteos-cambio', loadActivos);
    return () => socket.off('sorteos-cambio', loadActivos);
  }, []);

  // Sorteos donde el jugador tiene cartones -- propios o delegados por otro
  // (para el selector de la sala de juego). Se reusa tanto al comprar como al
  // tomar la primera carta de otra persona sin haber comprado nada propio
  // todavía (ver confirmarDelegar) -- si no, la sala de juego nunca se abría
  // para alguien que solo entra a jugar por otro.
  function cargarMisSorteos() {
    apiFetch('/cartones/mias').then((d) => {
      const ids = [...new Set(d.cartones.map((c) => c.sorteo_id))];
      setMisSorteos(ids);
      if (ids.length) setJuegoSorteoId((prev) => (prev && ids.includes(prev) ? prev : ids[ids.length - 1]));
    });
  }
  useEffect(cargarMisSorteos, [comprado]);

  function loadGrid(id) {
    apiFetch('/cartones/disponibles/' + id).then((d) => setCartonesGrid(d.cartones));
  }

  function seleccionarSorteo(id) {
    setSelectedSorteoId(id);
    setSeleccionados(new Set());
    setError('');
    loadGrid(id);
  }

  // El sistema solo admite un sorteo activo a la vez, así que no hace falta
  // que el jugador elija nada: apenas hay uno disponible, se selecciona solo.
  // Si el sorteo que tenía elegido ya no está entre los activos (el admin lo
  // finalizó/eliminó y creó uno nuevo mientras el jugador seguía logueado),
  // se limpia la selección para que el siguiente bloque elija el nuevo — sin
  // esto, la pantalla de "Elige tus cartones" se quedaba pegada mostrando el
  // sorteo viejo para cualquiera que ya estuviera con la sesión abierta.
  useEffect(() => {
    if (selectedSorteoId != null && !sorteosActivos.some((s) => s.id === selectedSorteoId)) {
      setSelectedSorteoId(null);
      setCartonesGrid([]);
      setSeleccionados(new Set());
    }
  }, [sorteosActivos]);

  useEffect(() => {
    if (sorteosActivos.length && selectedSorteoId == null) {
      seleccionarSorteo(sorteosActivos[0].id);
    }
  }, [sorteosActivos, selectedSorteoId]);

  // Los cartones de un mismo `grupo` (combo) siempre se seleccionan/compran juntos.
  // Con "1 Cartón" cada grupo tiene un solo cartón, así que se comporta igual que antes.
  const gruposMap = useMemo(() => {
    const m = new Map();
    cartonesGrid.forEach((c) => {
      if (!m.has(c.grupo)) m.set(c.grupo, []);
      m.get(c.grupo).push(c);
    });
    return m;
  }, [cartonesGrid]);

  function toggleNumero(c) {
    const cards = gruposMap.get(c.grupo) || [c];
    if (cards.some((x) => x.estado !== 'disponible')) return;
    const s = new Set(seleccionados);
    const yaElegido = cards.every((x) => s.has(x.numero));
    cards.forEach((x) => (yaElegido ? s.delete(x.numero) : s.add(x.numero)));
    setSeleccionados(s);
  }

  function elegirAzar() {
    const gruposLibres = [...gruposMap.values()].filter(
      (cards) => cards.every((c) => c.estado === 'disponible') && !cards.some((c) => seleccionados.has(c.numero))
    );
    const n = Math.min(Math.max(parseInt(cantidadAzar, 10) || 0, 0), gruposLibres.length);
    const shuffled = [...gruposLibres].sort(() => Math.random() - 0.5).slice(0, n).flat();
    const s = new Set(seleccionados);
    shuffled.forEach((c) => s.add(c.numero));
    setSeleccionados(s);
  }

  async function confirmarCompra() {
    if (!seleccionados.size) return;
    setError('');
    setComprando(true);
    try {
      const d = await apiFetch('/ventas/comprar', { method: 'POST', body: JSON.stringify({ sorteo_id: selectedSorteoId, numeros: [...seleccionados] }) });
      const grupos = [...new Set(d.cartonesNumeros.map((n) => cartonesGrid.find((c) => c.numero === n)?.grupo).filter((g) => g != null))];
      setSeleccionados(new Set());
      loadGrid(selectedSorteoId);
      setMisSorteos((prev) => (prev.includes(selectedSorteoId) ? prev : [...prev, selectedSorteoId]));
      setJuegoSorteoId(selectedSorteoId);
      setCompraInfo({ numeros: d.cartonesNumeros, grupos, monto: d.monto, piePagina: sorteoSel?.pie_pagina || '' });
      // Refresca "Mis Cartones" de una vez: si ya estabas jugando este mismo sorteo,
      // juegoSorteoId no cambia de valor y el efecto que depende de él no se vuelve a disparar.
      apiFetch('/cartones/mias?sorteo_id=' + selectedSorteoId).then((dd) => setMisCartones(dd.cartones));
      setComprado((c) => c + 1);
    } catch (e) { setError(e.message); }
    finally { setComprando(false); }
  }

  const sorteoSel = sorteosActivos.find((s) => s.id === selectedSorteoId);
  // Se cuenta por Carta (grupo), no por cartón físico: un combo x4 vendido
  // son 4 filas en cartonesGrid pero es UNA sola carta para el jugador — sin
  // esto, "Cartones totales"/"Ocupados" mostraba 4x lo que realmente hay a
  // la venta. En venta individual (sin combo) grupo === numero, así que da
  // el mismo resultado que antes.
  const ocupadosCount = [...gruposMap.values()].filter((cards) => cards.some((c) => c.estado !== 'disponible')).length;
  const gruposSeleccionados = new Set(cartonesGrid.filter((c) => seleccionados.has(c.numero)).map((c) => c.grupo));
  const montoAPagar = sorteoSel ? +(sorteoSel.costo * gruposSeleccionados.size).toFixed(2) : 0;

  // --- Sala de juego en vivo ---
  // Respaldo ante desconexiones de WebSocket (celular con pantalla
  // bloqueada, cambio de red, app en segundo plano): si el evento de socket
  // 'bingo-ganador' se pierde, esta misma función lo detecta solita la
  // próxima vez que se llama (reconexión o sondeo periódico) comparando
  // contra las figuras que ya se habían notificado, y reconstruye la
  // ventana de "¡BINGO!" completa a partir de la respuesta del servidor.
  function cargarSorteoJuego() {
    apiFetch('/sorteos/' + juegoSorteoId)
      .then((d) => {
        setSorteoJuego(d.sorteo);
        // Anuncio por voz de los números nuevos desde la última carga -- ver
        // anunciarNumero() y el comentario de numerosHabladosRef más arriba.
        // Se compara por longitud (no por contenido) porque numerosExtraidos
        // solo crece o se resetea entero (reinicio de sorteo), nunca se
        // reordena ni se saca un número suelto del medio.
        const numerosNuevos = d.sorteo.numerosExtraidos || [];
        if (numerosHabladosRef.current == null) {
          numerosHabladosRef.current = numerosNuevos.length;
        } else if (numerosNuevos.length > numerosHabladosRef.current) {
          if (d.sorteo.vozAnuncianteActiva && vozActiva) {
            numerosNuevos.slice(numerosHabladosRef.current).forEach((n) => anunciarNumero(n, { onStart: duckMusica, onEnd: unduckMusica }));
          }
          numerosHabladosRef.current = numerosNuevos.length;
        } else if (numerosNuevos.length < numerosHabladosRef.current) {
          numerosHabladosRef.current = numerosNuevos.length; // sorteo reiniciado, no hay nada nuevo que anunciar
        }
        // Una figura puede tener varios ganadores (bingo "corrido"): se
        // recorren TODOS, no solo el primero, para que ninguno se quede sin
        // avisar — dedup por ganadorId, no por patron.
        let huboGanadorPropio = false;
        (d.sorteo.figuras || []).forEach((f) => {
          (f.ganadores || []).forEach((g) => {
            // Si tenía un reclamo pendiente para este cartón+figura, ya se
            // resolvió (con o sin ganadorId nuevo) — hay que quitar el aviso
            // "en espera" SIEMPRE, incluso en la primera carga tras
            // reconectar. Antes esto vivía dentro del `if
            // (primeraCargaSorteoRef.current) return` de abajo: si el
            // jugador se reconectaba justo cuando su bingo ya había sido
            // validado, el ganadorId quedaba marcado como "visto" sin haber
            // limpiado el aviso, y como quedaba marcado, ningún intento
            // posterior lo volvía a intentar — el aviso "en espera" se
            // quedaba pegado en pantalla para siempre, incluso ya validado.
            setReclamosPropios((prev) => prev.filter((r) => !(r.cartonId === g.cartonId && r.patron === f.patron)));
            if (ganadasNotificadasRef.current.has(g.ganadorId)) return;
            ganadasNotificadasRef.current.add(g.ganadorId);
            if (g.jugadorId === user.id) huboGanadorPropio = true;
            if (primeraCargaSorteoRef.current) return; // no reabrir la ventana de "¡Ganaste!" de wins ya vistos al entrar/reconectar
            setGanadoresInfo((prev) => [...prev, {
              ganadorId: g.ganadorId,
              sorteoId: d.sorteo.id,
              usuario: g.jugador,
              usuarioId: g.jugadorId,
              cartonId: g.cartonId,
              cartonNumero: g.cartonNumero,
              grupo: g.grupo,
              letra: g.letra,
              color: g.color,
              grid: g.grid,
              marcados: g.marcados,
              patron: f.patron,
              premio: g.premio,
            }]);
          });
        });
        if (huboGanadorPropio) cargarMisGanadas();
        primeraCargaSorteoRef.current = false;
      })
      .catch((e) => {
        // Solo un 404 real significa "el sorteo ya no existe" (el admin lo
        // eliminó) — cualquier otro fallo (sin conexión un instante porque
        // el celular se bloqueó, cambió de red, volvió de segundo plano,
        // timeout, error 500, etc.) NO debe borrar los cartones del
        // jugador ni el sorteo de su lista: antes cualquier error acá
        // limpiaba todo igual, y el jugador veía "no tienes cartones" hasta
        // que refrescaba la página a mano — los cartones seguían existiendo
        // todo el tiempo, solo se había perdido el fetch de turno.
        if (e && e.status !== 404) return;
        setSorteoJuego(null);
        setMisCartones([]);
        setMisSorteos((prev) => {
          const restantes = prev.filter((id) => id !== juegoSorteoId);
          setJuegoSorteoId(restantes.length ? restantes[restantes.length - 1] : null);
          return restantes;
        });
      });
  }

  function cargarMisCartonesJuego() {
    if (!juegoSorteoId) return;
    apiFetch('/cartones/mias?sorteo_id=' + juegoSorteoId).then((d) => setMisCartones(d.cartones));
  }

  function cargarMisGanadas() {
    if (!juegoSorteoId) return;
    apiFetch('/cartones/mis-ganadores/' + juegoSorteoId).then((d) => setMisGanadas(d.ganadores));
  }

  // Respaldo ante desconexiones de WebSocket: si el evento en vivo 'bingo-reclamo'
  // no llegó (ej. se cargó la página con un reclamo ya pendiente), el aviso "en
  // espera" nunca aparecería; y si el admin invalida un reclamo y el evento
  // 'bingo-reclamo-resuelto' no llega, ese aviso se quedaría pegado en pantalla
  // para siempre. Este sondeo corrige ambos casos comparando contra lo que ya
  // se le mostró al jugador.
  function cargarMisReclamos() {
    if (!juegoSorteoId) return;
    apiFetch('/cartones/mis-reclamos?sorteo_id=' + juegoSorteoId).then((d) => {
      setReclamosPropios((prev) => {
        const siguen = prev.filter((r) => {
          const actual = d.reclamos.find((x) => x.id === r.reclamoId);
          if (!actual || actual.estado === 'pendiente') return true;
          if (actual.estado === 'invalido') {
            setInvalidoMsg(`Tu BINGO del cartón #${r.cartonNumero} (${r.label}) no fue validado.`);
            setTimeout(() => setInvalidoMsg(''), 5000);
          }
          return false;
        });
        const nuevos = d.reclamos
          .filter((x) => x.estado === 'pendiente' && !siguen.some((r) => r.reclamoId === x.id))
          .map((x) => {
            return {
              reclamoId: x.id, cartonId: x.carton_id, cartonNumero: x.carton_numero, patron: x.patron, label: x.label,
              grupo: x.grupo, letra: x.letra, grid: x.grid, marcados: x.marcados, color: x.color,
            };
          });
        return nuevos.length ? [...siguen, ...nuevos] : siguen;
      });
    }).catch(() => {});
  }

  useEffect(() => {
    if (!juegoSorteoId) return;
    setReclamosPropios([]);
    ganadasNotificadasRef.current = new Set();
    primeraCargaSorteoRef.current = true;
    setMarcadosGlobal(new Set());
    cargarTablero();
    cargarMisCartonesJuego();
    cargarSorteoJuego();
    cargarMisGanadas();
    socket.emit('join-sorteo', { sorteoId: juegoSorteoId });
    const onGanador = (p) => {
      if (p.sorteoId != juegoSorteoId) return;
      if (!ganadasNotificadasRef.current.has(p.ganadorId)) {
        ganadasNotificadasRef.current.add(p.ganadorId);
        setReclamosPropios((prev) => prev.filter((r) => !(r.cartonId === p.cartonId && r.patron === p.patron)));
        setGanadoresInfo((prev) => [...prev, p]);
        reproducirSonido('fanfarria', soundConfig.fanfarria);
        if (p.usuarioId === user.id || misCartonesRef.current.some((c) => c.id === p.cartonId)) cargarMisGanadas();
      }
      cargarSorteoJuego();
      cargarMisCartonesJuego();
    };
    // Respaldo ante desconexiones de WebSocket (muy común en celulares: se
    // pierde la conexión al bloquear la pantalla, cambiar de red o mandar la
    // app a segundo plano). Al reconectar, y también por sondeo periódico
    // como red de seguridad extra, se vuelve a pedir el estado real del
    // sorteo — así ningún "¡BINGO!" ni cartón se queda sin actualizar solo
    // porque el evento en vivo no llegó.
    const onConnect = () => { cargarSorteoJuego(); cargarMisCartonesJuego(); cargarMisReclamos(); };
    socket.on('connect', onConnect);
    // Tercera red de seguridad: si el celular vuelve a primer plano (se
    // desbloquea, se vuelve a la pestaña) y los temporizadores en segundo
    // plano estaban pausados, refresca de inmediato.
    const onVisible = () => { if (document.visibilityState === 'visible') onConnect(); };
    document.addEventListener('visibilitychange', onVisible);
    const pollInterval = setInterval(onConnect, 6000);
    const onOtro = (p) => { if (p.sorteoId == juegoSorteoId) cargarSorteoJuego(); };
    const onCartones = (p) => { if (p.sorteoId == juegoSorteoId) cargarMisCartonesJuego(); };
    // El reinicio también borra el panel de apoyo del jugador en el
    // servidor (tablero_marcas) — hay que recargarlo, si no se quedaría
    // mostrando marcados viejos de la ronda anterior.
    const onReiniciado = (p) => {
      if (p.sorteoId != juegoSorteoId) return;
      cargarMisCartonesJuego();
      cargarTablero();
    };
    // Sin sorteoId propio en el payload: puede ser justo el sorteo que estoy
    // viendo el que se borró o cambió, así que reviso igual.
    const onSorteosCambio = () => cargarSorteoJuego();
    // Apenas un cartón mío completa una figura, aviso "en espera" de inmediato
    // (no hace falta que el admin confirme para que el jugador vea su BINGO).
    const onReclamo = (p) => {
      if (p.sorteoId != juegoSorteoId) return;
      const esMio = misCartonesRef.current.some((c) => c.id === p.cartonId);
      if (!esMio) return;
      // grid/marcados/color vienen directo del servidor (ya resueltos al
      // momento exacto en que se completó la figura) — no se leen del estado
      // local misCartonesRef, que podía no haberse re-renderizado todavía
      // con la última marca y mostraba el cartón "incompleto" en el aviso.
      setReclamosPropios((prev) => [
        ...prev.filter((r) => r.reclamoId !== p.reclamoId),
        {
          reclamoId: p.reclamoId, cartonId: p.cartonId, cartonNumero: p.cartonNumero, grupo: p.grupo, letra: p.letra, patron: p.patron, label: p.label,
          grid: p.grid, marcados: p.marcados, color: p.color,
        },
      ]);
    };
    const onReclamoResuelto = (p) => {
      if (p.sorteoId != juegoSorteoId) return;
      setReclamosPropios((prev) => {
        const era = prev.find((r) => r.reclamoId === p.reclamoId);
        if (era && p.estado === 'invalido') {
          setInvalidoMsg(`Tu BINGO del cartón #${era.cartonNumero} (${era.label}) no fue validado.`);
          setTimeout(() => setInvalidoMsg(''), 5000);
        }
        return prev.filter((r) => r.reclamoId !== p.reclamoId);
      });
    };
    socket.on('bingo-ganador', onGanador);
    socket.on('bingo-reclamo', onReclamo);
    socket.on('bingo-reclamo-resuelto', onReclamoResuelto);
    socket.on('sorteo-reiniciado', onReiniciado);
    socket.on('sorteo-iniciado', onOtro);
    socket.on('sorteo-finalizado', onOtro);
    socket.on('cartones-vendidos', onCartones);
    socket.on('cartones-actualizados', onCartones);
    socket.on('numeros-cantados', onOtro);
    socket.on('sorteos-cambio', onSorteosCambio);
    return () => {
      socket.emit('leave-sorteo', { sorteoId: juegoSorteoId });
      socket.off('bingo-ganador', onGanador);
      socket.off('bingo-reclamo', onReclamo);
      socket.off('bingo-reclamo-resuelto', onReclamoResuelto);
      socket.off('sorteos-cambio', onSorteosCambio);
      socket.off('sorteo-reiniciado', onReiniciado);
      socket.off('sorteo-iniciado', onOtro);
      socket.off('sorteo-finalizado', onOtro);
      socket.off('cartones-vendidos', onCartones);
      socket.off('cartones-actualizados', onCartones);
      socket.off('numeros-cantados', onOtro);
      socket.off('connect', onConnect);
      document.removeEventListener('visibilitychange', onVisible);
      clearInterval(pollInterval);
    };
  }, [juegoSorteoId]);

  // Pita y muestra un aviso apenas un cartón entra "cerca de ganar" (no en
  // cada re-render/recarga si ese estado ya se había mostrado antes). Si
  // varios cartones (o varias figuras) entran cerca de ganar a la vez, cada
  // uno se apila con su propio aviso — antes solo se mostraba el primero y
  // los demás se perdían en silencio.
  useEffect(() => {
    const actuales = new Set();
    const nuevos = [];
    misCartones.forEach((c) => (c.cercaDeGanar || []).forEach((f) => f.numeros.forEach((n) => {
      const key = `${c.id}:${f.patron}:${n}`;
      actuales.add(key);
      if (!cercaPrevRef.current.has(key)) nuevos.push({ carton: c, label: f.label, numero: n, key });
    })));
    if (nuevos.length) {
      reproducirSonido('alerta', soundConfig.alerta);
      // Persistente: no se autodescarta con un timeout — el jugador lo cierra
      // a mano con la "✕" cuando quiere, así no se pierde de vista antes de
      // marcar el número.
      const toasts = nuevos.map((item) => {
        const etiquetaCarton = sorteoJuego?.tipo_venta > 1 && item.carton.grupo != null
          ? `Carta ${item.carton.grupo}${item.carton.letra ? ` · Cartón ${item.carton.letra}` : ''}`
          : `#${item.carton.numero}`;
        return { id: item.key, texto: `Te falta el ${item.numero} para ${item.label} (${etiquetaCarton})` };
      });
      setCercaToasts((prev) => [...prev, ...toasts]);
    }
    // Si el número ya se marcó (o el cartón dejó de estar cerca de ganar por
    // cualquier otro motivo), su aviso ya no tiene sentido y se retira solo
    // — la persistencia es para que no desaparezca por tiempo mientras sigue
    // pendiente, no para dejarlo pegado después de resuelto.
    setCercaToasts((prev) => prev.filter((t) => actuales.has(t.id)));
    cercaPrevRef.current = actuales;
  }, [misCartones, sorteoJuego]);

  // Mientras el jugador está eligiendo cartones para comprar, si alguien más
  // (u otra pestaña propia) compra del mismo sorteo, la cuadrícula se refresca sola.
  useEffect(() => {
    if (!selectedSorteoId) return;
    socket.emit('join-sorteo', { sorteoId: selectedSorteoId });
    const onCartones = (p) => { if (p.sorteoId == selectedSorteoId) loadGrid(selectedSorteoId); };
    socket.on('cartones-vendidos', onCartones);
    socket.on('cartones-actualizados', onCartones);
    return () => {
      socket.emit('leave-sorteo', { sorteoId: selectedSorteoId });
      socket.off('cartones-vendidos', onCartones);
      socket.off('cartones-actualizados', onCartones);
    };
  }, [selectedSorteoId]);

  // Monto que el jugador todavía debe por este sorteo: conjuntos comprados que
  // aún no fueron marcados como pagados por el admin.
  const montoPendiente = useMemo(() => {
    if (!sorteoJuego) return 0;
    const conjuntosPendientes = new Set();
    misCartones.forEach((c) => { if (c.estado === 'vendido') conjuntosPendientes.add(c.grupo); });
    return +(conjuntosPendientes.size * sorteoJuego.costo).toFixed(2);
  }, [misCartones, sorteoJuego]);

  const enJuego = sorteoJuego?.estatus === 'en_juego';

  // Unión de números marcados entre todos mis cartones del sorteo — solo para
  // resaltar el tablero de apoyo 1-75 (cada cartón conserva su propio marcado).
  // Marcado del panel de apoyo 1-75: viene del servidor (tabla
  // tablero_marcas), NO se calcula a partir de misCartones — antes un
  // número solo se resaltaba acá si estaba en al menos un cartón propio; el
  // jugador quiere poder marcar cualquier número (para llevar la cuenta de
  // lo cantado) aunque no lo tenga en ningún cartón.
  const [marcadosGlobal, setMarcadosGlobal] = useState(new Set());
  function cargarTablero() {
    if (!juegoSorteoId) return;
    apiFetch('/cartones/tablero/' + juegoSorteoId).then((d) => setMarcadosGlobal(new Set(d.marcados))).catch(() => {});
  }

  // Unión de números que a ALGÚN cartón mío le falta para bingo — resalta con
  // animación esos números en el tablero de apoyo 1-75, no solo la celda
  // dentro del cartón, para que sea obvio qué número hay que estar pendiente.
  const cercaGlobal = useMemo(() => {
    const s = new Set();
    misCartones.forEach((c) => (c.cercaDeGanar || []).forEach((f) => f.numeros.forEach((n) => s.add(n))));
    return s;
  }, [misCartones]);

  // Tocar un número directo sobre un cartón propio también lo marca/desmarca
  // en TODOS los demás cartones propios de este sorteo que lo contengan (no
  // solo en el que tocaste) — mismo comportamiento que tocar el tablero de
  // apoyo 1-75, así nunca queda un cartón hermano desincronizado.
  async function marcarNumeroCarton(cartonId, numero) {
    return marcarNumeroGlobal(numero);
  }

  // Tocar un número en el tablero de apoyo 1-75 (o directo en un cartón): lo
  // marca/desmarca en todos mis cartones de este sorteo que lo contengan, de una vez.
  async function marcarNumeroGlobal(numero) {
    setMarcarError('');
    try {
      const d = await apiFetch('/cartones/marcar-numero', { method: 'PUT', body: JSON.stringify({ sorteo_id: juegoSorteoId, numero }) });
      // El panel de apoyo se marca siempre con la respuesta del servidor,
      // tenga o no tenga el número algún cartón propio — antes esto se
      // derivaba únicamente de los cartones, así que un número sin cartón
      // nunca se resaltaba en el panel.
      setMarcadosGlobal(new Set(d.tableroMarcados));
      setMisCartones((prev) => prev.map((c) => {
        const upd = d.cartones.find((x) => x.id === c.id);
        return upd ? { ...c, marcados: upd.marcados, cercaDeGanar: upd.cercaDeGanar } : c;
      }));
    } catch (e) { setMarcarError(e.message); }
  }

  // Grilla de "Mis Cartones" (agrupada por carta), reutilizada por las 2
  // vistas de la sala de juego (lado a lado / apilado) para no duplicar esta
  // lógica — solo cambia el `compact` que reciben ComboCard/MiniCard.
  function misCartonesGrid(compact) {
    const handleClick = enJuego && marcarEnCarton ? (carton, n) => marcarNumeroCarton(carton.id, n) : undefined;
    function renderCarta(grupo, cards) {
      return cards.length > 1 ? (
        <ComboCard
          key={grupo}
          grupo={grupo}
          color={cards[0].color}
          cartones={cards}
          onCellClick={handleClick}
          showCercaDeGanar
          respetarBloqueo
          compact={compact}
        />
      ) : (
        <MiniCard
          key={grupo}
          carton={cards[0]}
          showCercaDeGanar
          respetarBloqueo
          onCellClick={handleClick ? (n) => handleClick(cards[0], n) : undefined}
          compact={compact}
        />
      );
    }
    const propias = misCartones.filter((c) => c.propio);
    const delegadas = misCartones.filter((c) => !c.propio);
    const gruposPropios = [...new Map(propias.map((c) => [c.grupo, c])).keys()];
    const gruposDelegados = [...new Map(delegadas.map((c) => [c.grupo, c])).keys()];
    return (
      <>
        {gruposPropios.map((grupo) => {
          const cards = propias.filter((c) => c.grupo === grupo);
          return (
            <div key={'propia-' + grupo} className="space-y-1">
              {/* Alguien más está jugando esta carta MÍA por mí (yo la delegué) */}
              {cards[0].jugadoPorNombre && (
                <div className="text-[11px] text-amber-300">🎭 La está jugando: <b>{cards[0].jugadoPorNombre}</b></div>
              )}
              {renderCarta(grupo, cards)}
            </div>
          );
        })}
        {gruposDelegados.length > 0 && (
          <div className="col-span-full text-xs font-bold text-violet-300 uppercase tracking-wide pt-2 mt-1 border-t border-slate-700/50">
            🎭 Cartas que juego por otros
          </div>
        )}
        {gruposDelegados.map((grupo) => {
          const cards = delegadas.filter((c) => c.grupo === grupo);
          return (
            <div key={'delegada-' + grupo} className="space-y-1">
              <div className="flex items-center justify-between gap-2 text-[11px] text-violet-300">
                <span>De: <b>{cards[0].duenoNombre}</b></span>
                <button
                  type="button"
                  onClick={() => soltarCarta(cards[0].owner_id, grupo)}
                  className="text-slate-400 hover:text-red-300 underline shrink-0"
                >Soltar</button>
              </div>
              {renderCarta(grupo, cards)}
            </div>
          );
        })}
        {!misCartones.length && <span className="text-slate-500 text-sm">Aún no tienes cartones para este sorteo.</span>}
      </>
    );
  }

  return (
    <div className="space-y-6">
      <RecordatorioPago />
      {compraInfo && (
        <Modal title="🎉 ¡Compra Registrada!" onClose={() => setCompraInfo(null)} centerTitle>
          <div className="space-y-3 text-center">
            <p className="text-slate-300">👋 Hola <b className="text-slate-100">{user.nombre}</b></p>
            <p className="text-slate-200">
              Total a pagar: <b className="text-emerald-400">{money(compraInfo.monto)}</b>
            </p>
            <div className="bg-slate-800/60 border border-slate-700 rounded-lg px-4 py-3">
              <p className="text-xs uppercase tracking-wide text-slate-400 mb-1">
                {sorteoSel?.tipo_venta > 1 ? (compraInfo.grupos.length > 1 ? 'Cartas' : 'Carta') : (compraInfo.numeros.length > 1 ? 'Cartones' : 'Cartón')}
              </p>
              <p className="text-lg font-black text-fuchsia-300">
                {(sorteoSel?.tipo_venta > 1 ? compraInfo.grupos : compraInfo.numeros).join(', ')}
              </p>
            </div>
            <div className="bg-amber-500/10 border border-amber-500/40 rounded-lg px-3 py-2 text-sm text-amber-200">
              ⏳ Tu pago quedó <b>PENDIENTE de confirmación</b>. Envía la captura/comprobante de tu pago al grupo de WhatsApp para que el administrador lo verifique.
            </div>
            <WhatsAppButton className="w-full" />
            {compraInfo.piePagina && (
              <div className="bg-slate-800/60 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-300 whitespace-pre-line">{compraInfo.piePagina}</div>
            )}
            <Button className="w-full" onClick={() => setCompraInfo(null)}>Entendido</Button>
          </div>
        </Modal>
      )}

      {delegarAbierto && (
        <Modal title="🎭 Jugar por otra persona" onClose={() => setDelegarAbierto(false)} wide>
          <div className="space-y-3">
            <p className="text-xs text-slate-400">
              Busca a alguien que ya tenga cartas en este sorteo (por su nombre o WhatsApp), elige cuáles quieres jugarle y aparecerán en tu sala junto a las tuyas. Sus cartas siguen siendo de esa persona — el premio, si gana, es para ella.
            </p>
            <Input
              placeholder="Buscar por nombre o WhatsApp..."
              value={delegarQuery}
              onChange={(e) => buscarParaDelegar(e.target.value)}
              autoFocus
            />
            {!delegarJugador && (
              <div className="space-y-1 max-h-56 overflow-y-auto">
                {delegarBuscando && <div className="text-sm text-slate-500">Buscando...</div>}
                {!delegarBuscando && delegarQuery.trim() && !delegarResultados.length && (
                  <div className="text-sm text-slate-500">Nadie con cartas en este sorteo coincide con "{delegarQuery.trim()}".</div>
                )}
                {delegarResultados.map((j) => (
                  <button
                    key={j.id}
                    type="button"
                    onClick={() => elegirJugadorDelegar(j)}
                    className="w-full text-left bg-slate-800/60 hover:bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm"
                  >
                    <b className="text-slate-100">{j.nombre}</b> <span className="text-slate-400">· {j.whatsapp}</span>
                  </button>
                ))}
              </div>
            )}
            {delegarJugador && (
              <div className="space-y-3">
                <div className="flex items-center justify-between bg-slate-800/60 border border-slate-700 rounded-lg px-3 py-2">
                  <span className="text-sm">Cartas de <b className="text-slate-100">{delegarJugador.nombre}</b></span>
                  <button type="button" onClick={() => setDelegarJugador(null)} className="text-xs text-slate-400 hover:text-slate-200 underline">Cambiar</button>
                </div>
                {!delegarGrupos.length && <div className="text-sm text-slate-500">Esta persona no tiene cartas vendidas en este sorteo.</div>}
                <div className="grid grid-cols-[repeat(auto-fit,minmax(120px,1fr))] gap-3 max-h-96 overflow-y-auto">
                  {delegarGrupos.map((g) => {
                    const tomadaPorOtro = g.delegadoId && !g.delegadoSoyYo;
                    const elegida = delegarSeleccion.has(g.grupo);
                    return (
                      <button
                        key={g.grupo}
                        type="button"
                        disabled={tomadaPorOtro}
                        onClick={() => toggleDelegarGrupo(g)}
                        className={`text-left rounded-xl border-2 p-1.5 transition ${
                          tomadaPorOtro ? 'border-slate-700 opacity-50 cursor-not-allowed' :
                          elegida ? 'border-emerald-500 bg-emerald-500/10' : 'border-slate-700 hover:border-violet-500/60'
                        }`}
                      >
                        <div className="text-[11px] font-semibold mb-1 flex items-center justify-between gap-1">
                          <span>Carta {g.grupo}</span>
                          {elegida && <span className="text-emerald-400">✓</span>}
                        </div>
                        {tomadaPorOtro && <div className="text-[10px] text-amber-300 mb-1">🎭 La juega: {g.delegadoNombre}</div>}
                        <MiniCard carton={g.cartones[0]} compact />
                      </button>
                    );
                  })}
                </div>
                {delegarError && <div className="text-sm text-red-400 bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2">{delegarError}</div>}
                <Button disabled={!delegarSeleccion.size || delegarGuardando} onClick={confirmarDelegar} className="w-full">
                  {delegarGuardando ? 'Guardando...' : `Jugar ${delegarSeleccion.size || ''} carta(s) seleccionada(s)`}
                </Button>
              </div>
            )}
          </div>
        </Modal>
      )}

      {/* Array, no un solo objeto: si el jugador (u otro) ganó en 2+ cartones
          casi al mismo tiempo, cada bingo tiene su propia ventana con su
          propia info — ninguno se tapa ni se pierde. */}
      {ganadoresInfo.map((g, i) => (
        <Modal
          key={g.ganadorId ?? i}
          title={ganadoresInfo.length > 1 ? `🎉 ¡BINGO! (${i + 1} de ${ganadoresInfo.length})` : '🎉 ¡BINGO!'}
          onClose={() => setGanadoresInfo((prev) => prev.filter((x) => x !== g))}
          centerTitle
        >
          <div className="text-center space-y-3">
            {(g.usuarioId === user.id || misCartonesIdSet.has(g.cartonId)) ? (
              <p className="text-xl text-emerald-300 font-black">¡Ganaste {money(g.premio)}! 🏆</p>
            ) : (
              <p className="text-lg text-slate-200">
                Bingo cantado por <b>{g.usuario}</b>{g.jugadoPorNombre && <> (JUGADO POR <b>{g.jugadoPorNombre}</b>)</>}. ¡Suerte en el próximo sorteo!
              </p>
            )}
            <p className="text-sm text-slate-400">
              {sorteoJuego?.tipo_venta > 1 && g.grupo ? <>Carta <b>{g.grupo}</b> · Cartón <b>{g.letra}</b></> : <>Cartón ganador #{g.cartonNumero}</>} · Figura: {patrones.find((p) => p.key === g.patron)?.label || g.patron}
            </p>
            {g.grid && (
              <div className="max-w-[240px] mx-auto">
                <MiniCard carton={{ grid: g.grid, marcados: g.marcados, color: g.color, numero: g.cartonNumero }} letra={sorteoJuego?.tipo_venta > 1 ? g.letra : undefined} numerosGanadores={g.numerosGanadores} />
              </div>
            )}
            <p className="text-sm font-black text-emerald-300 bg-emerald-500/10 border border-emerald-500/40 rounded-lg px-3 py-2">
              🎊 ¡Felicidades!
            </p>
            <div className="flex gap-2">
              <WhatsAppButton className="flex-1" />
              <Button variant="ghost" className="flex-1" onClick={() => setGanadoresInfo((prev) => prev.filter((x) => x !== g))}>Seguir jugando</Button>
            </div>
          </div>
        </Modal>
      ))}

      {/* Aviso grande de mis propios reclamos: aparece apenas completo una figura
          (antes de que el admin confirme), con el cartón y el botón de WhatsApp a mano
          para enviar el comprobante. Cuando el admin lo valida, este modal se reemplaza
          solo por el de "¡Ganaste!" (arriba); si lo invalida, desaparece y avisa abajo. */}
      {reclamosPropios.map((r) => reclamosMinimizados.has(r.reclamoId) ? (
        <button
          key={r.reclamoId}
          type="button"
          onClick={() => toggleReclamoMinimizado(r.reclamoId)}
          className="fixed bottom-4 left-4 z-50 flex items-center gap-2 bg-amber-500 text-slate-900 font-bold rounded-full shadow-glow px-4 py-2.5 pop-in"
        >
          <span className="w-4 h-4 rounded-full border-2 border-slate-900/40 border-t-slate-900 animate-spin shrink-0"></span>
          🙋 En espera · {r.label}
        </button>
      ) : (
        <div key={r.reclamoId} className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border-2 border-amber-500 rounded-2xl shadow-glow p-5 w-full max-w-sm pop-in text-center space-y-3 relative">
            <button
              type="button"
              onClick={() => toggleReclamoMinimizado(r.reclamoId)}
              title="Minimizar y seguir jugando"
              className="absolute top-3 right-3 text-slate-400 hover:text-slate-200 text-lg leading-none"
            >—</button>
            <div className="flex items-center justify-center gap-2">
              <div className="w-6 h-6 rounded-full border-2 border-amber-400/40 border-t-amber-400 animate-spin shrink-0"></div>
              <h3 className="text-lg font-black text-amber-300">🙋 ¡BINGO! · en espera</h3>
            </div>
            <p className="text-sm text-slate-300">
              {sorteoJuego?.tipo_venta > 1 && r.grupo ? <>Carta <b>{r.grupo}</b> · Cartón <b>{r.letra}</b></> : <>Cartón <b>#{r.cartonNumero}</b></>} · Figura: <b>{r.label}</b>
            </p>
            <p className="text-xs text-amber-200 bg-amber-500/10 border border-amber-500/40 rounded-lg px-3 py-2">
              El administrador está validando tu cartón.
            </p>
            {r.grid && (
              <div className="max-w-[220px] mx-auto">
                <MiniCard carton={{ grid: r.grid, marcados: r.marcados, color: r.color, numero: r.cartonNumero }} letra={sorteoJuego?.tipo_venta > 1 ? r.letra : undefined} />
              </div>
            )}
            <p className="text-sm font-black text-amber-300 bg-amber-500/10 border border-amber-500/40 rounded-lg px-3 py-2">
              📣 ¡CANTA BINGO POR EL GRUPO!
            </p>
            <div className="flex gap-2">
              <WhatsAppButton className="flex-1" />
              <Button variant="ghost" className="flex-1" onClick={() => toggleReclamoMinimizado(r.reclamoId)}>Minimizar</Button>
            </div>
          </div>
        </div>
      ))}

      {invalidoMsg && (
        <div className="fixed bottom-4 right-4 z-40 max-w-xs w-full">
          <div className="pop-in bg-slate-800 border border-red-500/50 text-red-200 rounded-xl shadow-glow px-4 py-3 text-sm">
            ❌ {invalidoMsg}
          </div>
        </div>
      )}

      {cercaToasts.length > 0 && (
        <div className="fixed bottom-4 right-4 z-40 max-w-xs w-full space-y-2">
          {cercaToasts.map((t) => (
            <div key={t.id} className="pop-in bg-gradient-to-br from-amber-500 to-orange-600 text-white rounded-xl shadow-glow px-4 py-3 text-sm font-bold flex items-start gap-2">
              <span className="flex-1">🔥 {t.texto}</span>
              <button
                type="button"
                onClick={() => setCercaToasts((prev) => prev.filter((x) => x.id !== t.id))}
                className="shrink-0 text-white/80 hover:text-white leading-none text-base"
                title="Cerrar aviso"
              >✕</button>
            </div>
          ))}
        </div>
      )}

      {!sorteosActivos.length && (
        <Card className="text-center text-slate-400 py-10">
          🕐 No hay ningún sorteo activo en este momento.
          <br />Vuelve más tarde.
        </Card>
      )}

      {sorteoSel && (
        <Card className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="text-lg font-bold text-fuchsia-100">🎉 Sorteo de hoy</div>
              <div className="text-sm text-slate-400">{sorteoSel.fecha_hora?.replace('T', ' ')}</div>
            </div>
            <Badge>{sorteoSel.color}</Badge>
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-300">
            <span>🎫 {sorteoSel.tipo_venta === 1 ? '1 Cartón' : `Combo x${sorteoSel.tipo_venta}`} · <b className="text-emerald-400">{money(sorteoSel.costo)}</b></span>
            <span>🏆 Premio acumulado: <b className="text-fuchsia-300">{money(sorteoSel.premioAcumulado)}</b></span>
          </div>
          <div className="flex flex-col gap-1">
            {(sorteoSel.figuras || []).map((f) => (
              <div key={f.patron} className="flex items-center gap-1.5 text-sm text-slate-300">
                <PatternGrid mask={patrones.find((p) => p.key === f.patron)?.preview} size={8} badge={badgeDePatron(f.patron)} />
                <span>{f.label} · {money(f.premio)}</span>
              </div>
            ))}
          </div>
        </Card>
      )}

      {selectedSorteoId && sorteoSel && !sorteoSel.ventas_habilitadas && (
        <Card className="text-center text-amber-200 bg-amber-500/10 border-amber-500/30 py-10">
          🔒 Las ventas de este sorteo todavía no están habilitadas.
        </Card>
      )}

      {selectedSorteoId && sorteoSel && sorteoSel.ventas_habilitadas && (
        <div id="elige-tus-cartones">
          {/* Info del jugador (nombre/WhatsApp) ya está arriba, junto al botón
              "Salir" (ver TopUserMenu) — repetirla acá era ruido. El título
              se agranda y centra para que sea lo primero que resalte,
              pensado para que se lea fácil (jugadores mayormente adultos
              mayores). */}
          <h2 className="text-2xl md:text-3xl font-black text-center text-fuchsia-100 mb-3 tracking-tight">🎟️ Elige tus cartones</h2>
          <Card className="space-y-4">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <Badge>Cartones totales: {gruposMap.size}</Badge>
              <Badge tone="yellow">Ocupados: {ocupadosCount}</Badge>
            </div>
            <div className="text-center space-y-1">
              <div className="text-sm text-slate-300">💰 Monto a pagar: <b className="text-emerald-400">{money(montoAPagar)}</b></div>
              <div className="text-sm text-slate-300">
                {sorteoSel && sorteoSel.tipo_venta > 1 ? (
                  <>🎫 Combos seleccionados: <b>{gruposSeleccionados.size}</b> ({seleccionados.size} cartones)</>
                ) : (
                  <>🎫 Cartones seleccionados: <b>{seleccionados.size}</b></>
                )}
              </div>
            </div>

            {error && <div className="text-red-400 text-sm bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2">{error}</div>}

            <div className="flex flex-wrap gap-2 items-center">
              <Input type="number" min="1" max={gruposMap.size || 1} value={cantidadAzar} onChange={(e) => setCantidadAzar(e.target.value)} className="w-20" />
              <Button variant="ghost" onClick={elegirAzar}>🎲 Azar</Button>
              <Button className="flex-1" disabled={!seleccionados.size || comprando} onClick={confirmarCompra}>
                {comprando ? 'Confirmando...' : 'Confirmar compra'}
              </Button>
            </div>

            <div>
              <h3 className="text-sm font-bold text-fuchsia-200 mb-2">{sorteoSel && sorteoSel.tipo_venta > 1 ? `Combos disponibles (x${sorteoSel.tipo_venta} cartones c/u)` : 'Cartones disponibles'}</h3>
              <div className="grid grid-cols-5 sm:grid-cols-8 md:grid-cols-10 gap-2 max-h-[420px] overflow-y-auto pr-1">
                {sorteoSel && sorteoSel.tipo_venta > 1
                  ? [...gruposMap.entries()].sort((a, b) => a[0] - b[0]).map(([grupo, cards]) => {
                      const ocupado = cards.some((c) => c.estado !== 'disponible');
                      const elegido = cards.every((c) => seleccionados.has(c.numero));
                      return (
                        <button
                          key={grupo}
                          disabled={ocupado}
                          onClick={() => toggleNumero(cards[0])}
                          className={`min-h-[3rem] rounded-lg text-[10px] font-bold transition flex flex-col items-center justify-center leading-tight px-1 py-1.5 text-center ${
                            ocupado
                              ? 'bg-slate-800/60 text-slate-600 cursor-not-allowed'
                              : elegido
                              ? 'bg-gradient-to-br from-bingopurple to-bingoaccent text-white shadow-glow'
                              : 'bg-slate-800 text-slate-200 hover:bg-slate-700 border border-slate-700'
                          }`}
                        >
                          <span className="text-sm">🎫 Carta {grupo}</span>
                        </button>
                      );
                    })
                  : cartonesGrid.map((c) => {
                  const ocupado = c.estado !== 'disponible';
                  const elegido = seleccionados.has(c.numero);
                  return (
                    <button
                      key={c.id}
                      disabled={ocupado}
                      onClick={() => toggleNumero(c)}
                      className={`aspect-square rounded-lg text-xs font-bold transition ${
                        ocupado
                          ? 'bg-slate-800/60 text-slate-600 cursor-not-allowed'
                          : elegido
                          ? 'bg-gradient-to-br from-bingopurple to-bingoaccent text-white shadow-glow'
                          : 'bg-slate-800 text-slate-200 hover:bg-slate-700 border border-slate-700'
                      }`}
                    >
                      {c.numero}
                    </button>
                  );
                })}
                {!cartonesGrid.length && <span className="text-slate-500 text-sm col-span-full">Cargando cartones...</span>}
              </div>
            </div>
          </Card>
        </div>
      )}

      <div id="sala-de-juego">
        <div className="flex items-center justify-between flex-wrap gap-2 mb-1">
          <h2 className="text-xl font-bold text-fuchsia-100">Mis Cartones · Sala de Juego</h2>
          <div className="flex items-center flex-wrap gap-2">
            {/* Visible aunque el jugador todavía no tenga cartas propias: puede
                entrar solo a jugar por otra persona sin haber comprado nada. */}
            {!!delegarSorteoId && (
              <button
                type="button"
                onClick={abrirDelegar}
                className="text-xs font-semibold text-violet-300 hover:text-violet-200 bg-violet-500/10 hover:bg-violet-500/20 border border-violet-500/40 rounded-lg px-2.5 py-2 shrink-0"
              >🎭 Jugar por otra persona</button>
            )}
            {misSorteos.length > 0 && (
              <Select className="w-40" value={juegoSorteoId || ''} onChange={(e) => setJuegoSorteoId(Number(e.target.value))}>
                {misSorteos.map((id) => <option key={id} value={id}>Sorteo #{id}</option>)}
              </Select>
            )}
            <label className="flex items-center gap-2 text-sm text-slate-300 bg-slate-800/60 px-3 py-2 rounded-lg border border-slate-700 whitespace-nowrap">
              <input type="checkbox" checked={marcarEnCarton} onChange={(e) => setMarcarEnCarton(e.target.checked)} /> Marcar tocando el cartón
            </label>
            {sorteoJuego?.vozAnuncianteActiva && (
              <button
                type="button"
                onClick={() => setVozActiva((v) => !v)}
                title="Anunciar por voz cada número cantado (solo para vos, en este dispositivo)"
                className={`text-xs px-3 py-2 rounded-lg border transition whitespace-nowrap ${vozActiva ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-300' : 'bg-slate-800/60 border-slate-700 text-slate-400'}`}
              >
                {vozActiva ? '🔊 Voz' : '🔇 Voz'}
              </button>
            )}
            <div className="flex rounded-lg border border-slate-700 overflow-hidden text-xs shrink-0">
              <button
                type="button"
                onClick={() => setVistaJuego('lado')}
                className={`px-2.5 py-2 font-semibold transition ${vistaJuego === 'lado' ? 'bg-bingopurple text-white' : 'bg-slate-800/60 text-slate-400 hover:bg-slate-800'}`}
              >
                ↔️ Lado a lado
              </button>
              <button
                type="button"
                onClick={() => setVistaJuego('apilado')}
                className={`px-2.5 py-2 font-semibold transition ${vistaJuego === 'apilado' ? 'bg-bingopurple text-white' : 'bg-slate-800/60 text-slate-400 hover:bg-slate-800'}`}
              >
                ⬇️ Apilado
              </button>
            </div>
          </div>
        </div>
        {juegoSorteoId ? (
          <div className="space-y-4">
            <Card>
              {!enJuego && (
                <div className="bg-slate-800/60 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-300 text-center">
                  {sorteoJuego?.estatus === 'finalizado'
                    ? '🏁 Este sorteo ya finalizó.'
                    : '⏳ Esperando a que el administrador inicie el juego. Marca tus cartones según lo que cante el sorteador cuando comience.'}
                </div>
              )}
              {marcarError && <div className="text-red-400 text-sm bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2 mt-2">{marcarError}</div>}
              {montoPendiente > 0 && (
                <div className="mt-4 bg-amber-500/10 border border-amber-500/40 rounded-lg px-3 py-2 text-sm text-amber-200 text-center space-y-2">
                  <div>⏳ Monto pendiente por pagar: <b>{money(montoPendiente)}</b></div>
                  <WhatsAppButton className="max-w-xs mx-auto" />
                </div>
              )}
              {sorteoJuego?.figuras?.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-4 pt-3 border-t border-slate-700/50">
                  {sorteoJuego.figuras.map((f) => {
                    const abierta = figurasAbiertas.has(f.patron);
                    return (
                      <div key={f.patron} className="flex flex-col items-start gap-1">
                        <button
                          type="button"
                          onClick={() => toggleFiguraAbierta(f.patron)}
                          className={`text-xs px-2.5 py-1 rounded-full border transition ${
                            f.ganada
                              ? 'bg-slate-800/40 border-slate-700 text-slate-500 line-through'
                              : f.bloqueada
                              ? 'bg-slate-800/20 border-slate-700/60 text-slate-500'
                              : 'bg-bingopurple/20 border-bingopurple/40 text-fuchsia-200 hover:bg-bingopurple/30'
                          }`}
                        >
                          {f.label}{f.ganada ? ` · ${f.ganador?.jugador || ''}` : f.bloqueada ? ` · 🔒 tras ${f.activaTrasLabel}` : ' · en juego'} {abierta ? '▲' : '▼'}
                        </button>
                        {abierta && f.preview && (
                          <div className="bg-slate-800/60 border border-slate-700 rounded-lg p-2">
                            <PatternGrid mask={f.preview} size={14} badge={badgeDePatron(f.patron)} />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </Card>
          {misGanadas.length > 0 && (
            <Card className="border-emerald-500/50 bg-emerald-500/5">
              <h3 className="text-sm font-bold text-emerald-300 mb-2">🏆 Mis Bingos Ganados en este Sorteo</h3>
              <div className="space-y-1.5">
                {misGanadas.map((g, i) => (
                  <div key={i} className="flex items-center justify-between gap-2 bg-slate-800/40 rounded-lg px-3 py-1.5 text-sm">
                    <span className="text-emerald-200 font-semibold">🎉 {g.label}</span>
                    <span className="text-xs text-slate-400">
                      {g.grupo ? `Carta ${g.grupo}${g.letra ? ` · Cartón ${g.letra}` : ''}` : `Cartón #${g.carton_numero}`} · <b className="text-emerald-400">{money(g.premio)}</b>
                    </span>
                  </div>
                ))}
              </div>
            </Card>
          )}
          {vistaJuego === 'lado' ? (
            <div className="space-y-2">
              {/* El historial de bolitas chicas se queda en su tarjeta propia,
                  ancho completo, ARRIBA de la fila de 2 columnas (misma
                  posición de siempre). La bola grande ya no va acá — se
                  movió adentro del Panel de apoyo (ver más abajo). Ya NO es
                  sticky: no hace falta que quede anclado en pantalla mientras
                  se scrollea, se va con el resto de la página como cualquier
                  tarjeta normal. */}
              {sorteoJuego?.cantadorActivo && (sorteoJuego?.numerosExtraidos || []).length > 1 && (
                <Card>
                  <HistorialBolas numerosExtraidos={sorteoJuego?.numerosExtraidos || []} />
                </Card>
              )}
              <div className="grid grid-cols-[112px,1fr] sm:grid-cols-[190px,1fr] gap-1 sm:gap-4">
                {/* Div propio en vez de <Card> acá: el padding p-5 de Card le
                    quitaría demasiado ancho a los números en esta columna angosta
                    del celular. Mismo estilo visual, con menos padding.
                    self-start + sticky: el panel no se estira a la altura de
                    "Mis Cartones" (que puede ser larga), y al scrollear se queda
                    fijo en pantalla en vez de desaparecer hacia arriba — vuelve a
                    su lugar normal al llegar de nuevo al principio de esta fila.
                    top fijo: el historial de arriba ya no es sticky, así que no
                    hay que dejarle lugar dinámico — este panel se ancla directo
                    a 8px del borde. */}
                <div
                  className="self-start sticky top-2 z-10 bg-slate-900/60 backdrop-blur border border-bingopurple/30 rounded-2xl shadow-glow p-1 sm:p-2"
                >
                  <h3 className="text-xs font-bold text-fuchsia-200 mb-1">Panel de apoyo · {marcadosGlobal.size}/75</h3>
                  <p className="text-xs text-slate-500 mb-1 hidden sm:block">Toca un número para marcarlo en todos tus cartones que lo tengan.</p>
                  {sorteoJuego?.cantadorActivo && (
                    <div className="mb-2 flex justify-center">
                      <BolaActual
                        numerosExtraidos={sorteoJuego?.numerosExtraidos || []}
                        onBolaClick={enJuego ? marcarNumeroGlobal : undefined}
                        marcadosGlobal={marcadosGlobal}
                      />
                    </div>
                  )}
                  <NumberBoard75 marcadosGlobal={marcadosGlobal} cercaGlobal={cercaGlobal} onToggle={enJuego ? marcarNumeroGlobal : undefined} compact />
                </div>
                {/* Mismo motivo: menos padding acá libera ancho para los cartones. */}
                <div className="bg-slate-900/60 backdrop-blur border border-bingopurple/30 rounded-2xl shadow-glow p-2 sm:p-5">
                  <h3 className="text-sm font-bold text-fuchsia-200 mb-3">Mis Cartones ({new Set(misCartones.map((c) => c.grupo)).size})</h3>
                  {/* minmax 216px (no 150px): un combo x4 (ComboCard compact)
                      necesita ~206px para sus 2 columnas internas de 97px -- con
                      un piso más chico, auto-fit metía más columnas de las que
                      un combo puede mostrar sin scroll horizontal interno. */}
                  <div className="grid grid-cols-[repeat(auto-fit,minmax(216px,1fr))] gap-3">
                    {misCartonesGrid(true)}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Vista "apilado": el historial de bolitas chicas va en su
                  PROPIA tarjeta, separada del panel de apoyo (misma posición
                  de siempre) — pero ya NO sticky, se va con el resto de la
                  página al scrollear. La bola grande se movió adentro del
                  Panel de apoyo. */}
              {sorteoJuego?.cantadorActivo && (sorteoJuego?.numerosExtraidos || []).length > 1 && (
                <Card>
                  <HistorialBolas numerosExtraidos={sorteoJuego?.numerosExtraidos || []} />
                </Card>
              )}
              <Card>
                <h3 className="text-sm font-bold text-fuchsia-200 mb-2">Panel de apoyo · {marcadosGlobal.size}/75</h3>
                <p className="text-xs text-slate-500 mb-2">Toca un número para marcarlo en todos tus cartones que lo tengan.</p>
                {sorteoJuego?.cantadorActivo && (
                  <div className="mb-3 flex justify-center">
                    <BolaActual
                      numerosExtraidos={sorteoJuego?.numerosExtraidos || []}
                      onBolaClick={enJuego ? marcarNumeroGlobal : undefined}
                      marcadosGlobal={marcadosGlobal}
                    />
                  </div>
                )}
                <NumberBoard75 marcadosGlobal={marcadosGlobal} cercaGlobal={cercaGlobal} onToggle={enJuego ? marcarNumeroGlobal : undefined} compact={false} />
              </Card>
              <Card>
                <h3 className="text-sm font-bold text-fuchsia-200 mb-3">Mis Cartones ({new Set(misCartones.map((c) => c.grupo)).size})</h3>
                <div className="grid sm:grid-cols-2 gap-3">
                  {misCartonesGrid(false)}
                </div>
              </Card>
            </div>
          )}
          </div>
        ) : <Card><span className="text-slate-500 text-sm">Compra un cartón para habilitar la sala de juego.</span></Card>}
      </div>
    </div>
  );
}

function UserApp() {
  const tabs = [{ key: 'jugar', label: 'Jugar', icon: '🎱' }];
  // Único tab: antes no hacía nada al tocarlo, lo que se sentía roto (sobre
  // todo para quien ya scrolleó lejos). Ahora lleva directo a la acción —
  // "Elige tus cartones" si las ventas están abiertas, si no a la sala de
  // juego (ver ids en UserJugar).
  function irAJugar() {
    const el = document.getElementById('elige-tus-cartones') || document.getElementById('sala-de-juego');
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  return (
    <Shell title="Bingo la Negra" neonTitle tabs={tabs} active="jugar" onTab={irAJugar} right={<TopUserMenu />}>
      <UserJugar />
    </Shell>
  );
}

// ===========================================================================
// LAYOUT ADMIN
// ===========================================================================
// Selector de forma para las casillas marcadas/LIBRE cuando hay un tema
// activo — "circulo" (bolita, default) o "cuadrado" (mismos colores del
// tema, sin redondear a círculo). No afecta a "Sin tema", que siempre es
// cuadrado sin brillo (ver MiniCard).
function FormaCartonPicker() {
  const { cardShape, refreshLogo } = useSettings();
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');

  async function elegirForma(forma) {
    if (forma === cardShape || guardando) return;
    setGuardando(true);
    setError('');
    try {
      await apiFetch('/settings/card-shape', { method: 'PUT', body: JSON.stringify({ forma }) });
      await refreshLogo();
    } catch (e) { setError(e.message); }
    finally { setGuardando(false); }
  }

  const opciones = [
    { id: 'circulo', label: '⚪ Círculos', desc: '"Bolita" con brillo' },
    { id: 'cuadrado', label: '⬛ Cuadrados', desc: 'Mismos colores, sin redondear' },
  ];

  return (
    <Card className="space-y-3 max-w-xl">
      <div>
        <Label>Forma de las casillas marcadas</Label>
        <p className="text-xs text-slate-500 mb-2">Solo aplica cuando hay un tema activo (no a "Sin tema").</p>
      </div>
      {error && <div className="text-sm text-red-400">{error}</div>}
      <div className="flex gap-2">
        {opciones.map((o) => (
          <button
            key={o.id}
            type="button"
            disabled={guardando}
            onClick={() => elegirForma(o.id)}
            className={`flex-1 text-center rounded-xl border-2 py-2 px-3 transition disabled:opacity-60 ${cardShape === o.id ? 'border-bingoaccent bg-bingopurple/10' : 'border-slate-700 hover:border-slate-600'}`}
          >
            <div className="text-sm font-semibold text-slate-200">{o.label}</div>
            <div className="text-[11px] text-slate-500">{o.desc}</div>
          </button>
        ))}
      </div>
    </Card>
  );
}

// Interruptor de "Bloquear cartones sin pago verificado" — mientras está
// activo, la sala de juego de cada jugador muestra sus cartones "vendido"
// (comprados, pago sin confirmar) borrosos con un candado encima en vez del
// cartón legible (ver MiniCard). Los ya "pagado" y los paneles de admin
// nunca se ven afectados.
function BloqueoCartonesToggle() {
  const { bloqueoCartonesPendientes, refreshLogo } = useSettings();
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');

  async function alternar() {
    if (guardando) return;
    setGuardando(true);
    setError('');
    try {
      await apiFetch('/settings/bloqueo-cartones', { method: 'PUT', body: JSON.stringify({ activo: !bloqueoCartonesPendientes }) });
      await refreshLogo();
    } catch (e) { setError(e.message); }
    finally { setGuardando(false); }
  }

  return (
    <Card className="space-y-3 max-w-xl">
      <div>
        <Label>🔒 Bloquear cartones sin pago verificado</Label>
        <p className="text-xs text-slate-500 mt-1">
          Si lo activás, cada jugador ve sus cartones recién comprados (pago sin confirmar) borrosos con un candado, con aviso de que debe pagar para verlos. Apenas confirmás el pago, se desbloquean solos.
        </p>
      </div>
      {error && <div className="text-sm text-red-400">{error}</div>}
      <button
        type="button"
        disabled={guardando}
        onClick={alternar}
        className={`w-full flex items-center gap-3 text-left rounded-xl border-2 py-2.5 px-3 transition disabled:opacity-60 ${bloqueoCartonesPendientes ? 'border-bingoaccent bg-bingopurple/10' : 'border-slate-700 hover:border-slate-600'}`}
      >
        <span className={`shrink-0 w-11 h-6 rounded-full relative transition ${bloqueoCartonesPendientes ? 'bg-bingoaccent' : 'bg-slate-700'}`}>
          <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all ${bloqueoCartonesPendientes ? 'left-5' : 'left-0.5'}`} />
        </span>
        <span className="text-sm font-semibold text-slate-200">{bloqueoCartonesPendientes ? 'Activado' : 'Desactivado'}</span>
      </button>
    </Card>
  );
}

// Interruptor de "Reclamos de Bingo → Carta completa": mientras está activo,
// el panel de revisión de reclamos muestra la carta completa (los cartones
// A/B/C/D del combo) en vez de solo el cartón individual que reclamó,
// con ese cartón resaltado — para verificar contra el cartón físico
// completo que suele tener el jugador, en vez del cartón suelto.
function ReclamosVistaToggle() {
  const { reclamosCartaCompleta, refresh } = useSettings();
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');

  async function alternar() {
    if (guardando) return;
    setGuardando(true);
    setError('');
    try {
      await apiFetch('/settings/reclamos-vista', { method: 'PUT', body: JSON.stringify({ activo: !reclamosCartaCompleta }) });
      await refresh();
    } catch (e) { setError(e.message); }
    finally { setGuardando(false); }
  }

  return (
    <Card className="space-y-3 max-w-xl">
      <div>
        <Label>🎫 Reclamos de Bingo: mostrar carta completa</Label>
        <p className="text-xs text-slate-500 mt-1">
          Si lo activás, cada reclamo de bingo muestra la carta completa (todos sus cartones A/B/C/D) en vez de solo el cartón que reclamó, con ese cartón resaltado — útil para verificar contra el cartón físico completo. Desactivado muestra solo el cartón individual, como hasta ahora.
        </p>
      </div>
      {error && <div className="text-sm text-red-400">{error}</div>}
      <button
        type="button"
        disabled={guardando}
        onClick={alternar}
        className={`w-full flex items-center gap-3 text-left rounded-xl border-2 py-2.5 px-3 transition disabled:opacity-60 ${reclamosCartaCompleta ? 'border-bingoaccent bg-bingopurple/10' : 'border-slate-700 hover:border-slate-600'}`}
      >
        <span className={`shrink-0 w-11 h-6 rounded-full relative transition ${reclamosCartaCompleta ? 'bg-bingoaccent' : 'bg-slate-700'}`}>
          <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all ${reclamosCartaCompleta ? 'left-5' : 'left-0.5'}`} />
        </span>
        <span className="text-sm font-semibold text-slate-200">{reclamosCartaCompleta ? 'Activado' : 'Desactivado'}</span>
      </button>
    </Card>
  );
}

// Temporizador de liberación automática de cartones pendientes de pago: el
// admin fija cuántos minutos esperar desde que un jugador aparta un cartón
// (queda 'vendido', sin pago verificado) antes de devolverlo solo a
// 'disponible' si nadie confirmó el pago -- ver backend/liberarPendientes.js
// (corre en segundo plano cada 30s, no depende de que nadie tenga la app
// abierta). 0/vacío = desactivado, como viene por defecto.
function LiberacionPendientesConfig() {
  const [minutos, setMinutos] = useState('');
  const [minutosGuardado, setMinutosGuardado] = useState(0);
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    apiFetch('/settings/liberacion-pendientes')
      .then((d) => { setMinutos(String(d.minutos || '')); setMinutosGuardado(d.minutos || 0); })
      .catch(() => {})
      .finally(() => setCargando(false));
  }, []);

  async function guardar() {
    const n = minutos === '' ? 0 : Math.trunc(Number(minutos));
    if (!Number.isFinite(n) || n < 0) { setError('Ingresá un número de minutos válido (0 o mayor)'); return; }
    setGuardando(true);
    setError('');
    setMsg('');
    try {
      await apiFetch('/settings/liberacion-pendientes', { method: 'PUT', body: JSON.stringify({ minutos: n }) });
      setMinutos(String(n || ''));
      setMinutosGuardado(n);
      setMsg('Guardado');
    } catch (e) { setError(e.message); }
    finally { setGuardando(false); }
  }

  return (
    <Card className="space-y-3 max-w-xl">
      <div>
        <Label>⏱️ Liberar cartones pendientes de pago automáticamente</Label>
        <p className="text-xs text-slate-500 mt-1">
          Cuando un jugador aparta un cartón (queda "vendido", pago sin confirmar) y pasan estos minutos sin que vos confirmes el pago, el cartón vuelve solo a "disponible" para que otro lo pueda comprar. Dejá en 0 para desactivarlo (nunca libera solo, como hasta ahora).
        </p>
      </div>
      {!cargando && (
        <div className="flex items-end gap-3">
          <div className="w-40">
            <Label>Minutos de espera</Label>
            <Input
              type="number" min="0" step="1"
              value={minutos}
              onChange={(e) => setMinutos(e.target.value)}
              placeholder="0 = desactivado"
            />
          </div>
          <Button disabled={guardando}
            onClick={guardar}>{guardando ? 'Guardando...' : 'Guardar'}</Button>
        </div>
      )}
      {msg && <div className="text-sm text-emerald-400">{msg}</div>}
      {error && <div className="text-sm text-red-400">{error}</div>}
      <p className="text-xs text-slate-500">
        {minutosGuardado > 0
          ? `Activo: los cartones sin pago verificado se liberan solos a los ${minutosGuardado} minuto(s) de apartados.`
          : 'Desactivado: los cartones apartados quedan esperando indefinidamente hasta que vos los liberes o confirmes el pago a mano.'}
      </p>
    </Card>
  );
}

// Interruptor + texto del recordatorio de pago a jugadores con cartones
// pendientes (push + voz, ver backend/recordatorioPago.js y frontend
// RecordatorioPago).
function RecordatorioPagoConfig() {
  const [activo, setActivo] = useState(false);
  const [texto, setTexto] = useState('');
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    apiFetch('/settings/recordatorio-pago')
      .then((d) => { setActivo(!!d.activo); setTexto(d.texto || ''); })
      .catch(() => {})
      .finally(() => setCargando(false));
  }, []);

  async function guardar(nuevoActivo) {
    if (nuevoActivo && !texto.trim()) { setError('Escribí el texto del recordatorio'); return; }
    setGuardando(true);
    setError('');
    setMsg('');
    try {
      const d = await apiFetch('/settings/recordatorio-pago', { method: 'PUT', body: JSON.stringify({ activo: nuevoActivo, texto }) });
      setActivo(d.activo);
      setTexto(d.texto);
      setMsg('Guardado');
    } catch (e) { setError(e.message); }
    finally { setGuardando(false); }
  }

  return (
    <Card className="space-y-3 max-w-xl">
      <div>
        <Label>⏰ Recordatorio de pago a jugadores con cartones pendientes</Label>
        <p className="text-xs text-slate-500 mt-1">
          Mientras un jugador tenga cartones "vendido" (pago sin confirmar), le repetimos este aviso cada minuto: en voz mientras tenga la app abierta, y como notificación del sistema aunque haya minimizado el navegador o cambiado de app (los navegadores no permiten voz cuando la app está realmente cerrada, solo la notificación).
        </p>
      </div>
      {!cargando && (
        <>
          <div>
            <Label>Texto del recordatorio</Label>
            <Input value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Recuerde enviar el pago de sus cartones" />
          </div>
          <button
            type="button"
            disabled={guardando}
            onClick={() => guardar(!activo)}
            className={`w-full flex items-center gap-3 text-left rounded-xl border-2 py-2.5 px-3 transition disabled:opacity-60 ${activo ? 'border-bingoaccent bg-bingopurple/10' : 'border-slate-700 hover:border-slate-600'}`}
          >
            <span className={`shrink-0 w-11 h-6 rounded-full relative transition ${activo ? 'bg-bingoaccent' : 'bg-slate-700'}`}>
              <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all ${activo ? 'left-5' : 'left-0.5'}`} />
            </span>
            <span className="text-sm font-semibold text-slate-200">{activo ? 'Activado' : 'Desactivado'}</span>
          </button>
          {texto.trim() && (
            <Button variant="ghost" className="!py-1.5 text-xs" disabled={guardando} onClick={() => guardar(activo)}>
              {guardando ? 'Guardando...' : 'Guardar texto'}
            </Button>
          )}
        </>
      )}
      {msg && <div className="text-sm text-emerald-400">{msg}</div>}
      {error && <div className="text-sm text-red-400">{error}</div>}
    </Card>
  );
}

// Selector del tema visual de los cartones (ver CARD_THEMES) — cada opción
// muestra una miniatura de las 5 franjas de color del encabezado + el ícono
// de la casilla LIBRE, para elegir a ojo sin tener que abrir un cartón real.
function TemaCartonPicker() {
  const { cardTheme, refreshLogo } = useSettings();
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');

  async function elegirTema(id) {
    if (id === cardTheme || guardando) return;
    setGuardando(true);
    setError('');
    try {
      await apiFetch('/settings/card-theme', { method: 'PUT', body: JSON.stringify({ tema: id }) });
      await refreshLogo(); // refresca /settings/public, que ahora también trae cardTheme
    } catch (e) { setError(e.message); }
    finally { setGuardando(false); }
  }

  return (
    <Card className="space-y-3 max-w-xl">
      <div>
        <Label>Tema visual de los cartones</Label>
      </div>
      {error && <div className="text-sm text-red-400">{error}</div>}
      {/* max-height + overflow-y-auto: con ~70 temas la lista completa no
          entra en pantalla — sin esto, la página de Configuración quedaba
          gigante y había que scrollear TODA la pantalla para llegar a lo
          que sigue (Usuarios administradores, etc). */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-80 overflow-y-auto pr-1 -mr-1">
        {CARD_THEME_IDS.map((id) => {
          const t = CARD_THEMES[id];
          const activo = cardTheme === id;
          const dots = t.plano ? Array(5).fill('#475569') : t.headerColores;
          return (
            <button
              key={id}
              type="button"
              disabled={guardando}
              onClick={() => elegirTema(id)}
              className={`text-left rounded-xl border-2 p-2 transition disabled:opacity-60 ${activo ? 'border-bingoaccent bg-bingopurple/10' : 'border-slate-700 hover:border-slate-600'}`}
            >
              <div className="flex gap-0.5 mb-1.5">
                {dots.map((hex, i) => <div key={i} className="flex-1 h-4 rounded-sm" style={{ background: hex }} />)}
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-base leading-none">{t.plano ? '⬜' : t.libre}</span>
                <span className="text-xs font-semibold text-slate-200 truncate">{t.nombre}</span>
                {activo && <span className="ml-auto text-[10px] text-bingoaccent font-bold shrink-0">✓</span>}
              </div>
            </button>
          );
        })}
      </div>
    </Card>
  );
}


const SONIDO_CATEGORIA_INFO = {
  alerta: { titulo: '🔔 Aviso: te falta un número', ayuda: 'Suena en la sala del jugador cada vez que un cartón entra "cerca de ganar".' },
  fanfarria: { titulo: '🎉 Fanfarria de BINGO', ayuda: 'Suena en la sala de todos los jugadores cuando se confirma un ganador.' },
  musica: { titulo: '🎵 Música de tensión', ayuda: 'Suena en loop mientras algún cartón tuyo esté "cerca de ganar", y se corta apenas deja de estarlo.' },
};

// Panel de Configuración: elegir/subir el sonido de aviso, la fanfarria de
// BINGO y la música de tensión (ver reproducirSonido/useMusicaTension más
// arriba). Los tres comparten una sola carga de /settings/sounds.
function AdminSonido() {
  const { refreshLogo } = useSettings();
  const [datos, setDatos] = useState(null);
  const [error, setError] = useState('');
  const [subiendo, setSubiendo] = useState(null); // categoría en curso de subida
  const [previewKey, setPreviewKey] = useState(null); // loop de música en reproducción ("categoria:preset:x" o "categoria:custom:id")
  const [duracionInput, setDuracionInput] = useState('8'); // input de "por tiempo fijo" de la música de tensión
  const [volumenInput, setVolumenInput] = useState(100); // medidor de volumen de la música de tensión (0-100)
  const previewHandleRef = useRef(null);
  const guardarVolumenTimeoutRef = useRef(null);

  function cargar() {
    return apiFetch('/settings/sounds').then(setDatos).catch((e) => setError(e.message));
  }
  useEffect(() => { cargar(); }, []);
  useEffect(() => () => { previewHandleRef.current && previewHandleRef.current.stop(); clearTimeout(guardarVolumenTimeoutRef.current); }, []); // corta el preview al salir de la página
  useEffect(() => { if (datos) setDuracionInput(String(datos.seleccion.musica.duracionSeg || 8)); }, [datos]);
  useEffect(() => { if (datos) setVolumenInput(datos.seleccion.musica.volumen ?? 100); }, [datos]);

  function detenerPreview() {
    if (previewHandleRef.current) { previewHandleRef.current.stop(); previewHandleRef.current = null; }
    setPreviewKey(null);
  }

  function probarUnaVez(categoria, opcion) {
    reproducirSonido(categoria, opcion.tipo === 'custom' ? { tipo: 'custom', url: opcion.url } : { tipo: 'preset', nombre: opcion.nombre });
  }

  function probarMusica(categoria, opcion) {
    const key = `${categoria}:` + (opcion.tipo === 'custom' ? `custom:${opcion.id}` : `preset:${opcion.nombre}`);
    if (previewKey === key) { detenerPreview(); return; }
    detenerPreview();
    try {
      const conVolumen = categoria === 'musica' ? { ...opcion, volumen: volumenInput } : opcion;
      previewHandleRef.current = iniciarSonidoMusica(conVolumen, { loop: true });
      setPreviewKey(key);
    } catch (e) { /* Web Audio no disponible, no es crítico */ }
  }

  const modoMusica = (datos && datos.seleccion.musica.modo) || 'continuo';

  async function guardarModoMusica(modo, duracionSeg) {
    setError('');
    try {
      await apiFetch('/settings/sounds/musica-modo', { method: 'PUT', body: JSON.stringify({ modo, duracionSeg: Number(duracionSeg) || 8 }) });
      await Promise.all([cargar(), refreshLogo()]);
    } catch (e) { setError(e.message); }
  }

  // El medidor se mueve en vivo (sin lag) sobre el preview en curso y recién
  // guarda al backend 400ms después de soltar, para no spamear al servidor
  // mientras se arrastra el slider.
  function cambiarVolumen(v) {
    setVolumenInput(v);
    if (previewHandleRef.current) previewHandleRef.current.setVolumen(v / 100);
    clearTimeout(guardarVolumenTimeoutRef.current);
    guardarVolumenTimeoutRef.current = setTimeout(async () => {
      setError('');
      try {
        await apiFetch('/settings/sounds/musica-volumen', { method: 'PUT', body: JSON.stringify({ volumen: v }) });
        await refreshLogo();
      } catch (e) { setError(e.message); }
    }, 400);
  }

  async function seleccionar(categoria, seleccion) {
    setError('');
    try {
      await apiFetch('/settings/sounds/seleccion', { method: 'PUT', body: JSON.stringify({ categoria, seleccion }) });
      await Promise.all([cargar(), refreshLogo()]);
    } catch (e) { setError(e.message); }
  }

  async function subirArchivo(categoria, file) {
    setSubiendo(categoria);
    setError('');
    try {
      const fd = new FormData();
      fd.append('archivo', file);
      fd.append('categoria', categoria);
      fd.append('nombre', file.name);
      const d = await apiFetch('/settings/sounds/upload', { method: 'POST', body: fd });
      await seleccionar(categoria, `custom:${d.asset.id}`);
    } catch (e) { setError(e.message); }
    finally { setSubiendo(null); }
  }

  function elegirArchivo(categoria, e) {
    const f = e.target.files[0];
    e.target.value = '';
    if (f) subirArchivo(categoria, f);
  }

  async function borrarAsset(categoria, id) {
    if (!confirm('¿Eliminar este sonido subido? No se puede deshacer.')) return;
    setError('');
    try {
      await apiFetch(`/settings/sounds/${id}`, { method: 'DELETE' });
      await Promise.all([cargar(), refreshLogo()]);
    } catch (e) { setError(e.message); }
  }

  if (!datos) return null;

  return (
    <Card className="space-y-5 max-w-xl">
      <div>
        <Label>Sonido y música</Label>
        <p className="text-xs text-slate-500 mt-1">Elegí entre los sonidos incluidos o subí los tuyos (ej. tu propia música de suspenso) — quedan guardados para volver a elegirlos sin tener que subirlos de nuevo.</p>
      </div>
      {error && <div className="text-sm text-red-400">{error}</div>}
      {['alerta', 'fanfarria', 'musica'].map((categoria) => {
        const info = SONIDO_CATEGORIA_INFO[categoria];
        const sel = datos.seleccion[categoria];
        const lib = datos.biblioteca[categoria];
        const selKey = sel.tipo === 'custom' ? `custom:${sel.id}` : sel.tipo === 'preset' ? `preset:${sel.nombre}` : 'off';
        const esMusica = categoria === 'musica';
        return (
          <div key={categoria} className="space-y-1.5 border-t border-slate-800 pt-4 first:border-t-0 first:pt-0">
            <div className="text-sm font-semibold text-fuchsia-100">{info.titulo}</div>
            <p className="text-xs text-slate-500 mb-1.5">{info.ayuda}</p>

            <button
              type="button"
              onClick={() => seleccionar(categoria, 'off')}
              className={`w-full flex items-center gap-2 text-left rounded-lg border px-3 py-2 text-sm transition ${selKey === 'off' ? 'border-bingoaccent bg-bingopurple/10 text-fuchsia-100' : 'border-slate-700 text-slate-300 hover:border-slate-600'}`}
            >
              🔇 Apagado
              {selKey === 'off' && <span className="ml-auto text-bingoaccent text-xs font-bold shrink-0">✓</span>}
            </button>

            {lib.presets.map((p) => {
              const key = `preset:${p.nombre}`;
              const activo = selKey === key;
              const previewing = esMusica && previewKey === `${categoria}:${key}`;
              return (
                <div key={key} className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm transition ${activo ? 'border-bingoaccent bg-bingopurple/10' : 'border-slate-700'}`}>
                  <button type="button" onClick={() => seleccionar(categoria, key)} className={`flex-1 text-left ${activo ? 'text-fuchsia-100' : 'text-slate-300'}`}>{p.etiqueta}</button>
                  <button
                    type="button"
                    onClick={() => (esMusica ? probarMusica(categoria, { tipo: 'preset', nombre: p.nombre }) : probarUnaVez(categoria, { tipo: 'preset', nombre: p.nombre }))}
                    className="text-xs text-bingoaccent shrink-0 px-1"
                  >
                    {previewing ? '■' : '▶'}
                  </button>
                  {activo && <span className="text-bingoaccent text-xs font-bold shrink-0">✓</span>}
                </div>
              );
            })}

            {lib.custom.map((a) => {
              const key = `custom:${a.id}`;
              const activo = selKey === key;
              const previewing = esMusica && previewKey === `${categoria}:${key}`;
              return (
                <div key={key} className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm transition ${activo ? 'border-bingoaccent bg-bingopurple/10' : 'border-slate-700'}`}>
                  <button type="button" onClick={() => seleccionar(categoria, key)} className={`flex-1 text-left truncate ${activo ? 'text-fuchsia-100' : 'text-slate-300'}`}>🎵 {a.nombre}</button>
                  <button
                    type="button"
                    onClick={() => (esMusica ? probarMusica(categoria, { tipo: 'custom', id: a.id, url: a.url }) : probarUnaVez(categoria, { tipo: 'custom', url: a.url }))}
                    className="text-xs text-bingoaccent shrink-0 px-1"
                  >
                    {previewing ? '■' : '▶'}
                  </button>
                  {activo && <span className="text-bingoaccent text-xs font-bold shrink-0">✓</span>}
                  <button type="button" onClick={() => borrarAsset(categoria, a.id)} className="text-xs text-red-400 shrink-0 px-1">🗑</button>
                </div>
              );
            })}

            <label className="inline-flex items-center gap-2 text-xs text-slate-400 cursor-pointer mt-1">
              <span className="px-2 py-1 rounded border border-slate-700 hover:border-slate-600">
                {subiendo === categoria ? 'Subiendo...' : '+ Subir archivo propio (mp3, ogg, wav, m4a)'}
              </span>
              <input
                type="file"
                accept="audio/mpeg,audio/ogg,audio/wav,audio/mp4,audio/webm,audio/x-m4a"
                className="hidden"
                disabled={subiendo === categoria}
                onChange={(e) => elegirArchivo(categoria, e)}
              />
            </label>

            {esMusica && selKey !== 'off' && (
              <div className="mt-2 pt-2 border-t border-slate-800/60 space-y-1.5">
                <div className="flex items-center gap-2 text-xs font-semibold text-slate-400">
                  <span>🔊 Volumen</span>
                  <span className="ml-auto font-normal text-slate-500">{volumenInput}%</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={volumenInput}
                  onChange={(e) => cambiarVolumen(Number(e.target.value))}
                  className="w-full accent-bingoaccent"
                />
                <div className="text-xs font-semibold text-slate-400 pt-1">¿Cuándo y cómo suena?</div>
                {[
                  { valor: 'continuo', etiqueta: 'Continuo — suena todo el tiempo que haya tensión' },
                  { valor: 'una_vez', etiqueta: 'Una vez — un solo disparo al entrar en tensión' },
                  { valor: 'duracion', etiqueta: 'Por tiempo fijo — X segundos al entrar en tensión' },
                ].map((op) => (
                  <button
                    key={op.valor}
                    type="button"
                    onClick={() => guardarModoMusica(op.valor, duracionInput)}
                    className={`w-full flex items-center gap-2 text-left rounded-lg border px-3 py-2 text-xs transition ${modoMusica === op.valor ? 'border-bingoaccent bg-bingopurple/10 text-fuchsia-100' : 'border-slate-700 text-slate-400 hover:border-slate-600'}`}
                  >
                    {op.etiqueta}
                    {modoMusica === op.valor && <span className="ml-auto text-bingoaccent font-bold shrink-0">✓</span>}
                  </button>
                ))}
                {modoMusica === 'duracion' && (
                  <div className="flex items-center gap-2 pl-1 pt-1">
                    <Input
                      type="number"
                      min="3"
                      max="60"
                      value={duracionInput}
                      onChange={(e) => setDuracionInput(e.target.value)}
                      className="!w-20"
                    />
                    <span className="text-xs text-slate-500">segundos</span>
                    <Button variant="ghost" className="!py-1 !px-2 text-xs" onClick={() => guardarModoMusica('duracion', duracionInput)}>Guardar</Button>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </Card>
  );
}

// Categorías de la pantalla de Configuración -- separa lo que antes era una
// sola lista larga de Cards en pestañas, para que agregar funciones nuevas
// (ej. el bot de WhatsApp, con más por venir) no la haga cada vez más larga
// de recorrer.
const CONFIG_CATEGORIAS = [
  { key: 'general', label: 'General', icon: '⚙️' },
  { key: 'cartones', label: 'Cartones', icon: '🎫' },
  { key: 'sonido', label: 'Sonido', icon: '🔊' },
  { key: 'bot', label: 'Bot de WhatsApp', icon: '🤖' },
  { key: 'usuarios', label: 'Usuarios', icon: '👤' },
];

function AdminConfiguracion() {
  const { user } = useAuth();
  const { whatsappLink, refresh, logoUrl, cartonFondoUrl, refreshLogo, loginSubtitle } = useSettings();
  // Se recuerda la pestaña elegida entre sesiones, mismo criterio que otras
  // preferencias de vista de la app (ej. bingo_vista_juego).
  const [categoriaConfig, setCategoriaConfig] = useState(() => localStorage.getItem('bingo_config_categoria') || 'general');
  useEffect(() => { localStorage.setItem('bingo_config_categoria', categoriaConfig); }, [categoriaConfig]);
  const [link, setLink] = useState(whatsappLink);
  const [guardando, setGuardando] = useState(false);
  const [msg, setMsg] = useState('');
  useEffect(() => { setLink(whatsappLink); }, [whatsappLink]);

  const [subtitulo, setSubtitulo] = useState(loginSubtitle);
  const [guardandoSubtitulo, setGuardandoSubtitulo] = useState(false);
  const [msgSubtitulo, setMsgSubtitulo] = useState('');
  useEffect(() => { setSubtitulo(loginSubtitle); }, [loginSubtitle]);

  const [logoFile, setLogoFile] = useState(null);
  const [logoPreview, setLogoPreview] = useState('');
  const [subiendoLogo, setSubiendoLogo] = useState(false);
  const [msgLogo, setMsgLogo] = useState('');

  const [cartonFondoFile, setCartonFondoFile] = useState(null);
  const [cartonFondoPreview, setCartonFondoPreview] = useState('');
  const [subiendoCartonFondo, setSubiendoCartonFondo] = useState(false);
  const [eliminandoCartonFondo, setEliminandoCartonFondo] = useState(false);
  const [msgCartonFondo, setMsgCartonFondo] = useState('');

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

  async function guardarSubtitulo() {
    setGuardandoSubtitulo(true);
    setMsgSubtitulo('');
    try {
      await apiFetch('/settings/login-subtitle', { method: 'PUT', body: JSON.stringify({ mensaje: subtitulo }) });
      await refreshLogo();
      setMsgSubtitulo('✅ Mensaje guardado');
      setTimeout(() => setMsgSubtitulo(''), 2000);
    } catch (e) { setMsgSubtitulo(e.message); }
    finally { setGuardandoSubtitulo(false); }
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

  function elegirCartonFondo(e) {
    const f = e.target.files[0];
    setCartonFondoFile(f || null);
    setCartonFondoPreview(f ? URL.createObjectURL(f) : '');
  }

  async function subirCartonFondo() {
    if (!cartonFondoFile) return;
    setSubiendoCartonFondo(true);
    setMsgCartonFondo('');
    try {
      const fd = new FormData();
      fd.append('imagen', cartonFondoFile);
      await apiFetch('/settings/carton-fondo', { method: 'POST', body: fd });
      await refreshLogo();
      setCartonFondoFile(null);
      setCartonFondoPreview('');
      setMsgCartonFondo('✅ Imagen de fondo actualizada');
      setTimeout(() => setMsgCartonFondo(''), 2000);
    } catch (e) { setMsgCartonFondo(e.message); }
    finally { setSubiendoCartonFondo(false); }
  }

  async function eliminarCartonFondo() {
    if (!confirm('¿Quitar la imagen de fondo de los cartones? Vuelven al fondo del tema normal.')) return;
    setEliminandoCartonFondo(true);
    setMsgCartonFondo('');
    try {
      await apiFetch('/settings/carton-fondo', { method: 'DELETE' });
      await refreshLogo();
      setMsgCartonFondo('✅ Imagen de fondo eliminada');
      setTimeout(() => setMsgCartonFondo(''), 2000);
    } catch (e) { setMsgCartonFondo(e.message); }
    finally { setEliminandoCartonFondo(false); }
  }

  // --- Bot de WhatsApp: escucha el grupo y canta los números solo (ver
  // backend/whatsappBot.js). Estado en vivo por socket, igual que el resto
  // del admin -- así el QR aparece/desaparece sin tener que recargar.
  const [botEstado, setBotEstado] = useState({ conectado: false, conectando: false, qrDataUrl: null, numero: null, grupos: [], grupoSeleccionado: '' });
  const [grupoElegido, setGrupoElegido] = useState('');
  const [guardandoGrupo, setGuardandoGrupo] = useState(false);
  const [msgBot, setMsgBot] = useState('');
  const [desconectandoBot, setDesconectandoBot] = useState(false);

  function aplicarEstadoBot(d) {
    setBotEstado(d);
    // No pisa lo que el admin ya venía eligiendo en el <Select> a mitad de
    // camino -- solo precarga la primera vez (grupoElegido todavía vacío).
    setGrupoElegido((prev) => prev || d.grupoSeleccionado || '');
  }
  useEffect(() => {
    apiFetch('/settings/whatsapp-bot/estado').then(aplicarEstadoBot).catch(() => {});
    socket.on('whatsapp-bot-estado', aplicarEstadoBot);
    return () => socket.off('whatsapp-bot-estado', aplicarEstadoBot);
  }, []);

  async function guardarGrupoBot() {
    setGuardandoGrupo(true);
    setMsgBot('');
    try {
      await apiFetch('/settings/whatsapp-bot/grupo', { method: 'PUT', body: JSON.stringify({ grupoId: grupoElegido }) });
      setMsgBot('✅ Grupo guardado');
      setTimeout(() => setMsgBot(''), 2000);
    } catch (e) { setMsgBot(e.message); }
    finally { setGuardandoGrupo(false); }
  }

  async function desconectarBot() {
    if (!confirm('¿Desconectar el bot de WhatsApp? Vas a tener que escanear un código QR nuevo para volver a conectarlo.')) return;
    setDesconectandoBot(true);
    setMsgBot('');
    try {
      await apiFetch('/settings/whatsapp-bot/desconectar', { method: 'POST' });
    } catch (e) { setMsgBot(e.message); }
    finally { setDesconectandoBot(false); }
  }

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-bold text-fuchsia-100">Configuración</h2>

      {/* Categorías: antes esto era una sola lista larga de Cards, cada vez
          más incómoda de recorrer a medida que se suman funciones nuevas
          (ver Bot de WhatsApp). Se recuerda la última pestaña elegida entre
          sesiones (localStorage), igual que otras preferencias de vista de
          la app. */}
      <div className="flex flex-wrap gap-2">
        {CONFIG_CATEGORIAS.map((c) => (
          <button
            key={c.key}
            type="button"
            onClick={() => setCategoriaConfig(c.key)}
            className={`px-3 py-2 rounded-xl text-sm font-semibold transition flex items-center gap-1.5 ${
              categoriaConfig === c.key
                ? 'bg-gradient-to-r from-bingopurple to-bingoaccent text-white shadow-glow'
                : 'bg-slate-800/60 text-slate-400 hover:bg-slate-800'
            }`}
          >
            <span>{c.icon}</span>{c.label}
          </button>
        ))}
      </div>

      {categoriaConfig === 'general' && (
        <div className="space-y-6">
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
              <Label>Mensaje bajo el logo (pantalla de acceso)</Label>
              <Input value={subtitulo} onChange={(e) => setSubtitulo(e.target.value)} placeholder="75 bolillas · en tiempo real" />
              <p className="text-xs text-slate-500 mt-1">Aparece animado debajo del nombre, en la pantalla de acceso. Dejalo vacío para volver al mensaje por defecto.</p>
            </div>
            {msgSubtitulo && <div className="text-sm text-emerald-400">{msgSubtitulo}</div>}
            <Button disabled={guardandoSubtitulo} onClick={guardarSubtitulo}>{guardandoSubtitulo ? 'Guardando...' : 'Guardar'}</Button>
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
        </div>
      )}

      {categoriaConfig === 'cartones' && (
        <div className="space-y-6">
          <TemaCartonPicker />
          <FormaCartonPicker />
          <Card className="space-y-3 max-w-xl">
            <div>
              <Label>Imagen de fondo del cartón</Label>
              <p className="text-xs text-slate-500 mb-2">Se muestra de fondo en todos los cartones, detrás de la grilla de números. Opcional -- sin imagen, usa el fondo del tema visual de siempre.</p>
              {cartonFondoPreview || cartonFondoUrl ? (
                <img src={cartonFondoPreview || cartonFondoUrl} alt="Fondo actual del cartón" className="w-full max-w-xs h-32 rounded-lg object-cover border-2 border-bingoaccent mb-2" />
              ) : (
                <div className="w-full max-w-xs h-32 rounded-lg border-2 border-dashed border-slate-700 flex items-center justify-center text-xs text-slate-500 mb-2">Sin imagen de fondo</div>
              )}
              <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={elegirCartonFondo} className="text-sm text-slate-300" />
            </div>
            {msgCartonFondo && <div className="text-sm text-emerald-400">{msgCartonFondo}</div>}
            <div className="flex gap-2">
              <Button disabled={!cartonFondoFile || subiendoCartonFondo} onClick={subirCartonFondo}>{subiendoCartonFondo ? 'Subiendo...' : 'Subir imagen'}</Button>
              {cartonFondoUrl && (
                <Button variant="danger" disabled={eliminandoCartonFondo} onClick={eliminarCartonFondo}>{eliminandoCartonFondo ? 'Eliminando...' : 'Eliminar imagen'}</Button>
              )}
            </div>
          </Card>
          <BloqueoCartonesToggle />
          <ReclamosVistaToggle />
        </div>
      )}

      {categoriaConfig === 'sonido' && (
        <div className="space-y-6">
          <AdminSonido />
        </div>
      )}

      {categoriaConfig === 'bot' && (
        <div className="space-y-6">
          <Card className="space-y-3 max-w-xl">
            <div className="flex items-center justify-between gap-2">
              <Label>🤖 Bot de WhatsApp — números cantados automáticos</Label>
              <Badge tone={botEstado.conectado ? 'green' : 'yellow'}>
                {botEstado.conectado ? 'Conectado' : botEstado.conectando ? 'Conectando...' : 'Desconectado'}
              </Badge>
            </div>
            <p className="text-xs text-slate-500">
              Conecta el WhatsApp que ya está en el grupo del bingo. Cuando cantes un número con su letra (ej. "B2", "N-32"), el bot lo marca solo en la app -- no hace falta tocarlo también en el panel del sorteo.
            </p>
            {!botEstado.conectado && botEstado.qrDataUrl && (
              <div className="flex flex-col items-center gap-2 bg-slate-800/60 border border-slate-700 rounded-lg p-4">
                <img src={botEstado.qrDataUrl} alt="Código QR para vincular WhatsApp" className="w-48 h-48 rounded-lg bg-white p-2" />
                <p className="text-xs text-slate-400 text-center">
                  Escanealo desde la WhatsApp: Ajustes → Dispositivos vinculados → Vincular un dispositivo.
                </p>
              </div>
            )}
            {!botEstado.conectado && !botEstado.qrDataUrl && (
              <p className="text-sm text-slate-500">{botEstado.conectando ? 'Generando código QR...' : 'Esperando conexión del servidor...'}</p>
            )}
            {botEstado.conectado && (
              <>
                <p className="text-sm text-slate-300">Conectado como <b className="text-slate-100">{botEstado.numero}</b></p>
                <div>
                  <Label>Grupo a escuchar</Label>
                  <Select value={grupoElegido} onChange={(e) => setGrupoElegido(e.target.value)}>
                    <option value="">Elige un grupo...</option>
                    {botEstado.grupos.map((g) => <option key={g.id} value={g.id}>{g.nombre}</option>)}
                  </Select>
                </div>
              </>
            )}
            {msgBot && <div className="text-sm text-emerald-400">{msgBot}</div>}
            <div className="flex gap-2">
              {botEstado.conectado && (
                <Button disabled={guardandoGrupo || !grupoElegido} onClick={guardarGrupoBot}>{guardandoGrupo ? 'Guardando...' : 'Guardar grupo'}</Button>
              )}
              {(botEstado.conectado || botEstado.qrDataUrl) && (
                <Button variant="danger" disabled={desconectandoBot} onClick={desconectarBot}>{desconectandoBot ? 'Desconectando...' : 'Desconectar'}</Button>
              )}
            </div>
          </Card>
        </div>
      )}

      {categoriaConfig === 'usuarios' && (
        <div className="space-y-6">
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
      )}
    </div>
  );
}
// ===========================================================================
// REGISTRO DE ACTIVIDAD (auditoría) — ver backend/logActividad.js
// ===========================================================================
const LOG_CATEGORIAS = [
  { key: 'login', label: 'Inicio de sesión', icon: '🔑' },
  { key: 'cartones', label: 'Cartones y Jugadores', icon: '🎫' },
  { key: 'sorteos', label: 'Sorteos', icon: '🎯' },
  { key: 'ventas', label: 'Ventas', icon: '💹' },
  { key: 'usuarios', label: 'Usuarios y Accesos', icon: '👤' },
  { key: 'configuracion', label: 'Configuración', icon: '⚙️' },
];

function AdminActividad() {
  const [categoria, setCategoria] = useState('');
  const [logs, setLogs] = useState([]);
  const [conteos, setConteos] = useState({});
  const [limit, setLimit] = useState(300);
  const [loading, setLoading] = useState(true);

  function load() {
    setLoading(true);
    const qs = new URLSearchParams({ limit });
    if (categoria) qs.set('categoria', categoria);
    apiFetch('/logs?' + qs.toString())
      .then((d) => { setLogs(d.logs); setConteos(d.conteos); })
      .finally(() => setLoading(false));
  }
  useEffect(load, [categoria, limit]);

  const catActiva = LOG_CATEGORIAS.find((c) => c.key === categoria);

  async function limpiar() {
    const texto = catActiva
      ? `¿Eliminar el registro de "${catActiva.label}"? Esta acción no se puede deshacer.`
      : '¿Eliminar TODO el registro de actividad? Esta acción no se puede deshacer.';
    if (!confirm(texto)) return;
    await apiFetch('/logs' + (categoria ? '?categoria=' + categoria : ''), { method: 'DELETE' });
    setLimit(300);
    load();
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-bold text-rose-100">Registro de Actividad</h2>
          <p className="text-sm text-slate-400">Quién hizo qué y cuándo — apartados, pagos, sorteos, usuarios y configuración.</p>
        </div>
        <Button variant="danger" onClick={limpiar}>🗑️ Limpiar {catActiva ? `"${catActiva.label}"` : 'todo'}</Button>
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => setCategoria('')}
          className={`text-xs px-3 py-1.5 rounded-full border transition ${!categoria ? 'bg-bingopurple/30 border-bingopurple/50 text-rose-200' : 'border-slate-700 text-slate-400 hover:text-slate-200'}`}
        >
          Todos ({conteos.total || 0})
        </button>
        {LOG_CATEGORIAS.map((c) => (
          <button
            key={c.key}
            onClick={() => setCategoria(c.key)}
            className={`text-xs px-3 py-1.5 rounded-full border transition ${categoria === c.key ? 'bg-bingopurple/30 border-bingopurple/50 text-rose-200' : 'border-slate-700 text-slate-400 hover:text-slate-200'}`}
          >
            {c.icon} {c.label} ({conteos[c.key] || 0})
          </button>
        ))}
      </div>

      <Card>
        {loading ? <Spinner /> : (
          <>
            <div className="space-y-2">
              {logs.map((l) => {
                const cat = LOG_CATEGORIAS.find((c) => c.key === l.categoria);
                return (
                  <div key={l.id} className="flex flex-wrap items-start gap-2 sm:gap-3 border-b border-slate-800/60 pb-2 last:border-0">
                    <span className="text-xs text-slate-500 whitespace-nowrap">{l.created_at}</span>
                    <Badge>{cat?.icon || '📋'} {cat?.label || l.categoria}</Badge>
                    <div className="flex-1 min-w-[160px]">
                      <div className="text-sm"><b>{l.usuario_nombre || 'Sistema'}</b> — {l.accion}</div>
                      {l.detalle && <div className="text-xs text-slate-400">{l.detalle}</div>}
                    </div>
                  </div>
                );
              })}
              {!logs.length && <p className="text-center text-slate-500 py-8">Sin actividad registrada.</p>}
            </div>
            {logs.length >= limit && (
              <div className="text-center mt-4">
                <Button variant="ghost" onClick={() => setLimit((n) => n + 200)}>Cargar más</Button>
              </div>
            )}
          </>
        )}
      </Card>
    </div>
  );
}

function AdminApp() {
  const [tab, setTab] = useState('sorteos');
  const tabs = [
    { key: 'sorteos', label: 'Sorteos', icon: '🎯' },
    { key: 'ventas', label: 'Ventas', icon: '💹' },
    { key: 'jugadores', label: 'Jugadores', icon: '👥' },
    { key: 'actividad', label: 'Registro de Actividad', icon: '📋' },
    { key: 'config', label: 'Configuración', icon: '⚙️' },
  ];
  return (
    <Shell title="Panel de Administración" tabs={tabs} active={tab} onTab={setTab} right={<TopUserMenu />}>
      {tab === 'sorteos' && <AdminSorteos />}
      {tab === 'ventas' && <AdminVentas />}
      {tab === 'jugadores' && <AdminJugadores />}
      {tab === 'actividad' && <AdminActividad />}
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
  return user.role === 'admin' ? <AdminApp /> : <UserApp />;
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
