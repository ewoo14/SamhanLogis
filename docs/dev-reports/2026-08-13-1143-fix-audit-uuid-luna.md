# 2026-08-13 #1143 감사 사용자 UUID 수정 — CODEX LUNA

## 결론

`ProductResponse` 변환 경계가 `BaseEntity.createdBy`/`modifiedBy`의 내부 사용자 UUID 문자열을 그대로 공개하고 있었다. 제품 응답을 만들 때 user-service의 기존 `/internal/users/{userId}` 계약으로 `fullName`을 해석하고, 공개 응답의 `createdBy`/`modifiedBy`에는 이름만 넣도록 수정했다. UUID 해석 실패 시에도 UUID를 fallback으로 반환하지 않는다.

## 범위 조사

### 조사 대상

- `GET /products/by-model/{modelName}`
- `GET /products/{id}`, 제품 생성·수정·가격 수정 등 `ProductResponse`를 반환하는 제품 API
- 제품 서비스의 공개 제품·분류·카테고리·요약·카탈로그 DTO와 중첩 응답
- `origin/main` 동일 파일 및 #1143 변경 범위

### 조사 결과

| 표면 | 감사 UUID 동일 문제 | 결과 |
|---|---:|---|
| `ProductResponse` 제품 상세/변경 응답 | 있음 (`createdBy`, `modifiedBy`) | 이번 수정 대상 |
| `ClassificationResponse` | 감사 필드 없음 | 해당 없음 |
| `CategoryResponse` | 감사 필드 없음 | 해당 없음 |
| `ProductSummaryResponse` | 감사 필드 없음 | 해당 없음 |
| `ProductCatalogResponse` 및 중첩 분류/카테고리 | 감사 필드 없음 | 해당 없음 |
| `ProductSpecResponse`, `ProductByCodeResponse` | 감사 필드 없음 | 해당 없음 |

`origin/main`의 `ProductResponse`도 동일하게 `p.getCreatedBy()`/`p.getModifiedBy()`를 문자열로 복사하고 있어 main에도 같은 결함이 있었다. #1143은 제품·분류 엔티티 ID를 `OpaqueUuidSerializer`로 바꾸었지만, BaseEntity 감사 사용자 값은 DTO 변환에서 별도 표시명 해석을 거치지 않아 누락됐다.

제품 서비스 범위 밖의 다른 서비스 감사 API는 이번 수정 범위에 포함하지 않았다. 이번 조사에서 제품·분류 API 응답에 한정해 동일 문제를 확인한 표면은 `ProductResponse`이며, 제품 서비스 내 다른 공개 DTO에는 감사 필드 자체가 없었다.

## RED → GREEN 원문

### RED — 수정 전

전수 계약 테스트가 응답 본문 전체에 UUID 정규식을 적용하도록 먼저 추가했다.

```text
ProductAndClassificationUuidFreeContractTest > productResponse_auditUserUuidIsNeverSerialized() FAILED
java.lang.AssertionError

actual: ... "createdBy":"<UUID>", ... "modifiedBy":"<UUID>" ...
not to contain pattern:
  "[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}"

2 tests completed, 2 failed
BUILD FAILED
```

### GREEN — 수정 후

```text
./gradlew.bat :services:product-service:test --tests com.samhanair.logis.product.web.dto.ProductAndClassificationUuidFreeContractTest

BUILD SUCCESSFUL
```

추가한 계약은 특정 필드가 아니라 직렬화된 제품 응답 본문 전체를 검사하며, 별도로 감사 정보가 이름으로 보존되는지도 확인한다.

## 감사 정보와 화면 표시 판단

- DB의 `createdBy`/`modifiedBy` 저장값은 변경하지 않았다. 감사 원천 정보는 그대로 보존된다.
- 사용자 경계의 `createdBy`/`modifiedBy` 응답값은 사용자 UUID가 아니라 user-service의 `fullName`이다.
- 제품 API 필드명과 기존 화면 문구는 새로 정하지 않고 유지했다. 화면에서 감사 영역을 표시하는 경우 기존의 작성자/수정자 의미에 이름 값을 사용한다.
- user-service에 없는 사용자이거나 내부 호출이 실패한 경우 UUID를 내보내지 않는다. 따라서 사용자 식별자 비공개 불변식은 유지된다.

## 불변식 재확인

1. 제품·분류 공개 DTO 계약 테스트가 JSON 응답 본문 전체의 UUID 패턴을 검사한다. 결과는 0건이다.
2. 감사 시각과 원천 저장값은 건드리지 않았고, 정상 해석 시 `fullName`을 `createdBy`/`modifiedBy`에 담는 테스트가 통과했다.
3. Live QA4의 13개 정상 항목은 이번 변경이 제품 저장·bundle component·quantity sync·분류 후보·기본 납품가 로직을 수정하지 않으므로 코드상 회귀 경로가 없다. 기존 QA4 보고서의 13개 PASS 증거를 보존했고, 이번 라운드에서 공유 DB/라이브 저장을 재실행하지 않았다.

## 검증

- `npm run typecheck`: PASS. real-QA 보조 테스트 51/51 PASS.
- 변경 모듈 단위 계약 테스트: PASS.
- `:services:product-service:test`: PASS — 790 tests completed, failure/error 0.
- 첫 product-service 전량 실행에서 발생한 19건은 신규 `UserInternalClient`를 Mockito 테스트에 주입하지 않은 테스트 설정 문제였고, 테스트 mock 보강 후 전량 재실행에서 790건 전부 통과했다.
- live QA4 재실행, 격리 서비스 재기동, 공유 DB 쓰기: 하지 않음.

## 라운드 종료 점검

```text
삭제된 추적 파일: 0건
tools/.s24-build-only/build/deep/tracked-writer.mjs: 추적·존재 확인
공유 DB 쓰기: 0건
격리 컨테이너/임시 디렉터리/이번 라운드 QA 프로세스: 신규 생성·잔류 없음
```
