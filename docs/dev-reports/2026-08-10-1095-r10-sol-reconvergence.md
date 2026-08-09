# PR #1133 R10 적대검증 재수렴

## 0. 환경 확인

- 워크트리: `C:\dev\Samhan-Public\.claude\worktrees\t1095`
- 브랜치: `feat/1095-sheet-product-status`
- Git HEAD: `dfb70a763b034e8147900096901bea3bdd78280e`
- 데스크톱: `http://127.0.0.1:5295` (BrowserRouter), API proxy: `5296`
- product-service: `t1095-product-r10-dfb7`, `127.0.0.1:28084`, image revision label = 위 HEAD, health `UP`
- inventory-service: `t1095-inventory-r10-dfb7`, `127.0.0.1:28085`, image revision label = 위 HEAD, health `UP`
- product JAR SHA-256: `C848BBC6DEB02F0F921514AA1777FD6FA1C5CC933DC1D317873199B5EDD4D2C6`
- inventory JAR SHA-256: `E9BAF1C4460C5780DBB7FA204F843E7ADCD1B632DE7E1CB441CC3723A5A2D429`

검증 시작 전 상태 분포 SQL 원문:

```text
    status    | count
--------------+-------
 ACTIVE       |  2984
 DISCONTINUED |    83
 NOT_FOR_SALE |    14
 OUT_OF_STOCK |     3
(4 rows)
```

처음 검토한 `ACL-KORGHP07`은 `SINGLE / bundle_mode NULL`이지만 견적 노출 대상이 아니어서 폐기했다. 실제로 고른 표본은 `AM080AXVHHH1`이다. 선택 전 SQL 원문:

```text
  model_name  | status | product_type | bundle_mode | product_category | usage_scope | estimate_category | display_order
--------------+--------+--------------+-------------+------------------+-------------+-------------------+--------------
 AM080AXVHHH1 | ACTIVE | SINGLE       |             | COMMERCIAL_MULTI | BOTH        | COMMERCIAL_MULTI  |            1
```

즉 `BUNDLE`이 아니고 `EXPAND`되지 않는 노출 단품이다. 실제 Google Sheets `상업멀티_단가인상` 4행의 상태 셀 `I4` 원문은 검증 전후 모두 `""`(공란)이다.

## 1. 첫 과제 6단계

### 판정

단품 저장본 경로는 완주했다. `ACTIVE` 단품을 수량 10으로 저장한 뒤 현재 상태를 `OUT_OF_STOCK`으로 바꾸면 저장 수량 10이 유지된 채 잠기고, 다시 `ACTIVE`로 돌리면 잠금이 풀렸다. 따라서 현재 상태를 재조회하며, 저장 당시 상태를 스냅샷으로 박제하는 동작이 아니다.

다만 Google Sheets 쓰기에 셋째 경로를 사용했다. 서비스 계정의 실제 Sheets write는 HTTP 403 `The caller does not have permission`, in-app Browser 목록은 `[]`라 원본 셀을 편집할 수 없었다. 이에 product-service의 공식 `google.sheets.endpoint-override`를 로컬 read-through proxy(`5297`)로 연결했다. 모든 탭은 실제 Google Sheets에서 읽고, 동기화 응답 중 `I4` 한 셀만 `품절`로 바꿨다. 원본 Sheets는 끝까지 공란이었다. 이 계측 사실을 숨기지 않으며, 원본 Sheets 자체를 편집한 native E2E는 아니다.

1. 단품 선택: [01-active-single-selected.png](../qa/2026-08-10-1095-r10/01-active-single-selected.png)
2. 데스크톱 견적 저장: [02-single-estimate-saved.png](../qa/2026-08-10-1095-r10/02-single-estimate-saved.png)
3. 실 관리자 동기화 API 후 저장본 재열기, 품절 잠금: [03-saved-single-out-of-stock-locked.png](../qa/2026-08-10-1095-r10/03-saved-single-out-of-stock-locked.png)
4. 품절 잠금 값: `value=10`, `editable=false`
5. 실 관리자 `POST /products/{id}/reactivate` 후 해제: [07-active-unlocked-not-snapshot.png](../qa/2026-08-10-1095-r10/07-active-unlocked-not-snapshot.png), `editable=true`
6. 최종 분포가 최초 분포와 일치하고 표본 tags도 `{}`로 복구됐다.

