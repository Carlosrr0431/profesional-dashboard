# Base de Conocimiento — Casos Ambiguos de Dirección

Documento vivo. Cada nuevo patrón detectado en las tablas `messages` / `chats` (propietario `Profesional_App`) debe registrarse aquí antes de implementarse en `route.js`.

---

## Cómo agregar un nuevo caso

1. Asignale el siguiente número correlativo en la tabla de estado.
2. Completá la sección de detalle usando la plantilla al final del archivo.
3. Cambiá el estado a `⏳ Pendiente` hasta que se implemente.
4. Cuando se implemente, actualizá a `✅ Resuelto` y completá la sección "Solución implementada".

### Plantilla para nuevo caso

```
### ⏳ Caso N — Título corto
**Origen:** [knowledge_base | producción | análisis manual]
**Ejemplo real:** "texto tal cual lo mandó el pasajero"
**Problema:** descripción del problema de geocodificación o interpretación.

**Solución propuesta:**
- paso 1
- paso 2

**Solución implementada:**
- (completar al implementar)
```

---

## Estado de los casos

| # | Descripción breve | Estado | Origen |
|---|---|---|---|
| 1 | Solo número sin calle | ✅ Resuelto | análisis |
| 2 | Número de dpto confundido con nro de calle | ✅ Resuelto | análisis |
| 3 | Calle sin número | ✅ Resuelto | análisis |
| 4 | Intersección en múltiples formatos | ✅ Resuelto | análisis |
| 5 | Barrio ambiguo / abreviado | ✅ Resuelto | análisis |
| 6 | Punto de referencia sin dirección (POIs) | ✅ Resuelto | análisis |
| 7 | Frente a / al lado de / cerca de | ✅ Resuelto | análisis |
| 8 | Abreviaturas de calles | ✅ Resuelto | análisis |
| 9 | Calles con nombre homónimo en Salta | ✅ Resuelto | análisis |
| 10 | "Acá", "aquí", "donde estoy" | ✅ Resuelto | análisis |
| 11 | Zona amplia sin precisión ("el centro") | ✅ Resuelto | análisis |
| 12 | WhatsApp location share (pin GPS nativo) | ✅ Resuelto | análisis |
| 13 | Múltiples paradas en un mensaje | ⏳ Pendiente | análisis |
| 14 | Orden invertido pickup/destino | ✅ Resuelto | análisis |
| 15 | Destino opcional, pickup obligatorio | ✅ Resuelto | análisis |
| 16 | Número de calle escrito en texto | ✅ Resuelto | análisis |
| 17 | Dirección en otra ciudad / fuera del radio | ⏳ Pendiente | análisis |
| 18 | Pasajero corrige dirección con viaje activo | ✅ Resuelto | análisis |
| 19 | Nombre de edificio o empresa como dirección | ✅ Resuelto | análisis |
| 20 | Errores fonéticos / ortográficos en calles | ✅ Resuelto | análisis |
| 21 | Número de teléfono embebido en la dirección | ✅ Resuelto | análisis |
| 22 | Viajes programados / reservas futuras | ⏳ Pendiente | análisis |
| 23 | Nombre de persona confundido con calle | ✅ Resuelto | análisis |
| 24 | "Mismo lugar de siempre" / "la de siempre" | ✅ Resuelto | análisis |
| 25 | Pasaje / callejón con nomenclatura no estándar | ⏳ Pendiente | knowledge_base |
| 26 | Nomenclatura de loteo: "Manzana X Lote Y" | ✅ Resuelto | knowledge_base |
| 27 | Referencia a kilómetro de ruta | ✅ Resuelto | knowledge_base |
| 28 | Dirección rural: finca / quinta / campo | ⏳ Pendiente | knowledge_base |
| 29 | Dirección enviada en mensajes separados | ⏳ Pendiente | producción |
| 30 | Audio con pronunciación ambigua de calle | ⏳ Pendiente | producción |
| 31 | Mensaje mixto: GPS + texto descriptivo | ⏳ Pendiente | producción |
| 32 | Rotonda / glorieta como referencia | ⏳ Pendiente | knowledge_base |
| 33 | Dirección con referencia a un puente | ⏳ Pendiente | knowledge_base |
| 34 | "Villa X" vs "Barrio X" — confusión de prefijo | ⏳ Pendiente | knowledge_base |
| 35 | Horario confundido con número de calle | ⏳ Pendiente | análisis |
| 36 | Dirección con punto cardinal ("lado norte") | ⏳ Pendiente | knowledge_base |

---

## Detalle por caso

---

### ✅ Caso 1 — Solo número sin calle
**Origen:** análisis manual
**Ejemplo:** "al 351", "en el 200", "altura 500"

**Problema:** No se sabe en qué calle está ese número.

**Solución implementada:**
- `normalizeAddressPhrase()` normaliza "al 200" → "200", "altura 200" → "200".
- El sistema prompt instruye al modelo: si solo llega un número sin calle → `pickup_location=null`, `missing_fields=["pickup_location"]`, reply pregunta: "¿En qué calle es ese número?"

---

### ✅ Caso 2 — Número de dpto confundido con número de calle
**Origen:** análisis manual
**Ejemplo:** "Mitre 351 2B", "España 1200 piso 4 dto A", "Santiago del Estero 351 2 B"

**Problema:** El sufijo de departamento puede interpretarse como parte del número de calle.

