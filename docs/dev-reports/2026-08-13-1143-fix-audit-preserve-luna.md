# 2026-08-13 #1143 감사 정보 보존 fix — CODEX LUNA

## 결론

제품 상세 응답에서 감사 원천값이 `null`로 사라지지 않도록 보강했다. 사용자 UUID는 user-service `fullName`으로 해석하고, 미조회 UUID는 UUID를 다시 내보내지 않으면서 구분 가능한 후보 표시값으로 보존한다. 시스템·마이그레이션 표식은 원문 표식을 포함한 시스템 작업 후보로 보존한다.

제품 수정 화면은 기존 상세 폼의 `기본 정보` 카드 안에 `작성자`·`수정자` 표시 영역을 추가했다. 새 카드나 새 배치는 만들지 않았다.

## (a)/(b) 원인 확인 원문

### (a) UUID 사용자 미매칭 → null

직전 구현 원문:

```java
String createdBy = userInternalClient.resolveDisplayName(product.getCreatedBy()).orElse(null);
String modifiedBy = userInternalClient.resolveDisplayName(product.getModifiedBy()).orElse(null);
```

`UserInternalClient.resolveDisplayName()`은 UUID를 파싱한 뒤 user-service 호출 실패·빈 응답·토큰 부재를 모두 `Optional.empty()`로 반환했다. 따라서 미조회 UUID는 `ProductService.toResponse()`의 `orElse(null)`에서 `null`이 됐다. Live QA 원문도 다음과 같다.

```text
AM052BN6PBH1 createdBy=null
A3|PASS|미조회 사용자 createdBy=null, 응답 raw UUID=0
```

### (b) UUID가 아닌 값 → 원문 통과

직전 구현 원문:

```java
try {
    userId = UUID.fromString(auditValue);
} catch (IllegalArgumentException ignored) {
    return Optional.of(auditValue);
}
```

따라서 `V38__PRODUCT_CATEGORY_BACKFILL`은 user-service 조회 없이 그대로 응답됐다.

```text
AP110RNPPHH1 modifiedBy=V38__PRODUCT_CATEGORY_BACKFILL
AM052BN6PBH1 modifiedBy=V38__PRODUCT_CATEGORY_BACKFILL
A2|FAIL|createdBy null 및 modifiedBy 비인명 값 재현
```

## 감사 필드 실 데이터 전수 분포

공유 DB에는 쓰지 않았다. 현재 남아 있던 격리 복제본 `sol1176-pg`의 `product_db`를 읽기 전용 SQL로 전수 집계했고, 같은 복제본의 `user_db.employees`와 UUID를 대조했다. 제품 행 분모는 `createdBy` 3,237건, `modifiedBy` 3,237건이다.

| 필드 | 분류 | 건수 | 세부 |
|---|---:|---:|---|
| createdBy | user UUID, user-service 매칭 | 49 | `a...001` 41, `a...003` 8 |
| createdBy | UUID지만 매칭 없음 | 3,083 | zero UUID `000...001` |
| createdBy | 시스템 계정/표식 | 101 | `system` 100, `qa-seed` 1 |
| createdBy | 기타 비UUID | 4 | `qa798` |
| modifiedBy | user UUID, user-service 매칭 | 369 | `a...001` 267, `a...003` 102 |
| modifiedBy | UUID지만 매칭 없음 | 2,771 | zero UUID `000...001` |
| modifiedBy | 빈 값 | 97 | SQL `NULL` |

복제본에서 확인된 매칭 사용자 이름은 `a...001`, `a...003` 두 계정이며, user-service 테이블의 이름은 `[DEV-SEED]` 접두를 포함한다. zero UUID는 UUID 형식이지만 user-service에 행이 없었다.

주의: Live QA5 캡처의 `V38__PRODUCT_CATEGORY_BACKFILL`은 현재 접근 가능한 `sol1176-pg` 원문 분포에는 없었다. 캡처에서 최소 2개 표본은 확인했지만, 그 Live QA 런타임 DB의 전체 행 수는 이번 라운드에 재기동하지 않았으므로 `V38__...`의 전수 건수라고 주장하지 않는다. 이 항목은 라이브 복제본 재연결 후 별도 재집계가 필요하다.

## RED → GREEN 원문

### RED

원인별 독립 테스트 2개와 화면 표시 테스트를 먼저 추가했다.

```text
ProductServiceTest > getByModelName_whenAuditUuidCannotBeResolved_preservesUnknownActorMarker() FAILED
java.lang.AssertionError at ProductServiceTest.java:1041

ProductServiceTest > getByModelName_whenAuditValueIsMigrationMarker_preservesSystemMeaning() FAILED
java.lang.AssertionError at ProductServiceTest.java:1061

2 tests completed, 2 failed
BUILD FAILED
```

화면 테스트 RED 원문:

```text
ProductFormPage > 편집 상세의 기본 정보 영역에 만든 사람과 고친 사람을 표시한다 FAILED
Unable to find an element by: [data-testid="product-form-created-by"]
```

### GREEN

