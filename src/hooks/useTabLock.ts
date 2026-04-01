/**
 * useTabLock.ts — BroadcastChannel-based tab locking.
 * Prevents multiple tabs from simultaneously editing the same drawing,
 * which would cause IndexedDB overwrite corruption.
 */

import { useEffect, useState, useRef } from "react";

const CHANNEL_NAME = "elysium-tab-lock";

export function useTabLock() {
    const [isLocked, setIsLocked] = useState(false);
    const channelRef = useRef<BroadcastChannel | null>(null);

    useEffect(() => {
        const channel = new BroadcastChannel(CHANNEL_NAME);
        channelRef.current = channel;

        // Announce this tab is alive
        channel.postMessage({ type: "TAB_OPEN" });

        channel.onmessage = (event) => {
            if (event.data?.type === "TAB_OPEN") {
                // Another tab just opened — tell it we already exist
                channel.postMessage({ type: "TAB_EXISTS" });
            }
            if (event.data?.type === "TAB_EXISTS") {
                // We are the new tab and another one already exists
                setIsLocked(true);
            }
        };

        return () => {
            channel.close();
            channelRef.current = null;
        };
    }, []);

    return isLocked;
}
