/**
 * dsh-subscription-panel - host half v0.2.17 (host logic unchanged since 0.2.11; this
 * release corrects the public platform logo mapping for Volcengine Ark and OpenCode).
 *
 * The host owns local configuration, credentials, network access, and validation.
 * The browser half only submits a declarative platform record and reads a safe DTO.
 */
import { existsSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { pickPath } from "./path.js";

const DSH_HOME = process.env.DSH_HOME || process.env.DEEPSEEK_HARNESS_HOME || process.env.USERPROFILE || process.cwd();
const REGISTRY_PATH = join(DSH_HOME, ".dsh-subs.json");
const CACHE_TTL_MS = 5 * 60 * 1000;
const MAX_REQUEST_BYTES = 256 * 1024;
const MAX_RESPONSE_BYTES = 1024 * 1024;
const MAX_REDIRECTS = 3;
const DIAGNOSTICS_ENABLED = process.env.DSH_SUBS_DIAGNOSTICS === "1";

function defaultRegistry() {
  return { version: 1, platforms: [] };
}

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function text(value, max = 200) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function nullableNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function nonNegativeNumber(value, field) {
  const number = nullableNumber(value);
  if (number !== null && number < 0) throw new Error(`${field} 必须是不小于 0 的数字`);
  return number;
}

function assertId(value) {
  const id = text(value, 64);
  if (!/^[a-z0-9][a-z0-9_-]{0,63}$/.test(id)) {
    throw new Error("id 必须是 1-64 位小写字母、数字、下划线或短横线");
  }
  return id;
}

function isBlockedIp(value) {
  const ip = String(value || "").replace(/^\[|\]$/g, "").toLowerCase();
  if (isIP(ip) === 4) {
    const octets = ip.split(".").map(Number);
    const [a, b] = octets;
    return a === 0 || a === 10 || a === 127 || a === 169 && b === 254 || a === 192 && b === 168 || a === 172 && b >= 16 && b <= 31 || a === 100 && b >= 64 && b <= 127;
  }
  if (isIP(ip) === 6) {
    return ip === "::1" || ip === "::" || ip.startsWith("fc") || ip.startsWith("fd") || ip.startsWith("fe8") || ip.startsWith("fe9") || ip.startsWith("fea") || ip.startsWith("feb");
  }
  return false;
}

function assertSafeUrlShape(value, field = "endpoint") {
  let parsed;
  try { parsed = new URL(String(value)); } catch { throw new Error(`${field} 不是合法 URL`); }
  if (parsed.protocol !== "https:") throw new Error(`${field} 只允许使用 HTTPS`);
  if (parsed.username || parsed.password) throw new Error(`${field} 不得携带用户名或密码`);
  if (parsed.port && parsed.port !== "443") throw new Error(`${field} 不允许使用非标准端口`);
  const host = parsed.hostname.toLowerCase();
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || isBlockedIp(host)) {
    throw new Error(`${field} 指向了不允许的本机或私有地址`);
  }
  return parsed;
}

async function assertSafeEndpoint(value, field = "endpoint") {
  const parsed = assertSafeUrlShape(value, field);
  let addresses;
  try {
    addresses = await lookup(parsed.hostname, { all: true, verbatim: true });
  } catch {
    throw new Error(`${field} 的域名无法解析`);
  }
  if (!addresses.length || addresses.some((entry) => isBlockedIp(entry.address))) {
    throw new Error(`${field} 解析到了不允许的本机或私有地址`);
  }
  return parsed;
}

function normalizeHosts(value, renewUrl) {
  const hosts = Array.isArray(value) ? value.map((item) => text(item, 253).toLowerCase()).filter(Boolean) : [];
  if (hosts.length) return [...new Set(hosts)];
  if (!renewUrl) return [];
  try { return [new URL(renewUrl).hostname.toLowerCase()]; } catch { return []; }
}

