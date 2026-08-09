# PR #1127 R6 — 카운터 계열 전수 수렴

## 결론

이번 sync의 카운터는 행/occurrence/link/Product/탭 단위를 이름에 고정했다. Product 보호와 구성품 보호를 하나의 `totalPreservedManual`에 합치지 않고, `totalSkippedOccurrences`만 Product·구성품 skip occurrence의 합으로 닫았다.

운영 판정 원문 기준으로 다음 값이 보존된다.

| 판정 | R6 결과 |
|---|---:|
| `nameDriftOccurrences` | 1,012 occurrence |
| `priceHistoryExposureSpecChangedRows` | 2행, 반복 0행 |
| 수동 보존 Product | 0 occurrence |
| 수동 보존 구성품 | 2 occurrence |
| 구성품 skip | 37 occurrence |
| 구성품 링크 | 1,600 link occurrence (고유 링크 1,581과 혼동하지 않음) |
| `closingIssuesReferences` | `[]` — #978 close 처리 없음 |

## 1. sync 카운터 전수 표

대상은 `ProductSheetSyncService`의 `TabSyncResult`, `ComponentSyncResult`, `SyncSummary`이다. `ProductLookupSheetSyncService`의 내부 lookup DTO는 별도 sync 서비스이며, admin 병합 시 R6의 `*Rows`/`*Occurrences` 계약으로 매핑한다.

### Product 탭 결과 (`TabSyncResult`)

| 이름 | 단위 | 이름이 단위를 선언하는가 | 실측/코드 일치 |
|---|---|---|---|
| `insertedRows` | Product 시트 행 occurrence | 예: `Rows` | 일치 |
| `updatedRows` | Product 시트 행 occurrence | 예 | 일치 |
| `unchangedRows` | Product 시트 행 occurrence | 예 | 일치 |
| `nameDriftOccurrences` | 이름 drift 시트 행 occurrence | 예 | 1,012 일치 |
| `priceHistoryExposureSpecChangedRows` | 실제 변경된 보조 entity 행 | 예 | 2행/0행 일치 |
| `softDeletedRows` | Product 행 | 예 | 일치 |
| `skippedOccurrences` | 파싱 불가 Product 행 occurrence | 예 | 일치 |
| `preservedManualProductOccurrences` | 수동 보존 Product 행 occurrence | 예 | 일치 |
| `preservedByRuleProductOccurrences` | rule 보호 Product 행 occurrence | 예 | 일치 |
| `deferredByEcountReservationProductOccurrences` | Ecount reservation 보호 Product occurrence | 예 | 일치 |
| `specsLinkedRows` | 저장된 ProductSpec 행 | 예 | 일치 |

### 구성품 탭 결과 (`ComponentSyncResult`)

| 이름 | 단위 | 이름이 단위를 선언하는가 | 실측/코드 일치 |
|---|---|---|---|
| `preservedManualComponentOccurrences` | 수기 구성품 집합으로 보존된 시트 행 occurrence | 예 | 2 occurrence 일치 |
| `linkedOccurrences` | 처리된 구성품 시트 행 occurrence; 기존 link 재처리도 포함 | 예 | 1,600 occurrence 일치 |
| `bundlesMarkedProducts` | BUNDLE 표식을 새로 적용한 Product | 예 | 일치 |
| `softDeletedComponentRows` | 구성품 link 행 | 예 | 일치 |
| `skippedOccurrences` | 부모/자식 미존재 구성품 행 occurrence | 예 | 37 occurrence 일치 |
| `blockedByRuleOccurrences` | rule 충돌로 연결하지 않은 구성품 행 occurrence | 예 | 일치 |

### 전체 결과 (`SyncSummary`)

