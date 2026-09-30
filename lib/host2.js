/**
 * dsh-subscription-panel —— 宿主半（host half）v0.1.6 (post-ponytail-review)
 *
 * ponytail: ceiling: host2.js 不写自证 trace（生产无意义）。
 *          upgrade: 重新启用诊断时，用 ctx.logger.info() 取代 appendFileSync 自证。
 * ponytail: ceiling: defaultRegistry() 仅 2 个 demo 平台。
 *          upgrade: 当用户首次接入时，UI 走 empty state 提示「点下面的添加平台开始」，
 *                    不预填；目前 demo 数据仅供初次体验。
 *
 * 路由（GET；webServer.register 默认只注册 GET，POST 会 405）：
 *   GET /dsh-subs/heartbeat?stage=xxx
 *   GET /dsh-subs/list.json[?force=1]
 */
import { appendFileSync, readFileSync, writeFileSync, existsSync } from "node:fs";

const TRACE_PATH = "C:/DeepSeekHarness/dsh-subs-apply.log";
const HEARTBEAT_PATH = "C:/DeepSeekHarness/dsh-subs-heartbeat.log";
const REGISTRY_PATH = "C:/DeepSeekHarness/.dsh-subs.json";
const CACHE_TTL_MS = 5 * 60 * 1000;

function trace(msg) {
  try {
    appendFileSync(TRACE_PATH, new Date().toISOString() + "  " + String(msg).replace(/[\r\n]+/g, " ").slice(0, 400) + "\n", "utf8");
  } catch (error) { /* ponytail: ceiling=0 自证日志，生产关掉不写盘 */ }
}

function defaultRegistry() {
  return {
    version: 1,
    platforms: []
  };
}

// 点号路径解析（"a.b.c"）。ponytail: ceiling: 只支持普通键路径；
// upgrade: 出现数组下标/通配需求时再换 JSONPath。
function pickPath(src, path) {
  if (!path) return undefined;
  let cur = src;
  for (const k of String(path).split(".")) {
    if (cur === null || cur === undefined) return undefined;
    cur = cur[k];
  }
  return cur;
}

function readRegistry() {
  try {
    if (!existsSync(REGISTRY_PATH)) writeFileSync(REGISTRY_PATH, JSON.stringify(defaultRegistry(), null, 2), "utf8");
    const parsed = JSON.parse(readFileSync(REGISTRY_PATH, "utf8"));
    if (!parsed || !Array.isArray(parsed.platforms)) return defaultRegistry();
    return parsed;
  } catch (error) {
    return defaultRegistry(); // ponytail: ceiling=吞错返 demo，生产补 alert
  }
}

async function resolvePlatform(platform, ctx) {
  const base = {
    id: platform.id, name: platform.name,
    short: platform.short || String(platform.name || "?").slice(0, 2).toUpperCase(),
    currency: platform.currency || "USD", mode: platform.mode || "manual",
    renewUrl: platform.renewUrl || null, autoRenew: !!platform.autoRenew,
    price: platform.price || null, expireAt: platform.expireAt || null,
    budget: Number(platform.budget) || null,
    monthUsed: Number(platform.monthUsed) || null,
    balance: Number(platform.balance) || null, status: "ok", error: null
  };
  if (Array.isArray(platform.windows)) { base.windows = platform.windows.map((w) => ({ label: w.label, cap: Number(w.cap) || null, used: Number(w.used) || null, resetAt: w.resetAt || null })); }
  if (platform.mode !== "auto" || !platform.endpoint) return base;

  let key = "";
  if (platform.keyRef && ctx.credentials) {
    const cred = await ctx.credentials.resolve(platform.keyRef);
    key = cred && cred.value ? String(cred.value) : "";
  }
  if (!key) return Object.assign(base, { status: "no-key", error: "缺少凭据 " + platform.keyRef });

  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 12000);
  try {
    const r = await fetch(platform.endpoint, {
      headers: { Authorization: "Bearer " + key, Accept: "application/json" },
      signal: ctrl.signal
    });
    if (!r.ok) return Object.assign(base, { status: "http-" + r.status, error: "HTTP " + r.status });
    const payload = await r.json();
    const value = Number(pickPath(payload, platform.balancePath));
    if (!Number.isFinite(value)) {
      return Object.assign(base, { status: "unparsed", error: "响应里找不到 " + platform.balancePath });
    }
    // 窗口类数据：按注册表 windows[] 声明逐个取（P4 环形用）
    if (Array.isArray(platform.windows)) {
      const wins = platform.windows.map((w) => ({
        label: w.label,
        cap: Number(pickPath(payload, w.capPath)) || null,
        used: Number(pickPath(payload, w.usedPath)) || null,
        resetAt: pickPath(payload, w.resetPath) || null
      }));
      if (wins.length) base.windows = wins;
    }
    return Object.assign(base, { balance: value });
  } catch (error) {
    return Object.assign(base, { status: "fetch-error", error: String(error.message || error) });
  } finally {
    clearTimeout(t);
  }
}

function registerOne(sub, ctx, path, build) {
  try {
    const dispose = sub.webServer.register({ kind: "exact", path, handler: build() });
    ctx.effect(() => (typeof dispose === "function" ? dispose : () => {}));
  } catch (error) { /* swallow: 同名路由重复注册时不让宿主半挂掉 */ }
}

function apply(ctx) {
  ctx.inject(["webServer", "credentials"], (sub) => {
    const cache = { at: 0, data: null };
    registerOne(sub, ctx, "/dsh-subs/heartbeat", () => (req, res) => {
      const stage = (/(?:^|&)stage=([^&]*)/.exec(String(req.url || "").split("?")[1] || "") || [, "(no-stage)"])[1];
      try { appendFileSync(HEARTBEAT_PATH, new Date().toISOString() + "  " + stage + "\n", "utf8"); } catch (e) {}
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end('{"ok":true}');
    });
    registerOne(sub, ctx, "/dsh-subs/list.json", () => async (req, res) => {
      const force = /force=1/.test(String(req.url || ""));
      const send = (body) => {
        res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
        res.end(JSON.stringify(body));
      };
      if (!force && cache.data && Date.now() - cache.at < CACHE_TTL_MS) return send(cache.data);
      try {
        const registry = readRegistry();
        const platforms = [];
        for (const item of registry.platforms) platforms.push(await resolvePlatform(item, sub));
        cache.data = { ok: true, syncedAt: new Date().toISOString(), registryPath: REGISTRY_PATH, platforms };
        cache.at = Date.now();
        send(cache.data);
      } catch (error) {
        send({ ok: false, error: String(error.message || error), syncedAt: cache.data && cache.data.syncedAt, platforms: cache.data ? cache.data.platforms : [] });
      }
    });
  });
}

export { apply };