function normalizeWindows(value, mode) {
  if (value === undefined || value === null || value === "") return [];
  if (!Array.isArray(value) || value.length > 8) throw new Error("windows 必须是不超过 8 项的数组");
  return value.map((item, index) => {
    if (!isRecord(item)) throw new Error(`windows[${index}] 必须是对象`);
    const result = {
      label: text(item.label, 80),
      cap: nonNegativeNumber(item.cap, `windows[${index}].cap`),
      used: nonNegativeNumber(item.used, `windows[${index}].used`),
      resetAt: text(item.resetAt, 80) || null,
      capPath: text(item.capPath, 120) || null,
      usedPath: text(item.usedPath, 120) || null,
      resetPath: text(item.resetPath, 120) || null,
    };
    if (!result.label) throw new Error(`windows[${index}].label 不能为空`);
    if (mode === "auto" && !result.capPath && !result.usedPath && !result.resetPath) {
      throw new Error(`auto 模式的 windows[${index}] 至少需要一个字段路径`);
    }
    return result;
  });
}

/** Validate and strip a platform record before it reaches disk. */
function normalizePlatform(raw) {
  if (!isRecord(raw)) throw new Error("平台配置必须是对象");
  const id = assertId(raw.id);
  const name = text(raw.name, 100);
  if (!name) throw new Error("平台名称不能为空");
  const currency = text(raw.currency, 12).toUpperCase();
  if (!/^[A-Z][A-Z0-9_-]{2,11}$/.test(currency)) throw new Error("currency 必须是 3-12 位大写货币或计价标识");
  const mode = text(raw.mode || "manual", 16).toLowerCase();
  if (mode !== "manual" && mode !== "auto" && mode !== "account") throw new Error("mode 只能是 manual、auto 或 account");

  const renewUrl = text(raw.renewUrl, 500) || null;
  if (renewUrl) assertSafeUrlShape(renewUrl, "renewUrl");
  const platform = {
    id,
    name,
    short: text(raw.short, 8) || name.slice(0, 2).toUpperCase(),
    logoKey: text(raw.logoKey, 40) || null,
    currency,
    mode,
    renewUrl,
    renewHosts: normalizeHosts(raw.renewHosts, renewUrl),
    autoRenew: raw.autoRenew === true,
    price: text(raw.price, 80) || null,
    expireAt: text(raw.expireAt, 80) || null,
    budget: nonNegativeNumber(raw.budget, "budget"),
    monthUsed: nonNegativeNumber(raw.monthUsed, "monthUsed"),
    balance: nonNegativeNumber(raw.balance, "balance"),
    windows: normalizeWindows(raw.windows, mode),
  };
  // 保留已公开 schema 中的兼容字段，但不把未知对象或可执行内容写回磁盘。
  for (const field of ["monthlyLabel", "quotaUnit", "sourceUrl", "note"]) {
    if (raw[field] !== undefined) platform[field] = text(raw[field], 500) || null;
  }
  for (const field of ["dailyBudget", "dailyUsed"]) {
    if (raw[field] !== undefined) platform[field] = nonNegativeNumber(raw[field], field);
  }
  if (raw.keyRef !== undefined) platform.keyRef = text(raw.keyRef, 160);
  if (raw.endpoint !== undefined && mode !== "auto") platform.endpoint = null;

  if (mode === "auto") {
    const endpoint = text(raw.endpoint, 500);
    if (!endpoint) throw new Error("auto 模式必须填写 endpoint");
    assertSafeUrlShape(endpoint, "endpoint");
    platform.endpoint = endpoint;
    platform.keyRef = text(raw.keyRef, 160);
    if (!platform.keyRef) throw new Error("auto 模式必须填写 keyRef");
    platform.balancePath = text(raw.balancePath, 160);
    if (!platform.balancePath) throw new Error("auto 模式必须填写 balancePath");
  }

  // account 模式：余额来自 DSH 已登录账号，不需要 endpoint / key / 字段路径
  if (mode === "account") {
    platform.endpoint = null;
    platform.keyRef = null;
    platform.balancePath = null;
  }
  return platform;
}

function writeAtomicJson(filePath, value) {
  const serialized = JSON.stringify(value, null, 2) + "\n";
  const tempPath = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  const backupPath = `${filePath}.bak`;
  let movedOld = false;
  writeFileSync(tempPath, serialized, "utf8");
  try {
    if (existsSync(filePath)) {
      if (existsSync(backupPath)) unlinkSync(backupPath);
      renameSync(filePath, backupPath);
      movedOld = true;
    }
    renameSync(tempPath, filePath);
  } catch (error) {
    try { if (existsSync(tempPath)) unlinkSync(tempPath); } catch {}
    try {
      if (movedOld && !existsSync(filePath) && existsSync(backupPath)) renameSync(backupPath, filePath);
    } catch {}
    throw error;
  }
}

