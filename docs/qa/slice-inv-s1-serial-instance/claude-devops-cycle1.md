# DevOps 리뷰 — INV-S1 시리얼 인스턴스 (사이클 1)

리뷰어: DevOps (Claude)
브랜치: feat/inv-s1-serial-instance
일시: 2026-05-31

---

## 1. Flyway V9 안전성 (product-service)

### 1-1. ALTER ADD COLUMN — 무중단 여부

```sql
ALTER TABLE categories ADD COLUMN serial_managed BOOLEAN NOT NULL DEFAULT FALSE;
```

PostgreSQL 11 이상에서 `NOT NULL DEFAULT <constant>` ADD COLUMN 은 physical table rewrite 없이
카탈로그 업데이트만으로 완료된다. 운영 환경은 PostgreSQL 16-alpine 이므로 **무중단 확인.**

롤백 시 `ALTER TABLE categories DROP COLUMN serial_managed;` 단일 DDL 로 원복 가능.

### 1-2. UPDATE 멱등성

```sql
UPDATE categories
   SET serial_managed = TRUE
 WHERE code IN ('HVAC','INDOOR','OUTDOOR','INDOOR_WALL','INDOOR_CEILING')
   AND is_deleted = FALSE;
```

- V2 시드 기준 대상 5개 코드(HVAC, INDOOR, OUTDOOR, INDOOR_WALL, INDOOR_CEILING) 모두 존재 확인.
- PIPING, CONTROL 은 UPDATE 대상 제외 — V9 주석 설명과 실제 코드 일치.
- 이미 TRUE 인 row 에 SET TRUE 를 재실행해도 no-op 이므로 **멱등.**
- `is_deleted = FALSE` 조건: V2 시드 row 가 hard delete 없이 soft delete 로 관리되므로
  삭제된 코드가 있어도 영향 없음.

### 1-3. 위험 요인 없음

V9 은 ADD COLUMN + UPDATE 두 문장뿐이며, FK 생성 없음, 인덱스 생성 없음.
운영 categories row 는 7개(V2 시드)로 소량이어서 UPDATE lock wait 없음.

---

## 2. Flyway V15 안전성 (inventory-service)

### 2-1. CREATE TABLE — 무중단 여부

신규 테이블 단독 생성이므로 기존 테이블 lock 없음. **무중단.**

### 2-2. 인덱스 3개

| 인덱스명 | 컬럼 | 목적 |
|---|---|---|
| ix_stock_instances_fifo | (product_code, status, received_at) | FIFO 소진 쿼리 covering |
| ix_stock_instances_recall | (outbound_partner_code, product_code, status, outbound_at) | 역-FIFO 회수 쿼리 covering |
| ix_stock_instances_product | (product_id) | 품목별 조회 |

인덱스 생성 시점은 테이블 신설 직후 빈 테이블이므로 lock 없음.

### 2-3. BaseEntity 컬럼 정합

V15 DDL 에 선언된 BaseEntity 컬럼과 실제 BaseEntity.java 비교:

| DDL 컬럼 | BaseEntity 필드 | 일치 |
|---|---|---|
| created_at TIMESTAMP NOT NULL | @Column nullable=false, updatable=false | OK |
| created_by VARCHAR(50) NOT NULL | length=50, updatable=false | OK |
| modified_at TIMESTAMP | nullable | OK |
| modified_by VARCHAR(50) | length=50 | OK |
| deleted_at TIMESTAMP | nullable | OK |
| deleted_by VARCHAR(50) | length=50 | OK |
| is_deleted BOOLEAN NOT NULL DEFAULT FALSE | nullable=false | OK |

### 2-4. FK 없음 정책

product_id, warehouse_id 가 cross-DB 논리 참조이므로 DB 레벨 FK 미선언. MSA cross-DB 정책 정합.

---

## 3. 배포 순서 및 안전 degrade

### 3-1. 의존 관계

inventory-service 의 `StockInstanceService.create()` 는 `ProductClient.requireExists()` 를 통해
product-service 의 `serialManaged` 필드를 소비한다.

product-service V9 이 먼저 배포되지 않으면 product-service 가 `serialManaged` 필드 없이 응답한다.
`ProductSummary` record 에 backward-compatible 생성자(`serialManaged=false` 기본값)가 추가되어 있으므로
inventory-service 가 구 버전 product-service 의 응답을 역직렬화해도 `serialManaged=false` 로 처리된다.
`serialManaged=false` 이면 서비스 레이어에서 409 CONFLICT 반환 — **인스턴스 생성 차단(안전 degrade).**

