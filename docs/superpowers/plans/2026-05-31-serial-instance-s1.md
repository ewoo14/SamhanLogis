# 시리얼 인스턴스 재고 모델 — S1 인스턴스 기반 구현 계획 (Phase INV-S / S1)

> **For agentic workers:** 5-team 병렬 디스패치 + cycle N=2([[feedback_multi_agent_team_pattern]]). **S1 = BE 전용**(product-service 판정 source + inventory-service 인스턴스 도메인). FE 없음(인스턴스 표시는 §6 후속). 입출고 전표 연동은 S2~S4(후속 독립 슬라이스).

**Goal:** 개별시리얼 품목의 재고 최소단위를 UUID 인스턴스(`stock_instances`)로 모델링 — 테이블 + 도메인(생성/상태전이/FIFO·역-FIFO 조회) + 관리방식 판정(category serial_managed) + seed + 인스턴스 CRUD/조회 API.

**Architecture:** 관리방식은 **카테고리 속성** — product-service `categories.serial_managed` 파생(에어컨/판넬→true, 부자재→false) → `ProductSummaryResponse.serialManaged` 노출. inventory-service 는 이 플래그로 개별시리얼 판정, serial-managed 품목만 `stock_instances` 인스턴스 생성. batch 품목은 기존 stock_lots 유지(무변경). 입출고 연동 없이 인스턴스 CRUD/조회만.

**Tech Stack:** Spring Boot 3.3 / Java 17 / JPA / Flyway / Testcontainers(실 Postgres).

**설계 출처:** `docs/superpowers/specs/2026-05-31-serial-instance-inventory-design.md` (§3.1 테이블, §4 S1). 결정: 범위=S1 only / 판정=product 파생 serial_managed(2026-05-31 마우스).

---

## File Structure
### product-service (판정 source)
- Create: `services/product-service/src/main/resources/db/migration/V9__add_category_serial_managed.sql`
- Modify: `services/product-service/.../domain/Category.java` (serialManaged 필드 + 도메인 메서드)
- Modify: `services/product-service/.../web/dto/ProductSummaryResponse.java` (serialManaged)
- Modify: product-service 의 `ProductSummaryResponse.from(...)` 매핑 위치(ProductService/Controller) — product.getCategory().isSerialManaged()
- Modify: Category seeder (에어컨/판넬 카테고리 serial_managed=true)

### inventory-service (S1 core)
- Modify: `services/inventory-service/.../client/ProductSummary.java` (serialManaged)
- Create: `services/inventory-service/src/main/resources/db/migration/V15__create_stock_instances.sql`
- Create: `services/inventory-service/.../domain/StockInstanceStatus.java`
- Create: `services/inventory-service/.../domain/StockInstance.java`
- Create: `services/inventory-service/.../repository/StockInstanceRepository.java`
- Create: `services/inventory-service/.../service/StockInstanceService.java`
- Create: `services/inventory-service/.../web/StockInstanceController.java` + DTO
- Modify: inventory seeder (serial-managed 품목 인스턴스 seed)
- Test: `services/inventory-service/.../it/StockInstanceIT.java`

---

## Phase 0 — product-service (serial_managed 판정 source) (backend-engineer)

### Task 1: V9 categories.serial_managed + Category 도메인

**Files:**
- Create: `services/product-service/src/main/resources/db/migration/V9__add_category_serial_managed.sql`
- Modify: `services/product-service/src/main/java/com/samhanair/logis/product/domain/Category.java`

- [ ] **Step 1: 마이그레이션**

```sql
-- V9: 카테고리 관리방식 — 개별시리얼(true) vs batch(false). Phase INV-S / S1.
ALTER TABLE categories ADD COLUMN serial_managed BOOLEAN NOT NULL DEFAULT FALSE;
COMMENT ON COLUMN categories.serial_managed IS '개별시리얼 관리 여부(에어컨/판넬=true, 부자재 등=false) — stock_instances 대상 판정';
```

