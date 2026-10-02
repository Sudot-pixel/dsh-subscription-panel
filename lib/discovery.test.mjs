import assert from "node:assert/strict";
import { DISCOVERY_CATALOG, validateCatalog } from "./discovery-catalog.js";
import { inspectCredential } from "./credential-discovery.js";
import { discoveredPlatform, mergePlatforms, normalizeDiscoveryResult } from "./discovery-state.js";
import { syncAccountSource } from "./discovery-sync.js";

validateCatalog();
assert.equal(DISCOVERY_CATALOG.length, 2);
assert.ok(DISCOVERY_CATALOG.every((item) => item.sources.every((source) => !("balance" in source) && !("budget" in source))));
assert.throws(() => validateCatalog([{ id: "x", name: "X", logoKey: "x", currency: "USD", sources: [{ type: "credential", keyRef: "X_KEY", endpoint: "http://example.com", balancePath: "data.balance" }] }]));
assert.throws(() => validateCatalog(DISCOVERY_CATALOG.concat(DISCOVERY_CATALOG[0])));
assert.throws(() => validateCatalog([{ id: "openai", name: "OpenAI", logoKey: "openai", currency: "USD", sources: [{ type: "credential", keyRef: "OPENAI_API_KEY", endpoint: "https://evil.example/usage", balancePath: "data.balance" }] }]));

const account = discoveredPlatform(DISCOVERY_CATALOG[0], { type: "account" });
const normalized = normalizeDiscoveryResult(account, { status: "exhausted", balance: 0 });
assert.equal(normalized.balance, 0);
assert.equal(normalized.status, "exhausted");

const manual = { id: "deepseek", name: "我的 DeepSeek", currency: "CNY", mode: "manual", balance: 99, budget: 100, renewUrl: "https://example.com/renew" };
const live = normalizeDiscoveryResult({ ...account, source: "discovered", discovered: true }, { status: "ok", balance: 12 });
const merged = mergePlatforms([manual], [live]);
assert.equal(merged.length, 1);
assert.equal(merged[0].name, "我的 DeepSeek");
assert.equal(merged[0].renewUrl, manual.renewUrl);
assert.equal(merged[0].balance, 12);
assert.equal(merged[0].budget, 100);
assert.equal(merged[0].source, "manual+discovered");
assert.deepEqual(mergePlatforms([manual], [live]), merged);

const credentials = { resolve: async (ref) => ref === "KNOWN" ? { value: "secret-not-returned" } : null };
assert.equal((await inspectCredential(credentials, "KNOWN")).status, "present");
assert.equal((await inspectCredential(credentials, "MISSING")).status, "missing");
assert.equal((await inspectCredential(null, "KNOWN")).status, "unavailable");
assert.equal((await inspectCredential({ resolve: async () => { throw new Error("secret error"); } }, "KNOWN")).status, "unavailable");

const fakeAccount = {
  getBalance: async () => ({
    status: "ready",
    value: [{ currency: "CNY", balance: 10 }, { currency: "USD", balance: 99 }],
    bonusWallets: [{ currency: "CNY", balance: 2 }]
  })
};
const accountResult = await syncAccountSource(DISCOVERY_CATALOG[0], { type: "account" }, fakeAccount);
assert.equal(accountResult.status, "ok");
assert.equal(accountResult.balance, 12);
assert.equal((await syncAccountSource(DISCOVERY_CATALOG[0], { type: "account" }, null)).status, "no-account");

console.log("DISCOVERY_TEST=PASS");
