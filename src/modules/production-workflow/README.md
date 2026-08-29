# production-workflow

SPEC `docs/SPEC.md` §5.3 · checklist group 7.4.

The 7-state production status machine
(`chua_bat_dau → viet_kich_ban → cho_duyet_kich_ban → quay_dung →
cho_duyet_video → da_duyet → da_len_ads`), two mandatory manager approval steps,
return-with-reason, `statusHistory`, and the computed overdue flag.

Every transition is validated server-side. The state machine lives in
`src/lib/workflow/` so it is unit-testable in isolation.
