import { useState, useEffect, useCallback, useRef, lazy, Suspense } from "react";
import { loadSceneOrLibraryFromBlob, MIME_TYPES, MainMenu } from "@excalidraw/excalidraw";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import "@excalidraw/excalidraw/index.css";

import { DrawingsProvider, useDrawings, useDrawingsActions } from "./context/DrawingsContext";
import {
  usePersistentCanvas,
  loadDrawingData,
  type SavedDrawingData,
} from "./hooks/usePersistentCanvas";
// Sidebar removed — all actions now live in Excalidraw's hamburger menu
import { initCustomFonts } from "./fonts/registerFonts";

import "./App.css";

// ─── Register custom fonts BEFORE Excalidraw loads ───────────────
initCustomFonts();

// ─── Lazy-load Excalidraw canvas (Context7 recommendation) ───────
// The Excalidraw canvas component is the heaviest part (~5 MB).
// MainMenu remains a static import because it uses
// compound component patterns (e.g. MainMenu.DefaultItems) that
// React.lazy does not support.
const Excalidraw = lazy(() =>
  import("@excalidraw/excalidraw").then((mod) => ({ default: mod.Excalidraw }))
);

const LibraryBrowser = lazy(() => import("./components/LibraryBrowser"));
const PressureOverlay = lazy(() => import("./components/PressureOverlay"));

