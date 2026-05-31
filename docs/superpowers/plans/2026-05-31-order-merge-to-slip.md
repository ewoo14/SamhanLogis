# 다중 주문 → 단일 출고전표 병합 전환 (D2) 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: 본 repo 는 5-team(BE/FE/Designer/QA/DevOps) 병렬 디스패치 + cycle N=2 패턴([[feedback_multi_agent_team_pattern]])으로 실행한다. 각 Task 는 checkbox(`- [ ]`)로 추적하며, 서비스별로 BE 에이전트에 배분한다.

**Goal:** 같은 거래처의 DRAFT/ON_HOLD 주문 여러 개를 선택해 단일 출고전표로 병합 발행한다.

**Architecture:** 신규 병합 엔드포인트를 양쪽에 추가하고(기존 단일주문 전환 경로 무변경, 회귀 0), slip-service 에 `slip_source_orders`(V30) 조인 테이블로 N:1 헤더 출처를 추적한다. 라인 출처는 기존 `SlipLine.sourceOrderLineId`(V29) 재사용. 재고 reserve→발행→실패 시 release 보상 패턴을 N-주문으로 일반화하며 partner_order_db 단일 트랜잭션으로 원자성 보장.

**Tech Stack:** Spring Boot 3.3 / Java 17 / JPA / Flyway / Testcontainers(실 Postgres) / React 18 + Electron(desktop) / Playwright.

**설계 출처:** `docs/superpowers/specs/2026-05-31-order-merge-to-slip-design.md` (결정 D-MRG-01~05).

---

## File Structure

### slip-service (먼저 배포)
- Create: `services/slip-service/src/main/resources/db/migration/V30__create_slip_source_orders.sql`
- Create: `services/slip-service/src/main/java/com/samhanair/logis/slip/domain/SlipSourceOrder.java`
- Create: `services/slip-service/src/main/java/com/samhanair/logis/slip/repository/SlipSourceOrderRepository.java`
- Create: `services/slip-service/src/main/java/com/samhanair/logis/slip/publish/PublishFromOrdersMergeRequest.java`
- Create: `services/slip-service/src/main/java/com/samhanair/logis/slip/publish/SourceOrderRef.java`
- Modify: `services/slip-service/src/main/java/com/samhanair/logis/slip/publish/SlipPublishService.java` (publishFromOrdersMerge 추가 + 공통부 추출 + findBySource UNION)
- Modify: `services/slip-service/src/main/java/com/samhanair/logis/slip/web/SlipPublishController.java` (`POST /from-orders-merge`)
- Modify: `services/slip-service/src/main/java/com/samhanair/logis/slip/repository/SlipRepository.java` (병합 전표 source 조회용 쿼리)
- Test: `services/slip-service/src/test/java/com/samhanair/logis/slip/publish/SlipPublishMergeIT.java`

### partner-order-service (이후 배포)
- Create: `services/partner-order-service/src/main/java/com/samhanair/logis/partnerorder/web/dto/MergeConvertToSlipRequest.java`
- Create: `services/partner-order-service/src/main/java/com/samhanair/logis/partnerorder/web/dto/MergeConvertResultResponse.java`
- Create: `services/partner-order-service/src/main/java/com/samhanair/logis/partnerorder/service/PartnerOrderMergeConvertService.java`
- Modify: `services/partner-order-service/src/main/java/com/samhanair/logis/partnerorder/web/PartnerOrderConvertController.java` (`POST /convert-to-slip-merge`)
- Modify: `services/partner-order-service/src/main/java/com/samhanair/logis/partnerorder/client/SlipServiceClient.java` (publishFromOrdersMerge 추가)
- Test: `services/partner-order-service/src/test/java/com/samhanair/logis/partnerorder/it/PartnerOrderMergeConvertIT.java`
- Test: `services/partner-order-service/src/test/java/com/samhanair/logis/partnerorder/service/PartnerOrderMergeConvertServiceTest.java`

### desktop (FE)
- Modify: `clients/desktop/src/renderer/api/sales.ts` (mergeConvertToSlip API)
- Modify: `clients/desktop/src/renderer/routes/SalesPartnerOrderListPage.tsx` (체크박스 다중선택 + 병합 버튼)
- Create: `clients/desktop/src/renderer/routes/components/MergeConvertDialog.tsx` (병합 모달)
- Test: `clients/desktop/playwright/d2-order-merge/d2-order-merge.spec.ts`

---

## Phase 1 — slip-service (BE 에이전트 #1)

### Task 1: V30 마이그레이션 — slip_source_orders 테이블

**Files:**
- Create: `services/slip-service/src/main/resources/db/migration/V30__create_slip_source_orders.sql`

- [ ] **Step 1: 마이그레이션 SQL 작성**

```sql
-- V30: 다중 주문 → 단일 출고전표 병합 N:1 출처추적 (Phase 2.6b D2)
-- 단일주문 전환은 slip.source_id 그대로 사용하며 이 테이블에 기록하지 않는다(회귀 0).
CREATE TABLE slip_source_orders (
    id               UUID PRIMARY KEY,
    slip_id          UUID NOT NULL REFERENCES slips(id),
    partner_order_id UUID NOT NULL,
    order_no         VARCHAR(64) NOT NULL,
    created_at       TIMESTAMP NOT NULL,
    created_by       VARCHAR(255),
    updated_at       TIMESTAMP NOT NULL,
    updated_by       VARCHAR(255),
    deleted_at       TIMESTAMP,
    deleted_by       VARCHAR(255),
    is_deleted       BOOLEAN NOT NULL DEFAULT FALSE
);
CREATE INDEX ix_slip_source_orders_slip  ON slip_source_orders(slip_id);
CREATE INDEX ix_slip_source_orders_order ON slip_source_orders(partner_order_id);

COMMENT ON TABLE slip_source_orders IS '병합 발행 전표의 출처 주문 N:1 추적 (Phase 2.6b D2)';
```

- [ ] **Step 2: 검증 — Flyway validate**

Run: `./gradlew :services:slip-service:flywayValidate` (또는 컨테이너 기동 시 자동 검증)
Expected: V30 인식, 기존 V29 까지 checksum 정합.

- [ ] **Step 3: Commit**

```bash
git add services/slip-service/src/main/resources/db/migration/V30__create_slip_source_orders.sql
git commit -m "feat(slip): V30 slip_source_orders 병합 출처추적 테이블 (D2)"
```

### Task 2: SlipSourceOrder 엔티티 + 리포지토리

**Files:**
- Create: `services/slip-service/src/main/java/com/samhanair/logis/slip/domain/SlipSourceOrder.java`
- Create: `services/slip-service/src/main/java/com/samhanair/logis/slip/repository/SlipSourceOrderRepository.java`

- [ ] **Step 1: 엔티티 작성** (BaseEntity 7 audit + Soft Delete 컨벤션 정합, 정적 팩토리)

