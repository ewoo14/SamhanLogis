# PR #1024 / 이슈 #1019 — DISCONTINUED 품목명 재사용 fix

- 작업 브랜치: `fix/1019-product-name-unique`
- 작업 기준 HEAD: `01e42848b`
- 범위: `DISCONTINUED` 전용 품목명 1건의 과도 차단만 수정
- 제약: 커밋·push·브랜치 조작·Docker 이미지 재빌드·공유 DB write/DDL을 수행하지 않음

## 1. 원인

기존 `ProductService.assertNameAvailable()`은 `findByNameAndIsDeletedFalse(name)`을 호출했다. 이 조회는 `is_deleted=false`만 보고 `status`를 보지 않으므로, soft-delete가 아닌 `DISCONTINUED` 행도 ACTIVE 이름 충돌로 판정했다.

실 DB에는 비삭제 `DISCONTINUED` 품목이 4행 있고, ACTIVE 동명 행 없이 이름을 점유한 단종 전용 이름은 1개였다. 해당 실측 행은 `외부 통신 모듈 MIM-N10 / COMM-MIM-N10`이다.

## 2. RED

실 API 경로가 만들 수 있는 fixture만 사용한 통합 테스트를 먼저 추가했다.

1. HTTP `POST /products`로 `외부 통신 모듈 MIM-N10` 생성
2. HTTP `POST /products/{id}/discontinue`로 단종 처리
3. 같은 이름으로 HTTP `POST /products` 재등록

수정 전 실행 원문:

```text
ProductCatalogControllerIT > POST_products_단종된_이름은_재사용할_수_있다() FAILED
    java.lang.AssertionError at ProductCatalogControllerIT.java:138

java.lang.AssertionError: Status expected:<201> but was:<409>
    at com.samhanair.logis.product.it.ProductCatalogControllerIT.POST_products_단종된_이름은_재사용할_수_있다(ProductCatalogControllerIT.java:138)

1 test completed, 1 failed
BUILD FAILED
```

## 3. Fix

- `ProductRepository`에 `findByNameAndStatusAndIsDeletedFalse(name, status)`를 추가했다.
- 이름 guard는 위 메서드에 `ProductStatus.ACTIVE`를 전달한다.
- 단종 품목 재활성화 경로에도 같은 guard를 먼저 적용했다. 따라서 단종 품목이 이름을 재사용한 뒤 다시 ACTIVE가 되며 동명이 생기는 구멍을 차단한다.
- 동시성 경합, API 우회 쓰기 경로, DB 유니크 제약은 변경하지 않았다.

## 4. GREEN

RED 테스트 재실행 결과:

```text
BUILD SUCCESSFUL in 1m 13s
1 test completed, 0 failed
```

재활성화 충돌까지 포함한 테스트 결과다. 단종 원래 품목의 `reactivate`는 동일 이름 ACTIVE 품목이 존재하므로 HTTP 409를 반환한다.

## 5. 불변식 실측

### 1) 단종 이름 재사용

- 실 API 재현: `외부 통신 모듈 MIM-N10`을 생성 → DISCONTINUED 처리 → 같은 이름 신규 POST
- 결과: 신규 POST **201 Created**
- 읽기 전용 `product_db` 실측: 비삭제 DISCONTINUED 품목 **4행**, ACTIVE 동명 없이 단종 행만 있는 이름 **1개**

### 2) 기존 정상 수정 차단 0건

읽기 전용 SQL 재측정 결과:

```text
active_duplicate_groups = 186
active_duplicate_rows = 696
existing_duplicate_other_field_edits_blocked = 0
```

### 3) 활성 품목 이름 중복 차단

- 기존 `create_duplicateActiveName_throwsConflict` 단위 테스트가 전체 모듈 테스트에서 GREEN
- 신규 ACTIVE 품목과 같은 이름의 POST는 기존 guard가 계속 409를 반환하는 계약을 유지한다.

### 4) soft-delete 이름 재사용

- 기존 `create_nameUsedOnlyBySoftDeletedProduct_isAllowed` 단위 테스트가 전체 모듈 테스트에서 GREEN
- `is_deleted=true` 이름은 ACTIVE 충돌 조회 대상이 아니므로 기존 재사용 동작을 유지한다.

### 5) 단종 이름 허용으로 생기는 재활성화 구멍

- 해당 경로는 실재한다: `POST /products/{id}/reactivate`
- 신규 통합 테스트에서 단종 원래 품목을 같은 이름으로 재활성화 시도
- 결과: **409 Conflict**, 원래 품목은 ACTIVE로 전환되지 않음
- 따라서 단종 이름 재사용 후 ACTIVE 이름 중복이 새로 생기지 않는다.

## 6. 변경 모듈 전체 테스트

실행:

```text
.\gradlew.bat :services:product-service:test --no-daemon
```

결과:

```text
BUILD SUCCESSFUL in 3m 17s
61 test result files / 627 tests / 0 failures / 0 errors / 0 skipped
```

Testcontainers 단계는 timeout 없이 완료했다. Docker 이미지는 재빌드하지 않았다.

## 7. 파일별 변경량

`git diff --numstat` 기준이며 추가·삭제를 분리했다.

| 파일 | 추가 | 삭제 |
|---|---:|---:|
| `services/product-service/src/main/java/com/samhanair/logis/product/repository/ProductRepository.java` | +2 | −0 |
| `services/product-service/src/main/java/com/samhanair/logis/product/service/ProductService.java` | +4 | −2 |
| `services/product-service/src/test/java/com/samhanair/logis/product/it/ProductCatalogControllerIT.java` | +49 | −0 |
| `services/product-service/src/test/java/com/samhanair/logis/product/service/ProductServiceTest.java` | +7 | −4 |
| `docs/dev-reports/2026-08-02-1019-r2-discontinued-name-fix.md` | +80 | −0 |
| **합계** | **+142** | **−6** |

## 새로 만든 파일

- `docs/dev-reports/2026-08-02-1019-r2-discontinued-name-fix.md`
