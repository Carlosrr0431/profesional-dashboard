# Pipeline completo: PBF Argentina → extracto Salta → grafo OSRM → stack local.
# Requiere Docker Desktop.
param(
  [string]$SourcePbf = "",
  [ValidateSet("salta", "capital", "argentina")]
  [string]$ExtractMode = "salta",
  [switch]$SkipCompose
)

$root = Split-Path $PSScriptRoot -Parent
$dataDir = Join-Path $root "data"

Write-Host "=== ProfesionalApp — importación OSM ===" -ForegroundColor Cyan
Write-Host "Fuente: $(if ($SourcePbf) { $SourcePbf } else { 'data/argentina-260618.osm.pbf o Geofabrik' })"
Write-Host "Modo: $ExtractMode"
Write-Host ""

$prepareArgs = @{
  OutDir = $dataDir
  ExtractMode = $ExtractMode
}
if ($SourcePbf) { $prepareArgs.SourcePbf = $SourcePbf }

& (Join-Path $PSScriptRoot "prepare-osm-data.ps1") @prepareArgs

if ($ExtractMode -eq "argentina") {
  $mapName = "argentina"
} elseif ($ExtractMode -eq "capital") {
  $mapName = "salta-capital"
} else {
  $mapName = "salta"
}

& (Join-Path $PSScriptRoot "build-osrm-graph.ps1") -DataDir $dataDir -MapName $mapName

if (-not $SkipCompose) {
  Write-Host ""
  Write-Host "[import] Levantando docker compose (OSRM :5000, Nominatim :8080)..."
  Push-Location $root
  try {
    $env:MAP_NAME = $mapName
    $env:PBF_FILE = "$mapName.osm.pbf"
    docker compose up -d --build
    Write-Host ""
    Write-Host "OSRM:      http://localhost:5000"
    Write-Host "Nominatim: http://localhost:8080"
    Write-Host "Primera importación Nominatim: puede tardar 30-90 min (Salta) o horas (Argentina)."
  } finally {
    Pop-Location
  }
}