```java
package com.samhanair.logis.slip.domain;

import com.samhanair.logis.common.entity.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.util.UUID;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.SQLRestriction;
import org.hibernate.annotations.UuidGenerator;

/**
 * 병합 발행 전표(Slip)의 출처 주문 N:1 추적 — Phase 2.6b D2 (V30).
 *
 * <p>여러 partner-order 를 단일 출고전표로 병합 발행할 때, 각 출처 주문을 1행씩 기록한다.
 * 단일주문 전환 경로는 {@code slip.source_id} 만 사용하며 이 테이블에 기록하지 않는다(회귀 0).
 * slip_id 는 같은 slip 의 여러 행을 가질 수 있고, partner_order_id 는 어느 주문에서 발행됐는지
 * 역조회(findBySource 보조)에 쓰인다.
 */
@Entity
@Getter
@Table(name = "slip_source_orders")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@SQLRestriction("is_deleted = false")
public class SlipSourceOrder extends BaseEntity {

    @Id
    @GeneratedValue
    @UuidGenerator
    @Column(name = "id", updatable = false, nullable = false)
    private UUID id;

    @Column(name = "slip_id", nullable = false)
    private UUID slipId;

    @Column(name = "partner_order_id", nullable = false)
    private UUID partnerOrderId;

    @Column(name = "order_no", nullable = false, length = 64)
    private String orderNo;

    private SlipSourceOrder(UUID slipId, UUID partnerOrderId, String orderNo) {
        if (slipId == null) {
            throw new IllegalArgumentException("slipId 필수");
        }
        if (partnerOrderId == null) {
            throw new IllegalArgumentException("partnerOrderId 필수");
        }
        if (orderNo == null || orderNo.isBlank()) {
            throw new IllegalArgumentException("orderNo 필수");
        }
        this.slipId = slipId;
        this.partnerOrderId = partnerOrderId;
        this.orderNo = orderNo;
    }

    /**
     * 출처 주문 1건 기록 생성.
     *
     * @param slipId 병합 발행된 전표 UUID
     * @param partnerOrderId 출처 주문 UUID
     * @param orderNo 출처 주문번호 (사용자 노출 식별자)
     * @return 영속화 전 인스턴스
     */
    public static SlipSourceOrder of(UUID slipId, UUID partnerOrderId, String orderNo) {
        return new SlipSourceOrder(slipId, partnerOrderId, orderNo);
    }
}
```

- [ ] **Step 2: 리포지토리 작성**

```java
package com.samhanair.logis.slip.repository;

import com.samhanair.logis.slip.domain.SlipSourceOrder;
import java.util.List;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

/** 병합 출처 주문 N:1 추적 리포지토리 — Phase 2.6b D2. */
public interface SlipSourceOrderRepository extends JpaRepository<SlipSourceOrder, UUID> {

    /** 특정 전표의 출처 주문 전체. */
    List<SlipSourceOrder> findAllBySlipIdAndIsDeletedFalse(UUID slipId);

    /** 특정 출처 주문이 병합된 전표 ID 목록 (findBySource 보조). */
    List<SlipSourceOrder> findAllByPartnerOrderIdAndIsDeletedFalse(UUID partnerOrderId);
}
```

- [ ] **Step 3: 컴파일 검증**

Run: `./gradlew :services:slip-service:compileJava`
Expected: BUILD SUCCESSFUL

- [ ] **Step 4: Commit**

```bash
git add services/slip-service/src/main/java/com/samhanair/logis/slip/domain/SlipSourceOrder.java services/slip-service/src/main/java/com/samhanair/logis/slip/repository/SlipSourceOrderRepository.java
git commit -m "feat(slip): SlipSourceOrder 엔티티/리포지토리 (D2)"
```

### Task 3: 병합 발행 요청 DTO

**Files:**
- Create: `services/slip-service/src/main/java/com/samhanair/logis/slip/publish/SourceOrderRef.java`
- Create: `services/slip-service/src/main/java/com/samhanair/logis/slip/publish/PublishFromOrdersMergeRequest.java`

- [ ] **Step 1: SourceOrderRef 작성**

```java
package com.samhanair.logis.slip.publish;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/**
 * 병합 발행 시 출처 주문 1건 참조 — Phase 2.6b D2.
 *
 * @param partnerOrderId 출처 주문 UUID (문자열)
 * @param orderNo 출처 주문번호 (사용자 노출 식별자)
 */
public record SourceOrderRef(
        @NotBlank @Size(max = 64) String partnerOrderId,
        @NotBlank @Size(max = 64) String orderNo) {
}
```

- [ ] **Step 2: PublishFromOrdersMergeRequest 작성** (기존 `PublishFromPartnerOrderRequest` 헤더 필드 + sourceOrders 추가, partnerOrderId 단일 필드 제거)

```java
package com.samhanair.logis.slip.publish;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.Size;
import java.util.List;

/**
 * 다중 주문 → 단일 출고전표 병합 발행 요청 — Phase 2.6b D2.
 *
 * <p>endpoint: {@code POST /api/v1/slips/from-orders-merge}
 *
 * <p>{@link PublishFromPartnerOrderRequest} 와 헤더 매핑은 동일하나 차이점:
 * <ul>
 *   <li>단일 {@code partnerOrderId} 대신 {@code sourceOrders} 목록(N:1) — slip_source_orders 기록</li>
 *   <li>{@code partnerCode} 는 단일(병합 전제 — partner-order-service 가 동일성 검증 후 호출)</li>
 *   <li>헤더(shippingAddress/receiverPhone/paymentDueLabel/discountInfo/memo)는 호출자가 '/' 병기 확정한 최종값</li>
 * </ul>
 */
public record PublishFromOrdersMergeRequest(
        @NotEmpty @Valid List<SourceOrderRef> sourceOrders,
        String ioDate,
        @Size(max = 100) String partnerCode,
        @Size(max = 100) String partnerName,
        @Size(max = 50) String employeeCode,
        @NotBlank @Size(max = 50) String warehouseCode,
        @Size(max = 36) String warehouseId,
        @Size(max = 500) String shippingAddress,
        @Size(max = 100) String receiverPhone,
        @Size(max = 500) String memo,
        @Size(max = 200) String paymentDueLabel,
        @Size(max = 200) String discountInfo,
        @NotEmpty @Valid List<PublishLineRequest> lines) {
}
```

- [ ] **Step 3: 컴파일 + Commit**

Run: `./gradlew :services:slip-service:compileJava`
```bash
git add services/slip-service/src/main/java/com/samhanair/logis/slip/publish/SourceOrderRef.java services/slip-service/src/main/java/com/samhanair/logis/slip/publish/PublishFromOrdersMergeRequest.java
git commit -m "feat(slip): 병합 발행 요청 DTO (D2)"
```

### Task 4: SlipPublishService.publishFromOrdersMerge + 공통부 추출

**Files:**
- Modify: `services/slip-service/src/main/java/com/samhanair/logis/slip/publish/SlipPublishService.java`

- [ ] **Step 1: 실패 테스트 작성** (Testcontainers IT — Task 8 에서 통합 작성하되, 본 단계에서 핵심 happy-path 먼저)

