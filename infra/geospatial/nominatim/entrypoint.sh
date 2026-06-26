#!/bin/bash
set -euo pipefail

LISTEN_PORT="${PORT:-8080}"
DATA_DIR="/nominatim/data"
IMPORT_REGION="${IMPORT_REGION:-salta}"
SALTA_BBOX="${SALTA_BBOX:--68.75,-26.62,-62.00,-21.78}"
CAPITAL_BBOX="${CAPITAL_BBOX:--65.55,-24.90,-65.30,-24.70}"
USER_AGENT="${USER_AGENT:-ProfesionalApp-Nominatim/1.0 (contacto@profesional.app)}"
PG_TUNING_CONF="/etc/postgresql/16/main/conf.d/postgres-tuning.conf"
BACKEND_PORT="${NOMINATIM_BACKEND_PORT:-8081}"

region_pbf_path() {
  case "${IMPORT_REGION}" in
    capital) echo "${DATA_DIR}/salta-capital.osm.pbf" ;;
    *) echo "${DATA_DIR}/salta.osm.pbf" ;;
  esac
}

region_bbox() {
  case "${IMPORT_REGION}" in
    capital) echo "${CAPITAL_BBOX}" ;;
    *) echo "${SALTA_BBOX}" ;;
  esac
}

SALTA_PBF="$(region_pbf_path)"

MIRROR_BBBIKE="https://download3.bbbike.org/osm/pbf/region/south-america/argentina.osm.pbf"
MIRROR_GEOFABRIK="https://download.geofabrik.de/south-america/argentina-latest.osm.pbf"

echo "[nominatim] === Arranque $(date -u +%Y-%m-%dT%H:%M:%SZ) ==="
free -h 2>/dev/null || true
df -h / /var/lib/postgresql/16/main /nominatim 2>/dev/null || df -h

mkdir -p "${DATA_DIR}"

setup_postgres_data_dir() {
  local default_main="/var/lib/postgresql/16/main"
  local pgdata="${default_main}/postgres16"

  if mountpoint -q /pgdata 2>/dev/null; then
    pgdata="/pgdata/postgres16"
    echo "[nominatim] Volumen en /pgdata → ${pgdata}"
  elif [ -d "${default_main}/lost+found" ]; then
    echo "[nominatim] Volumen en ${default_main} (lost+found) → subdir ${pgdata}"
  elif mountpoint -q "${default_main}" 2>/dev/null; then
    echo "[nominatim] Volumen montado en ${default_main} → subdir ${pgdata}"
  else
    pgdata="${default_main}"
    echo "[nominatim] Sin volumen dedicado → ${pgdata}"
  fi

  mkdir -p "${pgdata}"
  chown -R postgres:postgres "${pgdata}" 2>/dev/null || true
  chmod 700 "${pgdata}" 2>/dev/null || true

  if ! grep -q "${pgdata}" /app/init.sh 2>/dev/null; then
    sed -i "s|/var/lib/postgresql/16/main|${pgdata}|g" /app/init.sh /app/start.sh
    if [ -f /etc/postgresql/16/main/postgresql.conf ]; then
      sed -i "s|/var/lib/postgresql/16/main|${pgdata}|g" /etc/postgresql/16/main/postgresql.conf
    fi
    echo "[nominatim] PostgreSQL data dir: ${pgdata}"
  fi
}

setup_postgres_data_dir

try_once() {
  local dest="$1"
  local url="$2"
  echo "[nominatim] Prueba rápida: ${url}"
  curl -fsSL -A "${USER_AGENT}" --connect-timeout 30 --max-time 7200 -o "${dest}" "${url}"
}

