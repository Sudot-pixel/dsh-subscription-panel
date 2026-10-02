import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { pickPath } from "./path.js";
import { resolveCredential } from "./credential-discovery.js";
import { discoveredPlatform, normalizeDiscoveryResult, numberOrNull } from "./discovery-state.js";

const MAX_RESPONSE_BYTES = 1024 * 1024;
const MAX_REDIRECTS = 3;
const REQUEST_TIMEOUT_MS = 12000;

function isBlockedIp(value) {
  const ip = String(value || "").replace(/^\[|\]$/g, "").toLowerCase();
  if (isIP(ip) === 4) {
    const [a, b] = ip.split(".").map(Number);
    return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 192 && b === 168) || (a === 172 && b >= 16 && b <= 31) || (a === 100 && b >= 64 && b <= 127);
  }
  if (isIP(ip) === 6) return ip === "::1" || ip === "::" || ip.startsWith("fc") || ip.startsWith("fd") || /^fe[89ab]/.test(ip);
  return false;
}

function assertSafeUrlShape(value) {
  let parsed;
  try { parsed = new URL(String(value)); } catch { throw new Error("接口地址无效"); }
  if (parsed.protocol !== "https:") throw new Error("接口只允许 HTTPS");
  if (parsed.username || parsed.password) throw new Error("接口不得携带用户名或密码");
  if (parsed.port && parsed.port !== "443") throw new Error("接口不得使用非标准端口");
  const host = parsed.hostname.toLowerCase();
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || isBlockedIp(host)) throw new Error("接口指向了不允许的地址");
  return parsed;
}

async function assertSafeEndpoint(value) {
  const parsed = assertSafeUrlShape(value);
  let addresses;
  try { addresses = await lookup(parsed.hostname, { all: true, verbatim: true }); } catch { throw new Error("接口域名无法解析"); }
  if (!addresses.length || addresses.some((entry) => isBlockedIp(entry.address))) throw new Error("接口解析到了不允许的地址");
  return parsed;
}

async function readJson(response) {
  const declared = Number(response.headers.get("content-length") || 0);
  if (declared > MAX_RESPONSE_BYTES) throw new Error("响应过大");
  const text = await response.text();
  if (Buffer.byteLength(text, "utf8") > MAX_RESPONSE_BYTES) throw new Error("响应过大");
  try { return JSON.parse(text); } catch { throw new Error("响应不是 JSON"); }
}

async function fetchJson(endpoint, key) {
  let current = endpoint;
  for (let redirect = 0; redirect <= MAX_REDIRECTS; redirect += 1) {
    const url = await assertSafeEndpoint(current);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${key}`, Accept: "application/json" },
        redirect: "manual",
        signal: controller.signal,
      });
      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get("location");
        if (!location || redirect === MAX_REDIRECTS) throw new Error("重定向次数超限");
        current = new URL(location, url).toString();
        continue;
      }
      if (!response.ok) return { status: response.status };
      const contentType = String(response.headers.get("content-type") || "").toLowerCase();
      if (contentType && !contentType.includes("json")) throw new Error("响应不是 JSON");
      return { status: response.status, payload: await readJson(response) };
    } finally { clearTimeout(timer); }
  }
  throw new Error("重定向失败");
}

function statusForHttp(status) {
  if (status === 401 || status === 403) return "auth-expired";
  return "sync-error";
}

async function syncCredentialSource(catalog, source, credentials) {
  const credential = await resolveCredential(credentials, source.keyRef);
  // A missing or unavailable credential is not a discovered platform. This also
  // lets DeepSeek fall through to its optional account source.
  if (credential.status !== "present") return null;
  const base = discoveredPlatform(catalog, source);
  base.credential = { required: true, present: true };
  try {
    const result = await fetchJson(source.endpoint, credential.value);
    if (!result.payload) return normalizeDiscoveryResult(base, { status: statusForHttp(result.status), error: `HTTP ${result.status}` });
    const balance = numberOrNull(pickPath(result.payload, source.balancePath));
    if (balance === null) return normalizeDiscoveryResult(base, { status: "unrecognized", error: "余额字段无法识别" });
    return normalizeDiscoveryResult(base, { status: balance <= 0 ? "exhausted" : "ok", balance });
  } catch (error) {
    const message = error && error.name === "AbortError" ? "请求超时" : String(error && error.message || "同步失败");
    return normalizeDiscoveryResult(base, { status: "sync-error", error: message });
  }
}

async function syncAccountSource(catalog, source, account) {
  const base = discoveredPlatform(catalog, source);
  if (!account || typeof account.getBalance !== "function") return normalizeDiscoveryResult(base, { status: "no-account", error: "账号服务不可用" });
  let result;
  try {
    result = await account.getBalance({
      version: String(process.env.DSH_CLIENT_VERSION || process.env.DSH_VERSION || "unknown"),
      locale: String(process.env.DSH_LOCALE || "zh_CN"),
      timezoneOffsetSeconds: -new Date().getTimezoneOffset() * 60,
    });
  } catch { return normalizeDiscoveryResult(base, { status: "account-error", error: "账号余额读取失败" }); }
  if (!result || result.status !== "ready" || !Array.isArray(result.value)) return normalizeDiscoveryResult(base, { status: "no-account", error: "未登录 DeepSeek 账号" });
  const wanted = String(catalog.currency).toUpperCase();
  const wallets = [...result.value, ...(Array.isArray(result.bonusWallets) ? result.bonusWallets : [])]
    .filter((wallet) => String(wallet?.currency || "").toUpperCase() === wanted && numberOrNull(wallet?.balance) !== null);
  if (!wallets.length) return normalizeDiscoveryResult(base, { status: "no-account", error: "账号余额字段无法识别" });
  const balance = Number(wallets.reduce((sum, wallet) => sum + Number(wallet.balance), 0).toFixed(6));
  return normalizeDiscoveryResult(base, { status: balance <= 0 ? "exhausted" : "ok", balance });
}

async function discoverCatalog(catalog, credentials, account) {
  const results = [];
  for (const item of catalog) {
    const credentialSource = item.sources.find((source) => source.type === "credential");
    const accountSource = item.sources.find((source) => source.type === "account");
    let result = credentialSource ? await syncCredentialSource(item, credentialSource, credentials) : null;
    if (!result && accountSource && account) result = await syncAccountSource(item, accountSource, account);
    if (result) results.push(result);
  }
  return results;
}

export { assertSafeEndpoint, discoverCatalog, fetchJson, syncAccountSource, syncCredentialSource };
