/**
 * Sidebar.tsx — Extracted sidebar component.
 *
 * Connected to DrawingsContext for state and DrawingsDispatchContext
 * for actions, so no props need to be passed from App.tsx.
 */

import { useState, useRef, useCallback, useEffect } from "react";
import {
    useDrawings,
    useDrawingsActions,
} from "../context/DrawingsContext";

interface SidebarProps {
    sidebarOpen: boolean;
}

export default function Sidebar({ sidebarOpen }: SidebarProps) {
    const { drawings, activeDrawingId } = useDrawings();
    const { createDrawing, deleteDrawing, renameDrawing, setActiveDrawing } =
        useDrawingsActions();

    // Rename state (local to sidebar only)
    const [renamingId, setRenamingId] = useState<string | null>(null);
    const [renameValue, setRenameValue] = useState("");
    const renameInputRef = useRef<HTMLInputElement>(null);

    const startRename = useCallback((id: string, currentName: string) => {
        setRenamingId(id);
        setRenameValue(currentName);
    }, []);

    // Focus the rename input when it appears (React-safe alternative to setTimeout)
    useEffect(() => {
        if (renamingId) {
            renameInputRef.current?.focus();
            renameInputRef.current?.select();
        }
    }, [renamingId]);

    const finishRename = useCallback(() => {
        if (!renamingId) return;
        renameDrawing(renamingId, renameValue);
        setRenamingId(null);
    }, [renamingId, renameValue, renameDrawing]);

    return (
        <aside className={`sidebar ${sidebarOpen ? "open" : "closed"}`}>
            <div className="sidebar-header">
                <h1 className="sidebar-title">
                    <img
                        src="./elysium-icon.png"
                        alt="Elysium Ink"
                        className="sidebar-logo-img"
                    />{" "}
                    Elysium Ink
                </h1>
            </div>

            <div className="sidebar-actions">
                <button className="btn btn-primary" onClick={createDrawing}>
                    <span>＋</span> New Drawing
                </button>
            </div>

            <nav className="drawings-list">
                {drawings.map((d) => (
                    <div
                        key={d.id}
                        className={`drawing-item ${d.id === activeDrawingId ? "active" : ""
                            }`}
                        onClick={() => {
                            if (d.id !== activeDrawingId) setActiveDrawing(d.id);
                        }}
                    >
                        {renamingId === d.id ? (
                            <input
                                ref={renameInputRef}
                                className="rename-input"
                                value={renameValue}
                                onChange={(e) => setRenameValue(e.target.value)}
                                onBlur={finishRename}
                                onKeyDown={(e) => {
                                    if (e.key === "Enter") finishRename();
                                    if (e.key === "Escape") setRenamingId(null);
                                }}
                                onClick={(e) => e.stopPropagation()}
                            />
                        ) : (
                            <span
                                className="drawing-name"
                                onDoubleClick={(e) => {
                                    e.stopPropagation();
                                    startRename(d.id, d.name);
                                }}
                            >
                                {d.name}
                            </span>
                        )}
                        {drawings.length > 1 && (
                            <button
                                className="btn-icon btn-delete"
                                title="Delete drawing"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    if (
                                        window.confirm(
                                            `Delete "${d.name}"? This cannot be undone.`
                                        )
                                    ) {
                                        deleteDrawing(d.id);
                                    }
                                }}
                            >
                                ✕
                            </button>
                        )}
                    </div>
                ))}
            </nav>

        </aside>
    );
}