`SlipPublishMergeIT` 에 다음 케이스 (Task 8 에서 확장):
```java
@Test
void 두_주문을_단일_전표로_병합_발행하고_slip_source_orders_2행을_기록한다() {
    PublishFromOrdersMergeRequest req = new PublishFromOrdersMergeRequest(
            List.of(new SourceOrderRef(ORDER_A_ID.toString(), "2026/05/31-1"),
                    new SourceOrderRef(ORDER_B_ID.toString(), "2026/05/31-2")),
            "20260531", "P0001", "거래처A", null, "HQ-001", WAREHOUSE_UUID.toString(),
            "서울/부산", null, null, null, null,
            List.of(line("MODEL-1", "1"), line("MODEL-2", "2")));

    PublishSlipResponse res = slipPublishService.publishFromOrdersMerge(req, "MRG-TEST-1", "system");

    assertThat(res.slipNo()).isNotBlank();
    List<SlipSourceOrder> sources = sourceOrderRepository.findAllBySlipIdAndIsDeletedFalse(res.id());
    assertThat(sources).hasSize(2);
    assertThat(sources).extracting(SlipSourceOrder::getOrderNo)
            .containsExactlyInAnyOrder("2026/05/31-1", "2026/05/31-2");
}
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `./gradlew :services:slip-service:test --tests "*SlipPublishMergeIT*"`
Expected: FAIL — `publishFromOrdersMerge` 메서드 미존재 (컴파일 에러).

- [ ] **Step 3: 공통부 추출 + publishFromOrdersMerge 구현**

`SlipPublishService` 에 추가. 기존 `publishFromPartnerOrder` 의 흐름을 복사하되 출처 기록 차이만 적용한다. (기존 메서드는 무변경 — 회귀 0.) `sourceOrderRepository` 의존성 추가.

```java
    private final SlipSourceOrderRepository sourceOrderRepository;  // 생성자 주입 추가

    /**
     * 다중 주문 → 단일 출고전표 병합 발행 — Phase 2.6b D2.
     *
     * <p>{@link #publishFromPartnerOrder} 와 동일한 헤더/라인/채번/SENT 불변 전이/audit 흐름을
     * 따르되 차이점:
     * <ul>
     *   <li>{@code Slip.assignPublishSource(PARTNER_ORDER, primaryOrderId, key)} — 대표(첫) 주문</li>
     *   <li>{@code slip_source_orders} N행 INSERT — 전체 출처 주문 추적</li>
     *   <li>fingerprint = 정렬된 sourceOrders + lines 기준</li>
     * </ul>
     *
     * @param req 병합 발행 요청
     * @param idempotencyKey Idempotency-Key (null/blank 가능)
     * @param requesterId 호출자 user-id
     * @return 발행 결과 + replay 여부
     * @throws BusinessException(CONFLICT) 같은 키 + 다른 본문
     */
    public PublishSlipResponse publishFromOrdersMerge(PublishFromOrdersMergeRequest req,
                                                      String idempotencyKey, String requesterId) {
        String fingerprint = computeMergeFingerprint(req);

        Optional<Slip> existing = lookupByIdempotencyKey(idempotencyKey);
        if (existing.isPresent()) {
            return assertReplayOrConflict(existing.get(), fingerprint);
        }

        verifyPartnerOrThrow(req.partnerCode());

        UUID warehouseId = resolveWarehouseId(req.warehouseId(), req.warehouseCode());
        LocalDate slipDate = parseIoDate(req.ioDate());
        String memo = preserveFreeMemo(req.memo());
        String requester = pickRequester(req.employeeCode(), requesterId);

        ResolvedLines resolved = resolveLines(req.lines());

        String slipNo = slipNumberService.next(slipDate, SlipType.OUTBOUND);
        int seqNo = slipNumberService.extractSeqNo(slipNo);
        Slip slip = Slip.createOutbound(slipNo, slipDate, seqNo,
                warehouseId, null, null, req.partnerName(), null, memo, requester);
        for (SlipLine line : resolved.toEntityLines(slip)) {
            slip.addLine(line);
        }
        // 대표(첫) 주문을 source_id 로 — N:1 진실은 slip_source_orders.
        String primaryOrderId = req.sourceOrders().get(0).partnerOrderId();
        slip.assignPublishSource(SlipSourceType.PARTNER_ORDER, primaryOrderId, idempotencyKey);

        slip.applyEcountSchema(
                IO_TYPE_OUTBOUND, pickTimeDate(null),
                null, null, null,
                req.shippingAddress(), null, req.receiverPhone(),
                req.paymentDueLabel(), req.discountInfo(),
                null, null);
        if (req.partnerCode() != null && !req.partnerCode().isBlank()) {
            slip.setPartnerCode(req.partnerCode().trim());
        }

        Slip saved;
        try {
            saved = slipRepository.saveAndFlush(slip);
        } catch (DataIntegrityViolationException ex) {
            return handleIdempotencyRaceCondition(idempotencyKey, fingerprint, ex);
        }

        // 출처 주문 N행 기록
        for (SourceOrderRef ref : req.sourceOrders()) {
            sourceOrderRepository.save(SlipSourceOrder.of(
                    saved.getId(), UUID.fromString(ref.partnerOrderId()), ref.orderNo()));
        }

        // Phase 2.6c: PARTNER_ORDER 전환 전표 발행 즉시 불변 (DRAFT→SAVED→SENT)
        if (SlipSourceType.PARTNER_ORDER.equals(saved.getSourceType())) {
            saved.save();
            saved.send();
            saved = slipRepository.saveAndFlush(saved);
        }

        String dcSnapshot = serializeDiscount(req.discountInfo(), req.paymentDueLabel());
        SlipPublishAudit audit = SlipPublishAudit.create(saved.getId(), SlipSourceType.PARTNER_ORDER,
                primaryOrderId, idempotencyKey,
                resolved.totalSupplyAmount, resolved.totalVatAmount, dcSnapshot, fingerprint);
        auditRepository.save(audit);

        log.info("[D2] 병합 발행 완료 — {}개 주문 → slip {} (idem={})",
                req.sourceOrders().size(), saved.getSlipNo(), idempotencyKey);
        return PublishSlipResponse.created(saved);
    }

    private String computeMergeFingerprint(PublishFromOrdersMergeRequest req) {
        Map<String, Object> canonical = new LinkedHashMap<>();
        canonical.put("kind", "ORDERS_MERGE");
        canonical.put("sourceOrders", req.sourceOrders().stream()
                .map(SourceOrderRef::partnerOrderId).sorted().toList());
        canonical.put("ioDate", req.ioDate());
        canonical.put("warehouseCode", req.warehouseCode());
        canonical.put("partnerCode", req.partnerCode());
        canonical.put("paymentDueLabel", req.paymentDueLabel());
        canonical.put("discountInfo", req.discountInfo());
        canonical.put("memo", req.memo());
        canonical.put("lines", req.lines().stream().map(this::canonicalLine).toList());
        return sha256(toJsonOrThrow(canonical));
    }
