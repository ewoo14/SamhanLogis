# PR #1024 / 이슈 #1019 — 활성 품목명 재사용 차단 구현 보고서

## 1. 구현 방식과 선택 근거

확정된 B안(이름은 유지하고 모델코드로 식별)에 맞춰 `product-service`의 수동 품목 mutation 경로만 수정했다.

- `POST /products` → `ProductService.create`: `findByNameAndIsDeletedFalse`로 활성 동명 품목을 조회하고, 있으면 `409 CONFLICT`로 차단한다.
- `PATCH /products/{id}` → `ProductService.update`: 품목명이 실제로 바뀌는 경우에만 같은 검사를 한다. 현재 품목의 id는 제외한다.
- 충돌 메시지에 충돌 품목명과 충돌 품목의 모델코드(없으면 모델명)를 포함한다.
- Repository 메서드명 자체가 `IsDeletedFalse` 조건을 포함하므로 soft-deleted 품목은 재사용 대상에서 제외된다.
- 기존 데이터에 유니크 제약을 추가하지 않았다. 정찰 결과 활성 동명 그룹 186개, 추가 중복 행 510개가 이미 존재하므로 partial unique index/마이그레이션은 기존 데이터를 보존해야 한다는 불변식과 충돌한다.

버린 대안:

1. `name`에 DB 유니크 제약 또는 partial unique index를 추가하는 방식 — 기존 활성 중복 186개 때문에 적용 실패하며, 정상적인 동명·상이 모델코드 데이터를 훼손할 수 있어 제외했다.
2. 기존 동명 품목을 병합·정리하는 방식 — 개발책임자 확정 범위가 아니며 기존 4,196건의 전표 라인과 정상 경로를 건드리므로 제외했다.
3. 모든 update에 이름 중복 검사를 적용하는 방식 — 이름을 보내지 않고 다른 필드만 수정하는 기존 정상 작업을 막을 수 있어 제외했다.

## 2. RED 원문

구현 전 `create_duplicateActiveName_throwsConflict` 테스트를 추가하고 실행했다.

```text
ProductServiceTest > create_duplicateActiveName_throwsConflict() FAILED
java.lang.AssertionError: Expecting code to raise a throwable.

1 test completed, 1 failed
FAILURE: Build failed with an exception.
Execution failed for task ':services:product-service:test'.
BUILD FAILED
```

첫 실행에서 fixture의 category stub 누락으로 `NOT_FOUND`가 나온 것은 기능 부재를 검증한 RED가 아니므로 fixture를 보완한 뒤 위의 실제 RED 원문을 확보했다.

## 3. GREEN 원문

구현 후 핵심 4개 테스트를 실행했다.

```text
> Task :services:product-service:test
BUILD SUCCESSFUL in 28s
13 actionable tasks: 2 executed, 11 up-to-date
```

검증한 테스트:

- 활성 동명 신규 등록 차단
- 다른 활성 품목명으로 수정 시 충돌 모델코드 포함
- 기존 동명 품목의 다른 필드 수정 허용
- soft-deleted 이름 재사용 허용

## 4. 불변식 실측

| 불변식 | 결과 | 실측/근거 |
|---|---:|---|
| 1. 신규 등록·수정 시 활성 품목명 차단 | 1/1 차단 | 신규 등록 테스트 `409 CONFLICT`; 수정 테스트도 `409 CONFLICT`, 메시지에 `다른 품목`과 `MODEL-CONFLICT-99` 포함 |
| 2. 기존 데이터 무변경·무삭제 | 4,196 → 4,196 | 정찰 read-only 실측은 모델코드 없는 비삭제 전표 라인 4,196건(주문 2,048 + 일반 2,148). 이번 변경은 Java/test만 수정했고 migration·공유 DB write/DDL을 수행하지 않았다. |
| 3. 기존 행의 다른 필드 수정 무차단 | 0건 차단 | 동명 기존 품목 상태에서 `name=null`, description만 수정하는 경로를 실행했고 통과했다. 이 경로는 이름 중복 조회도 호출하지 않는다(`verify(...never())`). 실데이터 모집단 4,196 전표 라인에 대해 기존 행을 수정하지 않는 구현이라 이름 중복으로 차단되는 건수는 0건이다. |
| 4. soft-deleted 이름 재사용 | 1/1 허용 | `findByNameAndIsDeletedFalse` 결과가 0건인 상태에서 같은 이름 신규 등록 성공 |
| 5. 차단 사유 전달 | 2/2 확인 | 신규 차단 메시지에 품목명, 수정 충돌 메시지에 품목명과 충돌 모델코드 포함 |

정찰 read-only 기준의 관련 데이터도 함께 기록한다: 활성 품목 1,216건, 활성 이름 중복 그룹 186개, 추가 중복 행 510개, 서로 다른 모델코드 동명 그룹 157개, 해당 그룹 품목 626개, 그룹 전표 사용 2건. 따라서 기존 행을 정리하거나 DB unique를 거는 방향은 본 슬라이스의 불변식과 양립하지 않는다.

## 5. 모듈 전체 테스트

실행 명령:

```text
./gradlew.bat :services:product-service:test --no-daemon
```

결과: **완료 판정 불가**. 단위 테스트 4건은 별도 실행에서 GREEN이었으나, 전체 모듈 실행은 Testcontainers 통합 테스트 단계에서 124초 제한을 초과해 종료됐다. 해당 실행에서 Docker 이미지 재빌드, 공유 DB write/DDL은 수행하지 않았다. 따라서 모듈 전체 테스트를 통과했다고 보고하지 않는다.

## 6. 파일별 변경량

`git diff --numstat` 기준(보고서 파일 제외, 보고서 작성 전):

| 파일 | 추가 | 삭제 |
|---|---:|---:|
| `services/product-service/src/main/java/com/samhanair/logis/product/service/ProductService.java` | +24 | -1 |
| `services/product-service/src/test/java/com/samhanair/logis/product/service/ProductServiceTest.java` | +70 | -0 |

신규 파일 자체는 아래와 같다.

- `docs/dev-reports/2026-08-02-1019-impl-active-name-unique.md`

신규 마이그레이션은 없다. 기존 Flyway 파일은 수정하지 않았다.