| 이름 | 단위 | 이름이 단위를 선언하는가 | 합계 규칙/실측 |
|---|---|---|---|
| `totalInsertedRows` | Product 행 occurrence | 예 | Product tab 부분합 |
| `totalUpdatedRows` | Product 행 occurrence | 예 | Product tab 부분합 |
| `totalNameDriftOccurrences` | 이름 drift 행 occurrence | 예 | 1,012 |
| `totalPriceHistoryExposureSpecChangedRows` | 실제 변경 보조 entity 행 | 예 | 2/0 |
| `totalSoftDeletedRows` | Product 행 | 예 | Product tab 부분합 |
| `totalSoftDeletedComponentRows` | 구성품 link 행 | 예 | Component tab 부분합 |
| `totalSkippedOccurrences` | Product + 구성품 + 병합 lookup skip occurrence | 예 | 모든 부분을 누락 없이 합산; 구성품 37 포함 |
| `totalPreservedManualProductOccurrences` | 수동 보존 Product occurrence | 예 | 구성품 보존을 더하지 않음; 0 |
| `totalPreservedManualComponentOccurrences` | 수동 보존 구성품 occurrence | 예 | Product 보존과 분리; 2 |
| `totalPreservedByRuleProductOccurrences` | rule 보호 Product occurrence | 예 | Product tab 부분합 |
| `totalComponentLinkOccurrences` | 구성품 link occurrence | 예 | 1,600; 고유 link 1,581 아님 |
| `totalBundlesMarkedProducts` | BUNDLE 표식 Product | 예 | Component tab 부분합 |
| `totalBlockedByRuleOccurrences` | rule 차단 구성품 occurrence | 예 | Component tab 부분합 |
| `totalSpecsLinkedRows` | ProductSpec 행 | 예 | Product tab 부분합 |
| `totalTabs` / `failedTabs` / `successfulTabs` | 탭 | 예: `Tabs` | 성공/실패 부분합 불변식 |

핵심 불변식은 `totalSkippedOccurrences = Product skipped occurrence 합 + Component skipped occurrence 합 (+ admin 병합 lookup skip)`이다. `totalPreservedManualProductOccurrences`는 Product 보호만, 구성품 보호는 별도 필드만 증가한다. `totalComponentLinkOccurrences`는 natural key 고유 링크가 아니라 입력 행 occurrence라는 정의를 이름과 로그에 함께 고정했다.

## 2. 정한 규칙과 테스트 강제

규칙은 세 가지다.

1. 정수 카운터 이름은 `Rows`, `Occurrences`, `Products`, `Tabs` 중 실제 단위를 suffix로 선언한다.
2. `total*`은 해당 단위가 같은 부분 결과만 누락 없이 합산한다. 서로 다른 단위(Product와 구성품 occurrence)는 별도 필드로 둔다.
3. 기존 link 재처리는 `linkedOccurrences` 정의상 포함하고, 고유 링크 수가 필요하면 별도 dedup 집계로 명시한다.

구현/강제 위치:

- `services/product-service/src/main/java/com/samhanair/logis/product/service/ProductSheetSyncService.java:247-277` — Product·구성품 부분 결과를 단위별 total로 합산.
- `services/product-service/src/main/java/com/samhanair/logis/product/service/ProductSheetSyncService.java:452` — 기존 link 재처리를 포함한 occurrence 증가.
- `services/product-service/src/main/java/com/samhanair/logis/product/service/ProductSheetSyncService.java:2153-2178` — 단위가 선언된 DTO 필드.
- `services/product-service/src/test/java/com/samhanair/logis/product/it/ProductSheetSyncServiceIT.java:610-624` — RED-A 구성품 skip n=2, RED-B link/preserve 0, RED-C total 부분합.
- `services/product-service/src/test/java/com/samhanair/logis/product/it/ProductSheetSyncServiceIT.java:628-648` — RED-A 수동 구성품 보존 n=2, Product와 component 분리, skip 0.
- `services/product-service/src/test/java/com/samhanair/logis/product/it/ProductSheetSyncServiceIT.java:652-663` — 새 정수 카운터가 허용 단위 suffix를 갖는 구조 가드.
- `services/product-service/src/test/java/com/samhanair/logis/product/it/ProductSheetSyncServiceIT.java:576` — link occurrence n=3 회귀.
- `services/product-service/src/test/java/com/samhanair/logis/product/it/ProductSheetSyncServiceIT.java:343-349` — `priceHistoryExposureSpecChangedRows` 2행/0행 양방향.
- `services/product-service/src/test/java/com/samhanair/logis/product/it/ProductSheetSyncServiceIT.java:228-238` — `nameDriftOccurrences` 회귀.

## 3. 양방향 RED 원문 (n≥2)

