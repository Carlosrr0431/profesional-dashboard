# Pipeline WhatsApp y transiciones de viaje

## 1) Objetivo

Coordinar mensajes entrantes, estado de conversacion, creacion de viajes y transiciones operativas sin duplicar procesamiento ni perder eventos.

## 2) Entradas del endpoint principal

Archivo: `profesional-dashboard/app/api/Agente_IA/route.js`.

Tipos de entrada:

- `POST` webhook WhatsApp (`messages.upsert`, `poll.results`, etc).
- `POST` evento DB `trip.transition`.
- `GET` cron de Vercel para procesamiento pendiente y fallback.

## 3) Flujo de mensajes WhatsApp

Funciones clave:

- `appendIncomingMessage`
- `claimConversationBatch`
- `processConversationById`
- `scheduleConversationProcessing`
- `processPendingConversations`

Secuencia base:

1. Webhook recibe mensaje y lo normaliza.
2. Se persiste con deduplicacion por `messageId`.
3. Se agenda acumulacion por `ACCUMULATION_MS` (si runtime no serverless).
4. Cron o procesamiento inmediato reclama el batch (`claimConversationBatch`).
5. Se ejecuta logica de intent + direccion + estado.
6. Se finaliza conversacion con nuevo contexto.

Extraccion de intent:

- `extractTripIntent` usa IA con prompt de dominio + estado de conversacion.
- Si falla proveedor por quota/rate-limit, activa fallback operativo y mantiene flujo.
- El parser se combina con heuristicas de regex para detectar cancelaciones y patrones
  de direccion comunes sin bloquear por errores de modelo.

## 4) Manejo de estados de conversacion

Estados frecuentes:

- `open`
- `awaiting_address_selection`
- `paused`

Notas:

- El contexto guarda datos de pickup/destino, flags y `pending_poll`.
- Si falla procesamiento, se preserva contexto util para no perder continuidad.
- Existe fast-path para viajes abiertos: evita crear viajes duplicados y responde estado
  o cancelacion sobre el viaje actual.

## 5) Poll de direccion

Evento: `poll.results`.

Flujo:

1. Resuelve telefono del votante.
2. Busca `pending_poll` en `whatsapp_conversations.context`.
3. Valida opcion votada.
4. Si hace falta, geocodifica opcion seleccionada.
5. Crea viaje (normalmente `queued`).
6. Limpia contexto temporal y dispara `dispatchQueuedPassengers`.

## 6) GPS por WhatsApp

Cuando llega `locationMessage`:

1. Busca viaje `queued` esperando GPS.
2. Toma `address/name` del payload o hace reverse geocode.
3. Actualiza destino del viaje.
4. Ejecuta dispatch inmediato.

## 7) Pipeline de transiciones de viaje

Funciones clave:

- `processTripLifecycleTransitions`
- `processTripLifecycleTransitionsForTripId`
- `dispatchQueuedPassengers`
- `schedulePendingTimeoutTimer`
- `cancelTimedOutPendingTripAndRedispatch`
- `expireTimedOutPendingTrips` (fallback)

Comportamiento:

1. Si viaje pasa a activo, notifica pasajero y marca `wa_notified_at`.
2. Si viaje se cancela, intenta reasignar automaticamente.
3. Si no hay chofer, pasa a `queued`.
4. Si viaje queda `pending`, agenda timer de aceptacion.
5. Si timer vence, cancela por timeout y reintenta match inmediato.

## 8) Integracion DB -> webhook (trip.transition)

SQL relevante:

- `profesional-dashboard/supabase/whatsapp_trip_transition_event.sql`
- `profesional-dashboard/supabase/add_trip_transition_insert_event.sql`

Con la migracion incremental nueva:

- El trigger dispara en `INSERT` y `UPDATE`.
- Se reduce dependencia del cron para iniciar el flujo.

## 9) Roles de cron vs evento

- Evento (`trip.transition`): camino primario para reaccion rapida.
- Cron (`processPendingConversationsRequest`):
  - procesa conversaciones acumuladas,
  - ejecuta fallback de expiracion pending,
  - barrido de transiciones como red de seguridad.

## 10) Riesgos y guardas

Riesgos:

1. Doble procesamiento por webhook + cron.
2. Perdida de pending_poll por limpieza prematura de contexto.
3. Timer en memoria no ejecutado por cold start/redeploy.

Guardas existentes:

- claims atomicos con `wa_notified_at`.
- deduplicacion por `messageId`.
- cron fallback para pending expirados.
- validacion de headers secretos en eventos sensibles.
