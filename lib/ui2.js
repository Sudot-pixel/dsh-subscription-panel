/**
 * dsh-subscription-panel —— 浏览器半（client half）v0.2.8 (P6 添加平台)
 *
 * 装载格式：window.__ModuleLoader__.load({ id, factory })。
 *
 * P4 范围：
 *   · 完整卡片（环形余量 + 徽章 + 分币种合计 + 续费入口 + 用量窗口）
 *   · 顶部"最紧迫"概览条（多币种分别合计，不串币种）
 *   · 自动模式环形语义：已用% (host2.js 在 fetch 后已附 windows[].used/cap)
 *   · ponytail: ceiling: 旧 .dsubs-row 模板只供 P3 数据回退；P4 启用 .dsubs-card。
 *                upgrade: 砍掉 .dsubs-row 的当且仅当 P4 卡片在所有数据形态下都正常显示。
 */
window.__ModuleLoader__.load({
  id: "dsh-subscription-panel",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });

    var react = require("react");
    var reactDom = require("react-dom");
    var h = react.createElement;

    var PANEL_DOM_ID = "dsh-subs-panel";
    var CSS_ID = "dsh-subscription-panel-style";
    var PLUGIN_VERSION = "0.2.14";

    // 诊断路由默认关闭，生产客户端不为每次模块加载写盘或发心跳请求。
    function beat(stage) {}
    beat("client-module-eval");

    // 同步模式的显示名：auto=接口自动抓取，account=DSH 已登录账号余额，manual=手动
    function modeLabel(mode, short) {
      if (mode === "auto") return short ? "自动" : "自动抓取";
      if (mode === "account") return short ? "账号" : "账号同步";
      return short ? "手动" : "手动";
    }

    // ============================================================
    // 样式（定稿 v2.5 + P4 卡片）
    // ============================================================
    var CSS = [
      ".dsubs-foot{display:flex;align-items:center;gap:9px;width:100%;min-height:44px;padding:6px 10px;border-radius:22px;",
      "background:transparent;border:1px solid transparent;color:var(--dsw-alias-label-secondary,#AFC3DC);",
      "cursor:pointer;font:inherit;text-align:left;transition:background 140ms ease-out,border-color 140ms ease-out}",
      ".dsubs-foot:hover{background:rgba(255,255,255,.06);border-color:rgba(255,255,255,.12)}",
      ".dsubs-foot:focus-visible{outline:2px solid var(--dsw-alias-brand-primary,#38BDF8);outline-offset:2px}",
      ".dsubs-footIconWrap{position:relative;display:grid;place-items:center;width:32px;height:32px;flex:0 0 32px}",
      ".dsubs-footLabel{font-size:13px;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}",
      ".dsubs-badge{position:absolute;top:0;right:0;min-width:17px;height:15px;padding:0 4px;border-radius:999px;",
      "background:#C8102E;color:#fff;font-size:10px;font-weight:500;line-height:15px;text-align:center;",
      "box-shadow:0 0 0 2px rgba(12,18,27,.72)}",
      ".dsubs-ico{width:18px;height:18px;display:block;stroke:currentColor;fill:none;stroke-width:1.9;",
      "stroke-linecap:round;stroke-linejoin:round}",
      ".dsubs-icoSm{width:14px;height:14px}",
      ".dsubs-panel{position:fixed;width:404px;max-height:min(76vh,740px);display:flex;flex-direction:column;z-index:9999;",
      "background:rgba(12,18,27,.72);backdrop-filter:blur(20px) saturate(1.25);-webkit-backdrop-filter:blur(20px) saturate(1.25);",
      "border:1px solid rgba(255,255,255,.12);border-radius:22px;box-shadow:0 10px 32px #00000057;overflow:hidden;",
      "color:var(--dsw-alias-label-primary,#EAF2FC);font-size:13px;line-height:1.5}",
      ".dsubs-panel::before{content:'';position:absolute;inset:0 0 auto 0;height:1px;background:#ffffff29;pointer-events:none}",
      ".dsubs-head{display:flex;align-items:center;gap:8px;padding:13px 15px;border-bottom:1px solid rgba(148,180,220,.08)}",
      ".dsubs-title{font-size:15px;font-weight:500;letter-spacing:-.1px;flex:1;margin:0}",
      ".dsubs-sync{font-family:'Cascadia Mono',Consolas,monospace;font-size:10.5px;color:#6B829F}",
      ".dsubs-ghost{display:grid;place-items:center;min-width:27px;height:27px;padding:0 8px;border-radius:10px;",
      "background:transparent;border:1px solid rgba(148,180,220,.15);color:#8399B5;cursor:pointer}",
      ".dsubs-ghost:hover{color:#EAF2FC;border-color:rgba(148,180,220,.28)}",
      ".dsubs-ghost:focus-visible{outline:2px solid var(--dsw-alias-brand-primary,#38BDF8);outline-offset:2px}",
      ".dsubs-body{flex:1;overflow:auto;padding:12px;display:flex;flex-direction:column;gap:11px}",
      ".dsubs-overview{padding:11px 15px;border-bottom:1px solid rgba(148,180,220,.08);background:rgba(255,255,255,.03)}",
      ".dsubs-urgent{display:flex;align-items:center;gap:7px;font-size:12px;color:#AFC3DC;margin-bottom:7px}",
      ".dsubs-dot{width:7px;height:7px;border-radius:50%;flex:0 0 7px}",
      ".dsubs-totals{display:flex;gap:16px;flex-wrap:wrap}",
      ".dsubs-tot .k{font-size:11px;color:#6B829F;display:block}",
      ".dsubs-tot .v{font-size:13px;font-weight:500}",
      ".dsubs-empty{background:rgba(255,255,255,.055);border:1px dashed rgba(255,255,255,.14);border-radius:20px;",
      "padding:22px 16px;text-align:center;color:#8399B5;font-size:12px;line-height:1.7}",
      /* ---- P4 卡片 ---- */
      ".dsubs-card{background:rgba(255,255,255,.055);border:1px solid rgba(255,255,255,.09);border-radius:20px;padding:14px}",
      ".dsubs-cardCrit{border-color:rgba(200,16,46,.38)}",
      ".dsubs-cardWarn{border-color:rgba(251,191,36,.34)}",
      ".dsubs-cardHead{display:flex;align-items:center;gap:8px;margin-bottom:11px}",
      ".dsubs-cardLogo{width:22px;height:22px;border-radius:7px;display:grid;place-items:center;",
      "font-size:10px;font-weight:500;color:#fff}",
      ".dsubs-cardLogoCC{background:linear-gradient(140deg,#8B5CF6,#C4B5FD)}",
      ".dsubs-cardLogoDS{background:linear-gradient(140deg,#2F6FED,#59A2FF)}",
      ".dsubs-cardName{font-size:13px;font-weight:500;flex:1}",
      ".dsubs-chip{display:inline-flex;align-items:center;padding:3px 8px;border-radius:999px;font-size:11px;font-weight:500;white-space:nowrap}",
      ".dsubs-chipOk{color:#0B2A20;background:#34d399}",
      ".dsubs-chipWarn{color:#2A2416;background:#fbbf24}",
      ".dsubs-chipDanger{color:#fff;background:#C8102E}",
      ".dsubs-chipIdle{color:#8399B5;border:1px solid rgba(255,255,255,.12)}",
      ".dsubs-ringrow{display:flex;align-items:center;gap:13px}",
      ".dsubs-ring{position:relative;flex:0 0 auto}",
      ".dsubs-ring svg{display:block;transform:rotate(-90deg)}",
      ".dsubs-ring .tr{stroke:rgba(148,180,220,.12);fill:none}",
      ".dsubs-ring .arc{fill:none;stroke:url(#dsubsPgrad);stroke-linecap:round}",
      ".dsubs-ring .v{position:absolute;inset:0;display:grid;place-items:center;font-weight:500;letter-spacing:-.5px}",
      ".dsubs-ring .cap{position:absolute;left:0;right:0;bottom:-14px;text-align:center;font-size:10px;color:#6B829F}",
      ".dsubs-fig .v{font-size:24px;font-weight:500;letter-spacing:-.8px;line-height:1}",
      ".dsubs-fig .k{font-size:11px;color:#6B829F;margin-top:4px}",
      ".dsubs-fig .f{font-size:12px;font-weight:500;margin-top:6px}",
      ".dsubs-smalls{margin-left:auto;display:flex;gap:8px;align-items:flex-start}",
      ".dsubs-small{display:flex;flex-direction:column;align-items:center}",
      ".dsubs-meta{font-size:11px;color:#8399B5;margin-top:12px;line-height:1.6}",
      ".dsubs-meta b{color:#AFC3DC;font-weight:500}",
      ".dsubs-actrow{display:flex;align-items:center;gap:9px;margin-top:12px;padding-top:11px;border-top:1px solid rgba(255,255,255,.09)}",
      // 动态变化的金额/百分比用等宽数字，刷新时整列不位移
      ".dsubs-fig .v,.dsubs-tot .v,.dsubs-ring .v{font-variant-numeric:tabular-nums}",
      // 续费按钮：34px 胶囊（视觉克制），金属外圈（边框盒渐变，不用 mask）+ 液态玻璃内面。
      // 层序自上而下：顶部掠光 / 窄镜面扫光 / 左上镜面高光 / 拉丝微渐变 / 斜向掠光 / 档位面色 / 同色金属外圈
      ".dsubs-renew{position:relative;display:inline-flex;align-items:center;gap:6px;height:34px;padding:0 16px;border:2.5px solid transparent;border-radius:999px;",
      "font:inherit;font-size:12px;font-weight:500;line-height:1;white-space:nowrap;cursor:pointer;",
      "--renew-ring:linear-gradient(146deg,#ffffff 0%,#f6faff 7%,#cfdcf2 15%,#7d8b9d 25%,#454e5b 34%,#2f3742 41%,#8d9aa9 50%,#eaf1fa 58%,#fffdf8 66%,#ffd9c9 72%,#aab5c2 82%,#5b6470 90%,#f2f7fd 100%);",
      "background-origin:border-box;",
      "background-clip:border-box,padding-box,padding-box,padding-box,padding-box,padding-box,border-box;",
      "background-image:linear-gradient(180deg,rgba(255,255,255,.70) 0%,rgba(255,255,255,.16) 14%,rgba(255,255,255,0) 32%),",
      "linear-gradient(102deg,rgba(255,255,255,0) 24%,rgba(255,255,255,.16) 31%,rgba(255,255,255,.05) 34%,rgba(255,255,255,0) 41%),",
      "radial-gradient(120% 70% at 22% 2%,rgba(255,255,255,.85),rgba(255,255,255,0) 46%),",
      "repeating-linear-gradient(92deg,rgba(255,255,255,.045) 0 1.5px,rgba(255,255,255,0) 1.5px 4px,rgba(0,0,0,.03) 4px 5.5px,rgba(0,0,0,0) 5.5px 8px),",
      "linear-gradient(104deg,rgba(255,255,255,.34) 0%,rgba(255,255,255,.10) 14%,rgba(255,255,255,0) 26%,rgba(255,255,255,.16) 44%,rgba(255,255,255,0) 60%,rgba(255,255,255,.12) 84%,rgba(255,255,255,0) 100%),",
      "var(--renew-face,linear-gradient(178deg,#eef1f6,#c9d0d9)),var(--renew-ring);",
      // 抬升与内倒角用分层透明 box-shadow，不靠边框假装深度
      "box-shadow:inset 0 1px 0 rgba(255,255,255,.6),inset 0 0 0 1px rgba(255,255,255,.13),inset 0 -1px 0 rgba(0,0,0,.22),",
      "0 1px 1px rgba(3,7,18,.35),0 8px 20px rgba(3,7,18,.5),var(--renew-glow,0 0 0 rgba(0,0,0,0));",
      // 重量感：按下走快而深的压缩，松开走回冲曲线（过冲到 1.035 再落回）
      "transition:transform 340ms cubic-bezier(.18,1.62,.32,1),box-shadow 320ms cubic-bezier(.18,1.4,.32,1),filter 160ms ease-out}",
      // 视觉 34px，但用透明伪元素把命中区扩到 40×40（密集桌面界面的最小可点区域，不影响外观）
      ".dsubs-renew::after{content:'';position:absolute;inset:-3px;border-radius:999px}",
      ".dsubs-renewLabel{position:relative;display:inline-flex;align-items:center;gap:6px;text-shadow:0 1px 1px rgba(0,0,0,.32)}",
      // 三档金属色：正常=翡翠绿 #2E8B57 / 偏低=亮黄金 #D4AF37 / 耗尽=宝石红 #9B111E
      // 同色系金属（面色渐变 + 同色金属外圈）；状态另有文字与徽标，不只靠颜色
      ".dsubs-renewCalm{--renew-face:linear-gradient(178deg,#5CB985 0%,#2E8B57 15%,#1F6842 32%,#1A5A39 62%,#0D3221 100%);",
      "--renew-ring:linear-gradient(146deg,#F1FFF7 0%,#B7EFD0 12%,#4FAE79 26%,#1B5438 40%,#8FDCB6 52%,#DBFAEA 62%,#F3FEF8 70%,#3E9A6A 84%,#0A2A1B 100%);",
      "--renew-glow:0 8px 22px rgba(46,139,87,.42);color:#F1FFF9}",
      ".dsubs-renewWarn{--renew-face:linear-gradient(178deg,#F2DE8E 0%,#D4AF37 28%,#C9A227 62%,#B8952A 100%);",
      "--renew-ring:linear-gradient(146deg,#FFFDF2 0%,#F7ECAE 12%,#D4AF37 26%,#8A6E14 40%,#F0DA80 52%,#FFF8D2 62%,#FFFDF4 70%,#C9A227 84%,#6E5710 100%);",
      "--renew-glow:0 8px 22px rgba(212,175,55,.42);color:#2A2416}",
      ".dsubs-renewWarn .dsubs-renewLabel{text-shadow:0 1px 0 rgba(255,255,255,.45)}",
      ".dsubs-renewDanger{--renew-face:linear-gradient(178deg,#C43A45 0%,#9B111E 16%,#8A0F1B 34%,#7A0C17 62%,#4A0710 100%);",
      "--renew-ring:linear-gradient(146deg,#FFF0F2 0%,#F0AEB4 12%,#9B111E 26%,#4A0710 40%,#D96A74 52%,#FFE3E6 62%,#FFF7F8 70%,#B01F2B 84%,#3A050C 100%);",
      "--renew-glow:0 8px 24px rgba(155,17,30,.46);color:#FFF6F1}",
      ".dsubs-renew:hover:not(:active){filter:brightness(1.06);transform:translateY(-1px) scale(1.012);",
      "box-shadow:inset 0 1px 0 rgba(255,255,255,.65),inset 0 0 0 1px rgba(255,255,255,.13),inset 0 -1px 0 rgba(0,0,0,.22),",
      "0 1px 1px rgba(3,7,18,.35),0 12px 26px rgba(3,7,18,.55),var(--renew-glow,0 0 0 rgba(0,0,0,0))}",
      // 按下压到 .95（技能给定下限，不得更小）+ 收紧阴影；松开由基础规则的回冲曲线接管
      ".dsubs-renew:active{transform:scale(.95);filter:brightness(.94);",
      "transition:transform 90ms cubic-bezier(.3,0,.2,1),box-shadow 90ms ease-out,filter 90ms ease-out;",
      "box-shadow:inset 0 3px 9px rgba(0,0,0,.45),inset 0 0 0 1px rgba(0,0,0,.22),0 1px 2px rgba(3,7,18,.5)}",
      ".dsubs-renew:focus-visible{outline:2px solid var(--dsw-alias-brand-primary,#38BDF8);outline-offset:2px}",
      "@media (prefers-reduced-transparency:reduce){.dsubs-renew{background-image:var(--renew-face,linear-gradient(178deg,#eef1f6,#c9d0d9));box-shadow:0 0 0 1px rgba(6,10,16,.7)}}",
      "@media (prefers-contrast:more){.dsubs-renew{--renew-ring:#fff;background-image:var(--renew-face,linear-gradient(178deg,#eef1f6,#c9d0d9))}}",
      "@media (prefers-reduced-motion:reduce){.dsubs-renew{transition:none}.dsubs-renew:hover,.dsubs-renew:active{transform:none}}",
      ".dsubs-set{padding:12px;display:flex;flex-direction:column;gap:10px}",
      ".dsubs-setGroup{background:rgba(255,255,255,.055);border:1px solid rgba(255,255,255,.09);border-radius:14px;padding:10px 12px}",
      ".dsubs-setTitle{font-size:11px;color:#6B829F;font-weight:500;margin-bottom:7px}",
      ".dsubs-setRow{display:flex;align-items:center;gap:8px;padding:5px 0;font-size:12px;color:#AFC3DC}",
      ".dsubs-setRow+.dsubs-setRow{border-top:1px solid rgba(148,180,220,.07)}",
      ".dsubs-setRow b{color:#EAF2FC;font-weight:500;flex:1}",
      ".dsubs-setVal{font-family:'Cascadia Mono',Consolas,monospace;font-size:11px;color:#8399B5}",
      ".dsubs-setHint{font-size:11px;color:#6B829F;margin-top:6px;line-height:1.6;word-break:break-all}",
      ".dsubs-form{padding:12px;display:flex;flex-direction:column;gap:10px}",
       ".dsubs-field{display:flex;flex-direction:column;gap:5px}",
       ".dsubs-field label{font-size:11px;color:#AFC3DC}",
       ".dsubs-field input,.dsubs-field select,.dsubs-field textarea{box-sizing:border-box;width:100%;border:1px solid rgba(148,180,220,.18);border-radius:9px;background:rgba(0,0,0,.16);color:#EAF2FC;font:inherit;font-size:12px;padding:7px 9px;outline:none}",
       ".dsubs-field input:focus,.dsubs-field select:focus,.dsubs-field textarea:focus{border-color:var(--dsw-alias-brand-primary,#38BDF8);box-shadow:0 0 0 2px rgba(56,189,248,.18)}",
       ".dsubs-field textarea{min-height:70px;resize:vertical;font-family:'Cascadia Mono',Consolas,monospace;font-size:11px}",
       ".dsubs-fieldRow{display:grid;grid-template-columns:1fr 1fr;gap:9px}",
       ".dsubs-formHint{font-size:11px;color:#6B829F;line-height:1.5}",
       ".dsubs-formError{padding:8px 9px;border-radius:9px;background:rgba(200,16,46,.16);border:1px solid rgba(200,16,46,.36);color:#FFB8C2;font-size:11px;line-height:1.5}",
       ".dsubs-formPreview{max-height:130px;overflow:auto;margin:0;padding:8px;border-radius:9px;background:rgba(0,0,0,.2);color:#AFC3DC;font:11px/1.5 'Cascadia Mono',Consolas,monospace;white-space:pre-wrap;word-break:break-word}",
       ".dsubs-formActions{display:flex;gap:8px;padding-top:2px}",
       ".dsubs-secondary{flex:1;height:31px;border-radius:999px;border:1px solid rgba(148,180,220,.2);background:transparent;color:#AFC3DC;font:inherit;font-size:12px;cursor:pointer}",
       ".dsubs-secondary:hover{border-color:rgba(148,180,220,.42);color:#EAF2FC}",
       ".dsubs-secondary:focus-visible{outline:2px solid var(--dsw-alias-brand-primary,#38BDF8);outline-offset:2px}",
       ".dsubs-formActions .dsubs-primary{flex:1}",
       ".dsubs-back{display:grid;place-items:center;min-width:27px;height:27px;padding:0 6px;border-radius:10px;background:transparent;",
      "border:1px solid rgba(148,180,220,.15);color:#8399B5;cursor:pointer}",
      ".dsubs-back:hover{color:#EAF2FC;border-color:rgba(148,180,220,.28)}",
      ".dsubs-back:focus-visible{outline:2px solid var(--dsw-alias-brand-primary,#38BDF8);outline-offset:2px}",
      ".dsubs-pfoot{border-top:1px solid rgba(148,180,220,.08);padding:11px 13px;display:flex;gap:8px}",
      ".dsubs-primary{flex:1;height:31px;border-radius:999px;border:0;cursor:pointer;color:#052A40;font:inherit;font-weight:500;",
      "font-size:12px;background:linear-gradient(120deg,#38BDF8,#0284C7)}",
      ".dsubs-primary:focus-visible{outline:2px solid var(--dsw-alias-label-primary,#EAF2FC);outline-offset:2px}",
      "@media (prefers-reduced-motion: reduce){.dsubs-foot{transition:none}.dsubs-panel{animation:none}}",
      "@media (prefers-reduced-motion: no-preference){.dsubs-panel{animation:dsubsIn 200ms cubic-bezier(.2,.8,.2,1)}}",
      "@keyframes dsubsIn{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:none}}"
    ].join("");

    function injectCss(id, css) {
      var el = document.getElementById(id);
      if (el) { el.textContent = css; return function () {}; }
      el = document.createElement("style"); el.id = id; el.textContent = css;
      document.head.appendChild(el);
      return function () { try { el.remove(); } catch (e) {} };
    }

    function svg(small, children) {
      return h("svg", {
        className: "dsubs-ico" + (small ? " dsubs-icoSm" : ""),
        viewBox: "0 0 24 24", "aria-hidden": "true", focusable: "false"
      }, children);
    }
    function IconRefresh() { return svg(true, [h("path", { key: "a", d: "M21 12a9 9 0 1 1-3-6.7" }), h("path", { key: "b", d: "M21 3v6h-6" })]); }
    function IconClose() { return svg(true, [h("path", { key: "a", d: "M18 6 6 18M6 6l12 12" })]); }
    function IconGear() {
      return svg(true, [
        h("circle", { key: "c", cx: 12, cy: 12, r: 3.2 }),
        h("path", { key: "p", d: "M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-2.9 1.2v.2a2 2 0 1 1-4 0v-.1A1.7 1.7 0 0 0 7 19.4a1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A1.7 1.7 0 0 0 2.6 14H2.4a2 2 0 1 1 0-4h.2A1.7 1.7 0 0 0 4.6 7a1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1A1.7 1.7 0 0 0 10 2.6V2.4a2 2 0 1 1 4 0v.2a1.7 1.7 0 0 0 2.9 1.2l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0 1.2 2.9h.2a2 2 0 1 1 0 4h-.2a1.7 1.7 0 0 0-1.5 1z" })
      ]);
    }
    function IconBack() { return svg(true, [h("path", { key: "a", d: "M15 18l-6-6 6-6" })]); }

    // ---- P5 续费深链白名单：由宿主从用户配置下发，不内置个人供应商 ----
    function safeRenewUrl(url, hosts) {
      try {
        var u = new URL(String(url));
        if (u.protocol !== "https:") return null;
        var allowed = Array.isArray(hosts) ? hosts : [];
        for (var i = 0; i < allowed.length; i++) {
          var host = String(allowed[i] || "").toLowerCase();
          var actual = u.hostname.toLowerCase();
          if (host && (actual === host || actual.slice(-(host.length + 1)) === "." + host)) return u.toString();
        }
        return null;
      } catch (e) { return null; }
    }
    function IconExternal() { return svg(true, [h("path", { key: "a", d: "M7 17 17 7M9 7h8v8" })]); }

    // ============================================================
    // <<<pure-status>>> 主状态分档 + 续费核对 TTL（纯函数块；lib/status.test.mjs 直接从本文件抽取测试）
    // ------------------------------------------------------------
    // 分工（方案 A）：
    //   · 卡片右上 chip = **平台健康**，只表达数据/凭据/余额问题；
    //   · 续费核对 = 一次动作的次级反馈，写在续费按钮旁的小字，**永不占用主状态位**，且有 TTL。
    // 四档：
    //   danger 红：登录/凭据/取数失败，或余额已耗尽
    //   warn   黄：余额偏低（≤ 预算 10%）、账号未登录或服务不可用
    //   idle   灰：手动模式且尚未填写余额
    //   ok     绿：其余正常
    var RENEWAL_PENDING_TTL_MS = 15 * 60 * 1000;      // 点击续费后多久没见涨，就不再叫"核对中"
    var RENEWAL_RESULT_TTL_MS = 24 * 60 * 60 * 1000;  // 核对结果（已增加/未变化）最多保留一天
    var LOW_BALANCE_RATIO = 0.1;
    var LOW_BALANCE_WARN_RATIO = 0.25;

    /**
     * 归一化续费核对记录：转换超窗的 pending、清理过期的结果、剔除坏数据。
     * 不修改入参；返回新的记录表。这样"永久黄标"不会再发生。
     */
    function normalizeRenewalRecords(records, now) {
      var kept = {};
      var source = records && typeof records === "object" ? records : {};
      Object.keys(source).forEach(function (id) {
        var record = source[id];
        if (!record || typeof record !== "object") return;
        var startedAt = Number(record.startedAt);
        if (!Number.isFinite(startedAt)) return;
        var status = String(record.status || "");
        if (status === "pending") {
          if (now - startedAt <= RENEWAL_PENDING_TTL_MS) { kept[id] = record; return; }
          kept[id] = {
            startedAt: startedAt,
            beforeBalance: record.beforeBalance,
            status: "unchanged",
            judgedAt: startedAt + RENEWAL_PENDING_TTL_MS
          };
          return;
        }
        if (status === "confirmed" || status === "unchanged") {
          var stamped = Number(record.confirmedAt || record.judgedAt || startedAt);
          if (now - stamped <= RENEWAL_RESULT_TTL_MS) kept[id] = record;
          return;
        }
        // 旧版本没有 status 的记录：按 startedAt 兜底清理
        if (now - startedAt <= RENEWAL_RESULT_TTL_MS) kept[id] = record;
      });
      return kept;
    }

    /** 续费核对的次级文案；没有记录时返回空串（不占位）。 */
    function renewalNote(record) {
      if (!record) return "";
      if (record.status === "pending") return "\u7eed\u8d39\u6838\u5bf9\u4e2d\u2026";
      if (record.status === "confirmed") return "\u5df2\u68c0\u6d4b\u5230\u4f59\u989d\u589e\u52a0";
      if (record.status === "unchanged") return "\u672a\u68c0\u6d4b\u5230\u4f59\u989d\u53d8\u5316";
      return "";
    }

    /** 主状态分档：只依据平台健康，与续费核对无关。 */
    function platformHealth(input) {
      var source = input || {};
      var status = String(source.status || "ok");
      var mode = String(source.mode || "manual");
      var raw = source.balance;
      var balance = raw === null || raw === undefined || raw === "" ? null : Number(raw);
      var hasBalance = balance !== null && Number.isFinite(balance);
      var budget = Number(source.budget);
      var hasBudget = Number.isFinite(budget) && budget > 0;
      if (status === "auth-expired" || status === "no-key" || status === "fetch-error" || status === "unparsed" || /^http-[45]/.test(status)) {
        return { tier: "danger", text: source.error || "\u53d6\u6570\u5931\u8d25" };
      }
      if (status === "no-account" || status === "account-error") {
        return { tier: "warn", text: source.error || "\u8d26\u53f7\u4e0d\u53ef\u7528" };
      }
      if (status !== "ok") return { tier: "warn", text: source.error || status };
      if (hasBalance && balance <= 0) return { tier: "danger", text: "\u989d\u5ea6\u8017\u5c3d" };
      if (hasBalance && hasBudget && balance / budget <= LOW_BALANCE_RATIO) return { tier: "warn", text: "\u4f59\u989d\u504f\u4f4e" };
      if (mode === "manual" && !hasBalance) return { tier: "idle", text: "\u672a\u586b\u6570\u636e" };
      return { tier: "ok", text: "\u6b63\u5e38" };
    }
    // <<<end pure-status>>>

    // P5: 续费核对只存本地状态（不保存密钥），并且必须能过期
    var PENDING_KEY = "dsh-subscription-pending-renewal";
    function readPending() {
      try { return normalizeRenewalRecords(JSON.parse(localStorage.getItem(PENDING_KEY) || "{}"), Date.now()); } catch (e) { return {}; }
    }
    function writePending(value) { try { localStorage.setItem(PENDING_KEY, JSON.stringify(value)); } catch (e) {} }
    function startPending(platform) {
      var all = readPending();
      all[platform.id] = { startedAt: Date.now(), beforeBalance: platform.balance, status: "pending" };
      writePending(all);
    }
    function reconcilePending(data) {
      var now = Date.now();
      var all = readPending(); // 读取时已剔除过期项
      (data.platforms || []).forEach(function (platform) {
        var item = all[platform.id];
        if (!item) return;
        var before = Number(item.beforeBalance), current = Number(platform.balance);
        var age = now - Number(item.startedAt || 0);
        if (Number.isFinite(before) && Number.isFinite(current) && current > before) {
          item.status = "confirmed"; item.afterBalance = current; item.confirmedAt = now;
        } else if (item.status === "pending" && age > RENEWAL_PENDING_TTL_MS) {
          item.status = "unchanged"; item.judgedAt = now;
        }
      });
      writePending(all); // 无条件写回，让上面的清理真正落盘
    }
    function pendingFor(id) { return readPending()[id] || null; }

    // 紫色数据渐变（一次性 SVG defs，挂在 body 顶端，所有环共享）
    function RingDefs() {
      return h("svg", { width: 0, height: 0, style: { position: "absolute" }, "aria-hidden": "true" },
        h("defs", null,
          h("linearGradient", { id: "dsubsPgrad", x1: "0", y1: "0", x2: "1", y2: "1" },
            h("stop", { offset: "0", stopColor: "#C4B5FD" }),
            h("stop", { offset: ".45", stopColor: "#8B5CF6" }),
            h("stop", { offset: "1", stopColor: "#5B21B6" })
          )
        )
      );
    }

    // ---- 货币与格式化 ----
    var UNITS = { CNY: "\u00a5", USD: "$" };
    function unitFor(c) { return UNITS[c] || ""; }
    function fmtAmount(n, currency) {
      if (n === null || n === undefined || !Number.isFinite(Number(n))) return "\u2014";
      try {
        var fractionDigits = currency === "CNY" ? 2 : 4;
        return new Intl.NumberFormat(currency === "CNY" ? "zh-CN" : "en-US", {
          style: "currency", currency: currency, maximumFractionDigits: fractionDigits, minimumFractionDigits: 0
        }).format(Number(n));
      } catch (e) { return unitFor(currency) + Number(n).toFixed(currency === "CNY" ? 2 : 4); }
    }
    function fmtPct(p) { return Math.round(p * 10) / 10 + "%"; }

    // ---- 单环（静态稿终态；弱动效降级）----
    function Ring(props) {
      var size = props.size || 76;
      var stroke = props.stroke || 9;
      var radius = 42;
      var circ = 2 * Math.PI * radius;
      var pct = Math.max(0, Math.min(100, Number(props.pct) || 0));
      var off = circ * (1 - pct / 100);
      var isMain = size >= 60;
      return h("div", { className: "dsubs-ring", style: { width: size + "px", height: size + "px" } }, [
        h("svg", { key: "s", width: size, height: size, viewBox: "0 0 100 100" }, [
          h("circle", { key: "t", className: "tr", cx: 50, cy: 50, r: radius, strokeWidth: stroke }),
          h("circle", { key: "a", className: "arc", cx: 50, cy: 50, r: radius, strokeWidth: stroke,
            style: { strokeDasharray: circ + " 999", strokeDashoffset: off } })
        ]),
        h("span", { className: "v num", style: { fontSize: isMain ? "19px" : "11px", fontWeight: 500 } }, fmtPct(pct)),
        h("span", { className: "cap" }, props.label || "")
      ]);
    }

    // ---- 续费按钮：状态决定样式 ----
    function RenewBtn(props) {
      var tier = props.tier; // "calm" | "warn" | "danger"
      var cls = "dsubs-renew dsubs-renew" + tier.charAt(0).toUpperCase() + tier.slice(1);
      return h("button", { type: "button", className: cls, title: props.blocked ? "\u8be5\u94fe\u63a5\u4e0d\u5728\u767d\u540d\u5355\u5185" : "\u6253\u5f00\u5b98\u65b9\u8d26\u5355\u9875", onClick: function () {
        var safe = safeRenewUrl(props.url, props.platform && props.platform.renewHosts);
        if (safe) { startPending(props.platform); window.open(safe, "_blank", "noopener,noreferrer"); }
      } }, [
        h("span", { className: "dsubs-renewLabel", key: "l" }, [
          props.children || (tier === "danger" ? "\u7acb\u5373\u7eed\u8d39" : "\u7eed\u8d39"),
          h(IconExternal, { key: "x" })
        ])
      ]);
    }

    // ---- P4 卡片 ----
    function Card(props) {
      var p = props.p;
      var health = platformHealth({ status: p.status, error: p.error, mode: p.mode, balance: p.balance, budget: p.budget });
      var chipTier = health.tier === "ok" ? "Ok" : health.tier === "warn" ? "Warn" : health.tier === "danger" ? "Danger" : "Idle";
      var statusChip = "dsubs-chip dsubs-chip" + chipTier;
      var statusText = health.text;
      var cardClass = "dsubs-card" + (health.tier === "danger" ? " dsubs-cardCrit" : health.tier === "warn" ? " dsubs-cardWarn" : "");
      var logoClass = "dsubs-cardLogo " + (p.id === "commandcode" ? "dsubs-cardLogoCC" : p.id === "deepseek" ? "dsubs-cardLogoDS" : "");

      var hasBalance = p.balance !== null && p.balance !== undefined && Number.isFinite(Number(p.balance));
      var balanceValue = hasBalance ? Number(p.balance) : null;
      var hasBudget = Number.isFinite(Number(p.budget)) && Number(p.budget) > 0;
      var budgetValue = hasBudget ? Number(p.budget) : null;

      // 主环语义按模式分流：
      //   account → 官方只给实时余额、不给本月用量，环表达「本月剩余占比（按预算推算）」；
      //   有窗口的 auto → 首个窗口已用%；manual 且填了本月用量 → 本月已用%。
      var mainPct = 0;
      var mainLabel = "";
      var captionText = "";
      var captionWarn = false;
      var renewTier = "calm";
      var renewLabel = "\u7eed\u8d39";
      if (p.mode === "account" && budgetValue !== null && balanceValue !== null) {
        var remainRatio = balanceValue / budgetValue;
        mainPct = Math.max(0, Math.min(100, remainRatio * 100));
        mainLabel = "\u672c\u6708\u5269\u4f59";
        captionText = "\u00b7 \u672c\u6708\u5269\u4f59 " + fmtPct(mainPct) + "\uff08\u6309\u9884\u7b97\u63a8\u7b97\uff09";
        captionWarn = remainRatio <= LOW_BALANCE_RATIO;
        if (remainRatio <= LOW_BALANCE_RATIO) { renewTier = "danger"; renewLabel = "\u7acb\u5373\u7eed\u8d39"; }
        else if (remainRatio <= LOW_BALANCE_WARN_RATIO) renewTier = "warn";
      } else if (p.windows && p.windows.length > 0) {
        // 取第一个（一般是 5 小时）作为主环；只显示最关键窗口
        var w = p.windows[0];
        if (w.cap && Number.isFinite(w.used)) mainPct = Math.min(100, (w.used / w.cap) * 100);
        mainLabel = w.label || "";
        captionText = "\u00b7 \u672c\u7a97\u53e3\u5df2\u7528 " + fmtPct(mainPct);
        captionWarn = mainPct >= 80;
        if (mainPct >= 95) { renewTier = "danger"; renewLabel = "\u7acb\u5373\u7eed\u8d39"; }
        else if (mainPct >= 80) renewTier = "warn";
      } else if (budgetValue !== null && Number.isFinite(Number(p.monthUsed))) {
        mainPct = Math.min(100, (Number(p.monthUsed) / budgetValue) * 100);
        mainLabel = "\u672c\u6708\u5df2\u7528";
        captionText = "\u00b7 \u672c\u6708\u5df2\u7528 " + fmtPct(mainPct);
        captionWarn = mainPct >= 80;
        if (mainPct >= 95) { renewTier = "danger"; renewLabel = "\u7acb\u5373\u7eed\u8d39"; }
        else if (mainPct >= 80) renewTier = "warn";
      }
      var renewalText = renewalNote(pendingFor(p.id));

      var meta = [];
      if (p.price) meta.push(p.price);
      meta.push(p.autoRenew ? "\u81ea\u52a8\u7eed\u8d39\u5f00" : "\u81ea\u52a8\u7eed\u8d39\u5173");
      if (p.expireAt) meta.push("\u5230\u671f " + p.expireAt);
      meta.push(modeLabel(p.mode, false));
      if (p.mode === "account" && budgetValue !== null) meta.push("\u9884\u7b97 " + fmtAmount(budgetValue, p.currency) + "/\u6708\uff08\u624b\u586b\uff09");

      var smalls = [];
      if (p.windows && p.windows.length > 1) {
        for (var wi = 1; wi < Math.min(3, p.windows.length); wi++) {
          var sw = p.windows[wi];
          if (sw.cap && Number.isFinite(sw.used)) {
            smalls.push(h("div", { className: "dsubs-small", key: "sw" + wi }, [
              Ring({ size: 46, stroke: 11, pct: (sw.used / sw.cap) * 100, label: sw.label || "" })
            ]));
          } else if (p.budget && Number.isFinite(Number(p.balance))) {
            // 选项 A：该窗口 API 不给 cap/used（如月额度只给余额）→ 用「(月预算 - 余额) / 月预算」推导已用%
            var usedPct = Math.max(0, Math.min(100, ((p.budget - Number(p.balance)) / p.budget) * 100));
            smalls.push(h("div", { className: "dsubs-small", key: "sw" + wi }, [
              Ring({ size: 46, stroke: 11, pct: usedPct, label: sw.label || "每月" })
            ]));
          }
        }
      }

      return h("div", { className: cardClass, key: p.id }, [
        h("div", { className: "dsubs-cardHead", key: "h" }, [
          h("span", { className: logoClass, key: "l" }, p.short || "?"),
          h("span", { className: "dsubs-cardName", key: "n" }, p.name),
          h("span", { className: statusChip, key: "s" }, statusText)
        ]),
        h("div", { className: "dsubs-ringrow", key: "r" }, [
          Ring({ size: 76, stroke: 9, pct: mainPct, label: mainLabel }),
          h("div", { className: "dsubs-fig", key: "f" }, [
            h("span", { className: "v", key: "v" }, fmtAmount(p.balance, p.currency)),
            h("span", { className: "k", key: "k" }, "\u5269\u4f59\u4f59\u989d"),
            h("span", { className: "f", key: "fr", style: { color: captionWarn ? "#fbbf24" : "#AFC3DC" } }, captionText)
          ]),
          smalls.length ? h("div", { className: "dsubs-smalls", key: "s" }, smalls) : null
        ]),
        h("div", { className: "dsubs-meta", key: "m" }, meta.join(" \u00b7 ")),
        h("div", { className: "dsubs-actrow", key: "a" },
          p.renewUrl ? h(RenewBtn, { tier: renewTier, url: p.renewUrl, platform: p }, renewLabel) : null,
          h("span", { style: { fontSize: 11, color: "#8399B5" } },
            renewalText || (balanceValue === null ? "\u8bf7\u5728\u8bbe\u7f6e\u586b\u5145\u4f59\u989d" :
            health.tier === "danger" ? "\u8bf7\u7acb\u5373\u5145\u503c" :
            health.tier === "warn" ? "\u4f59\u989d\u504f\u4f4e" : "\u4f59\u989d\u5145\u8db3")))
      ]);
    }

    // ---- 顶部分币种合计（永不跨币种求和）----
    function Totals(props) {
      var byC = {};
      for (var i = 0; i < props.platforms.length; i++) {
        var p = props.platforms[i];
        if (Number.isFinite(Number(p.balance))) {
          var k = p.currency || "USD";
          if (!byC[k]) byC[k] = 0;
          byC[k] += Number(p.balance);
        }
      }
      var keys = Object.keys(byC);
      if (!keys.length) return null;
      return h("div", { className: "dsubs-totals" },
        keys.map(function (c) {
          return h("div", { className: "dsubs-tot", key: c }, [
            h("span", { className: "k", key: "k" }, c + " \u5408\u8ba1\u5269\u4f59"),
            h("span", { className: "v num", key: "v" }, fmtAmount(byC[c], c))
          ]);
        })
      );
    }

    function emptyPlatformForm() {
      return {
        id: "", name: "", currency: "USD", mode: "manual", balance: "", budget: "", monthUsed: "",
        renewUrl: "", price: "", expireAt: "", endpoint: "", keyRef: "", balancePath: "", windowsJson: ""
      };
    }

    function optionalFormNumber(value, field) {
      if (String(value || "").trim() === "") return null;
      var number = Number(value);
      if (!Number.isFinite(number) || number < 0) throw new Error(field + " 必须是不小于 0 的数字");
      return number;
    }

    function PlatformForm(props) {
      var fs = react.useState(emptyPlatformForm());
      var values = fs[0], setValues = fs[1];
      var es = react.useState("");
      var error = es[0], setError = es[1];
      var ps = react.useState("");
      var preview = ps[0], setPreview = ps[1];
      var ss = react.useState(false);
      var saving = ss[0], setSaving = ss[1];

      function update(name, value) {
        setValues(function (prev) { var next = Object.assign({}, prev); next[name] = value; return next; });
        setError("");
        setPreview("");
      }

      function buildPayload() {
        var id = String(values.id || "").trim().toLowerCase();
        var name = String(values.name || "").trim();
        var currency = String(values.currency || "").trim().toUpperCase();
        var mode = String(values.mode || "manual").trim().toLowerCase();
        if (!/^[a-z0-9][a-z0-9_-]{0,63}$/.test(id)) throw new Error("ID 必须是小写字母、数字、下划线或短横线");
        if (!name) throw new Error("平台名称不能为空");
        if (!/^[A-Z][A-Z0-9_-]{2,11}$/.test(currency)) throw new Error("币种/计价标识格式不正确");
        if (mode !== "manual" && mode !== "auto" && mode !== "account") throw new Error("模式只能是手动、自动或账号同步");
        var payload = {
          id: id, name: name, currency: currency, mode: mode,
          balance: optionalFormNumber(values.balance, "余额"),
          budget: optionalFormNumber(values.budget, "月预算"),
          monthUsed: optionalFormNumber(values.monthUsed, "本月用量"),
          renewUrl: String(values.renewUrl || "").trim() || null,
          price: String(values.price || "").trim() || null,
          expireAt: String(values.expireAt || "").trim() || null
        };
        if (payload.renewUrl) {
          var renew = new URL(payload.renewUrl);
          if (renew.protocol !== "https:") throw new Error("续费链接只允许使用 HTTPS");
        }
        if (String(values.windowsJson || "").trim()) {
          var windows = JSON.parse(values.windowsJson);
          if (!Array.isArray(windows)) throw new Error("窗口配置必须是数组");
          payload.windows = windows;
        }
        if (mode === "auto") {
          payload.endpoint = String(values.endpoint || "").trim();
          payload.keyRef = String(values.keyRef || "").trim();
          payload.balancePath = String(values.balancePath || "").trim();
          if (!payload.endpoint || !payload.keyRef || !payload.balancePath) {
            throw new Error("自动模式必须填写 endpoint、凭据引用和余额字段路径");
          }
          var endpoint = new URL(payload.endpoint);
          if (endpoint.protocol !== "https:") throw new Error("额度 endpoint 只允许使用 HTTPS");
        }
        return payload;
      }

      function showPreview() {
        try {
          setError("");
          setPreview(JSON.stringify(buildPayload(), null, 2));
        } catch (err) {
          setPreview("");
          setError(String(err && err.message || err));
        }
      }

      function save() {
        var payload;
        try {
          payload = buildPayload();
          setError("");
        } catch (err) {
          setError(String(err && err.message || err));
          return;
        }
        setSaving(true);
        fetch("/dsh-subs/platforms", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ platform: payload })
        }).then(function (response) {
          return response.json().then(function (body) { return { response: response, body: body }; });
        }).then(function (result) {
          if (!result.response.ok || !result.body || result.body.ok !== true) {
            throw new Error((result.body && result.body.error) || "保存平台失败");
          }
          props.onSaved();
        }).catch(function (err) {
          setError(String(err && err.message || err));
        }).finally(function () { setSaving(false); });
      }

      function field(label, name, type, placeholder) {
        return h("div", { className: "dsubs-field", key: name }, [
          h("label", { htmlFor: "dsubs-form-" + name, key: "l" }, label),
          h("input", { id: "dsubs-form-" + name, key: "i", type: type || "text", value: values[name], placeholder: placeholder || "", onChange: function (e) { update(name, e.target.value); } })
        ]);
      }

      var isAuto = values.mode === "auto";
      var isAccount = values.mode === "account";
      var body = [
        h("div", { className: "dsubs-fieldRow", key: "identity" }, [field("平台 ID", "id", "text", "例如 acme-ai"), field("平台名称", "name", "text", "例如 Acme AI")]),
        h("div", { className: "dsubs-fieldRow", key: "type" }, [
          field("币种/计价标识", "currency", "text", "USD"),
          h("div", { className: "dsubs-field", key: "mode" }, [
            h("label", { htmlFor: "dsubs-form-mode", key: "l" }, "同步模式"),
            h("select", { id: "dsubs-form-mode", key: "s", value: values.mode, onChange: function (e) { update("mode", e.target.value); } }, [
              h("option", { value: "manual", key: "manual" }, "手动维护"),
              h("option", { value: "auto", key: "auto" }, "自动抓取"),
              h("option", { value: "account", key: "account" }, "账号同步")
            ])
          ])
        ]),
        h("div", { className: "dsubs-formHint", key: "modeHint" }, isAuto ? "自动模式只保存凭据引用，不保存密钥值；host 会再次校验 HTTPS、域名解析和字段路径。" : isAccount ? "账号同步直接读取 DSH 已登录账号的余额，不需要 API 钥匙；未登录时面板会显示对应错误。" : "手动模式不请求第三方 API，余额与预算由你在此维护。"),
        h("div", { className: "dsubs-fieldRow", key: "amounts" }, [field("剩余余额", "balance", "number", "可留空"), field("月预算", "budget", "number", "可留空")]),
        field("本月已用", "monthUsed", "number", "可留空"),
        h("div", { className: "dsubs-fieldRow", key: "renew" }, [field("官方续费链接", "renewUrl", "url", "https://..."), field("到期时间", "expireAt", "text", "可留空")]),
        field("价格说明", "price", "text", "可留空")
      ];
      if (isAuto) {
        body.push(field("额度 endpoint（HTTPS）", "endpoint", "url", "https://api.example.com/usage"));
        body.push(h("div", { className: "dsubs-fieldRow", key: "autoFields" }, [field("凭据引用 keyRef", "keyRef", "text", "例如 PROVIDER_API_KEY"), field("余额字段路径", "balancePath", "text", "例如 data.balance")]));
        body.push(h("div", { className: "dsubs-field", key: "windows" }, [
          h("label", { htmlFor: "dsubs-form-windowsJson", key: "l" }, "窗口配置 JSON（可选）"),
          h("textarea", { id: "dsubs-form-windowsJson", key: "t", value: values.windowsJson, placeholder: "[{\"label\":\"5h\",\"capPath\":\"limits.cap\",\"usedPath\":\"limits.used\"}]", onChange: function (e) { update("windowsJson", e.target.value); } })
        ]));
      }
      if (error) body.push(h("div", { className: "dsubs-formError", role: "alert", key: "error" }, error));
      if (preview) body.push(h("pre", { className: "dsubs-formPreview", key: "preview", "aria-label": "平台配置预览" }, preview));
      body.push(h("div", { className: "dsubs-formActions", key: "actions" }, [
        h("button", { className: "dsubs-secondary", type: "button", key: "previewButton", onClick: showPreview }, "预览校验"),
        h("button", { className: "dsubs-primary", type: "button", key: "saveButton", disabled: saving, onClick: save }, saving ? "保存中…" : "保存平台")
      ]));
      return h("div", { className: "dsubs-form", "aria-label": "添加平台表单" }, body);
    }

    function Panel(props) {
      var pos = props.pos, close = props.close;
      var vs = react.useState("cards");
      var view = vs[0], setView = vs[1];
       var avs = react.useState("cards");
       var addFrom = avs[0], setAddFrom = avs[1];
      var ds = react.useState({ loading: true, data: null, error: null });
      var state = ds[0], setState = ds[1];

      var load = react.useCallback(function (force) {
        setState(function (prev) { return { loading: true, data: prev.data, error: null }; });
        fetch("/dsh-subs/list.json" + (force ? "?force=1" : ""), { cache: "no-store" })
          .then(function (r) { return r.json(); })
          .then(function (json) {
            if (!json || json.ok !== true) throw new Error((json && json.error) || "\u6570\u636e\u8fd4\u56de\u5f02\u5e38");
            reconcilePending(json);
            setState({ loading: false, data: json, error: null });
          })
          .catch(function (err) {
            setState(function (prev) { return { loading: false, data: prev.data, error: String(err && err.message) }; });
          });
      }, []);
      react.useEffect(function () { load(false); }, [load]);

      var syncText = "\u5c1a\u672a\u540c\u6b65";
      if (state.data && state.data.syncedAt) {
        var tt = new Date(state.data.syncedAt);
        syncText = String(tt.getHours()).padStart(2, "0") + ":" + String(tt.getMinutes()).padStart(2, "0") + " \u540c\u6b65";
      } else if (state.error) {
        syncText = "\u540c\u6b65\u5931\u8d25";
      }

      var platforms = (state.data && state.data.platforms) || [];

      // 排序：余额 → 用量 → 到期
      var sorted = platforms.slice().sort(function (a, b) {
        var aN = Number.isFinite(Number(a.balance)) ? Number(a.balance) : 1e9;
        var bN = Number.isFinite(Number(b.balance)) ? Number(b.balance) : 1e9;
        if (aN !== bN) return aN - bN;
        var aU = Number.isFinite(Number(a.monthUsed)) ? Number(a.monthUsed) : 0;
        var bU = Number.isFinite(Number(b.monthUsed)) ? Number(b.monthUsed) : 0;
        if (aU !== bU) return bU - aU;
        return String(a.expireAt || "\u9999").localeCompare(String(b.expireAt || "\u9999"));
      });

      // 最紧迫
      var urgent = null;
      for (var k = 0; k < sorted.length; k++) {
        if (sorted[k].status && sorted[k].status !== "ok") { urgent = sorted[k]; break; }
        if (sorted[k].expireAt && /\d{4}-\d{2}-\d{2}/.test(sorted[k].expireAt)) { urgent = sorted[k]; break; }
      }

      var body = null;
      if (state.loading && !state.data) {
        body = h("div", { className: "dsubs-empty" }, "\u6b63\u5728\u540c\u6b65\u2026");
      } else if (state.error && !state.data) {
        body = h("div", { className: "dsubs-empty" }, "\u540c\u6b65\u5931\u8d25\uff1a" + state.error, h("br", null), "\uff08\u4e0b\u6b21\u6253\u5f00\u4f1a\u81ea\u52a8\u91cd\u8bd5\uff09");
      } else if (!sorted.length) {
        body = h("div", { className: "dsubs-empty" }, "\u8fd8\u6ca1\u6709\u5e73\u53f0\u3002", h("br", null), "\u70b9\u4e0b\u9762\u7684\u300c\u6dfb\u52a0\u5e73\u53f0\u300d\u5f00\u59cb\u3002");
      } else {
        body = sorted.map(function (p) { return h(Card, { p: p, key: p.id }); });
      }

      // ---- \u8bbe\u7f6e\u89c6\u56fe\uff08Jev: medium \u5185\u5bb9\u96c6\uff1b\u4e00\u5c4f\u5185\uff0c\u4e0d\u505a\u4e8c\u7ea7\u9875\uff09----
      var regPath = "本地配置（DSH_HOME）";
      var platRows = sorted.map(function (p) {
        return h("div", { className: "dsubs-setRow", key: p.id }, [
          h("b", { key: "b" }, p.name),
          h("span", { className: "dsubs-setVal", key: "v" }, modeLabel(p.mode, true) + " \u00b7 " + (p.currency || "") + " " + (p.balance === null ? "\u2014" : String(p.balance)))
        ]);
      });
      var settingsBody = h("div", { className: "dsubs-set" }, [
        h("div", { className: "dsubs-setGroup", key: "g1" }, [
          h("div", { className: "dsubs-setTitle", key: "t" }, "\u5237\u65b0"),
          h("div", { className: "dsubs-setRow", key: "r1" }, [h("b", { key: "b" }, "\u6253\u5f00\u9762\u677f\u65f6\u62c9\u53d6"), h("span", { className: "dsubs-setVal", key: "v" }, "\u5f00")]),
          h("div", { className: "dsubs-setRow", key: "r2" }, [h("b", { key: "b" }, "\u5bbf\u4e3b\u7f13\u5b58\u65f6\u957f"), h("span", { className: "dsubs-setVal", key: "v" }, "5 \u5206\u949f")]),
          h("div", { className: "dsubs-setHint", key: "h" }, "\u914d\u7f6e\uff1a" + regPath)
        ]),
        h("div", { className: "dsubs-setGroup", key: "g2" }, [
          h("div", { className: "dsubs-setTitle", key: "t" }, "\u544a\u8b66\u9608\u503c"),
          h("div", { className: "dsubs-setRow", key: "r1" }, [h("b", { key: "b" }, "\u4f59\u989d\u4f4e\u4e8e 1%"), h("span", { className: "dsubs-chip dsubs-chipDanger", key: "v" }, "\u7ea2")]),
          h("div", { className: "dsubs-setRow", key: "r2" }, [h("b", { key: "b" }, "\u9884\u8b66\u7ebf 10%"), h("span", { className: "dsubs-chip dsubs-chipWarn", key: "v" }, "\u9ec4")]),
          h("div", { className: "dsubs-setRow", key: "r3" }, [h("b", { key: "b" }, "\u5230\u671f\u524d\u4e00\u5929"), h("span", { className: "dsubs-chip dsubs-chipWarn", key: "v" }, "\u9ec4")])
        ]),
        h("div", { className: "dsubs-setGroup", key: "g3" }, [
          h("div", { className: "dsubs-setTitle", key: "t" }, "\u5e73\u53f0\uff08" + sorted.length + "\uff09")
        ].concat(platRows.length ? platRows : [h("div", { className: "dsubs-setHint", key: "e" }, "\u8fd8\u6ca1\u6709\u5e73\u53f0")])),
        h("div", { className: "dsubs-setGroup", key: "g4" }, [
          h("div", { className: "dsubs-setTitle", key: "t" }, "\u5f52\u6863\u4e0e\u5220\u9664"),
          h("div", { className: "dsubs-setHint", key: "h" }, "\u6682\u65e0\u5f52\u6863\u5e73\u53f0\u3002\u505c\u7528\u540e 30 \u5929\u5185\u53ef\u6062\u590d\uff1b\u5220\u9664\u4f1a\u6e05\u6389\u8be5\u5e73\u53f0\u7684\u5386\u53f2\u8bb0\u5f55")
        ]),
        h("div", { className: "dsubs-setGroup", key: "g5" }, [
          h("div", { className: "dsubs-setTitle", key: "t" }, "\u5173\u4e8e"),
          h("div", { className: "dsubs-setRow", key: "r1" }, [h("b", { key: "b" }, "dsh-subscription-panel"), h("span", { className: "dsubs-setVal", key: "v" }, "v" + PLUGIN_VERSION)])
        ])
      ]);

      return h("div", {
        id: PANEL_DOM_ID, className: "dsubs-panel", role: "dialog", "aria-label": "\u8ba2\u9605\u4e0e\u989d\u5ea6",
        style: { left: pos.left + "px", bottom: pos.bottom + "px" }
      }, [
        h("div", { className: "dsubs-head", key: "head" }, [
          view !== "cards" ? h("button", { className: "dsubs-back", key: "bk", type: "button", title: "\u8fd4\u56de", "aria-label": "\u8fd4\u56de", onClick: function () { setView(view === "add" ? addFrom : "cards"); } }, h(IconBack, null)) : null,
          h("h2", { className: "dsubs-title", key: "t" }, view === "add" ? "\u6dfb\u52a0\u5e73\u53f0" : view === "settings" ? "\u8bbe\u7f6e" : "\u8ba2\u9605\u4e0e\u989d\u5ea6"),
          h("span", { className: "dsubs-sync", key: "s" }, view === "add" ? "\u914d\u7f6e\u9884\u89c8\u540e\u4fdd\u5b58" : syncText),
          view === "cards" ? h("button", { className: "dsubs-ghost", key: "g", type: "button", title: "\u8bbe\u7f6e", "aria-label": "\u8bbe\u7f6e", onClick: function () { setView("settings"); } }, h(IconGear, null)) : null,
          view !== "add" ? h("button", { className: "dsubs-ghost", key: "r", type: "button", title: "\u5237\u65b0", "aria-label": "\u5237\u65b0", onClick: function () { load(true); } }, h(IconRefresh, null)) : null,
          h("button", { className: "dsubs-ghost", key: "c", type: "button", title: "\u5173\u95ed", "aria-label": "\u5173\u95ed", onClick: function () { close(); } }, h(IconClose, null))
        ]),
        view === "cards" && sorted.length ? h("div", { className: "dsubs-overview", key: "ov" }, [
          urgent ? h("div", { className: "dsubs-urgent", key: "u" }, [
            h("span", { className: "dsubs-dot", style: { background: "#C8102E" }, key: "d" }),
            "\u6700\u7d27\u8feb\uff1a",
            h("b", { style: { color: "#EAF2FC", marginRight: 6 } }, urgent.name),
            h("span", { style: { color: "#C8102E" } }, urgent.status === "ok" ? (urgent.expireAt ? "\u5230\u671f " + urgent.expireAt : "") : (urgent.error || urgent.status))
          ]) : null,
          h(Totals, { platforms: sorted, key: "t" })
        ]) : null,
        h("div", { className: "dsubs-body", key: "body" }, view === "add" ? h(PlatformForm, { onSaved: function () { load(true); setView("cards"); } }) : view === "settings" ? settingsBody : body),
        view === "add" ? null : h("div", { className: "dsubs-pfoot", key: "foot" },
          h("button", { className: "dsubs-primary", type: "button", onClick: function () { setAddFrom(view); setView("add"); } }, "\u6dfb\u52a0\u5e73\u53f0"))
      ]);
    }

    function FooterEntry(props) {
      var wide = !!(props && props.wide);
      var ref = react.useRef(null);
      var st = react.useState(false);
      var open = st[0], setOpen = st[1];
      var ps = react.useState({ left: 0, bottom: 0 });
      var pos = ps[0], setPos = ps[1];
      var ls = react.useState(null);
      var fit = ls[0], setFit = ls[1];
      var pending = 0;

      react.useLayoutEffect(function () {
        function measureFit() {
          var el = ref.current;
          if (!el) return;
          var root;
          try { root = el.closest("[data-dsh-sidebar-root]") || document; } catch (e) { root = document; }
          var imgs = root.querySelectorAll ? root.querySelectorAll("img") : [];
          var best = null;
          for (var i = 0; i < imgs.length; i++) {
            var ir = imgs[i].getBoundingClientRect();
            if (ir.width >= 16 && ir.width <= 64 && ir.height >= 16 && ir.height <= 64 &&
                ir.top > window.innerHeight - 280 && !el.contains(imgs[i])) {
              var p = imgs[i];
              while (p && p.parentElement && p.getBoundingClientRect().width < 140) p = p.parentElement;
              if (p && p !== el && !el.contains(p)) { best = p; break; }
            }
          }
          if (!best) return;
          var cr = best.getBoundingClientRect();
          if (cr.width < 120) return;
          var curML = parseFloat(window.getComputedStyle(el).marginLeft || "0") || 0;
          var selfLeft = el.getBoundingClientRect().left;
          setFit({
            marginLeft: Math.round(curML + (cr.left - selfLeft)) + "px",
            width: Math.round(cr.width) + "px",
            height: Math.round(cr.height) + "px",
            minHeight: Math.round(cr.height) + "px",
            borderRadius: Math.round(cr.height / 2) + "px",
            boxSizing: "border-box"
          });
        }
        measureFit();
        var t1 = setTimeout(measureFit, 350);
        var t2 = setTimeout(measureFit, 1400);
        window.addEventListener("resize", measureFit);
        return function () {
          window.removeEventListener("resize", measureFit);
          clearTimeout(t1); clearTimeout(t2);
        };
      }, [wide]);

      var place = react.useCallback(function () {
        var el = ref.current;
        if (!el || typeof el.getBoundingClientRect !== "function") return;
        var root;
        try { root = el.closest("[data-dsh-sidebar-root]") || document; } catch (e) { root = document; }
        var r = root.getBoundingClientRect();
        setPos({
          left: Math.round(r.right + 10),
          bottom: Math.round(Math.max(12, window.innerHeight - r.bottom + 8))
        });
      }, []);

      react.useEffect(function () {
        if (!open) return;
        place();
        function onKey(e) { if (e.key === "Escape") { setOpen(false); if (ref.current) ref.current.focus(); } }
        function onDown(e) {
          if (ref.current && ref.current.contains(e.target)) return;
          var p = document.getElementById(PANEL_DOM_ID);
          if (p && p.contains(e.target)) return;
          setOpen(false);
        }
        window.addEventListener("keydown", onKey);
        document.addEventListener("mousedown", onDown, true);
        window.addEventListener("resize", place);
        window.addEventListener("scroll", place, true);
        return function () {
          window.removeEventListener("keydown", onKey);
          document.removeEventListener("mousedown", onDown, true);
          window.removeEventListener("resize", place);
          window.removeEventListener("scroll", place, true);
        };
      }, [open, place]);

      var button = h("button", {
        ref: ref, key: "btn", type: "button", className: "dsubs-foot",
        style: fit ? {
          marginLeft: fit.marginLeft, width: fit.width, minHeight: fit.minHeight,
          height: fit.height, borderRadius: fit.borderRadius, boxSizing: fit.boxSizing
        } : undefined,
        title: "\u8ba2\u9605\u4e0e\u989d\u5ea6",
        "aria-haspopup": "dialog", "aria-expanded": open ? "true" : "false",
        "aria-label": "\u8ba2\u9605\u4e0e\u989d\u5ea6",
        onClick: function () { if (open) { setOpen(false); } else { place(); setOpen(true); } }
      }, [
        h("span", { className: "dsubs-footIconWrap", key: "i" },
          h("svg", { className: "dsubs-ico", viewBox: "0 0 24 24", "aria-hidden": "true", focusable: "false" },
            h("circle", { cx: 12, cy: 12, r: 9 }),
            h("path", { d: "M12 7v5l3 2" })),
          pending > 0 ? h("span", { className: "dsubs-badge", key: "b" }, String(pending)) : null
        ),
        wide ? h("span", { className: "dsubs-footLabel", key: "l" }, "\u8ba2\u9605\u4e0e\u989d\u5ea6") : null
      ]);

      var layer = open ? reactDom.createPortal(
        h(react.Fragment, null, [h(RingDefs, { key: "defs" }), h(Panel, { pos: pos, close: function () { setOpen(false); if (ref.current) ref.current.focus(); } })]),
        document.body
      ) : null;
      return h(react.Fragment, null, [button, layer]);
    }

    function apply(ctx) {
      beat("client-apply-start");
      ctx.effect(function () { return injectCss(CSS_ID, CSS); }, "dsh-subscription-panel: styles");
      try {
        ctx.slots.inject("sidebar.footer.action", function () {
          beat("client-slot-declared");
          try {
            ctx.slots.register({ name: "sidebar.footer.action", id: "subscription-panel", order: 2 }, FooterEntry);
            beat("client-registered-ok");
          } catch (error) {
            beat("client-register-error: " + String(error && error.message));
          }
        });
      } catch (error) {
        beat("client-inject-error: " + String(error && error.message));
      }
    }

    exports.apply = apply;
    exports.inject = ["slots"];
    return module.exports;
  }
});
