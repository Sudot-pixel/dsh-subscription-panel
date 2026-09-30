# dsh-subscription-panel

Standalone subscription and quota panel for DeepSeek Harness.

## Scope

- Sidebar footer entry with aligned floating panel
- Per-currency balances and quota windows
- Command Code live balance and quota windows
- Manual platform mode for services without a balance API
- Renewal URL allowlist and pending-renewal state
- Settings view for refresh, alerts, platforms, archive/delete policy

## Runtime

This package is loaded by DSH's Cordis bundle system. The client module uses the host-provided React runtime and registers the sidebar action through `sidebar.footer.action`.

## Security

- API keys are referenced by credential name only.
- No key material is stored in this repository.
- Renewal links must use HTTPS and an explicit host allowlist.
- This plugin never performs payment or automated login.
