/**
 * Electron Preload Script — Elysium Creative Studio
 *
 * Securely bridges the Node.js main process with the React renderer.
 * Uses contextBridge to expose ONLY specific, safe APIs.
 */

const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("elysiumDesktop", {
    // Platform detection
    isDesktop: true,
    platform: process.platform,

    // Native file save (bypasses browser download limitations)
    saveFileDialog: (defaultName) =>
        ipcRenderer.invoke("file:save-dialog", defaultName),

    writeFile: (filePath, data) =>
        ipcRenderer.invoke("file:write", filePath, data),

    // Native file open dialog
    openFileDialog: () =>
        ipcRenderer.invoke("file:open-dialog"),
});
