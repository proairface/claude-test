// URL filtering for privacy/control: exclude certain domains from sync.
// Pure + unit-tested. A domain entry matches the host and its subdomains
// (e.g. "example.com" matches "example.com" and "mail.example.com").

function normDomain(d) {
  return String(d || "").trim().toLowerCase().replace(/^\*?\.?/, "");
}

/** True if `url`'s host equals or is a subdomain of any entry in `domains`. */
export function hostMatchesAny(url, domains) {
  if (!domains || !domains.length) return false;
  let host;
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return false;
  }
  return domains.some((raw) => {
    const d = normDomain(raw);
    return d && (host === d || host.endsWith(`.${d}`));
  });
}

/** True if the URL should be EXCLUDED from sync per the filters. */
export function isExcluded(url, filters) {
  return hostMatchesAny(url, filters?.excludeDomains);
}

/** Build a keep-predicate: (url) => boolean (true = sync it). */
export function makeUrlFilter(filters) {
  const domains = filters?.excludeDomains;
  if (!domains || !domains.length) return () => true;
  return (url) => !hostMatchesAny(url, domains);
}

/** Parse a textarea/string of domains (newline/comma separated) into a list. */
export function parseDomainList(text) {
  return String(text || "")
    .split(/[\s,]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}
