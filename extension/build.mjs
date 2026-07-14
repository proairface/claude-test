// Build the extension for a given browser target into its own output dir.
//   node build.mjs chrome    -> dist/chrome/  (manifest.chrome.json as manifest.json)
//   node build.mjs firefox   -> dist/firefox/ (manifest.firefox.json as manifest.json)
//
// Separate dirs let both targets coexist (load-unpacked in Chromium, web-ext in
// Firefox). Bundles the background service worker and the options page script
// with esbuild (pulling in webextension-polyfill), then copies static assets and
// the chosen manifest.
import { build } from "esbuild";
import { cp, mkdir, rm, copyFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));

const target = process.argv[2] ?? "chrome";
if (!["chrome", "firefox"].includes(target)) {
  console.error(`Unknown target "${target}". Use "chrome" or "firefox".`);
  process.exit(1);
}
const dist = resolve(here, "dist", target);

await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });

await build({
  entryPoints: {
    "background/index": resolve(here, "src/background/index.js"),
    "options/options": resolve(here, "src/options/options.js"),
    "popup/popup": resolve(here, "src/popup/popup.js"),
    "manager/manager": resolve(here, "src/manager/manager.js"),
  },
  outdir: dist,
  bundle: true,
  format: "esm",
  target: target === "firefox" ? ["firefox115"] : ["chrome110"],
  logLevel: "info",
});

// Static assets + the target-specific manifest.
await cp(resolve(here, "src/options/options.html"), resolve(dist, "options/options.html"));
await cp(resolve(here, "src/popup/popup.html"), resolve(dist, "popup/popup.html"));
await cp(resolve(here, "src/manager/manager.html"), resolve(dist, "manager/manager.html"));
await cp(resolve(here, "icons"), resolve(dist, "icons"), { recursive: true });
await copyFile(resolve(here, `manifest.${target}.json`), resolve(dist, "manifest.json"));

console.log(`Built ${target} extension -> ${dist}`);
