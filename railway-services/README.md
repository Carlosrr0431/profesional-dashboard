# Servicios Railway — ProfesionalApp

Dos repositorios **independientes** para desplegar en Railway. Cada uno es un proyecto Git separado.

| Repo | Carpeta local | Función |
|------|---------------|---------|
| `profesional-osrm` | `profesional-osrm/` | Rutas OSRM |
| `profesional-nominatim` | `profesional-nominatim/` | Geocodificación Nominatim |

## Por qué repos separados

- En Railway: **un repo = un servicio**, sin configurar Root Directory
- Deploys y logs independientes
- No mezcla infraestructura con driver-app / dashboard
- Volúmenes y RAM distintos por servicio

## Subir a GitHub

En cada carpeta:

```powershell
cd profesional-osrm   # o profesional-nominatim
git init -b main
git add .
git commit -m "Servicio OSRM para ProfesionalApp (Salta)"
git remote add origin https://github.com/TU-USUARIO/profesional-osrm.git
git push -u origin main
```

Repetí con `profesional-nominatim` y su propio repo en GitHub.

## Conectar en Railway

1. Proyecto Railway (podés usar uno solo con 2 servicios)
2. **Add Service** → GitHub → `profesional-osrm`
3. **Add Service** → GitHub → `profesional-nominatim`
4. Volúmenes y dominios según cada README

## driver-app

```env
EXPO_PUBLIC_OSRM_URL=https://osrm-xxx.up.railway.app
EXPO_PUBLIC_NOMINATIM_URL=https://nominatim-xxx.up.railway.app
EXPO_PUBLIC_NOMINATIM_SELF_HOSTED=true
```
