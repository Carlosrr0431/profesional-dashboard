# Procesa salta.osm.pbf localmente en grafo OSRM (evita OOM en Railway).
param(
  [string]$DataDir = (Join-Path $PSScriptRoot "..\data"),
  [string]$MapName = "salta",
  [string]$OsrmImage = "ghcr.io/project-osrm/osrm-backend:latest"
)

$ErrorActionPreference = "Stop"
$pbf = Join-Path $DataDir "$MapName.osm.pbf"
if (-not (Test-Path $pbf)) {
  throw "No existe $pbf. Ejecutá prepare-osm-data.ps1 primero."
}

$dataAbs = (Resolve-Path $DataDir).Path

Write-Host "[osrm-build] Extrayendo grafo..."
docker run --rm -v "${dataAbs}:/data" $OsrmImage osrm-extract -p /opt/car.lua "/data/$MapName.osm.pbf"

Write-Host "[osrm-build] Particionando..."
docker run --rm -v "${dataAbs}:/data" $OsrmImage osrm-partition "/data/$MapName.osrm"

Write-Host "[osrm-build] Personalizando (MLD)..."
docker run --rm -v "${dataAbs}:/data" $OsrmImage osrm-customize "/data/$MapName.osrm"

Write-Host "[osrm-build] Grafo listo en $DataDir\$MapName.osrm*"
Get-ChildItem $DataDir -Filter "$MapName.osrm*" | Format-Table Name, Length
