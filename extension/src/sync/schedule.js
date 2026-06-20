// Pure helpers for the auto-sync scheduler (unit-tested).

// Practical floor we hand to browser.alarms. Note: published Chrome additionally
// clamps periodInMinutes to ~1 min; Firefox honors smaller values. Sub-minute
// "near-instant" updates are best served by event-driven sync, not polling.
export const MIN_PERIOD_MINUTES = 0.1; // ~6s

/**
 * Convert an interval config to alarm minutes.
 * @param {{intervalValue?: number|string, intervalUnit?: "seconds"|"minutes"}} cfg
 * @returns {number|null} minutes, or null if disabled/invalid
 */
export function intervalToMinutes({ intervalValue, intervalUnit } = {}) {
  const v = Number(intervalValue);
  if (!Number.isFinite(v) || v <= 0) return null;
  return intervalUnit === "seconds" ? v / 60 : v;
}

/** Clamp to the alarm floor (callers pass a positive number). */
export function clampPeriod(minutes) {
  return Math.max(MIN_PERIOD_MINUTES, minutes);
}

/**
 * Resolve the alarm period (minutes) for a saved config, or null if auto-sync
 * is off / the interval is invalid.
 */
export function periodForConfig(cfg = {}) {
  if (cfg.autoSync === false) return null;
  const m = intervalToMinutes(cfg);
  return m == null ? null : clampPeriod(m);
}
