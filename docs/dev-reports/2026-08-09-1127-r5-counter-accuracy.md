# PR #1127 R5 — 카운터 정확성

## 결론

이번 라운드의 진단은 코드로 확정됐다.

1. `nameDrift`는 Product 고유 개수가 아니라 시트에서 처리한 행 occurrence마다 증가했다. 동일 modelCode가 여러 탭/행에 나타날 수 있으므로 이름을 `nameDriftOccurrences`로 바꿨다. 이 카운터의 단위는 **시트 행 occurrence**이며, 고유 품목 수를 뜻하지 않는다.
2. `priceHistoryExposureSpecWrites`는 보조 엔티티가 실제로 몇 행 바뀌었는지가 아니라, 한 Product 처리에서 하나라도 변경되면 1회 증가했다. 이름을 `priceHistoryExposureSpecChangedRows`로 바꾸고 실제 변경된 `PriceHistory`·`ProductEstimateExposure`·`ProductSpec` 행 수를 누적하도록 고쳤다.

`nameDriftOccurrences`와 고유 품목 수를 하나로 합치지 않았다. 고유 품목 수가 필요한 소비자는 별도 dedup 집계를 사용해야 하며, 이번 sync 결과는 occurrence 단위를 명시적으로 제공한다.

## ① 이름·단위 결정 근거

기존 구현은 각 유효 시트 행에서 `modelCode`를 조회한 뒤 이름이 다르면 `nameDrift++`를 실행했다. 따라서 492개 고유 품목이 1,012개 행 occurrence로 관측되는 것은 코드상 가능한 결과다. 기존 이름은 읽는 사람이 “품목 수”로 해석할 수 있었으므로 `nameDriftOccurrences`로 변경했다.

`priceHistoryExposureSpecChangedRows`는 boolean tracker를 정수 tracker로 바꿨다.

- PriceHistory 변경: 실제 가격 변경 또는 신규 행 1행
- Exposure 변경: 실제 신규 행 또는 display order 변경 1행
- ProductSpec 변경: before/after 상태의 key union 차집합을 비교해 추가·삭제·값/단위/순서 변경 행마다 1행
- 인상 전 PriceHistory 쓰기도 동일 tracker로 연결

동일 값 재저장은 changed row로 세지 않는다.

## ② 양방향 RED와 동시 GREEN

### RED-A — n≥2

추가한 테스트:

```java
sync_동일_Product의_ProductSpec_두행_변경은_변경행수_2로_센다()
```

수정 전 원문:

```text
expected: 2
 but was: 1
```

원인은 `SpecWriteObservation.changed` boolean과 호출부의 `priceHistoryExposureSpecWrites++`였다. ProductSpec 두 행 변경을 하나의 Product 처리 occurrence로 축약했다.

수정 후 원문:

```text
ProductSheetSyncServiceIT.sync_동일_Product의_ProductSpec_두행_변경은_변경행수_2로_센다()
BUILD SUCCESSFUL
```

테스트 판정은 다음과 같다.

```java
assertThat(result.updated).isZero();
assertThat(result.unchanged).isEqualTo(1);
assertThat(result.priceHistoryExposureSpecChangedRows).isEqualTo(2);
```

### RED-B — 변경 0행

기존 반복 sync 테스트의 원문 판정:

```java
assertThat(repeated.updated).isZero();
assertThat(repeated.unchanged).isEqualTo(2);
assertThat(repeated.priceHistoryExposureSpecChangedRows).isZero();
```

동일 시트를 연속 재실행하면 PriceHistory·Exposure·Spec 상태가 같으므로 `0`이다. 지정 관련 묶음에서 이 assertion을 포함해 GREEN이다.

## ③ sync 카운터 전수 표

### Product 탭 결과 (`TabSyncResult`)

| 이름 | 세는 단위 | 실제 일치 여부 |
|---|---|---|
| `inserted` | 새 Product 행 | 일치. `Product` 신규 생성 1회마다 증가 |
| `updated` | Hibernate dirty인 기존 Product 행 | 일치. R3 `findDirty` 결과와 연결 |
| `unchanged` | 기존 Product 중 dirty가 아닌 처리 행 | 일치 |
| `nameDriftOccurrences` | 시트 행 occurrence 중 시트명과 DB명이 다른 occurrence | 일치. 고유 품목 수가 아님을 이름에 명시 |
| `priceHistoryExposureSpecChangedRows` | 실제 변경된 PriceHistory/Exposure/ProductSpec 행 | 수정 후 일치. boolean 축약 제거 |
| `softDeleted` | 시트에서 사라져 soft-delete 된 Product 행 | 일치 |
| `skipped` | 이름 또는 modelCode 공백으로 파싱하지 않은 Product 행 | 일치. null/빈 전체 응답은 별도 탭 skip |
| `preservedManual` | 시트 부재에도 usageScopeManual로 보존한 Product 행 | 일치 |
| `preservedByRule` | 활성 수량 규칙 때문에 usageScope NONE 전환을 보류한 Product 행 | 일치 |
| `deferredByEcountReservation` | ECOUNT alias reservation 때문에 soft-delete를 보류한 Product 행 | 일치 |
| `specsLinked` | 이번 시트 행에서 매핑된 ProductSpec upsert 항목 수 | 일치. 단, “변경 행 수”가 아니며 동일 값 매핑도 포함 가능 |