function readRegistry() {
  if (!existsSync(REGISTRY_PATH)) {
    const empty = defaultRegistry();
    writeAtomicJson(REGISTRY_PATH, empty);
    return empty;
  }
  const parsed = JSON.parse(readFileSync(REGISTRY_PATH, "utf8"));
  if (!isRecord(parsed) || parsed.version !== 1 || !Array.isArray(parsed.platforms)) {
    throw new Error("本地平台注册表格式无效，请修复或移除配置文件");
  }
  return { version: 1, platforms: parsed.platforms.map(normalizePlatform) };
}

function sameOriginGuard(req) {
  const contentType = String(req.headers?.["content-type"] || "").split(";")[0].trim().toLowerCase();
  if (contentType !== "application/json") return "请求必须为 application/json";
  const host = String(req.headers?.host || "");
  const origin = String(req.headers?.origin || "");
  if (!origin) return "缺少 Origin 头，已拒绝";
  try {
    if (new URL(origin).host !== host) return "跨站请求已拒绝";
  } catch { return "跨站请求已拒绝"; }
  return null;
}

function sendJson(res, status, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(body));
}

function readRequestBody(req, limit = MAX_REQUEST_BYTES) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    let settled = false;
    const fail = (error) => { if (!settled) { settled = true; reject(error); } };
    req.on("data", (chunk) => {
      if (settled) return;
      size += chunk.length;
      if (size > limit) { fail(new Error("请求体过大")); return; }
      chunks.push(chunk);
    });
    req.on("end", () => {
      if (settled) return;
      settled = true;
      try { resolve(JSON.parse(Buffer.concat(chunks).toString("utf8"))); } catch { reject(new Error("请求体不是合法 JSON")); }
    });
    req.on("error", fail);
  });
}