**Solución implementada:**
- `normalizeAddressPhrase()` stripea el sufijo con regex:
  `\b(\d{1,5})\s+(?:dto|depto|departamento|piso|of|oficina|...)?\s*[a-z]?\d{1,3}[a-z]?\b` → deja solo el número de calle.

---

### ✅ Caso 3 — Calle sin número
**Origen:** análisis manual
**Ejemplo:** "Belgrano", "Mitre", "España" solos

**Problema:** No hay punto exacto para geocodificar.

**Solución implementada:**
- Sistema prompt: si solo hay nombre de calle sin número → incluir `"pickup_number"` en `missing_fields` y preguntar: "¿A qué altura de [calle]?"
- Alternativa ofrecida: compartir ubicación GPS de WhatsApp.

---

### ✅ Caso 4 — Intersección en múltiples formatos
**Origen:** análisis manual
**Ejemplo:** "Belgrano y Mitre", "España c/ Alvarado", "esq. Urquiza", "casi Mitre", "entre España y Mitre"

**Problema:** Distintos separadores pueden no resolverse correctamente en Google Maps.

**Solución implementada:**
- `normalizeAddressPhrase()` normaliza `"esq."` / `"esquina"` → `"y "` y `" c/ "` → `" y "`.
- Sistema prompt expandido con todos los formatos válidos de intersección.
- `geocodeAddress()` y `autocompleteAndGeocodeAddress()` resuelven `"Calle1 y Calle2, Salta"`.

---

### ✅ Caso 5 — Barrio ambiguo / abreviado
**Origen:** análisis manual
**Ejemplo:** "grand" → Grand Bourg, "tres cerr" → Tres Cerritos, "la loma" → La Loma / Limache

**Problema:** El nombre puede ser parcial o referir a varios barrios.

**Solución implementada:**
- Sistema prompt con tabla de aliases de barrios de Salta.
- `getAddressCandidates()` → si hay 2+ candidatos similares, envía poll.
- Poll incluye siempre "Ninguna de estas opciones" → pide GPS o calle y número.

---

### ✅ Caso 6 — Punto de referencia sin dirección (POIs)
**Origen:** análisis manual
**Ejemplo:** "el hospital", "la terminal", "el shopping", "la municipalidad", "el correo"

**Problema:** El pasajero usa nombres coloquiales que pueden referir a distintas ubicaciones.

**Solución implementada:**
- Sistema prompt con tabla de POIs conocidos de Salta.
- Si hay 2+ candidatos de `getAddressCandidates()`, se envía poll con las opciones + "Ninguna de estas opciones".

---

### ✅ Caso 7 — Frente a / al lado de / cerca de
**Origen:** análisis manual
**Ejemplo:** "frente al Banco Macro", "al lado de la farmacia", "pasando el semáforo"

**Problema:** No es una coordenada geocodificable.

**Solución implementada:**
- Sistema prompt: `pickup_location=null`, `missing_fields=["pickup_location"]`, reply pide calle y número exacto o GPS.

---

### ✅ Caso 8 — Abreviaturas de calles
**Origen:** análisis manual
**Ejemplo:** "Av. Belgrano", "Gral. Güemes", "Bvd. Rondeau", "Cnel. Suárez"

**Problema:** Pueden no geocodificar sin expandir.

**Solución implementada:**
- `normalizeAddressPhrase()` expande: `"gral."` → `"General"`, `"cnel."` → `"Coronel"`, `"tte."` → `"Teniente"`, `"bvd."` → `"Boulevard"`.
- `applyPhoneticCorrections()` cubre variantes sin tildes.

---

### ✅ Caso 9 — Calles con nombre homónimo en Salta
**Origen:** análisis manual
**Ejemplo:** "Güemes" → Av. Martín Miguel de Güemes vs. calle Güemes

**Problema:** Existen múltiples calles con el mismo nombre en distintos barrios.

**Solución implementada:**
- `getAddressCandidates()` usa `geocodeAddressMultiple()` + `autocompleteAndGeocodeAddress()`.
- Si el score del primer candidato y el segundo difieren en menos de 0.40 → poll con todas las opciones + "Ninguna de estas opciones".

---

### ✅ Caso 10 — "Acá", "aquí", "donde estoy", "en mi casa"
**Origen:** análisis manual
**Ejemplo:** "acá nomás", "donde estoy", "salgo ya"

**Problema:** No hay dirección en el mensaje.

**Solución implementada:**
- `normalizeAddressPhrase()` retorna `''` para estas frases.
- Bloque `missing pickup_location`: pide GPS o calle y número. Guarda `awaiting_gps: true`.

---

### ✅ Caso 11 — Zona amplia sin precisión
**Origen:** análisis manual
**Ejemplo:** "el centro", "microcentro", "afuera"

**Problema:** No es un punto geocodificable preciso.

**Solución implementada:**
- `isCoarseGeocodeResult()` descarta resultados solo a nivel `locality` o `APPROXIMATE`.
- `createTripFromConversation()` responde pidiendo calle y número o GPS cuando geocodificación falla.

---

### ✅ Caso 12 — WhatsApp location share (pin GPS nativo)
**Origen:** análisis manual
**Ejemplo:** El pasajero toca el ícono de ubicación y comparte su pin.

