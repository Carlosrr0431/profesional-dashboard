#!/bin/bash
set -euo pipefail

LISTEN_PORT="${PORT:-8080}"
DATA_DIR="/nominatim/data"
SALTA_PBF="${DATA_DIR}/salta.osm.pbf"
PBF_SOURCE_URL="${PBF_SOURCE_URL:-https://download.geofabrik.de/south-america/argentina-latest.osm.pbf}"
SALTA_BBOX="${SALTA_BBOX:--68.75,-26.62,-62.00,-21.78}"
USER_AGENT="${USER_AGENT:-ProfesionalApp-Nominatim-Setup/1.0}"

mkdir -p "${DATA_DIR}"

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
    echo "[nominatim] Descargando Argentina desde Geofabrik..."
    curl -fsSL -A "${USER_AGENT}" -o "${dest}" "${PBF_SOURCE_URL}"
  fi
  echo "${dest}"
}

prepare_pbf() {
  if [ -n "${PBF_PATH:-}" ] && [ -f "${PBF_PATH}" ]; then
    echo "[nominatim] Usando PBF local: ${PBF_PATH}"
    return
  fi

  if [ -n "${PBF_URL:-}" ]; then
    echo "[nominatim] PBF_URL definido, lo usará init.sh"
    return
  fi

  if [ "${IMPORT_REGION:-salta}" = "argentina" ] || [ "${SALTA_EXTRACT:-true}" = "false" ]; then
    local argentina
    argentina="$(resolve_argentina_pbf)"
    export PBF_PATH="${argentina}"
    unset PBF_URL
    echo "[nominatim] Importando Argentina completa desde ${argentina}"
    echo "[nominatim] POIs: hospitales, restaurantes, comercios de todo el país."
    return
  fi

  if [ -f "${SALTA_PBF}" ] && [ "${FORCE_REEXTRACT:-false}" != "true" ]; then
    export PBF_PATH="${SALTA_PBF}"
    unset PBF_URL
    echo "[nominatim] Reutilizando ${SALTA_PBF}"
    return
  fi

  local argentina
  argentina="$(resolve_argentina_pbf)"
  echo "[nominatim] Extrayendo provincia de Salta (bbox ${SALTA_BBOX}) desde ${argentina}..."
  osmium extract -b "${SALTA_BBOX}" "${argentina}" -o "${SALTA_PBF}" --overwrite
  if [ "${KEEP_ARGENTINA_PBF:-true}" != "true" ]; then
    rm -f "${argentina}"
  fi
  export PBF_PATH="${SALTA_PBF}"
  unset PBF_URL
}

prepare_pbf

if [ -f /app/start.sh ]; then
  sed -i "s/--bind :8080/--bind :${LISTEN_PORT}/" /app/start.sh
fi

echo "[nominatim] API en puerto ${LISTEN_PORT}"
exec /app/start.sh
