# Servicios Railway — ProfesionalApp

Dos repositorios **independientes** para desplegar en Railway. Cada uno es un proyecto Git separado.

| Repo | Carpeta local | Función | RAM runtime (tunado) |
|------|---------------|---------|----------------------|
| `profesional-osrm` | `infra/geospatial/osrm/` | Rutas OSRM + caché nginx | ~0.5–1 GB |
| `profesional-nominatim` | `infra/geospatial/nominatim/` | Geocodificación + caché nginx | ~0.8–1.5 GB |

**Optimización de costos:** ver [`infra/geospatial/RAILWAY_COST.md`](../infra/geospatial/RAILWAY_COST.md).

## Por qué repos separados

- En Railway: **un repo = un servicio**, sin configurar Root Directory
- Deploys y logs independientes
- Volúmenes y RAM distintos por servicio
- Serverless por servicio (recomendado con poco tráfico)

## Subir a GitHub

Copiá el contenido de cada carpeta a su repo y pusheá:

```powershell
# OSRM
cd infra\geospatial\osrm
git init -b main
git add .
git commit -m "Servicio OSRM para ProfesionalApp (Salta)"
git remote add origin https://github.com/TU-USUARIO/profesional-osrm.git
git push -u origin main

# Nominatim
cd ..\nominatim
git init -b main
git add .
git commit -m "Servicio Nominatim para ProfesionalApp (Salta)"
git remote add origin https://github.com/TU-USUARIO/profesional-nominatim.git
git push -u origin main
```

## Conectar en Railway

1. Proyecto Railway (podés usar uno solo con 2 servicios)
2. **Add Service** → GitHub → `profesional-osrm`
3. **Add Service** → GitHub → `profesional-nominatim`
4. Volúmenes: `/data` (OSRM), `/nominatim/data` + PostgreSQL (Nominatim)
5. **Activar Serverless** en ambos (Settings → Deploy)
6. Variables según `railway.env.example` de cada servicio

## driver-app / passenger-app

```env
EXPO_PUBLIC_OSRM_URL=https://osrm-xxx.up.railway.app
EXPO_PUBLIC_NOMINATIM_URL=https://nominatim-xxx.up.railway.app
EXPO_PUBLIC_NOMINATIM_SELF_HOSTED=true
```
