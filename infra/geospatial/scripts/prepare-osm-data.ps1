# Prepara salta.osm.pbf desde el extracto de Argentina (Geofabrik).
# Requiere Docker Desktop. Uso: .\prepare-osm-data.ps1 [-OutDir .\data]
param(
  [string]$OutDir = (Join-Path $PSScriptRoot "..\data"),
  [string]$ArgentinaUrl = "https://download.geofabrik.de/south-america/argentina-latest.osm.pbf",
  [string]$SaltaBbox = "-68.75,-26.62,-62.00,-21.78",
  [string]$OsmiumImage = "ghcr.io/osmcode/osmium-tool:latest"
)

$ErrorActionPreference = "Stop"
New-Item -ItemType Directory -Force -Path $OutDir | Out-Null

$argentinaPbf = Join-Path $OutDir "argentina-latest.osm.pbf"
$saltaPbf = Join-Path $OutDir "salta.osm.pbf"

if (-not (Test-Path $argentinaPbf)) {
  Write-Host "[prepare] Descargando Argentina desde Geofabrik..."
  curl.exe -fsSL -A "ProfesionalApp-OSM-Prepare/1.0" -C - -o $argentinaPbf $ArgentinaUrl
}

Write-Host "[prepare] Extrayendo provincia de Salta (bbox $SaltaBbox)..."
$outAbs = (Resolve-Path $OutDir).Path
docker run --rm -v "${outAbs}:/data" $OsmiumImage `
  extract -b $SaltaBbox /data/argentina-latest.osm.pbf -o /data/salta.osm.pbf --overwrite

Write-Host "[prepare] Listo: $saltaPbf"
Get-Item $saltaPbf | Format-List Name, Length, LastWriteTime

Write-Host ""
Write-Host "Siguiente paso: subir salta.osm.pbf al volumen de Railway o usar PBF_PATH=/data/salta.osm.pbf"
