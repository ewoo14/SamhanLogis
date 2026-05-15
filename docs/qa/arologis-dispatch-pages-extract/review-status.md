# D-AX-11 5-Team Review Status

Date: 2026-05-15

## Review Table

| Team | Reviewer | Status | Result |
|---|---|---|---|
| BE | Rawls / Curie | Approved after fix | `ManualStop.partnerCode` is now persisted to `VehicleStop.parsedPartnerCode`; `slipNo` is no longer coerced into `kakaoSeq`; BE compile/test pass. |
| FE | Fermat | Approved with note | Arologis desktop typecheck/build pass. Samhan Public desktop duplicate routes remain as intentional transition scope. |
| Design | Nietzsche | Conditional pass | Raw hex is absent in implementation. Preview status test id was added. Legacy `DISPATCH-DESIGN.md` sections remain historical and D-AX-11 current IA is documented at the top. |
| QA | Russell | Conditional pass | Four QA screenshots are now checked in. Live Electron capture requires seeded backend/login before merge. |
| DevOps | Copernicus | Conditional pass | Desktop typecheck is hard-fail in CI. Desktop installer/release packaging remains D-AX-13 follow-up; design-system path trigger should be added with deploy workflow work. |

## Fixes Applied From Review

- Added `partnerCode` to manual dispatch request/preview DTOs and persisted it on manual-created `VehicleStop`.
- Preserved unassigned `slipNo` in notes only; removed incorrect `slipNo -> kakaoSeq` coercion.
- Added `DispatchManualServiceTest.manualCreate_preservesPartnerCode_for_unassignedMatching`.
- Added QA screenshot artifacts for all four extracted routes.
- Added preview status test id and additional manual dispatch action test ids.

## Remaining Follow-Ups

- D-AX-12: mobile cross-import cleanup.
- D-AX-13: desktop installer packaging/deploy workflow.
- CI follow-up: include `clients/web/design-system/**` in arologis desktop CI trigger paths.
