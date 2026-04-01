/**
 * storage.ts — IndexedDB persistence layer using idb-keyval.
 *
 * Key schema:
 *   "drawings-index"          → DrawingMeta[]   (list of all drawings)
 *   "drawing:{id}:elements"   → ExcalidrawElement[]
 *   "drawing:{id}:appState"   → Partial<AppState>
 *   "drawing:{id}:files"      → BinaryFiles
 *   "library"                 → LibraryItems
 */

import { get, set, del, createStore } from "idb-keyval";
import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import type { AppState, BinaryFiles, LibraryItems } from "@excalidraw/excalidraw/types";

// Dedicated IndexedDB store so we don't collide with anything else
const store = createStore("elysium-db", "scene-store");

// ─── Types ───────────────────────────────────────────────────────
export interface DrawingMeta {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
}

// ─── Drawing Index ───────────────────────────────────────────────
export async function getDrawingsIndex(): Promise<DrawingMeta[]> {
  return (await get<DrawingMeta[]>("drawings-index", store)) ?? [];
}

export async function saveDrawingsIndex(index: DrawingMeta[]): Promise<void> {
  await set("drawings-index", index, store);
}

// ─── Scene Data ──────────────────────────────────────────────────
export async function getDrawingElements(id: string): Promise<ExcalidrawElement[] | undefined> {
  return get<ExcalidrawElement[]>(`drawing:${id}:elements`, store);
}

export async function getDrawingAppState(id: string): Promise<Partial<AppState> | undefined> {
  return get<Partial<AppState>>(`drawing:${id}:appState`, store);
}

export async function getDrawingFiles(id: string): Promise<BinaryFiles | undefined> {
  return get<BinaryFiles>(`drawing:${id}:files`, store);
}

export async function saveDrawingElements(id: string, elements: readonly ExcalidrawElement[]): Promise<void> {
  await set(`drawing:${id}:elements`, elements, store);
}

export async function saveDrawingAppState(id: string, appState: Partial<AppState>): Promise<void> {
  await set(`drawing:${id}:appState`, appState, store);
}

export async function saveDrawingFiles(id: string, files: BinaryFiles): Promise<void> {
  await set(`drawing:${id}:files`, files, store);
}

export async function deleteDrawing(id: string) {
  await del(`drawing:${id}:elements`, store);
  await del(`drawing:${id}:appState`, store);
  await del(`drawing:${id}:files`, store);
}

// ─── Library ─────────────────────────────────────────────────────
export async function getLibrary(): Promise<LibraryItems | undefined> {
  return get<LibraryItems>("library", store);
}

export async function saveLibrary(items: LibraryItems): Promise<void> {
  await set("library", items, store);
}
