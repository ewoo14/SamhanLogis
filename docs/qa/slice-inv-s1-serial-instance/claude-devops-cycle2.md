# DevOps 사이클 2 리뷰 — INV-S S1 시리얼 인스턴스 (재검증)

검증 커밋: d6102a2f  
검증일: 2026-05-31  
리뷰어: Claude DevOps Agent (사이클 2)

---

## 사이클 1 결함 해소 검증

### F-1 (MAJOR) — byProduct findAll() 전체 스캔 제거

**원래 결함**: `StockInstanceService.byProduct()` 의 status=null 분기가 `findAll().stream().filter()` 를 사용하여 전체 테이블 스캔을 수행.

**수정 내용 확인**:

`StockInstanceRepository` 에 `findByProductId(UUID productId)` 메서드가 추가됨. 이 메서드는 Spring Data JPA 쿼리 파생 규칙에 따라 `WHERE product_id = ? AND is_deleted = false` 를 생성하며, V15 마이그레이션에서 생성한 `ix_stock_instances_product(product_id)` 인덱스를 그대로 활용한다.

`StockInstanceService.byProduct()` 의 status=null 분기가 `repo.findAll().stream().filter(...)` 에서 `repo.findByProductId(productId)` 로 교체됨.

**해소 판정: O (완전 해소)**

코드에 `findAll()` 전체 스캔 경로가 남아 있지 않음. 리포지토리 Javadoc에도 인덱스 활용 근거를 명시하여 추후 유지보수자가 퇴행을 방지할 수 있음.

---

### F-2 (MINOR) — 도메인 ResponseStatusException → BusinessException

**원래 결함**: `StockInstance.requireStatus()` 가 `ResponseStatusException(HttpStatus.CONFLICT)` 를 던져 도메인 레이어가 Spring Web(`spring-webmvc`)에 의존하는 계층 위반. GlobalExceptionHandler가 `ResponseStatusException` 핸들러를 가지고 있지 않으므로 500 낙수 위험.

**수정 내용 확인**:

- `StockInstance.java` 에서 `import org.springframework.http.HttpStatus`, `import org.springframework.web.server.ResponseStatusException` 가 완전 제거됨.
- `requireStatus()` 내부가 `throw new BusinessException(ErrorCode.CONFLICT, ...)` 로 교체됨.
- `GlobalExceptionHandler` 에 `@ExceptionHandler(BusinessException.class)` 핸들러가 존재하며 `code.getHttpStatus()` 로 응답 상태 코드를 결정하므로 409 응답이 정확히 전달됨.
- `ErrorCode.CONFLICT` 는 `HttpStatus.CONFLICT` 로 매핑되어 있음.

**잔여 경미 사항**: `StockInstanceService.java` 57번 줄 Javadoc에 `@throws ResponseStatusException 409` 표현이 남아 있음. 실제 코드는 `BusinessException` 을 던지므로 기능적으로는 문제 없으나 문서 부정확.

**해소 판정: O (실질 해소, Javadoc 표현 불일치 잔존 — 비차단)**

---

## V9 / V15 마이그레이션 변경 없음 안전 재확인

**V9 (`product-service`)**: 사이클 1 이후 변경 없음. `ALTER TABLE categories ADD COLUMN serial_managed BOOLEAN NOT NULL DEFAULT FALSE` + 에어컨 계열 UPDATE. `DEFAULT FALSE` 이므로 기존 row에 영향 없음. 신규 카테고리 생성 시 기본값 false로 시작하므로 legacy 호환 완전 유지.

**V15 (`inventory-service`)**: 사이클 1 이후 변경 없음. `stock_instances` 테이블 신규 생성 + 3개 인덱스 생성. 기존 테이블(`stock_lots`, 그 외) 무변경. DDL-only 추가 마이그레이션이므로 롤백 시나리오 없이 안전.

**해소 판정: O (변경 없음 재확인, 배포 안전)**

---

## HvacProductSeeder markSerialManaged 추가 배포/seed 영향

**추가 내용**: `HvacProductSeeder.run()` 이 카테고리 캐시에서 에어컨 계열 카테고리를 찾으면 `category.markSerialManaged(true)` 를 호출함. 이는 `@Profile("dev")` + `app.product.seed-test-data=true` 가 모두 활성인 경우에만 실행됨.

**배포 안전 분석**:
- Production 환경: `@Profile("dev")` 에 의해 이 seeder 자체가 빈으로 등록되지 않음 → 영향 없음.
- Dev/CI 환경: Flyway V9가 먼저 실행되어 이미 DB에 `serial_managed=true` 가 반영된 상태에서 seeder가 JPA 영속성 컨텍스트에 동일한 값을 재설정하는 것이므로 중복 적용 안전. 세마포어 이중화(DB + JPA 레이어) 개념으로, V9 없이 H2 in-memory 컨텍스트에서만 도는 경우를 방어.
- 비-Flyway 테스트 컨텍스트(H2 in-memory): seeder 경로에서 markSerialManaged를 호출하므로 JPA 레이어 일관성 보장.

**seed 영향**: 기존 seeder 픽스처 품목의 카테고리 객체에 `serialManaged=true` 를 덮어쓰는 것이 추가됨. DB에 이미 V9로 반영된 값이므로 dirty write 없음. JPA `merge` 도 발생하지 않음(`Category` 객체는 캐시에 load되어 있으므로 `markSerialManaged` 호출 후 `@Transactional` 커밋 시 dirty-checking으로 UPDATE가 날 수 있는지 확인 필요).

