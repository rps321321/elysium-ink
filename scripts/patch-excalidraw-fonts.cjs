/**
 * Post-install script to patch Excalidraw's bundled chunks with custom fonts.
 *
 * Excalidraw's font system is entirely internal — the Fonts class, FONT_METADATA,
 * and font registration are not exported. This script patches BOTH the dev and
 * prod pre-built chunks to inject custom font registrations.
 *
 * Run automatically via npm's "postinstall" lifecycle hook.
 *
 * LICENSE: All fonts use SIL Open Font License (OFL) — 100% free for
 * commercial use.
 */

const fs = require("fs");
const path = require("path");

// ─── Custom Font Definitions ─────────────────────────────────────
const CUSTOM_FONTS = [
    { name: "Indie Flower", id: 101, unitsPerEm: 1000, ascender: 1030, descender: -432, lineHeight: 1.45 },
    { name: "Kalam", id: 102, unitsPerEm: 1000, ascender: 1055, descender: -474, lineHeight: 1.5 },
    { name: "Amatic SC", id: 103, unitsPerEm: 1000, ascender: 1100, descender: -500, lineHeight: 1.35 },
    { name: "Lora", id: 104, unitsPerEm: 1000, ascender: 1021, descender: -365, lineHeight: 1.35 },
    { name: "Merriweather", id: 105, unitsPerEm: 1000, ascender: 985, descender: -300, lineHeight: 1.3 },
    { name: "Cormorant", id: 106, unitsPerEm: 1000, ascender: 950, descender: -350, lineHeight: 1.3 },
    { name: "Fira Code", id: 107, unitsPerEm: 1000, ascender: 935, descender: -265, lineHeight: 1.2 },
    { name: "JetBrains Mono", id: 108, unitsPerEm: 1000, ascender: 1020, descender: -300, lineHeight: 1.2 },
];

// ─── Find chunk files ────────────────────────────────────────────
function findChunkFiles() {
    const projectRoot = path.resolve(__dirname, "..");
    const distDir = path.join(
        projectRoot,
        "node_modules",
        "@excalidraw",
        "excalidraw",
        "dist"
    );

    const results = [];

    for (const subdir of ["dev", "prod"]) {
        const dir = path.join(distDir, subdir);
        if (!fs.existsSync(dir)) continue;

        const files = fs.readdirSync(dir);
        for (const file of files) {
            if (file.startsWith("chunk-") && file.endsWith(".js")) {
                const filePath = path.join(dir, file);
                const content = fs.readFileSync(filePath, "utf8");
                // Find chunks that contain the Virgil font reference
                if (content.includes('"Virgil"') || content.includes("'Virgil'")) {
                    results.push({ path: filePath, subdir, file });
                }
            }
        }
    }

    return results;
}