```

- [ ] **Step 4: 테스트 통과 확인** (Task 8 IT 환경 준비 후) — 본 단계는 컴파일까지

Run: `./gradlew :services:slip-service:compileJava :services:slip-service:compileTestJava`
Expected: BUILD SUCCESSFUL

- [ ] **Step 5: Commit**

```bash
git add services/slip-service/src/main/java/com/samhanair/logis/slip/publish/SlipPublishService.java
git commit -m "feat(slip): publishFromOrdersMerge 병합 발행 서비스 (D2)"
```

### Task 5: findBySource UNION 확장 (비대표 주문 조회 누락 방지)

**Files:**
- Modify: `services/slip-service/src/main/java/com/samhanair/logis/slip/publish/SlipPublishService.java` (findBySource)

- [ ] **Step 1: 실패 테스트** (Task 8 IT 에 포함)

```java
@Test
void 병합전표는_비대표_출처주문으로_조회해도_findBySource로_잡힌다() {
    // ORDER_B 가 비대표(sourceOrders[1]) — slip.sourceId 에는 ORDER_A 만 들어감
    PublishSlipResponse merged = slipPublishService.publishFromOrdersMerge(mergeReqAB(), "MRG-2", "system");
    List<PublishSlipResponse> bySourceB =
            slipPublishService.findBySource(SlipSourceType.PARTNER_ORDER, ORDER_B_ID.toString());
    assertThat(bySourceB).extracting(PublishSlipResponse::slipNo).contains(merged.slipNo());
}
```

- [ ] **Step 2: findBySource 확장 구현**

```java
    @Transactional(readOnly = true)
    public List<PublishSlipResponse> findBySource(SlipSourceType sourceType, String sourceId) {
        if (sourceType == null) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "sourceType 은 필수입니다");
        }
        if (sourceId == null || sourceId.isBlank()) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "sourceId 는 필수입니다");
        }
        // 1) 기존: slip.source_id 직접 매칭 (단일주문 + 병합 대표 주문)
        java.util.LinkedHashMap<UUID, Slip> byId = new java.util.LinkedHashMap<>();
        slipRepository.findAllBySourceTypeAndSourceIdAndIsDeletedFalse(sourceType, sourceId)
                .forEach(s -> byId.put(s.getId(), s));
        // 2) 병합 비대표 주문 — slip_source_orders 역조회 (PARTNER_ORDER 한정)
        if (sourceType == SlipSourceType.PARTNER_ORDER) {
            try {
                UUID orderId = UUID.fromString(sourceId);
                sourceOrderRepository.findAllByPartnerOrderIdAndIsDeletedFalse(orderId)
                        .forEach(so -> slipRepository.findById(so.getSlipId())
                                .filter(s -> !s.isDeleted())
                                .ifPresent(s -> byId.putIfAbsent(s.getId(), s)));
            } catch (IllegalArgumentException ignored) {
                // sourceId 가 UUID 형식이 아니면(estimate 번호 등) 역조회 skip
            }
        }
        return byId.values().stream().map(PublishSlipResponse::replay).toList();
    }
```
> 주의: `Slip.isDeleted()` getter 존재 확인. 없으면 `slipRepository.findByIdAndIsDeletedFalse` 류로 대체.

- [ ] **Step 3: 컴파일 + Commit**

Run: `./gradlew :services:slip-service:compileJava`
```bash
git add services/slip-service/src/main/java/com/samhanair/logis/slip/publish/SlipPublishService.java
git commit -m "feat(slip): findBySource 병합 비대표 주문 역조회 확장 (D2)"
```

### Task 6: 컨트롤러 엔드포인트 `POST /from-orders-merge`

**Files:**
- Modify: `services/slip-service/src/main/java/com/samhanair/logis/slip/web/SlipPublishController.java`

- [ ] **Step 1: 엔드포인트 추가** (기존 `from-partner-order` 와 동일 권한/응답코드 매트릭스)

```java
    @Operation(summary = "다중 주문 → 출고전표 병합 발행",
            description = "여러 partner-order 를 단일 출고전표로 병합 발행 (Phase 2.6b D2).")
    @PostMapping("/from-orders-merge")
    @RequirePermission(page = "slip.publish.from-partner-order",
            action = com.samhanair.logis.security.permission.PermissionAction.CREATE)
    public ResponseEntity<ApiResponse<PublishSlipResponse>> publishFromOrdersMerge(
            @Valid @RequestBody PublishFromOrdersMergeRequest request,
            @RequestHeader(value = IDEMPOTENCY_HEADER, required = false) String idempotencyKey,
            @RequestHeader(value = CALLER_HEADER, required = false) String callerHeader) {
        PublishSlipResponse response = slipPublishService.publishFromOrdersMerge(
                request, normalizeKey(idempotencyKey), callerOrSystem(callerHeader));
        HttpStatus status = response.idempotentReplay() ? HttpStatus.OK : HttpStatus.CREATED;
        return ResponseEntity.status(status).body(ApiResponse.ok(response));
    }
```
> import 추가: `com.samhanair.logis.slip.publish.PublishFromOrdersMergeRequest`.

- [ ] **Step 2: 컴파일 + Commit**

Run: `./gradlew :services:slip-service:compileJava`
```bash
git add services/slip-service/src/main/java/com/samhanair/logis/slip/web/SlipPublishController.java
git commit -m "feat(slip): POST /from-orders-merge 병합 발행 엔드포인트 (D2)"
```

### Task 7: slip-service IT (실 Postgres)

**Files:**
- Create: `services/slip-service/src/test/java/com/samhanair/logis/slip/publish/SlipPublishMergeIT.java`

- [ ] **Step 1: IT 작성** — 기존 `SlipPublishControllerIT` / `SlipPublishWarehouseIdIT` 패턴 따름. 외부 client(`ProductClient`/`PartnerInternalClient`/`WarehouseCodeMapper`) `@MockBean` 격리 + lenient setup([[feedback_it_mockbean_external_clients]]).

케이스:
1. 2주문 병합 발행 → slipNo 발급 + slip_source_orders 2행.
2. 헤더 '/'병기(shippingAddress="서울/부산") 그대로 저장 확인.
3. 멱등 재시도(같은 키+같은 본문) → 동일 slipNo replay.
4. 같은 키+다른 본문 → 409.
5. findBySource(비대표 ORDER_B) → 병합 전표 포함.
6. 발행 후 slip.status == SENT (불변).

- [ ] **Step 2: 실행** Run: `./gradlew :services:slip-service:test --tests "*SlipPublishMergeIT*"` Expected: PASS, skipped=0.

- [ ] **Step 3: Commit**

```bash
git add services/slip-service/src/test/java/com/samhanair/logis/slip/publish/SlipPublishMergeIT.java
git commit -m "test(slip): 병합 발행 IT 6종 (D2)"
```

---

## Phase 2 — partner-order-service (BE 에이전트 #2)

### Task 8: 병합 요청/응답 DTO

**Files:**
- Create: `services/partner-order-service/src/main/java/com/samhanair/logis/partnerorder/web/dto/MergeConvertToSlipRequest.java`
- Create: `services/partner-order-service/src/main/java/com/samhanair/logis/partnerorder/web/dto/MergeConvertResultResponse.java`

- [ ] **Step 1: MergeConvertToSlipRequest 작성**

```java
package com.samhanair.logis.partnerorder.web.dto;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import java.util.List;
import java.util.UUID;

/**
 * 다중 주문 병합 전환 요청 — Phase 2.6b D2.
 *
 * <p>{@code POST /api/v1/partner-orders/convert-to-slip-merge} 본문.
 * 여러 주문의 선택 라인을 단일 출고전표로 병합 발행한다. 모든 주문은 같은 거래처여야 한다.
 * shippingInfo 는 FE 가 충돌 헤더를 '/' 병기/선택 확정한 최종값.
 */
public record MergeConvertToSlipRequest(
        @NotNull @NotEmpty @Valid List<OrderItems> orders,
        String warehouseCode,
        @Valid ShippingInfo shippingInfo) {

    /** 주문 1건 + 선택 라인들. */
    public record OrderItems(
            @NotNull UUID partnerOrderId,
            @NotNull @NotEmpty @Valid List<Item> items) {}

    /** 라인별 전환 항목. */
    public record Item(
            @NotNull UUID orderLineId,
            @NotNull @Min(1) Integer quantity) {}

    /** FE 확정 병합 헤더 (모두 선택). */
    public record ShippingInfo(
            String partnerName,
            String shippingAddress,
            String receiverPhone,
            String paymentDueLabel,
            String discountInfo,
            String memo) {}
}
```

- [ ] **Step 2: MergeConvertResultResponse 작성**

```java
package com.samhanair.logis.partnerorder.web.dto;

