# 2026-08-12 fix3 real-QA evidence

- QA class: `PartnerLedgerBalanceFix3RealQaIT`
- database: isolated Testcontainers PostgreSQL 16 (`accounting_db`)
- service context: isolated `AccountingServiceApplication`
- result: 2 tests passed
- checked: same-day ordering, no-slip journal end-of-day ordering, posted-only canonical amount, projection double-count prevention, CANCELED projection exclusion
- QA shots path was resolved through `Resolve-QaShotsDir` to `docs/qa/2026-08-12-1068-fix3-real-qa/screenshots/_local`.
- no application port was started; the Testcontainers database was stopped by the test JVM shutdown.

