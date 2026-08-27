# ads-performance

SPEC `docs/SPEC.md` §5.4 · checklist group 7.5.

Connect Meta Ad Accounts (OAuth, encrypted token, auto-refresh), bind content
items to campaign/adset/ad objects, sync insights via the Facebook Ads API
(spend, Mess, CPP, ROAS, CTR, delivery status) on a ≤ 6h cycle, manual entry
with a distinct label, and the manager `evaluation` field.

`adsMetrics` is append-only; current value = latest `synced`, else latest
`manual`.
