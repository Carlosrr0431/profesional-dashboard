#!/usr/bin/env python3
"""
Extractor de POIs de Salta Capital desde OpenStreetMap via Overpass API.

Extrae: hospitales, restaurantes, ferreterías, farmacias, supermercados,
escuelas, universidades, bancos, hoteles, shoppings, parques, iglesias,
estaciones de servicio, y más de 40 categorías adicionales.

Output:
  - salta_pois.json       → todos los POIs con coords (lat, lng, nombre, tipo)
  - salta_pois.csv        → planilla para revisar en Excel
  - salta_known_pois.js   → entradas nuevas para agregar a shared/salta-known-pois.js

Uso:
  pip install requests
  python extract_salta_pois.py

  # Con proxy si Overpass está bloqueado:
  python extract_salta_pois.py --proxy http://proxy:8080

  # Solo categorías específicas:
  python extract_salta_pois.py --categories hospital,restaurant,pharmacy
"""

import argparse
import csv
import json
import time
import sys
import re
import unicodedata
from pathlib import Path

try:
    import requests
except ImportError:
    print("Falta el paquete 'requests'. Instalalo con: pip install requests")
    sys.exit(1)

# ─── Bounding box Salta Capital ────────────────────────────────────────────────
BBOX = {
    "south": -24.90,
    "west":  -65.55,
    "north": -24.68,
    "east":  -65.30,
}
# Formato Overpass: (south, west, north, east)
BBOX_STR = f"{BBOX['south']},{BBOX['west']},{BBOX['north']},{BBOX['east']}"

OVERPASS_ENDPOINTS = [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
    "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
]

# ─── Categorías a extraer ──────────────────────────────────────────────────────
# Formato: (osm_key, osm_value, etiqueta_humana)
CATEGORIES = [
    # Salud
    ("amenity", "hospital",          "Hospital"),
    ("amenity", "clinic",            "Clínica"),
    ("amenity", "doctors",           "Médico/Consultorio"),
    ("amenity", "dentist",           "Dentista"),
    ("amenity", "pharmacy",          "Farmacia"),
    ("amenity", "veterinary",        "Veterinaria"),
    # Educación
    ("amenity", "school",            "Escuela"),
    ("amenity", "university",        "Universidad"),
    ("amenity", "college",           "Instituto/Terciario"),
    ("amenity", "kindergarten",      "Jardín de infantes"),
    ("amenity", "library",           "Biblioteca"),
    # Comida y bebida
    ("amenity", "restaurant",        "Restaurante"),
    ("amenity", "fast_food",         "Comida rápida"),
    ("amenity", "cafe",              "Café"),
    ("amenity", "bar",               "Bar"),
    ("amenity", "pub",               "Pub"),
    ("amenity", "food_court",        "Patio de comidas"),
    ("amenity", "ice_cream",         "Heladería"),
    ("amenity", "bakery",            "Panadería"),
    # Comercios
    ("shop",    "supermarket",       "Supermercado"),
    ("shop",    "convenience",       "Almacén/Kiosco"),
    ("shop",    "hardware",          "Ferretería"),
    ("shop",    "electronics",       "Electrónica"),
    ("shop",    "clothes",           "Ropa"),
    ("shop",    "shoes",             "Calzado"),
    ("shop",    "bakery",            "Panadería (shop)"),
    ("shop",    "butcher",           "Carnicería"),
    ("shop",    "greengrocer",       "Verdulería/Frutería"),
    ("shop",    "optician",          "Óptica"),
    ("shop",    "jewelry",           "Joyería"),
    ("shop",    "sports",            "Deportes"),
    ("shop",    "furniture",         "Mueblería"),
    ("shop",    "florist",           "Florería"),
    ("shop",    "beauty",            "Salón de belleza"),
    ("shop",    "hairdresser",       "Peluquería"),
    ("shop",    "car",               "Concesionaria"),
    ("shop",    "car_repair",        "Mecánica/Taller"),
    ("shop",    "tyres",             "Gomería"),
    ("shop",    "mobile_phone",      "Telefonía"),
    ("shop",    "copyshop",          "Fotocopias"),
    ("shop",    "stationery",        "Librería"),
    ("shop",    "travel_agency",     "Agencia de viajes"),
    ("shop",    "photo",             "Fotografía"),
    # Servicios
    ("amenity", "bank",              "Banco"),
    ("amenity", "atm",               "Cajero automático"),
    ("amenity", "post_office",       "Correo"),
    ("amenity", "police",            "Policía"),
    ("amenity", "fire_station",      "Bomberos"),
    ("amenity", "fuel",              "Estación de servicio"),
    ("amenity", "parking",           "Estacionamiento"),
    ("amenity", "bus_station",       "Terminal de ómnibus"),
    ("amenity", "car_rental",        "Alquiler de autos"),
    ("amenity", "car_wash",          "Lavado de autos"),
    ("amenity", "laundry",           "Lavandería"),
    ("amenity", "marketplace",       "Mercado"),
    ("amenity", "courthouse",        "Juzgado/Tribunal"),
    ("amenity", "embassy",           "Consulado/Embajada"),
    ("amenity", "townhall",          "Municipalidad"),
    ("amenity", "social_facility",   "Centro social"),
    ("amenity", "community_centre",  "Centro comunitario"),
    ("amenity", "place_of_worship",  "Iglesia/Templo"),
    # Alojamiento
    ("tourism", "hotel",             "Hotel"),
    ("tourism", "hostel",            "Hostel"),
    ("tourism", "motel",             "Motel"),
    ("tourism", "guest_house",       "Pensión"),
    ("tourism", "apartment",         "Apart hotel"),
    # Turismo y cultura
    ("tourism", "museum",            "Museo"),
    ("tourism", "attraction",        "Atracción turística"),
    ("tourism", "viewpoint",         "Mirador"),
    ("tourism", "information",       "Información turística"),
    ("amenity", "theatre",           "Teatro"),
    ("amenity", "cinema",            "Cine"),
    ("amenity", "arts_centre",       "Centro cultural"),
    ("leisure", "stadium",           "Estadio"),
    ("leisure", "sports_centre",     "Centro deportivo"),
    ("leisure", "swimming_pool",     "Pileta/Natatorio"),
    ("leisure", "park",              "Parque/Plaza"),
    ("leisure", "playground",        "Parque infantil"),
    ("leisure", "fitness_centre",    "Gimnasio"),
    ("leisure", "golf_course",       "Golf"),
    # Transporte
    ("railway", "station",           "Estación de tren"),
    ("highway", "bus_stop",          "Parada de colectivo"),
    ("aeroway", "aerodrome",         "Aeropuerto"),
]

