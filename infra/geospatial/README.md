# (Deprecado) Usar repos independientes

Los servicios geoespaciales viven en repositorios **separados** para Railway:

→ **[`railway-services/`](../railway-services/README.md)**

- [`profesional-osrm`](../railway-services/profesional-osrm/)
- [`profesional-nominatim`](../railway-services/profesional-nominatim/)

Cada uno se sube a su propio repo en GitHub y se conecta a Railway sin configurar Root Directory.

La carpeta `infra/geospatial/` conserva una copia anterior por compatibilidad; la versión activa es `railway-services/`.
