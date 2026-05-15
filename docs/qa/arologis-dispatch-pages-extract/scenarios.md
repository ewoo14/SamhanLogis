# D-AX-11 Arologis Dispatch Pages QA

Date: 2026-05-15

Scope: `clients/arologis-desktop` dispatch route extraction under `/dispatches/*`.

## Scenario 1: Manual Dispatch

- Route: `#/dispatches/manual`
- APIs: `POST /admin/arologis/dispatches/manual/preview`, `POST /admin/arologis/dispatches/manual`
- Checks: dispatch date/type, optional driver code, vehicle/stop inputs, preview result, save action, no UUID exposure.
- Unassigned handoff: query params `date`, `slipNo`, `partnerCode`, `partnerName`, `address` prefill the first stop. `slipNo` is preserved in notes only; it is not coerced into `kakaoSeq`.
- Capture: `screenshots/01-manual-dispatch.png`

## Scenario 2: Pre-Classify

- Route: `#/dispatches/pre-classify`
- APIs: `GET /admin/arologis/dispatches/pre-classify`, `GET /admin/arologis/dispatches/regional`
- Checks: date/type filters, polling indicator, region summary, unassigned status, CSV action, no UUID exposure.
- Capture: `screenshots/02-pre-classify.png`

## Scenario 3: Unassigned

- Route: `#/dispatches/unassigned`
- API: `GET /admin/arologis/dispatches/unassigned`
- Checks: date filter, polling indicator, CSV action, manual-dispatch navigation, no UUID exposure.
- Capture: `screenshots/03-unassigned.png`

## Scenario 4: Reconcile

- Route: `#/dispatches/reconcile`
- API: `POST /admin/arologis/dispatch/reconcile`
- Checks: `.xlsx` upload guard, date range filters, reconcile action, mismatch table, CSV action, no UUID exposure.
- Capture: `screenshots/04-reconcile.png`

## Local Validation

- `./gradlew :services:arologis-service:compileJava :services:arologis-service:compileTestJava` - PASS
- `./gradlew :services:arologis-service:test --tests com.samhanair.logis.arologis.service.DispatchManualServiceTest` - PASS
- `cd clients/arologis-desktop; npm run typecheck` - PASS
- `cd clients/arologis-desktop; npm run build` - PASS
- `powershell -ExecutionPolicy Bypass -File .\scripts\generate-arologis-dispatch-pages-screenshots.ps1` - PASS, Playwright Chromium mock render

## Operational Note

The checked-in PNGs are Korean Playwright Chromium mock captures generated from the D-AX-11 route states so reviewers can inspect the UI in PR without requiring a seeded desktop login. Live Electron capture remains a final pre-merge task when backend seed credentials are available.
