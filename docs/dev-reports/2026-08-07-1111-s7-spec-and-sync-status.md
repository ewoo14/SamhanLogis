# #1111 S7 — Playwright 경로 계약 및 sheet sync 상태 보고

작성일: 2026-08-07  
범위: S7 코드 수정 라운드 (라이브 UI 스크린샷은 다음 SOL 라운드로 이월)

## 1. Playwright spec 판정표

| 기존 실패 단언 | 사용자 경로 판별 | 조치 |
|---|---|---|
| `product-catalog.spec.ts:113`, `:324`, `:372` `estimate-items-components-button-*` visible | 견적품목 목록에는 구성 편집 경로가 없다. S2에서 해당 화면의 버튼을 제거한 것이 요구사항이다. | 삭제하지 않고 `시나리오 4`에서 견적품목 `SINGLE_SET` 탭의 구성 버튼 수가 0임을 단정하도록 갱신 |
| `product-catalog.spec.ts:115` `components-modal` visible | 견적품목에서 구성품 모달을 여는 경로는 죽었다. | `components-modal` 수가 0임을 단정하도록 갱신 |
| `product-catalog.spec.ts:116` dialog title visible | 견적품목에 모달 자체가 없으므로 title 단언 경로도 죽었다. | 모달 부재 단언으로 대체 |

새 반대급부 spec은 `시나리오 4b`, `4c`이다.

- `#/products/SET-HM2WAY/edit`로 직접 이동한다.
- `product-form-components-editor`와 구성품 행 9개를 확인한다.
- 구성품 모델코드를 추가하고 행 수가 10개가 되는지 확인한다.
- `product-form-components-save`를 클릭하고 저장 경로가 살아 있는지 확인한다.

따라서 제거된 견적품목 경로와 이동된 기초품목 세트 상세 경로를 각각 보호한다. 브라우저는 반드시 `clients/desktop` cwd에서 실행했으며 Chromium headless가 동작했다.

## 2. sync 200 출처·원인·수정

### 진단

- 200 출처: `services/product-service/src/main/java/com/samhanair/logis/product/web/ProductAdminController.java:68-80`의 `triggerSync()`가 기존에 무조건 `ApiResponse.ok(summary)`를 반환했다.
- `ProductSheetSyncService.syncAll()`은 탭별 예외를 `TabSyncResult.error`에만 기록하고 다음 탭으로 진행했다. `ProductLookupSheetSyncService`도 같은 패턴이었다.
- 따라서 11개 탭이 모두 SA key 미설정으로 실패해도 실패 탭 수가 없고 HTTP 200이 유지됐다.
- main 대조: `git show main:services/product-service/src/main/java/com/samhanair/logis/product/web/ProductAdminController.java`에도 동일한 무조건 `ApiResponse.ok(summary)`가 있다. 이 결함은 S2의 `ProductSheetSyncService` manual skip 변경이 아니라 선재 결함이다.
- S2 변경은 구성품 수기 보존 시 `ComponentSyncResult.preservedManual`을 증가시키는 동작뿐이다. 이 값은 실패와 섞지 않고 별도 합계로 응답한다.

### 수정 계약

- 각 product/구성품/lookup 탭에 `totalTabs`, `successfulTabs`, `failedTabs`를 집계한다.
- `failedTabs == 0`이면 HTTP 200, 일부 실패면 HTTP 207, 전부 실패면 HTTP 502를 반환한다.
- 탭별 기존 `error`와 기존 카운터는 그대로 유지한다. 새 합계로 사용자가 `성공/전체`와 실패 수를 알 수 있다.
- `totalPreservedManual`을 기존 `SyncSummary` 응답에 노출한다. manual로 보존된 행과 예외 실패는 서로 다른 카운터다.
- 기존 응답 envelope와 성공 응답의 JSON data 구조는 유지한다. 기존 정상 소비처는 200과 기존 필드를 계속 받으며, 실패 시에는 HTTP 상태와 `success=false`로 실패를 인지한다. 실패 응답도 상세 summary data를 보존하고, `GET /sync/last`에도 실패 summary가 보관되어 후속 조회가 가능하다.

### 정상 경로 반대급부

- manual skip은 예외가 아니므로 `successfulTabs`에 포함되고 `totalPreservedManual`에만 반영된다.
- 빈 시트/파싱 skip도 탭 실행 자체가 정상 종료된 것으로 처리되어 정상 sync가 실패로 뒤바뀌지 않는다.
- default category 사전조건 실패는 모든 예정 탭을 실패로 집계하여 200으로 빠지지 않게 했다.

## 3. 필수 3절

### ① 새로 가능해진 조합 열거 및 각각 밟기

| 조합 | 실행/판정 |
|---|---|
| 견적품목 → `SINGLE_SET` → 세트 행 | 구성 버튼 0, 구성품 모달 0 단정 통과 |
| 기초품목 → `SET-HM2WAY` 수정 상세 → 기존 구성품 | editor 및 9행 단정 통과 |
| 기초품목 세트 상세 → 구성품 코드 추가 → 저장 | 10행 증가 및 저장 버튼 경로 단정 통과 |
| sync 정상(실패 0) | HTTP 200 단위 테스트 통과 |
| sync 부분 실패(성공 6/실패 5) | HTTP 207 및 실패 수 단위 테스트 통과 |
| sync 전부 실패(실패 11) | HTTP 502 단위 테스트 통과 |

### ② 제거·이동·개명 식별자 grep 전수

- 제거된 견적품목 동작의 구현 참조: `estimate-items-components-button-*`는 renderer 구현에 남아 있지 않다.
- `components-modal-*` 구현 참조: renderer 구현에 남아 있지 않다.
- Playwright에는 위 식별자가 **부재를 단정하는 negative spec**으로만 남아 있다.
- 이동된 신규 식별자: `product-form-components-editor`, `product-form-component-row-*`, `product-form-component-add-code`, `product-form-components-save`.
- 대상 파일 전체 `git diff --check` 결과 공백 오류 0건.

### ③ 변경 파일 참조 테스트 전부

- `./gradlew :services:product-service:test --tests 'com.samhanair.logis.product.web.ProductAdminControllerTest' --tests 'com.samhanair.logis.product.it.ProductSheetSyncServiceIT'` — BUILD SUCCESSFUL
- 최종 공통 envelope 보강 후 `./gradlew :services:product-service:test --tests 'com.samhanair.logis.product.web.ProductAdminControllerTest'` — BUILD SUCCESSFUL
- `npm run typecheck` (`clients/desktop`) — exit 0
- `npx playwright test playwright/product-catalog/product-catalog.spec.ts --reporter=line` (`clients/desktop`) — 15 passed
- 좁은 재검증: `--grep "시나리오 4"` — 3 passed

## 신규 파일 목록

- `docs/dev-reports/2026-08-07-1111-s7-spec-and-sync-status.md` (본 보고서)

S6에서 이미 생성된 `docs/dev-reports/2026-08-07-1111-s6-live-qa.md`는 이번 라운드 신규 파일이 아니며 수정하지 않았다.