**Solución implementada (preexistente):**
- Handler de `locationMessage` extrae `degreesLatitude` / `degreesLongitude`.
- Usa primero `locMsg.address` / `locMsg.name` del payload; fallback a `reverseGeocodeLatLng()`.
- Llama directo a `createTripFromConversation()` con `_preGeocodedPickup` ya resuelto.

---

### ⏳ Caso 13 — Múltiples paradas en un mensaje
**Origen:** análisis manual
**Ejemplo:** "voy de Belgrano 200, paso por Mitre 300 y llego a España 400"

**Problema:** Hay 3+ puntos; no está definido si es un viaje con escalas o dos viajes separados.

**Solución propuesta:**
- Tomar primera dirección como pickup y última como destino final, ignorar las intermedias hasta que exista soporte de multi-parada.
- Notificar al pasajero que se registró el viaje con el primer y último punto.

**Solución implementada:** pendiente.

---

### ✅ Caso 14 — Orden invertido pickup/destino
**Origen:** análisis manual
**Ejemplo:** "llevame a Mitre 300 desde Belgrano 200"

**Solución implementada:**
- Sistema prompt: "llevame a X desde Y" → pickup=Y, destination=X. "de X para Y" → pickup=X, destination=Y.
- `extractFullTripByPattern()` detecta el patrón `de [...] a [...]`.

---

### ✅ Caso 15 — Destino opcional, pickup obligatorio
**Origen:** análisis manual

**Solución implementada:**
- `"destination"` nunca se incluye en `missing_fields`.
- `createTripFromConversation()` crea el viaje aunque `destination` sea `null`.
- Si destino no geocodifica → `awaiting_destination_gps: true`, sin bloquear el viaje.

---

### ✅ Caso 16 — Número de calle escrito en texto
**Origen:** análisis manual
**Ejemplo:** "belgrano doscientos cincuenta", "mitre ciento veinte"

**Solución implementada:**
- `convertSpanishNumbersInText()` convierte: `"doscientos"` → `200`, `"trescientos cincuenta"` → `350`.
- Se aplica en `normalizeAddressPhrase()` antes de geocodificar.

---

### ⏳ Caso 17 — Dirección en otra ciudad / fuera del radio
**Origen:** análisis manual
**Ejemplo:** "Güemes 200, Rosario de la Frontera", "Jujuy 500"

**Problema:** Google Maps resuelve pero la coordenada queda fuera de la zona operativa.

**Solución propuesta:**
- Validar que la coordenada resultante esté dentro del bbox de Salta Capital (`-24.90,-65.55 | -24.70,-65.30`) extendido al radio de operación.
- Si queda fuera → reply: "Solo operamos en Salta Capital y alrededores. ¿La dirección está en Salta Capital?"

**Solución implementada:** pendiente.

---

### ✅ Caso 18 — Pasajero corrige dirección con viaje activo
**Origen:** análisis manual
**Ejemplo:** Mensaje 1: pickup confirmado → Mensaje 2: "che no, es Belgrano 300"

**Solución implementada:**
- Cuando hay viaje `pending` y el pasajero envía `intent=trip_request` con una nueva dirección diferente:
  1. Se geocodifica la nueva dirección.
  2. Se actualiza `destination_address` / lat / lng en la tabla `trips`.
  3. Se envía push notification al chofer con la nueva dirección.
  4. Se confirma al pasajero el cambio.

---

### ✅ Caso 19 — Nombre de edificio o empresa como dirección
**Origen:** análisis manual
**Ejemplo:** "el edificio Suizo", "la oficina de Arcor", "Consultorio del Dr. Pérez"

**Solución implementada:**
- `autocompleteAndGeocodeAddress()` busca en Places API.
- Si hay 2+ candidatos → poll con opciones + "Ninguna de estas opciones".
- Si elige "Ninguna" → pide GPS o calle y número exacto.

---

### ✅ Caso 20 — Errores fonéticos / ortográficos en calles
**Origen:** análisis manual
**Ejemplo:** "Irigogien" → Yrigoyen, "Urquisa" → Urquiza, "Gemes" → Güemes

**Solución implementada:**
- `applyPhoneticCorrections()` con tabla de patrones regex para calles de Salta.
- Se aplica en `normalizeAddressPhrase()` antes de geocodificar.

---

### ✅ Caso 21 — Número de teléfono embebido en la dirección
**Origen:** análisis manual
**Ejemplo:** "España 351-4567890", "Mitre 200 cel 1547891234"

**Solución implementada:**
- `stripEmbeddedPhoneNumbers()` elimina secuencias de 8+ dígitos y patrones `cel/tel/wpp + número`.
- Se aplica en `normalizeAddressPhrase()` como primer paso.

---

### ⏳ Caso 22 — Viajes programados / reservas futuras
**Origen:** análisis manual
**Ejemplo:** "para las 10", "para mañana a las 8", "reservar para el jueves"

**Problema:** El sistema solo gestiona pedidos inmediatos.

**Solución propuesta:**
- Tabla `scheduled_trips` con `scheduled_at`, `passenger_phone`, `pickup_location`, coordenadas.
- Cron cada minuto que despacha los viajes cuyo `scheduled_at` ≤ `now + 5 min`.
- Flujo de confirmación: "Tu viaje para las 10:00 quedó reservado. Te aviso cuando asignemos el chofer."

**Solución implementada:** pendiente.

---

### ✅ Caso 23 — Nombre de persona confundido con calle
**Origen:** análisis manual
**Ejemplo:** "en lo de Juan", "en casa de mi hermana", "donde la Nelly"