download_with_retries() {
  local dest="$1"
  shift
  local url attempt=1

  while [ "$attempt" -le 25 ]; do
    for url in "$@"; do
      [ -z "$url" ] && continue
      echo "[nominatim] Descarga intento ${attempt}: ${url}"
      if curl -fsSL -A "${USER_AGENT}" --connect-timeout 60 --max-time 7200 -C - -o "${dest}.part" "${url}"; then
        mv -f "${dest}.part" "${dest}"
        echo "[nominatim] OK: $(ls -lh "${dest}")"
        return 0
      fi
      rm -f "${dest}.part"
      echo "[nominatim] Falló: ${url}"
    done
    echo "[nominatim] Reintento en 60 s..."
    sleep 60
    attempt=$((attempt + 1))
  done

  echo "[nominatim] ERROR: no se pudo descargar el PBF"
  return 1
}

prepare_pbf() {
  local reextract_marker="${DATA_DIR}/.force-reextract-applied"

  if [ "${FORCE_REEXTRACT:-false}" = "true" ]; then
    if [ -f "${reextract_marker}" ] && [ -f "${SALTA_PBF}" ]; then
      echo "[nominatim] FORCE_REEXTRACT ya aplicado (${SALTA_PBF} existe). Desactivá FORCE_REEXTRACT en Railway."
    else
      echo "[nominatim] FORCE_REEXTRACT: eliminando PBF en caché (una sola vez)..."
      rm -f "${SALTA_PBF}" "${DATA_DIR}/argentina.osm.pbf" "${DATA_DIR}/argentina-latest.osm.pbf"
      rm -f "${reextract_marker}"
    fi
  fi

  if [ -n "${PBF_PATH:-}" ] && [ -f "${PBF_PATH}" ]; then
    echo "[nominatim] Usando PBF local: ${PBF_PATH}"
    return
  fi

  if [ -f "${SALTA_PBF}" ]; then
    export PBF_PATH="${SALTA_PBF}"
    unset PBF_URL
    echo "[nominatim] Reutilizando ${SALTA_PBF}"
    return
  fi

  if [ -n "${PBF_URL:-}" ]; then
    download_with_retries "${SALTA_PBF}" "${PBF_URL}"
    export PBF_PATH="${SALTA_PBF}"
    unset PBF_URL
    touch "${DATA_DIR}/.force-reextract-applied"
    return
  fi

  if [ -n "${GITHUB_SALTA_PBF_URL:-}" ]; then
    if try_once "${SALTA_PBF}" "${GITHUB_SALTA_PBF_URL}" 2>/dev/null; then
      export PBF_PATH="${SALTA_PBF}"
      unset PBF_URL
      touch "${DATA_DIR}/.force-reextract-applied"
      echo "[nominatim] Usando Release de GitHub"
      return
    fi
    rm -f "${SALTA_PBF}"
    echo "[nominatim] Release de GitHub no disponible, usando mirrors..."
  fi

  local argentina="${DATA_DIR}/argentina.osm.pbf"
  local mirrors=()
  if [ -n "${PBF_SOURCE_URL:-}" ]; then
    mirrors+=("${PBF_SOURCE_URL}")
  fi
  mirrors+=("${MIRROR_BBBIKE}" "${MIRROR_GEOFABRIK}")
  download_with_retries "${argentina}" "${mirrors[@]}"

  echo "[nominatim] Extrayendo ${IMPORT_REGION} (bbox $(region_bbox))..."
  osmium extract -b "$(region_bbox)" "${argentina}" -o "${SALTA_PBF}" --overwrite
  touch "${DATA_DIR}/.force-reextract-applied"
  if [ "${KEEP_ARGENTINA_PBF:-false}" != "true" ]; then
    rm -f "${argentina}"
  fi
  export PBF_PATH="${SALTA_PBF}"
  unset PBF_URL
}

postgres_has_data() {
  for dir in /var/lib/postgresql/16/main/postgres16 /pgdata/postgres16 /var/lib/postgresql/16/main; do
    if [ -d "${dir}/base" ] && [ -n "$(ls -A "${dir}/base" 2>/dev/null || true)" ]; then
      return 0
    fi
  done
  return 1
}