async function readResponseJson(response) {
  const declared = Number(response.headers.get("content-length") || 0);
  if (declared > MAX_RESPONSE_BYTES) throw new Error("上游响应过大");
  if (!response.body) return response.json();
  const reader = response.body.getReader();
  const chunks = [];
  let size = 0;
  try {
    for (;;) {
      const part = await reader.read();
      if (part.done) break;
      size += part.value.byteLength;
      if (size > MAX_RESPONSE_BYTES) { await reader.cancel(); throw new Error("上游响应过大"); }
      chunks.push(Buffer.from(part.value));
    }
  } finally { reader.releaseLock(); }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

async function fetchJson(endpoint, key) {
  let current = endpoint;
  for (let redirect = 0; redirect <= MAX_REDIRECTS; redirect += 1) {
    const url = await assertSafeEndpoint(current);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12000);
    try {
      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${key}`, Accept: "application/json" },
        redirect: "manual",
        signal: controller.signal,
      });
      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get("location");
        if (!location || redirect === MAX_REDIRECTS) throw new Error("上游重定向次数超限或缺少目标");
        current = new URL(location, url).toString();
        continue;
      }
      if (!response.ok) return { response };
      const contentType = String(response.headers.get("content-type") || "").toLowerCase();
      if (contentType && !contentType.includes("json")) throw new Error("上游响应不是 JSON");
      return { response, payload: await readResponseJson(response) };
    } finally { clearTimeout(timer); }
  }
  throw new Error("上游重定向失败");
}

/**
 * Read the optional `deepseekAccount` service.
 *
 * Read **per request**, never cached at apply time: a service that registers
 * after this plugin would otherwise stay invisible forever. Normalized to
 * `null`, because an absent Cordis service resolves to `undefined` — guarding
 * only `null` is exactly what crashed the first account-mode attempt.
 */
function optionalAccountService(ctx) {
  try {
    const value = typeof ctx.get === "function" ? ctx.get("deepseekAccount") : null;
    return value === undefined ? null : value;
  } catch (error) {
    return null;
  }
}

/**
 * Read the wallet balance of the DSH-signed-in DeepSeek account.
 *
 * Account mode never touches credentials itself: DSH's optional
 * `deepseekAccount` service owns token injection, the client headers and
 * invalidation — the same path DSH's own "account & balance" card uses. The
 * service is read through `ctx.get` rather than declared in `inject`, because a
 * host without it would otherwise wait forever and never apply this plugin.
 *
 * @param account - the optional service, or null when the host has none.
 * @param preferredCurrency - the registry's currency, preferred when present.
 * @returns `{ ok: true, balance, currency }` or a status/error pair to surface.
 */
async function resolveAccountBalance(account, preferredCurrency) {
  if (!account || typeof account.getBalance !== "function") {
    return { ok: false, status: "no-account", error: "当前宿主未提供账号余额服务" };
  }
  let result;
  try {
    result = await account.getBalance({
      version: String(process.env.DSH_CLIENT_VERSION || process.env.DSH_VERSION || "") || "unknown",
      locale: String(process.env.DSH_LOCALE || "") || "zh_CN",
      timezoneOffsetSeconds: -new Date().getTimezoneOffset() * 60,
    });
  } catch (error) {
    return { ok: false, status: "account-error", error: String((error && error.message) || error).slice(0, 160) };
  }
  if (!result || result.status !== "ready" || !Array.isArray(result.value) || result.value.length === 0) {
    return { ok: false, status: "no-account", error: "未登录 DeepSeek 账号，或该账号没有余额钱包" };
  }
  const walletValue = (wallet) => {
    const value = Number(wallet && wallet.balance);
    return Number.isFinite(value) ? value : null;
  };
  const wallets = result.value.filter((wallet) => walletValue(wallet) !== null);
  if (wallets.length === 0) return { ok: false, status: "no-account", error: "账号余额字段无法解析" };
  const wanted = String(preferredCurrency || "").toUpperCase();
  const currency = wallets.some((wallet) => String(wallet.currency || "").toUpperCase() === wanted)
    ? wanted
    : String(wallets[0].currency || "CNY").toUpperCase();
  const sumOf = (list) => (Array.isArray(list) ? list : [])
    .filter((wallet) => String(wallet.currency || "CNY").toUpperCase() === currency && walletValue(wallet) !== null)
    .reduce((total, wallet) => total + walletValue(wallet), 0);
  // 充值 + 赠金，与官方 balance_infos[].total_balance 同口径（那个字段本身就是两者相加）
  const balance = Number((sumOf(result.value) + sumOf(result.bonusWallets)).toFixed(6));
  return { ok: true, balance, currency };
}

async function resolvePlatform(platform, ctx, account) {
  const base = {
    id: platform.id,
    name: platform.name,
    short: platform.short || String(platform.name || "?").slice(0, 2).toUpperCase(),
    logoKey: platform.logoKey || null,
    currency: platform.currency || "USD",
    mode: platform.mode || "manual",
    renewUrl: platform.renewUrl || null,
    renewHosts: platform.renewHosts || [],
    autoRenew: platform.autoRenew === true,
    price: platform.price || null,
    expireAt: platform.expireAt || null,
    budget: nullableNumber(platform.budget),
    monthUsed: nullableNumber(platform.monthUsed),
    balance: nullableNumber(platform.balance),
    status: "ok",
    error: null,
  };
  if (Array.isArray(platform.windows)) {
    base.windows = platform.windows.map((window) => ({
      label: window.label,
      cap: nullableNumber(window.cap),
      used: nullableNumber(window.used),
      resetAt: window.resetAt || null,
    }));
  }
  if (platform.mode === "account") {
    const resolved = await resolveAccountBalance(account, base.currency);
    if (!resolved.ok) return Object.assign(base, { status: resolved.status, error: resolved.error });
    return Object.assign(base, { balance: resolved.balance, currency: resolved.currency || base.currency });
  }
  if (platform.mode !== "auto") return base;

  let key = "";
  if (platform.keyRef && ctx.credentials) {
    const credential = await ctx.credentials.resolve(platform.keyRef);
    key = credential && credential.value ? String(credential.value) : "";
  }
  if (!key) return Object.assign(base, { status: "no-key", error: "缺少凭据引用" });

  try {
    const result = await fetchJson(platform.endpoint, key);
    if (!result.payload) return Object.assign(base, { status: `http-${result.response.status}`, error: `HTTP ${result.response.status}` });
    const value = nullableNumber(pickPath(result.payload, platform.balancePath));
    if (value === null) return Object.assign(base, { status: "unparsed", error: "余额字段解析失败" });
    if (Array.isArray(platform.windows)) {
      base.windows = platform.windows.map((window) => ({
        label: window.label,
        cap: nullableNumber(pickPath(result.payload, window.capPath)),
        used: nullableNumber(pickPath(result.payload, window.usedPath)),
        resetAt: pickPath(result.payload, window.resetPath) || null,
      }));
    }
    return Object.assign(base, { balance: value });
  } catch (error) {
    const message = String(error && error.name === "AbortError" ? "请求超时" : error && error.message || "请求失败");
    return Object.assign(base, { status: "fetch-error", error: message.slice(0, 160) });
  }
}

function registerOne(sub, ctx, path, build) {
  try {
    const dispose = sub.webServer.register({ kind: "exact", path, handler: build() });
    ctx.effect(() => (typeof dispose === "function" ? dispose : () => {}));
  } catch (error) { /* duplicate routes must not crash the host half */ }
}

function apply(ctx) {
  ctx.inject(["webServer", "credentials"], (sub) => {
    const cache = { at: 0, data: null };

    if (DIAGNOSTICS_ENABLED) {
      registerOne(sub, ctx, "/dsh-subs/heartbeat", () => (req, res) => {
        if (req.method !== "GET") { res.statusCode = 405; res.end(); return; }
        res.setHeader("Content-Type", "application/json; charset=utf-8");
        res.end('{"ok":true}');
      });
    }

    registerOne(sub, ctx, "/dsh-subs/list.json", () => async (req, res) => {
      if (req.method !== "GET") { sendJson(res, 405, { ok: false, error: "method-not-allowed" }); return; }
      const force = /(?:^|[?&])force=1(?:&|$)/.test(String(req.url || ""));
      if (!force && cache.data && Date.now() - cache.at < CACHE_TTL_MS) { sendJson(res, 200, cache.data); return; }
      try {
        const registry = readRegistry();
        const platforms = [];
        const accountService = optionalAccountService(ctx);
        for (const item of registry.platforms) platforms.push(await resolvePlatform(item, sub, accountService));
        cache.data = { ok: true, syncedAt: new Date().toISOString(), registryVersion: registry.version, platforms };
        cache.at = Date.now();
        sendJson(res, 200, cache.data);
      } catch (error) {
        sendJson(res, 422, { ok: false, code: "registry-invalid", error: String(error.message || "配置读取失败").slice(0, 200), platforms: cache.data ? cache.data.platforms : [] });
      }
    });

    registerOne(sub, ctx, "/dsh-subs/platforms", () => async (req, res) => {
      if (req.method !== "POST") { sendJson(res, 405, { ok: false, error: "method-not-allowed" }); return; }
      const originError = sameOriginGuard(req);
      if (originError) { sendJson(res, 400, { ok: false, code: "bad-request", error: originError }); return; }
      try {
        const body = await readRequestBody(req);
        const incoming = normalizePlatform(body && (body.platform || body));
        if (incoming.mode === "auto") await assertSafeEndpoint(incoming.endpoint, "endpoint");
        const registry = readRegistry();
        if (registry.platforms.some((item) => item.id === incoming.id)) {
          sendJson(res, 409, { ok: false, code: "duplicate-id", error: "已存在相同的平台 ID" });
          return;
        }
        registry.platforms.push(incoming);
        writeAtomicJson(REGISTRY_PATH, registry);
        cache.at = 0;
        cache.data = null;
        sendJson(res, 201, { ok: true, id: incoming.id, name: incoming.name });
      } catch (error) {
        const message = String(error.message || "保存失败").slice(0, 240);
        const status = /请求体|必须|不能为空|只允许|不允许|不是合法|格式无效|必须是|只能是/.test(message) ? 400 : 500;
        sendJson(res, status, { ok: false, code: status === 400 ? "validation-error" : "write-failed", error: message });
      }
    });
  });
}

export { apply };