**Solución implementada:**
- Si no se detecta `looksLikeAddressText()` → `pickup_location=null`.
- Bloque `missing pickup_location` pide GPS o calle y número.
- `hydratePickupFromKnowledge()` puede resolver si el nombre aparece asociado a una dirección en el historial.

---

### ✅ Caso 24 — "Mismo lugar de siempre" / "la de siempre" / "como siempre"
**Origen:** análisis manual
**Ejemplo:** "pasame al mismo lugar", "desde la de siempre"

**Solución implementada:**
 pide GPS o calle y número.

---

### ✅ Caso 25 — Pasaje / callejón con nomenclatura no estándar
**Origen:** knowledge_base
**Ejemplo:** "Pasaje Los Sauces", "Callejón del Molino", "Pje. San José manzana 3"

**Problema:** Los pasajes en barrios periféricos de Salta muchas veces no están en Google Maps o tienen nomenclatura de loteo (Mz/Lote). Geocodifican a la intersección más cercana o fallan.

**Solución propuesta:**
pedir GPS obligatorio (no hay alternativa de calle y número para estos casos).

**Solución implementada:** pendiente.

---

### ✅ Caso 26 — Nomenclatura de loteo: "Manzana X Lote Y"
**Origen:** knowledge_base
**Ejemplo:** "Manzana 14 Lote 6 Villa Yapeyú", "Mz 3 Lt 2 barrio INTA"

**Problema:** Nomenclatura catastral que Google Maps no resuelve directamente.

**Solución propuesta:**
- Detectar el patrón `Mz[anza]? \d+ L[ot]e? \d+`.
- Pedir obligatoriamente GPS (no hay forma de geocodificar nomenclatura catastral con APIs estándar).
- Guardar la nomenclatura en `notes` del viaje para referencia del chofer.

**Solución implementada:**
- Detectado en `requiresGpsForAddress()` con regex `\b(manzana|mz\.?)\s*\d+`.
- Al detectar el patrón, se guarda `catastral_nomenclature` en el contexto de la conversación además de activar `awaiting_gps: true`.
- Cuando llega el GPS del pasajero, `catastral_nomenclature` se propaga a `createTripFromConversation` vía `extracted` (porque `...convCtx` lo incluye).
- En el viaje creado, `notes` incluye `[CATASTRAL] Manzana X Lote Y` visible para el chofer.
- `TripDetailScreen` de la driver-app parsea `[CATASTRAL]` y lo muestra como `📍 Catastral: ...` en la sección INDICACIONES.
- Para cualquier viaje, los mensajes actuales del pasajero (hasta 500 chars) se incluyen en notes como `[INDICACIONES_PASAJERO] ...`, mostrados como `💬 Pasajero: ...` en la driver-app.

---

### ✅ Caso 27 — Referencia a kilómetro de ruta
**Origen:** knowledge_base
**Ejemplo:** "km 7 de la ruta 9", "ruta 68 km 12", "a 5 km de la salida norte"

**Problema:** No es una dirección de calle; puede geocodificarse parcialmente pero sin precisión.

**Solución propuesta:**
 pedir GPS obligatorio.

**Solución implementada:**
- Detectado en `requiresGpsForAddress()` con regex `\b(?:ruta\s*\d+|km\s*\d+)\b`.
- Se activa GPS obligatorio con `reason: 'km_ruta'`.
- Mensaje al pasajero: "Las referencias por kilómetro de ruta no tienen punto de retiro preciso. Compartí tu ubicación en tiempo real..."
- Además, se agregó `\bauto\b` y `mand[aá]me un` al regex `looksLikeTripRequest` de `inferTripHeuristics()` para que "me podés mandar un auto?" active el flujo de viaje aunque la IA falle por cuota.
**Origen:** knowledge_base
**Ejemplo:** "la finca de los García", "la quinta sobre ruta 68", "campo El Porvenir"

**Problema:** No existe en bases de calles urbanas. Solo resoluble por GPS o por historial.

**Solución propuesta:**
- Detectar keywords `"finca"` / `"quinta"` / `"campo"` / `"chacra"`.
- Pedir GPS obligatorio + guardar nombre en `notes`.
- Intentar resolver contra historial del pasajero si ya fue geocodificado antes.

**Solución implementada:** pendiente.

---

### ⏳ Caso 29 — Dirección enviada en mensajes separados
**Origen:** producción
**Ejemplo:** Mensaje 1: "Belgrano" → Mensaje 2: "200" → dos mensajes separados forman "Belgrano 200"

**Problema:** El sistema acumula mensajes (ventana de 40 s), pero si llegan en rondas distintas de procesamiento, el segundo mensaje puede no tener el contexto del primero.

**Solución propuesta:**
- Mejorar `hydratePickupFromKnowledge()` para combinar `context.pickup_location` (que puede tener solo la calle) con un número de calle mencionado en el mensaje actual.
- Detectar en el sistema prompt: si `context.pickup_location` tiene solo una calle y el mensaje actual es solo un número → combinar ambos.

**Solución implementada:** pendiente.

---

### ⏳ Caso 30 — Audio con pronunciación ambigua de calle
**Origen:** producción
**Ejemplo:** Whisper transcribe "Irigoi" o "Guemes" desde un audio con ruido

**Problema:** La transcripción de Whisper puede dejar nombres de calles incompletos o con variantes fonéticas distintas a las del texto.

