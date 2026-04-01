/**
 * Custom font registration for Elysium Creative Studio.
 *
 * This module handles the CSS @font-face injection for our custom fonts.
 * The actual font registration into Excalidraw's internal Fonts system 
 * is handled by the postinstall patch script (scripts/patch-excalidraw-fonts.cjs)
 * which directly modifies FONT_FAMILY, FONT_METADATA, and Fonts.init() 
 * in the pre-built Excalidraw chunk.
 *
 * This module just needs to ensure the browser has the @font-face rules
 * so it can render the fonts that are now registered in Excalidraw.
 *
 * LICENSE: All fonts use SIL Open Font License (OFL) — 100% free for
 * commercial use. Safe to sell.
 */

// ─── Custom Font Definitions ─────────────────────────────────────
interface CustomFontDef {
    name: string;
    id: number;
    file: string;
}

export const CUSTOM_FONTS: CustomFontDef[] = [
    { name: "Indie Flower", id: 101, file: "IndieFlower-Regular.woff2" },
    { name: "Kalam", id: 102, file: "Kalam-Regular.woff2" },
    { name: "Amatic SC", id: 103, file: "AmaticSC-Regular.woff2" },
    { name: "Lora", id: 104, file: "Lora-Regular.woff2" },
    { name: "Merriweather", id: 105, file: "Merriweather-Regular.woff2" },
    { name: "Cormorant", id: 106, file: "Cormorant-Regular.woff2" },
    { name: "Fira Code", id: 107, file: "FiraCode-Regular.woff2" },
    { name: "JetBrains Mono", id: 108, file: "JetBrainsMono-Regular.woff2" },
];

// ─── Inject @font-face CSS rules into the document ───────────────
function injectFontFaces() {
    if (document.getElementById("elysium-custom-fonts")) return;

    const style = document.createElement("style");
    style.id = "elysium-custom-fonts";

    const rules = CUSTOM_FONTS.map(
        (f) => `
@font-face {
  font-family: '${f.name}';
  src: url('./fonts/${f.file}') format('woff2');
  font-weight: 400;
  font-style: normal;
  font-display: swap;
}`
    ).join("\n");

    style.textContent = rules;
    document.head.appendChild(style);
}

// ─── Public init function ────────────────────────────────────────
let initialized = false;

export function initCustomFonts() {
    if (initialized) return;
    initialized = true;

    injectFontFaces();

    if (import.meta.env.DEV) {
        console.log(
            `[Elysium] Injected CSS @font-face for ${CUSTOM_FONTS.length} custom fonts:`,
            CUSTOM_FONTS.map((f) => f.name)
        );
    }
}
