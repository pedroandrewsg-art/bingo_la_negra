// patterns.js — Catálogo de patrones/figuras de Bingo y motor de verificación
// Matriz 5x5: [fila][columna], columna 2 fila 2 = centro (LIBRE, siempre marcado)
const db = require('./db');

const PATTERNS = {
  linea_horizontal: { label: 'Línea Horizontal', type: 'any-row' },
  linea_vertical: { label: 'Línea Vertical', type: 'any-column' },
  diagonal: { label: 'Diagonal', type: 'any-diagonal' },
  cruz_x: {
    label: 'Cruz (X)',
    type: 'fixed',
    mask: [
      [1, 0, 0, 0, 1],
      [0, 1, 0, 1, 0],
      [0, 0, 1, 0, 0],
      [0, 1, 0, 1, 0],
      [1, 0, 0, 0, 1],
    ],
  },
  cuatro_esquinas: {
    label: 'Cuatro Esquinas',
    type: 'fixed',
    mask: [
      [1, 0, 0, 0, 1],
      [0, 0, 0, 0, 0],
      [0, 0, 0, 0, 0],
      [0, 0, 0, 0, 0],
      [1, 0, 0, 0, 1],
    ],
  },
  diamante: {
    label: 'Diamante',
    type: 'fixed',
    mask: [
      [0, 0, 1, 0, 0],
      [0, 1, 0, 1, 0],
      [1, 0, 1, 0, 1],
      [0, 1, 0, 1, 0],
      [0, 0, 1, 0, 0],
    ],
  },
  letra_l: {
    label: 'Letra L',
    type: 'fixed',
    mask: [
      [1, 0, 0, 0, 0],
      [1, 0, 0, 0, 0],
      [1, 0, 0, 0, 0],
      [1, 0, 0, 0, 0],
      [1, 1, 1, 1, 1],
    ],
  },
  letra_t: {
    label: 'Letra T',
    type: 'fixed',
    mask: [
      [1, 1, 1, 1, 1],
      [0, 0, 1, 0, 0],
      [0, 0, 1, 0, 0],
      [0, 0, 1, 0, 0],
      [0, 0, 1, 0, 0],
    ],
  },
  marco: {
    label: 'Marco (Borde)',
    type: 'fixed',
    mask: [
      [1, 1, 1, 1, 1],
      [1, 0, 0, 0, 1],
      [1, 0, 0, 0, 1],
      [1, 0, 0, 0, 1],
      [1, 1, 1, 1, 1],
    ],
  },
  carton_lleno: {
    label: 'Cartón Lleno',
    type: 'fixed',
    mask: [
      [1, 1, 1, 1, 1],
      [1, 1, 1, 1, 1],
      [1, 1, 1, 1, 1],
      [1, 1, 1, 1, 1],
      [1, 1, 1, 1, 1],
    ],
  },
};

function maskCells(mask) {
  const cells = [];
  for (let r = 0; r < 5; r++) for (let c = 0; c < 5; c++) if (mask[r][c]) cells.push([r, c]);
  return cells;
}

// Resuelve la definición de una figura, ya sea del catálogo fijo (PATTERNS)
// o de una figura personalizada creada por el admin (clave `custom_<id>`,
// guardada en la tabla patrones_personalizados). Devuelve null si no existe.
function getPatternDef(key) {
  if (PATTERNS[key]) return PATTERNS[key];
  if (typeof key === 'string' && key.startsWith('custom_')) {
    const id = key.slice('custom_'.length);
    const row = db.prepare('SELECT nombre, mascara FROM patrones_personalizados WHERE id = ?').get(id);
    if (row) return { label: row.nombre, type: 'fixed', mask: JSON.parse(row.mascara), personalizada: true };
  }
  return null;
}

// grid: matriz 5x5 de números (o null en el centro/LIBRE). markedSet: Set de
// números marcados por el jugador. Devuelve una matriz boolean[5][5].
function buildMarkedMatrix(grid, markedSet) {
  const matrix = [];
  for (let r = 0; r < 5; r++) {
    const row = [];
    for (let c = 0; c < 5; c++) {
      const val = grid[r][c];
      row.push(val === null ? true : markedSet.has(val));
    }
    matrix.push(row);
  }
  return matrix;
}

