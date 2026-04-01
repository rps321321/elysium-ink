/**
 * PressureOverlay.tsx — Pressure-sensitive pen drawing layer.
 *
 * Renders an invisible <canvas> over Excalidraw for live stroke preview,
 * then finalizes each stroke as an SVG image element inside the scene.
 *
 * Supports: Apple Pencil, Wacom tablets, Surface Pen, and any device that
 * exposes PointerEvent.pressure (and optionally tiltX/tiltY).
 *
 * The toolbar is hidden until a pen is first detected — so mouse users never
 * see it. Once detected it stays visible for the session.
 */

import { useRef, useCallback, useEffect, useState } from "react";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import type { FileId } from "@excalidraw/excalidraw/element/types";
import { usePressureStroke } from "../hooks/usePressureStroke";
import {
  strokeToDataUrl,
  getStrokeBounds,
  viewportToScene,
} from "../lib/strokeUtils";
import type { StrokeSettings } from "../lib/strokeUtils";
import "./PressureOverlay.css";

// ─── Types ───────────────────────────────────────────────────────

type Point = [number, number, number];

interface PressureOverlayProps {
  containerRef: React.RefObject<HTMLElement | null>;
  excalidrawAPI: ExcalidrawImperativeAPI | null;
}

// ─── Defaults ────────────────────────────────────────────────────

const DEFAULT_SETTINGS: StrokeSettings = {
  size: 12,
  thinning: 0.6,
  color: "#1a1a1a",
  opacity: 100,
};

// ─── Component ───────────────────────────────────────────────────

