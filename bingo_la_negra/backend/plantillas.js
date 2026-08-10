// plantillas.js — Catálogo persistente de cartones: la Carta N de un
// color+combo tiene siempre el mismo grid, sorteo tras sorteo. `cartones`
// sigue siendo la instancia por sorteo (estado de venta/marcado); esta
// tabla (`plantillas_cartones`) es la fuente de verdad del contenido fijo.
const db = require('./db');
const { generateUniqueCards, gridSignature } = require('./cardGenerator');

const LETRAS = ['A', 'B', 'C', 'D'];

// Devuelve, para las cartas [desde..hasta] de un color+tipoVenta, las filas
// {carta, letra, numero, grid(JSON string)} listas para insertar en
// `cartones`. Reusa las que ya existan en el catálogo; genera y persiste
// solo las que falten (sin chocar con grids ya usados por ese color+combo).
function obtenerPlantillas(color, tipoVenta, desde, hasta) {
  const existentes = db
    .prepare('SELECT * FROM plantillas_cartones WHERE color = ? AND tipo_venta = ? AND carta BETWEEN ? AND ?')
    .all(color, tipoVenta, desde, hasta);
  const mapa = new Map(existentes.map((r) => [`${r.carta}-${r.letra}`, r]));

  const faltantes = [];
  for (let carta = desde; carta <= hasta; carta++) {
    for (let i = 0; i < tipoVenta; i++) {
      const letra = LETRAS[i];
      if (!mapa.has(`${carta}-${letra}`)) faltantes.push({ carta, letra });
    }
  }

  if (faltantes.length) {
    const todasDelColor = db
      .prepare('SELECT grid FROM plantillas_cartones WHERE color = ? AND tipo_venta = ?')
      .all(color, tipoVenta);
    const excluir = new Set(todasDelColor.map((r) => gridSignature(JSON.parse(r.grid))));
    const grids = generateUniqueCards(faltantes.length, excluir);
    const insert = db.prepare(
      `INSERT INTO plantillas_cartones (color, tipo_venta, carta, letra, numero, grid) VALUES (?, ?, ?, ?, ?, ?)`
    );
    const tx = db.transaction(() => {
      faltantes.forEach((f, i) => {
        const numero = (f.carta - 1) * tipoVenta + LETRAS.indexOf(f.letra) + 1;
        const grid = JSON.stringify(grids[i]);
        insert.run(color, tipoVenta, f.carta, f.letra, numero, grid);
        mapa.set(`${f.carta}-${f.letra}`, { carta: f.carta, letra: f.letra, numero, grid });
      });
    });
    tx();
  }

  const out = [];
  for (let carta = desde; carta <= hasta; carta++) {
    for (let i = 0; i < tipoVenta; i++) {
      const letra = LETRAS[i];
      const r = mapa.get(`${carta}-${letra}`);
      out.push({ carta, letra, numero: r.numero, grid: r.grid });
    }
  }
  return out;
}

module.exports = { obtenerPlantillas, LETRAS };
