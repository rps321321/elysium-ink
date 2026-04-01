/**
 * vite.web.config.ts — Web / PWA build configuration
 *
 * Used by:  npm run build:web   →  dist-web/
 *           npm run dev:web     →  http://localhost:5174
 *           npm run preview:web →  http://localhost:4174
 *
 * Key differences from vite.config.ts (Electron build):
 *   base: '/'  — absolute paths required for HTTP servers
 *               (Electron uses './' for the file:// protocol)
 *   outDir: 'dist-web'  — keeps web and Electron outputs separate
 *   sourcemap: true     — useful for web debugging / error reporting
 *   port: 5174          — avoids clashing with Electron dev server (5173)
 */

import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],

  // Absolute base path — required for any HTTP server deployment
  base: "/",

  // Lean public directory for web — excludes large offline library files
  // (preload-libraries-directory.json, *.excalidrawlib) that are only
  // needed by the Electron desktop build.
  publicDir: "public-web",

  define: {
    "process.env.IS_PREACT": JSON.stringify("false"),
  },

  // Run on a different port so Electron dev and web dev can coexist
  server: {
    port: 5174,
  },

  preview: {
    port: 4174,
  },

  build: {
    outDir: "dist-web",
    // No source maps in the web deployment — keeps dist-web well under
    // Vercel's 100MB limit. Enable locally with VITE_SOURCEMAP=true if needed.
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ["react", "react-dom"],
        },
      },
    },
  },
});