```text
ProductServiceTest focused + ProductAndClassificationUuidFreeContractTest
BUILD SUCCESSFUL

ProductFormPage.test.tsx
Test Files 1 passed
Tests 13 passed
```

전량 검증:

```text
:services:product-service:test
BUILD SUCCESSFUL

npm run typecheck
exit code 0
real-QA scope tests: 51 pass, 0 fail
```

## 적용 내용

- `UserInternalClient`: 시스템 표식은 사람 이름 조회 실패와 구별되도록 `Optional.empty()`로 넘긴다. 일반 레거시 사람 표식은 원문을 보존한다.
- `ProductService`: 조회 실패 UUID는 `사용자 미상` 후보로, 시스템 표식은 `시스템 작업 (원문 표식)` 후보로, 빈 값은 `감사 주체 미상` 후보로 변환한다. 이 정책은 `resolveAuditDisplayValue()` 한 곳에 있어 개발책임자 확정 문구로 교체하기 쉽다.
- `ProductDetailResponse`: `createdAt/createdBy/modifiedAt/modifiedBy`를 타입에 추가했다.
- `ProductFormPage`: 기존 `기본 정보` 섹션의 기존 `mobile-form-grid` 배치 안에 `작성자`·`수정자`를 추가했다.

## 표시 문구 후보 — 개발책임자 확정 대상

이번 구현은 문구를 확정하지 않고 한 곳에 격리했다. 현재 적용 후보는 다음과 같다.

| 상황 | 후보 1 | 후보 2 | 후보 3 |
|---|---|---|---|
| 미조회 UUID | `사용자 미상` | `알 수 없는 사용자` | `감사 주체 미상` |
| 시스템 표식 | `시스템 작업 (원문 표식)` | `시스템 처리 (원문 표식)` | `자동 처리 (원문 표식)` |
| 빈 값 | `감사 주체 미상` | `기록 없음` | `확인 불가` |

문구 확정 전까지는 API에 UUID를 포함하지 않고 원문 시스템 표식만 괄호 안에 보존한다.

## 화면 배치 근거

Live QA5의 `02-A4-product-detail-missing-created-modified-name-surface.png`에서 기존 화면은 `기본 정보` 카드 다음에 `사양`, `가격`, `설명` 카드가 이어지는 편집 폼이었다. 따라서 새 디자인·새 탭을 만들지 않고, 상세 의미가 가장 가까운 `기본 정보` 카드의 기존 반응형 그리드 마지막에 두었다. 기존 `ProductFormPage` 테스트의 편집 hydrate·저장·구성품·특징/형상 흐름은 변경하지 않았다.

## 불변식 재확인

1. 제품·분류 UUID 0건 계약: `ProductAndClassificationUuidFreeContractTest` GREEN. fallback도 UUID를 출력하지 않는다.
2. 감사 정보 보존: 미조회 UUID·시스템 표식·빈 값 모두 `createdBy`/`modifiedBy`에 non-null 후보값을 만든다. 정상 UUID는 기존처럼 fullName을 사용한다.
3. 화면 표시: `ProductFormPage`에서 작성자·수정자 표시 테스트 GREEN.
4. Live QA5 13개 회귀 항목: 이번 변경은 제품 저장, bundle component 저장, AUTO/FIXED 계산, 특징·형상 후보, 모델코드, 다섯 표면, 활성 타깃 로직을 수정하지 않았다. 보존 대상은 `무변경·연속 저장 200`, `AUTO 4+6`, `값 변경 저장 정상`, `비중 합 9 → 400 한국어 문구`, `FIXED 45,375`, `모달 부자재 추가·칩 설정·저장 완주`, `특징·형상 드롭박스`, `종류별 후보 변경`, `모델코드 불변`, `다섯 표면 화면 노출`, `활성 타깃 3건 유지`를 포함한 Live QA5 원문의 13개 PASS 항목이다. 기존 Live QA5 보고서의 PASS 원문을 보존했고, 이 라운드에서는 공유 DB 저장을 하지 않았다. 라이브 재실행 캡처는 하지 못했다.

## 못 한 것

- Live QA5와 동일한 격리 런타임을 이번 라운드에 재기동하지 않아 `V38__PRODUCT_CATEGORY_BACKFILL`의 전체 DB 건수와 수정 후 실제 화면 캡처를 새로 얻지 못했다.
- 따라서 기존 7장 QA 스크린샷의 회귀 PASS를 재확인했지만, 새 fix의 실 브라우저 13항목 재실행 PASS라고 보고하지 않는다.

## 라운드 종료 점검

```text
삭제된 추적 파일: 0건
tools/.s24-build-only/build/deep/tracked-writer.mjs: 추적·존재 확인
공유 DB 쓰기: 0건
격리 DB 쓰기: 0건 (전수 집계는 read-only SELECT)
이번 라운드가 남긴 격리 컨테이너/임시 디렉터리/QA 프로세스: 없음
```

워크트리에 이미 있던 미추적 파일 `docs/qa/2026-08-12-1143-reconv/*.ps1` 2개는 이번 작업과 무관하여 건드리지 않았다.