- [ ] **Step 2: Category 필드 + 도메인 메서드**

```java
    @Column(name = "serial_managed", nullable = false)
    private boolean serialManaged;

    /** 관리방식 지정 — 개별시리얼(true)/batch(false). */
    public void markSerialManaged(boolean serialManaged) {
        this.serialManaged = serialManaged;
    }
```
> `@Getter` 가 `isSerialManaged()` 생성. create() 시그니처는 무변경(기본 false), 도메인 메서드로 지정.

- [ ] **Step 3: 컴파일** Run: `./gradlew :services:product-service:compileJava` Expected: BUILD SUCCESSFUL.
- [ ] **Step 4: 커밋 금지** (PM 통합).

### Task 2: Category seed — 에어컨/판넬 serial_managed=true

**Files:**
- Modify: product-service Category seeder (찾기: `grep -rln "Category.create\|CategorySeeder" services/product-service/src/main/java`)

- [ ] **Step 1**: 카테고리 seed 에서 **에어컨·판넬 계열 카테고리**에 `markSerialManaged(true)` 호출(저장 전). 부자재 등은 기본 false. 멱등 seeder 면 기존 row 업데이트 경로도 반영.
> 정확한 카테고리 식별(code/name) 은 seeder 의 에어컨/판넬 정의를 따른다(예: name contains "에어컨"/"판넬" 또는 명시 code 목록). 구현 시 seeder 의 실제 카테고리 정의 확인.
- [ ] **Step 2: 컴파일 + 커밋 금지.**

### Task 3: ProductSummaryResponse.serialManaged 노출

**Files:**
- Modify: `services/product-service/.../web/dto/ProductSummaryResponse.java`
- Modify: `from(...)` 매핑 호출처(ProductService 또는 ProductInternalController)

- [ ] **Step 1**: `ProductSummaryResponse` record 에 `boolean serialManaged` 추가(기존 backward-compat 생성자 유지, 신규 필드 끝에). `from(Product p)` 매핑에 `p.getCategory().isSerialManaged()` 추가. `/products/internal/lookup` 응답에 포함됨(inventory 가 읽음).
> 기존 6-인자 backward-compat 생성자는 serialManaged=false 기본으로 위임.
- [ ] **Step 2: 컴파일 + 기존 product IT 회귀** Run: `./gradlew :services:product-service:compileTestJava :services:product-service:test --tests "*ProductSummary*" --tests "*ProductInternal*"` Expected: PASS, skipped=0.
- [ ] **Step 3: 커밋 금지.**

---

## Phase 1 — inventory-service S1 (backend-engineer)

### Task 4: inventory ProductSummary.serialManaged

**Files:**
- Modify: `services/inventory-service/.../client/ProductSummary.java`

- [ ] **Step 1**: record 에 `boolean serialManaged` 추가(끝 필드). 기존 backward-compat 생성자(productCode 없는 6-인자, 7-인자)는 serialManaged=false 위임 유지. product-service 응답 JSON 의 `serialManaged` 키가 매핑됨.
- [ ] **Step 2: 컴파일 + 커밋 금지.**

### Task 5: V15 stock_instances 테이블

**Files:**
- Create: `services/inventory-service/src/main/resources/db/migration/V15__create_stock_instances.sql`

