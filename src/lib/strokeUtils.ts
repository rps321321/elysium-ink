/**
 * strokeUtils.ts — Pressure stroke math and SVG serialization.
 *
 * Used by usePressureStroke + PressureOverlay to:
 * - Convert perfect-freehand outline points → SVG path string
 * - Compute stroke bounding box
 * - Render a completed stroke to a data: URL (SVG)
 * - Convert viewport coordinates → Excalidraw scene coordinates
 */

import getStroke from "perfect-freehand";

// ─── Public types ────────────────────────────────────────────────

export interface StrokeSettings {
  /** Base brush diameter in viewport pixels (2–80) */
  size: number;
  /** How strongly pressure affects width: 0 = uniform, 1 = full range */
  thinning: number;
  /** CSS hex color, e.g. "#1a1a1a" */
  color: string;
  /** 10–100 */
  opacity: number;
}

export interface StrokeBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

// ─── Outline → SVG path ──────────────────────────────────────────

/**
 * Convert perfect-freehand outline polygon points to a smooth SVG path
 * using quadratic Bézier curves (same technique Excalidraw uses internally).
 */
export function outlineToSvgPath(pts: number[][]): string {
  if (pts.length < 2) return "";
  let d = `M ${pts[0][0]} ${pts[0][1]}`;
  for (let i = 1; i < pts.length; i++) {
    const [x0, y0] = pts[i - 1];
    const [x1, y1] = pts[i];
    d += ` Q ${x0} ${y0} ${(x0 + x1) / 2} ${(y0 + y1) / 2}`;
  }
  return d + " Z";
}

// ─── Bounding box ────────────────────────────────────────────────

/** Axis-aligned bounding box of raw input points (viewport coords). */
export function getStrokeBounds(
  points: [number, number, number][]
): StrokeBounds {
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  for (const [x, y] of points) {
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }
  return { minX, minY, maxX, maxY };
}

// ─── Stroke → data: URL ──────────────────────────────────────────

/**
 * Render a completed pressure stroke to an SVG data: URL.
 *
 * The SVG viewport is sized to the stroke bounding box + padding (so the
 * thickest part of the stroke never clips). The resulting data URL is safe
 * to pass to Excalidraw's addFiles() as mimeType "image/svg+xml".
 */
export function strokeToDataUrl(
  points: [number, number, number][],
  settings: StrokeSettings,
  bounds: StrokeBounds
): string {
  const pad = settings.size * 2; // enough room so thick ends never clip
  const w = bounds.maxX - bounds.minX + pad * 2;
  const h = bounds.maxY - bounds.minY + pad * 2;

  // Translate points into SVG-local space (origin = top-left of bounding box)
  const local = points.map(([x, y, p]): [number, number, number] => [
    x - bounds.minX + pad,
    y - bounds.minY + pad,
    p,
  ]);

  const outline = getStroke(local, {
    size: settings.size,
    thinning: settings.thinning,
    smoothing: 0.5,
    streamline: 0.4,
    // Sine easing gives a natural "ink" feel — slow start/end, fast middle
    easing: (t) => Math.sin((t * Math.PI) / 2),
    simulatePressure: false, // we have real hardware pressure
    last: true, // finalize end cap
  });

  const pathData = outlineToSvgPath(outline);
  const alpha = (settings.opacity / 100).toFixed(3);

  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" ` +
    `width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">` +
    `<path d="${pathData}" fill="${settings.color}" fill-opacity="${alpha}"/>` +
    `</svg>`;

  // btoa requires ASCII; encodeURIComponent + unescape handles Unicode safely
  const b64 = btoa(unescape(encodeURIComponent(svg)));
  return `data:image/svg+xml;base64,${b64}`;
}

// ─── Coordinate conversion ────────────────────────────────────────

/**
 * Convert a point in Excalidraw viewport space (pixels from top-left of the
 * canvas container element) to Excalidraw scene coordinates.
 *
 * Formula: sceneX = (viewportX - scrollX) / zoom
 *
 * This matches Excalidraw's internal viewportCoordsToSceneCoords helper.
 */
export function viewportToScene(
  viewportX: number,
  viewportY: number,
  scrollX: number,
  scrollY: number,
  zoom: number
): [number, number] {
  return [(viewportX - scrollX) / zoom, (viewportY - scrollY) / zoom];
}
