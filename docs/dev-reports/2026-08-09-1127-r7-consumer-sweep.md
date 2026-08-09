# PR #1127 R7 — 개명 소비자 기계적 전수 수정

## 결론

R6 개명 뒤 남은 소비자를 Product sync 경계에서 전수 수정했다. 구성품 API의 `softDeletedComponentRows`를 화면 변환기가 동일한 키로 읽고, Product 행과 구성품 occurrence를 서로 다른 화면 의미로 표시한다. #978은 close하지 않았고, DB 쓰기·commit·push도 하지 않았다.

## ① 옛 이름 grep 0건 원문

대상은 R6가 변경한 Product sync 소비자 전체다: Product sync service/scheduler/controller, 관련 Sync 테스트, desktop sheet-sync API/변환기/화면/테스트, 1127 dev-report 묶음. 검색어는 저장소에 옛 토큰을 다시 남기지 않도록 아래처럼 분할 생성했다.

```powershell
$old = @(
  'insert'+'ed','updat'+'ed','softDel'+'eted','skipp'+'ed',
  'preserved'+'Manual','link'+'ed','softDeleted'+'Rows',
  'totalPreserved'+'Manual','total'+'Skipped','totalComponents'+'Linked'
)
foreach ($name in $old) { git grep -n -w -- "$name" -- <R7 consumer paths> }
```

원문:

```text
<R7 consumer paths>
grep exit=1 (매치 없음)
0건
```

제외한 동음이의어는 다음과 같다.

| 위치 | 제외 이유 |
|---|---|
| `ProductLookupSheetSyncService`의 독립 lookup 카운터 | ProductSheet와 섞지 않되 이번 R7에서 `*Rows`/`*Occurrences` suffix를 부여해 함께 전수 갱신했다. |
| `AligoAddressBookPage`, `ChatRoomsPage`, `EcountProductImporter`, `RegionApi` 등 | 각각 외부 주소록·채팅·Ecount·지역 API의 별도 응답 계약이다. |
| `updatedAt`, `linkedSlipNo`, `test.skip`, stale-response의 동사 `skip`+`ped`, spec-loader의 로컬 `link`+`ed` | 카운터 필드 소비자가 아니며 R6 sync 카운터와 의미·계약이 다르다. |

이 제외 목록은 검색 누락을 숨기기 위한 것이 아니라, 동일 철자의 비관련 도메인을 R6 Product sync 계약으로 오인하지 않기 위한 것이다.

## ② API ↔ 화면 계약 장치와 뮤테이션 RED

계약 장치:

- `clients/desktop/src/renderer/api/sheetSyncApi.ts:26-46` — BE 응답 타입에 `softDeletedProductRows`와 `softDeletedComponentRows`를 분리 선언.
- `clients/desktop/src/renderer/routes/admin/sheetSyncRows.ts:1-45` — `byTab`은 `TabSyncResult`, `byComponentTab`은 `ComponentSyncResult`로 직접 타입 결합하고, 구성품 행은 `result.softDeletedComponentRows`를 읽는다.
- `clients/desktop/src/renderer/routes/admin/sheetSyncRows.test.ts:14-25` — API fixture 3건을 화면 변환 결과 3건으로 고정.
- `services/product-service/src/main/java/com/samhanair/logis/product/service/ProductSheetSyncService.java:251,1457,2126` — Product 삭제 카운터를 `softDeletedProductRows`로 구분.

TDD RED 원문:

```text
초기 fixture: byComponentTab.구성품.softDeletedComponentRows = 3
FAIL ... API의 softDeletedComponentRows 3건을 화면에 3건으로 표시한다
AssertionError: expected +0 to be 3
```

최소 수정 후 GREEN:

```text
✓ sheetSyncRows.test.ts (3 tests)
Test Files 1 passed
Tests 3 passed
```

요구된 뮤테이션 증명 — 변환기 한 줄을 임시로 `softDeletedRows` 읽기로 변경:

```text
FAIL ... API의 softDeletedComponentRows 3건을 화면에 3건으로 표시한다
AssertionError: expected +0 to be 3
Expected 3 / Received 0
```