# ─── Helpers ───────────────────────────────────────────────────────────────────

def normalize(text: str) -> str:
    """Normaliza texto para generar ID/slug."""
    text = unicodedata.normalize("NFD", str(text or ""))
    text = "".join(c for c in text if unicodedata.category(c) != "Mn")
    text = re.sub(r"[^a-z0-9\s]", " ", text.lower())
    return re.sub(r"\s+", "_", text.strip())


def centroid(element: dict) -> tuple[float, float] | None:
    """Extrae lat/lng del elemento OSM (node, way o relation)."""
    t = element.get("type")
    if t == "node":
        return element.get("lat"), element.get("lon")
    if t in ("way", "relation"):
        center = element.get("center")
        if center:
            return center.get("lat"), center.get("lon")
    return None, None


def build_query(key: str, value: str) -> str:
    bbox = BBOX_STR
    return f"""
[out:json][timeout:60];
(
  node["{key}"="{value}"]({bbox});
  way["{key}"="{value}"]({bbox});
  relation["{key}"="{value}"]({bbox});
);
out center tags;
""".strip()


def overpass_fetch(query: str, proxies: dict | None, endpoint: str) -> list[dict]:
    headers = {"User-Agent": "ProfesionalApp-POI-Extractor/1.0"}
    resp = requests.post(
        endpoint,
        data={"data": query},
        headers=headers,
        proxies=proxies,
        timeout=90,
    )
    resp.raise_for_status()
    return resp.json().get("elements", [])


def pick_endpoint(proxies: dict | None) -> str:
    for ep in OVERPASS_ENDPOINTS:
        try:
            r = requests.get(ep.replace("/interpreter", "/status"), timeout=10, proxies=proxies)
            if r.status_code < 500:
                return ep
        except Exception:
            pass
    return OVERPASS_ENDPOINTS[0]