// ─── Inner App (consumes DrawingsContext) ────────────────────────
function AppInner() {
  const [excalidrawAPI, setExcalidrawAPI] =
    useState<ExcalidrawImperativeAPI | null>(null);

  const canvasContainerRef = useRef<HTMLDivElement>(null);

  const { drawings, activeDrawingId, isBooting } = useDrawings();
  const { createDrawing, deleteDrawing, renameDrawing, setActiveDrawing } =
    useDrawingsActions();

  // Drawing data state
  const [initialData, setInitialData] = useState<SavedDrawingData | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Inline rename state
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");

  // Delete confirmation state
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // View mode toggle
  const [viewMode, setViewMode] = useState(false);

  // Canvas texture
  const [texture, setTexture] = useState<string>(
    () => localStorage.getItem("elysium-texture") || "none"
  );
  const applyTexture = useCallback((t: string) => {
    setTexture(t);
    localStorage.setItem("elysium-texture", t);
  }, []);
  const textureRef = useRef<HTMLDivElement>(null);

  // ─── Sync texture overlay with Excalidraw zoom/scroll ──────────
  useEffect(() => {
    if (texture === "none" || !excalidrawAPI) return;
    let raf: number;
    let paused = document.hidden;

    const sync = () => {
      if (paused) return;
      const el = textureRef.current;
      if (!el || !excalidrawAPI) return;
      const state = excalidrawAPI.getAppState();
      const zoom = state.zoom.value;
      const sx = state.scrollX;
      const sy = state.scrollY;
      el.style.transform = `scale(${zoom})`;
      el.style.transformOrigin = "0 0";
      el.style.backgroundPosition = `${sx * zoom}px ${sy * zoom}px`;
      el.style.width = `${100 / zoom}%`;
      el.style.height = `${100 / zoom}%`;
      raf = requestAnimationFrame(sync);
    };

    const onVisibility = () => {
      paused = document.hidden;
      if (!paused) raf = requestAnimationFrame(sync);
    };

    document.addEventListener("visibilitychange", onVisibility);
    raf = requestAnimationFrame(sync);
    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [texture, excalidrawAPI]);

  // Library browser modal
  const [showLibraryBrowser, setShowLibraryBrowser] = useState(false);

  // ─── Persistence hook ──────────────────────────────────────────
  const { handleChange, handleLibraryChange, exportJSON } =
    usePersistentCanvas(activeDrawingId ?? "", excalidrawAPI);

  // ─── Load drawing data when active drawing changes ─────────────
  useEffect(() => {
    if (!activeDrawingId) return;
    let cancelled = false;

    (async () => {
      setIsLoading(true);
      const data = await loadDrawingData(activeDrawingId);
      if (cancelled) return;
      setInitialData(data);
      setIsLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [activeDrawingId]);

  // ─── Import .excalidraw file ───────────────────────────────────
  const importFile = useCallback(() => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".excalidraw,.excalidrawlib,.json";
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file || !excalidrawAPI) return;

      try {
        const contents = await loadSceneOrLibraryFromBlob(file, null, null);
        if (contents.type === MIME_TYPES.excalidraw) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const sceneData = (contents as any).data;
          excalidrawAPI.updateScene({
            elements: sceneData.elements,
            appState: sceneData.appState,
          });
          if (sceneData.files) {
            excalidrawAPI.addFiles(Object.values(sceneData.files));
          }
        } else if (contents.type === MIME_TYPES.excalidrawlib) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const libData = (contents as any).data;
          excalidrawAPI.updateLibrary({
            libraryItems: libData.libraryItems,
            openLibraryMenu: true,
          });
        }
      } catch (err) {
        console.error("Failed to import file:", err);
        alert("Failed to import the file. It may be corrupted.");
      }
    };
    input.click();
  }, [excalidrawAPI]);

  // ─── Intercept Excalidraw's built-in "Browse libraries" button ──
  useEffect(() => {
    const container = canvasContainerRef.current;
    if (!container) return;

    const handleClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const browseBtn = target.closest(".library-menu-browse-button");
      if (browseBtn) {
        e.preventDefault();
        e.stopPropagation();
        setShowLibraryBrowser(true);
      }
    };

    container.addEventListener("click", handleClick, true);
    return () => container.removeEventListener("click", handleClick, true);
  }, []);

  // ─── Show boot loader while context initializes ────────────────
  if (isBooting) {
    return (
      <div className="loading-screen">
        <div className="loading-spinner" />
        <p>Initializing Elysium Ink…</p>
      </div>
    );
  }

  // ─── Render ────────────────────────────────────────────────────
  return (
    <div className="app-container app-fullcanvas">
      {/* ─── Canvas (full screen) ─── */}
      <main className="canvas-container" ref={canvasContainerRef}>
        {isLoading ? (
          <div className="loading-screen">
            <div className="loading-spinner" />
            <p>Loading canvas…</p>
          </div>
        ) : (
          <Suspense
            fallback={
              <div className="loading-screen">
                <div className="loading-spinner" />
                <p>Loading drawing engine…</p>
              </div>
            }
          >
            <Excalidraw
              key={activeDrawingId}
              excalidrawAPI={(api) => setExcalidrawAPI(api)}
              initialData={
                initialData
                  ? {
                    elements: initialData.elements,
                    appState: initialData.appState,
                    files: initialData.files,
                    libraryItems: initialData.libraryItems,
                  }
                  : undefined
              }
              theme="dark"
              onChange={handleChange}
              onLibraryChange={handleLibraryChange}
              viewModeEnabled={viewMode}
              UIOptions={{
                canvasActions: {
                  loadScene: false,
                  saveToActiveFile: false,
                  export: { saveFileToDisk: true },
                  toggleTheme: false,
                },
              }}
            >
              <MainMenu>
                {/* ─── Drawings ─── */}
                <MainMenu.Group title="Drawings">
                  <MainMenu.Item onSelect={createDrawing} icon={
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                  }>
                    New Drawing
                  </MainMenu.Item>
                  {drawings.map((d) => {
                    const isActive = d.id === activeDrawingId;
                    const isRenaming = renamingId === d.id;
                    const isDeleting = deletingId === d.id;

                    // ── Delete confirmation row ──
                    if (isDeleting) {
                      return (
                        <MainMenu.ItemCustom key={d.id} className="drawing-menu-item drawing-menu-confirm">
                          <span className="drawing-confirm-text">Delete "{d.name}"?</span>
                          <div className="drawing-confirm-actions">
                            <button
                              className="drawing-confirm-btn drawing-confirm-yes"
                              onClick={(e) => { e.stopPropagation(); deleteDrawing(d.id); setDeletingId(null); }}
                            >
                              Delete
                            </button>
                            <button
                              className="drawing-confirm-btn drawing-confirm-no"
                              onClick={(e) => { e.stopPropagation(); setDeletingId(null); }}
                            >
                              Cancel
                            </button>
                          </div>
                        </MainMenu.ItemCustom>
                      );
                    }

                    // ── Inline rename row ──
                    if (isRenaming) {
                      return (
                        <MainMenu.ItemCustom key={d.id} className="drawing-menu-item">
                          <input
                            className="drawing-rename-input"
                            value={renameValue}
                            autoFocus
                            onChange={(e) => setRenameValue(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                if (renameValue.trim()) renameDrawing(d.id, renameValue.trim());
                                setRenamingId(null);
                              }
                              if (e.key === "Escape") setRenamingId(null);
                              e.stopPropagation();
                            }}
                            onBlur={() => {
                              if (renameValue.trim()) renameDrawing(d.id, renameValue.trim());
                              setRenamingId(null);
                            }}
                            onClick={(e) => e.stopPropagation()}
                          />
                        </MainMenu.ItemCustom>
                      );
                    }

                    // ── Normal drawing row ──
                    return (
                      <MainMenu.ItemCustom key={d.id} className="drawing-menu-item">
                        <button
                          className="drawing-menu-select"
                          onClick={() => { if (!isActive) setActiveDrawing(d.id); }}
                          style={{ color: isActive ? "#E9DFB4" : undefined, fontWeight: isActive ? 600 : 400 }}
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill={isActive ? "#E9DFB4" : "none"} stroke={isActive ? "#E9DFB4" : "#9A9282"} strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="3"/></svg>
                          <span className="drawing-menu-name">{d.name}</span>
                        </button>
                        <div className="drawing-menu-actions">
                          <button
                            className="drawing-menu-action"
                            title="Rename"
                            aria-label={`Rename ${d.name}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              setRenameValue(d.name);
                              setRenamingId(d.id);
                            }}
                          >
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/></svg>
                          </button>
                          {drawings.length > 1 && (
                            <button
                              className="drawing-menu-action drawing-menu-delete"
                              title="Delete"
                              aria-label={`Delete ${d.name}`}
                              onClick={(e) => {
                                e.stopPropagation();
                                setDeletingId(d.id);
                              }}
                            >
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                            </button>
                          )}
                        </div>
                      </MainMenu.ItemCustom>
                    );
                  })}
                </MainMenu.Group>
                <MainMenu.Separator />

                {/* ─── File actions ─── */}
                <MainMenu.DefaultItems.LoadScene />
                <MainMenu.DefaultItems.SaveAsImage />
                <MainMenu.DefaultItems.Export />
                <MainMenu.DefaultItems.ClearCanvas />
                <MainMenu.Separator />

                {/* ─── Elysium tools ─── */}
                <MainMenu.Item onSelect={exportJSON} icon={
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>
                }>
                  Export Backup
                </MainMenu.Item>
                <MainMenu.Item onSelect={importFile} icon={
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/><line x1="12" y1="11" x2="12" y2="17"/><polyline points="9 14 12 11 15 14"/></svg>
                }>
                  Import File
                </MainMenu.Item>
                <MainMenu.ItemCustom className="view-mode-toggle-row">
                  <button
                    className="view-mode-toggle"
                    onClick={(e) => { e.stopPropagation(); setViewMode((v) => !v); }}
                    aria-label={viewMode ? "Switch to Edit Mode" : "Switch to Read-Only Mode"}
                  >
                    <span className={`view-mode-label ${!viewMode ? "active" : ""}`}>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/></svg>
                      Edit
                    </span>
                    <span className={`view-mode-label ${viewMode ? "active" : ""}`}>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                      View
                    </span>
                  </button>
                </MainMenu.ItemCustom>
                <MainMenu.Separator />

                {/* ─── Canvas — background color + surface texture ─── */}
                <MainMenu.Group title="Canvas">
                  <MainMenu.DefaultItems.ChangeCanvasBackground />
                  <MainMenu.Separator />
                  {([
                    ["none", "No Texture"],
                    ["paper", "Paper"],
                    ["canvas-weave", "Canvas"],
                    ["parchment", "Parchment"],
                    ["dot-grid", "Dot Grid"],
                    ["blueprint", "Blueprint"],
                  ] as const).map(([id, label]) => (
                    <MainMenu.Item
                      key={id}
                      onSelect={() => applyTexture(id)}
                      icon={
                        <svg width="14" height="14" viewBox="0 0 16 16" fill={texture === id ? "#E9DFB4" : "none"} stroke={texture === id ? "#E9DFB4" : "currentColor"} strokeWidth="1.5"><rect x="1" y="1" width="14" height="14" rx="2"/></svg>
                      }
                    >
                      <span style={{ color: texture === id ? "#E9DFB4" : undefined }}>
                        {label}
                      </span>
                    </MainMenu.Item>
                  ))}
                </MainMenu.Group>
              </MainMenu>
            </Excalidraw>
          </Suspense>
        )}

        {/* ─── Canvas texture overlay ─── */}
        {texture !== "none" && (
          <div ref={textureRef} className={`canvas-texture canvas-texture--${texture}`} />
        )}

        {/* ─── Pressure pen overlay (inside canvas-container for correct positioning) ─── */}
        <Suspense fallback={null}>
          <PressureOverlay
            containerRef={canvasContainerRef}
            excalidrawAPI={excalidrawAPI}
          />
        </Suspense>
      </main>

      {/* ─── Library Browser Modal (lazy loaded) ─── */}
      {showLibraryBrowser && (
        <Suspense fallback={null}>
          <LibraryBrowser
            onClose={() => setShowLibraryBrowser(false)}
            excalidrawAPI={excalidrawAPI}
          />
        </Suspense>
      )}
    </div>
  );
}

// ─── Root App (wraps with DrawingsProvider) ──────────────────────
function App() {
  return (
    <DrawingsProvider>
      <AppInner />
    </DrawingsProvider>
  );
}

export default App;