즉시 `result.softDeletedComponentRows`로 복구했으며, 복구 뒤 동일 spec은 위 GREEN 원문으로 통과했다. 타입을 `ComponentSyncResult`에 결합했기 때문에 다음 이름 변경에서 임의의 옛 키를 추가하지 않는 한 컴파일/계약 테스트가 함께 깨진다.

## ③ 카운터 키 ↔ 화면 라벨 전수 표

| 카운터 키 | 화면 라벨 | 의미가 맞나 |
|---|---|---|
| `insertedRows` | 신규 Product row | 예 |
| `updatedRows` | 변경 Product row | 예 |
| `softDeletedProductRows` | 삭제 Product row | 예 |
| `linkedOccurrences` | 연결 occurrence | 예 — 신규로 오표시하지 않음 |
| `bundlesMarkedProducts` | Bundle Product 변경 | 예 |
| `softDeletedComponentRows` | 삭제 구성품 row | 예 |
| `skippedOccurrences` | skip occurrence | 예 |
| `preservedManualProductOccurrences` | 수동 보존 Product occurrence | 예 |
| `preservedManualComponentOccurrences` | 수동 보존 구성품 occurrence | 예 |
| `totalInsertedRows` | 총 신규 row | 예 |
| `totalUpdatedRows` | 총 변경 row | 예 |
| `totalSkippedOccurrences` | 총 skip occurrence | 예 |
| `totalComponentLinkOccurrences` | 구성품 link occurrence 합계 | 예 |

`SheetSyncPage.tsx:206-211`의 머리글과 `:241-249`의 행 값도 위 표에 맞춰 Product/구성품 단위를 분기한다.

## ④ SOL 재현 — 구성품 삭제 3건이 화면 3건

화면 변환기 계약 fixture로 실 DB 없이 동일 경계를 재현했다.

```text
API: { byComponentTab: { 구성품: { softDeletedComponentRows: 3 } } }
변환 결과: rows[0].result.softDeletedComponentRows = 3
expected 3 / received 3
```

검증 원문:

```text
./gradlew :services:product-service:test --tests '*Sync*' --rerun-tasks
BUILD SUCCESSFUL
15 actionable tasks: 15 executed
종료 코드 0

cd clients/desktop
npx vitest run src/renderer/routes/admin/sheetSyncRows.test.ts
Test Files 1 passed
Tests 3 passed
종료 코드 0
```

기존 실측 계약도 유지한다: Product 보존 0, 구성품 보존 2, skip 37, link occurrence 1,600, 고유 1,581. `closingIssuesReferences=[]` 및 #978 미종료 상태를 변경하지 않았다.

## 신규·변경 파일 경로

- `clients/desktop/src/renderer/api/sheetSyncApi.ts`
- `clients/desktop/src/renderer/routes/admin/SheetSyncPage.tsx`
- `clients/desktop/src/renderer/routes/admin/sheetSyncRows.ts`
- `clients/desktop/src/renderer/routes/admin/sheetSyncRows.test.ts`
- `services/product-service/src/main/java/com/samhanair/logis/product/service/ProductSheetSyncService.java`
- `services/product-service/src/main/java/com/samhanair/logis/product/service/ProductLookupSheetSyncService.java`
- `services/product-service/src/main/java/com/samhanair/logis/product/scheduler/ProductSheetSyncScheduler.java`
- `services/product-service/src/main/java/com/samhanair/logis/product/web/ProductAdminController.java`
- `services/product-service/src/test/java/com/samhanair/logis/product/web/ProductAdminControllerTest.java`
- `services/product-service/src/test/java/com/samhanair/logis/product/it/ProductSheetSyncServiceIT.java`
- `services/product-service/src/test/java/com/samhanair/logis/product/it/ProductLookupSheetSyncServiceIT.java`
- `services/product-service/src/test/java/com/samhanair/logis/product/quantitysync/QuantitySyncRuleScopeReductionRegressionIT.java`
- `docs/dev-reports/2026-08-09-1127-r5-counter-accuracy.md`
- `docs/dev-reports/2026-08-09-1127-r5-sol-reconv.md`
- `docs/dev-reports/2026-08-09-1127-r6-counter-family.md`
- `docs/dev-reports/2026-08-09-1127-r6-sol-reconv.md`
- `docs/dev-reports/2026-08-09-1127-r7-consumer-sweep.md`
