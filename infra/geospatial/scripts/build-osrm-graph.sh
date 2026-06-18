#!/usr/bin/env bash
# Procesa salta.osm.pbf localmente en grafo OSRM (evita OOM en Railway en el primer deploy).
# Uso: ./build-osrm-graph.sh [directorio_con_salta.osm.pbf]
set -euo pipefail

DATA_DIR="${1:-./data}"
MAP_NAME="${MAP_NAME:-salta}"
OSRM_IMAGE="${OSRM_IMAGE:-ghcr.io/project-osrm/osrm-backend:latest}"

PBF="${DATA_DIR}/${MAP_NAME}.osm.pbf"
if [ ! -f "${PBF}" ]; then
  echo "ERROR: No existe ${PBF}. Ejecutá prepare-osm-data primero."
  exit 1
fi

echo "[osrm-build] Extrayendo grafo..."
docker run --rm -v "${DATA_DIR}:/data" "${OSRM_IMAGE}" \
  osrm-extract -p /opt/car.lua "/data/${MAP_NAME}.osm.pbf"

echo "[osrm-build] Particionando..."
docker run --rm -v "${DATA_DIR}:/data" "${OSRM_IMAGE}" \
  osrm-partition "/data/${MAP_NAME}.osrm"

echo "[osrm-build] Personalizando (MLD)..."
docker run --rm -v "${DATA_DIR}:/data" "${OSRM_IMAGE}" \
  osrm-customize "/data/${MAP_NAME}.osrm"

echo "[osrm-build] Grafo listo en ${DATA_DIR}/${MAP_NAME}.osrm*"
ls -lh "${DATA_DIR}/${MAP_NAME}.osrm"* 2>/dev/null || true