// ─── Patch a single chunk ────────────────────────────────────────
function patchChunk(filePath, subdir) {
    let code = fs.readFileSync(filePath, "utf8");
    const originalLength = code.length;

    // Check if already patched
    if (code.includes("Elysium Custom Fonts")) {
        console.log(`[Elysium Font Patch] [${subdir}] Already patched, skipping.`);
        return true;
    }

    let patchCount = 0;

    // ── Patch 1: Add FONT_FAMILY entries ──
    // Dev pattern:  "Liberation Sans": 9\n}
    // Prod pattern: "Liberation Sans":9}
    const fontFamilyPattern = /(["']Liberation Sans["']\s*:\s*9)\s*\}(?!\s*\))/;
    const fontFamilyMatch = code.match(fontFamilyPattern);

    if (fontFamilyMatch) {
        const customEntries = CUSTOM_FONTS
            .map((f) => `"${f.name}":${f.id}`)
            .join(",");

        code = code.replace(
            fontFamilyPattern,
            `$1,${customEntries}}`
        );
        patchCount++;
        console.log(`[Elysium Font Patch] [${subdir}] ✓ Patched FONT_FAMILY`);
    } else {
        console.warn(`[Elysium Font Patch] [${subdir}] ✗ Could not find FONT_FAMILY pattern`);
    }

    // ── Patch 2: Add FONT_METADATA entries ──
    // Dev pattern:  has "var GOOGLE_FONTS_RANGES" marker
    // Prod pattern: has the same FONT_METADATA with numeric keys [5]: {...}
    // We find the last FONT_METADATA entry before the Fonts class
    // Common approach: find the pattern [9]: { metrics: ... } or [9]:{metrics:...}
    // and append our entries after it

    // Try dev pattern first (var GOOGLE_FONTS_RANGES marker)
    let metadataPatched = false;
    const devMetadataMarker = "var GOOGLE_FONTS_RANGES";
    const devMetadataIdx = code.indexOf(devMetadataMarker);

    if (devMetadataIdx > 0) {
        const beforeRanges = code.substring(0, devMetadataIdx);
        const lastClosingBrace = beforeRanges.lastIndexOf("};");

        if (lastClosingBrace > 0) {
            const customMetadata = CUSTOM_FONTS
                .map(
                    (f) => `[${f.id}]:{metrics:{unitsPerEm:${f.unitsPerEm},ascender:${f.ascender},descender:${f.descender},lineHeight:${f.lineHeight}},local:true}`
                )
                .join(",");

            code =
                code.substring(0, lastClosingBrace) +
                "," + customMetadata +
                code.substring(lastClosingBrace);
            patchCount++;
            metadataPatched = true;
            console.log(`[Elysium Font Patch] [${subdir}] ✓ Patched FONT_METADATA (dev marker)`);
        }
    }

    // Try prod pattern: find [9]:{metrics:... pattern (Liberation Sans = font ID 9)
    if (!metadataPatched) {
        // In prod, FONT_METADATA is a compact object. Find the last entry [9]:{...}
        // and add our entries after it
        const prodMetadataPattern = /(\[9\]\s*:\s*\{[^}]*metrics[^}]*\}[^}]*\})/;
        const prodMatch = code.match(prodMetadataPattern);

        if (prodMatch) {
            const customMetadata = CUSTOM_FONTS
                .map(
                    (f) => `[${f.id}]:{metrics:{unitsPerEm:${f.unitsPerEm},ascender:${f.ascender},descender:${f.descender},lineHeight:${f.lineHeight}},local:true}`
                )
                .join(",");

            code = code.replace(
                prodMetadataPattern,
                `$1,${customMetadata}`
            );
            patchCount++;
            metadataPatched = true;
            console.log(`[Elysium Font Patch] [${subdir}] ✓ Patched FONT_METADATA (prod pattern)`);
        } else {
            console.warn(`[Elysium Font Patch] [${subdir}] ✗ Could not find FONT_METADATA pattern`);
        }
    }

    // ── Patch 3: Add init() calls in Fonts.init() ──
    // Dev pattern: init("Virgil", ...VirgilFontFaces);
    // Prod pattern: n("Virgil",...yc)  (minified names)
    // Common: the string "Virgil" is always present, preceded by an init call pattern

    // Try dev pattern first
    let initPatched = false;
    const devInitPattern = /(init\("Virgil",\s*\.\.\.VirgilFontFaces\);?)/;
    const devInitMatch = code.match(devInitPattern);

    if (devInitMatch) {
        const customInits = CUSTOM_FONTS
            .map(
                (f) => `init("${f.name}",{uri:"local:",descriptors:{}});`
            )
            .join("");

        code = code.replace(
            devInitPattern,
            `$1\n    // ── Elysium Custom Fonts ──\n    ${customInits}`
        );
        patchCount++;
        initPatched = true;
        console.log(`[Elysium Font Patch] [${subdir}] ✓ Patched Fonts.init() (dev pattern)`);
    }

    // Try prod pattern: n("Virgil",...varName)
    if (!initPatched) {
        // Match: someVar("Virgil",...someOtherVar)  — minified init call
        const prodInitPattern = /(\w+\("Virgil",\.\.\.\w+\))/;
        const prodInitMatch = code.match(prodInitPattern);

        if (prodInitMatch) {
            // Extract the function name used for init
            const initFuncMatch = prodInitMatch[1].match(/^(\w+)\(/);
            const initFunc = initFuncMatch ? initFuncMatch[1] : "n";

            const customInits = CUSTOM_FONTS
                .map(
                    (f) => `${initFunc}("${f.name}",{uri:"local:",descriptors:{}})`
                )
                .join(",");

            code = code.replace(
                prodInitPattern,
                `$1,/* Elysium Custom Fonts */${customInits}`
            );
            patchCount++;
            initPatched = true;
            console.log(`[Elysium Font Patch] [${subdir}] ✓ Patched Fonts.init() (prod pattern, func="${initFunc}")`);
        } else {
            console.warn(`[Elysium Font Patch] [${subdir}] ✗ Could not find Fonts.init() pattern`);
        }
    }

    if (patchCount < 2) {
        console.error(`[Elysium Font Patch] [${subdir}] Only ${patchCount}/3 patches applied — too few to be reliable!`);
        return false;
    }

    // Write the patched file
    fs.writeFileSync(filePath, code, "utf8");
    console.log(
        `[Elysium Font Patch] [${subdir}] Done! Applied ${patchCount}/3 patches.`,
        `File size: ${originalLength} → ${code.length} bytes`
    );
    return true;
}

// ─── Main ────────────────────────────────────────────────────────
function main() {
    console.log("[Elysium Font Patch] Searching for Excalidraw chunks...");

    const chunks = findChunkFiles();
    if (chunks.length === 0) {
        console.error(
            "[Elysium Font Patch] Could not find any Excalidraw chunk files!",
            "Make sure @excalidraw/excalidraw is installed."
        );
        process.exit(1);
    }

    console.log(`[Elysium Font Patch] Found ${chunks.length} chunks to patch:`);
    for (const chunk of chunks) {
        console.log(`  - ${chunk.subdir}/${chunk.file}`);
    }

    let allSuccess = true;
    for (const chunk of chunks) {
        const success = patchChunk(chunk.path, chunk.subdir);
        if (!success) allSuccess = false;
    }

    if (allSuccess) {
        console.log("[Elysium Font Patch] All chunks patched successfully! ✓");
    } else {
        console.error("[Elysium Font Patch] Some patches failed. Check warnings above.");
        process.exit(1);
    }
}

main();
