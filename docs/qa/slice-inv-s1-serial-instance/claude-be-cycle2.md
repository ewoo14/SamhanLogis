# BE 사이클 2 리뷰 — slice-inv-s1-serial-instance

> 리뷰어: Claude BE  
> fix 커밋: d6102a2f  
> 검증 범위: `git diff origin/main...HEAD`  
> 날짜: 2026-05-31

---

## 사이클 1 결함 해소 검증

### P0-1: `requireStatus` → `BusinessException(CONFLICT)` 통일 (ResponseStatusException 제거)

**해소 O.**

- `StockInstance.requireStatus()` 는 `BusinessException(ErrorCode.CONFLICT, ...)` 만 사용.
- `StockInstance` import 목록에 `org.springframework.web` 계열 없음 (도메인 레이어 Spring Web 의존 완전 제거).
- `StockInstanceService.create()` 도 `BusinessException(ErrorCode.CONFLICT, ...)` 로 throw.
- `ResponseStatusException` import 없음 (전체 inventory-service 메인 소스 확인).

**잔존 사항 (신규 결함 N1):**
`StockInstanceService.create()` 의 Javadoc `@throws` 태그가 `ResponseStatusException 409 — ...` 로 오기재되어 있음.  
실제 코드는 `BusinessException` 을 던지지만 Javadoc 은 수정되지 않았다. 컴파일/실행에 무해하나 문서 오기재이므로 경미(P2) 결함으로 등록.

---

### P0-2: `byProduct` — `findAll()` 전체 스캔 제거

**해소 O.**

`StockInstanceService.byProduct()`:
- `status != null` → `repo.findByProductIdAndStatus(productId, status)` (인덱스 사용).
- `status == null` → `repo.findByProductId(productId)` (`ix_stock_instances_product(product_id)` 인덱스 사용).
- `findAll()` 호출 없음 (메서드 소스 전체 확인).
- V15 마이그레이션에 `CREATE INDEX ix_stock_instances_product ON stock_instances(product_id)` 존재.
- `StockInstanceRepository` 에 `findByProductId(UUID)` 및 `findByProductIdAndStatus(UUID, StockInstanceStatus)` 메서드 선언 확인.

---

### P1-2: `CreateInstanceRequest.productCode` — `@NotBlank` 추가

**해소 O.**

```java
@NotBlank(message = "productCode 는 필수이며 공백만으로 구성될 수 없습니다")
String productCode,
```
- `@NotNull`(productId, warehouseId) + `@NotBlank`(productCode) 모두 정상 선언.
- `jakarta.validation.constraints.NotBlank` import 있음.

---

### P1-4: 판넬 미정의 주석 추가

**해소 O.**

`Category.java` Javadoc:
```
판넬 카테고리(PANEL 등) 주의: 현재 V2 시드에 판넬 카테고리는 미정의이다.
판넬 카테고리 추가 시 별도 Flyway 마이그레이션으로 serial_managed=true 지정이 필요하며,
Java seeder 경로에서도 markSerialManaged(boolean) 을 호출해야 한다.
```
`V9__add_category_serial_managed.sql` 에도 동일 취지 주석 포함.

---

### P1-5: `ProductSummaryResponse.from` LAZY 안전 (`@Transactional`)

**해소 O.**

`from(Product p)` 호출 위치 3개 모두 `@Transactional(readOnly = true)` 경계 내:
- `ProductService.lookupSummaryByModelName()` (line 87-89)
- `ProductService.lookupSummaryByName()` (line 102-114)
- `ProductService.lookup()` (line 130-141)
- `ProductService.search()` (line 39-51, Page 방식)

`ProductInternalControllerIT` 에서 실제 `from()` 경로(LAZY category 로딩 포함)를 end-to-end 검증하여 `LazyInitializationException` 미발생 확인.

---

## 신규 결함 / 회귀 검사

### N1 (P2 — 경미): `StockInstanceService.create()` Javadoc `@throws` 오기재

- 위치: `StockInstanceService.java` line 57
- 내용: `@throws ResponseStatusException 409` → 실제는 `BusinessException` 을 throw
- 영향: 컴파일/런타임 무해. 문서 오기재.
- 권고: `@throws BusinessException(ErrorCode.CONFLICT) 409 — batch 품목(serialManaged=false) 인 경우` 로 수정.

### N2: 없음 — `BaseEntity @Version` 부재 확인

`BaseEntity` 확인 결과 `@Version` 필드 없음 → V15 에 `version` 컬럼 미추가가 정상. 문제 없음.

### N3: 없음 — cross-service `serialManaged` 계약 일치

- `product-service ProductSummaryResponse.serialManaged` (boolean) ↔ `inventory-service ProductSummary.serialManaged` (boolean) 필드명/타입 일치.
- JSON 직렬화 키 `serialManaged` 동일.
- `ProductClient.requireExists()` 가 `ObjectMapper.convertValue(item, ProductSummary.class)` 로 역직렬화 → 필드 정합 확인.
- 기존 테스트 mock 이 6인수/7인수 backward-compat 생성자로 각각 라우팅되어 `serialManaged=false` 기본값 적용 → 기존 테스트 회귀 없음.

### N4: 없음 — 컴파일 정합

- `StockInstance` import 에 Spring Web 없음.
- `ResponseStatusException` import 없음 (전체 inventory-service 메인 소스).
- 모든 신규 파일 패키지/import 정합 확인.

### N5: 없음 — TC-2 `jsonPath("$.code", is("CONFLICT"))` 정합

- `ApiResponse.fail(code, msg)` → `code.name()` = `"CONFLICT"` (Java enum `.name()`).
- `ErrorCode.CONFLICT` 선언: `CONFLICT(HttpStatus.CONFLICT, ...)` → `.name()` = `"CONFLICT"`.
- 단언 정합.

---

## 총평

| 항목 | 결과 |
|---|---|
| P0-1 ResponseStatusException 제거 | 해소 O |
| P0-2 byProduct 전체 스캔 제거 | 해소 O |
| P1-2 productCode @NotBlank | 해소 O |
| P1-4 판넬 미정의 주석 | 해소 O |
| P1-5 ProductSummaryResponse.from LAZY 안전 | 해소 O |
| V15 version 미추가 | 정상 (BaseEntity @Version 없음) |
| cross-service serialManaged 계약 | 일치 |
| 신규 결함 | N1 (P2 경미) — @throws 오기재 1건 |
| 회귀 | 없음 |

**결론: APPROVE (with N1 경미 주석 수정 권고)**

사이클 1 P0/P1 결함 5건 모두 해소. 신규 결함은 Javadoc `@throws` 오기재 1건(P2)으로 런타임 무해하며 다음 슬라이스(S2) 작업 시 함께 수정 권고. 컴파일·테스트·cross-service 계약·soft-delete 가드 모두 정합. **APPROVE**.
