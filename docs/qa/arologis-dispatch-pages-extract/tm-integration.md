# D-AX-11 TM Integration Note

Date: 2026-05-15

## Integrated Scope

- Migrated Arologis dispatch pages into `clients/arologis-desktop` under `/dispatches/*`.
- Kept Samhan Public desktop source pages intact for transition safety.
- Reused existing Arologis admin APIs and desktop auth token bridge.
- Added design-system CSS imports for the extracted desktop runtime.

## Decisions

- Runtime roles use `AROLOGIS_MASTER` and `AROLOGIS_MANAGER`.
- Manual dispatch `partnerCode` is a first-class optional stop field because unassigned matching depends on it.
- `slipNo` is audit context only and must not be mapped into Kakao sequence.
- Desktop installer packaging is excluded from D-AX-11 and remains D-AX-13.

## Risk Register

| Risk | Status | Handling |
|---|---|---|
| Manual-created stops remain unassigned because partner code is dropped | Fixed | `partnerCode` now persists to `VehicleStop.parsedPartnerCode`. |
| Kakao sequence polluted by slip number | Fixed | Unassigned prefill stores `slipNo` in notes only. |
| QA evidence absent from PR | Fixed | Four PNG captures added and linked in PR. |
| Release artifact missing desktop installer | Follow-up | Track in D-AX-13 deploy workflow. |
| Design-system changes bypass arologis CI | Follow-up | Add path trigger with deploy/CI workflow cleanup. |

## Merge Gate

Do not request merge until:

- GitHub CI is green on the latest pushed commit.
- PR body includes 5-team review, TM integration, PM/CI status, and QA screenshots.
- QA confirms either live Electron capture or accepts deterministic capture fallback for this slice.
