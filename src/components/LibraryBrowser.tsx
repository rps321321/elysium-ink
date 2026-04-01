import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import "./LibraryBrowser.css";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";

// ─── Types matching libraries.json schema ────────────────────────
interface LibraryAuthor {
    name: string;
    url?: string;
}

interface LibraryEntry {
    name: string;
    description: string;
    authors: LibraryAuthor[];
    source: string;
    preview: string;
    created: string;
    updated: string;
    version: number;
    id?: string;
    itemNames?: string[];
}

// The pre-bundled directory maps source paths to their parsed library items
type PreloadDirectory = Record<string, unknown[]>;

interface LibraryBrowserProps {
    onClose: () => void;
    excalidrawAPI: ExcalidrawImperativeAPI | null;
}

// ─── Component ───────────────────────────────────────────────────
export default function LibraryBrowser({ onClose, excalidrawAPI }: LibraryBrowserProps) {
    const [catalog, setCatalog] = useState<LibraryEntry[]>([]);
    const [search, setSearch] = useState("");
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [installingId, setInstallingId] = useState<string | null>(null);
    const [installedIds, setInstalledIds] = useState<Set<string>>(new Set());

    // Cache the pre-bundled directory in memory (loaded once)
    const directoryRef = useRef<PreloadDirectory | null>(null);

    // ─── Load catalog + preloaded directory on mount ────────────────
    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                // Catalog is required; preload directory is optional (not bundled in web build)
                const catalogRes = await fetch("./libraries.json");
                if (!catalogRes.ok) throw new Error(`Catalog HTTP ${catalogRes.status}`);
                const catalogData = await catalogRes.json() as LibraryEntry[];

                // Best-effort: preload directory only exists in the Electron desktop build
                const directoryRes = await fetch("./preload-libraries-directory.json").catch(() => null);
                const directoryData: PreloadDirectory | null =
                    directoryRes?.ok ? await directoryRes.json() as PreloadDirectory : null;

                if (!cancelled) {
                    setCatalog(catalogData);
                    directoryRef.current = directoryData;
                    setLoading(false);
                }
            } catch (err) {
                if (!cancelled) {
                    setError((err as Error).message);
                    setLoading(false);
                }
            }
        })();
        return () => { cancelled = true; };
    }, []);

    // ─── Filter catalog by search ──────────────────────────────────
    const filtered = useMemo(() => {
        if (!search.trim()) return catalog;
        const q = search.toLowerCase();
        return catalog.filter(
            (lib) =>
                lib.name.toLowerCase().includes(q) ||
                lib.description.toLowerCase().includes(q) ||
                lib.authors.some((a) => a.name.toLowerCase().includes(q))
        );
    }, [catalog, search]);

    // ─── Install handler (reads from pre-bundled directory — no network!) ──
    const handleInstall = useCallback(
        async (lib: LibraryEntry) => {
            if (!excalidrawAPI) return;

            const key = lib.id || lib.source;
            setInstallingId(key);

            try {
                const directory = directoryRef.current;
                if (!directory) {
                    alert("Library installs are only available in the Elysium Ink desktop app.");
                    setInstallingId(null);
                    return;
                }
                if (!directory[lib.source]) {
                    throw new Error(`Library "${lib.name}" not found in preload directory`);
                }

                // Get the pre-parsed library items array directly from memory
                const items = directory[lib.source];

                // Wrap it back into the .excalidrawlib Blob format that updateLibrary expects
                const libFile = {
                    type: "excalidrawlib",
                    version: 2,
                    source: "https://excalidraw.com",
                    libraryItems: items,
                };
                const blob = new Blob([JSON.stringify(libFile)], {
                    type: "application/json",
                });

                await excalidrawAPI.updateLibrary({
                    libraryItems: blob,
                    merge: true,
                    prompt: false,
                    openLibraryMenu: true,
                    defaultStatus: "published",
                });

                setInstalledIds((prev) => new Set(prev).add(key));
            } catch (err) {
                console.error("Failed to install library:", err);
                alert(`Failed to install "${lib.name}". ${(err as Error).message || "Please try again."}`);
            } finally {
                setInstallingId(null);
            }
        },
        [excalidrawAPI]
    );

    // ─── Restore focus on close ─────────────────────────────────────
    useEffect(() => {
        const previousFocus = document.activeElement as HTMLElement | null;
        return () => { previousFocus?.focus(); };
    }, []);

    // ─── Close on Escape ───────────────────────────────────────────
    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            if (e.key === "Escape") onClose();
        };
        window.addEventListener("keydown", handler);
        return () => window.removeEventListener("keydown", handler);
    }, [onClose]);

    return (
        <div className="lib-browser-overlay" onClick={onClose}>
            <div className="lib-browser-modal" role="dialog" aria-modal="true" aria-labelledby="lib-browser-title" onClick={(e) => e.stopPropagation()}>
                {/* ─── Header ─── */}
                <div className="lib-browser-header">
                    <div className="lib-browser-title-row">
                        <h2 id="lib-browser-title">📚 Browse Libraries</h2>
                        <button className="lib-browser-close" onClick={onClose} title="Close" aria-label="Close">
                            ✕
                        </button>
                    </div>
                    <p className="lib-browser-subtitle">
                        {catalog.length} community libraries available • All bundled locally
                    </p>
                    <input
                        className="lib-browser-search"
                        type="text"
                        placeholder="Search libraries…"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        autoFocus
                    />
                </div>

                {/* ─── Body ─── */}
                <div className="lib-browser-body">
                    {loading && (
                        <div className="lib-browser-status">
                            <div className="loading-spinner" />
                            <p>Loading library catalog…</p>
                        </div>
                    )}

                    {error && (
                        <div className="lib-browser-status lib-browser-error">
                            <p>Failed to load catalog: {error}</p>
                        </div>
                    )}

                    {!loading && !error && filtered.length === 0 && (
                        <div className="lib-browser-status">
                            <p>No libraries match "{search}"</p>
                        </div>
                    )}

                    {!loading && !error && filtered.length > 0 && (
                        <div className="lib-browser-grid">
                            {filtered.map((lib) => {
                                const key = lib.id || lib.source;
                                const isInstalling = installingId === key;
                                const isInstalled = installedIds.has(key);

                                return (
                                    <div className="lib-card" key={key}>
                                        <div className="lib-card-preview">
                                            <img
                                                src={`./libraries/${lib.preview}`}
                                                alt={lib.name}
                                                loading="lazy"
                                                onError={(e) => {
                                                    (e.target as HTMLImageElement).style.display = "none";
                                                }}
                                            />
                                        </div>
                                        <div className="lib-card-info">
                                            <h3 className="lib-card-name">{lib.name}</h3>
                                            <p className="lib-card-desc">{lib.description}</p>
                                            <p className="lib-card-author">
                                                by {lib.authors.map((a) => a.name).join(", ")}
                                            </p>
                                        </div>
                                        <button
                                            className={`lib-card-btn ${isInstalled ? "installed" : ""}`}
                                            onClick={() => handleInstall(lib)}
                                            disabled={isInstalling || isInstalled}
                                        >
                                            {isInstalling
                                                ? "Adding…"
                                                : isInstalled
                                                    ? "✓ Added"
                                                    : "+ Add to Library"}
                                        </button>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
