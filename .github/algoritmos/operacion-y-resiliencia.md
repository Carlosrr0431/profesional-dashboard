# Operacion y resiliencia (algoritmos criticos)

## 1) Notificacion al chofer multi-canal

Funciones clave en `profesional-dashboard/app/api/Agente_IA/route.js`:

- `sendPushNotification`
- `notifyDriver`

Reglas actuales:

1. Si hay `push_token`, intenta push por Expo.
2. Si token invalido o `DeviceNotRegistered`, marca fallo.
3. Si `DeviceNotRegistered`, limpia `drivers.push_token`.
4. Si push falla por cualquier motivo, fallback a WhatsApp del chofer.
5. Si no hay telefono ni push, log de canal agotado.

Optimizaciones implementadas:

- compactacion de payload push para evitar `MessageTooBig`.
- parse flexible de respuesta Expo (`result.data` objeto o array).

## 2) Restriccion por zona de servicio

Funciones:

- `isPointInPolygon` (ray-casting)
- `getActiveServiceZones`
- `isPickupInServiceZone`

Comportamiento:

- Si existen zonas activas, el pickup debe caer dentro de al menos una.
- Si no hay zonas activas cargadas, no se restringe (modo abierto).

Riesgo:

- coordenadas mal ordenadas o poligonos invalidos pueden rechazar viajes validos.

## 3) Guardas de idempotencia y duplicados

Puntos clave:

- `appendIncomingMessage`: dedupe por `messageId`.
- `claimConversationBatch`: claim de lote para evitar doble worker.
- uso de `wa_notified_at` como claim atomico en transiciones.

Objetivo:

- evitar doble respuesta al pasajero,
- evitar doble reasignacion,
- evitar doble creacion de viaje.

## 4) Guardas de negocio sobre viajes abiertos

Componente critico:

- fast-path de `processClaimedConversation`.

Reglas:

1. Si pasajero ya tiene viaje bloqueante abierto, no crear viaje nuevo.
2. Detectar cancelacion por texto y pedir confirmacion cuando corresponda.
3. Si confirma, cancelar y notificar chofer si aplica.

## 5) Riesgos de infraestructura

- Timers en memoria no sobreviven cold start/redeploy.
- Por eso existe fallback cron para pending expirados y transiciones pendientes.

## 6) Checklist de prueba rapida

1. Push OK -> sin fallback WhatsApp.
2. Push con `DeviceNotRegistered` -> limpia token + fallback WhatsApp.
3. Push sin token -> fallback WhatsApp directo.
4. Pickup fuera de zona -> bloqueo correcto.
5. Mensaje duplicado (`messageId`) -> no duplica respuesta.
6. Dos invocaciones simultaneas al mismo `conversationId` -> un solo batch procesado.
