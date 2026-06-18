# Matching y reasignacion

## 1) Objetivo del algoritmo

Asignar el chofer mas conveniente para un retiro en Salta Capital, minimizando tiempo de espera y reintentos fallidos.

Tambien debe:

- evitar loops de reasignacion con el mismo chofer que ya timeout,
- expandir cobertura de busqueda gradualmente,
- priorizar choferes confiables,
- conservar fallback por cron por resiliencia.

## 2) Entradas y salidas

Entradas principales:

- Coordenadas de retiro (`lat`, `lng`).
- Choferes disponibles (`drivers.is_available = true`).
- Estado de viajes activos (`trips.status in DRIVER_BUSY_TRIP_STATUSES`).
- Exclusion dinamica de choferes (`excludedDriverIds`).
- Tiempo acumulado de busqueda (`searchElapsedMs`).

Salida:

- Chofer seleccionado con metadata de radio/score, o `null` si no hay candidato valido.

## 3) Parametros de calibracion actuales

Definidos en `profesional-dashboard/app/api/Agente_IA/route.js`:

- `PENDING_ACCEPT_TIMEOUT_MS = 15000`
- `SEARCH_RADII_KM = [1, 2, 3, 4.5, 6, 8, 10, 12, 15, 20]`
- `DRIVER_SEARCH_EXPANSION_INTERVAL_MS = 15000`
- `DRIVER_RELIABILITY_LOOKBACK_HOURS = 6`
- `AUTO_TIMEOUT_SCORE_PENALTY_KM = 0.9`
- `CANCEL_SCORE_PENALTY_KM = 0.25`
- `NO_PUSH_TOKEN_SCORE_PENALTY_KM = 0.35`
- `MAX_RELIABILITY_SCORE_PENALTY_KM = 3.5`

Interpretacion:

- Cada 15s se habilita un anillo adicional.
- El score combina distancia + penalizaciones de confiabilidad y operatividad.

## 4) Fases del algoritmo

## Fase A - filtrado base de candidatos

Funcion clave: `chooseDriver`.

1. Trae choferes `is_available = true`.
2. Descarta choferes sin coordenadas.
3. Construye set de choferes ocupados por viajes activos.
4. Ignora pendings viejos para no bloquear eternamente (`DRIVER_PENDING_BUSY_MAX_AGE_MINUTES`).
5. Aplica exclusiones externas (`excludedDriverIds`).
6. Aplica bloqueo financiero (`getBlockedDriverIds`).

## Fase B - penalizacion de confiabilidad

Funcion clave: `getDriverReliabilityPenaltyMap`.

1. Mira cancelaciones recientes por chofer (ventana configurable).
2. Distingue timeout automatico vs cancelacion normal.
3. Calcula penalizacion en km equivalente y la acota a un maximo.

Formula actual:

`penalty = min(MAX, autoTimeouts * 0.9 + normalCancels * 0.25)`

## Fase C - score final

Para cada candidato:

- `distanceToOriginKm`
- `reliabilityPenaltyKm`
- `pushPenaltyKm` (0 si tiene push token, 0.35 si no)

Score usado:

`dispatchScoreKm = distanceToOriginKm + reliabilityPenaltyKm + pushPenaltyKm`

Criterio de orden:

1. Menor `dispatchScoreKm`
2. En empate, menor distancia pura

## Fase D - expansion por anillos

Funcion clave: `buildDynamicSearchRadii`.

- Ventana inicial: 1km y 2km.
- Cada 15s se agrega un anillo adicional.
- Si no hay candidato en radio habilitado, se sigue expandiendo.

Esto evita abrir 20km de una sola vez y favorece cercania real al inicio.

## Fase E - timeout y reasignacion

Funciones clave:

- `schedulePendingTimeoutTimer`
- `cancelTimedOutPendingTripAndRedispatch`
- `processTripLifecycleTransitionsForTripId`
- `dispatchQueuedPassengers`

Flujo:

1. Al asignar `pending`, se agenda timer de 15s.
2. Si no acepta en tiempo, se cancela con razon de sistema (`[AUTO_TIMEOUT] ...`).
3. Se dispara reasignacion inmediata por transicion (`trip.transition`).
4. Si no hay candidato, se envía a cola (`queued`).
5. Cron ejecuta `expireTimedOutPendingTrips` solo como red de seguridad.

## 5) Reglas de exclusion importantes

- En reasignacion por cancelacion normal, se excluye el chofer que cancelo.
- En timeout automatico, tambien se excluyen choferes que ya timeout para ese pasajero en ventana reciente (`getPassengerReassignmentContext`).
- Esa exclusion aplica tambien en despacho desde cola.

Resultado esperado: no reintentar con el mismo chofer que ya dejo vencer la oferta.

## 6) Invariantes que no deben romperse

1. Todo viaje `pending` debe tener `assigned_at`.
2. Cualquier transicion fuera de `pending` debe limpiar timer en memoria.
3. `trip.transition` debe seguir llegando desde DB trigger.
4. El cron nunca debe ser la unica via de reasignacion.
5. `dispatchQueuedPassengers` debe mantener FIFO por pasajero.

## 7) Riesgos y sintomas de mala calibracion

- Radios crecen demasiado rapido:
  - Asignaciones lejanas, ETA alto, mas cancelaciones.
- Penalizacion demasiado agresiva:
  - Se agotan candidatos y se incrementa cola.
- Penalizacion demasiado baja:
  - Se repiten choferes con historial de timeout.
- Ventana de confiabilidad demasiado corta:
  - No captura patron real de baja aceptacion.

## 8) Mejoras futuras recomendadas

1. Score dependiente de hora/zona (demanda dinamica).
2. Penalizacion diferenciada por motivo de cancelacion del chofer.
3. Agregar señal de latencia de push real (entrega/ack).
4. Evitar sesgo por distancia lineal incorporando ETA vial aproximada.
5. Persistir metricas de conversion `offer -> accept` por chofer.