# ─── Main ──────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="Extrae POIs de Salta Capital desde OSM")
    parser.add_argument("--proxy", help="Proxy HTTP (ej: http://proxy:8080)")
    parser.add_argument(
        "--categories",
        help="Filtrar categorías (ej: hospital,restaurant). Separado por comas.",
    )
    parser.add_argument("--out-dir", default=".", help="Directorio de salida (default: .)")
    args = parser.parse_args()

    proxies = {"http": args.proxy, "https": args.proxy} if args.proxy else None
    out_dir = Path(args.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    # Filtro de categorías
    cats = CATEGORIES
    if args.categories:
        wanted = {c.strip().lower() for c in args.categories.split(",")}
        cats = [(k, v, lbl) for k, v, lbl in CATEGORIES if v.lower() in wanted or k.lower() in wanted]
        print(f"Filtrando {len(cats)} categoría(s): {[v for _,v,_ in cats]}")

    print(f"Extrayendo {len(cats)} categorías de Salta Capital (bbox {BBOX_STR})")
    endpoint = pick_endpoint(proxies)
    print(f"Usando endpoint Overpass: {endpoint}\n")

    all_pois: list[dict] = []
    seen_ids: set[str] = set()

    for i, (key, value, label) in enumerate(cats, 1):
        print(f"[{i:2d}/{len(cats)}] {label} ({key}={value}) ... ", end="", flush=True)
        try:
            elements = overpass_fetch(build_query(key, value), proxies, endpoint)
        except Exception as e:
            print(f"ERROR: {e}")
            time.sleep(3)
            continue

        added = 0
        for el in elements:
            lat, lng = centroid(el)
            if lat is None or lng is None:
                continue

            tags = el.get("tags", {})
            name = (
                tags.get("name:es")
                or tags.get("name")
                or tags.get("brand")
                or tags.get("operator")
                or ""
            ).strip()

            osm_id = f"{el['type']}/{el['id']}"
            if osm_id in seen_ids:
                continue
            seen_ids.add(osm_id)

            all_pois.append({
                "osm_id":    osm_id,
                "osm_key":   key,
                "osm_value": value,
                "category":  label,
                "name":      name,
                "lat":       round(lat, 7),
                "lng":       round(lng, 7),
                "address":   tags.get("addr:street", "") + (f" {tags.get('addr:housenumber','')}" if tags.get("addr:housenumber") else "").strip(),
                "phone":     tags.get("phone") or tags.get("contact:phone", ""),
                "website":   tags.get("website") or tags.get("contact:website", ""),
                "opening_hours": tags.get("opening_hours", ""),
            })
            added += 1

        print(f"{added} lugares")
        # Pausa cortés para no saturar Overpass
        time.sleep(1.5)

    print(f"\nTotal POIs: {len(all_pois)}")

    # ── JSON ─────────────────────────────────────────────────────────────────
    json_path = out_dir / "salta_pois.json"
    with open(json_path, "w", encoding="utf-8") as f:
        json.dump(all_pois, f, ensure_ascii=False, indent=2)
    print(f"JSON  → {json_path}")

    # ── CSV ──────────────────────────────────────────────────────────────────
    csv_path = out_dir / "salta_pois.csv"
    fieldnames = ["category", "name", "lat", "lng", "address", "phone", "website", "opening_hours", "osm_id", "osm_key", "osm_value"]
    with open(csv_path, "w", encoding="utf-8-sig", newline="") as f:
        w = csv.DictWriter(f, fieldnames=fieldnames)
        w.writeheader()
        for poi in sorted(all_pois, key=lambda x: (x["category"], x["name"].lower())):
            w.writerow({k: poi.get(k, "") for k in fieldnames})
    print(f"CSV   → {csv_path}")

    # ── JS: entradas para salta-known-pois.js ────────────────────────────────
    # Toma los POIs con nombre único y relevantes (>0 apariciones en OSM)
    seen_names: set[str] = set()
    js_entries: list[dict] = []
    for poi in all_pois:
        name = poi["name"]
        if not name or len(name) < 3:
            continue
        slug = normalize(name)
        if slug in seen_names:
            continue
        seen_names.add(slug)
        pattern_word = re.sub(r"_+", r"\\s+", slug)
        js_entries.append({
            "id":            slug[:40],
            "label":         name,
            "geocodeQuery":  f"{name}, Salta, Argentina",
            "lat":           poi["lat"],
            "lng":           poi["lng"],
            "category":      poi["category"],
            "pattern":       f"/\\b{pattern_word}\\b/",
        })

    js_path = out_dir / "salta_known_pois_additions.js"
    with open(js_path, "w", encoding="utf-8") as f:
        f.write("// Auto-generado por extract_salta_pois.py\n")
        f.write("// Revisá estas entradas y pegá las que sirvan en shared/salta-known-pois.js\n\n")
        f.write(f"// Total: {len(js_entries)} POIs únicos con nombre\n\n")
        f.write("const SALTA_POIS_ADDITIONS = [\n")
        for entry in sorted(js_entries, key=lambda x: x["label"].lower()):
            f.write("  {\n")
            f.write(f"    id: '{entry['id']}',\n")
            f.write(f"    label: '{entry['label'].replace(chr(39), '')}',\n")
            f.write(f"    geocodeQuery: '{entry['geocodeQuery'].replace(chr(39), '')}',\n")
            f.write(f"    // {entry['category']} | lat: {entry['lat']}, lng: {entry['lng']}\n")
            f.write(f"    patterns: [{entry['pattern']}],\n")
            f.write("  },\n")
        f.write("];\n\nmodule.exports = { SALTA_POIS_ADDITIONS };\n")
    print(f"JS    → {js_path}")

    # ── Estadísticas por categoría ────────────────────────────────────────────
    print("\n── Estadísticas por categoría ──────────────────────────────")
    from collections import Counter
    counts = Counter(p["category"] for p in all_pois)
    for cat, count in sorted(counts.items(), key=lambda x: -x[1]):
        print(f"  {count:4d}  {cat}")

    print(f"\n✓ Listo. {len(all_pois)} POIs guardados en {out_dir}/")


if __name__ == "__main__":
    main()