### RED-A — n건 발생 → 카운터 n

```text
구성품 미존재 occurrence 2건
expected totalSkippedOccurrences = 2
expected ComponentSyncResult.skippedOccurrences = 2
```

```java
sync_구성품_미존재_두_occurrence는_총_skip_occurrence에_합산된다()
assertThat(...skippedOccurrences).isEqualTo(2);
assertThat(summary.totalSkippedOccurrences).isEqualTo(2);
```

```text
수기 구성품 보존 occurrence 2건
expected totalPreservedManualComponentOccurrences = 2
expected totalPreservedManualProductOccurrences = 0
```

### RED-B — 0건 발생 → 카운터 0

```text
동일 fixture에서 link occurrence = 0,
Product manual preservation = 0,
Component manual preservation = 0,
expected totalComponentLinkOccurrences = 0
```

위 원문은 `ProductSheetSyncServiceIT.java:621-624`의 zero assertions로 고정했다.

### RED-C — total = 부분의 합

```text
Product skipped occurrence 합 + Component skipped occurrence 합
= totalSkippedOccurrences
0 + 2 = 2
```

구성품 `cr.skippedOccurrences`를 `syncAll()`의 `summary.totalSkippedOccurrences`에 더하지 않으면 이 테스트가 0을 내므로 RED가 된다. 기존 이름 없는 `totalSkipped` 누락 결함을 직접 방지한다.

추가로 `priceHistoryExposureSpecChangedRows`는 기존 R5 fixture에서 `2 -> 2`, 재실행 `0 -> 0`을 유지했고, name drift는 occurrence 1,012 계약을 유지했다.

## 4. 이름 변경 시 소비자 전수 목록

- `services/product-service/src/main/java/com/samhanair/logis/product/service/ProductSheetSyncService.java` — 증가 지점, summary 합산, 로그, DTO/Javadoc.
- `services/product-service/src/main/java/com/samhanair/logis/product/web/ProductAdminController.java` — lookup 결과를 새 `*Rows`/`*Occurrences` DTO로 매핑하고 skip 합산.
- `services/product-service/src/main/java/com/samhanair/logis/product/scheduler/ProductSheetSyncScheduler.java` — Product sync 로그 소비자.
- `services/product-service/src/test/java/com/samhanair/logis/product/it/ProductSheetSyncServiceIT.java` — 관련 50 tests와 R6 양방향 fixture.
- `services/product-service/src/test/java/com/samhanair/logis/product/quantitysync/QuantitySyncRuleReconvergenceR7IT.java` — `blockedByRuleOccurrences`.
- `services/product-service/src/test/java/com/samhanair/logis/product/quantitysync/QuantitySyncRuleScopeReductionRegressionIT.java` — `softDeletedRows`.
- `services/product-service/src/test/java/com/samhanair/logis/product/web/ProductAdminControllerTest.java` — admin merge 계약.
- `clients/desktop/src/renderer/api/sheetSyncApi.ts` — BE 응답 타입.
- `clients/desktop/src/renderer/routes/admin/SheetSyncPage.tsx` — 총계 chip, 행 표시, skip/보존 단위 라벨.
- `clients/desktop/src/renderer/routes/admin/sheetSyncRows.ts` — 구성품 link occurrence를 행 표시에 매핑.

`ProductLookupSheetSyncService`의 `inserted/updated/skipped`는 별도 lookup sync 내부 DTO라서 이름을 섞지 않았다. 다만 `ProductAdminController.mergeLookupSummary()`에서 ProductSheetSyncService의 단위 명시 DTO에 매핑되는 지점까지 grep으로 확인했다.

## 5. 검증

실행 명령:

```text
./gradlew :services:product-service:test --tests '*Sync*' --tests '*Product*' --rerun-tasks
```

결과:

```text
BUILD SUCCESSFUL
15 actionable tasks: 15 executed
종료 코드 0
```

추가 R6 RED/GREEN 묶음도 종료 코드 0으로 통과했다. 전체 스위트와 루트 typecheck는 실행하지 않았다. 실/운영 DB 쓰기, commit, push, #978 close는 수행하지 않았다.

## 신규 파일

- `docs/dev-reports/2026-08-09-1127-r6-counter-family.md`