- [ ] **Step 1**:
```sql
-- V15: 개별시리얼 재고 인스턴스 (Phase INV-S / S1). UUID = 인스턴스 시리얼 키.
CREATE TABLE stock_instances (
    id                    UUID PRIMARY KEY,
    product_id            UUID NOT NULL,
    product_code          VARCHAR(50) NOT NULL,
    warehouse_id          UUID NOT NULL,
    status                VARCHAR(20) NOT NULL,         -- AVAILABLE/RESERVED/SHIPPED/RECALLED
    inbound_type          VARCHAR(20),                  -- 구매/차용
    received_at           TIMESTAMP NOT NULL,           -- FIFO 정렬 키
    unit_cost             NUMERIC(15,2),
    inbound_slip_no       VARCHAR(64),
    outbound_partner_code VARCHAR(100),                 -- 회수 역-FIFO 근거
    outbound_slip_no      VARCHAR(64),
    outbound_at           TIMESTAMP,
    created_at            TIMESTAMP NOT NULL,
    created_by            VARCHAR(50) NOT NULL,
    modified_at           TIMESTAMP,
    modified_by           VARCHAR(50),
    deleted_at            TIMESTAMP,
    deleted_by            VARCHAR(50),
    is_deleted            BOOLEAN NOT NULL DEFAULT FALSE
);
-- FIFO 소진: product_code + status + received_at ASC
CREATE INDEX ix_stock_instances_fifo ON stock_instances(product_code, status, received_at);
-- 역-FIFO 회수: outbound_partner_code + product_code + status + outbound_at DESC
CREATE INDEX ix_stock_instances_recall ON stock_instances(outbound_partner_code, product_code, status, outbound_at);
CREATE INDEX ix_stock_instances_product ON stock_instances(product_id);
COMMENT ON TABLE stock_instances IS '개별시리얼 재고 인스턴스 — UUID=시리얼 키 (Phase INV-S S1)';
```
- [ ] **Step 2: 검증** Run: `./gradlew :services:inventory-service:flywayValidate` 또는 컨테이너 기동 자동.
- [ ] **Step 3: 커밋 금지.**

### Task 6: StockInstanceStatus + StockInstance 엔티티

**Files:**
- Create: `services/inventory-service/.../domain/StockInstanceStatus.java`
- Create: `services/inventory-service/.../domain/StockInstance.java`

- [ ] **Step 1: enum**
```java
package com.samhanair.logis.inventory.domain;
/** 개별시리얼 인스턴스 상태 — soft delete 대신 status 전이 (Phase INV-S S1). */
public enum StockInstanceStatus {
    AVAILABLE,  // 입고 후 가용
    RESERVED,   // 예약(2.6c 수량 reserve 통합은 후속)
    SHIPPED,    // 출고 완료(출고처 기록)
    RECALLED    // 회수됨(반품/회차 — 역-FIFO 후속 S4)
}
```