즉, 순서 위반 배포 시에도 데이터 오염 없이 안전하게 실패한다.

### 3-2. 권장 배포 런북

```
1. [product-service] V9 Flyway 마이그레이션 + 재시작
   - categories.serial_managed ALTER ADD COLUMN 완료 확인
   - UPDATE 5개 row 완료 확인
   - GET /api/v1/products/internal/lookup 응답에 serialManaged 필드 포함 확인

2. [inventory-service] V15 Flyway 마이그레이션 + 재시작
   - stock_instances 테이블 생성 및 인덱스 3개 확인
   - POST /inventory/instances 엔드포인트 활성 확인

3. 순서 보장 이유:
   - product-service 선배포 없이 inventory-service 배포 시:
     serialManaged=false 기본값으로 모든 인스턴스 생성 요청이 409 반환
   - 안전 degrade 이므로 데이터 오염 없음
   - 단, 가급적 product-service 선배포 후 기능 검증 뒤 inventory-service 배포 권장

4. 롤백 절차:
   - inventory-service 먼저 이전 버전으로 되돌리기
   - product-service V9 롤백: ALTER TABLE categories DROP COLUMN serial_managed;
     (Flyway repair 필요)
```

---

## 4. CI 커버리지

### 4-1. CI 그룹 자동 포함

`ci.yml` matrix 그룹 `user+product+inventory+logging` 이 두 서비스를 모두 포함:

```
test-tasks: ':services:user-service:test :services:product-service:test
             :services:inventory-service:test :services:logging-service:test'
```

product-service V9 마이그레이션 + Category/ProductSummaryResponse 변경 및
inventory-service V15 마이그레이션 + StockInstance 전체가 단일 CI 그룹에서 함께 검증된다.

### 4-2. 통합 테스트 (StockInstanceIT)

AbstractPostgresIT 상속 → Testcontainers PostgreSQL 컨테이너 사용으로 예상. skipped=0 기대.

검증 케이스 6개:
- TC-1: serial-managed 품목 인스턴스 생성 → 201 + AVAILABLE
- TC-2: batch 품목 → 409 CONFLICT
- TC-3: FIFO received_at ASC 순서 단언
- TC-4: 역-FIFO outbound_at DESC 순서 단언
- TC-5/5b: 상태전이 가드 (RESERVED→ship, SHIPPED→reserve) 409 도메인 단위
- TC-6: soft-delete @SQLRestriction 필터 (markDeleted 후 FIFO 조회 제외)

ProductClient 는 @MockBean 격리(`feedback_it_mockbean_external_clients` 규칙 준수).

---

## 5. seed 토글

`StockInstanceSeeder` 활성 조건:
1. `@Profile("dev")` — dev 프로파일 한정
2. `@ConditionalOnProperty(value="app.inventory.seed-test-data", havingValue="true")`

`app.inventory.seed-test-data` 는 `application.yml` 에서:
```yaml
seed-test-data: ${SAMHAN_INVENTORY_SEED_TEST_DATA:${INVENTORY_SEED_TEST_DATA:false}}
```
환경변수 미주입 시 기본값 `false` → 인스턴스 seed 안 됨. **운영 안전 확인.**

`infrastructure/env-templates/.env.dev-seed` 에만 `SAMHAN_INVENTORY_SEED_TEST_DATA=true` 선언.

---

## 6. 게이트웨이 라우팅

`api-gateway/application.yml` `inventory-service-noprefix` 라우트:

```yaml
- id: inventory-service-noprefix
  uri: lb://inventory-service
  predicates:
    - Path=/inventory/**,/warehouse/**
  filters:
    - JwtAuthentication
```

`StockInstanceController` 의 `@RequestMapping("/inventory/instances")` 는
`/inventory/**` 패턴에 자동 포함된다. StripPrefix 필터 없음 — 컨트롤러 경로 그대로 forward.
**게이트웨이 변경 불필요.**

---

## 7. 결함 목록

### [CRITICAL] 없음

### [MAJOR] F-1: StockInstanceService.byProduct status=null 분기 — findAll() full scan

```java
// 현재 코드 (StockInstanceService.java L108~L112)
return repo.findAll().stream()
        .filter(i -> i.getProductId().equals(productId))
        .toList();
```

