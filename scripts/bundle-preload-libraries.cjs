/**
 * bundle-preload-libraries.cjs
 * 
 * Reads public/libraries.json (the catalog of all 229 community libraries),
 * then reads each corresponding .excalidrawlib file from public/libraries/,
 * and outputs a single unified JSON file: public/preload-libraries-directory.json
 * 
 * The output maps each library's source path to its parsed library items array,
 * so the LibraryBrowser can instantly inject them without any network fetches.
 * 
 * Usage: node scripts/bundle-preload-libraries.cjs
 */

const fs = require("fs");
const path = require("path");

const PUBLIC_DIR = path.resolve(__dirname, "..", "public");
const CATALOG_PATH = path.join(PUBLIC_DIR, "libraries.json");
const LIBRARIES_DIR = path.join(PUBLIC_DIR, "libraries");
const OUTPUT_PATH = path.join(PUBLIC_DIR, "preload-libraries-directory.json");

function main() {
    console.log("📦 Bundling all community libraries into a single JSON file...\n");

    // 1. Read the catalog
    if (!fs.existsSync(CATALOG_PATH)) {
        console.error("❌ Cannot find libraries.json at:", CATALOG_PATH);
        process.exit(1);
    }

    const catalog = JSON.parse(fs.readFileSync(CATALOG_PATH, "utf-8"));
    console.log(`Found ${catalog.length} libraries in catalog.\n`);

    // 2. Build the directory mapping: source -> libraryItems[]
    const directory = {};
    let successCount = 0;
    let failCount = 0;
    let totalItems = 0;

    for (const entry of catalog) {
        const sourcePath = entry.source; // e.g. "slobodan/aws-serverless.excalidrawlib"
        const fullPath = path.join(LIBRARIES_DIR, sourcePath);

        if (!fs.existsSync(fullPath)) {
            console.warn(`⚠️  Missing file: ${sourcePath}`);
            failCount++;
            continue;
        }

        try {
            const raw = fs.readFileSync(fullPath, "utf-8");
            const parsed = JSON.parse(raw);

            // .excalidrawlib files store items under "library" (array) 
            // or sometimes "libraryItems" (array)
            const items = parsed.library || parsed.libraryItems || [];

            if (!Array.isArray(items) || items.length === 0) {
                console.warn(`⚠️  No library items found in: ${sourcePath}`);
                failCount++;
                continue;
            }

            directory[sourcePath] = items;
            totalItems += items.length;
            successCount++;
        } catch (err) {
            console.warn(`⚠️  Failed to parse: ${sourcePath} — ${err.message}`);
            failCount++;
        }
    }

    // 3. Write the output
    const output = JSON.stringify(directory);
    fs.writeFileSync(OUTPUT_PATH, output, "utf-8");

    const sizeMB = (Buffer.byteLength(output, "utf-8") / 1024 / 1024).toFixed(2);

    console.log(`\n✅ Bundle complete!`);
    console.log(`   Libraries bundled: ${successCount}`);
    console.log(`   Libraries skipped: ${failCount}`);
    console.log(`   Total items:       ${totalItems}`);
    console.log(`   Output size:       ${sizeMB} MB`);
    console.log(`   Output:            ${OUTPUT_PATH}`);
}

main();
