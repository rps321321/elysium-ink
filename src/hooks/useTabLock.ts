/**
 * useTabLock.ts — Web Locks API-based tab singleton.
 *
 * Uses navigator.locks.request() with ifAvailable to atomically
 * acquire an exclusive lock. If another tab already holds the lock,
 * acquisition fails instantly (no race condition). Falls back to
 * always-unlocked if the Web Locks API is not available.
 */

import { useEffect, useState } from "react";

const LOCK_NAME = "elysium-tab-lock";

export function useTabLock(): boolean {
    const [isLocked, setIsLocked] = useState(false);

    useEffect(() => {
        // Web Locks API not available — allow the tab
        if (!navigator.locks) return;

        let released = false;

        navigator.locks.request(
            LOCK_NAME,
            { ifAvailable: true },
            (lock) => {
                if (!lock) {
                    // Another tab already holds the lock
                    setIsLocked(true);
                    return;
                }

                // We acquired the lock — hold it until this tab closes.
                // Returning a never-resolving promise keeps the lock held.
                return new Promise<void>((resolve) => {
                    const interval = setInterval(() => {
                        if (released) {
                            clearInterval(interval);
                            resolve();
                        }
                    }, 200);
                    if (released) { clearInterval(interval); resolve(); }
                });
            }
        ).catch(() => {/* lock request failed — allow tab */});

        return () => {
            released = true;
        };
    }, []);

    return isLocked;
}
