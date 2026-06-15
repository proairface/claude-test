// Single import point for the cross-browser WebExtension API.
// Using the promise-based `browser.*` namespace via webextension-polyfill lets
// the exact same source run on Firefox and Chromium.
//
// TODO(M1): `import browser from "webextension-polyfill";` once bundling exists.
// During scaffold we fall back to globalThis so files are importable as-is.
const browser = globalThis.browser ?? globalThis.chrome;
export default browser;
