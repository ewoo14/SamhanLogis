# #978 D-1 후속 — 비교 필드와 갱신 필드 정렬

## 결론

일반적인 기존 SHEET/MANUAL 품목 sync에서 `Product.name`은 갱신하지 않으므로 비교 대상에서도 제거했다. 시트명과 DB명만 다른 품목은 `updated`에 포함하지 않고 `nameDrift`로 별도 관측한다. 이름 값은 변경하지 않는다.

코드에 기존 ECOUNT→SHEET 승격 예외 경로의 `p.rename(name)`은 남아 있다(`promoteEcountToSheet()`가 true일 때만 실행). 이는 일반 SHEET 품목의 481건 경로가 아니며, 이번 수정에서 새 이름 덮어쓰기 동작을 추가한 것이 아니다. 일반 steady-state 경로의 비교/갱신 필드 정렬은 아래 표와 같다.

## (a) 비교 대상 ↔ 갱신 대상 전수 표

| 필드 | 비교 대상 | 실제 DB 갱신 | 조건 | 차집합 판정 |
|---|---:|---:|---|---|
| `releasePrice` | O | O | 항상 | 일치 |
| `deliveryPrice` | O | O | 항상 | 일치 |
| `panelType` | O | O | `classifyPanelType(name, modelCode)` 파생값 | 일치 |
| `remoteType` | O | O | `classifyRemoteType(name)` 파생값 | 일치 |
| `pyongSize` | O | O | `SINGLE_SET`이고 시트 값이 non-null일 때 | 일치 |
| `usageScope` | O | O | `usageScopeManual=false`일 때 | 일치 |
| `hasVariableDiscount` | O | O | `variableDiscountManual=false`일 때 | 일치 |
| `setMaterialKey` | O | O | `variableDiscountManual=false`일 때 | 일치 |
| `legacyDiscountFlag` | O | O | `variableDiscountManual=false`일 때 | 일치 |
| `discountFlags` | O | O | `variableDiscountManual=false`일 때 | 일치 |
| `fixedDiscountRate` | O | O | `fixedDiscountManual=false`일 때 | 일치 |
| `catL` | O | O | `classificationManual=false`일 때 | 일치 |
| `catM` | O | O | `classificationManual=false`일 때 | 일치 |
| `catS` | O | O | `classificationManual=false`일 때 | 일치 |
| `name` | X | X | 일반 SHEET/MANUAL steady-state | 일치 |

양방향 차집합:

```text
보는데 안 쓴다  = ∅
쓰는데 안 본다  = ∅
```

`modelCode`는 비교/갱신 필드가 아니라 `findByModelCodeAndIsDeletedFalse`의 식별 키다. `attributesMatch`가 시트명에서 panel/remote 파생값을 계산하는 것은 실제로 DB에 쓰는 필드를 비교하는 것이므로 유지했다.

## (b) 연속 2회 실행 증명

실 DB/실 Google Sheet가 아닌 `ProductSheetSyncServiceIT`의 PostgreSQL Testcontainers + Mockito 시트 입력으로 검증했다. 첫 실행으로 `NAME_DRIFT_MODEL`을 insert한 뒤 DB name만 `DB authoritative name`으로 바꾸고 동일 입력을 연속 실행했다.

테스트의 실행 판정 원문:

```java
assertThat(homeTab.updated).isZero();
assertThat(homeTab.unchanged).isEqualTo(1);
assertThat(homeTab.nameDrift).isEqualTo(1);

ProductSheetSyncService.SyncSummary third = syncService.syncAll();
ProductSheetSyncService.TabSyncResult thirdHomeTab = third.byTab.get(homeTabName);
assertThat(thirdHomeTab.updated).isZero();
assertThat(thirdHomeTab.unchanged).isEqualTo(1);
assertThat(thirdHomeTab.nameDrift).isEqualTo(1);
```

즉, 같은 입력의 2회 연속 실행 결과는 다음과 같다.

```text
SECOND: updated=0, unchanged=1, nameDrift=1
THIRD:  updated=0, unchanged=1, nameDrift=1
DB name after repeat: DB authoritative name
```

RED-B 수정 전 원문:

```text
ProductSheetSyncServiceIT > sync_시트명과_DB명이_달라도_update를_반복하지_않는다() FAILED
1 test completed, 1 failed
```

수정 후 RED-B:

```text
BUILD SUCCESSFUL
37 tests completed, 0 failed
```

## RED-A / RED-B 동시 GREEN

기존 RED-A 가격 변경 테스트(`sync_가격변경시_update_발생`)와 신규 RED-B 이름 drift 테스트를 포함한 참조 클래스 실행 결과:

```text
Command: .\gradlew.bat :services/product-service:test --tests "com.samhanair.logis.product.it.ProductSheetSyncServiceIT" --rerun-tasks --no-daemon
ProductSheetSyncServiceIT: tests=37 failures=0 errors=0 skipped=0
BUILD SUCCESSFUL
```

RED-A는 가격 변경 시 `updated=1` 및 변경 가격을 확인하고, RED-B는 이름만 다를 때 두 번 모두 `updated=0`을 확인한다.

## 이름 drift 관측

기존 품목에서 `product.getName()`과 시트명이 다르면 다음을 수행한다.

- `TabSyncResult.nameDrift++`
- `SyncSummary.totalNameDrift`에 합산
- `[ProductSheetSync] ... name drift observed (DB name retained)` 로그 기록
- `updated`/`unchanged` 판정에는 이름 차이를 사용하지 않음
- `Product.rename(name)`을 호출하지 않음(일반 SHEET/MANUAL 경로)

따라서 실측 481건은 데이터 변경 없이 별도 카운터/로그에서 업무 판단 대상으로 드러난다.

## (c) 실행한 테스트

1. RED-B 수정 전 실패 확인: 신규 `sync_시트명과_DB명이_달라도_update를_반복하지_않는다`
2. 변경 파일 참조 전체: `ProductSheetSyncServiceIT` — 37개, 0 실패
3. 최종 지정 범위: `:services:product-service:test --rerun-tasks --no-daemon`
   - XML 집계: `692 tests, 0 failures, 0 errors, 0 skipped`
   - Gradle 출력: `BUILD SUCCESSFUL`

실 DB 쓰기, 실 Google Sheet 접근, Docker 재배포는 수행하지 않았다.

## 변경 파일

- `services/product-service/src/main/java/com/samhanair/logis/product/service/ProductSheetSyncService.java`
- `services/product-service/src/test/java/com/samhanair/logis/product/it/ProductSheetSyncServiceIT.java`
- `docs/dev-reports/2026-08-09-978-d1-r2-compare-field-alignment.md`

커밋/푸시는 수행하지 않았다.
