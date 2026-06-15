// Single import point for the cross-browser WebExtension API. The polyfill
// provides the promise-based `browser.*` namespace on Chromium (which natively
// exposes callback-based `chrome.*`) and is a no-op passthrough on Firefox, so
// the exact same source runs on both. Bundled into the extension by esbuild.
import browser from "webextension-polyfill";
export default browser;
