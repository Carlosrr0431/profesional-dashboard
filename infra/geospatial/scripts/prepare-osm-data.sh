#!/bin/bash
# Prepara extractos OSM desde un PBF de Argentina (local o Geofabrik).
set -euo pipefail

OUT_DIR="${1:-$(cd "$(dirname "$0")/../data" && pwd)}"
SOURCE_PBF="${SOURCE_PBF:-}"
EXTRACT_MODE="${EXTRACT_MODE:-salta}"
ARGENTINA_URL="${ARGENTINA_URL:-https://download.geofabrik.de/south-america/argentina-latest.osm.pbf}"
SALTA_BBOX="${SALTA_BBOX:--68.75,-26.62,-62.00,-21.78}"
CAPITAL_BBOX="${CAPITAL_BBOX:--65.55,-24.90,-65.30,-24.70}"
OSMIUM_IMAGE="${OSMIUM_IMAGE:-ghcr.io/osmcode/osmium-tool:latest}"

mkdir -p "${OUT_DIR}"

DEFAULT_LOCAL="${OUT_DIR}/argentina-260618.osm.pbf"
if [ -n "${SOURCE_PBF}" ] && [ -f "${SOURCE_PBF}" ]; then
  ARGENTINA_PBF="${SOURCE_PBF}"
elif [ -f "${DEFAULT_LOCAL}" ]; then
  ARGENTINA_PBF="${DEFAULT_LOCAL}"
else
  ARGENTINA_PBF="${OUT_DIR}/argentina-latest.osm.pbf"
fi

SALTA_PBF="${OUT_DIR}/salta.osm.pbf"
CAPITAL_PBF="${OUT_DIR}/salta-capital.osm.pbf"
ARGENTINA_FULL="${OUT_DIR}/argentina.osm.pbf"

if [ ! -f "${ARGENTINA_PBF}" ]; then
  echo "[prepare] Descargando Argentina desde Geofabrik..."
  curl -fsSL -A "ProfesionalApp-OSM-Prepare/1.0" -o "${ARGENTINA_PBF}" "${ARGENTINA_URL}"
fi

case "${EXTRACT_MODE}" in
  argentina)
    echo "[prepare] Copiando Argentina completa..."
    cp -f "${ARGENTINA_PBF}" "${ARGENTINA_FULL}"
    ls -lh "${ARGENTINA_FULL}"
    echo "ATENCIÓN: Nominatim Argentina completa requiere ~32 GB RAM."
    ;;
  capital)
    echo "[prepare] Extrayendo Salta Capital (bbox ${CAPITAL_BBOX})..."
    docker run --rm -v "${OUT_DIR}:/data" "${OSMIUM_IMAGE}" \
      extract -b "${CAPITAL_BBOX}" "/data/$(basename "${ARGENTINA_PBF}")" -o /data/salta-capital.osm.pbf --overwrite
    ls -lh "${CAPITAL_PBF}"
    ;;
  *)
    echo "[prepare] Extrayendo provincia de Salta (bbox ${SALTA_BBOX})..."
    docker run --rm -v "${OUT_DIR}:/data" "${OSMIUM_IMAGE}" \
      extract -b "${SALTA_BBOX}" "/data/$(basename "${ARGENTINA_PBF}")" -o /data/salta.osm.pbf --overwrite
    ls -lh "${SALTA_PBF}"
    ;;
esac

echo "[prepare] Listo."
