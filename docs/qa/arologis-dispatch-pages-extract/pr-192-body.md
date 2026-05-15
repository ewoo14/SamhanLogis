## 요약

- D-AX-11: Arologis desktop에 배차 하위 라우트 4종을 이전했습니다.
- 추가 보강: PR 리뷰에서 발견된 `partnerCode` 유실과 `slipNo -> kakaoSeq` 오매핑을 수정했습니다.
- QA 캡처 4장, 5-team review, TM 통합, PM/CI gate를 PR에 포함합니다.

## 이전된 라우트

| Page | Route | Primary API |
|---|---|---|
| Manual dispatch | `/dispatches/manual` | `POST /admin/arologis/dispatches/manual` |
| Pre-classify | `/dispatches/pre-classify` | `GET /admin/arologis/dispatches/pre-classify` |
| Unassigned | `/dispatches/unassigned` | `GET /admin/arologis/dispatches/unassigned` |
| Reconcile | `/dispatches/reconcile` | `POST /admin/arologis/dispatch/reconcile` |

## 5-team review

| Team | Status | Review result |
|---|---|---|
| BE | Pass after fix | `ManualStop.partnerCode` now persists to `VehicleStop.parsedPartnerCode`; `slipNo` is notes-only and no longer populates `kakaoSeq`. |
| FE | Pass | `clients/arologis-desktop` typecheck/build pass; Samhan Public duplicate routes are intentional transition scope. |
| Design | Conditional pass | Raw hex absent from implementation; preview status test id added; legacy design guide is marked historical below D-AX-11 extraction note. |
| QA | Conditional pass | Four PR screenshots are included; live Electron capture remains the final seeded-login pre-merge check. |
| DevOps | Conditional pass | Desktop typecheck is hard-fail; installer/deploy packaging and design-system CI path trigger are D-AX-13 follow-ups. |

## TM 통합

- Runtime desktop roles: `AROLOGIS_MASTER`, `AROLOGIS_MANAGER`.
- Manual dispatch now carries optional stop `partnerCode` through FE request, BE DTO, preview echo, and persisted stop entity.
- Unassigned prefill preserves `slipNo` as audit text in notes only.
- Samhan Public desktop source pages remain intact for transition safety.
- D-AX-13 retains desktop installer/release workflow work.

## QA 캡처

![Manual dispatch](https://raw.githubusercontent.com/ewoo14/SamhanLogis/feat/arologis-dispatch-pages-extract/docs/qa/arologis-dispatch-pages-extract/screenshots/01-manual-dispatch.png)

![Pre-classify](https://raw.githubusercontent.com/ewoo14/SamhanLogis/feat/arologis-dispatch-pages-extract/docs/qa/arologis-dispatch-pages-extract/screenshots/02-pre-classify.png)

![Unassigned](https://raw.githubusercontent.com/ewoo14/SamhanLogis/feat/arologis-dispatch-pages-extract/docs/qa/arologis-dispatch-pages-extract/screenshots/03-unassigned.png)

![Reconcile](https://raw.githubusercontent.com/ewoo14/SamhanLogis/feat/arologis-dispatch-pages-extract/docs/qa/arologis-dispatch-pages-extract/screenshots/04-reconcile.png)

## 검증

| Command | Result |
|---|---|
| `./gradlew :services:arologis-service:compileJava :services:arologis-service:compileTestJava` | PASS |
| `./gradlew :services:arologis-service:test --tests com.samhanair.logis.arologis.service.DispatchManualServiceTest` | PASS |
| `cd clients/arologis-desktop; npm run typecheck` | PASS |
| `cd clients/arologis-desktop; npm run build` | PASS |
| `powershell -ExecutionPolicy Bypass -File .\scripts\generate-arologis-dispatch-pages-screenshots.ps1` | PASS |

## PM / CI gate

- Local PM gate: PASS.
- GitHub CI gate: must be rechecked on the latest pushed review-fix commit.
- Merge request: intentionally deferred until CI is green and PM final approval is posted.

## 후속 PR 후보

- D-AX-12: mobile cross-import cleanup.
- D-AX-13: Arologis desktop installer/release workflow.
- CI follow-up: include `clients/web/design-system/**` in Arologis desktop CI triggers.
