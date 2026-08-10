# Bingo Virtual Automatizado (75 bolillas)

Sistema completo de bingo en línea: backend API + WebSockets (Node/Express/Socket.io/SQLite) y frontend en React (sin paso de build) con tema oscuro azul/morado.

## ⚠️ Antes de empezar: reorganiza los archivos

Por una limitación temporal del entorno donde se generó este proyecto, todos los archivos se entregaron "planos" (sin carpetas) en esta misma carpeta. Ejecuta el script de configuración **una sola vez** para armar la estructura real de carpetas:

- Windows: doble clic en `setup.bat` (o `setup.bat` desde la terminal)
- Mac/Linux: `bash setup.sh`

Esto crea `backend/` y `frontend/` y mueve cada archivo a su lugar. Después de correrlo, puedes borrar `setup.bat` / `setup.sh`.

## Estructura resultante

```
backend/
  server.js            Punto de entrada (Express + Socket.io)
  db.js                 Esquema SQLite + creación de admin por defecto
  authMiddleware.js      JWT
  cardGenerator.js        Generador de cartones 5x5 (B-I-N-G-O) sin duplicados
  patterns.js            Catálogo de figuras/patrones + motor de verificación
  seed.js                 Datos de demo (usuario + sorteo de ejemplo)
  routes/
    auth.js, sorteos.js, cartones.js, ventas.js, usuarios.js
  sockets/
    index.js              Sorteador automático en vivo (WebSockets)
  uploads/comprobantes/    Imágenes de comprobantes de recarga
frontend/
  index.html              Shell HTML (Tailwind CDN, React CDN, Socket.io CDN)
  app.js                  Toda la aplicación React (sin build, JSX vía Babel standalone)
```

## Requisitos

- Node.js 18 o superior

## Puesta en marcha

```bash
cd backend
npm install
copy .env.example .env      # (Mac/Linux: cp .env.example .env)
npm run seed                # crea usuario demo "jugador1" y un sorteo de ejemplo
npm start                   # http://localhost:4000
```

En otra terminal, sirve el frontend como archivos estáticos (necesario para que `app.js` cargue por HTTP en lugar de `file://`):

```bash
cd frontend
npx serve -l 5173           # o: python -m http.server 5173
```

Abre `http://localhost:5173` en el navegador.

### Credenciales de prueba

- **Admin:** usuario `admin` / clave `admin123`
- **Jugador demo:** usuario `jugador1` / clave `jugador123` (creado por `npm run seed`, saldo $50)

Si el backend corre en otra URL/host, defínelo antes de cargar `app.js` editando la línea en `frontend/index.html`:

```html
<script>window.BINGO_API_BASE = 'https://tu-servidor.com/api';</script>
```

## Qué incluye

**Autenticación y roles** — Login obligatorio, registro simplificado (usuario, contraseña, teléfono), roles Administrador/Usuario.

**Admin → Sorteos** — Crear sorteo (fecha/hora, rango de cartones, color, combo de venta 1/2/3/4, costo, % de ganancia, patrón con vista previa 5x5), cálculo interactivo de ganancia y premio máximo proyectado, tabla con estatus y ganancia/premio en tiempo real, y un **Panel Sorteador** con sorteador automático vía WebSockets (bola grande, historial de bolillas, cartones vendidos marcándose en vivo, botones para copiar vendidos/disponibles con formato WhatsApp).

**Admin → Cartones** — Generación de lotes masivos con vista previa de la matriz estándar, inventario filtrable, acciones masivas (pasar a disponible / eliminar).

**Admin → Ventas** — KPIs del mes, barra de premios activos, aprobación/rechazo de recargas (con comprobante), ganadores históricos con marcado de pago, historial detallado de transacciones.

**Admin → Usuarios** — Registro manual con saldo inicial, buscador, recarga directa, ver cartones activos, editar/eliminar.

**Usuario** — Selección de sorteo activo → compra por grupos/combos → sala de juego con panel de 75 números (modo automático o manual), cartones propios marcándose en vivo, **BINGO automático** cuando se completa el patrón del sorteo (verificado en el servidor), y formulario de recarga de saldo con subida de comprobante.

**Tiempo real** — Socket.io sincroniza el sorteador del admin con todas las pantallas de jugadores conectadas a ese sorteo.

**Reglas de cartones** — B: 1-15, I: 16-30, N: 31-45, G: 46-60, O: 61-75, centro LIBRE, sin cartones duplicados dentro de un mismo lote.

## Continuar el desarrollo desde otra computadora

1. Sube esta carpeta (ya reorganizada) a un repositorio de GitHub o a una carpeta sincronizada de Google Drive.
2. En la otra PC, clona el repo o abre la carpeta de Drive.
3. Abre Cowork ahí, conecta esa carpeta como carpeta de trabajo, y continúa la conversación — el chat se sincroniza con tu cuenta, pero el acceso a archivos debe reconectarse por máquina.

## Notas de arquitectura

- Backend: arquitectura de API REST limpia (rutas separadas por módulo) + capa de WebSockets independiente para el juego en vivo.
- Base de datos: SQLite vía `better-sqlite3` (archivo `backend/bingo.db`, se crea solo). Para producción real, migrar a PostgreSQL/MySQL es sencillo gracias a la capa de acceso centralizada en `db.js`.
- Frontend sin build: se eligió React vía CDN + Babel standalone para eliminar cualquier paso de compilación; si prefieres una app Vite/Next con build propio, `frontend/app.js` puede migrarse componente por componente sin cambios de lógica.
