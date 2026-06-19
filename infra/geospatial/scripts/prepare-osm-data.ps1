# Prepara extractos OSM desde un PBF de Argentina (local o Geofabrik).
# Requiere Docker Desktop.
#
# Uso:
#   .\prepare-osm-data.ps1
#   .\prepare-osm-data.ps1 -SourcePbf "C:\Users\User\Downloads\argentina-260618.osm.pbf"
#   .\prepare-osm-data.ps1 -ExtractMode argentina   # país completo (Nominatim/OSRM pesados)
param(
  [string]$OutDir = (Join-Path $PSScriptRoot "..\data"),
  [string]$SourcePbf = "",
  [ValidateSet("salta", "capital", "argentina")]
  [string]$ExtractMode = "salta",
  [string]$ArgentinaUrl = "https://download.geofabrik.de/south-america/argentina-latest.osm.pbf",
  [string]$SaltaBbox = "-68.75,-26.62,-62.00,-21.78",
  [string]$CapitalBbox = "-65.55,-24.90,-65.30,-24.70",
  [string]$OsmiumImage = "ghcr.io/osmcode/osmium-tool:latest"
)

$ErrorActionPreference = "Stop"
New-Item -ItemType Directory -Force -Path $OutDir | Out-Null

$defaultLocal = Join-Path $OutDir "argentina-260618.osm.pbf"
$argentinaPbf = if ($SourcePbf) { $SourcePbf } elseif (Test-Path $defaultLocal) { $defaultLocal } else { Join-Path $OutDir "argentina-latest.osm.pbf" }
$saltaPbf = Join-Path $OutDir "salta.osm.pbf"
$capitalPbf = Join-Path $OutDir "salta-capital.osm.pbf"
$argentinaFullPbf = Join-Path $OutDir "argentina.osm.pbf"

if (-not (Test-Path $argentinaPbf)) {
  Write-Host "[prepare] No hay PBF local. Descargando Argentina desde Geofabrik..."
  curl.exe -fsSL -A "ProfesionalApp-OSM-Prepare/1.0" -C - -o $argentinaPbf $ArgentinaUrl
}

switch ($ExtractMode) {
  "argentina" {
    Write-Host "[prepare] Copiando Argentina completa (hospitales, restaurantes, POIs de todo el país)..."
    Copy-Item $argentinaPbf $argentinaFullPbf -Force
    Write-Host "[prepare] Listo: $argentinaFullPbf"
    Get-Item $argentinaFullPbf | Format-List Name, @{N='SizeMB';E={[math]::Round($_.Length/1MB,1)}}, LastWriteTime
    Write-Host ""
    Write-Host "ATENCIÓN: importar Argentina completa en Nominatim requiere ~32 GB RAM y ~80 GB disco."
    Write-Host "Para ProfesionalApp (Salta) usá -ExtractMode salta en Railway."
    exit 0
  }
  "capital" {
    Write-Host "[prepare] Extrayendo Salta Capital (bbox $CapitalBbox)..."
    $outAbs = (Resolve-Path $OutDir).Path
    $srcName = Split-Path $argentinaPbf -Leaf
    docker run --rm -v "${outAbs}:/data" $OsmiumImage `
      extract -b $CapitalBbox "/data/$srcName" -o /data/salta-capital.osm.pbf --overwrite
    Write-Host "[prepare] Listo: $capitalPbf"
    Get-Item $capitalPbf | Format-List Name, @{N='SizeMB';E={[math]::Round($_.Length/1MB,1)}}, LastWriteTime
    exit 0
  }
  default {
    Write-Host "[prepare] Extrayendo provincia de Salta (bbox $SaltaBbox) desde $argentinaPbf ..."
    $outAbs = (Resolve-Path $OutDir).Path
    $srcName = Split-Path $argentinaPbf -Leaf
    docker run --rm -v "${outAbs}:/data" $OsmiumImage `
      extract -b $SaltaBbox "/data/$srcName" -o /data/salta.osm.pbf --overwrite
    Write-Host "[prepare] Listo: $saltaPbf"
    Get-Item $saltaPbf | Format-List Name, @{N='SizeMB';E={[math]::Round($_.Length/1MB,1)}}, LastWriteTime
  }
}

Write-Host ""
Write-Host "Siguiente paso:"
Write-Host "  1. .\build-osrm-graph.ps1"
Write-Host "  2. docker compose up -d   (en infra/geospatial)"
Write-Host "  O subí salta.osm.pbf al volumen de Railway (Nominatim + OSRM)."