- [ ] **Step 2: 엔티티** (BaseEntity 7 audit + soft delete, 정적 팩토리 + 상태전이 도메인 메서드 + 가드)
```java
package com.samhanair.logis.inventory.domain;

import com.samhanair.logis.common.entity.BaseEntity;
import jakarta.persistence.*;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.UUID;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.SQLRestriction;
import org.hibernate.annotations.UuidGenerator;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

/**
 * 개별시리얼 재고 인스턴스 — 재고 최소단위(UUID=시리얼 키). Phase INV-S / S1.
 * 에어컨/판넬 등 serial_managed 카테고리 품목만 인스턴스로 관리. batch 품목은 stock_lots.
 * FIFO 정렬 키 = receivedAt. 회수 역-FIFO 근거 = outboundPartnerCode + outboundAt.
 */
@Entity
@Getter
@Table(name = "stock_instances")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@SQLRestriction("is_deleted = false")
public class StockInstance extends BaseEntity {

    @Id @GeneratedValue @UuidGenerator
    @Column(name = "id", updatable = false, nullable = false)
    private UUID id;

    @Column(name = "product_id", nullable = false) private UUID productId;
    @Column(name = "product_code", nullable = false, length = 50) private String productCode;
    @Column(name = "warehouse_id", nullable = false) private UUID warehouseId;

    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false, length = 20)
    private StockInstanceStatus status;

    @Column(name = "inbound_type", length = 20) private String inboundType;   // 구매/차용
    @Column(name = "received_at", nullable = false) private LocalDateTime receivedAt;
    @Column(name = "unit_cost", precision = 15, scale = 2) private BigDecimal unitCost;
    @Column(name = "inbound_slip_no", length = 64) private String inboundSlipNo;
    @Column(name = "outbound_partner_code", length = 100) private String outboundPartnerCode;
    @Column(name = "outbound_slip_no", length = 64) private String outboundSlipNo;
    @Column(name = "outbound_at") private LocalDateTime outboundAt;

    private StockInstance(UUID productId, String productCode, UUID warehouseId,
                          String inboundType, LocalDateTime receivedAt, BigDecimal unitCost,
                          String inboundSlipNo) {
        if (productId == null) throw new IllegalArgumentException("productId 필수");
        if (productCode == null || productCode.isBlank()) throw new IllegalArgumentException("productCode 필수");
        if (warehouseId == null) throw new IllegalArgumentException("warehouseId 필수");
        this.productId = productId;
        this.productCode = productCode;
        this.warehouseId = warehouseId;
        this.status = StockInstanceStatus.AVAILABLE;
        this.inboundType = inboundType;
        this.receivedAt = receivedAt == null ? LocalDateTime.now() : receivedAt;
        this.unitCost = unitCost;
        this.inboundSlipNo = inboundSlipNo;
    }

    /** 입고 — 신규 가용 인스턴스 생성(AVAILABLE). */
    public static StockInstance inbound(UUID productId, String productCode, UUID warehouseId,
                                        String inboundType, LocalDateTime receivedAt,
                                        BigDecimal unitCost, String inboundSlipNo) {
        return new StockInstance(productId, productCode, warehouseId, inboundType,
                receivedAt, unitCost, inboundSlipNo);
    }

    /** 출고 — AVAILABLE → SHIPPED + 출고처 기록(S3 연동에서 호출). */
    public void ship(String partnerCode, String outboundSlipNo, LocalDateTime outboundAt) {
        requireStatus(StockInstanceStatus.AVAILABLE, "출고");
        this.status = StockInstanceStatus.SHIPPED;
        this.outboundPartnerCode = partnerCode;
        this.outboundSlipNo = outboundSlipNo;
        this.outboundAt = outboundAt == null ? LocalDateTime.now() : outboundAt;
    }

    /** 회수 — SHIPPED → RECALLED(반품/회차 역-FIFO, S4 연동). */
    public void recall() {
        requireStatus(StockInstanceStatus.SHIPPED, "회수");
        this.status = StockInstanceStatus.RECALLED;
    }

    /** 예약 — AVAILABLE → RESERVED (2.6c 통합 후속). */
    public void reserve() {
        requireStatus(StockInstanceStatus.AVAILABLE, "예약");
        this.status = StockInstanceStatus.RESERVED;
    }

    /** 예약 해제 — RESERVED → AVAILABLE. */
    public void release() {
        requireStatus(StockInstanceStatus.RESERVED, "예약 해제");
        this.status = StockInstanceStatus.AVAILABLE;
    }

    private void requireStatus(StockInstanceStatus expected, String action) {
        if (this.status != expected) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    action + " 불가 — 현재 상태 " + this.status + " (필요 " + expected + ")");
        }
    }
}
```
- [ ] **Step 3: 컴파일** Run: `./gradlew :services:inventory-service:compileJava`
- [ ] **Step 4: 커밋 금지.**

### Task 7: StockInstanceRepository (FIFO / 역-FIFO)

**Files:**
- Create: `services/inventory-service/.../repository/StockInstanceRepository.java`

