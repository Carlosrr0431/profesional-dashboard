# ProfesionalApp — Instrucciones para el Agente de IA

## Descripción general del proyecto

Este repositorio contiene **dos sub-proyectos** que comparten un único backend en **Supabase**:

| Sub-proyecto | Carpeta | Stack principal | Función |
|---|---|---|---|
| `driver-app` | `driver-app/` | Expo 54 / React Native 0.81 | App móvil para conductores |
| `profesional-dashboard` | `profesional-dashboard/` | Next.js 15 App Router | Panel de operadores + agente IA de reservas por WhatsApp |

### Contexto geográfico

- La app opera en **Salta Capital, Argentina**.
- Las coordenadas por defecto son `{ latitude: -24.78, longitude: -65.42 }`.
- **Todo el texto visible al usuario y los mensajes de WhatsApp deben estar en español.**

---

## Backend compartido — Supabase

Ambos sub-proyectos usan el **mismo proyecto de Supabase**. No existe una base de datos separada por entorno.

### Tablas principales

| Tabla | Descripción |
|---|---|
| `trips` | Viajes creados (por WhatsApp o desde el dashboard) |
| `drivers` | Conductores registrados, estado online/offline y ubicación actual |
| `settings` | Configuración de la app (tarifas, precios base, etc.) |
| `whatsapp_conversations` | Conversaciones activas con pasajeros por WhatsApp |
| `whatsapp_messages` | Mensajes individuales de cada conversación |

### Ciclo de vida de un viaje (estados en BD)

```
pending → accepted → going_to_pickup → in_progress → completed
                                                    ↘ cancelled
```

### Migraciones SQL

- Los archivos `.sql` están en la carpeta `supabase/` de cada sub-proyecto.
- Se aplican **manualmente** en el editor SQL de Supabase.
- Ver [`driver-app/supabase/fix_drivers_rls_recursion.sql`](driver-app/supabase/fix_drivers_rls_recursion.sql) para un caso documentado de recursión infinita en políticas RLS — leer antes de crear nuevas políticas para conductores.
- **RLS (Row Level Security) está activo** en todas las tablas. Toda nueva tabla debe tener sus políticas definidas explícitamente.

---

## Cómo correr los proyectos

### Driver App (móvil)

```bash
cd driver-app
npx expo start           # Inicia el servidor Metro (desarrollo)
npx expo run:android     # Compila y lanza en Android
```

> ⚠️ La plataforma **web está deshabilitada intencionalmente**. `expo start --web` termina con error.

#### Tests (driver-app)

```bash
cd driver-app
npm test                 # Corre todos los tests una vez
npm run test:watch       # Modo watch (re-corre al guardar)
npm run test:coverage    # Genera reporte de cobertura en driver-app/coverage/
```

### Dashboard (web)

```bash
cd profesional-dashboard
npm run dev              # Servidor de desarrollo Next.js en puerto 3000
npm run build            # Build de producción
```

#### Tests (profesional-dashboard)

```bash
cd profesional-dashboard
npm test                 # Corre todos los tests una vez
npm run test:watch       # Modo watch (re-corre al guardar)
npm run test:coverage    # Genera reporte de cobertura en profesional-dashboard/coverage/
```

---

## Convenciones compartidas entre ambos proyectos

### Idioma
Todo texto visible al usuario, mensajes de WhatsApp, labels de botones y notificaciones deben estar en **español**. No mezclar inglés en strings de UI.

### Cliente de Supabase
- Usar **`@supabase/supabase-js` v2** (`createClient`). La v1 está deprecada.
- El cliente es un **singleton**: nunca instanciar uno nuevo dentro de un componente o función. Siempre importar el cliente compartido desde el archivo de servicio correspondiente.
- Ver instrucciones específicas de cada sub-proyecto para saber qué cliente usar.

### Coordenadas geográficas
- Siempre usar el formato `{ latitude, longitude }` (objeto con claves nombradas).
- **Nunca usar** `[longitude, latitude]` (formato GeoJSON) ni `[lat, lng]`.

### Claves de Google Maps
Las claves están separadas por entorno para evitar exponer credenciales de servidor al navegador:

| Variable | Usado en |
|---|---|
| `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` | Componentes de mapa en el navegador |
| `GOOGLE_MAPS_API_KEY` | Geocodificación y Directions en el servidor (API routes) |

---

## Archivos de referencia clave

| Archivo | Cuándo leerlo |
|---|---|
| [`shared/trip-contract.js`](shared/trip-contract.js) | Antes de modificar el esquema de `trips` — define los campos que se pasan entre `route.js` y `driver-app` vía Realtime |
| [`ADDRESS_CASES.md`](ADDRESS_CASES.md) | Antes de modificar la lógica de geocodificación en `route.js` — documenta los 36 casos de ambigüedad de dirección y su estado de implementación |
| [`driver-app/supabase/fix_drivers_rls_recursion.sql`](driver-app/supabase/fix_drivers_rls_recursion.sql) | Antes de crear nuevas políticas RLS para la tabla `drivers` |

---

## Instrucciones detalladas por sub-proyecto

Cada sub-proyecto tiene su propio archivo de instrucciones con convenciones específicas:

- **Driver App** → [`.github/instructions/driver-app.instructions.md`](.github/instructions/driver-app.instructions.md)
- **Dashboard** → [`.github/instructions/dashboard.instructions.md`](.github/instructions/dashboard.instructions.md)