**Solución propuesta:**
- Aplicar `applyPhoneticCorrections()` también sobre la transcripción cruda de Whisper antes de pasarla al modelo.
- Ampliar la tabla `SALTA_PHONETIC_CORRECTIONS` con más variantes detectadas en producción.

**Solución implementada:** pendiente (parcialmente cubierto por `normalizeAddressPhrase()` en el texto final).

---

### ⏳ Caso 31 — Mensaje mixto: GPS + texto descriptivo
**Origen:** producción
**Ejemplo:** El pasajero comparte la ubicación GPS Y escribe "estoy en la puerta del banco, segundo piso"

**Problema:** El handler de `locationMessage` procesa el GPS y descarta el texto descriptivo, pero el texto puede contener información de destino útil.

**Solución propuesta:**
- Cuando llega un `locationMessage` con texto adjunto → extraer el texto con `extractTripIntent()` para capturar posible destino o notas.
- Combinar coordenadas GPS (pickup) con texto (destino / notas).

**Solución implementada:** pendiente.

---

### ⏳ Caso 32 — Rotonda / glorieta como referencia
**Origen:** knowledge_base
**Ejemplo:** "rotonda de Limache", "en la rotonda de la ruta 9", "glorieta del Acceso Norte"

**Problema:** Las rotondas sí existen en Google Maps pero el nombre coloquial puede no coincidir.

**Solución propuesta:**
- Tabla de aliases de rotondas conocidas de Salta (rotonda de Limache, rotonda del Hipódromo, etc.).
- Si hay match → reemplazar por la dirección canónica antes de geocodificar.

**Solución implementada:** pendiente.

---

### ⏳ Caso 33 — Dirección con referencia a un puente
**Origen:** knowledge_base
**Ejemplo:** "antes del puente", "del lado del puente del Río Arias", "pasando el puente de Lima"

**Problema:** "Antes" / "pasando" son referencias relativas al trayecto del pasajero, no geocodificables.

**Solución propuesta:**
- Detectar `"puente de [nombre]"` y mapear al nombre del puente conocido (Puente Lima, Puente Belgrano, etc.).
- Si la referencia es relativa ("antes", "pasando") → pedir GPS.

**Solución implementada:** pendiente.

---

### ⏳ Caso 34 — "Villa X" vs "Barrio X" — confusión de prefijo
**Origen:** knowledge_base
**Ejemplo:** "Villa Mitre" vs "Barrio Mitre", "Villa del Parque" vs "Parque Industrial"

**Problema:** El prefijo "villa" puede o no ser parte del nombre oficial del barrio en Google Maps.

**Solución propuesta:**
- Intentar geocodificar con y sin prefijo "Villa" / "Barrio".
- Incluir ambas variantes en `buildAddressVariants()`.

**Solución implementada:** pendiente.

---

### ⏳ Caso 35 — Horario confundido con número de calle
**Origen:** análisis manual
**Ejemplo:** "Belgrano a las 8", "para las 10 en España", "mitre a las 9 y media"

**Problema:** El número de hora puede parsearse como número de calle.

**Solución propuesta:**
- Detectar patrones `"a las \d+"` / `"para las \d+"` antes de extraer el número de calle.
- Remover la parte de horario del string de dirección antes de normalizar.
- Extraer el horario como `schedule_time` si corresponde.

**Solución implementada:** pendiente.

---

### ⏳ Caso 36 — Dirección con punto cardinal
**Origen:** knowledge_base
**Ejemplo:** "lado norte de la terminal", "entrada sur del shopping", "acceso este del estadio"

**Problema:** El punto cardinal indica un acceso específico de un POI; no es una dirección geocodificable directamente.

**Solución propuesta:**
- Detectar `"lado [norte|sur|este|oeste]"` o `"entrada [norte|sur|este|oeste]"`.
- Geocodificar el POI y ajustar el punto de retiro con un offset aproximado según el punto cardinal.
- Alternativa simple: ignorar el punto cardinal y geocodificar el POI, notificar al chofer en `notes`.

**Solución implementada:** pendiente.

---

## Casos pendientes — Resumen

| # | Descripción | Bloqueante | Próximo paso |
|---|---|---|---|
| 13 | Múltiples paradas | Diseño de UX multi-parada | Tomar primera + última como fallback |
| 17 | Dirección fuera del radio | Definir bbox de cobertura | Validar coordenada post-geocodificación |
| 22 | Viajes programados | Tabla `scheduled_trips` + cron | Definir flujo completo |
| 25 | Pasaje / callejón no estándar | — | Detectar prefijo + forzar GPS |
| 27 | Kilómetro de ruta | ✅ Resuelto | GPS obligatorio + regex km_ruta |
| 28 | Finca / quinta / campo | — | Detectar keywords + forzar GPS |
| 29 | Dirección en mensajes separados | — | Combinar contexto calle + número |
| 30 | Audio con pronunciación ambigua | — | Aplicar phonetic corrections sobre Whisper |
| 31 | GPS + texto descriptivo mezclado | — | Extraer destino del texto adyacente al GPS |
| 32 | Rotonda / glorieta | — | Tabla de aliases de rotondas de Salta |
| 33 | Referencia a puente | — | Tabla de puentes + pedir GPS para referencias relativas |
| 34 | "Villa X" vs "Barrio X" | — | Agregar variantes en `buildAddressVariants()` |
| 35 | Horario confundido con número de calle | — | Strip horario antes de extraer número |
| 36 | Punto cardinal de un POI | — | Ignorar cardinal + nota al chofer |


