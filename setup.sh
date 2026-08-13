#!/usr/bin/env bash
# ============================================================
#  Reorganiza los archivos planos en la estructura del proyecto
#  Ejecutar dentro de la carpeta donde estan todos los archivos
#  descargados (backend-*.js, frontend-*.js, etc.)
# ============================================================
set -e

mkdir -p backend/routes backend/sockets backend/uploads/comprobantes
mkdir -p frontend

mv backend-package.json backend/package.json
mv backend-db.js backend/db.js
mv backend-authMiddleware.js backend/authMiddleware.js
mv backend-cardGenerator.js backend/cardGenerator.js
mv backend-patterns.js backend/patterns.js
mv backend-server.js backend/server.js
mv backend-seed.js backend/seed.js
mv backend-env-example.txt backend/.env.example

mv backend-routes-auth.js backend/routes/auth.js
mv backend-routes-sorteos.js backend/routes/sorteos.js
mv backend-routes-cartones.js backend/routes/cartones.js
mv backend-routes-ventas.js backend/routes/ventas.js
mv backend-routes-usuarios.js backend/routes/usuarios.js

mv backend-sockets-index.js backend/sockets/index.js

mv frontend-index.html frontend/index.html
mv frontend-app.js frontend/app.js

echo ""
echo "Listo. Estructura creada:"
echo "  backend/   (API + Socket.io)"
echo "  frontend/  (index.html + app.js, sin build)"
echo ""
echo "Proximos pasos:"
echo "  cd backend && npm install && cp .env.example .env && npm run seed && npm start"
echo ""
echo "En otra terminal, para servir el frontend:"
echo "  cd frontend && npx serve -l 5173"