configure_postgres_memory() {
  export GUNICORN_WORKERS="1"
  export WARMUP_ON_STARTUP="false"

  if postgres_has_data && [ "${FORCE_REIMPORT:-false}" != "true" ]; then
    echo "[nominatim] Base existente: perfil PostgreSQL mínimo (runtime ~1 GB)."
    export POSTGRES_SHARED_BUFFERS="128MB"
    export POSTGRES_MAINTENANCE_WORK_MEM="64MB"
    export POSTGRES_AUTOVACUUM_WORK_MEM="32MB"
    export POSTGRES_WORK_MEM="8MB"
    export POSTGRES_EFFECTIVE_CACHE_SIZE="384MB"
    export POSTGRES_MAX_CONNECTIONS="20"
    export THREADS="1"
    patch_postgres_tuning_conf
  else
    echo "[nominatim] Importación pendiente: perfil PostgreSQL moderado."
    export POSTGRES_SHARED_BUFFERS="512MB"
    export POSTGRES_MAINTENANCE_WORK_MEM="512MB"
    export POSTGRES_AUTOVACUUM_WORK_MEM="128MB"
    export POSTGRES_WORK_MEM="32MB"
    export POSTGRES_EFFECTIVE_CACHE_SIZE="1536MB"
    export POSTGRES_MAX_CONNECTIONS="30"
    export THREADS="2"
  fi
}

patch_postgres_tuning_conf() {
  [ -f "${PG_TUNING_CONF}" ] || return 0
  sed -i \
    -e 's/^shared_buffers = .*/shared_buffers = 128MB/' \
    -e 's/^maintenance_work_mem = .*/maintenance_work_mem = 64MB/' \
    -e 's/^autovacuum_work_mem = .*/autovacuum_work_mem = 32MB/' \
    -e 's/^work_mem = .*/work_mem = 8MB/' \
    -e 's/^effective_cache_size = .*/effective_cache_size = 384MB/' \
    -e 's/^max_connections = .*/max_connections = 20/' \
    "${PG_TUNING_CONF}" 2>/dev/null || true
  echo "[nominatim] ${PG_TUNING_CONF} actualizado para bajo consumo."
}

prepare_pbf
configure_postgres_memory

REIMPORT_MARKER="${DATA_DIR}/.force-reimport-applied"
if [ "${FORCE_REIMPORT:-false}" = "true" ]; then
  if [ -f "${REIMPORT_MARKER}" ]; then
    echo "[nominatim] FORCE_REIMPORT ya ejecutado. Desactivá FORCE_REIMPORT en Railway o borrá ${REIMPORT_MARKER}."
  else
    echo "[nominatim] FORCE_REIMPORT: eliminando base PostgreSQL (una sola vez)..."
    rm -rf /var/lib/postgresql/16/main/postgres16/* 2>/dev/null || true
    rm -rf /pgdata/postgres16/* 2>/dev/null || true
    touch "${REIMPORT_MARKER}"
  fi
fi

configure_bind_port() {
  local bind_target="$1"
  if [ -f /app/start.sh ]; then
    sed -i "s|--bind :8080|--bind ${bind_target}|" /app/start.sh
  fi
}

echo "[nominatim] PBF_PATH=${PBF_PATH:-}"

if [ "${CACHE_ENABLED:-true}" = "true" ]; then
  configure_bind_port "127.0.0.1:${BACKEND_PORT}"
  echo "[nominatim] Nominatim interno en 127.0.0.1:${BACKEND_PORT}; nginx con caché en puerto ${LISTEN_PORT}"
  /app/start.sh &

  NGINX_PORT="${LISTEN_PORT}" \
  BACKEND_PORT="${BACKEND_PORT}" \
  NGINX_MAIN_CONF=/etc/nginx/nginx.conf \
  NGINX_SITE_TEMPLATE=/etc/nginx/templates/site.conf.template \
  CACHE_DIR="${DATA_DIR}/nginx-cache" \
  HEALTH_URL="http://127.0.0.1:${BACKEND_PORT}/status" \
  WAIT_ITERATIONS=150 \
  exec /usr/local/bin/start-nginx-cache.sh nominatim
fi

configure_bind_port ":${LISTEN_PORT}"
echo "[nominatim] API sin caché HTTP en puerto ${LISTEN_PORT}"
exec /app/start.sh