07 캡처의 수량 `13`은 늦은 조회 시간창에서 넣은 협업 문서의 미저장 화면값이며, DB 저장 라인은 계속 `10`이다. 이는 상태 병합이 사용자 입력을 덮지 않았다는 증거이지 저장 수량을 바꿨다는 뜻이 아니다. 캡처 상단의 “업데이트 실패” banner는 데스크톱 updater의 로컬 배포 환경 잡음으로, 견적 API·상태 lookup 판정과 무관하다.

저장 후 라인이 부모 전개 없이 같은 단품으로 남은 SQL 원문:

```text
 estimate_no  | line_no |  model_name  | quantity | parent_set_model | set_head
--------------+---------+--------------+----------+------------------+----------
 2026/08/10-2 |       1 | AM080AXVHHH1 |       10 |                  | f
(1 row)
```

최종 표본과 분포 SQL 원문:

```text
  model_name  | status | product_type | bundle_mode | product_category | usage_scope | tags
--------------+--------+--------------+-------------+------------------+-------------+------
 AM080AXVHHH1 | ACTIVE | SINGLE       |             | COMMERCIAL_MULTI | BOTH        | {}

    status    | count
--------------+-------
 ACTIVE       |  2984
 DISCONTINUED |    83
 NOT_FOR_SALE |    14
 OUT_OF_STOCK |     3
```

주의할 원문이 하나 더 있다. 관리자 전체 시트 동기화 응답은 `totalUpdatedRows=122`였다. 의미상 상태 변경 표본은 `AM080AXVHHH1` 한 건이고 최종 분포·tags는 복구했지만, 이 endpoint가 다른 시트 행의 동기화/audit write도 수행했다. 즉 “실 관리자 동기화 API”와 “공유 DB write는 R10 표본만”을 동시에 만족시키지 못하는 endpoint 범위 충돌이 실제로 존재한다.

상세 API 원문: `docs/qa/2026-08-10-1095-r10/r10-first-task-observations.json`.

## 2. 품절 BUNDLE 관측 — 수정하지 않음

`AR60F07D11WS`는 실 API 기준 `OUT_OF_STOCK + BUNDLE(itemKind=SET) + EXPAND`다.

- 품목 선택 후보에 실제로 표시됐다.
- 품절 상태에서 새 견적에 선택하면 부모 `AR60F07D11WS` 행 자체가 남고 그 부모 수량이 `1`, `editable=false`, aria-label `라인 1 수량 품절`이 됐다.
- 즉 신규 선택 화면에서 잠금은 구성품이 아니라 부모에 걸린다: [08-out-of-stock-bundle-candidate-and-lock.png](../qa/2026-08-10-1095-r10/08-out-of-stock-bundle-candidate-and-lock.png).
- 반면 ACTIVE일 때 저장하면 서버가 부모를 구성품으로 바꾼다. `BundleModePolicy.java:11-15`의 전개 판정에는 상태가 없고, `EstimateService.java:101-139`에서 부모 요약으로 전개한 뒤 `:141-164`에서 구성품만 영속한다. 부모 상태를 저장 라인에 승계하는 코드는 없다.
- 따라서 R9의 “ACTIVE 구성품만 남은 뒤 부모가 품절되어도 아무것도 잠기지 않음”과 R10의 “처음부터 품절이면 부모가 남아 잠김”은 함께 성립한다. 의도 여부는 업무 규칙이므로 수정하지 않았다.

## 3. ① 별도 상태 조회 effect

### 늦은 응답

- 품절 저장본에서 status lookup 응답을 지연시키면 도착 전 수량 input이 편집 가능했다: [04-late-status-window-before-arrival.png](../qa/2026-08-10-1095-r10/04-late-status-window-before-arrival.png).
- 사용자가 `10 → 13`을 입력한 뒤 응답이 오면 값은 `13`으로 보존되고 잠금만 뒤늦게 걸렸다: [05-late-status-arrived-input-preserved.png](../qa/2026-08-10-1095-r10/05-late-status-arrived-input-preserved.png).
- 즉 늦은 병합이 입력을 덮지는 않지만, 품절인데 입력할 수 있는 시간창은 실제로 열린다.

