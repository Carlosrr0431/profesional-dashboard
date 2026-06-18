# Pruebas reales de viajes - dispatch y driver-app

## 1) Objetivo

Validar en operacion real que la asignacion de viaje al chofer funcione aunque falle el push, aprovechando Realtime en la app del chofer.

Este protocolo cubre:

- Asignacion por cambio de estado `queued -> pending` (evento `UPDATE` en `trips`).
- Evitar duplicados de alerta/modal para el mismo viaje pendiente.
- Limpieza correcta del modal cuando el viaje deja `pending`.
- Comportamiento con app abierta, en segundo plano y cerrada.

## 2) Alcance del cambio validado

Referencia tecnica del cambio:

- `driver-app/src/hooks/useRealtime.js`
  - Se procesa asignacion pendiente tanto en `INSERT` como en `UPDATE`.
  - Se agrega deduplicacion para no repetir haptics/notificacion local cuando llega el mismo `pending` varias veces.
  - Se limpia `pendingTrip` cuando el viaje pasa de `pending` a otro estado.

## 3) Precondiciones

1. Base de datos y backend activos en Supabase/Next.js.
2. Al menos 2 choferes de prueba en `drivers` con telefonos distintos:
   - Chofer A: candidato principal.
   - Chofer B: respaldo para reasignacion.
3. Chofer A con sesion iniciada en driver-app y estado online.
4. Verificar que Chofer A este en `HomeScreen` (para asegurar suscripcion Realtime activa).
5. Dashboard disponible para monitorear viajes y forzar acciones manuales si hace falta.

## 4) Escenarios obligatorios

## Escenario A - App abierta (caso principal)

Objetivo: demostrar que no depende del push para mostrar asignacion.

Pasos:

1. Crear un viaje real por WhatsApp o desde dashboard.
2. Forzar flujo normal de dispatch hasta que el viaje pase a `pending` con `driver_id = Chofer A`.
3. Mantener la app del chofer abierta en `HomeScreen` durante todo el proceso.

Resultado esperado:

1. Aparece modal de nuevo viaje en el chofer.
2. Se escucha/siente alerta una sola vez para ese viaje.
3. Se ve notificacion local "Nuevo viaje asignado".
4. En BD, el viaje queda en `pending` hasta que chofer acepte/rechace o venza timeout.

## Escenario B - Pending por UPDATE (regresion corregida)

Objetivo: validar el caso que antes fallaba cuando no habia `INSERT` nuevo para el chofer.

Pasos:

1. Crear viaje que inicialmente quede en `queued`.
2. Esperar o forzar asignacion para que pase a `pending` con `driver_id = Chofer A` mediante `UPDATE`.
3. Confirmar en logs/BD que fue transicion de estado y no alta nueva de fila.

Resultado esperado:

1. El chofer recibe modal de aceptacion igual que en `INSERT`.
2. No hay dependencia de push para ver el viaje cuando la app esta abierta.

## Escenario C - Deduplicacion de alerta

Objetivo: evitar spam de notificaciones para el mismo viaje pendiente.

Pasos:

1. Con el viaje ya en `pending` y modal abierto, ejecutar un `UPDATE` no critico sobre la misma fila (por ejemplo, cambio de campo auxiliar).
2. Repetir 2 o 3 updates rapidos.

Resultado esperado:

1. El modal sigue abierto y consistente.
2. No se repite haptics ni notificacion local para el mismo viaje pendiente.
3. No se generan mensajes infinitos relacionados al mismo evento de asignacion.

## Escenario D - Salida de pending limpia estado local

Objetivo: validar que no queda modal stale.

Pasos:

1. Con viaje pendiente visible en el modal, aceptar el viaje desde la app del chofer.
2. Repetir con otro viaje pendiente pero cancelarlo desde dashboard.

Resultado esperado:

1. Cuando el viaje deja `pending`, se limpia `pendingTrip` en la app.
2. El modal se cierra correctamente y no reaparece sin nuevo evento.

## Escenario E - App en background y app cerrada

Objetivo: delimitar comportamiento esperado fuera de foreground.

Pasos:

1. Repetir Escenario A con app en segundo plano.
2. Repetir Escenario A con app totalmente cerrada.

Resultado esperado:

1. En background, puede aparecer notificacion push/local segun permisos/estado del sistema.
2. Con app cerrada, el mecanismo inmediato depende de push (Realtime no puede renderizar modal si la app no esta corriendo en foreground).

## 5) Chequeos de base de datos (manuales)

Verificar para cada viaje de prueba:

1. Secuencia de estado esperada: `queued -> pending -> accepted` o timeout/reasignacion.
2. `driver_id` correcto en cada transicion.
3. Si hubo fallo de notify, confirmar requeue controlado (sin loops).
4. No duplicacion anomala de mensajes WhatsApp para el mismo evento de asignacion.

## 6) Criterios de aprobacion

Se considera aprobado si:

1. Escenarios A-E pasan completos en al menos 3 viajes reales.
2. No hay duplicacion de alertas en chofer para mismo `trip.id` pendiente.
3. No hay cancelaciones falsas por timeout cuando el chofer acepta en tiempo.
4. No hay bucles de mensajes de WhatsApp por el mismo viaje.

## 7) Registro minimo por corrida

Guardar evidencia por cada corrida:

1. Hora de inicio/fin.
2. IDs de viajes probados.
3. Choferes involucrados.
4. Resultado por escenario (OK/NO OK).
5. Hallazgos y acciones pendientes.

Formato sugerido:

```
Fecha:
Build driver-app:
Entorno:

Trip IDs:
- ...

Escenario A:
Escenario B:
Escenario C:
Escenario D:
Escenario E:

Incidentes detectados:
Accion correctiva propuesta:
```

## 8) Nota operativa

Si se detecta cualquier repeticion anomala de mensajes o reasignaciones en bucle, pausar despliegue y revisar de inmediato:

1. Logs de `profesional-dashboard/app/api/Agente_IA/route.js`.
2. Estado real de `trips` y `drivers` en Supabase.
3. Build/version instalada de driver-app en los dispositivos de prueba.