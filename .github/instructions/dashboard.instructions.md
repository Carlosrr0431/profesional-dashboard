---
applyTo: "profesional-dashboard/**"
---

# Dashboard — Convenciones y Arquitectura

## Stack tecnológico

| Librería | Versión | Rol |
|---|---|---|
| Next.js | 15 (App Router) | Framework web, desplegado en Vercel |
| React | 19 | UI |
| Tailwind CSS | v3 | Estilos con paleta de colores personalizada |
| Supabase JS | v2 | BD, auth y Realtime |
| OpenAI | v4 | GPT-4o (extracción de intención) + Whisper (transcripción de voz) |
| WaSender | — | API para enviar mensajes de WhatsApp |
| @react-google-maps/api | v2 | Mapa interactivo en el browser |
| Google Maps REST | — | Geocodificación server-side en API routes |

---

## Estructura del proyecto

```
profesional-dashboard/
  vercel.json               ← Config de Vercel (cron, build command)
  tailwind.config.js        ← Paleta de colores personalizada
  app/
    layout.jsx              ← Layout raíz: fuente Inter, fondo oscuro
    page.jsx                ← Carga src/App.jsx sin SSR (SPA completo)
    globals.css
    api/
      Agente_IA/
        route.js            ← Agente IA de WhatsApp + cron de Vercel ← ARCHIVO CENTRAL
      driver-management/    ← CRUD de conductores (alta, baja, edición)
      driver-trips-snapshot/← Resumen de viajes por conductor
      drivers-snapshot/     ← Vista general de la flota
      pending-passengers/   ← Cola de pasajeros esperando conductor
      public-tracking/      ← Posición del conductor para la página pública
      queue-snapshot/       ← Estadísticas de la cola
      settings/             ← Lectura y escritura de configuración de la app
    seguimiento/
      [token]/
        page.jsx            ← Página pública de seguimiento en vivo (sin auth)
        TrackingView.jsx    ← Componente cliente con Google Maps
  src/
    App.jsx                 ← Entrada del SPA del dashboard
    components/             ← MapView, DriverPanel, QueuePanel, Sidebar, StatsBar, VoiceChat
    hooks/                  ← Hooks de Supabase Realtime para el dashboard
    lib/
      supabase.js           ← Cliente Supabase singleton (anon key, uso en browser)
  supabase/                 ← Migraciones SQL (aplicar manualmente)
```

---

## Clientes de Supabase — cuándo usar cada uno

Existen dos clientes de Supabase con permisos diferentes. Usar el correcto es crítico para la seguridad.

### Cliente público (browser)

```js
import { supabase } from '@/src/lib/supabase';
// Usa NEXT_PUBLIC_SUPABASE_ANON_KEY
// Para: suscripciones Realtime, lectura de datos en componentes del dashboard
```

### Cliente de servicio (solo servidor)

```js
import { createClient } from '@supabase/supabase-js';
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY // ← NUNCA exponer al browser
);
// Para: API routes que necesitan escribir con permisos elevados
// (crear viajes, modificar conductores, etc.)
```

> ⚠️ **Nunca importar `SUPABASE_SERVICE_ROLE_KEY` en código que se ejecuta en el browser.** Si el nombre de la variable no empieza con `NEXT_PUBLIC_`, Next.js la omite del bundle del cliente automáticamente.

---

## Agente IA de WhatsApp — `app/api/Agente_IA/route.js`

Este archivo es el **centro del sistema de reservas automatizadas**. Tiene `maxDuration = 60` y `force-dynamic`. Maneja tres tipos de request distintos en un solo archivo:

### Entradas del route

| Método | ¿Quién lo llama? | Autenticación |
|---|---|---|
| `GET` | Vercel Cron (cada minuto) | Header `Authorization: Bearer <CRON_SECRET>` |
| `POST` sin header especial | Webhook de WaSender (mensaje WhatsApp entrante) | Lista blanca de teléfonos (opcional) |
| `POST` con header `x-event: trip.transition` | Trigger de BD de Supabase | Header con `WHATSAPP_TRIP_TRANSITION_SECRET` |

### Pipeline de procesamiento de un mensaje de WhatsApp

