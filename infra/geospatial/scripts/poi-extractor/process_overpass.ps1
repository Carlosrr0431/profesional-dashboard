# process_overpass.ps1
# Descarga POIs de Salta Capital desde Overpass API y genera JSON + CSV + JS

$BBOX   = "-24.90,-65.55,-24.68,-65.30"
$EP     = "https://overpass-api.de/api/interpreter"
$OutDir = $PSScriptRoot

# ── Consulta Overpass ────────────────────────────────────────────────────────
$query = @"
[out:json][timeout:90];
(
  node["amenity"~"hospital|clinic|pharmacy|restaurant|fast_food|cafe|bar|bank|atm|school|university|bus_station|fuel|police|fire_station|marketplace|theatre|cinema|place_of_worship|townhall|post_office|veterinary|dentist|doctors|kindergarten|library|community_centre|arts_centre|car_wash|laundry|social_facility|ice_cream"]($BBOX);
  way["amenity"~"hospital|university|bus_station|marketplace|theatre|school"]($BBOX);
  relation["amenity"~"hospital|university|marketplace"]($BBOX);
  node["shop"~"supermarket|hardware|convenience|electronics|clothes|bakery|butcher|car_repair|tyres|florist|hairdresser|beauty|optician|jewelry|sports|furniture|mobile_phone|stationery|travel_agency|car|greengrocer|shoes"]($BBOX);
  way["shop"~"supermarket|hardware|electronics|clothes"]($BBOX);
  node["tourism"~"hotel|hostel|motel|guest_house|museum|attraction|viewpoint|information|apartment"]($BBOX);
  way["tourism"~"hotel|museum|attraction"]($BBOX);
  node["leisure"~"stadium|park|fitness_centre|sports_centre|swimming_pool|golf_course|playground"]($BBOX);
  way["leisure"~"stadium|park|sports_centre|swimming_pool"]($BBOX);
  node["railway"="station"]($BBOX);
  node["aeroway"="aerodrome"]($BBOX);
  way["aeroway"="aerodrome"]($BBOX);
);
out center tags;
"@

Write-Host "Consultando Overpass API..." -ForegroundColor Cyan
$body   = "data=" + [uri]::EscapeDataString($query)
$raw    = curl.exe -sS -m 120 -X POST $EP `
            -H "Content-Type: application/x-www-form-urlencoded" `
            -H "User-Agent: ProfesionalApp-POI-Extractor/1.0" `
            -d $body

$data   = $raw | ConvertFrom-Json
$total  = $data.elements.Count
Write-Host "Elementos recibidos: $total" -ForegroundColor Green

# ── Procesar elementos ───────────────────────────────────────────────────────
$pois    = [System.Collections.Generic.List[hashtable]]::new()
$seenIds = [System.Collections.Generic.HashSet[string]]::new()

foreach ($el in $data.elements) {
    # Coordenadas
    if ($el.type -eq "node") {
        $lat = $el.lat
        $lon = $el.lon
    } else {
        $lat = $el.center.lat
        $lon = $el.center.lon
    }
    if (-not $lat -or -not $lon) { continue }

    # Nombre
    $tags = $el.tags
    $name = ""
    if ($tags.'name:es') { $name = $tags.'name:es' }
    elseif ($tags.name)  { $name = $tags.name }
    elseif ($tags.brand) { $name = $tags.brand }
    if (-not $name -or $name.Trim().Length -lt 2) { continue }
    $name = $name.Trim()

    # Deduplicar
    $id = "$($el.type)/$($el.id)"
    if ($seenIds.Contains($id)) { continue }
    [void]$seenIds.Add($id)

    # Tipo
    $type = "other"
    if ($tags.amenity)  { $type = $tags.amenity }
    elseif ($tags.shop)    { $type = "shop_$($tags.shop)" }
    elseif ($tags.tourism) { $type = "tourism_$($tags.tourism)" }
    elseif ($tags.leisure) { $type = "leisure_$($tags.leisure)" }
    elseif ($tags.railway) { $type = "railway_$($tags.railway)" }
    elseif ($tags.aeroway) { $type = "aeroway_$($tags.aeroway)" }

    # Dirección
    $addr = ""
    if ($tags.'addr:street') {
        $addr = $tags.'addr:street'
        if ($tags.'addr:housenumber') { $addr += " $($tags.'addr:housenumber')" }
    }

    # Teléfono / web
    $phone = ""
    if ($tags.phone)          { $phone = $tags.phone }
    elseif ($tags.'contact:phone') { $phone = $tags.'contact:phone' }
    $website = ""
    if ($tags.website)             { $website = $tags.website }
    elseif ($tags.'contact:website') { $website = $tags.'contact:website' }

    $pois.Add(@{
        osm_id        = $id
        name          = $name
        lat           = [math]::Round([double]$lat, 6)
        lng           = [math]::Round([double]$lon, 6)
        type          = $type
        address       = $addr
        phone         = $phone
        website       = $website
        opening_hours = if ($tags.opening_hours) { $tags.opening_hours } else { "" }
    })
}

Write-Host "POIs con nombre: $($pois.Count)" -ForegroundColor Green

# ── JSON ─────────────────────────────────────────────────────────────────────
$jsonPath = Join-Path $OutDir "salta_pois.json"
$pois | ConvertTo-Json -Depth 3 | Set-Content -Encoding UTF8 $jsonPath
Write-Host "JSON  -> $jsonPath" -ForegroundColor Yellow

# ── CSV ───────────────────────────────────────────────────────────────────────
$csvPath = Join-Path $OutDir "salta_pois.csv"
$sorted  = $pois | Sort-Object { $_['type'] }, { $_['name'] }
$header  = "type,name,lat,lng,address,phone,website,opening_hours,osm_id"
$lines   = [System.Collections.Generic.List[string]]::new()
$lines.Add($header)
foreach ($p in $sorted) {
    $row = @(
        $p['type'],
        ('"' + $p['name'] -replace '"','""' + '"'),
        $p['lat'],
        $p['lng'],
        ('"' + $p['address'] -replace '"','""' + '"'),
        $p['phone'],
        $p['website'],
        ('"' + $p['opening_hours'] -replace '"','""' + '"'),
        $p['osm_id']
    ) -join ","
    $lines.Add($row)
}
$lines | Set-Content -Encoding UTF8 $csvPath
Write-Host "CSV   -> $csvPath" -ForegroundColor Yellow

# ── Estadísticas ─────────────────────────────────────────────────────────────
Write-Host "`n── Conteo por tipo ─────────────────────────────────────────" -ForegroundColor Cyan
$pois | Group-Object { $_['type'] } |
    Sort-Object Count -Descending |
    ForEach-Object { Write-Host ("  {0,-35} {1}" -f $_.Name, $_.Count) }

Write-Host "`n✓ Completado. $($pois.Count) POIs guardados en $OutDir" -ForegroundColor Green
