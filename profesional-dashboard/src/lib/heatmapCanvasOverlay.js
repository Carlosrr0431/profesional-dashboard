/**
 * Mapa de calor sobre Google Maps sin HeatmapLayer (deprecado en API v3.65+).
 * Usa OverlayView + canvas con gradientes radiales.
 */

const DEFAULT_GRADIENT = [
  { stop: 0.0, color: [59, 130, 246, 0] },
  { stop: 0.25, color: [59, 130, 246, 90] },
  { stop: 0.45, color: [34, 197, 94, 140] },
  { stop: 0.65, color: [234, 179, 8, 180] },
  { stop: 0.85, color: [239, 68, 68, 220] },
  { stop: 1.0, color: [185, 28, 28, 255] },
];

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function colorizeImage(imageData, gradient) {
  const pixels = imageData.data;
  const palette = buildPalette(gradient);

  for (let i = 0; i < pixels.length; i += 4) {
    const alpha = pixels[i + 3];
    if (alpha === 0) continue;
    const color = palette[alpha] || palette[palette.length - 1];
    pixels[i] = color[0];
    pixels[i + 1] = color[1];
    pixels[i + 2] = color[2];
    pixels[i + 3] = color[3];
  }

  return imageData;
}

function buildPalette(gradient) {
  const palette = new Array(256);
  for (let i = 0; i < 256; i += 1) {
    const t = i / 255;
    palette[i] = interpolateGradient(gradient, t);
  }
  return palette;
}

function interpolateGradient(gradient, t) {
  let lower = gradient[0];
  let upper = gradient[gradient.length - 1];

  for (let i = 0; i < gradient.length - 1; i += 1) {
    if (t >= gradient[i].stop && t <= gradient[i + 1].stop) {
      lower = gradient[i];
      upper = gradient[i + 1];
      break;
    }
  }

  const range = upper.stop - lower.stop || 1;
  const ratio = (t - lower.stop) / range;

  return [
    Math.round(lower.color[0] + (upper.color[0] - lower.color[0]) * ratio),
    Math.round(lower.color[1] + (upper.color[1] - lower.color[1]) * ratio),
    Math.round(lower.color[2] + (upper.color[2] - lower.color[2]) * ratio),
    Math.round(lower.color[3] + (upper.color[3] - lower.color[3]) * ratio),
  ];
}

export function createHeatmapCanvasOverlay(map, points = [], options = {}) {
  const googleMaps = window.google?.maps;
  if (!googleMaps || !map) return null;

  const radius = options.radius ?? 28;
  const maxOpacity = options.maxOpacity ?? 0.75;
  const gradient = options.gradient || DEFAULT_GRADIENT;

  class HeatmapOverlay extends googleMaps.OverlayView {
    constructor() {
      super();
      this.points = points;
      this.canvas = null;
      this.shadowCanvas = null;
      this.shadowCtx = null;
      this.listeners = [];
      this.setMap(map);
    }

    onAdd() {
      this.canvas = document.createElement('canvas');
      this.canvas.style.position = 'absolute';
      this.canvas.style.pointerEvents = 'none';

      this.shadowCanvas = document.createElement('canvas');
      this.shadowCtx = this.shadowCanvas.getContext('2d', { willReadFrequently: true });

      const pane = this.getPanes()?.overlayLayer;
      if (pane) pane.appendChild(this.canvas);

      const redraw = () => this.draw();
      this.listeners = [
        map.addListener('bounds_changed', redraw),
        map.addListener('zoom_changed', redraw),
      ];
    }

    draw() {
      if (!this.canvas || !this.shadowCanvas || !this.shadowCtx) return;

      const projection = this.getProjection();
      const bounds = map.getBounds();
      if (!projection || !bounds) return;

      const ne = bounds.getNorthEast();
      const sw = bounds.getSouthWest();
      const topLeft = projection.fromLatLngToDivPixel(new googleMaps.LatLng(ne.lat(), sw.lng()));
      const bottomRight = projection.fromLatLngToDivPixel(new googleMaps.LatLng(sw.lat(), ne.lng()));

      if (!topLeft || !bottomRight) return;

      const width = Math.abs(bottomRight.x - topLeft.x);
      const height = Math.abs(bottomRight.y - topLeft.y);
      if (width <= 0 || height <= 0) return;

      this.canvas.style.left = `${topLeft.x}px`;
      this.canvas.style.top = `${topLeft.y}px`;
      this.canvas.width = width;
      this.canvas.height = height;
      this.shadowCanvas.width = width;
      this.shadowCanvas.height = height;

      this.shadowCtx.clearRect(0, 0, width, height);

      const zoom = map.getZoom() || DEFAULT_ZOOM_FALLBACK;
      const scale = Math.pow(2, zoom - 13);
      const pointRadius = radius * clamp(scale, 0.55, 2.4);

      this.points.forEach((point) => {
        const latLng = new googleMaps.LatLng(point.lat, point.lng);
        if (!bounds.contains(latLng)) return;

        const pixel = projection.fromLatLngToDivPixel(latLng);
        if (!pixel) return;

        const x = pixel.x - topLeft.x;
        const y = pixel.y - topLeft.y;
        const weight = Number(point.weight) > 0 ? Number(point.weight) : 1;
        const intensity = clamp(weight, 0.15, 1);

        const gradientFill = this.shadowCtx.createRadialGradient(x, y, 0, x, y, pointRadius);
        gradientFill.addColorStop(0, `rgba(0, 0, 0, ${maxOpacity * intensity})`);
        gradientFill.addColorStop(0.55, `rgba(0, 0, 0, ${maxOpacity * intensity * 0.35})`);
        gradientFill.addColorStop(1, 'rgba(0, 0, 0, 0)');

        this.shadowCtx.fillStyle = gradientFill;
        this.shadowCtx.beginPath();
        this.shadowCtx.arc(x, y, pointRadius, 0, Math.PI * 2);
        this.shadowCtx.fill();
      });

      const ctx = this.canvas.getContext('2d');
      ctx.clearRect(0, 0, width, height);

      const image = this.shadowCtx.getImageData(0, 0, width, height);
      ctx.putImageData(colorizeImage(image, gradient), 0, 0);
    }

    setPoints(nextPoints) {
      this.points = nextPoints || [];
      this.draw();
    }

    onRemove() {
      this.listeners.forEach((listener) => googleMaps.event.removeListener(listener));
      this.listeners = [];
      if (this.canvas?.parentNode) this.canvas.parentNode.removeChild(this.canvas);
      this.canvas = null;
      this.shadowCanvas = null;
      this.shadowCtx = null;
    }
  }

  return new HeatmapOverlay();
}

const DEFAULT_ZOOM_FALLBACK = 13;
