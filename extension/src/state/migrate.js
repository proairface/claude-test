// Storage-backed config migration runner. Run on extension update (see
// background's onInstalled). The pure logic lives in migrateConfig.js.
import browser from "../lib/browser.js";
import { migrateConfig } from "./migrateConfig.js";

export { CONFIG_SCHEMA_VERSION, CONFIG_MIGRATIONS, migrateConfig } from "./migrateConfig.js";

const CONFIG_KEY = "browsersync:config";

/** Apply migrations to the stored config in place (no-op if none needed). */
export async function runConfigMigrations() {
  const current = (await browser.storage.local.get(CONFIG_KEY))[CONFIG_KEY];
  if (!current) return;
  await browser.storage.local.set({ [CONFIG_KEY]: migrateConfig(current) });
}