import java.util.List;

/**
 * 병합 전환 결과 — Phase 2.6b D2.
 *
 * @param slipNo 발급된 단일 출고전표 번호
 * @param convertedOrders 전환된 주문별 상태
 */
public record MergeConvertResultResponse(String slipNo, List<OrderResult> convertedOrders) {

    /**
     * @param partnerOrderId 주문 UUID 문자열
     * @param status 전환 후 주문 status
     * @param fullyConverted 전 라인 전량 전환 여부
     */
    public record OrderResult(String partnerOrderId, String status, boolean fullyConverted) {}
}
```

- [ ] **Step 3: 컴파일 + Commit**

Run: `./gradlew :services:partner-order-service:compileJava`
```bash
git add services/partner-order-service/src/main/java/com/samhanair/logis/partnerorder/web/dto/MergeConvertToSlipRequest.java services/partner-order-service/src/main/java/com/samhanair/logis/partnerorder/web/dto/MergeConvertResultResponse.java
git commit -m "feat(partner-order): 병합 전환 요청/응답 DTO (D2)"
```

### Task 9: SlipServiceClient.publishFromOrdersMerge

**Files:**
- Modify: `services/partner-order-service/src/main/java/com/samhanair/logis/partnerorder/client/SlipServiceClient.java`

- [ ] **Step 1: 메서드 추가** (기존 `publishFromPartnerOrder` 와 동일 헤더/응답 분기, URI 만 `/from-orders-merge`)

```java
    /**
     * slip-service 에 다중 주문 병합 발행을 요청한다 — Phase 2.6b D2.
     * 응답 분기는 {@link #publishFromPartnerOrder} 와 동일(200/409 성공, 5xx 예외).
     *
     * @param requestPayload 병합 발행 본문 (sourceOrders + lines + 헤더)
     * @param idempotencyKey {@code PO-MRG-...} 결정적 키
     * @return PublishResult
     * @throws BusinessException(INTERNAL_ERROR) slip-service 5xx / 연결 실패
     */
    public PublishResult publishFromOrdersMerge(Map<String, Object> requestPayload,
                                                String idempotencyKey) {
        if (requestPayload == null || requestPayload.isEmpty()) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "requestPayload 비어있음");
        }
        if (idempotencyKey == null || idempotencyKey.isBlank()) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "idempotencyKey 필수");
        }
        try {
            ResponseEntity<Map<String, Object>> response = restClient.post()
                    .uri("/api/v1/slips/from-orders-merge")
                    .header(INTERNAL_TOKEN_HEADER, requireToken())
                    .header(USER_ROLE_HEADER, INTERNAL_ROLE)
                    .header(USER_ID_HEADER, INTERNAL_CALLER_ID)
                    .header(IDEMPOTENCY_HEADER, idempotencyKey)
                    .contentType(MediaType.APPLICATION_JSON)
                    .body(requestPayload)
                    .retrieve()
                    .onStatus(HttpStatusCode::is5xxServerError, (req, res) -> {
                        throw new BusinessException(ErrorCode.INTERNAL_ERROR,
                                "slip-service 5xx: " + res.getStatusCode());
                    })
                    .onStatus(s -> s.is4xxClientError() && s.value() != 409, (req, res) -> {
                        throw new BusinessException(ErrorCode.INVALID_INPUT,
                                "slip-service 4xx: " + res.getStatusCode());
                    })
                    .onStatus(s -> s.value() == 409, (req, res) -> { /* no-op, allow body parse */ })
                    .toEntity(new ParameterizedTypeReference<Map<String, Object>>() {});
            String slipNo = extractSlipNo(response.getBody());
            if (slipNo == null || slipNo.isBlank()) {
                throw new BusinessException(ErrorCode.INTERNAL_ERROR, "slip-service 응답에 slipNo 누락");
            }
            return response.getStatusCode().value() == 409
                    ? PublishResult.duplicate(slipNo) : PublishResult.published(slipNo);
        } catch (BusinessException ex) {
            throw ex;
        } catch (RuntimeException ex) {
            log.error("SlipServiceClient merge publish failed (idemKey={}): {}", idempotencyKey, ex.getMessage());
            throw new BusinessException(ErrorCode.INTERNAL_ERROR, "slip-service 병합 호출 실패", ex);
        }
    }
```

- [ ] **Step 2: 컴파일 + Commit**

Run: `./gradlew :services:partner-order-service:compileJava`
```bash
git add services/partner-order-service/src/main/java/com/samhanair/logis/partnerorder/client/SlipServiceClient.java
git commit -m "feat(partner-order): SlipServiceClient.publishFromOrdersMerge (D2)"
```

### Task 10: PartnerOrderMergeConvertService (오케스트레이션)

**Files:**
- Create: `services/partner-order-service/src/main/java/com/samhanair/logis/partnerorder/service/PartnerOrderMergeConvertService.java`

- [ ] **Step 1: 단위 테스트 작성** (도메인 검증 — partnerCode 불일치 409)

`PartnerOrderMergeConvertServiceTest` (Mockito):
```java
@Test
void 서로_다른_거래처_주문을_병합하면_409() {
    // order A: partnerCode=P1, order B: partnerCode=P2
    when(orderRepository.findById(A)).thenReturn(Optional.of(orderWithPartner("P1")));
    when(orderRepository.findById(B)).thenReturn(Optional.of(orderWithPartner("P2")));
    MergeConvertToSlipRequest req = reqFor(A, B);
    assertThatThrownBy(() -> service.convertMerge(req, null, null))
            .isInstanceOf(ResponseStatusException.class)
            .satisfies(e -> assertThat(((ResponseStatusException) e).getStatusCode())
                    .isEqualTo(HttpStatus.CONFLICT));
    verifyNoInteractions(inventoryClient, slipServiceClient);
}
```

- [ ] **Step 2: 실패 확인** Run: `./gradlew :services:partner-order-service:test --tests "*PartnerOrderMergeConvertServiceTest*"` Expected: FAIL (서비스 미존재).

- [ ] **Step 3: 서비스 구현** — 단일 `convert` 의 N-주문 일반화. 같은 `@Transactional`.

```java
package com.samhanair.logis.partnerorder.service;

import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import com.samhanair.logis.partnerorder.client.InventoryClient;
import com.samhanair.logis.partnerorder.client.InventoryClient.ReservationResult;
import com.samhanair.logis.partnerorder.client.SlipServiceClient;
import com.samhanair.logis.partnerorder.client.SlipServiceClient.PublishResult;
import com.samhanair.logis.partnerorder.domain.PartnerOrder;
import com.samhanair.logis.partnerorder.domain.PartnerOrderLine;
import com.samhanair.logis.partnerorder.repository.PartnerOrderRepository;
import com.samhanair.logis.partnerorder.web.dto.MergeConvertResultResponse;
import com.samhanair.logis.partnerorder.web.dto.MergeConvertToSlipRequest;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;
import lombok.RequiredArgsConstructor;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