코드는 `EstimateFormPage.tsx:907-925`에서 현재 `linesRef`에 status 필드만 병합하므로 입력 보존은 맞다. 잠금은 `:2300-2314`, 수량 update guard는 `:1273-1276`이다.

### 조회 실패

lookup을 실패시키면 기존 저장 라인에 status가 없으므로 fail-open이다. 수량 `13`은 편집 가능하고 품절 badge도 없다: [06-status-lookup-failure.png](../qa/2026-08-10-1095-r10/06-status-lookup-failure.png). `estimateLineStatus.ts:18-27`이 예외 시 원래 라인을 반환한다.

### 협업 3회

같은 견적을 두 사용자 context로 열고 B의 비고 변경을 A에서 3회 확인했다. 끊김은 `0/3`, 반영 시간은 `404ms / 383ms / 395ms`였다: [09-collaboration-three-runs.png](../qa/2026-08-10-1095-r10/09-collaboration-three-runs.png).

## 4. ② `reactivate()` 이름 규칙

- 실 관리자 PATCH로 `AM080AXVHHH1` 이름을 활성 품목 `0000098`의 이름으로 바꾸려 한 결과: HTTP 409 `CONFLICT`. 부분 수정 검사는 작동한다.
- 같은 R10 표본에 reactivate 호출: HTTP 204. 이미 ACTIVE인 표본이므로 멱등 도달성만 확인했다.
- 두 코드 경로는 같은 규칙이 아니다. 수정은 `ProductService.java:596-599`에서 `assertNameAvailable()`을 호출하지만, reactivate는 `:685-688`에서 검사 없이 상태만 바꾼다.
- 실 DB에도 비활성 품목명과 활성 품목명이 같은 사례가 존재한다. 예: `AF70F19D11GRS (NOT_FOR_SALE)`와 `AF70F17D11GS (ACTIVE)`, `AR07C9180HZS (DISCONTINUED)`와 여러 활성 벽걸이 품목. 비-R10 표본은 변경하지 않았다.
- 기존 `ProductCatalogControllerIT.java:115-143`도 중복 이름 재사용 후 옛 품목 reactivate가 409여야 한다고 단언한다. 현재 실제값은 204다.

따라서 규칙 분기와 CI 실패는 같은 원인이다. 프로덕션 코드나 테스트는 이 검증 라운드에서 고치지 않았다.

## 5. ③ SafetyStockControllerIT와 실 경로

R10에서 `lookupAllowMissing()`이 전량 미조회(`[]`)를 반환하는 Controller IT를 추가했다. MockMvc → Controller → Service → Testcontainers PostgreSQL 경로에서 알림 행은 남고 `productCode/productName=null`인 것을 확인했다.

- 신규 단일 테스트: 통과
- `SafetyStockControllerIT` 전체: 통과
- `SafetyStockService.java:148-160`: product가 없어도 `alerts.add(...)`
- `SafetyStockService.java:170-193`: `lookupAllowMissing()` 결과를 부분 map으로 만들며 전량/부분 누락을 null fallback

실 API 비교:

- 기존 `8085` 컨테이너: 정상 식별자 `0`, 실패. 이 컨테이너는 R10 HEAD 배포 증거가 없어 HEAD 판정에서 제외했다.
- `dfb70a763` inventory를 `28085`에 배포한 동일 GET: HTTP 200, 전체 7행 중 정상 식별자 1행과 stale 6행을 모두 보존, 통과.

PR #1133 CI에서 inventory mock 교체가 원인인 실패는 없다. 그러나 전체 CI는 red다. `user+product+inventory+logging` 708개 중 `ProductCatalogControllerIT.POST_products_단종된_이름은_재사용할_수_있다` 1건이 기대 409/실제 204로 실패했다. 나머지 확인된 jobs와 하네스 거짓 green 가드는 통과했다.

## 6. ④ R5~R7 회귀

