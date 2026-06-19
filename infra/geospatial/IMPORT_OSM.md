# Importar datos OSM de Argentina (hospitales, restaurantes, direcciones)

Tu archivo `argentina-260618.osm.pbf` (~401 MB) ya está copiado en:

```
infra/geospatial/data/argentina-260618.osm.pbf
```

Contiene **todo OpenStreetMap de Argentina**: calles, hospitales, restaurantes, comercios, etc.

## Qué hace cada servicio

| Servicio | Qué indexa del PBF |
|----------|-------------------|
| **Nominatim** | Direcciones + POIs (hospitales, restaurantes, bancos, etc.) |
| **OSRM** | Solo red vial (rutas de manejo) |
| **Tiles OSM** | Mapa visual (OpenFreeMap / tiles externos) |

Para buscar lugares en la app hoy usamos **híbrido**: calle+altura → Nominatim, POIs → TomTom.  
Con Nominatim actualizado, los POIs de Salta que existan en OSM también aparecerán sin TomTom.

## Requisito: Docker Desktop

En esta PC Docker no está instalado. Instalá [Docker Desktop](https://www.docker.com/products/docker-desktop/) y luego:

```powershell
cd infra\geospatial\scripts
.\import-osm-stack.ps1
```

Eso hace automáticamente:

1. Extrae **provincia de Salta** desde tu PBF (recomendado para Railway)
2. Construye el grafo OSRM
3. Levanta OSRM (`:5000`) y Nominatim (`:8080`)

La primera importación de Nominatim tarda **30–90 minutos** (Salta).

## Modos de extracto

```powershell
# Salta provincia (recomendado — cabe en Railway)
.\prepare-osm-data.ps1 -ExtractMode salta

# Solo Salta Capital (más chico, menos POIs del interior)
.\prepare-osm-data.ps1 -ExtractMode capital

# Argentina completa (todos los POIs del país)
.\prepare-osm-data.ps1 -ExtractMode argentina
```

### Argentina completa — recursos mínimos

| Servicio | RAM import | Disco |
|----------|-----------|-------|
| Nominatim Salta | 4–8 GB | ~15 GB |
| Nominatim Argentina | **32+ GB** | **80+ GB** |
| OSRM Salta | 2–4 GB | ~2 GB |
| OSRM Argentina | 8–16 GB | ~8 GB |

**Railway no alcanza para Nominatim Argentina completa.** Usá Salta en producción o un VPS dedicado (Hetzner, OVH, etc.).

## Desplegar en Railway

### 1. Subir el PBF al volumen

Montá un volumen en `/data` (OSRM) y `/nominatim/data` (Nominatim).

Subí estos archivos (vía Railway CLI, SFTP o prepará `salta.osm.pbf` localmente con Docker):

- `argentina-260618.osm.pbf` → el servicio extrae Salta al arrancar
- **o** `salta.osm.pbf` ya extraído (más rápido)

### 2. Variables Nominatim

```env
NOMINATIM_PASSWORD=tu-secreto
PBF_SOURCE_PATH=/nominatim/data/argentina-260618.osm.pbf
IMPORT_REGION=salta
KEEP_ARGENTINA_PBF=true
THREADS=2
FREEZE=true
```

Para forzar re-import con datos nuevos: borrá la base PostgreSQL del volumen y redeploy.

### 3. Variables OSRM

```env
PBF_SOURCE_PATH=/data/argentina-260618.osm.pbf
IMPORT_REGION=salta
KEEP_ARGENTINA_PBF=true
```

Si ya tenés el grafo pre-procesado (`salta.osrm*`), subilo al volumen y el arranque es instantáneo.

### 4. Argentina completa (solo VPS grande)

```env
IMPORT_REGION=argentina
SALTA_EXTRACT=false
THREADS=4
```

## Probar POIs después de importar

```bash
# Hospital
curl "http://localhost:8080/search?q=hospital+salta&format=jsonv2&limit=5"

# Restaurante
curl "http://localhost:8080/search?q=restaurante+salta&format=jsonv2&limit=5"

# Dirección
curl "http://localhost:8080/search?q=mitre+300+salta&format=jsonv2&limit=5"
```

## Actualizar datos en el futuro

1. Descargá un PBF nuevo de [Geofabrik Argentina](https://download.geofabrik.de/south-america/argentina.html)
2. Reemplazá `data/argentina-260618.osm.pbf`
3. Volvé a correr `import-osm-stack.ps1`
4. En Railway: borrá volúmenes de DB y redeploy