/**
 * 다중 주문 → 단일 출고전표 병합 전환 서비스 — Phase 2.6b D2.
 *
 * <p>{@link PartnerOrderConvertService}(단일주문) 의 reserve→발행→보상 패턴을 N-주문으로
 * 일반화한다. 같은 거래처(partnerCode) 검증 후 전 주문의 선택 라인을 단일 slip 으로 병합 발행하고,
 * 성공 시 각 주문의 라인 convertedQuantity 를 누적하고 전량 전환 주문을 CONVERTED 로 표시한다.
 *
 * <p>원자성: 한 라인이라도 가용 부족(409) 이면 전체 중단 + 예약 성공분 release 보상(slip 미발행).
 * partner_order_db 단일 DB 이므로 N개 주문 저장이 단일 트랜잭션으로 안전.
 */
@Service
@RequiredArgsConstructor
public class PartnerOrderMergeConvertService {

    private static final Logger log = LoggerFactory.getLogger(PartnerOrderMergeConvertService.class);
    private static final DateTimeFormatter IO_DATE_FMT = DateTimeFormatter.ofPattern("yyyyMMdd");
    private static final String RESERVE_REF_TYPE = "PARTNER_ORDER_MERGE_CONVERT";

    private final PartnerOrderRepository orderRepository;
    private final SlipServiceClient slipServiceClient;
    private final InventoryClient inventoryClient;

    @Transactional
    public MergeConvertResultResponse convertMerge(MergeConvertToSlipRequest req,
                                                   UUID actorId, String actorName) {
        if (req.warehouseCode() == null || req.warehouseCode().isBlank()) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "warehouseCode 는 필수입니다.");
        }

        // 1. 주문 N건 조회 + 전환가능 + 같은 거래처 검증
        List<PartnerOrder> orders = new ArrayList<>();
        String partnerCode = null;
        for (MergeConvertToSlipRequest.OrderItems oi : req.orders()) {
            PartnerOrder order = orderRepository.findById(oi.partnerOrderId())
                    .orElseThrow(() -> new BusinessException(ErrorCode.PARTNER_ORDER_NOT_FOUND,
                            ErrorCode.PARTNER_ORDER_NOT_FOUND.getDefaultMessage()));
            order.requireConvertible();
            if (partnerCode == null) {
                partnerCode = order.getPartnerCode();
            } else if (!partnerCode.equals(order.getPartnerCode())) {
                throw new ResponseStatusException(HttpStatus.CONFLICT,
                        "병합은 같은 거래처 주문만 가능합니다.");
            }
            orders.add(order);
        }

        // 2. 라인 매핑 + 잔여 검증 + payload 라인 빌드
        Map<UUID, PartnerOrder> orderById = orders.stream()
                .collect(Collectors.toMap(PartnerOrder::getId, o -> o));
        List<ReserveTarget> reserveTargets = new ArrayList<>();
        List<Map<String, Object>> payloadLines = new ArrayList<>();
        for (MergeConvertToSlipRequest.OrderItems oi : req.orders()) {
            PartnerOrder order = orderById.get(oi.partnerOrderId());
            Map<UUID, PartnerOrderLine> lineMap = order.getLines().stream()
                    .collect(Collectors.toMap(PartnerOrderLine::getId, l -> l));
            for (MergeConvertToSlipRequest.Item item : oi.items()) {
                PartnerOrderLine line = lineMap.get(item.orderLineId());
                if (line == null) {
                    throw new BusinessException(ErrorCode.PARTNER_ORDER_UPDATE_INVALID_LINE,
                            "주문 라인을 찾을 수 없습니다: " + item.orderLineId());
                }
                if (item.quantity() <= 0 || item.quantity() > line.remainingQuantity()) {
                    throw new ResponseStatusException(HttpStatus.CONFLICT,
                            "전환 수량 오류 (잔여=" + line.remainingQuantity() + ", 요청=" + item.quantity() + ")");
                }
                reserveTargets.add(new ReserveTarget(order, line, item.quantity()));
                Map<String, Object> lp = new LinkedHashMap<>();
                lp.put("productCode", line.getModelName());
                lp.put("productName", line.getProductName());
                lp.put("qty", String.valueOf(item.quantity()));
                lp.put("unitPriceVat", line.getPriceVat());
                lp.put("remarks", line.getRemark());
                lp.put("sourceOrderLineId", line.getId().toString());
                payloadLines.add(lp);
            }
        }

        // 3. 결정적 idempotencyKey / convertKey
        String idempotencyKey = buildIdempotencyKey(reserveTargets);
        UUID convertKeyUuid = buildConvertKeyUuid(reserveTargets);

        // 4. warehouseId 역조회
        UUID warehouseId = inventoryClient.resolveWarehouseIdByCode(req.warehouseCode());

        // 5. 전 라인 reserve (가용부족 409 → 보상 후 중단)
        List<ReserveTarget> reservedActual = new ArrayList<>();
        try {
            for (ReserveTarget t : reserveTargets) {
                ReservationResult r = inventoryClient.reserve(
                        t.line().getProductId(), warehouseId, t.quantity(),
                        RESERVE_REF_TYPE, convertKeyUuid);
                if (!r.alreadyReserved()) {
                    reservedActual.add(t);
                }
            }
        } catch (BusinessException ex) {
            compensate(reservedActual, warehouseId, convertKeyUuid);
            throw ex;
        }

        // 6. slip-service 병합 발행
        MergeConvertToSlipRequest.ShippingInfo si = req.shippingInfo();
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("sourceOrders", orders.stream()
                .map(o -> Map.of("partnerOrderId", o.getId().toString(), "orderNo", o.getOrderNo()))
                .toList());
        payload.put("partnerCode", partnerCode);
        payload.put("partnerName", si != null ? si.partnerName() : null);
        payload.put("warehouseCode", req.warehouseCode());
        payload.put("warehouseId", warehouseId.toString());
        payload.put("ioDate", LocalDate.now().format(IO_DATE_FMT));
        payload.put("shippingAddress", si != null ? si.shippingAddress() : null);
        payload.put("receiverPhone", si != null ? si.receiverPhone() : null);
        payload.put("paymentDueLabel", si != null ? si.paymentDueLabel() : null);
        payload.put("discountInfo", si != null ? si.discountInfo() : null);
        payload.put("memo", si != null ? si.memo() : null);
        payload.put("lines", payloadLines);

        PublishResult result;
        try {
            result = slipServiceClient.publishFromOrdersMerge(payload, idempotencyKey);
        } catch (BusinessException ex) {
            compensate(reservedActual, warehouseId, convertKeyUuid);
            throw ex;
        }

        // 7. converted 누적 + status 갱신 + 저장
        for (ReserveTarget t : reserveTargets) {
            t.line().convert(t.quantity());
        }
        List<MergeConvertResultResponse.OrderResult> results = new ArrayList<>();
        for (PartnerOrder order : orders) {
            order.markConvertedIfComplete();
            results.add(new MergeConvertResultResponse.OrderResult(
                    order.getId().toString(), order.getStatus().name(),
                    order.getLines().stream().allMatch(PartnerOrderLine::isFullyConverted)));
        }
        orderRepository.saveAll(orders);

        log.info("[D2] 병합 전환 완료 — {}개 주문 → slip {}", orders.size(), result.slipNo());
        return new MergeConvertResultResponse(result.slipNo(), results);
    }

    private void compensate(List<ReserveTarget> reserved, UUID warehouseId, UUID convertKeyUuid) {
        for (ReserveTarget t : reserved) {
            try {
                inventoryClient.release(t.line().getProductId(), warehouseId, t.quantity(),
                        RESERVE_REF_TYPE, convertKeyUuid);
            } catch (Exception ex) {
                log.error("재고 release 보상 실패 (수동 복구) — productId={}, qty={}: {}",
                        t.line().getProductId(), t.quantity(), ex.getMessage());
            }
        }
    }

    private String buildIdempotencyKey(List<ReserveTarget> targets) {
        return "PO-MRG-" + sha256hex(contentHash(targets)).substring(0, 16);
    }

    private UUID buildConvertKeyUuid(List<ReserveTarget> targets) {
        String h = sha256hex(contentHash(targets));
        String u = h.substring(0, 8) + "-" + h.substring(8, 12) + "-" + h.substring(12, 16)
                + "-" + h.substring(16, 20) + "-" + h.substring(20, 32);
        return UUID.fromString(u);
    }

    private String contentHash(List<ReserveTarget> targets) {
        return targets.stream()
                .sorted(Comparator.comparing(t -> t.line().getId().toString()))
                .map(t -> t.order().getId() + ":" + t.line().getId() + ":"
                        + t.line().getConvertedQuantity() + ":" + t.quantity())
                .collect(Collectors.joining(","));
    }

    private static String sha256hex(String raw) {
        try {
            MessageDigest md = MessageDigest.getInstance("SHA-256");
            byte[] d = md.digest(raw.getBytes(java.nio.charset.StandardCharsets.UTF_8));
            StringBuilder sb = new StringBuilder();
            for (byte b : d) {
                sb.append(String.format("%02x", b));
            }
            return sb.toString();
        } catch (NoSuchAlgorithmException ex) {
            throw new IllegalStateException("SHA-256 unavailable", ex);
        }
    }

    private record ReserveTarget(PartnerOrder order, PartnerOrderLine line, int quantity) {}
}
```

- [ ] **Step 4: 테스트 통과 확인** Run: `./gradlew :services:partner-order-service:test --tests "*PartnerOrderMergeConvertServiceTest*"` Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add services/partner-order-service/src/main/java/com/samhanair/logis/partnerorder/service/PartnerOrderMergeConvertService.java services/partner-order-service/src/test/java/com/samhanair/logis/partnerorder/service/PartnerOrderMergeConvertServiceTest.java
git commit -m "feat(partner-order): 병합 전환 오케스트레이션 서비스 + 단위테스트 (D2)"
```

