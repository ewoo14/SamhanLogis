# SP-09-1 NTS e-Tax 발행 shell — Codex QA Cycle 1 후반 리뷰

브랜치: `feat/sp-09-1-nts-etax-emit-shell`  
HEAD: `7363a729`  
범위: Section D — IT, Playwright, QA screenshots, dev-report

## 결론

**cycle 2 진입 권고.** Claude cycle 1에서 지적한 빈 PNG, `|| true`, audit 직접 검증, enum 불일치는 대부분 수정됐다. 그러나 Playwright T5는 여전히 현재 page 상태를 혼동해 SALES 버튼 검증을 INVENTORY 페이지에서 수행하고, T1/T3는 route mock과 페이지 로드 확인 중심이라 실제 emit flow 검증력이 낮다.

## 결함

### HIGH — Playwright T5가 SALES 버튼 검증을 INVENTORY 페이지에서 수행함

- 위치: `clients/desktop/playwright/sp-09-1-nts-etax-emit-shell/sp-09-1-nts-etax-emit-shell.spec.ts:536-562`
- 현상: T5는 SALES 페이지에서 `salesBlocked`를 계산한 뒤 MANAGER, INVENTORY 페이지로 이동한다. 이후 `salesNtsBtnCount`를 계산하는 시점은 이미 INVENTORY 페이지다.
- 영향: “SALES 역할에서 NTS 발행 버튼 미노출” 검증이 실제 SALES 화면을 보지 않는다. Claude H1의 `|| true` false-green은 제거됐지만, assertion 대상 페이지가 바뀌어 여전히 권한 회귀를 놓칠 수 있다.
- 권고: SALES 페이지에서 `salesNtsBtnCount`를 즉시 계산하거나, 역할별로 `test.step`을 분리해 page 이동과 assertion을 붙여 둔다.

### MEDIUM — Playwright T1의 422/409 분기는 실 FE flow에서 트리거되지 않음

- 위치: `sp-09-1-nts-etax-emit-shell.spec.ts:141-156`, `:206-209`
- 현상: T1은 `url.includes('draftTest')`, `duplicateTest`일 때 422/409를 반환하지만 실제 UI가 해당 URL을 호출하지 않는다. 테스트는 페이지 로드와 pageerror 없음만 확인한다.
- 영향: 422/409 한국어 에러 렌더링 회귀를 잡지 못한다.
- 권고: 실제 버튼 클릭 전에 route가 409/422를 반환하도록 고정하고, `role="alert"` 또는 error banner text를 assert한다.

### MEDIUM — Playwright T3는 emit 버튼 클릭 없이 eTaxExternalId 관련 문구만 검사함

- 위치: `sp-09-1-nts-etax-emit-shell.spec.ts:337-414`
- 현상: emit-nts route와 audit route를 mock하지만 실제 “NTS 발행” 버튼 클릭, modal confirm, API 호출, cache invalidation 뒤 banner 표시를 연속 검증하지 않는다. `bodyText.includes('e-Tax')` 같은 넓은 조건으로 통과 가능하다.
- 영향: eTaxExternalId banner가 실제 성공 후 렌더되는지 보장하지 못한다.
- 권고: issued detail 진입 → 버튼 클릭 → modal confirm → route 호출 횟수 확인 → `data-testid="tax-invoice-detail-etax-external-id"` 표시 순서로 검증한다.

### LOW — IT의 audit “독립 트랜잭션” 주석/검증 설명이 구현과 다름

- 위치: `TaxInvoiceEmitNtsIT.java:57-60`, `TaxInvoiceEmitService.java:113`, `:135`
- 현상: IT는 `recordEmitAudit`가 `REQUIRES_NEW`라 테스트 rollback과 무관하게 audit row가 남는다고 설명한다. 실제 구현은 self-invocation이라 `REQUIRES_NEW`가 적용되지 않는다.
- 영향: 테스트가 audit row 존재는 볼 수 있어도 트랜잭션 독립성은 검증하지 못한다.
- 권고: BE fix 후 audit recorder bean을 분리하고, audit 실패가 `markEmitted` commit을 막지 않는 별도 테스트를 추가한다.

## Claude cycle 1 fix cross-check

| Claude 항목 | Codex 판정 | 근거 |
|---|---|---|
| C1 FE/BE enum 불일치 | FIXED | FE `NTS`, BE `DRY_RUN|NTS` 일치 |
| C2 빈 screenshot | FIXED | PNG 4장 90~110KB로 교체 |
| H1 `|| true` false green | PARTIAL | `|| true` 제거. 하지만 T5 assertion page 혼동 잔존 |
| H2 audit 직접 검증 없음 | FIXED(존재 검증) / PARTIAL(독립성) | repository 조회 추가. 독립 트랜잭션 검증은 안 됨 |
| H3 DB unique 없음 | FIXED | V16 partial unique 추가 |
| M1 route mock 자기 참조 | REMAINS | 주석으로 목적 재정의했지만 실제 에러 렌더 assert 없음 |
| M2 dead code | FIXED | `etaxIdDisplayed` expect 추가 |
| L3 never-executed branch | REMAINS | `draftTest`/`duplicateTest` 분기 여전히 실 UI 무관 |

## 검증

- `npm run typecheck` (`clients/desktop`) — PASS
- `.\gradlew.bat :services:accounting-service:compileJava :services:accounting-service:compileTestJava` — 실행 불가: Gradle wrapper lock file 접근 거부 (`gradle-8.10.2-bin.zip.lck`)

## TM 결정안

**cycle 2 진입 권고.** QA merge blocker: T5 역할별 page/assertion 분리. 권고 blocker: T1/T3를 실제 emit flow 기반으로 강화.
