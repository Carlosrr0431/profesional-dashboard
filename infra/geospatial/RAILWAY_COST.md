# Optimización de costos en Railway — OSRM + Nominatim

Tu factura muestra que **~96% del costo es RAM** (no CPU ni egress). Eso es típico de Nominatim + OSRM corriendo 24/7 con PostgreSQL mal dimensionado.

## Diagnóstico

| Recurso | Tu factura | Causa probable |
|---------|-----------|----------------|
| Memory | ~$2.15 | Nominatim con defaults de PostgreSQL (2 GB `shared_buffers` + hasta 10 GB `maintenance_work_mem`) + OSRM con grafo en RAM |
| CPU | ~$0.07 | Bajo — pocas rutas/búsquedas |
| Volume | ~$0.02 | PBF + grafo + base PostgreSQL |

Con pocos viajes al día, pagás memoria de servidor dedicado aunque el servicio esté ocioso.

## Cambios aplicados en este repo

1. **PostgreSQL tunado** (`nominatim/entrypoint.sh`): perfil runtime ~256 MB shared_buffers vs 2 GB por defecto de la imagen mediagis.
2. **Caché HTTP en servidor** (nginx delante de OSRM y Nominatim): rutas y búsquedas repetidas no llegan al motor; menos CPU/RAM en PostgreSQL y OSRM.
3. **Límites de RAM** en `railway.toml` (`limitOverride.containers.memoryBytes`).
4. **`KEEP_ARGENTINA_PBF=false`**: borra el PBF de 400 MB del volumen tras extraer Salta.
5. **`OSRM_THREADS=1`**: menos picos de CPU/RAM en rutas.
6. **`IMPORT_REGION=capital`**: opción para indexar solo Salta Capital (~60% menos datos).

### Caché HTTP (nginx)

| Servicio | Rutas cacheadas | TTL | Tamaño máx. disco |
|----------|-----------------|-----|-------------------|
| OSRM | `GET /route/v1/*` | 60 min | 192 MB en `/data/nginx-cache` |
| Nominatim | `GET /search`, `/reverse`, `/lookup` | 4 h | 384 MB en `/nominatim/data/nginx-cache` |

- `/status` (healthcheck) **no** se cachea.
- Respuestas incluyen header `X-Cache-Status: HIT|MISS|BYPASS`.
- `proxy_cache_lock` evita tormentas cuando varios choferes piden la misma ruta a la vez.
- Desactivar: `CACHE_ENABLED=false` en Variables de Railway.
- La caché en el **celular** (driver-app) y la del **servidor** se complementan: el servidor ahorra cuando varios dispositivos repiten la misma consulta.

## Pasos en Railway (hacelos una vez)

### 1. Activar Serverless (mayor ahorro con poco tráfico)

En cada servicio → **Settings → Deploy → Serverless → Enable**.

- El contenedor duerme tras **10 min sin tráfico saliente**.
- La primera request tras dormir puede tardar unos segundos (cold start).
- OSRM y Nominatim con `FREEZE=true` no envían tráfico saliente → duermen bien.
- **No** programes pings/cron que llamen a los servicios si querés ahorrar.

Ahorro estimado con 2–4 h de uso real por día: **70–85%** en la línea de memoria.

### 2. Redeploy con la config nueva

Push de `infra/geospatial/osrm` y `infra/geospatial/nominatim` a los repos de Railway (`profesional-osrm`, `profesional-nominatim`).

### 3. Verificar región importada

En Variables de Nominatim:

```env
IMPORT_REGION=salta
```

Si **solo** operás en Salta Capital y querés mínima RAM:

```env
IMPORT_REGION=capital
```

Requiere borrar el volumen de PostgreSQL y redeploy (reimport ~20–40 min para capital).

### 4. Primera importación vs runtime

| Fase | Nominatim `memoryBytes` | OSRM `memoryBytes` |
|------|-------------------------|-------------------|
| Primera import Nominatim | `4294967296` (4 GB) | `1073741824` (1 GB) |
| Runtime normal | `2147483648` (2 GB) | `1073741824` (1 GB) |
| Rebuild grafo OSRM | `2147483648` (2 GB) | `2147483648` (2 GB) |

Editá `railway.toml` → redeploy → volvé a los valores de runtime.

## RAM esperada después de optimizar

| Servicio | Antes (defaults) | Después (tunado + límites) |
|----------|------------------|----------------------------|
| Nominatim Salta | 4–6 GB | 0.8–1.5 GB |
| Nominatim Capital | — | 0.4–0.8 GB |
| OSRM Salta | 1–2 GB | 0.3–0.8 GB |
| **Total 24/7** | **5–8 GB** | **1.5–2.5 GB** |
| **Con Serverless** | — | **proporcional al tiempo activo** |

## Alternativa si el tráfico sigue siendo muy bajo

Para &lt;50 búsquedas/día, evaluá:

- **Nominatim**: georef.gob.ar + Google Places (ya integrados en el dashboard) y apagar Nominatim en horario valle.
- **OSRM**: mantener solo OSRM (es el más liviano) y usar TomTom/Google Directions como fallback en apps.

No hace falta self-hostear ambos si el costo supera el de APIs comerciales con vuestro volumen.

## Monitoreo

Railway → cada servicio → **Metrics** → Memory.

Si ves OOM kills (restarts frecuentes), subí `memoryBytes` 512 MB y redeploy.
