const DISCOVERY_STATUSES = Object.freeze([
  "syncing", "ok", "low", "exhausted", "auth-expired", "sync-error", "unrecognized", "stale", "no-account", "account-error"
]);

function numberOrNull(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function discoveredPlatform(catalog, source, status = "syncing") {
  return {
    id: catalog.id,
    name: catalog.name,
    short: catalog.short || catalog.name.slice(0, 2).toUpperCase(),
    logoKey: catalog.logoKey,
    currency: catalog.currency,
    mode: source.type === "account" ? "account" : "auto",
    source: source.type === "account" ? "account" : "discovered",
    discoverySource: source.type,
    status,
    error: null,
    balance: null,
    budget: null,
    monthUsed: null,
    windows: [],
    renewUrl: null,
    renewHosts: [],
    autoRenew: false,
    price: null,
    expireAt: null,
    observedAt: null,
    discovered: true,
    pinned: false,
  };
}

function normalizeDiscoveryResult(base, result = {}) {
  const status = DISCOVERY_STATUSES.includes(result.status) ? result.status : "sync-error";
  return {
    ...base,
    status,
    error: typeof result.error === "string" ? result.error.slice(0, 160) : null,
    balance: numberOrNull(result.balance),
    budget: numberOrNull(result.budget),
    monthUsed: numberOrNull(result.monthUsed),
    windows: Array.isArray(result.windows) ? result.windows : [],
    observedAt: result.observedAt || new Date().toISOString(),
  };
}

function mergePlatforms(manualPlatforms, discoveredPlatforms) {
  const merged = new Map();
  for (const item of Array.isArray(manualPlatforms) ? manualPlatforms : []) {
    merged.set(item.id, { ...item, source: item.source || "manual", discovered: false, pinned: true });
  }
  const discoveredList = Array.isArray(discoveredPlatforms) ? discoveredPlatforms : [];
  for (const discovered of discoveredList) {
    const existing = merged.get(discovered.id);
    if (!existing) {
      merged.set(discovered.id, discovered);
      continue;
    }
    merged.set(discovered.id, {
      ...discovered,
      ...existing,
      source: existing.source === "manual" ? "manual+discovered" : existing.source,
      discovered: true,
      pinned: true,
      // Live discovery data wins; user-owned display and renewal fields remain intact.
      balance: discovered.balance,
      budget: existing.budget ?? discovered.budget,
      monthUsed: discovered.monthUsed ?? existing.monthUsed,
      windows: discovered.windows?.length ? discovered.windows : (existing.windows || []),
      status: discovered.status,
      error: discovered.error,
      observedAt: discovered.observedAt,
    });
  }
  return [...merged.values()];
}

export { DISCOVERY_STATUSES, discoveredPlatform, mergePlatforms, normalizeDiscoveryResult, numberOrNull };