### 구성품 탭 결과 (`ComponentSyncResult`)

| 이름 | 세는 단위 | 실제 일치 여부 |
|---|---|---|
| `linked` | 유효한 부모-자식 구성품 시트 행 occurrence | 일치. 기존 link 재저장도 occurrence로 셈 |
| `bundlesMarked` | 이번 실행에서 BUNDLE 표식을 새로 처리한 고유 부모 Product | 일치. `markedBundles` set으로 중복 방지 |
| `softDeleted` | 시트에서 사라져 soft-delete 된 BundleComponent 행 | 일치 |
| `skipped` | 부모 또는 자식 Product 미존재로 처리하지 않은 구성품 행 | 일치 |
| `preservedManual` | bundleComponentsManual로 구성품 집합을 보존한 행 occurrence | 일치 |
| `blockedByRule` | 활성 수량 규칙의 자기 구성품 충돌로 연결을 거부한 행 | 일치 |

### 전체 summary (`SyncSummary`)

| 이름 | 세는 단위 | 실제 일치 여부 |
|---|---|---|
| `totalInserted` / `totalUpdated` / `totalSoftDeleted` / `totalSkipped` | 각 Product 탭 결과의 합 | 일치 |
| `totalNameDriftOccurrences` | Product 탭의 name drift occurrence 합 | 일치 |
| `totalPriceHistoryExposureSpecChangedRows` | 실제 보조 엔티티 변경 행 합 | 수정 후 일치 |
| `totalPreservedManual` / `totalPreservedByRule` | 해당 Product 탭 보호 행 합 | 일치 |
| `totalComponentsLinked` | 구성품 유효 행 occurrence 합 | 일치 |
| `totalBundlesMarked` | 구성품 탭의 신규 BUNDLE 부모 합 | 일치 |
| `totalSpecsLinked` | Product 탭의 매핑된 ProductSpec upsert 항목 합 | 일치. changed row와 다른 단위 |
| `totalTabs` | 실행을 시도한 Product/구성품 탭 수 | 일치 |
| `successfulTabs` / `failedTabs` | 예외 없이 끝난 탭 / 예외 탭 수 | 일치 |

구성품 `softDeleted`, `skipped`, `blockedByRule`, `deferredByEcountReservation`는 현재 component 결과 객체에 기록되며 전체 summary 필드로 합산하지 않는다. 따라서 “전체 summary에 없는 값”을 누락된 실제 카운터로 가장하지 않고 탭 결과 단위로 표에 열거했다.

## ④ R1~R3 회귀 확인

지정 명령을 `--rerun-tasks`로 실행했다.

```text
./gradlew :services:product-service:test --tests '*Sync*' --tests '*Product*' --rerun-tasks
BUILD SUCCESSFUL in 2m 44s
15 actionable tasks: 15 executed
```

포함된 보호 테스트는 다음과 같다.

- `syncTab_후속저장실패로_롤백된_단가는_같은행_재시도에서_반영되어야한다` — R1 유지
- `sync_시트명과_DB명이_달라도_update를_반복하지_않는다` — R2 이름 제외 및 occurrence 관측 유지
- `sync_재실행_DB상태_동일이면_update_없음` — R3 dirty detection 유지
- `sync_Product가_변경되지_않아도_priceHistory와_exposure_변경을_별도카운터로_관측한다` — 보조 행 변경 카운터 유지
- `sync_동일_Product의_ProductSpec_두행_변경은_변경행수_2로_센다` — RED-A/GREEN

기존 R1~R3 테스트를 기대값에 맞춰 약화하거나 삭제하지 않았다. 실 DB sync를 실행하지 않았고 배포본도 갱신하지 않았다.

## 신규 파일 경로

- `docs/dev-reports/2026-08-09-1127-r5-counter-accuracy.md`

수정 파일:

- `services/product-service/src/main/java/com/samhanair/logis/product/service/ProductSheetSyncService.java`
- `services/product-service/src/test/java/com/samhanair/logis/product/it/ProductSheetSyncServiceIT.java`