---

## Estado de los casos

| # | Descripción breve | Estado |
|---|---|---|
| 1 | Solo número sin calle | ✅ Resuelto |
| 2 | Número de dpto confundido con nro de calle | ✅ Resuelto |
| 3 | Calle sin número | ✅ Resuelto |
| 4 | Intersección en múltiples formatos | ✅ Resuelto |
| 5 | Barrio ambiguo / abreviado | ✅ Resuelto |
| 6 | Punto de referencia sin dirección (POIs) | ✅ Resuelto |
| 7 | Frente a / al lado de / cerca de | ✅ Resuelto |
| 8 | Abreviaturas de calles | ✅ Resuelto |
| 9 | Calles con nombre homónimo en Salta | ✅ Resuelto |
| 10 | "Acá", "aquí", "donde estoy" | ✅ Resuelto |
| 11 | Zona amplia sin precisión ("el centro") | ✅ Resuelto |
| 12 | WhatsApp location share (pin GPS nativo) | ✅ Resuelto |
| 13 | Múltiples paradas en un mensaje | ⏳ Pendiente |
| 14 | Orden invertido pickup/destino | ✅ Resuelto |
| 15 | Destino opcional, pickup obligatorio | ✅ Resuelto |
| 16 | Número de calle escrito en texto | ✅ Resuelto |
| 17 | Dirección en otra ciudad / fuera del radio | ⏳ Pendiente |
| 18 | Pasajero corrige dirección con viaje activo | ✅ Resuelto |
| 19 | Nombre de edificio o empresa como dirección | ✅ Resuelto |
| 20 | Errores fonéticos / ortográficos en calles | ✅ Resuelto |
| 21 | Número de teléfono embebido en la dirección | ✅ Resuelto |
| 22 | Viajes programados / reservas futuras | ⏳ Pendiente |
| 23 | Nombre de persona confundido con calle | ✅ Resuelto |
| 24 | "Mismo lugar de siempre" / "la de siempre" | ✅ Resuelto |

---

## Detalle por caso

---

### ✅ Caso 1 — Solo número sin calle
**Ejemplo:** "al 351", "en el 200", "altura 500"

**Problema:** No se sabe en qué calle está ese número.

**Solución implementada:**
- `normalizeAddressPhrase()` normaliza "al 200" → "200", "altura 200" → "200".
- El sistema prompt instrye al modelo: si solo llega un número sin calle → `pickup_location=null`, `missing_fields=["pickup_location"]`, y el reply pregunta: *"¿En qué calle es ese número?"*

---

### ✅ Caso 2 — Número de dpto confundido con número de calle
**Ejemplo:** "Mitre 351 2B", "España 1200 piso 4 dto A", "Santiago del Estero 351 2 B"

**Problema:** El sufijo de departamento puede interpretarse como parte del número de calle.

**Solución implementada:**
- `normalizeAddressPhrase()` stripea el sufijo con regex:
  `\b(\d{1,5})\s+(?:dto|depto|departamento|piso|of|oficina|...)?\s*[a-z]?\d{1,3}[a-z]?\b` → deja solo `\1`.

---

### ✅ Caso 3 — Calle sin número
**Ejemplo:** "Belgrano", "Mitre", "España" solos

**Problema:** No hay punto exacto para geocodificar.

**Solución implementada:**
- Sistema prompt: si solo hay nombre de calle sin número → incluir `"pickup_number"` en `missing_fields` y preguntar: *"¿A qué altura de [calle]?"*
- Alternativa ofrecida: compartir ubicación GPS de WhatsApp.

---

### ✅ Caso 4 — Intersección en múltiples formatos
**Ejemplo:** "Belgrano y Mitre", "España c/ Alvarado", "esq. Urquiza", "casi Mitre", "entre España y Mitre"

**Problema:** Distintos separadores pueden no resolverse correctamente en Google Maps.

**Solución implementada:**
- `normalizeAddressPhrase()` normaliza todos los separadores:
  - `"esq."` / `"esquina"` → `"y "`
  - `" c/ "` → `" y "`
- Sistema prompt expandido con todos los formatos válidos de intersección.
- `geocodeAddress()` y `autocompleteAndGeocodeAddress()` resuelven `"Calle1 y Calle2, Salta"`.

---

### ✅ Caso 5 — Barrio ambiguo / abreviado
**Ejemplo:** "grand" → Grand Bourg, "tres cerr" → Tres Cerritos, "la loma" → La Loma / Limache

**Problema:** El nombre puede ser parcial o referir a varios barrios.

**Solución implementada:**
- Sistema prompt con tabla de aliases de barrios de Salta.
- `getAddressCandidates()` lanza autocomplete + geocoding múltiple → si hay 2+ candidatos similares, envía poll al pasajero.
- Poll incluye siempre "Ninguna de estas opciones" → pide GPS o calle y número.

---

### ✅ Caso 6 — Punto de referencia sin dirección (POIs)
**Ejemplo:** "el hospital", "la terminal", "el shopping", "la municipalidad", "el correo"

**Problema:** El pasajero usa nombres coloquiales que pueden referir a distintas ubicaciones.

