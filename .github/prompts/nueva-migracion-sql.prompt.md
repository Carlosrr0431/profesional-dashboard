---
mode: ask
description: Crear una nueva migración SQL para Supabase con políticas RLS correctas. Usar cuando se necesita agregar una tabla o modificar políticas existentes.
---

Crea un archivo de migración SQL para Supabase en la carpeta `${input:proyecto:driver-app|profesional-dashboard}/supabase/`.

**Nombre del archivo:** ${input:nombre:"Ej: add_driver_ratings"}

**Tarea:** ${input:descripcion:"Ej: Agregar tabla driver_ratings con política de lectura pública y escritura solo para service_role"}

**Reglas obligatorias a seguir:**

1. **Leer** [`driver-app/supabase/fix_drivers_rls_recursion.sql`](../../driver-app/supabase/fix_drivers_rls_recursion.sql) ANTES de crear políticas para la tabla `drivers` — documenta un caso real de recursión infinita.
2. **RLS activo** en toda tabla nueva: incluir siempre `ALTER TABLE ... ENABLE ROW LEVEL SECURITY`.
3. **No usar** `USING (auth.uid() = driver_id)` en políticas de `drivers` — ver el archivo de referencia.
4. **Usar** `TO authenticated` o `TO service_role` para acotar el alcance de cada política.
5. El script debe ser **idempotente**: usar `IF NOT EXISTS`, `OR REPLACE`, o `DROP ... IF EXISTS` antes de `CREATE`.
6. Incluir comentario al inicio con la fecha y descripción breve.

Genera el archivo SQL completo y muéstralo antes de escribirlo.
