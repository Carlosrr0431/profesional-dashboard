# Dispatch Worker: anillos, estados y logica operativa

## 1) Objetivo de este documento

Este documento explica la logica del endpoint `app/api/dispatch-worker/route.js` para:

- Entender por que un viaje se asigna o no se asigna.
- Interpretar logs de produccion rapidamente.
- Identificar que variables ajustar para mejorar tiempos de asignacion.
- Dejar una base para futuras mejoras sin romper la semantica actual.


## 2) Donde vive y como corre

- Endpoint: `GET /api/dispatch-worker`
- Runtime: Vercel serverless (nodejs)
- Trigger principal: **evento** al pasar un viaje a `status='queued'` (pg_net + helper JS)
- Trigger de respaldo: cron de Vercel cada 1 minuto
- Integracion principal: Supabase (RPC + tablas `trips`, `drivers`, `dispatch_queue`)

Despertar inmediato (sin esperar cron):

1. Trigger SQL `trg_notify_dispatch_worker_on_queued` (`add_dispatch_worker_wake_trigger.sql`)
2. Helper `src/lib/triggerDispatchWorker.js` en reject de chofer y viaje completado

Flujo de autorizacion:

- Si `CRON_SECRET` esta vacio, cualquier invocacion pasa.
- Si `CRON_SECRET` existe, solo pasa:
  - `x-vercel-cron: 1` o user-agent de Vercel cron
  - o `Authorization: Bearer <CRON_SECRET>`

Nota operativa:

- Si en logs aparece `hasCronSecret:false`, falta configurar `CRON_SECRET` en Vercel.


## 3) Resumen del ciclo completo

Cada ejecucion del worker hace esto en orden:

1. `expireTimedOutPendingTrips()`
2. `claimDispatchBatch()` via RPC
3. Por cada claim:
   - Carga el viaje en `trips`
   - Valida estado y coordenadas
   - Aplica guardas de area operativa
   - Busca chofer con anillos de distancia
   - Si encuentra: mueve viaje a `pending` y notifica chofer
   - Si no encuentra: libera claim con `retry`
4. Devuelve resumen del ciclo (`claimed`, `assigned`, `noDriver`, etc.)


## 4) Variables clave (con defaults actuales)

- `DISPATCH_WORKER_BATCH_SIZE` -> 20
- `DISPATCH_WORKER_LOCK_SECONDS` -> 25
- `DISPATCH_WORKER_RETRY_SECONDS` -> 12
- `DISPATCH_WORKER_NOTIFY_FAIL_RETRY_SECONDS` -> 45
- `WHATSAPP_PENDING_ACCEPT_TIMEOUT_MS` -> clamp a 10s..15s (default 15s)
- `DISPATCH_MAX_PICKUP_DISTANCE_FROM_CENTER_KM` -> 80
- `DISPATCH_WORKER_VERBOSE_LOGS` -> true

Constantes de distancia:

- `SEARCH_RADII_KM = [1, 2, 3, 4.5, 6, 8, 10, 12, 15, 20]`
- Centro operativo: `SALTA_CAPITAL_CENTER = (-24.78, -65.42)`


## 5) Logica de anillos (core de asignacion)

Funciones:

- `computeQueueAgeMs(enqueuedAt)`
- `getEffectiveAttemptNo(attemptNo, queueAgeMs)`
- `getAllowedRadiiKm(effectiveAttemptNo)`

Regla vigente:

1. Se toma `attemptNo` de la cola (RPC `claim_dispatch_queue_batch`).
2. Se calcula `queueAgeMs` con `enqueued_at`.
3. Se calcula `effectiveAttemptNo = max(attemptNo, floor(queueAgeMs / SEARCH_EXPANSION_INTERVAL_MS) + 1)`.
4. Con `effectiveAttemptNo` se arma el subconjunto de radios:
   - `maxIndex = min(SEARCH_RADII_KM.length - 1, effectiveAttemptNo)`
   - `SEARCH_RADII_KM.slice(0, maxIndex + 1)`

Esto mantiene el crecimiento progresivo por intentos, pero evita que el cron (1/min)
ralentice artificialmente la apertura de anillos cuando un pasajero ya lleva tiempo esperando.

Configuracion:

- `SEARCH_EXPANSION_INTERVAL_MS` default: `15000` (15s)
- override opcional: `DISPATCH_WORKER_SEARCH_EXPANSION_INTERVAL_MS`
- fallback de compatibilidad: `WHATSAPP_DRIVER_SEARCH_EXPANSION_INTERVAL_MS`

Ejemplo con chofer a 3.53 km:

- intento de cola 2 + antiguedad ~60s -> `effectiveAttemptNo` >= 5
- radios permitidos incluyen 4.5 / 6 / 8 km
- resultado: puede asignar sin esperar al "intento 3" del modelo viejo


## 6) Filtros de choferes antes de aplicar anillos

En `chooseDriverForClaim()` los filtros se aplican en este orden:

1. Solo `drivers.is_available = true`
2. Solo con coordenadas validas (`current_lat`, `current_lng`)
3. Excluir mismo telefono pasajero/chofer
4. Excluir choferes con viaje activo en estados:
   - `pending`, `accepted`, `going_to_pickup`, `in_progress`
5. Excluir choferes sin canal de notificacion:
   - push valido o telefono para WhatsApp

Si queda pool, se calcula score:

