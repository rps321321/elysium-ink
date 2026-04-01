import { useState, useEffect, useCallback, useRef, lazy, Suspense } from "react";
import { loadSceneOrLibraryFromBlob, MIME_TYPES, MainMenu, WelcomeScreen } from "@excalidraw/excalidraw";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import "@excalidraw/excalidraw/index.css";

import { DrawingsProvider, useDrawings } from "./context/DrawingsContext";
import {
  usePersistentCanvas,
  loadDrawingData,
  type SavedDrawingData,
} from "./hooks/usePersistentCanvas";
import { useTabLock } from "./hooks/useTabLock";
import Sidebar from "./components/Sidebar";
import { initCustomFonts } from "./fonts/registerFonts";

import "./App.css";

// ─── Register custom fonts BEFORE Excalidraw loads ───────────────
initCustomFonts();

// ─── Lazy-load Excalidraw canvas (Context7 recommendation) ───────
// The Excalidraw canvas component is the heaviest part (~5 MB).
// MainMenu and WelcomeScreen remain static imports because they use
// compound component patterns (e.g. MainMenu.DefaultItems) that
// React.lazy does not support.
const Excalidraw = lazy(() =>
  import("@excalidraw/excalidraw").then((mod) => ({ default: mod.Excalidraw }))
);

const LibraryBrowser = lazy(() => import("./components/LibraryBrowser"));
const PressureOverlay = lazy(() => import("./components/PressureOverlay"));

// ─── Inner App (consumes DrawingsContext) ────────────────────────
function AppInner() {
  const isTabLocked = useTabLock();

  const [excalidrawAPI, setExcalidrawAPI] =
    useState<ExcalidrawImperativeAPI | null>(null);

  const canvasContainerRef = useRef<HTMLDivElement>(null);

  const { activeDrawingId, isBooting } = useDrawings();

  // Drawing data state
  const [initialData, setInitialData] = useState<SavedDrawingData | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // View mode toggle
  const [viewMode, setViewMode] = useState(false);

  // Sidebar toggle
  const [sidebarOpen, setSidebarOpen] = useState(true);

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

  // ─── Open Library Browser ──────────────────────────────────────
  const openLibraryBrowser = useCallback(() => {
    setShowLibraryBrowser(true);
  }, []);

  // ─── Tab locked state ──────────────────────────────────────────
  if (isTabLocked) {
    return (
      <div className="tab-lock-overlay">
        <div className="tab-lock-card">
          <div className="tab-lock-icon">🔒</div>
          <h1>Tab Locked</h1>
          <p>
            Elysium Creative Studio is already open in another tab. Opening multiple
            tabs simultaneously can cause data corruption.
          </p>
          <p>Please close this tab and return to the existing one.</p>
        </div>
      </div>
    );
  }

  // ─── Show boot loader while context initializes ────────────────
  if (isBooting) {
    return (
      <div className="loading-screen">
        <div className="loading-spinner" />
        <p>Initializing Elysium Creative Studio…</p>
      </div>
    );
  }

  // ─── Render ────────────────────────────────────────────────────
  return (
    <div className="app-container">
      {/* ─── Sidebar (extracted component) ─── */}
      <Sidebar
        sidebarOpen={sidebarOpen}
        onExportJSON={exportJSON}
        onImportFile={importFile}
        onOpenLibraryBrowser={openLibraryBrowser}
        viewMode={viewMode}
        onToggleViewMode={() => setViewMode((v) => !v)}
      />

      {/* ─── Sidebar toggle ─── */}
      <button
        className="sidebar-toggle"
        onClick={() => setSidebarOpen((o) => !o)}
        title={sidebarOpen ? "Close sidebar" : "Open sidebar"}
      >
        {sidebarOpen ? "◀" : "▶"}
      </button>

      {/* ─── Canvas ─── */}
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
              onChange={handleChange}
              onLibraryChange={handleLibraryChange}
              viewModeEnabled={viewMode}
              UIOptions={{
                canvasActions: {
                  loadScene: false,
                  saveToActiveFile: false,
                  export: { saveFileToDisk: true },
                  toggleTheme: true,
                },
              }}
            >
              <MainMenu>
                <MainMenu.DefaultItems.LoadScene />
                <MainMenu.DefaultItems.SaveAsImage />
                <MainMenu.DefaultItems.Export />
                <MainMenu.DefaultItems.ClearCanvas />
                <MainMenu.Separator />
                <MainMenu.DefaultItems.ToggleTheme />
                <MainMenu.DefaultItems.ChangeCanvasBackground />
              </MainMenu>
              <WelcomeScreen>
                <WelcomeScreen.Center>
                  <WelcomeScreen.Center.Logo>
                    <img
                      src="./elysium-icon.png"
                      alt="Elysium Creative Studio"
                      style={{ width: 72, height: 72, borderRadius: 12 }}
                    />
                  </WelcomeScreen.Center.Logo>
                  <WelcomeScreen.Center.Heading>
                    Elysium Creative Studio
                  </WelcomeScreen.Center.Heading>
                  <WelcomeScreen.Hints.ToolbarHint />
                  <WelcomeScreen.Hints.MenuHint />
                  <WelcomeScreen.Hints.HelpHint />
                </WelcomeScreen.Center>
              </WelcomeScreen>
            </Excalidraw>
          </Suspense>
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