### Task 11: 병합 전환 컨트롤러 엔드포인트

**Files:**
- Modify: `services/partner-order-service/src/main/java/com/samhanair/logis/partnerorder/web/PartnerOrderConvertController.java`

- [ ] **Step 1: 엔드포인트 추가** (권한 기존 `sales.partner-order.convert` CREATE 재사용)

```java
    private final PartnerOrderMergeConvertService mergeConvertService;  // 생성자 주입 추가

    @Operation(summary = "다중 주문 병합 전환",
            description = "같은 거래처의 여러 주문 선택 라인을 단일 출고전표로 병합 발행합니다 (Phase 2.6b D2).")
    @PostMapping("/convert-to-slip-merge")
    @RequirePermission(page = "sales.partner-order.convert", action = PermissionAction.CREATE)
    public ApiResponse<MergeConvertResultResponse> convertMerge(
            @RequestBody @Valid MergeConvertToSlipRequest request,
            @RequestHeader(value = HttpHeaderConstants.CALLER_ID_HEADER, required = false) String actorId,
            @RequestHeader(value = HttpHeaderConstants.CALLER_NAME_HEADER, required = false) String actorName) {
        return ApiResponse.ok(mergeConvertService.convertMerge(request, parseUuid(actorId), actorName));
    }
```
> import: `MergeConvertToSlipRequest`, `MergeConvertResultResponse`, `PartnerOrderMergeConvertService`. `@RequestMapping("/api/v1/partner-orders")` 하위라 경로 충돌 없음(단일은 `/{id}/convert-to-slip`).

- [ ] **Step 2: 컴파일 + Commit**

Run: `./gradlew :services:partner-order-service:compileJava`
```bash
git add services/partner-order-service/src/main/java/com/samhanair/logis/partnerorder/web/PartnerOrderConvertController.java
git commit -m "feat(partner-order): POST /convert-to-slip-merge 엔드포인트 (D2)"
```

### Task 12: partner-order IT (실 Postgres + slip/inventory @MockBean)

**Files:**
- Create: `services/partner-order-service/src/test/java/com/samhanair/logis/partnerorder/it/PartnerOrderMergeConvertIT.java`

- [ ] **Step 1: IT 작성** — 기존 `PartnerOrderConvertIT`/`Phase26cConvertReserveIT` 패턴. `InventoryClient`/`SlipServiceClient` `@MockBean` lenient.

케이스:
1. 2주문(같은 거래처) 병합 → 200 + slipNo + 각 주문 converted_quantity 누적 + 전량 시 CONVERTED.
2. partnerCode 불일치 → 409 + reserve/publish 미호출.
3. 한 라인 가용부족(reserve 409) → 전체 409 + release 보상 호출 + converted 미변경.
4. slip 발행 실패(5xx) → release 보상 + converted 미변경.
5. 멱등 재시도 → 동일 idempotencyKey 전달(captor 단언) + converted 1회만.
6. 잔여 초과 수량 → 409.

- [ ] **Step 2: 실행** Run: `./gradlew :services:partner-order-service:test --tests "*PartnerOrderMergeConvertIT*"` Expected: PASS, skipped=0.

- [ ] **Step 3: Commit**

```bash
git add services/partner-order-service/src/test/java/com/samhanair/logis/partnerorder/it/PartnerOrderMergeConvertIT.java
git commit -m "test(partner-order): 병합 전환 IT 6종 (D2)"
```

---

## Phase 3 — desktop FE (FE 에이전트)

### Task 13: API 클라이언트 mergeConvertToSlip

**Files:**
- Modify: `clients/desktop/src/renderer/api/sales.ts`

- [ ] **Step 1: API 함수 추가** (기존 단일 convertToSlip 패턴 따름, ApiResponse wrapper + JWT)

```typescript
export interface MergeConvertOrderItems {
  partnerOrderId: string;
  items: { orderLineId: string; quantity: number }[];
}
export interface MergeConvertShippingInfo {
  partnerName?: string;
  shippingAddress?: string;
  receiverPhone?: string;
  paymentDueLabel?: string;
  discountInfo?: string;
  memo?: string;
}
export interface MergeConvertResult {
  slipNo: string;
  convertedOrders: { partnerOrderId: string; status: string; fullyConverted: boolean }[];
}

export async function mergeConvertToSlip(
  orders: MergeConvertOrderItems[],
  warehouseCode: string,
  shippingInfo: MergeConvertShippingInfo,
): Promise<MergeConvertResult> {
  const res = await apiClient.post<ApiResponse<MergeConvertResult>>(
    '/api/v1/partner-orders/convert-to-slip-merge',
    { orders, warehouseCode, shippingInfo },
  );
  return res.data.data;
}
```
> 실제 `apiClient`/`ApiResponse` import 경로는 `sales.ts` 기존 코드 패턴에 맞춤.

- [ ] **Step 2: 타입체크 + Commit**

