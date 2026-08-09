# #978 D-1 R3 — 구조적 변경 감지

검증 작업 디렉터리는 `feat/978-fast-path-carryover` worktree이며, 실 DB·실 Google Sheet·Docker에는 접근하거나 쓰지 않았다. 커밋·push도 하지 않았다.

## 1. 택한 구조와 근거

기존 `isProductRowUnchanged()`의 필드 열거를 제거했다.

기존 Product row 처리 순서는 다음과 같다.

1. Hibernate가 관리 중인 `Product`의 로딩 시점 영속 상태를 복사한다.
2. 기존 update 분기의 writer를 그대로 실행한다. 가격, ECOUNT 승격, 이름/품목분류, usage, 할인, 분류, attribute, 평형 갱신의 조건도 그대로 유지한다.
3. `EntityPersister.getPropertyValues()`와 로딩 시점 배열을 `findDirty()`로 비교한다.
4. 실제 Product 영속 속성이 dirty이면 `updated`, 아니면 `unchanged`로 집계한다.

`ProductMutationSnapshot`은 서비스가 Product 속성명을 다시 나열하지 않고 Hibernate JPA 메타모델의 property 배열을 사용한다. 따라서 writer에 영속 필드를 추가하거나 기존 writer가 쓰는 필드를 바꿔도 판정기가 별도 필드 목록을 놓치지 않는다. 이것이 “쓰는 필드 = 보는 필드”를 코드 구조로 보장하는 근거다.

이 방식은 `Product`가 현재 트랜잭션에서 managed 상태라는 기존 repository 조회 계약을 전제로 한다. managed entry가 없으면 조용히 잘못 집계하지 않고 예외로 드러낸다.

## 2. 불변식 판정

### ① 양방향 차집합 0

Product 판정기는 “시트 값과 DB 값을 각각 열거해 비교”하지 않는다. 동일한 writer가 Product에 모든 적용을 끝낸 뒤, Hibernate가 `Product`의 영속 메타데이터 전체를 대상으로 dirty 여부를 계산한다. 따라서 Product 영속 필드 기준으로 writer가 쓰지만 판정기가 모르는 필드와 판정기가 보지만 writer가 쓰지 않는 별도 집합이 생길 수 없다.

`ProductEstimateExposure`, `PriceHistory`, `ProductSpec`, `BundleComponent`는 Product dirty 판정의 대상이 아니다. 이들은 아래 엔티티 밖 쓰기 목록에서 별도로 다룬다.

### ② 롤백 변경 재시도

스냅샷은 JVM 캐시나 sync 간 인메모리 상태가 아니라 각 실행의 managed entity 로딩 상태에서 만든다. 후속 `upsertSheetExposure` 저장 실패로 Product 가격 변경이 롤백되면 다음 실행은 DB의 롤백된 가격을 다시 로딩하고 writer를 재적용한다.

기존 회귀 테스트 `syncTab_후속저장실패로_롤백된_단가는_같은행_재시도에서_반영되어야한다`가 GREEN이다.

### ③ RED-A / RED-B

RED로 추가한 테스트는 기존 comparator에서 ECOUNT 승격이 skip되는 경계를 재현했다. 정상 SHEET insert 뒤 `lineage=ECOUNT`, `product_category=NULL`, `usage_scope=NONE`으로 되돌리고 나머지 비교값은 동일하게 만든 뒤 동일 시트를 재실행한다.

RED 원문:

```text
ProductSheetSyncServiceIT > sync_동일한_값이어도_ECOUNT_승격은_updated로_판정하고_시트_정본을_적용한다() FAILED
1 test completed, 1 failed
BUILD FAILED
```

변경 후 같은 테스트 원문:

```text
BUILD SUCCESSFUL in 51s
15 actionable tasks: 15 executed
```

RED-A 실제 변경 행:

```text
ProductSheetSyncServiceIT.sync_가격변경시_update_발생
→ updated=1, releasePrice/deliveryPrice 갱신
```

