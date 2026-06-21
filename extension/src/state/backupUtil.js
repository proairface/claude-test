// Pure backup-retention helper (browser-free, testable).
export const MAX_BACKUPS = 3;

/** Keep only the newest `max` backups, sorted newest-first. */
export function trimBackups(list, max = MAX_BACKUPS) {
  return [...list].sort((a, b) => b.ts - a.ts).slice(0, max);
}
