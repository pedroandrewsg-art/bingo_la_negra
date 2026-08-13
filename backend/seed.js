// seed.js — Datos de demostración (sorteo activo con cartones)
const db = require('./db');
const { generateUniqueCards } = require('./cardGenerator');

const existingSorteo = db.prepare("SELECT * FROM sorteos WHERE estatus = 'activo' LIMIT 1").get();
if (!existingSorteo) {
  const fecha = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString().slice(0, 16);
  const info = db
    .prepare(
      `INSERT INTO sorteos (fecha_hora, rango_desde, rango_hasta, color, tipo_venta, costo, porcentaje_ganancia, patron, estatus, numeros_extraidos)
       VALUES (?, 1, 40, 'Morado', 4, 2.5, 30, 'linea_horizontal', 'activo', '[]')`
    )
    .run(fecha);
  const sorteoId = info.lastInsertRowid;
  db.prepare('INSERT INTO sorteo_patrones (sorteo_id, patron, porcentaje, orden) VALUES (?, ?, 100, 0)').run(sorteoId, 'linea_horizontal');
  const grids = generateUniqueCards(40);
  const insert = db.prepare(
    `INSERT INTO cartones (numero, color, grid, sorteo_id, grupo, estado, marcados) VALUES (?, 'Morado', ?, ?, ?, 'disponible', '[]')`
  );
  grids.forEach((grid, i) => {
    insert.run(i + 1, JSON.stringify(grid), sorteoId, Math.floor(i / 4) + 1);
  });
  console.log(`Sorteo demo creado (ID ${sorteoId}) con 40 cartones en 10 grupos de combo x4`);
}

console.log('Seed completado.');
