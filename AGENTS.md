# Bryan Transactions

## Identidad y recursos

- Aplicación: Bryan Transactions.
- Repositorio: `Ernesto248/bryan-transactions`.
- Proyecto Neon: `bryan-transactions`, rama `main`.
- Proyecto Vercel: `bryan-transactions`.
- Desarrollo local: `http://localhost:3003`.
- Cookie de acceso: `bryan_access_session`.

## Arquitectura

- Next.js 16 con App Router, React 19 y TypeScript.
- Tailwind CSS y componentes locales en `components/ui`.
- PostgreSQL serverless en Neon mediante `@neondatabase/serverless`.
- Migraciones SQL secuenciales en `migrations/`; se aplican en orden y nunca se reescribe una migración ya desplegada.
- Acceso web protegido con contraseña compartida y cookie HttpOnly de siete días.
- Ingesta de transacciones mediante `POST /api/transactions` y Bearer token exclusivo.
- Zona horaria de negocio: `America/New_York`.

## Variables de entorno

Obligatorias:

- `DATABASE_URL`
- `N8N_INGEST_API_KEY`
- `APP_ACCESS_PASSWORD`
- `APP_SESSION_SECRET`

Opcionales hasta configurar workflows propios:

- `N8N_STAR_WEBHOOK_URL`
- `N8N_UNSTAR_WEBHOOK_URL`

Nunca se versionan secretos ni `.env.local`.

## Comandos

- `pnpm install --frozen-lockfile`
- `pnpm dev -- --port 3003`
- `pnpm exec vitest run`
- `pnpm exec tsc --noEmit`
- `pnpm build`
- `pnpm start -- --port 3003`

## Reglas de aislamiento

- Este proyecto, su base de datos, secretos, despliegue, workflows y repositorio son independientes.
- No conectar recursos pertenecientes a otras aplicaciones o clientes.
- Antes de aplicar migraciones o ejecutar escrituras, comprobar explícitamente la identidad del proyecto Neon.
- Mantener las tablas de negocio vacías hasta que se registren operaciones reales de Bryan.
- No crear datos de prueba en producción.