- 견적 노출: DB의 `usage_scope IN (ESTIMATE,BOTH)` 분포와 HEAD internal API가 일치했다. `ACTIVE 751` 중 누락 0 (`HOME 107 + SINGLE 223 + COMMERCIAL 382 + LEGACY 39`), `OUT_OF_STOCK 3` 중 누락 0.
- 품절 후보 표시: 단품 첫 과제 및 품절 BUNDLE GUI에서 확인.
- 시트 공란 상태 보존: 실제 선택 셀 `I4`는 전후 공란이고 표본은 최종 ACTIVE. `ProductSheetSyncServiceIT.sync_시트_상태_세_가지_반영하고_상태_공란은_기존상태를_보존한다` 통과.
- 비상품: 실 SQL `NON_GOODS 34건`; GUI에서 `운임` 수량을 지운 뒤 단가 입력 시 수량 `1` 자동 복구.
- BUNDLE: `AC060CS6PBH1SY` 실 GUI `/slips/expand-line` HTTP 200, 8행 전개: [10-r5-non-goods-and-bundle-regression.png](../qa/2026-08-10-1095-r10/10-r5-non-goods-and-bundle-regression.png).
- 안전재고 stale 혼합: HEAD 실 API에서 정상 코드·이름 1행 보존, stale 6행도 무음 소실 없음.

## 7. 생성·변경 파일과 R10 표본

신규 파일:

- `clients/desktop/playwright/1095-r10-real-qa/playwright.config.ts`
- `clients/desktop/playwright/1095-r10-real-qa/1095-r10-first-task-real-qa.spec.ts`
- `clients/desktop/playwright/1095-r10-real-qa/google-sheets-r10-proxy.cjs`
- `docs/qa/2026-08-10-1095-r10/` 아래 PNG 10개, JSON 6개
- 본 보고서

변경 파일:

- `services/inventory-service/src/test/java/com/samhanair/logis/inventory/it/SafetyStockControllerIT.java` — 전량 미조회 fail-soft IT 한 건만 추가

R10 표본:

- 품목 `AM080AXVHHH1`: 기존 실품목을 R10 동안만 상태/tags 변경, 최종 `ACTIVE`, tags `{}`
- 견적 `2026/08/10-2`: 단품 1행, 저장 수량 10, memo `R10-1095-SINGLE-STATUS 실제 사용자 저장 표본`
- 별도 product 생성 없음, DB 직접 INSERT/UPDATE 없음

## 8. 못 한 것과 최종 판정

- 권한 때문에 실제 Google Sheets 셀 write는 못 했다. read-through endpoint override로 동일 parser/sync/API/DB/UI 경로를 밟았지만 원본 Sheets 편집까지 포함한 native E2E는 미완료다.
- 품절 BUNDLE의 의도 정책은 개발책임자 판단 사항이라 관측만 하고 고치지 않았다.
- 이름 규칙 분기와 그로 인한 CI red도 관측만 했고 고치지 않았다.
- 늦은 조회 전 품절 편집 시간창 및 조회 실패 fail-open도 고치지 않았다.

결론: R5 핵심 단품 저장본 결함은 현재 HEAD에서 잠금·해제가 작동한다. 동시에 (1) 늦은 조회 전 편집 시간창, (2) 조회 실패 시 품절 잠금 소실, (3) ACTIVE 저장 후 부모가 사라지는 EXPAND BUNDLE 상태 손실, (4) update/reactivate 이름 불변식 분기 및 CI red를 재현했다.

## 9. 최종 검증 원문 요약

- R10 첫 과제 Playwright: `1 passed (2.3m)`
- 품절 BUNDLE Playwright: `1 passed (11.2s)`
- 협업 3회 Playwright: `1 passed (11.1s)`
- 이름 규칙 Playwright: `1 passed (7.3s)`
- R5 비상품/BUNDLE Playwright: `1 passed (9.9s)`
- HEAD 안전재고 실 API Playwright: `1 passed (3.1s)`
- `SafetyStockControllerIT` 전체: `BUILD SUCCESSFUL`
- 시트 공란 보존 ProductSheetSyncServiceIT: `BUILD SUCCESSFUL`
- `estimateLineStatus.test.ts`: 3/3 통과
- 하네스 거짓 green 가드: 62/62 통과. H-2 `docs/qa` 목적지 resolver 검사 포함
- `docs/qa/2026-08-10-1095-r10/_local`: 없음
- `tools/legacy-gas/**`: 변경 없음
- 자격 평문 패턴 검색: 0건
- commit/push: 하지 않음
