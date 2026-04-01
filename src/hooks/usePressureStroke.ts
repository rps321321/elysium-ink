/**
 * usePressureStroke.ts — Capture-phase pointer event hook for pressure-
 * sensitive pen input (Apple Pencil, Wacom, Surface Pen, etc.).
 *
 * How it works:
 * - Attaches capture-phase listeners to the canvas container element so that
 *   pen pointer events are intercepted BEFORE Excalidraw processes them.
 * - Only intercepts events where pointerType === "pen". Mouse and touch events
 *   pass through normally, keeping all Excalidraw tools working as expected.
 * - Uses PointerEvent.getCoalescedEvents() when available (supported on Chrome,
 *   Edge, Firefox, Safari ≥ 17) to capture all sub-frame points that high-
 *   frequency devices (Wacom 200 Hz, Apple Pencil 240 Hz) produce per frame.
 * - Renders a live preview stroke on an overlay <canvas> using perfect-freehand,
 *   then calls onStrokeComplete with the full point array when the pen lifts.
 */

import { useEffect, useRef } from "react";
import type { RefObject } from "react";
import getStroke from "perfect-freehand";
import { outlineToSvgPath } from "../lib/strokeUtils";
import type { StrokeSettings } from "../lib/strokeUtils";

type Point = [number, number, number]; // [x, y, pressure]  — viewport coords

interface Config {
  containerRef: RefObject<HTMLElement | null>;
  canvasRef: RefObject<HTMLCanvasElement | null>;
  settings: StrokeSettings;
  enabled: boolean;
  onStrokeComplete: (points: Point[], settings: StrokeSettings) => void;
}

export function usePressureStroke({
  containerRef,
  canvasRef,
  settings,
  enabled,
  onStrokeComplete,
}: Config) {
  const strokeRef = useRef<Point[]>([]);
  const drawingRef = useRef(false);

  // Use a ref for settings so the event handlers always see the latest values
  // without needing to re-register on every settings change.
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  // Keep onStrokeComplete stable via ref too
  const onCompleteRef = useRef(onStrokeComplete);
  onCompleteRef.current = onStrokeComplete;

  useEffect(() => {
    if (!enabled) {
      // Clear any in-progress stroke when disabled mid-draw
      strokeRef.current = [];
      drawingRef.current = false;
      const canvas = canvasRef.current;
      if (canvas) canvas.getContext("2d")?.clearRect(0, 0, canvas.width, canvas.height);
      return;
    }

    const container = containerRef.current;
    if (!container) return;

    // ─── Live preview rendering ─────────────────────────────────
    const renderLive = (pts: Point[], isLast = false) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      if (pts.length < 2) return;

      const s = settingsRef.current;
      const outline = getStroke(pts, {
        size: s.size,
        thinning: s.thinning,
        smoothing: 0.5,
        streamline: 0.4,
        easing: (t) => Math.sin((t * Math.PI) / 2),
        simulatePressure: false,
        last: isLast,
      });

      if (outline.length < 2) return;

      const path = new Path2D(outlineToSvgPath(outline));
      ctx.fillStyle = s.color;
      ctx.globalAlpha = s.opacity / 100;
      ctx.fill(path);
      ctx.globalAlpha = 1;
    };

    const clearOverlay = () => {
      const canvas = canvasRef.current;
      if (canvas) canvas.getContext("2d")?.clearRect(0, 0, canvas.width, canvas.height);
    };

    // ─── Pointer event handlers ─────────────────────────────────
    const onPointerDown = (e: PointerEvent) => {
      if (e.pointerType !== "pen") return;

      // Intercept completely — Excalidraw won't see this event
      e.stopPropagation();
      e.preventDefault();

      drawingRef.current = true;
      const rect = container.getBoundingClientRect();
      strokeRef.current = [[e.clientX - rect.left, e.clientY - rect.top, e.pressure || 0.5]];
      renderLive(strokeRef.current);
    };

    const onPointerMove = (e: PointerEvent) => {
      if (!drawingRef.current || e.pointerType !== "pen") return;
      e.stopPropagation();
      e.preventDefault();

      const rect = container.getBoundingClientRect();

      // getCoalescedEvents() captures all sub-frame points the device sent
      // since the last frame — crucial for smooth high-frequency input.
      // Falls back to the single event on older browsers.
      type CoalescedPointerEvent = PointerEvent & {
        getCoalescedEvents?: () => PointerEvent[];
      };
      const events =
        (e as CoalescedPointerEvent).getCoalescedEvents?.() ?? [e];

      for (const ev of events) {
        strokeRef.current.push([
          ev.clientX - rect.left,
          ev.clientY - rect.top,
          ev.pressure || 0.5,
        ]);
      }

      renderLive(strokeRef.current);
    };

    const onPointerUp = (e: PointerEvent) => {
      if (!drawingRef.current || e.pointerType !== "pen") return;
      e.stopPropagation();
      e.preventDefault();

      drawingRef.current = false;
      const pts = strokeRef.current;
      strokeRef.current = [];
      clearOverlay();

      if (pts.length >= 2) {
        onCompleteRef.current(pts, settingsRef.current);
      }
    };

    const onPointerCancel = (e: PointerEvent) => {
      if (e.pointerType !== "pen") return;
      drawingRef.current = false;
      strokeRef.current = [];
      clearOverlay();
    };

    // Capture phase: our handlers run before any child element's handlers,
    // letting us consume pen events before Excalidraw sees them.
    container.addEventListener("pointerdown", onPointerDown, { capture: true });
    container.addEventListener("pointermove", onPointerMove, { capture: true });
    container.addEventListener("pointerup", onPointerUp, { capture: true });
    container.addEventListener("pointercancel", onPointerCancel, { capture: true });

    return () => {
      container.removeEventListener("pointerdown", onPointerDown, { capture: true });
      container.removeEventListener("pointermove", onPointerMove, { capture: true });
      container.removeEventListener("pointerup", onPointerUp, { capture: true });
      container.removeEventListener("pointercancel", onPointerCancel, { capture: true });
    };
  }, [enabled, containerRef, canvasRef]);
}