- [ ] **Step 1**:
```java
package com.samhanair.logis.inventory.repository;

import com.samhanair.logis.inventory.domain.StockInstance;
import com.samhanair.logis.inventory.domain.StockInstanceStatus;
import java.util.List;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

/** 개별시리얼 인스턴스 리포지토리 — @SQLRestriction 으로 soft-delete 자동 필터. */
public interface StockInstanceRepository extends JpaRepository<StockInstance, UUID> {

    /** FIFO 소진 후보 — product_code 그룹의 AVAILABLE 인스턴스 received_at ASC. */
    List<StockInstance> findByProductCodeAndStatusOrderByReceivedAtAsc(
            String productCode, StockInstanceStatus status);

    /** 역-FIFO 회수 후보 — 거래처+품목코드 SHIPPED 인스턴스 outbound_at DESC. */
    List<StockInstance> findByOutboundPartnerCodeAndProductCodeAndStatusOrderByOutboundAtDesc(
            String outboundPartnerCode, String productCode, StockInstanceStatus status);

    /** 품목별 인스턴스 조회. */
    List<StockInstance> findByProductIdAndStatus(UUID productId, StockInstanceStatus status);

    /** 창고별 인스턴스 수 집계(조회용). */
    long countByProductCodeAndWarehouseIdAndStatus(
            String productCode, UUID warehouseId, StockInstanceStatus status);
}
```
- [ ] **Step 2: 컴파일 + 커밋 금지.**

### Task 8: StockInstanceService + Controller (조회 + 수동 생성)

**Files:**
- Create: `services/inventory-service/.../service/StockInstanceService.java`
- Create: `services/inventory-service/.../web/StockInstanceController.java` + `web/dto/StockInstanceResponse.java` + `CreateInstanceRequest.java`

- [ ] **Step 1: Service** — S1 범위(입출고 전표 연동 없음): 수동 인스턴스 생성(serial-managed 판정 가드) + 조회(FIFO/역-FIFO/품목별).
```java
@Service @RequiredArgsConstructor
public class StockInstanceService {
    private final StockInstanceRepository repo;
    private final ProductClient productClient;

    /** 수동 인스턴스 생성 — serial-managed 품목만 허용(아니면 409). S2 입고연동 전 토대. */
    @Transactional
    public StockInstance create(UUID productId, String productCode, UUID warehouseId,
                                String inboundType, BigDecimal unitCost, String inboundSlipNo,
                                LocalDateTime receivedAt) {
        ProductSummary p = productClient.requireExists(productId);
        if (!p.serialManaged()) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "개별시리얼 관리 품목이 아닙니다 (batch 품목은 stock_lots). productId=" + productId);
        }
        return repo.save(StockInstance.inbound(productId, productCode, warehouseId,
                inboundType, receivedAt, unitCost, inboundSlipNo));
    }

    @Transactional(readOnly = true)
    public List<StockInstance> fifoCandidates(String productCode) {
        return repo.findByProductCodeAndStatusOrderByReceivedAtAsc(productCode, StockInstanceStatus.AVAILABLE);
    }

    @Transactional(readOnly = true)
    public List<StockInstance> recallCandidates(String partnerCode, String productCode) {
        return repo.findByOutboundPartnerCodeAndProductCodeAndStatusOrderByOutboundAtDesc(
                partnerCode, productCode, StockInstanceStatus.SHIPPED);
    }
}
```

- [ ] **Step 2: Controller** — `@RequestMapping("/inventory/instances")`, 권한 `inventory.stock-balance` VIEW(조회)/CREATE(생성). UUID 비공개(응답은 productCode/warehouseId 는... warehouseId 는 UUID — 응답 DTO 에 warehouseCode 포함 위해 조회 시 창고명 보강 또는 productCode/상태/received_at 중심. **응답 DTO 에서 UUID 는 식별 key 로만, 사용자 표시용은 productCode/status/슬립번호**).
  - `POST /inventory/instances` (create) / `GET /inventory/instances/fifo?productCode=` / `GET /inventory/instances/recall?partnerCode=&productCode=` / `GET /inventory/instances?productId=&status=`.
  - `StockInstanceResponse`(id, productCode, warehouseId, status, inboundType, receivedAt, unitCost, inboundSlipNo, outboundPartnerCode, outboundSlipNo, outboundAt). (id/productId/warehouseId UUID 는 API key — 화면 표시 시 FE가 코드/명 사용.)

- [ ] **Step 3: 컴파일 + 커밋 금지.**

### Task 9: seed — serial-managed 품목 인스턴스

