/**
 * DrawingsContext.tsx — Dual-context pattern for drawings state management.
 *
 * Following the React documentation's recommended approach (Context7):
 * - DrawingsContext holds the state (drawings list + activeDrawingId)
 * - DrawingsDispatchContext holds the dispatch function
 *
 * This separation ensures components that only dispatch actions
 * (e.g. creating/deleting) don't re-render when the drawings list changes.
 */

import {
    createContext,
    useContext,
    useReducer,
    useEffect,
    useRef,
    useCallback,
    type ReactNode,
    type Dispatch,
} from "react";
import {
    getDrawingsIndex,
    saveDrawingsIndex,
    deleteDrawing as deleteDrawingFromDB,
    type DrawingMeta,
} from "../lib/storage";

// ─── Generate a unique ID ────────────────────────────────────────
function generateId(): string {
    return crypto.randomUUID();
}

// ─── State shape ─────────────────────────────────────────────────
export interface DrawingsState {
    drawings: DrawingMeta[];
    activeDrawingId: string | null;
    isBooting: boolean;
}

// ─── Actions ─────────────────────────────────────────────────────
export type DrawingsAction =
    | { type: "BOOT_COMPLETE"; drawings: DrawingMeta[]; activeId: string }
    | { type: "SET_ACTIVE"; id: string }
    | { type: "CREATE"; meta: DrawingMeta }
    | { type: "DELETE"; id: string }
    | { type: "RENAME"; id: string; name: string };

// ─── Reducer ─────────────────────────────────────────────────────
function drawingsReducer(
    state: DrawingsState,
    action: DrawingsAction
): DrawingsState {
    switch (action.type) {
        case "BOOT_COMPLETE":
            return {
                ...state,
                drawings: action.drawings,
                activeDrawingId: action.activeId,
                isBooting: false,
            };

        case "SET_ACTIVE":
            return { ...state, activeDrawingId: action.id };

        case "CREATE": {
            const updated = [...state.drawings, action.meta];
            return {
                ...state,
                drawings: updated,
                activeDrawingId: action.meta.id,
            };
        }

        case "DELETE": {
            if (state.drawings.length <= 1) return state; // always keep at least one
            const updated = state.drawings.filter((d) => d.id !== action.id);
            return {
                ...state,
                drawings: updated,
                activeDrawingId:
                    state.activeDrawingId === action.id
                        ? updated[0].id
                        : state.activeDrawingId,
            };
        }

        case "RENAME": {
            const trimmed = action.name.trim();
            if (!trimmed) return state;
            const updated = state.drawings.map((d) =>
                d.id === action.id
                    ? { ...d, name: trimmed, updatedAt: Date.now() }
                    : d
            );
            return { ...state, drawings: updated };
        }

        default:
            return state;
    }
}

const initialState: DrawingsState = {
    drawings: [],
    activeDrawingId: null,
    isBooting: true,
};

// ─── Contexts ────────────────────────────────────────────────────
const DrawingsContext = createContext<DrawingsState>(initialState);
const DrawingsDispatchContext = createContext<Dispatch<DrawingsAction>>(
    () => { } // no-op default
);

// ─── Custom hooks ────────────────────────────────────────────────
export function useDrawings(): DrawingsState {
    return useContext(DrawingsContext);
}

export function useDrawingsDispatch(): Dispatch<DrawingsAction> {
    return useContext(DrawingsDispatchContext);
}

// ─── Helper: action creators with side-effects ───────────────────
export function useDrawingsActions() {
    const dispatch = useDrawingsDispatch();
    const { drawings } = useDrawings();

    const createDrawing = useCallback(() => {
        const newId = generateId();
        // Find the next unused number to avoid duplicate names after deletions
        const existingNames = new Set(drawings.map((d) => d.name));
        let n = drawings.length + 1;
        while (existingNames.has(`Drawing ${n}`)) n++;
        const meta: DrawingMeta = {
            id: newId,
            name: `Drawing ${n}`,
            createdAt: Date.now(),
            updatedAt: Date.now(),
        };
        dispatch({ type: "CREATE", meta });
        // Sync URL hash so this tab tracks the new drawing
        window.location.hash = `drawing-${newId}`;
    }, [dispatch, drawings]);

    const deleteDrawing = useCallback(
        (id: string) => {
            dispatch({ type: "DELETE", id });
        },
        [dispatch]
    );

    const renameDrawing = useCallback(
        (id: string, name: string) => {
            dispatch({ type: "RENAME", id, name });
        },
        [dispatch]
    );

    const setActiveDrawing = useCallback(
        (id: string) => {
            dispatch({ type: "SET_ACTIVE", id });
            // Sync URL hash so each tab remembers its drawing
            window.location.hash = `drawing-${id}`;
        },
        [dispatch]
    );

    return { createDrawing, deleteDrawing, renameDrawing, setActiveDrawing };
}

// ─── Provider ────────────────────────────────────────────────────
export function DrawingsProvider({ children }: { children: ReactNode }) {
    const [state, dispatch] = useReducer(drawingsReducer, initialState);
    const prevDrawingsRef = useRef<string>("");

    // Boot: load index, resolve active drawing from URL hash or default
    useEffect(() => {
        let cancelled = false;
        (async () => {
            let index = await getDrawingsIndex();
            if (cancelled) return;

            // If no drawings exist, create the first one
            if (index.length === 0) {
                const firstId = generateId();
                index = [
                    {
                        id: firstId,
                        name: "Untitled Drawing",
                        createdAt: Date.now(),
                        updatedAt: Date.now(),
                    },
                ];
                await saveDrawingsIndex(index);
                if (cancelled) return;
            }

            // Resolve active drawing from URL hash (e.g. #drawing-abc123)
            const hashId = window.location.hash.replace(/^#drawing-/, "");
            const fromHash = hashId && index.find((d) => d.id === hashId);
            const activeId = fromHash ? fromHash.id : index[0].id;

            // Sync hash to URL so bookmarks/new-tabs work
            window.location.hash = `drawing-${activeId}`;

            dispatch({
                type: "BOOT_COMPLETE",
                drawings: index,
                activeId,
            });
        })();
        return () => {
            cancelled = true;
        };
    }, []);

    // Persist drawings index to IndexedDB whenever drawings change
    useEffect(() => {
        if (state.isBooting) return;
        const serialized = JSON.stringify(state.drawings);
        if (serialized === prevDrawingsRef.current) return; // no change
        prevDrawingsRef.current = serialized;
        saveDrawingsIndex(state.drawings).catch((err) =>
            console.error("Failed to persist drawings index:", err)
        );
    }, [state.drawings, state.isBooting]);

    // Side-effect: clean up DB when a drawing is deleted
    // We track removed IDs by comparing previous vs current
    const prevIdsRef = useRef<Set<string>>(new Set());
    useEffect(() => {
        if (state.isBooting) return;
        const currentIds = new Set(state.drawings.map((d) => d.id));
        for (const id of prevIdsRef.current) {
            if (!currentIds.has(id)) {
                deleteDrawingFromDB(id).catch((err) =>
                    console.error(`Failed to delete drawing ${id} from DB:`, err)
                );
            }
        }
        prevIdsRef.current = currentIds;
    }, [state.drawings, state.isBooting]);

    return (
        <DrawingsContext value={state}>
            <DrawingsDispatchContext value={dispatch}>
                {children}
            </DrawingsDispatchContext>
        </DrawingsContext>
    );
}
