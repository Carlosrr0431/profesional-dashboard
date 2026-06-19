# (Deprecado) Usar repos independientes

Los servicios geoespaciales viven en repositorios **separados** para Railway:

→ **[`railway-services/`](../railway-services/README.md)**

- [`profesional-osrm`](../railway-services/profesional-osrm/)
- [`profesional-nominatim`](../railway-services/profesional-nominatim/)

Cada uno se sube a su propio repo en GitHub y se conecta a Railway sin configurar Root Directory.

La carpeta `infra/geospatial/` conserva la infra activa y scripts de importación.

**Importar datos OSM:** ver [`IMPORT_OSM.md`](./IMPORT_OSM.md) — el PBF `argentina-260618.osm.pbf` ya está en `data/`.
