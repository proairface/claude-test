// Generate placeholder brand icons (PNG) for the extension at the sizes stores
// require. A sync "badge": an indigo disc with a white ring. Replace with final
// artwork before a real store submission — the manifest references these paths.
import { PNG } from "pngjs";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const outDir = resolve(here, "..", "icons");
const SIZES = [16, 32, 48, 128];
const BG = [79, 70, 229]; // indigo
const FG = [255, 255, 255];

function setPx(png, x, y, [r, g, b], a = 255) {
  const i = (png.width * y + x) << 2;
  png.data[i] = r; png.data[i + 1] = g; png.data[i + 2] = b; png.data[i + 3] = a;
}

function render(size) {
  const png = new PNG({ width: size, height: size });
  const c = (size - 1) / 2;
  const discR = size * 0.46;
  const ringOuter = size * 0.34;
  const ringInner = size * 0.22;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const d = Math.hypot(x - c, y - c);
      if (d <= ringOuter && d >= ringInner) setPx(png, x, y, FG);
      else if (d <= discR) setPx(png, x, y, BG);
      else setPx(png, x, y, [0, 0, 0], 0); // transparent
    }
  }
  return PNG.sync.write(png);
}

await mkdir(outDir, { recursive: true });
for (const s of SIZES) {
  await writeFile(resolve(outDir, `icon-${s}.png`), render(s));
}
console.log(`Wrote icons (${SIZES.join(", ")}) -> ${outDir}`);