**Solución implementada:**
- Sistema prompt con tabla de POIs conocidos de Salta (Hospital San Bernardo, Terminal de Ómnibus, Shopping Salta, etc.).
- Si hay 2+ candidatos de `getAddressCandidates()`, se envía poll con las opciones.
- El poll incluye "Ninguna de estas opciones" → pide GPS o dirección exacta.

---

### ✅ Caso 7 — Frente a / al lado de / cerca de
**Ejemplo:** "frente al Banco Macro", "al lado de la farmacia", "pasando el semáforo"

**Problema:** No es una coordenada geocodificable; depende del trayecto del pasajero.

**Solución implementada:**
- Sistema prompt: `pickup_location=null`, `missing_fields=["pickup_location"]`, el reply pide calle y número exacto o GPS.

---

### ✅ Caso 8 — Abreviaturas de calles
**Ejemplo:** "Av. Belgrano", "Gral. Güemes", "Bvd. Rondeau", "Cnel. Suárez"

**Problema:** Pueden no geocodificar sin expandir o resultar en variantes sin tildes.

**Solución implementada:**
- `normalizeAddressPhrase()` expande:
  - `"gral."` → `"General"`
  - `"cnel."` → `"Coronel"`
  - `"tte."` → `"Teniente"`
  - `"bvd."` / `"bv."` → `"Boulevard"`
- `applyPhoneticCorrections()` cubre variantes sin tildes.

---

### ✅ Caso 9 — Calles con nombre homónimo en Salta
**Ejemplo:** "Güemes" → Av. Martín Miguel de Güemes vs. calle Güemes; "San Martín" → Av. vs. calle; "España"

**Problema:** Existen múltiples calles con el mismo nombre en distintos barrios o trazas.

**Solución implementada:**
- `getAddressCandidates()` usa `geocodeAddressMultiple()` + `autocompleteAndGeocodeAddress()`.
- Si el score del primer candidato y el segundo difieren en menos de 0.40, se envía poll con todas las opciones.
- El poll incluye "Ninguna de estas opciones" → pide GPS o más precisión.

---

### ✅ Caso 10 — "Acá", "aquí", "donde estoy", "en mi casa"
**Ejemplo:** "acá nomás", "donde estoy", "en mi casa", "salgo ya"

**Problema:** No hay dirección en el mensaje.

**Solución implementada:**
- `normalizeAddressPhrase()` retorna `''` para estas frases.
- Bloque de `missing pickup_location`: envía respuesta pidiendo compartir ubicación en tiempo real de WhatsApp o escribir calle y número.
- Se guarda `awaiting_gps: true` en el contexto para no repetir el pedido.

---

### ✅ Caso 11 — Zona amplia sin precisión
**Ejemplo:** "el centro", "microcentro", "zona céntrica", "afuera"

**Problema:** No es un punto geocodificable preciso.

**Solución implementada:**
- `isCoarseGeocodeResult()` detecta resultados solo a nivel `locality` o `APPROXIMATE` sin número de calle y los descarta.
- Cuando geocodificación falla por ser demasiado amplia, `createTripFromConversation()` responde pidiendo calle y número o GPS.

---

### ✅ Caso 12 — WhatsApp location share (pin GPS nativo)
**Ejemplo:** El pasajero toca el ícono de ubicación en WhatsApp y comparte su pin.

**Problema:** El agente necesita usar las coordenadas directamente sin intentar geocodificar texto.

**Solución implementada (preexistente):**
- El handler de `locationMessage` extrae `degreesLatitude` / `degreesLongitude`.
- Usa primero `locMsg.address` / `locMsg.name` del payload de WhatsApp (evita reverse geocode).
- Como fallback llama `reverseGeocodeLatLng()` con el algoritmo de dos pasadas.
- Llama directo a `createTripFromConversation()` con `_preGeocodedPickup` ya resuelto.

---

### ⏳ Caso 13 — Múltiples paradas en un mensaje
**Ejemplo:** "voy de Belgrano 200, paso por Mitre 300 y llego a España 400"

**Problema:** Hay 3+ puntos; no está definido si es un viaje con escalas o dos viajes separados.

**Pendiente:** A definir lógica de viajes multi-parada antes de implementar.

---

### ✅ Caso 14 — Orden invertido pickup/destino
**Ejemplo:** "llevame a Mitre 300 desde Belgrano 200", "necesito ir al hospital, salgo de España 1200"

**Problema:** El destino se menciona antes que el pickup.

**Solución implementada:**
- Sistema prompt con reglas explícitas:
  - `"llevame a X desde Y"` → pickup=Y, destination=X
  - `"de X para Y"` / `"de X a Y"` → pickup=X, destination=Y
- `extractFullTripByPattern()` ya detecta el patrón `de [...] a [...]`.

---

### ✅ Caso 15 — Destino opcional, pickup obligatorio
**Problema:** Antes el sistema podía quedar bloqueado esperando un destino que nunca va a llegar.

**Solución implementada:**
- Sistema prompt: `"destination"` nunca se incluye en `missing_fields`.
- `createTripFromConversation()` crea el viaje aunque `destination` sea `null` o vacío.
- Si hay destino pero no geocodifica, se guarda `awaiting_destination_gps: true` y se notifica al pasajero sin bloquear el viaje.

---

### ✅ Caso 16 — Número de calle escrito en texto
**Ejemplo:** "calle doscientos cincuenta", "belgrano trescientos", "mitre ciento veinte"

**Problema:** El texto no es geocodificable como número.