`findAll()` 은 stock_instances 전체 테이블을 메모리로 로드한 뒤 애플리케이션 레이어에서 필터링한다.
`ix_stock_instances_product(product_id)` 인덱스가 존재하지만 사용되지 않는다.
운영 환경에서 인스턴스가 수만 건 쌓이면 OOM/timeout 위험이 있다.

수정 방법: `StockInstanceRepository` 에 `findByProductId(UUID productId)` 파생 메서드 추가 후 사용.

```java
// 권장
return repo.findByProductId(productId);
```

### [MINOR] F-2: StockInstance.requireStatus — ResponseStatusException 혼용

도메인 엔티티(`StockInstance`)가 `org.springframework.web.server.ResponseStatusException` 에
직접 의존하고 있다. 도메인 레이어가 Spring Web 에 의존하는 것은 계층 위반이다.
다른 도메인 엔티티의 상태 전이 가드(예: StockLot)가 `BusinessException(ErrorCode.CONFLICT)` 패턴을
따른다면 일관성 문제가 있다.

IT(TC-5, TC-5b)는 `ResponseStatusException` 을 단언하고 있어 현재 테스트는 통과하지만,
중장기적으로 도메인 레이어를 Spring에서 분리할 때 변경 비용이 발생한다.

수정 방법: `requireStatus` 에서 `BusinessException(ErrorCode.CONFLICT, ...)` 사용.
TC-5/TC-5b 도 `BusinessException` 타입으로 단언 변경.

### [MINOR] F-3: StockInstanceSeeder UUID namespace 불일치 가능성 (주석 vs 코드 표기)

`StockInstanceSeeder` 의 `PRODUCT_UUID_PREFIX = "samhan-seed:product:"` + modelName 이고,
`HvacProductSeeder.deterministicId("product", row.modelName())` 는
`"samhan-seed:product:" + modelName` 으로 동일하다.

그러나 seeder 주석에 `product-service HvacProductSeeder.buildAllRows seq 1/31/51/76 에 해당` 라고 설명하면서,
실제 모델명(`AR05TXEAAWKNEU-01` 등)을 하드코딩한다.
HvacProductSeeder 에서 seq, 평형, 카테고리 로직이 변경되면 seeder 가 silent mismatch 될 수 있다.

결함보다는 위험 메모이며, UUID 카탈로그 상수(`project_seed_product_uuid_catalog.md`)로
공식 single source 를 관리하는 방향이 이미 결정되어 있으므로 다음 슬라이스에서 처리 권고.

---

## 8. 배포 런북 체크리스트

```
[ ] product-service V9 마이그레이션 완료 확인
    - flyway_schema_history 에 V9 success=1 확인
    - categories 테이블 serial_managed 컬럼 존재 확인
    - SELECT code, serial_managed FROM categories WHERE code IN
      ('HVAC','INDOOR','OUTDOOR','INDOOR_WALL','INDOOR_CEILING');
      → 5개 row 모두 serial_managed=true 확인

[ ] product-service 재시작 후 내부 API 검증
    - POST /products/internal/lookup {ids:[<에어컨 productId>]}
      → 응답 serialManaged=true 확인

[ ] inventory-service V15 마이그레이션 완료 확인
    - flyway_schema_history 에 V15 success=1 확인
    - \d stock_instances 로 테이블 + 인덱스 3개 존재 확인

[ ] inventory-service 재시작 후 엔드포인트 검증
    - POST /inventory/instances (serial-managed 품목) → 201
    - POST /inventory/instances (batch 품목) → 409
    - GET /inventory/instances/fifo?productCode=... → 200

[ ] seed toggle 확인 (DEV 전용)
    - SAMHAN_INVENTORY_SEED_TEST_DATA=true 인 환경에서 재시작 후
      stock_instances 테이블에 24개 row(4품목 × 2창고 × 3인스턴스) 확인
    - 운영 환경: 환경변수 미주입 → 0건 확인
```

---

## 9. 종합 판정

**CHANGES_REQUESTED**

블로커(CRITICAL): 없음.

머지 전 수정 필요:

- F-1 (MAJOR): `StockInstanceService.byProduct status=null` 분기에서 `findAll()` full scan 제거.
  `StockInstanceRepository` 에 `findByProductId(UUID)` 추가 후 사용.

머지 후 처리(MINOR, 차기 슬라이스):

- F-2: `StockInstance.requireStatus` 에서 `ResponseStatusException` → `BusinessException(CONFLICT)` 교체.
- F-3: seed UUID 카탈로그 single source 확립 시 StockInstanceSeeder 의 modelName 하드코딩 교체.

F-1 수정 후 재리뷰 요청.
