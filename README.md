# dsh-subscription-panel

Standalone subscription and quota panel for DeepSeek Harness.

## Scope

- Sidebar footer entry with aligned floating panel
- Per-currency balances and quota windows
- Provider-agnostic live balance and quota windows
- Manual platform mode for services without a balance API
- Renewal URL allowlist and pending-renewal state
- Settings view for refresh, alerts, platforms, archive/delete policy

## Runtime

This package is loaded by DSH's Cordis bundle system. The client module uses the host-provided React runtime and registers the sidebar action through `sidebar.footer.action`.

## Add a platform

Open the panel, choose **Settings**, then **Add platform**. The form supports:

- **Manual mode** for services without a balance API. Enter the display name, currency, balance, budget, renewal URL, and optional expiry details.
- **Automatic mode** for a JSON balance endpoint. Enter an HTTPS endpoint, a DSH credential reference (never the secret itself), the balance field path, and optional quota-window paths.
- **Preview and validation** before saving. The host validates the submitted schema, rejects duplicate IDs, writes the registry atomically, and keeps a `.bak` copy of the previous valid registry.
- **Public platform templates** can prefill verified identity metadata, currency, `logoKey`, and explicitly public endpoint fields. A template never fills balance, budget, renewal URL, credential values, or login state; review and save it explicitly.
- The bundled Discovery Catalog detects only verified standard credential references. It never scans unknown credentials or guesses a provider from a key prefix. Detected platforms appear as temporary cards with sync status; use **Pin to panel** to persist one locally.
- Discovery failures, expired credentials, zero balance, and stale data keep the platform card visible with a distinct status. Manual values and renewal settings remain local and take precedence when a discovered platform is merged.
- Settings can archive a saved platform without losing its local configuration. Archived platforms can be restored later; temporary discovery cards disappear when their credential is removed and are not archived.

The local registry is stored under `$DSH_HOME/.dsh-subs.json` (or the DSH home fallback on older setups). It is local user data and is intentionally not included in the public package.

## Security

- Manual and template metadata are provider-agnostic; automatic templates are included only when the endpoint and response field path are publicly verified.
- Logo marks are bundled inline in the client so the panel does not depend on an external CDN.
- No key material or personal platform registry is stored in this repository or published package.
- Automatic endpoints must use HTTPS and pass host/DNS, private-network, redirect, timeout, and response-size checks.
- Renewal links must use HTTPS and an explicit host allowlist supplied by the platform configuration.
- This plugin never performs payment or automated login.
