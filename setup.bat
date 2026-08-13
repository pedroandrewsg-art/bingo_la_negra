@echo off
REM ============================================================
REM  Reorganiza los archivos planos en la estructura del proyecto
REM  Ejecutar este .bat DENTRO de la carpeta donde estan todos
REM  los archivos descargados (backend-*.js, frontend-*.js, etc.)
REM ============================================================

mkdir backend
mkdir backend\routes
mkdir backend\sockets
mkdir backend\uploads
mkdir backend\uploads\comprobantes
mkdir frontend

move /Y backend-package.json backend\package.json
move /Y backend-db.js backend\db.js
move /Y backend-authMiddleware.js backend\authMiddleware.js
move /Y backend-cardGenerator.js backend\cardGenerator.js
move /Y backend-patterns.js backend\patterns.js
move /Y backend-server.js backend\server.js
move /Y backend-seed.js backend\seed.js
move /Y backend-env-example.txt backend\.env.example

move /Y backend-routes-auth.js backend\routes\auth.js
move /Y backend-routes-sorteos.js backend\routes\sorteos.js
move /Y backend-routes-cartones.js backend\routes\cartones.js
move /Y backend-routes-ventas.js backend\routes\ventas.js
move /Y backend-routes-usuarios.js backend\routes\usuarios.js

move /Y backend-sockets-index.js backend\sockets\index.js

move /Y frontend-index.html frontend\index.html
move /Y frontend-app.js frontend\app.js

echo.
echo Listo. Estructura creada:
echo   backend\   (API + Socket.io)
echo   frontend\  (index.html + app.js, sin build)
echo.
echo Proximos pasos:
echo   cd backend
echo   npm install
echo   copy .env.example .env
echo   npm run seed
echo   npm start
echo.
echo En otra terminal, para servir el frontend:
echo   cd frontend
echo   npx serve -l 5173
echo.
pause
