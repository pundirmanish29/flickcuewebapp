// Copies the files text recognition needs into public/ocr, so the site serves them itself: a ticket is read in
// the browser, and nothing is fetched from another host. Run before `vite` and `vite build` (see package.json).
import { copyFileSync, mkdirSync } from "node:fs";

const files = {
  "worker.min.js": "node_modules/tesseract.js/dist/worker.min.js",
  "tesseract-core-lstm.wasm.js": "node_modules/tesseract.js-core/tesseract-core-lstm.wasm.js",
  "tesseract-core-simd-lstm.wasm.js": "node_modules/tesseract.js-core/tesseract-core-simd-lstm.wasm.js",
  "tesseract-core-relaxedsimd-lstm.wasm.js": "node_modules/tesseract.js-core/tesseract-core-relaxedsimd-lstm.wasm.js",
  "eng.traineddata.gz": "node_modules/@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz"
};

mkdirSync("public/ocr", { recursive: true });
for (const [name, from] of Object.entries(files)) copyFileSync(from, `public/ocr/${name}`);