**Solución implementada:**
- `convertSpanishNumbersInText()` convierte cientos y decenas:
  - `"doscientos"` → `200`
  - `"trescientos cincuenta"` → `350`
  - `"ciento veinte"` → `120`
- Se aplica en `normalizeAddressPhrase()` antes de geocodificar.

---

### ⏳ Caso 17 — Dirección en otra ciudad / fuera del radio
**Ejemplo:** "Güemes 200, Rosario de la Frontera", "Jujuy 500" (ciudad vs. calle)

**Problema:** Google Maps resuelve pero la coordenada queda fuera de la zona operativa de Salta Capital.

**Pendiente:** Definir radio de cobertura y lógica de rechazo / aviso al pasajero.

---

### ✅ Caso 18 — Pasajero corrige dirección con viaje activo
**Ejemplo:** Mensaje 1: pickup confirmado → Mensaje 2: "che no, es Belgrano 300"

**Problema:** El contexto del viaje tiene las coordenadas del pickup anterior y el chofer ya fue notificado.

**Solución implementada:**
- Cuando hay un viaje en estado `pending` y el pasajero envía `intent=trip_request` con una nueva dirección diferente:
  1. Se geocodifica la nueva dirección.
  2. Se actualiza `destination_address` / `destination_lat` / `destination_lng` en la tabla `trips`.
  3. Se envía push notification al chofer con la nueva dirección.
  4. Se confirma al pasajero el cambio.

---

### ✅ Caso 19 — Nombre de edificio o empresa como dirección
**Ejemplo:** "el edificio Suizo", "la oficina de Arcor", "Consultorio del Dr. Pérez"

**Problema:** Puede no estar en Google Maps o existir múltiples sucursales.

**Solución implementada:**
- `normalizeAddressPhrase()` preserva el nombre del lugar añadiendo `", Salta"`.
- `autocompleteAndGeocodeAddress()` busca en Places API y devuelve las opciones.
- Si hay 2+ candidatos → poll con opciones + "Ninguna de estas opciones".
- Si elige "Ninguna" → pide GPS o calle y número exacto.

---

### ✅ Caso 20 — Errores fonéticos / ortográficos en calles
**Ejemplo:** "Irigogien" → Yrigoyen, "Urquisa" → Urquiza, "Gemes" → Güemes, "Zubiri" → Zuviría, "espana" → España

**Solución implementada:**
- `applyPhoneticCorrections()` con tabla de patrones regex → reemplazo para las calles más comunes de Salta.
- Se aplica en `normalizeAddressPhrase()` antes de geocodificar.
- `normalizeAddressKey()` normaliza para comparación interna sin afectar el texto original del pasajero.

---

### ✅ Caso 21 — Número de teléfono embebido en la dirección
**Ejemplo:** "España 351-4567890", "Mitre 200 cel 1547891234"

**Problema:** El parser puede confundir la secuencia de dígitos del teléfono con el número de calle.

**Solución implementada:**
- `stripEmbeddedPhoneNumbers()` elimina:
  - `"cel/tel/wpp + secuencia larga"`.
  - `"número_calle-secuencia_larga"` → deja solo el número de calle (`"España 351"`).
  - Secuencias de 8+ dígitos standalone.
- Se aplica en `normalizeAddressPhrase()` como primer paso.

---

### ⏳ Caso 22 — Viajes programados / reservas futuras
**Ejemplo:** "para las 10", "para mañana a las 8", "reservar para el jueves"

**Problema:** El sistema solo gestiona pedidos inmediatos. No hay lógica de agenda ni cron de despacho futuro.

**Pendiente:** Definir modelo de datos (tabla `scheduled_trips`), cron de despacho y flujo de confirmación.

---

### ✅ Caso 23 — Nombre de persona confundido con calle
**Ejemplo:** "en lo de Juan", "en casa de mi hermana", "donde la Nelly"

**Problema:** No es una dirección geocodificable.

**Solución implementada:**
- Sistema prompt y heurísticas: si no se detecta `looksLikeAddressText()` → `pickup_location=null`.
- El bloque de `missing pickup_location` pide GPS o calle y número.
- `hydratePickupFromKnowledge()` puede resolver si "Juan" aparece asociado a una dirección en el historial.

---

### ✅ Caso 24 — "Mismo lugar de siempre" / "la de siempre" / "como siempre"
**Ejemplo:** "pasame a buscar al mismo lugar", "desde la de siempre", "en mi casa de siempre"

**Problema:** El pasajero asume que la remisería ya sabe la dirección.

**Solución implementada:**
- Se detecta la frase con regex antes de la lógica de `missing pickup_location`.
- Si hay historial para ese teléfono (`phoneAddresses.length > 0`), se envía poll con los últimos 3 puntos conocidos del pasajero + "Ninguna de estas opciones".
- Si elige "Ninguna" o no hay historial → pide GPS o calle y número.

---

## Casos pendientes — Resumen

| # | Descripción | Bloqueante | Próximo paso |
|---|---|---|---|
| 13 | Múltiples paradas en un mensaje | Diseño de modelo de datos y UX | Definir si se aceptan escalas o se toma primera + última |
| 17 | Dirección fuera del radio de Salta Capital | Definición de zona operativa | Agregar validación de bbox y mensaje de rechazo |
| 22 | Viajes programados / reservas futuras | Diseño de tabla `scheduled_trips` + cron | Definir flujo completo de agenda y despacho diferido |