```
1. Llega mensaje de WhatsApp (POST)
   ↓
2. Se acumula en whatsapp_conversations.pending_messages
   (buffer de 40 s para agrupar mensajes rápidos)
   ↓
3. El cron (GET cada minuto) detecta conversaciones listas
   ↓
4. Si hay audio → transcribir con Whisper (OpenAI)
   ↓
5. Enviar al contexto de GPT-4o para extraer:
   pickup, destino, nombre del pasajero, tipo de viaje
   ↓
6. Geocodificar las direcciones (hasta 6 radios de búsqueda,
   sistema de puntaje para elegir el resultado más relevante)
   ↓
7. Buscar el conductor disponible más cercano en Supabase
   (distancia haversine sobre coordenadas)
   ↓
8. Crear el registro de viaje en la tabla trips
   ↓
9. Responder al pasajero por WhatsApp (WaSender)
   con link de seguimiento: <TRACKING_BASE_URL>/seguimiento/<trip_id>
```

### Pipeline de notificación de cambio de estado

Cuando un viaje cambia de estado en la BD, el trigger de Supabase llama al route con `x-event: trip.transition`. El agente entonces notifica al pasajero por WhatsApp con el nuevo estado en español.

> ⚠️ **No reorganizar este archivo en múltiples archivos** sin entender primero el buffer de acumulación. El estado compartido entre el webhook POST y el cron GET vive en la tabla `whatsapp_conversations` y depende de que ambos handlers estén coordinados.

---

## Página de seguimiento público — `app/seguimiento/[token]/`

- El `[token]` en la URL es el `trip_id` del viaje.
- Es una página **completamente pública, sin autenticación**. No agregar guards de auth.
- Hace un snapshot inicial desde `/api/public-tracking/[token]` y luego se mantiene en vivo con canales Realtime de Supabase (`trips`, `trip_tracking`, `drivers`, `driver_locations`).
- Muestra un mapa Google Maps con: marcador del conductor, polilínea de ruta, marcadores de origen y destino.
- Los estados se muestran en español: `accepted` → "Viaje aceptado", `going_to_pickup` → "En camino a buscarte", etc.
- CSS propio inyectado como `<style>` tag para layout responsive: mapa arriba en móvil, mapa a la izquierda en escritorio (≥640 px).

---

## Paleta de colores Tailwind personalizada

Definida en `tailwind.config.js`. Usar siempre estos tokens en lugar de colores hardcodeados.

