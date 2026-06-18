# Geocodificacion y resolucion de direcciones

## 1) Objetivo

Transformar texto ambiguo de WhatsApp en coordenadas utilizables para dispatch, maximizando precision y minimizando falsos positivos.

## 2) Componentes clave

Archivo principal: `profesional-dashboard/app/api/Agente_IA/route.js`.

Funciones principales:

- `scoreGeocodeResult`
- `requiresGpsForAddress`
- `geocodeAddress`
- `geocodeAddressMultiple`
- `autocompleteAndGeocodeAddress`
- `nominatimGeocodeAddress`
- `getAddressCandidates`
- `reverseGeocodeLatLng`
- `scoreReverseGeocodeResult`

## 3) Flujo de geocodificacion (pickup)

1. Normaliza y genera variantes del texto.
2. Consulta Google Geocoding por variante.
3. Puntua cada resultado (`scoreGeocodeResult`).
4. Elige candidato con mayor score si supera umbral.
5. Si no hay confianza suficiente, pide direccion mas precisa o GPS.

Antes de geocodificar, el pipeline mezcla IA + heuristicas deterministicas para extraer
pickup/destino sin depender 100% del modelo. Esto reduce errores cuando el JSON de IA
llega parcial o ambiguo.

Funciones relacionadas:

- `extractTripIntent`
- `extractSimpleTripPattern`
- `extractAddressFromRequest`
- `inferAddressHeuristic`

## 4) Scoring de resultados

`scoreGeocodeResult` combina:

- overlap de tokens de texto,
- tipo de geometria (`ROOFTOP`, `RANGE_INTERPOLATED`, etc),
- match de numeros de puerta,
- presencia de componentes (`street_number`, `route`),
- tipo de resultado (`street_address`, `intersection`),
- penalizacion por `partial_match`,
- penalizacion fuerte si no hay match semantico real.

## 5) Casos forzados a GPS

`requiresGpsForAddress` marca como `required=true`:

- pasaje / callejon,
- manzana-lote (nomenclatura catastral),
- referencias por km de ruta.

Objetivo: evitar geocodificaciones engañosas y pedir ubicacion precisa cuando corresponde.

## 6) Candidatos multi-fuente

`getAddressCandidates` fusiona resultados de:

- `geocodeAddressMultiple` (Google Geocoding),
- `autocompleteAndGeocodeAddress` (Google Places + place_id),
- `nominatimGeocodeAddress` (OSM/Nominatim).

Luego deduplica por direccion y cercania geografica aproximada, ordena por score y recorta por limite.

Adicionalmente, `geocodeAddress` carga y usa variantes enriquecidas de calles de Salta
(`loadSaltaStreetCatalog` + `buildAddressVariants`) para resolver mejor abreviaciones,
errores de tipeo y direcciones historicamente conflictivas.

## 7) Reverse geocoding

`reverseGeocodeLatLng` hace dos pasadas:

1. Paso preciso (`street_address` + `ROOFTOP|RANGE_INTERPOLATED`).
2. Paso general con score (`scoreReverseGeocodeResult`) como fallback.

Esto prioriza direccion de puerta cuando existe.

## 8) Riesgos criticos

1. Falso positivo de direccion por coincidencia parcial.
2. Ambiguedad de calle homonima en barrios distintos.
3. POI conocido sin numero exacto.
4. Coordenada valida pero fuera de zona de servicio.

## 9) Puntos de prueba recomendados

1. Calle + numero exacto (feliz).
2. Calle sin numero (debe pedir altura).
3. Texto con manzana/lote (debe pedir GPS).
4. Direccion ambigua con varias coincidencias (poll o desambiguacion).
5. Coordenada enviada por WhatsApp sin `address` en payload (reverse geocode fallback).
6. Direccion fuera de zona de cobertura (debe cancelar con mensaje claro).

## 10) Mejoras futuras

1. Persistir score final y fuente usada por direccion para auditoria.
2. Feedback loop: marcar direcciones que terminaron en cancelacion por mala geocodificacion.
3. Ajustar pesos por barrio/zona segun performance historica.
4. Cache por texto normalizado con TTL corto para reducir latencia.

## 11) Referencia funcional obligatoria

Antes de tocar reglas de direccion, revisar `ADDRESS_CASES.md` para validar impacto en
los casos ambiguos ya catalogados.
