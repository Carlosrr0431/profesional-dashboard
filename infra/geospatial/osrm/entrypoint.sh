#!/bin/bash
set -euo pipefail

DATA_DIR="${DATA_DIR:-/data}"
MAP_NAME="${MAP_NAME:-salta}"
PBF_FILE="${DATA_DIR}/${MAP_NAME}.osm.pbf"
OSRM_BASE="${DATA_DIR}/${MAP_NAME}.osrm"
PORT="${PORT:-5000}"
PBF_SOURCE_URL="${PBF_SOURCE_URL:-https://download.geofabrik.de/south-america/argentina-latest.osm.pbf}"
SALTA_BBOX="${SALTA_BBOX:--68.75,-26.62,-62.00,-21.78}"
USER_AGENT="${USER_AGENT:-ProfesionalApp-OSRM-Setup/1.0}"

mkdir -p "${DATA_DIR}"

osrm_ready() {
  [ -f "${OSRM_BASE}" ] \
    || [ -f "${OSRM_BASE}.hsgr" ] \
    || [ -f "${OSRM_BASE}.cells" ]
}

resolve_argentina_pbf() {
  if [ -n "${PBF_SOURCE_PATH:-}" ] && [ -f "${PBF_SOURCE_PATH}" ]; then
    echo "${PBF_SOURCE_PATH}"
    return
  fi

  for candidate in \
    "${DATA_DIR}/argentina-260618.osm.pbf" \
    "${DATA_DIR}/argentina-latest.osm.pbf"; do
    if [ -f "${candidate}" ]; then
      echo "${candidate}"
      return
    fi
  done

  local dest="${DATA_DIR}/argentina-latest.osm.pbf"
  if [ ! -f "${dest}" ]; then
    echo "[osrm] Descargando Argentina desde Geofabrik..."
    curl -fsSL -A "${USER_AGENT}" -o "${dest}" "${PBF_SOURCE_URL}"
  fi
  echo "${dest}"
}

prepare_pbf() {
  if [ -n "${PBF_PATH:-}" ] && [ -f "${PBF_PATH}" ]; then
    echo "[osrm] Usando PBF local: ${PBF_PATH}"
    cp -f "${PBF_PATH}" "${PBF_FILE}"
    return
  fi

  if [ -n "${PBF_URL:-}" ]; then
    echo "[osrm] Descargando PBF desde ${PBF_URL}..."
    curl -fsSL -A "${USER_AGENT}" -o "${PBF_FILE}" "${PBF_URL}"
    return
  fi

  if [ "${IMPORT_REGION:-salta}" = "argentina" ] || [ "${SALTA_EXTRACT:-true}" = "false" ]; then
    local argentina
    argentina="$(resolve_argentina_pbf)"
    echo "[osrm] Usando Argentina completa: ${argentina}"
    cp -f "${argentina}" "${PBF_FILE}"
    return
  fi

  local argentina
  argentina="$(resolve_argentina_pbf)"
  echo "[osrm] Extrayendo provincia de Salta (bbox ${SALTA_BBOX}) desde ${argentina}..."
  osmium extract -b "${SALTA_BBOX}" "${argentina}" -o "${PBF_FILE}" --overwrite
  if [ "${KEEP_ARGENTINA_PBF:-true}" != "true" ]; then
    rm -f "${argentina}"
  fi
}

if ! osrm_ready; then
  prepare_pbf

  echo "[osrm] Procesando grafo OSRM (primer arranque: puede tardar 10-30 min)..."
  osrm-extract -p /opt/car.lua "${PBF_FILE}"
  osrm-partition "${OSRM_BASE}"
  osrm-customize "${OSRM_BASE}"

  if [ "${KEEP_PBF:-false}" != "true" ]; then
    rm -f "${PBF_FILE}"
  fi
else
  echo "[osrm] Grafo existente en ${DATA_DIR}, omitiendo procesamiento."
fi

echo "[osrm] Servidor listo en puerto ${PORT}"
exec osrm-routed --algorithm mld --port "${PORT}" "${OSRM_BASE}"
