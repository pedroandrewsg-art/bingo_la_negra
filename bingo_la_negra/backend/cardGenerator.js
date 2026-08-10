// cardGenerator.js — Generación de cartones de Bingo 75 bolillas (B-I-N-G-O)
// Reglas estándar: B 1-15, I 16-30, N 31-45, G 46-60, O 61-75. Centro = LIBRE.

const RANGES = {
  B: [1, 15],
  I: [16, 30],
  N: [31, 45],
  G: [46, 60],
  O: [61, 75],
};
const COLUMNS = ['B', 'I', 'N', 'G', 'O'];

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function randomColumnNumbers(col, count) {
  const [min, max] = RANGES[col];
  const pool = [];
  for (let n = min; n <= max; n++) pool.push(n);
  return shuffle(pool).slice(0, count);
}

// Genera una matriz 5x5 (filas x columnas [B,I,N,G,O]). grid[fila][columna]
function generateCardGrid() {
  const grid = [[], [], [], [], []]; // 5 filas
  COLUMNS.forEach((col, colIndex) => {
    const nums = randomColumnNumbers(col, 5);
    for (let row = 0; row < 5; row++) {
      if (colIndex === 2 && row === 2) {
        grid[row][colIndex] = null; // LIBRE (centro)
      } else {
        grid[row][colIndex] = nums[row];
      }
    }
  });
  return grid;
}

function gridSignature(grid) {
  return grid.map((row) => row.map((v) => (v === null ? 'F' : v)).join(',')).join('|');
}

// Genera `count` cartones únicos (sin duplicados de matriz) para un lote.
// `excludeSignatures` (opcional, Set/iterable de firmas ya usadas) evita que
// un lote nuevo choque con grids ya persistidos en otro momento (catálogo
// de plantillas por color+combo).
function generateUniqueCards(count, excludeSignatures) {
  const seen = new Set(excludeSignatures || []);
  const cards = [];
  let attempts = 0;
  const maxAttempts = count * 200 + 1000;
  while (cards.length < count && attempts < maxAttempts) {
    attempts++;
    const grid = generateCardGrid();
    const sig = gridSignature(grid);
    if (seen.has(sig)) continue;
    seen.add(sig);
    cards.push(grid);
  }
  if (cards.length < count) {
    throw new Error('No fue posible generar suficientes cartones únicos. Reduce la cantidad solicitada.');
  }
  return cards;
}

module.exports = { generateCardGrid, generateUniqueCards, gridSignature, COLUMNS, RANGES };