- `distanceKm = haversine(chofer, pickup)`
- `scoreKm = distanceKm + pushPenaltyKm`
- `pushPenaltyKm = 0.35` si no tiene push token, sino `0`

Orden final de candidatos:

1. Menor `scoreKm`
2. Menor `distanceKm` (desempate)


## 7) Seleccion por anillo

Con el pool ordenado:

1. Recorre cada radio permitido del intento
2. Busca candidatos con `distanceKm <= radiusKm`
3. Si hay al menos uno, toma el primero (mejor score)
4. Si no hay ninguno en todos los radios, devuelve `null`

Logs que lo muestran:

- `driver_ring_scan` -> distribucion por radio
- `driver_selected` -> chofer elegido
- `driver_select_no_match_in_allowed_rings` -> ninguno entro


## 8) Guardas previas de viaje

Antes de buscar chofer:

1. Estado del viaje debe ser `queued`
2. Debe tener `destination_lat/lng` validos
3. Distancia del pickup al centro operativo no debe superar maximo

Si falla area operativa:

- marca retry en cola
- libera claim con error `pickup_out_of_operational_area`
- log: `claim_pickup_out_of_operational_area`


## 9) Claim, lock y release (modelo DB-first)

### Claim

`claimDispatchBatch()` llama RPC `claim_dispatch_queue_batch` y obtiene items con:

- `trip_id`
- `lock_token`
- `attempt_no`

### Release

`releaseDispatchClaim()` llama RPC `release_dispatch_claim` con:

- resultado (`done` o `retry`)
- `retry_seconds`
- metadatos de error o chofer seleccionado

### Retry auxiliar

`setDispatchQueueRetry()` actualiza `dispatch_queue.next_attempt_at` y error de contexto.


## 10) Timeouts de pending

Funcion: `expireTimedOutPendingTrips()`

Regla actual:

- Si viaje esta `pending`, sin `accepted_at`, y `assigned_at` vencio por timeout -> vuelve a `queued`
- Tiene fail-safe para `pending` sin `assigned_at` usando `status_updated_at`

Timeout efectivo:

- configurado por env, pero clamped a maximo 15 segundos


## 11) Notificacion al chofer

Orden de canales:

1. Push (si habilitado y token valido)
2. Fallback WhatsApp

Si falla notificacion:

- Requeue del viaje pendiente a `queued`
- Retry con `DISPATCH_WORKER_NOTIFY_FAIL_RETRY_SECONDS`
- Resultado de claim: `notify_failed`


## 12) Estados/resultado mas importantes en logs

Inicio/ciclo:

- `http_get_start`
- `cycle_start`
- `cycle_done`
- `http_get_result`

Cola/claims:

- `claim_batch_done`
- `claim_process_start`
- `claim_result`

Seleccion de chofer:

- `driver_select_pool`
- `driver_ring_scan`
- `driver_selected`
- `driver_select_no_match_in_allowed_rings`
- `claim_no_driver_available`

Asignacion y notificacion:

- `claim_trip_assigned_pending`
- `notify_push_ok` / `notify_push_failed`
- `notify_whatsapp_ok` / `notify_whatsapp_failed`
- `claim_assigned_done`

Guardas y errores:

- `claim_missing_pickup_coordinates`
- `claim_pickup_out_of_operational_area`
- `claim_process_error`
- `worker_fatal_error`


## 13) Guia rapida de diagnostico

Caso A: "No asigna aunque hay chofer"

Revisar en orden:

1. `driver_select_pool` -> `reachable` > 0
2. `driver_ring_scan` -> `nearestDistanceKm`
3. `allowedRadiiKm` del intento
4. `driver_select_no_match_in_allowed_rings`

Si `nearestDistanceKm` queda apenas arriba del ultimo anillo, esperar siguiente intento o ajustar anillos/retry.

Caso B: "No llega notificacion"

Revisar:

1. `notify_push_failed`
2. `notify_push_credentials_invalid`
3. `notify_whatsapp_failed`
4. `claim_notify_failed`

Caso C: "Viajes fuera de ciudad"

Revisar:

1. `claim_pickup_out_of_operational_area`
2. Coordenadas del trip en `destination_lat/lng`


## 14) Oportunidades de mejora (backlog recomendado)

1. Tolerancia de borde de anillo
   - Evitar rechazos por diferencias muy chicas (ej. 3.01 vs 3.00).

2. Perfil de anillos por demanda horaria
   - Rango agresivo en horas pico, conservador fuera de pico.

3. Retry adaptativo
   - Hoy es fijo. Podria acortarse cuando el nearest esta cerca del borde.

4. Distancia de ruta real vs haversine
   - Haversine es rapido pero no contempla calles, mano unica o puentes.

5. Score multi-factor
   - Incorporar confiabilidad historica o ETA estimada en score final.

6. Observabilidad en dashboard
   - Panel de distribucion de `nearestDistanceKm` y tasa de `no_driver_available` por intento.


## 15) Relacion con la arquitectura SQL v2

Archivo de referencia: `supabase/dispatch_architecture_v2.sql`

Piezas clave:

- `dispatch_queue` como cola persistente
- locks con `lock_token`, `lock_owner`, `lock_expires_at`
- RPC de claim/release para evitar race conditions
- `trips.dispatch_status` y eventos para trazabilidad

Recomendacion:

- Mantener la semantica de los RPC como fuente de verdad de concurrencia.
- Evitar mover lock logic al runtime serverless fuera de DB.