// Números que le faltan a un cartón para completar una figura, evaluando
// siempre el mejor caso posible (la línea/diagonal con menos huecos). Para
// figuras de máscara fija solo hay una forma de completarlas. Devuelve la
// unión (sin duplicados) de los números que, marcados, completarían la
// figura por *alguna* vía con exactamente 1 número faltante — puede haber más
// de una vía "a punto" a la vez (ej. dos filas distintas, cada una a 1 número
// de completarse). Si la figura ya está completa, o le faltan 2+ números por
// cualquier vía, no se incluye esa vía.
function nearWinNumbers(patternKey, grid, markedSet) {
  const p = getPatternDef(patternKey);
  if (!p) return [];
  const matrix = buildMarkedMatrix(grid, markedSet);
  const faltantes = new Set();

  function evaluarLinea(cells) {
    const missing = cells.filter(([r, c]) => !matrix[r][c]).map(([r, c]) => grid[r][c]);
    if (missing.length === 1) faltantes.add(missing[0]);
  }

  if (p.type === 'any-row') {
    for (let r = 0; r < 5; r++) evaluarLinea([0, 1, 2, 3, 4].map((c) => [r, c]));
  } else if (p.type === 'any-column') {
    for (let c = 0; c < 5; c++) evaluarLinea([0, 1, 2, 3, 4].map((r) => [r, c]));
  } else if (p.type === 'any-diagonal') {
    evaluarLinea([0, 1, 2, 3, 4].map((i) => [i, i]));
    evaluarLinea([0, 1, 2, 3, 4].map((i) => [i, 4 - i]));
  } else if (p.type === 'fixed') {
    evaluarLinea(maskCells(p.mask));
  }
  return [...faltantes];
}

// markedMatrix: boolean[5][5], centro siempre true (LIBRE)
function checkPattern(patternKey, markedMatrix) {
  const p = getPatternDef(patternKey);
  if (!p) return false;
  if (p.type === 'any-row') {
    for (let r = 0; r < 5; r++) if (markedMatrix[r].every(Boolean)) return true;
    return false;
  }
  if (p.type === 'any-column') {
    for (let c = 0; c < 5; c++) {
      let full = true;
      for (let r = 0; r < 5; r++) if (!markedMatrix[r][c]) full = false;
      if (full) return true;
    }
    return false;
  }
  if (p.type === 'any-diagonal') {
    let d1 = true, d2 = true;
    for (let i = 0; i < 5; i++) {
      if (!markedMatrix[i][i]) d1 = false;
      if (!markedMatrix[i][4 - i]) d2 = false;
    }
    return d1 || d2;
  }
  if (p.type === 'fixed') {
    for (const [r, c] of maskCells(p.mask)) if (!markedMatrix[r][c]) return false;
    return true;
  }
  return false;
}

// Devuelve una máscara 5x5 representativa para la vista previa en el admin
function previewMask(patternKey) {
  const p = getPatternDef(patternKey);
  if (!p) return [[0,0,0,0,0],[0,0,0,0,0],[0,0,1,0,0],[0,0,0,0,0],[0,0,0,0,0]];
  if (p.type === 'any-row') return [[0,0,0,0,0],[0,0,0,0,0],[1,1,1,1,1],[0,0,0,0,0],[0,0,0,0,0]];
  if (p.type === 'any-column') return [[0,0,1,0,0],[0,0,1,0,0],[0,0,1,0,0],[0,0,1,0,0],[0,0,1,0,0]];
  if (p.type === 'any-diagonal') return [[1,0,0,0,0],[0,1,0,0,0],[0,0,1,0,0],[0,0,0,1,0],[0,0,0,0,1]];
  return p.mask;
}

function listPatterns() {
  const sistema = Object.entries(PATTERNS).map(([key, p]) => ({
    key, label: p.label, preview: previewMask(key), personalizada: false,
  }));
  const personalizados = db
    .prepare('SELECT id, nombre, mascara FROM patrones_personalizados ORDER BY id ASC')
    .all()
    .map((r) => ({
      key: `custom_${r.id}`,
      label: r.nombre,
      preview: JSON.parse(r.mascara),
      personalizada: true,
    }));
  return [...sistema, ...personalizados];
}

module.exports = { PATTERNS, getPatternDef, checkPattern, previewMask, listPatterns, buildMarkedMatrix, nearWinNumbers };
