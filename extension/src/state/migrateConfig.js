// Pure config-migration logic (no browser imports) so it's unit-testable in
// plain Node. The storage-backed runner lives in migrate.js.

/** Current config schema version this build expects. */
export const CONFIG_SCHEMA_VERSION = 1;

/**
 * Map of targetVersion -> (cfg) => cfg'. Each migration upgrades config from
 * (target-1) to target. Pure, total, defensive.
 * @type {Record<number, (cfg: object) => object>}
 */
export const CONFIG_MIGRATIONS = {
  // 2: (cfg) => ({ ...cfg, newField: cfg.oldField ?? defaultValue }),
};

/**
 * Bring a config object up to `target`, applying each step in order.
 * @param {object} cfg
 * @param {number} [target]
 * @param {Record<number,(c:object)=>object>} [migrations]
 * @returns {object}
 */
export function migrateConfig(cfg, target = CONFIG_SCHEMA_VERSION, migrations = CONFIG_MIGRATIONS) {
  if (!cfg || typeof cfg !== "object") return cfg;
  let out = { ...cfg };
  let v = Number(out.schemaVersion) || 1;
  while (v < target) {
    const step = migrations[v + 1];
    if (step) out = step(out);
    v += 1;
  }
  out.schemaVersion = target;
  return out;
}
