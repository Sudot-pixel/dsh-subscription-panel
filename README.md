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

The local registry is stored under `$DSH_HOME/.dsh-subs.json` (or the DSH home fallback on older setups). It is local user data and is intentionally not included in the public package.

## Security

- API keys are referenced by credential name only.
- No key material or personal platform registry is stored in this repository or published package.
- Automatic endpoints must use HTTPS and pass host/DNS, private-network, redirect, timeout, and response-size checks.
- Renewal links must use HTTPS and an explicit host allowlist supplied by the platform configuration.
- This plugin never performs payment or automated login.
