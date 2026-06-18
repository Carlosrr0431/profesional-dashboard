---
mode: ask
description: Registrar un nuevo caso ambiguo de dirección en ADDRESS_CASES.md. Usar cuando un pasajero envía un mensaje que el agente no puede geocodificar correctamente.
---

Agrega un nuevo caso al documento vivo [ADDRESS_CASES.md](../../ADDRESS_CASES.md) siguiendo las instrucciones definidas en el encabezado de ese archivo.

**Datos del nuevo caso:**
- Mensaje original del pasajero: ${input:mensaje:"Ej: la casa de enfrente del correo"}
- Origen: ${input:origen:knowledge_base|produccion|analisis_manual}
- Descripción del problema: ${input:problema:"Ej: no tiene calle ni número, es referencia relativa"}

**Pasos:**
1. Leer `ADDRESS_CASES.md` para obtener el número correlativo siguiente.
2. Agregar la fila correspondiente en la tabla de estado con estado `⏳ Pendiente`.
3. Agregar la sección de detalle al final del archivo usando la plantilla definida.
4. NO modificar `route.js` — solo documentar el caso.
