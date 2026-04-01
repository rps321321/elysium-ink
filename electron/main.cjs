/**
 * Electron Main Process — Elysium Creative Studio
 *
 * Creates a native desktop window wrapping the Vite-built React app.
 * Includes crash recovery, GPU acceleration, and secure IPC.
 */

const { app, BrowserWindow, ipcMain, dialog, crashReporter, session } = require("electron");
const path = require("node:path");
const fs = require("node:fs");

// ─── Crash Reporter (medical-grade disaster recovery) ────────────
crashReporter.start({
    productName: "Elysium Creative Studio",
    companyName: "Elysium",
    uploadToServer: false, // Zero telemetry — crashes stay local
});

// ─── Determine if we're in dev or production ─────────────────────
const isDev = !app.isPackaged;

let mainWindow = null;

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1400,
        height: 900,
        minWidth: 800,
        minHeight: 600,
        title: "Elysium Creative Studio",
        icon: path.join(__dirname, "..", "public", "app_icon.ico"),
        backgroundColor: "#1a1a2e",
        show: false, // Don't show until ready to prevent white flash
        webPreferences: {
            preload: path.join(__dirname, "preload.cjs"),
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: true,
        },
    });

    // ─── Load the app ──────────────────────────────────────────────
    if (isDev) {
        // In development, load from the Vite dev server
        mainWindow.loadURL("http://localhost:5173");
        // Open DevTools in dev mode
        mainWindow.webContents.openDevTools({ mode: "detach" });
    } else {
        // In production, load the built index.html from dist/
        mainWindow.loadFile(path.join(__dirname, "..", "dist", "index.html"));
    }

    // Show window gracefully once content is painted
    mainWindow.once("ready-to-show", () => {
        mainWindow.show();
    });

    // ─── Crash Recovery ────────────────────────────────────────────
    mainWindow.webContents.on("render-process-gone", (_event, details) => {
        console.error("Renderer process crashed:", details.reason);

        // Attempt to recover by reloading
        const response = dialog.showMessageBoxSync(mainWindow, {
            type: "error",
            title: "Elysium Creative Studio — Crash Recovery",
            message: `The drawing engine crashed (${details.reason}). Your last auto-saved state in IndexedDB should be intact.`,
            detail: "Would you like to reload the application?",
            buttons: ["Reload", "Quit"],
            defaultId: 0,
        });

        if (response === 0) {
            mainWindow.reload();
        } else {
            app.quit();
        }
    });

    mainWindow.on("closed", () => {
        mainWindow = null;
    });
}

// ─── App lifecycle ───────────────────────────────────────────────
app.whenReady().then(() => {
    // ─── Content Security Policy ──────────────────────────────────
    session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
        callback({
            responseHeaders: {
                ...details.responseHeaders,
                "Content-Security-Policy": [
                    "default-src 'self';" +
                    " script-src 'self';" +
                    " style-src 'self' 'unsafe-inline';" +
                    " img-src 'self' data: blob:;" +
                    " font-src 'self';" +
                    " connect-src 'self'" + (isDev ? " ws://localhost:*" : "") + ";"
                ],
            },
        });
    });

    createWindow();

    // macOS: re-create window when dock icon is clicked
    app.on("activate", () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
});

app.on("window-all-closed", () => {
    if (process.platform !== "darwin") {
        app.quit();
    }
});

// ─── IPC Handlers (secure native file operations) ────────────────

// Security: Only allow writing to paths explicitly chosen by the user
// through the native OS save dialog. This prevents a compromised renderer
// from writing to arbitrary file system locations (Context7 best practice).
const approvedSavePaths = new Set();

// Save file to disk (triggered from renderer via preload bridge)
ipcMain.handle("file:save-dialog", async (_event, defaultName) => {
    if (!mainWindow) return null;

    const result = await dialog.showSaveDialog(mainWindow, {
        title: "Save Elysium Backup",
        defaultPath: defaultName || "elysium-backup.excalidraw",
        filters: [
            { name: "Excalidraw Files", extensions: ["excalidraw"] },
            { name: "JSON Files", extensions: ["json"] },
            { name: "All Files", extensions: ["*"] },
        ],
    });

    if (result.canceled || !result.filePath) return null;

    // Approve this path for a subsequent write
    const normalizedPath = path.resolve(result.filePath);
    approvedSavePaths.add(normalizedPath);
    return result.filePath;
});

ipcMain.handle("file:write", async (_event, filePath, data) => {
    // Validate that this path was approved by a prior save dialog
    const normalizedPath = path.resolve(filePath);
    if (!approvedSavePaths.has(normalizedPath)) {
        console.error("Blocked write to unapproved path:", filePath);
        return { success: false, error: "Write denied: path not approved by save dialog." };
    }

    try {
        await fs.promises.writeFile(normalizedPath, data, "utf-8");
        // Consume the approval — one dialog approval = one write
        approvedSavePaths.delete(normalizedPath);
        return { success: true };
    } catch (err) {
        console.error("Failed to write file:", err);
        return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
});

// Open file dialog (for importing .excalidraw files)
ipcMain.handle("file:open-dialog", async () => {
    if (!mainWindow) return null;

    const result = await dialog.showOpenDialog(mainWindow, {
        title: "Import Excalidraw File",
        filters: [
            { name: "Excalidraw Files", extensions: ["excalidraw", "excalidrawlib", "json"] },
            { name: "All Files", extensions: ["*"] },
        ],
        properties: ["openFile"],
    });

    if (result.canceled || result.filePaths.length === 0) return null;

    const filePath = result.filePaths[0];
    const content = await fs.promises.readFile(filePath, "utf-8");
    return { filePath, content };
});
