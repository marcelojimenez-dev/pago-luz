# Luz Clara - Rincón de Zapata

Aplicación web privada para registrar lecturas eléctricas, adjuntar fotografías de los medidores, comparar consumos y generar liquidaciones conciliadas por vivienda.

## Funciones incluidas

- autenticación privada administrada por Sites;
- roles de administrador, lector, tesorero, auditor y residente;
- perfil de carga de información limitado a lecturas y fotografías;
- panel administrativo para crear y desactivar parcelas sin perder historial;
- asignación persistente de perfiles de acceso por usuario;
- relación entre comunidad, viviendas, usuarios y múltiples medidores;
- períodos de facturación con fechas de consumo y vencimiento;
- carga de fotografías JPEG, PNG o WebP de hasta 5 MB;
- validación de firma binaria, SHA-256 y fotografías duplicadas;
- almacenamiento privado de imágenes en R2;
- autorización por vivienda antes de entregar una fotografía;
- cálculo en el servidor usando distribución por mayor resto;
- conciliación exacta de energía, punta, cargo compartido, fondo y saldos;
- historial de auditoría para cargas y recálculos;
- interfaz adaptable a teléfono, tablet y escritorio.

## Persistencia

- Cloudflare D1: registros relacionales y liquidaciones.
- Cloudflare R2: evidencia fotográfica privada.

El esquema está definido en `db/schema.ts` y las migraciones generadas están en `drizzle/`.

## Desarrollo local

```text
npm run install:ci
npm run db:generate
npm run build
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0000_early_redwing.sql
npm run dev
```

La vista local simula una cuenta autenticada. El primer usuario crea de forma idempotente el período inicial de octubre de 2026 y queda como administrador.

## Controles relevantes

- Las decisiones de autorización se aplican nuevamente en el servidor.
- Los identificadores recibidos del navegador nunca determinan por sí solos el acceso.
- Las fotos no se publican mediante URLs directas.
- La clave del archivo se genera internamente y no contiene nombres personales.
- Las liquidaciones se recalculan únicamente para administradores o tesoreros.
- Los períodos cerrados rechazan nuevas lecturas.
- Los archivos se sirven con `nosniff`, caché privada y una política de contenido restrictiva.
