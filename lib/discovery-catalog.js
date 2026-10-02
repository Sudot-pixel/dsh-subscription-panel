/**
 * Public, verified discovery metadata. Secrets and user data never live here.
 * Keep providers with unverified balance semantics as manual templates only.
 */
const DISCOVERY_CATALOG = Object.freeze([
  Object.freeze({
    id: "deepseek",
    name: "DeepSeek 官方",
    short: "DS",
    logoKey: "deepseek",
    currency: "CNY",
    sources: Object.freeze([
      Object.freeze({ type: "credential", keyRef: "DEEPSEEK_API_KEY", endpoint: "https://api.deepseek.com/user/balance", auth: "bearer", balancePath: "balance_infos[0].total_balance" }),
      Object.freeze({ type: "account" }),
    ]),
  }),
  Object.freeze({
    id: "commandcode",
    name: "Command Code",
    short: "CC",
    logoKey: "commandcode",
    currency: "USD",
    sources: Object.freeze([
      Object.freeze({ type: "credential", keyRef: "COMMAND_CODE_API_KEY", endpoint: "https://api.commandcode.ai/alpha/billing/credits", auth: "bearer", balancePath: "credits.monthlyCredits" }),
    ]),
  }),
]);

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function validateCatalog(catalog = DISCOVERY_CATALOG) {
  if (!Array.isArray(catalog)) throw new Error("Discovery Catalog 必须是数组");
  const ids = new Set();
  for (const item of catalog) {
    if (!isRecord(item) || !/^[a-z0-9][a-z0-9_-]{0,63}$/.test(item.id || "")) throw new Error("Discovery Catalog 含有无效平台 ID");
    if (ids.has(item.id)) throw new Error(`Discovery Catalog 存在重复平台 ID: ${item.id}`);
    ids.add(item.id);
    if (!item.name || !item.logoKey || !/^[A-Z][A-Z0-9_-]{2,11}$/.test(item.currency || "")) throw new Error(`Discovery Catalog 平台字段不完整: ${item.id}`);
    if (!Array.isArray(item.sources) || item.sources.length === 0) throw new Error(`Discovery Catalog 缺少来源: ${item.id}`);
    if (item.id === "deepseek" && !item.sources.some((source) => source.type === "account")) throw new Error("DeepSeek Catalog 必须保留账号来源");
    for (const source of item.sources) {
      if (!isRecord(source) || !["credential", "account"].includes(source.type)) throw new Error(`Discovery Catalog 来源无效: ${item.id}`);
      if (source.type === "credential") {
        if (!/^[A-Z][A-Z0-9_]{2,127}$/.test(source.keyRef || "")) throw new Error(`Discovery Catalog keyRef 无效: ${item.id}`);
        let endpoint;
        try { endpoint = new URL(source.endpoint); } catch { throw new Error(`Discovery Catalog endpoint 无效: ${item.id}`); }
        const allowedHosts = item.id === "deepseek" ? ["api.deepseek.com"] : item.id === "commandcode" ? ["api.commandcode.ai"] : [];
        if (endpoint.protocol !== "https:" || !allowedHosts.includes(endpoint.hostname.toLowerCase())) throw new Error(`Discovery Catalog endpoint 未通过已验证主机校验: ${item.id}`);
        if (!source.balancePath) throw new Error(`Discovery Catalog 缺少余额路径: ${item.id}`);
      }
    }
  }
  return true;
}

function catalogById(id, catalog = DISCOVERY_CATALOG) {
  return catalog.find((item) => item.id === id) || null;
}

export { DISCOVERY_CATALOG, catalogById, validateCatalog };