ECOUNT 승격 경로도 같은 테스트에서 다음을 확인한다.

```text
updated=1
lineage=SHEET
productCategory=SINGLE_PART
name=시트 정본 이름
```

RED-B 동일 입력 연속 실행:

```text
ProductSheetSyncServiceIT.sync_재실행_DB상태_동일이면_update_없음
→ 2차 updated=0, unchanged=1

ProductSheetSyncServiceIT.sync_시트명과_DB명이_달라도_update를_반복하지_않는다
→ 2차 updated=0, unchanged=1, nameDrift=1
→ 3차 updated=0, unchanged=1, nameDrift=1
```

`nameDrift`는 DB 이름을 보존하면서 별도 카운터/로그로만 관측된다. Product dirty 판정 입력에는 포함되지 않는다.

## 3. 엔티티 밖 쓰기 전수

| 대상 | 쓰기 위치 | Product 판정과의 관계 |
|---|---|---|
| `PriceHistory` | 현재 단가 `upsertPriceHistory(..., 2026-04-01, ...)` | Product가 unchanged여도 row occurrence마다 upsert 실행. Product updated 카운터와 분리한다. |
| `PriceHistory` | 인상 전 탭 `upsertPriceHistory(..., 2000-01-01, ...)` | 현재 탭에 등장한 modelCode에 대해 별도 실행. Product 판정과 분리한다. |
| `ProductEstimateExposure` | `upsertSheetExposure` | manual이 아니면 기존 exposure display order를 save하거나 신규 생성한다. Product unchanged여도 실행된다. |
| `ProductSpec` | `loadSpecsForProduct` → `upsertSpec` | 사양 보유 탭에서 key/value/displayOrder를 별도 upsert한다. Product dirty 판정에 섞지 않는다. |
| `BundleComponent` | `syncComponentTab` | 부모 BUNDLE 표식/자식 parent model은 Product writer이고, 링크 자체·속성·soft-delete는 BundleComponent writer다. 별도 component 결과로 집계한다. |
| `ProductEstimateExposure` | `softDeleteExposures` | Product soft-delete 시 exposure를 별도 soft-delete한다. |
| `Classification` | `findOrCreateClassification` | 시트 분류 매핑에 필요한 분류 master가 없을 때만 생성한다. Product 분류 FK dirty와 별개의 보조 master 쓰기다. |

위 쓰기들은 기존 설계대로 무조건 또는 조건에 따라 실행되며 이번 Product `updated` 판정의 의미를 바꾸지 않았다. 특히 `PriceHistory`와 exposure는 Product row가 unchanged여도 실행될 수 있으므로, 이들을 Product dirty 판정에 합치면 RED-B 의미가 오염된다.

## 4. 검증 결과

### ProductSheetSync 묶음

실행:

```text
./gradlew :services:product-service:test --tests '*ProductSheetSync*' --rerun-tasks --no-daemon
```

원문 요약:

```text
BUILD SUCCESSFUL in 53s
15 actionable tasks: 15 executed
```

XML 집계:

```text
XML_AGG tests=48 failures=0 errors=0
```

### 전체 product-service suite

실행:

```text
./gradlew :services:product-service:test --rerun-tasks
```

원문:

```text
BUILD SUCCESSFUL in 2m 31s
15 actionable tasks: 15 executed
```

XML 집계:

```text
XML_AGG tests=693 failures=0 errors=0 skipped=0
```

R2에서 관측된 `HeaderAuthenticationFilterTest` suite-order/shared-state flaky는 이번 라운드에 수정하지 않았다. 이번 전체 실행에서는 693개가 모두 통과했으므로, 이 결과를 해당 flaky 원인 해결로 해석하지 않는다. 단독/전체 재현성 문제는 별도 후속 작업으로 남긴다.

## 5. 신규 파일

```text
docs/dev-reports/2026-08-09-978-d1-r3-structural-change-detection.md
```

기존 테스트 파일에는 ECOUNT 승격 경계 테스트만 추가했고, 신규 Java 파일은 없다.