export default function PressureOverlay({
  containerRef,
  excalidrawAPI,
}: PressureOverlayProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const [enabled, setEnabled] = useState(false);
  const [penDetected, setPenDetected] = useState(false);
  const [settings, setSettings] = useState<StrokeSettings>(DEFAULT_SETTINGS);
  const [showPanel, setShowPanel] = useState(false);

  // ─── Keep overlay canvas sized to its container ───────────────
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const sync = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      canvas.width = container.clientWidth;
      canvas.height = container.clientHeight;
    };

    sync();
    const ro = new ResizeObserver(sync);
    ro.observe(container);
    return () => ro.disconnect();
  }, [containerRef]);

  // ─── Detect first pen contact → reveal toolbar ────────────────
  useEffect(() => {
    const container = containerRef.current;
    if (!container || penDetected) return;

    const detect = (e: PointerEvent) => {
      if (e.pointerType === "pen") setPenDetected(true);
    };

    // Listen in capture phase so we see the event even when pen mode is off
    container.addEventListener("pointerdown", detect, { capture: true });
    return () =>
      container.removeEventListener("pointerdown", detect, { capture: true });
  }, [containerRef, penDetected]);

  // ─── Finalize stroke → insert into Excalidraw scene ──────────
  const handleStrokeComplete = useCallback(
    (points: Point[], strokeSettings: StrokeSettings) => {
      if (!excalidrawAPI || points.length < 2) return;

      const bounds = getStrokeBounds(points);
      if (bounds.maxX - bounds.minX < 1 && bounds.maxY - bounds.minY < 1) return;

      const dataUrl = strokeToDataUrl(points, strokeSettings, bounds);

      const appState = excalidrawAPI.getAppState();
      const zoom = appState.zoom.value;
      const { scrollX, scrollY } = appState;
      const pad = strokeSettings.size * 2;

      // Convert viewport bounding box → scene coordinates
      const [sceneX, sceneY] = viewportToScene(
        bounds.minX - pad,
        bounds.minY - pad,
        scrollX,
        scrollY,
        zoom
      );
      const sceneW = (bounds.maxX - bounds.minX + pad * 2) / zoom;
      const sceneH = (bounds.maxY - bounds.minY + pad * 2) / zoom;

      const fileId = crypto.randomUUID() as unknown as FileId;

      // Register the SVG with Excalidraw's file store — must happen before
      // updateScene so the image renderer can find it immediately.
      excalidrawAPI.addFiles([
        {
          id: fileId,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          dataURL: dataUrl as any,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          mimeType: "image/svg+xml" as any,
          created: Date.now(),
          lastRetrieved: Date.now(),
        },
      ]);

      // Append an image element positioned at the correct scene location.
      // We use `as any` for the element object because Excalidraw's element
      // types use several branded primitives (Radians, FractionalIndex, etc.)
      // that aren't constructable without internal helpers.
      const existing = excalidrawAPI.getSceneElements();
      excalidrawAPI.updateScene({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        elements: [
          ...existing,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          {
            type: "image",
            id: crypto.randomUUID(),
            x: sceneX,
            y: sceneY,
            width: sceneW,
            height: sceneH,
            angle: 0,
            strokeColor: "transparent",
            backgroundColor: "transparent",
            fillStyle: "solid",
            strokeWidth: 1,
            strokeStyle: "solid",
            roughness: 0,
            opacity: 100,
            groupIds: [],
            frameId: null,
            roundness: null,
            seed: Math.floor(Math.random() * 0x7fffffff),
            version: 1,
            versionNonce: Math.floor(Math.random() * 0x7fffffff),
            index: null,
            isDeleted: false,
            boundElements: null,
            updated: Date.now(),
            link: null,
            locked: false,
            fileId,
            scale: [1, 1],
            status: "saved",
            crop: null,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
          } as any,
        ],
      });
    },
    [excalidrawAPI]
  );

  usePressureStroke({
    containerRef,
    canvasRef,
    settings,
    enabled,
    onStrokeComplete: handleStrokeComplete,
  });

  return (
    <>
      {/* Live stroke preview — pointer-events: none so it never blocks clicks */}
      <canvas
        ref={canvasRef}
        className="pressure-canvas"
        aria-hidden="true"
      />

      {/* Pen toolbar — only rendered after first pen contact */}
      {penDetected && (
        <div className="pen-toolbar">
          <button
            className={`pen-btn pen-toggle ${enabled ? "active" : ""}`}
            onClick={() => {
              setEnabled((v) => !v);
              if (showPanel && enabled) setShowPanel(false);
            }}
            title={
              enabled
                ? "Pressure pen active — click to disable"
                : "Enable pressure pen mode"
            }
            aria-label={enabled ? "Disable pressure pen" : "Enable pressure pen"}
          >
            <PenIcon />
          </button>

          {enabled && (
            <button
              className={`pen-btn pen-settings-btn ${showPanel ? "active" : ""}`}
              onClick={() => setShowPanel((v) => !v)}
              title="Pen settings"
              aria-label="Pen settings"
            >
              <SettingsIcon />
            </button>
          )}

          {enabled && showPanel && (
            <div className="pen-panel">
              <div className="pen-panel-title">Pressure Pen</div>

              <RangeControl
                label="Size"
                value={settings.size}
                min={2}
                max={80}
                display={`${settings.size}px`}
                onChange={(v) => setSettings((s) => ({ ...s, size: v }))}
              />
              <RangeControl
                label="Pressure"
                value={Math.round(settings.thinning * 100)}
                min={0}
                max={100}
                display={`${Math.round(settings.thinning * 100)}%`}
                onChange={(v) =>
                  setSettings((s) => ({ ...s, thinning: v / 100 }))
                }
              />
              <RangeControl
                label="Opacity"
                value={settings.opacity}
                min={10}
                max={100}
                display={`${settings.opacity}%`}
                onChange={(v) => setSettings((s) => ({ ...s, opacity: v }))}
              />

              <div className="pen-control">
                <div className="pen-control-header">
                  <span className="pen-label">Color</span>
                </div>
                <input
                  type="color"
                  value={settings.color}
                  onChange={(e) =>
                    setSettings((s) => ({ ...s, color: e.target.value }))
                  }
                  className="pen-color-input"
                />
              </div>

              <button
                className="pen-reset-btn"
                onClick={() => setSettings(DEFAULT_SETTINGS)}
              >
                Reset to defaults
              </button>

              <p className="pen-hint">
                Draw with your pen — strokes become scene elements you can move
                and resize.
              </p>
            </div>
          )}
        </div>
      )}
    </>
  );
}

// ─── Sub-components ───────────────────────────────────────────────

function RangeControl({
  label,
  value,
  min,
  max,
  display,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  display: string;
  onChange: (v: number) => void;
}) {
  return (
    <div className="pen-control">
      <div className="pen-control-header">
        <span className="pen-label">{label}</span>
        <span className="pen-value">{display}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(+e.target.value)}
        className="pen-slider"
      />
    </div>
  );
}

function PenIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
    </svg>
  );
}

function SettingsIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}