**잠재 관찰**: `HvacProductSeeder.run()` 의 `@Transactional` 경계 안에서 `catCache`에 load된 `Category` 엔티티에 `markSerialManaged(true)` 를 호출하면 JPA dirty-checking이 감지하여 `UPDATE categories SET serial_managed = TRUE WHERE id = ?` SQL이 발행될 수 있음. V9 이후에는 DB 값이 이미 `true` 이므로 실질 변경 없는 UPDATE이지만, 불필요한 쿼리가 발행될 가능성이 있음. 기능적으로는 무해하나 성능 관점에서 불필요한 dirty write.

**해소 판정: O (배포 안전 확인, 불필요 dirty write 가능성 있음 — 비차단 MINOR)**

---

## 배포 순서 안전 분석 (product → inventory)

**product-service 먼저 배포**:
- V9 마이그레이션으로 `categories.serial_managed` 컬럼 추가 + 에어컨 계열 UPDATE.
- `ProductSummaryResponse` 에 `serialManaged` 필드가 포함되어 내부 API `/products/internal/lookup` 응답에 `serialManaged` 가 추가됨.
- inventory-service가 아직 구 버전이면 `ProductSummary` record의 `serialManaged` 필드를 읽지 못하지만, inventory-service에 StockInstance 기능이 아직 배포되지 않았으므로 호출 경로 자체가 없음 → 안전.

**inventory-service 후속 배포**:
- V15 마이그레이션으로 `stock_instances` 테이블 생성.
- `StockInstanceService` 가 `ProductClient.requireExists()` 를 호출하여 product-service V9 이후 응답에서 `serialManaged` 를 읽음. product-service가 먼저 배포되어 있으므로 필드 존재 보장.

**safe degrade 확인**: product-service를 먼저 배포한 후 inventory-service 배포 중 잠깐의 구 inventory-service 인스턴스가 있더라도, `StockInstanceService` 경로 자체가 구 코드에 없으므로 runtime 오류 없음.

**해소 판정: O (순서 안전 확인)**

---

## CI 커버리지 유지 확인

**신규 테스트 추가 내역**:

`StockInstanceIT` 에 12개 테스트 케이스:
- TC-1: serial-managed 201 + DB row 확인
- TC-2: batch 품목 409 + response body `code=CONFLICT`, `message contains "batch"` 단언 (GlobalExceptionHandler BusinessException 경로 검증)
- TC-3: FIFO 정확 값 `isEqualTo` + `hasSize(3)`
- TC-4: 역-FIFO 정확 값 `isEqualTo` + `hasSize(3)`
- TC-5: RESERVED → ship BusinessException 409 (도메인 단위)
- TC-5b: SHIPPED → reserve BusinessException 409 (도메인 단위)
- M-1a~e: recall/release 정상 전이 + 비정상 전이 BusinessException 409

`ProductInternalControllerIT` 에 3개 테스트:
- serial-managed 카테고리 품목 `serialManaged=true` 응답 검증
- batch 카테고리 품목 `serialManaged=false` 응답 검증
- 혼합 lookup size 검증

**CI 매트릭스 확인**: `user+product+inventory+logging` 그룹에 두 서비스 모두 포함됨 (30분 timeout). 신규 테스트가 Testcontainers 싱글턴 컨테이너 패턴을 사용하므로 Docker 미가용 시 skip 처리되어 CI 실패 없음.

**해소 판정: O (커버리지 강화 확인)**

---

## 잔여 비차단 사항

| ID | 심각도 | 내용 | 차단 여부 |
|---|---|---|---|
| R-1 | INFO | `StockInstanceService.java` 57번 줄 Javadoc `@throws ResponseStatusException 409` 표현 — 실제 구현은 `BusinessException` 이므로 문서 부정확 | 비차단 |
| R-2 | INFO | `HvacProductSeeder.markSerialManagedIfPresent` 호출 시 JPA dirty-checking에 의한 불필요 UPDATE 쿼리 발행 가능성 — V9 이후 dev 환경에서만 발생, 기능 무해 | 비차단 |

---

## 최종 결론

| 결함 | 해소 | 비고 |
|---|---|---|
| F-1 MAJOR: findAll() 전체 스캔 | O | findByProductId + 인덱스 활용으로 완전 교체 |
| F-2 MINOR: ResponseStatusException → BusinessException | O | 도메인 레이어 Spring Web 의존 완전 제거, GlobalExceptionHandler 409 변환 확인 |
| V9/V15 변경 없음 안전 | O | 사이클 1 이후 SQL 무변경 재확인 |
| HvacProductSeeder markSerialManaged 배포 영향 | O | dev-only, production 영향 없음 확인 |
| 배포 순서 product→inventory | O | safe degrade 확인 |
| CI 커버리지 | O | 12 + 3 테스트 추가, BusinessException 경로 end-to-end 검증 포함 |

**판정: APPROVE**

사이클 1 DevOps 결함(F-1 MAJOR, F-2 MINOR) 모두 해소됨. 잔여 사항(R-1 Javadoc 표현, R-2 불필요 dirty write)은 기능에 영향 없는 비차단 INFO 수준으로 머지 차단 사유 없음.
