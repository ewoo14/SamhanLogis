# SP-09-4 KFTC 오픈뱅킹 — Codex QA cycle 1 review

대상: `feat/sp-09-4-kftc-shell` / `dee1f20c`  
모드: read-only, PR 댓글 미게시

## 결론

**QA는 cycle 2 권고.** T4 RED는 Phase 11 이관 사유가 있어 blocker로 보지 않는다. 다만 Playwright T3는 422 API mock을 등록하지만 FE client-side validation에서 API 호출 전 차단되어 실제 422 transport 검증이 아니다.

## Findings

| ID | Severity | 위치 | 내용 |
|---|---|---|---|
| QA-C1-1 | Medium | `sp-09-4-kftc-shell.spec.ts:528-576` | T3는 `/fetch-and-match` 422 route를 등록하지만 `DepositMatchPage.handleSubmit`이 `from > to`를 먼저 검사해 `mutation.mutate`를 호출하지 않는다. 따라서 Playwright T3는 role=alert 한국어 메시지는 검증하지만 422 HTTP status/`DEPOSIT_DATE_RANGE_INVALID` FE 수신 경로는 검증하지 않는다. BE IT가 422를 검증하므로 blocker는 아니지만 스펙 설명은 과장되어 있다. |
| QA-C1-2 | Medium | `DepositMatchShellIT.java:268-309` | “journal draft 생성 확인” 테스트가 실제 journal/invoice/line 생성을 검증하지 않는다. 자동 분개 103/110은 구현 코드로만 확인되며 테스트 잠금이 없다. |
| QA-C1-3 | Low | `sp-09-4-kftc-shell.spec.ts:217` | `PLAYWRIGHT_SKIP_UI` 환경변수 기반 전체 skip이 있다. dev server 미가용은 `expect(ok).toBe(true)`로 false green을 막지만, CI/job에서 해당 env가 설정되면 UI 전체가 skip될 수 있다. 현재 요청의 금지 패턴인 `test.skip(!ok)`은 아니나 운영 가드로는 주의 필요. |

## Cross-check

- false green 금지: PASS 부분. `|| true`, `page.setContent` fallback은 없고 dev server 미가용은 fail 처리한다.
- HashRouter: PASS. URL 상수는 `/#/accounting/deposit-match?mockRole=...`.
- 권한 테스트: PASS. ACCOUNTANT/MANAGER/MASTER 허용, SALES/WAREHOUSE 차단을 T5에서 확인한다.
- UUID 비공개: PASS. T2에서 visible UUID regex를 body text 대상으로 검사한다.
- T4 modal RED: PASS 정당화. 테스트는 실제 실패하도록 남겨 두고 dev-report에서 Phase 11 이관 항목으로 명시했다.
- BE IT 422/502: PASS. `DepositMatchShellIT`에서 422 `DEPOSIT_DATE_RANGE_INVALID`, 502 `KFTC_SUBMIT_FAILED`를 검증한다.

## Decision

QA는 **cycle 2 권고(비차단 + BE blocker 종속)**. T3 설명을 “client-side validation”으로 낮추거나 API 호출 422를 별도 테스트로 분리하고, 자동 분개 103/110 IT를 추가하는 것이 적절하다.
