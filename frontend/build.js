// build.js — Precompila app.jsx (JSX fuente) a app.js (JS plano, minificado).
//
// Antes, index.html cargaba Babel completo desde CDN y traducia
// app.js (JSX crudo) en el navegador de cada jugador, en cada visita —
// pesado sobre todo en celulares de gama baja/media, y el costo crecia con
// cada funcion nueva agregada al archivo. Este script hace esa traduccion
// UNA SOLA VEZ aca (al desplegar), y el navegador solo carga JS ya listo.
//
// Editá siempre app.jsx (la fuente) — nunca app.js a mano, se sobreescribe
// cada vez que se corre este script.
const fs = require("fs");
const path = require("path");
const babel = require("@babel/core");
const { minify } = require("terser");

async function build() {
  const srcPath = path.join(__dirname, "app.jsx");
  const outPath = path.join(__dirname, "app.js");
  const source = fs.readFileSync(srcPath, "utf8");

  const { code: transformed } = babel.transformSync(source, {
    presets: ["@babel/preset-react"],
    filename: "app.jsx",
    babelrc: false,
    configFile: false,
    compact: false,
  });

  const { code: minified } = await minify(transformed, {
    compress: true,
    mangle: true,
  });

  const banner = "// Generado por build.js a partir de app.jsx — no editar a mano.\n";
  fs.writeFileSync(outPath, banner + minified);
  console.log(`OK: app.jsx (${source.length} bytes) -> app.js (${minified.length} bytes)`);
}

build().catch((err) => {
  console.error("Error compilando app.jsx:", err);
  process.exit(1);
});