| Token | Color hex | Cuándo usar |
|---|---|---|
| `navy-500` a `navy-900` | Azules oscuros (#1E3A5F más oscuro) | Superficies primarias, sidebars, headers |
| `accent` | `#DC2626` | Botones de acción principal (CTAs) |
| `accent-light` | `#EF4444` | Hover y variantes claras del CTA |
| `online` | `#22C55E` | Indicador de conductor disponible |
| `offline` | `#94A3B8` | Indicador de conductor no disponible |
| `danger` | `#EF4444` | Estados de error |
| `warning` | `#F59E0B` | Advertencias |
| `*-dim` | RGBA con alpha | Fondos translúcidos de badges y chips |

---

## Comandos de testing

Siempre usar estos comandos desde la carpeta `profesional-dashboard/`:

```bash
npm test                 # Corre todos los tests una vez y muestra el resultado
npm run test:watch       # Modo watch: re-corre automáticamente al guardar un archivo
npm run test:coverage    # Genera reporte de cobertura HTML en profesional-dashboard/coverage/
```

- Los tests viven en `profesional-dashboard/__tests__/`.
- Los helpers reutilizables (factories de Request, mocks de Supabase y OpenAI) están en `__tests__/helpers/` y **no se ejecutan como tests**.
- El contrato de datos compartido con driver-app está en `shared/trip-contract.js` (raíz del monorepo).
- Antes de crear un test nuevo, revisar `__tests__/helpers/request-factory.js` para usar los payloads de WaSender ya definidos.
- **Ejecutar `npm test` siempre después de modificar `route.js`** para verificar que el contrato de datos no se rompió.

---

## Variables de entorno

### Obligatorias — solo servidor (no exponer al browser)

| Variable | Para qué sirve |
|---|---|
| `SUPABASE_SERVICE_ROLE_KEY` | Escrituras privilegiadas en el agente IA y gestión de conductores |
| `OPENAI_API_KEY` | GPT-4o (extracción de intención) + Whisper (transcripción de audio) |
| `GOOGLE_MAPS_API_KEY` | Geocodificación server-side en el agente IA |
| `WASENDER_API_KEY` | Envío de mensajes WhatsApp |
| `CRON_SECRET` | Autentica el request del cron de Vercel |
| `WHATSAPP_TRIP_TRANSITION_SECRET` | Autentica el callback del trigger de BD |

### Obligatorias — públicas (accesibles en browser)

| Variable | Para qué sirve |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | URL del proyecto Supabase |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Anon key para el cliente público |
| `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` | Google Maps en componentes del browser |

### Opcionales — tienen valor por defecto

| Variable | Valor por defecto | Descripción |
|---|---|---|
| `TRACKING_BASE_URL` | `https://profesional-dashboard.vercel.app` | Base de los links de seguimiento enviados por WhatsApp |
| `WHATSAPP_ACCUMULATION_MS` | `40000` (40 s) | Tiempo de espera para agrupar mensajes de la misma conversación |
| `WASENDER_BASE_URL` | `https://www.wasenderapi.com/api` | Endpoint de WaSender |
| `WHATSAPP_ALLOWED_PHONES` | vacío (todos permitidos) | Lista separada por comas de teléfonos habilitados |
| `WHATSAPP_IMMEDIATE_PROCESSING` | `false` | Si es `true`, omite el buffer y procesa de inmediato |
| `WHATSAPP_PENDING_GUARD_MAX_AGE_MINUTES` | `5` | Edad máxima de un viaje pendiente antes de permitir reemplazo |
| `WHATSAPP_DRIVER_PENDING_BUSY_MAX_AGE_MINUTES` | `5` | Ventana en que un conductor se considera ocupado |
| `WHATSAPP_UPSERT_ONLY` | `true` | Previene creación de viajes duplicados |

---

## Migraciones SQL

Los archivos en `supabase/` se aplican **manualmente** en el editor SQL de Supabase. Al configurar el proyecto por primera vez, aplicarlos en este orden:

| Orden | Archivo | Qué hace |
|---|---|---|
| 1 | `whatsapp_trip_automation.sql` | Crea las tablas `whatsapp_conversations` y `whatsapp_messages`. Define el stored procedure `append_whatsapp_message()` para manejar el buffer. |
| 2 | `whatsapp_trip_transition_event.sql` | Instala la extensión `pg_net` y el trigger `notify_whatsapp_trip_transition` que llama al agente cuando cambia el estado de un viaje. |
| 3 | `add_awaiting_address_selection_status.sql` | Agrega el estado `awaiting_address_selection` a `whatsapp_conversations` (para cuando el agente pide confirmación de dirección). |
| 4 | `add_queued_no_driver_status.sql` | Agrega el estado `queued_no_driver` (pasajero en cola sin conductor disponible). |
| 5 | `add_commission_blocked.sql` | Agrega la columna `commission_blocked BOOLEAN` a `drivers` con índice parcial. |

---

## Despliegue en Vercel

- `vercel.json` configura el cron: llama a `/api/Agente_IA` **cada minuto** vía GET.
- El cron autentica con `Authorization: Bearer <CRON_SECRET>`.
- Después de agregar o cambiar variables de entorno en Vercel, **hacer un redeploy manual** — las env vars no se actualizan en caliente.
- El limit de duración de la función es `maxDuration = 60` segundos (requiere plan Vercel Pro). Transcripciones largas de Whisper pueden acercarse a este límite.

---

## Trampas conocidas y errores frecuentes

### Realtime primero, polling solo como fallback puntual
En hooks y vistas en vivo del dashboard, priorizar canales de Supabase Realtime para sincronización.

- Evitar `setInterval` para refetch de red cuando exista evento equivalente en `postgres_changes`.
- Si se usa un timer, que sea para UI local (ej: reloj o "minutos en espera") y no para consultar la API periódicamente.
- Para refrescos manuales, mantener botón de `Actualizar` explícito en UI en lugar de polling silencioso.

### El SPA está renderizado 100% en el cliente
`app/page.jsx` usa `next/dynamic` con `ssr: false` para cargar `src/App.jsx`. Esto significa que **todo el código dentro de `src/` se ejecuta en el browser**. No agregar imports de módulos de Node.js (fs, path, crypto, etc.) dentro de `src/`.

### `pg_net` debe estar habilitado
El trigger de transición de estado usa `pg_net` para hacer HTTP desde Postgres. Si la extensión no está habilitada en el proyecto de Supabase, el trigger no dispara y los pasajeros no reciben notificaciones de estado.

Habilitar en Supabase: **Database → Extensions → pg_net → Enable**.

### Orden de los mensajes de WhatsApp
WhatsApp no garantiza que los mensajes lleguen en orden. El buffer de acumulación de 40 s existe precisamente para recibir todos los mensajes de un mismo intent antes de procesarlos. No eliminar este buffer.

### Variables de entorno sin prefijo `NEXT_PUBLIC_`
Next.js excluye automáticamente del bundle del cliente cualquier variable que no empiece con `NEXT_PUBLIC_`. Si una API key de servidor aparece en el bundle del cliente, revisar si se importó en código dentro de `src/` (que se ejecuta en el browser).
