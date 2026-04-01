const fs = require('fs');
const path = require('path');

const librariesJsonPath = 'c:/Users/Raghvendra/Desktop/coding-and-dev/excalidraw/excalidraw-libraries/libraries.json';
const librariesDir = 'c:/Users/Raghvendra/Desktop/coding-and-dev/excalidraw/excalidraw-libraries/libraries';

const librariesList = JSON.parse(fs.readFileSync(librariesJsonPath, 'utf8'));

let totalItems = [];

for (const lib of librariesList) {
    const libPath = path.join(librariesDir, lib.source);
    if (fs.existsSync(libPath)) {
        const libContent = fs.readFileSync(libPath, 'utf8');
        try {
            const parsed = JSON.parse(libContent);
            if (parsed.libraryItems) {
                totalItems = totalItems.concat(parsed.libraryItems);
            }
        } catch (e) {
            console.error('Failed to parse', libPath);
        }
    }
}

const outPath = 'c:/Users/Raghvendra/Desktop/coding-and-dev/excalidraw/custom-excalidraw/public/default-library.json';
fs.writeFileSync(outPath, JSON.stringify({
    type: "excalidrawlib",
    version: 2,
    source: "custom-excalidraw",
    libraryItems: totalItems
}));

console.log('Total items:', totalItems.length);
console.log('File size:', fs.statSync(outPath).size / 1024 / 1024, 'MB');