**Files:**
- Modify/Create: inventory seeder (기존 `StockBalanceSeeder` 옆 `StockInstanceSeeder` 또는 토글)

- [ ] **Step 1**: serial-managed 품목(에어컨/판넬) 일부에 대해 창고별 AVAILABLE 인스턴스 N개 seed(received_at 분산 → FIFO 검증 가능). batch 품목은 기존 stock_lots/balances 유지. seed 토글(`SAMHAN_INVENTORY_SEED_TEST_DATA`) 가드. 멱등.
> productCode/productId 는 [[project_seed_product_uuid_catalog]] 고정 UUID 카탈로그 정합 사용.
- [ ] **Step 2: 컴파일 + 커밋 금지.**

### Task 10: IT (실 Postgres)

**Files:**
- Create: `services/inventory-service/.../it/StockInstanceIT.java`

- [ ] **Step 1**: Testcontainers IT. ProductClient @MockBean(serialManaged true/false stub). 케이스:
  1. serial-managed 품목 인스턴스 생성 → AVAILABLE + DB row.
  2. **batch 품목(serialManaged=false) 생성 시도 → 409.**
  3. FIFO 조회 — received_at ASC 순서 단언.
  4. 역-FIFO 조회 — SHIPPED 인스턴스 outbound_at DESC 순서(인스턴스 ship() 후).
  5. 상태전이 가드 — AVAILABLE 아닌데 ship/reserve → 409 (도메인 단위 or IT).
  6. soft-delete @SQLRestriction 필터.
- [ ] **Step 2: 실행** Run: `./gradlew :services:inventory-service:test --tests "*StockInstanceIT*"` Expected: PASS, skipped=0.
- [ ] **Step 3: 커밋 금지.**

---

## Phase 2 — 문서 (PM/TM)

### Task 11: DECISIONS + dev-report
- [ ] DECISIONS D-SER-01(판정=category serial_managed 파생) / D-SER-02(인스턴스 status 전이, soft-delete 대신) / D-SER-03(S1 범위=인스턴스 기반, 입출고 S2~S4) + `docs/dev-reports/slice-inv-s1-serial-instance.md`(함수 3-layer) + 핸드오프.

---

## Self-Review

**1. Spec coverage:** §3.1 stock_instances 테이블→Task5. §4 S1(테이블+도메인+판정+seed+CRUD/조회)→Task5·6·7·8·9. 판정(category serial_managed)→Task1·2·3·4. FIFO/역-FIFO 조회→Task7. ✅ S2~S4(입출고 연동)는 본 plan 범위 밖(spec §4 명시). 입출고 연동 도메인 메서드(ship/recall/reserve)는 Task6 에 미리 정의하되 호출은 S2~S4.

**2. Placeholder scan:** Task6/7 완전 코드. Task2/8/9 는 seeder/controller 골격+contract(정확한 카테고리 식별·DTO 필드 명시, 구현 시 seeder 실제 카테고리 확인 주석). 플레이스홀더성 없음.

**3. Type consistency:** product `Category.isSerialManaged()` → `ProductSummaryResponse.serialManaged` → inventory `ProductSummary.serialManaged()` → `StockInstanceService.create` 가드. 일관. `StockInstanceStatus`(AVAILABLE/RESERVED/SHIPPED/RECALLED) ↔ 엔티티 status ↔ repository 쿼리 ↔ service 일관. `received_at`/`outbound_at` 컬럼 ↔ FIFO/역-FIFO 인덱스·쿼리 정합.

> ⚠️ 구현 확인: product-service Category seeder 의 에어컨/판넬 카테고리 식별 방식(code/name) / `ProductSummaryResponse.from` 매핑 위치(category LAZY 로딩 주의 — fetch 또는 @Transactional) / inventory seed productCode↔고정 UUID 카탈로그([[project_seed_product_uuid_catalog]]) / StockInstanceController 권한 page code(inventory.stock-balance 재사용 vs 신규).
