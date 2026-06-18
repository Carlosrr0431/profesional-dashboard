# Plan de pruebas y mejoras

## 1) Objetivo

Definir una estrategia practica para estabilizar y evolucionar algoritmos criticos sin regresiones operativas.

## 2) Matriz minima de pruebas por dominio

## A. Matching y reasignacion

Casos obligatorios:

1. Asignacion inicial con chofer cercano disponible.
2. Timeout a 15s con cancelacion automatica.
3. Reasignacion excluyendo chofer timeout previo.
4. Expansion por anillos cada 15s.
5. Fallback a `queued` cuando no hay chofer.
6. Desbloqueo de cola cuando aparece chofer valido.

## B. Geocodificacion

Casos obligatorios:

1. Direccion exacta con numero.
2. Direccion ambigua multi-candidato.
3. Formato manzana/lote que requiere GPS.
4. Reverse geocode desde coordenada pura.
5. Direccion fuera de zona de servicio.

## C. Pipeline WhatsApp

Casos obligatorios:

1. Deduplicacion de `messageId` repetido.
2. Acumulacion de mensajes y procesamiento batch.
3. Poll.results con opcion valida.
4. Poll.results con opcion invalida/no mapeada.
5. Mensaje GPS aplicado a viaje en espera.

## D. Transiciones

Casos obligatorios:

1. Trigger DB en `INSERT` crea evento.
2. Trigger DB en `UPDATE` crea evento.
3. Notificacion a pasajero al aceptar chofer.
4. Cancelacion por chofer dispara reasignacion.
5. Cron recupera pendientes no resueltos.

## E. Operacion y resiliencia

Casos obligatorios:

1. Push exitoso al chofer (sin fallback WhatsApp).
2. Push con `DeviceNotRegistered` limpia token y usa fallback WhatsApp.
3. Push sin token usa fallback WhatsApp directo.
4. Pickup fuera de zona activa queda bloqueado.
5. Doble webhook del mismo mensaje no duplica salida.

## 3) Pruebas de concurrencia (alta prioridad)

Escenarios:

1. Dos workers procesando mismo `conversationId`.
2. Aceptacion de chofer justo al vencer timeout.
3. Reasignacion y aceptacion simultanea de otro chofer.
4. Poll.result llegando mientras se cancela y recrea viaje.

Esperado:

- no dobles asignaciones,
- no doble mensaje de confirmacion,
- idempotencia por viaje y por conversacion.

## 4) Observabilidad recomendada

KPIs operativos:

- Tiempo medio `queued -> pending`.
- Tiempo medio `pending -> accepted`.
- Tasa de timeout automatico por chofer.
- Tasa de cancelacion post-aceptacion.
- % viajes resueltos sin intervencion manual.
- Distribucion de radio de asignacion efectivo.

KPIs de geocoding:

- % direccion resuelta en primer intento.
- % casos que pidieron GPS.
- % resoluciones por fuente (Google/Nominatim/Reverse).

## 5) Alertas sugeridas

1. Spike de timeouts automaticos > umbral historico.
2. Aumento brusco de viajes en `queued`.
3. Caida de eventos `trip.transition` recibidos.
4. Errores de geocodificacion por proveedor.

## 6) Backlog tecnico priorizado

1. Persistir eventos de dispatch en tabla de auditoria (`trip_dispatch_events`).
2. Test de contrato para payload `trip.transition`.
3. Simulador offline de matching para recalibrar pesos.
4. Feature flags para cambiar radios/penalizaciones sin deploy.
5. Panel de metricas por chofer (aceptacion, timeout, cancelacion).

## 7) Criterio de release para tocar algoritmo

Antes de pasar a produccion:

1. Ejecutar suite de regresion completa.
2. Ejecutar escenarios de concurrencia clave.
3. Verificar migraciones SQL en entorno real (editor Supabase).
4. Confirmar logs esperados en cron y webhook.
5. Habilitar rollout gradual de parametros criticos.
