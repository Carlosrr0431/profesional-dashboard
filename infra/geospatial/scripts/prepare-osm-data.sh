#!/usr/bin/env bash
# Prepara salta.osm.pbf desde el extracto de Argentina (Geofabrik).
# Requiere Docker. Uso: ./prepare-osm-data.sh [directorio_salida]
set -euo pipefail

OUT_DIR="${1:-./data}"
ARGENTINA_URL="${ARGENTINA_URL:-https://download.geofabrik.de/south-america/argentina-latest.osm.pbf}"
# Provincia de Salta (bbox aproximado: oeste,sur,este,norte)
SALTA_BBOX="${SALTA_BBOX:--68.75,-26.62,-62.00,-21.78}"
OSMIUM_IMAGE="${OSMIUM_IMAGE:-ghcr.io/osmcode/osmium-tool:latest}"

mkdir -p "${OUT_DIR}"
ARGENTINA_PBF="${OUT_DIR}/argentina-latest.osm.pbf"
SALTA_PBF="${OUT_DIR}/salta.osm.pbf"

if [ ! -f "${ARGENTINA_PBF}" ]; then
  echo "[prepare] Descargando Argentina desde Geofabrik..."
  curl -fsSL -A "ProfesionalApp-OSM-Prepare/1.0" -C - -o "${ARGENTINA_PBF}" "${ARGENTINA_URL}"
fi

echo "[prepare] Extrayendo provincia de Salta (bbox ${SALTA_BBOX})..."
docker run --rm -v "${OUT_DIR}:/data" "${OSMIUM_IMAGE}" \
  extract -b "${SALTA_BBOX}" /data/argentina-latest.osm.pbf -o /data/salta.osm.pbf --overwrite

echo "[prepare] Listo: ${SALTA_PBF}"
ls -lh "${SALTA_PBF}"

echo ""
echo "Siguiente paso: subir salta.osm.pbf al volumen de Railway o usar PBF_PATH=/data/salta.osm.pbf"
