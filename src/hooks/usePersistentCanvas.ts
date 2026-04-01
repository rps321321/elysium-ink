/**
 * usePersistentCanvas.ts — The core persistence hook
 *
 * Handles:
 * - Debounced save (500ms) of elements, appState, files
 * - getNonDeletedElements filtering before save
 * - Orphan-file pruning
 * - Library persistence via onLibraryChange
 * - Safe restoration via restoreElements + restoreAppState
 */

import { useCallback, useRef, useEffect } from "react";
import debounce from "lodash/debounce";
import {
    getNonDeletedElements,
    restoreElements,
    restoreAppState,
    serializeAsJSON,
} from "@excalidraw/excalidraw";
import type {
    ExcalidrawElement,
} from "@excalidraw/excalidraw/element/types";
import type {
    AppState,
    BinaryFiles,
    ExcalidrawImperativeAPI,
    LibraryItems,
} from "@excalidraw/excalidraw/types";
import {
    saveDrawingElements,
    saveDrawingAppState,
    saveDrawingFiles,
    saveLibrary,
    getDrawingElements,
    getDrawingAppState,
    getDrawingFiles,
    getLibrary,
} from "../lib/storage";

// Types are imported from @excalidraw/excalidraw above.

// ─── Pruning orphan files ────────────────────────────────────────
function pruneOrphanFiles(
    elements: readonly ExcalidrawElement[],
    files: BinaryFiles
): BinaryFiles {
    // Collect all fileIds referenced by image elements
    const referencedIds = new Set<string>();
    for (const el of elements) {
        // fileId only exists on image elements, use a safe runtime check
        const fileId = (el as Record<string, unknown>).fileId;
        if (typeof fileId === "string") {
            referencedIds.add(fileId);
        }
    }

    // Only keep files that are actively referenced
    const pruned: BinaryFiles = {};
    for (const [id, file] of Object.entries(files)) {
        if (referencedIds.has(id)) {
            pruned[id] = file;
        }
    }
    return pruned;
}

// ─── AppState keys we want to persist ────────────────────────────
// We only save viewport-relevant + preference keys, not transient UI state
const PERSISTED_APPSTATE_KEYS = [
    "viewBackgroundColor",
    "currentItemStrokeColor",
    "currentItemBackgroundColor",
    "currentItemFillStyle",
    "currentItemStrokeWidth",
    "currentItemRoughness",
    "currentItemOpacity",
    "currentItemFontFamily",
    "currentItemFontSize",
    "currentItemTextAlign",
    "currentItemStartArrowhead",
    "currentItemEndArrowhead",
    "currentItemRoundness",
    "gridSize",
    "gridStep",
    "scrollX",
    "scrollY",
    "zoom",
    "theme",
] as const;

function filterAppState(appState: AppState): Partial<AppState> {
    const filtered: Record<string, unknown> = {};
    for (const key of PERSISTED_APPSTATE_KEYS) {
        if (key in appState) {
            filtered[key] = appState[key];
        }
    }
    return filtered as Partial<AppState>;
}

// ─── Load saved drawing ──────────────────────────────────────────
export interface SavedDrawingData {
    elements: ExcalidrawElement[];
    appState: Partial<AppState>;
    files: BinaryFiles;
    libraryItems: LibraryItems;
}

export async function loadDrawingData(
    drawingId: string
): Promise<SavedDrawingData | null> {
    const [rawElements, rawAppState, rawFiles, rawLibrary] = await Promise.all([
        getDrawingElements(drawingId),
        getDrawingAppState(drawingId),
        getDrawingFiles(drawingId),
        getLibrary(),
    ]);

    // Nothing saved yet
    if (!rawElements && !rawAppState) return null;

    // Safely restore elements with binding repair
    const elements = rawElements
        ? restoreElements(rawElements, null, { repairBindings: true })
        : [];

    // Safely restore appState with defaults
    const appState = rawAppState
        ? restoreAppState(rawAppState, null)
        : {};

    const files = rawFiles ?? {};
    const libraryItems = rawLibrary ?? [];

    return { elements: elements as ExcalidrawElement[], appState, files, libraryItems };
}

// ─── The Hook ────────────────────────────────────────────────────
export function usePersistentCanvas(
    drawingId: string,
    excalidrawAPI: ExcalidrawImperativeAPI | null
) {
    const latestDrawingId = useRef(drawingId);

    // Keep ref in sync via useEffect — assigning during render violates React rules.
    useEffect(() => {
        latestDrawingId.current = drawingId;
    }, [drawingId]);

    // Debounced save function — 500ms
    const debouncedSaveRef = useRef(
        debounce(
            async (
                id: string,
                elements: readonly ExcalidrawElement[],
                appState: AppState,
                files: BinaryFiles
            ) => {
                // Only save non-deleted elements to prevent DB bloat
                const liveElements = getNonDeletedElements(elements);

                // Prune orphaned files
                const prunedFiles = pruneOrphanFiles(liveElements, files);

                // Filter appState to only save relevant keys
                const filteredState = filterAppState(appState);

                try {
                    await Promise.all([
                        saveDrawingElements(id, liveElements),
                        saveDrawingAppState(id, filteredState),
                        saveDrawingFiles(id, prunedFiles),
                    ]);
                } catch (err: unknown) {
                    if (err instanceof DOMException && err.name === "QuotaExceededError") {
                        console.error("Storage quota exceeded:", err);
                        alert(
                            "Storage quota exceeded! Your latest changes could not be saved. " +
                            "Try removing some large images or exporting a backup."
                        );
                    } else {
                        console.error("Failed to save drawing:", err);
                    }
                }
            },
            500
        )
    );

    // Flush pending writes when drawing changes or unmounts to prevent data loss
    useEffect(() => {
        const debouncedSave = debouncedSaveRef.current;
        return () => {
            debouncedSave.flush();
        };
    }, [drawingId]);

    // onChange handler for Excalidraw
    const handleChange = useCallback(
        (
            elements: readonly ExcalidrawElement[],
            appState: AppState,
            files: BinaryFiles
        ) => {
            debouncedSaveRef.current(
                latestDrawingId.current,
                elements,
                appState,
                files
            );
        },
        []
    );

    // onLibraryChange handler
    const handleLibraryChange = useCallback((items: LibraryItems) => {
        saveLibrary(items).catch((err) =>
            console.error("Failed to save library:", err)
        );
    }, []);

    // Export JSON backup (uses serializeAsJSON for cross-platform compat)
    const exportJSON = useCallback(() => {
        if (!excalidrawAPI) return;

        const elements = excalidrawAPI.getSceneElements();
        const appState = excalidrawAPI.getAppState();
        const files = excalidrawAPI.getFiles();

        const json = serializeAsJSON(elements, appState, files, "local");
        const blob = new Blob([json], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.download = `elysium-backup-${new Date().toISOString().slice(0, 10)}.excalidraw`;
        link.href = url;
        link.click();
        URL.revokeObjectURL(url);
    }, [excalidrawAPI]);

    return {
        handleChange,
        handleLibraryChange,
        exportJSON,
    };
}