Run: `cd clients/desktop; npm run typecheck`
```bash
git add clients/desktop/src/renderer/api/sales.ts
git commit -m "feat(desktop): mergeConvertToSlip API 클라이언트 (D2)"
```

### Task 14: 주문 목록 다중선택 + 병합 버튼

**Files:**
- Modify: `clients/desktop/src/renderer/routes/SalesPartnerOrderListPage.tsx`

- [ ] **Step 1: 체크박스 다중선택 + 버튼 추가**
  - DataGrid 행 선택(checkboxSelection) — DRAFT/ON_HOLD 행만 선택 가능(isRowSelectable).
  - 선택 행들의 partnerCode 가 모두 동일할 때만 "출고전표로 병합 전환" 버튼 활성. 혼합 시 비활성 + tooltip "같은 거래처만 병합 가능".
  - 버튼 클릭 → `MergeConvertDialog` 오픈(선택 주문 전달).
  - design-system 컴포넌트 우선 재사용. UUID 비공개(주문번호/거래처명만 노출).

- [ ] **Step 2: 타입체크 + Commit**

Run: `cd clients/desktop; npm run typecheck`
```bash
git add clients/desktop/src/renderer/routes/SalesPartnerOrderListPage.tsx
git commit -m "feat(desktop): 주문목록 다중선택 + 병합 버튼 (D2)"
```

### Task 15: 병합 모달 MergeConvertDialog

**Files:**
- Create: `clients/desktop/src/renderer/routes/components/MergeConvertDialog.tsx`

- [ ] **Step 1: 모달 구현**
  - 선택 주문들의 라인 펼침 표시(주문번호 그룹) → 라인별 전환수량 입력(기본 잔여 전량, 잔여 초과 차단).
  - `WarehouseSelector`(필수) 재사용(슬라이스 C 패턴).
  - 헤더 충돌 필드(배송지/납기/수령인 등 주문마다 다른 값) 표시 → 라디오 선택 또는 '/' 병기 텍스트 입력 → `shippingInfo` 확정.
  - "병합 발행" → `mergeConvertToSlip` 호출 → 성공 시 slipNo 안내 토스트 + 목록 invalidate(react-query) + 닫기. 409/오류 피드백.
  - Designer 리뷰 대상: 충돌 헤더 UX, 토큰 정합, 비가역 경고 문구.

- [ ] **Step 2: 타입체크 + Commit**

Run: `cd clients/desktop; npm run typecheck`
```bash
git add clients/desktop/src/renderer/routes/components/MergeConvertDialog.tsx
git commit -m "feat(desktop): 병합 전환 모달 MergeConvertDialog (D2)"
```

### Task 16: Playwright E2E

**Files:**
- Create: `clients/desktop/playwright/d2-order-merge/d2-order-merge.spec.ts`

- [ ] **Step 1: 스펙 작성** — 기존 `phase-2-6a-order-convert.spec.ts` 패턴.
  - 같은 거래처 2주문 선택 → 병합 버튼 활성 → 모달 → 수량/창고/헤더병기 입력 → 발행 → slipNo 노출.
  - 혼합 거래처 선택 → 버튼 비활성 확인.

- [ ] **Step 2: 실행** Run: `cd clients/desktop; npm run test:e2e -- d2-order-merge` Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add clients/desktop/playwright/d2-order-merge/
git commit -m "test(desktop): 병합 전환 Playwright E2E (D2)"
```

---

## Phase 4 — 문서 동기화 + 통합 검증 (PM/TM)

### Task 17: 문서 동기화 ([[feedback_continuous_docs_sync]])

**Files:**
- Modify: `migration/decisions/DECISIONS.md` (D-MRG-01~05 정식화)
- Create: `docs/dev-reports/slice-d2-order-merge-to-slip.md`
- Modify: README / overview.html (해당 시) / slip-service·partner-order-service README

- [ ] **Step 1**: DECISIONS D-MRG-01~05 추가 + dev-report 작성(함수 단위 3-layer, [[feedback_function_documentation]]).
- [ ] **Step 2: Commit**

```bash
git add migration/decisions/DECISIONS.md docs/dev-reports/slice-d2-order-merge-to-slip.md
git commit -m "docs: D2 병합 전환 DECISIONS + dev-report 동기화"
```

### Task 18: PM 통합 풀빌드 가드 ([[feedback_pm_integration_build_check]])

- [ ] **Step 1**: 양 서비스 컴파일 + 테스트 전수
```bash
./gradlew :services:slip-service:test :services:partner-order-service:test
```
Expected: BUILD SUCCESSFUL, skipped=0.
- [ ] **Step 2**: Layer 4 도메인 메서드 의미 정렬 확인(convert/markConvertedIfComplete/assignPublishSource).

### Task 19: Docker 실 QA ([[no-fake-data-ever]])

- [ ] 실 gateway+JWT+렌더러. 같은 거래처 2주문 병합 → 실 화면 캡처 + psql 적중:
  - `slip_source_orders` 2행, `slips.source_id`=대표 주문, `slip_lines.source_order_line_id` 각 라인,
  - 각 `partner_order_lines.converted_quantity` 누적, 전량 주문 status=CONVERTED, slip status=SENT.
- [ ] 증빙 `docs/qa/slice-d2-order-merge/` (실 캡처만, 합성/mock 금지).

---

## Self-Review (작성자 체크)

**1. Spec coverage:**
- §2 D-MRG-01(slip_source_orders) → Task 1·2·4. D-MRG-02(신규 엔드포인트) → Task 6·11. D-MRG-03(FE 헤더 확정) → Task 15. D-MRG-04(원자성) → Task 10·12(케이스 3·4). D-MRG-05(권한 재사용) → Task 11. ✅
- §4.1 findBySource UNION → Task 5. §4.3 fingerprint 병합 기준 → Task 4. §4.4 FE 다중선택/모달 → Task 14·15. §6 테스트 → Task 7·12·16·19. ✅

**2. Placeholder scan:** TBD/TODO 없음. 모든 신규 코드 블록 실 코드 포함. FE Task(14·15·16)는 기존 파일 수정·UX라 단계 설명 + 정확한 API 계약 제시(코드 골격은 Task 13 에 명시).

**3. Type consistency:**
- partner-order `MergeConvertToSlipRequest.OrderItems.partnerOrderId: UUID` ↔ 서비스 `orderRepository.findById(oi.partnerOrderId())` 정합.
- slip `PublishFromOrdersMergeRequest.sourceOrders: List<SourceOrderRef>` ↔ partner-order payload `sourceOrders: [{partnerOrderId, orderNo}]` 키 정합.
- `mergeConvertService.convertMerge(req, UUID, String)` 시그니처 ↔ 컨트롤러 호출 정합.
- `SlipServiceClient.publishFromOrdersMerge(Map, String)` ↔ 서비스 호출 정합.

> ⚠️ 구현 착수 시 확인 필요(검증 후 보정): `Slip.isDeleted()` getter 존재(Task 5) / `PartnerOrderRepository.findById` 가 soft-delete 필터 적용 여부(@SQLRestriction) / `ErrorCode.PARTNER_ORDER_NOT_FOUND`·`PARTNER_ORDER_UPDATE_INVALID_LINE` 존재(단일 convert 에서 사용 확인됨) / `HttpHeaderConstants.CALLER_NAME_HEADER` 상수명.
