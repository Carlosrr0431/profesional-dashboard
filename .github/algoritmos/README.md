# Algoritmos criticos - ProfesionalApp

Este directorio documenta los algoritmos mas sensibles del sistema para:

- entender el comportamiento actual,
- testear sin romper contratos,
- pulir reglas de negocio con bajo riesgo,
- poder calibrar parametros sin rehacer el flujo completo.

## Orden recomendado de lectura

1. `matching-reasignacion.md`
2. `pipeline-whatsapp-y-transiciones.md`
3. `geocodificacion-direcciones.md`
4. `operacion-y-resiliencia.md`
5. `pagos-comisiones-paypertic.md`
6. `plan-de-pruebas-y-mejoras.md`
7. `pruebas-viajes-reales-dispatch-driver-app.md`

## Mapa rapido de archivos

- `matching-reasignacion.md`
  - Matching de choferes, expansion por anillos, score, timeout de aceptacion y reasignacion.
- `pipeline-whatsapp-y-transiciones.md`
  - Flujo de entrada de mensajes, buffer/acumulacion, polling, eventos de transicion y cron fallback.
- `geocodificacion-direcciones.md`
  - Normalizacion, scoring geoespacial, multi-fuente de candidatos y casos que requieren GPS.
- `operacion-y-resiliencia.md`
  - Notificacion al chofer multi-canal, zonas de servicio, idempotencia y guardas de concurrencia.
- `pagos-comisiones-paypertic.md`
  - Politica de checkout para cobro de comisiones: QR habilitado, credito solo en 1 cuota.
- `plan-de-pruebas-y-mejoras.md`
  - Matriz de pruebas, observabilidad, regresiones a vigilar y backlog tecnico sugerido.
- `pruebas-viajes-reales-dispatch-driver-app.md`
  - Checklist operativo para validar en calle la asignacion por Realtime (incluye `UPDATE -> pending`) y criterios de aprobacion.

## Codigo fuente principal

- `profesional-dashboard/app/api/Agente_IA/route.js`
- `profesional-dashboard/supabase/whatsapp_trip_transition_event.sql`
- `profesional-dashboard/supabase/add_trip_transition_insert_event.sql`

## Nota de alcance

La logica de dispatch se describe en terminos de patrones de marketplace de movilidad (ej: expansion de busqueda, priorizacion por score, retries controlados). No replica algoritmos propietarios de terceros.

Complemento recomendado para direcciones: `ADDRESS_CASES.md` (matriz de casos ambiguos y estado de implementacion).
