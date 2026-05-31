package com.samhanair.logis.inventory.domain;

import com.samhanair.logis.common.entity.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
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
 *
 * <p>에어컨/판넬 등 {@code serial_managed} 카테고리 품목만 인스턴스로 관리.
 * batch 품목(부자재 등)은 기존 {@link StockLot} 유지(무변경).
 *
 * <p>상태 전이 규칙:
 * <pre>
 *   AVAILABLE ─ ship()    → SHIPPED
 *   AVAILABLE ─ reserve() → RESERVED
 *   RESERVED  ─ release() → AVAILABLE
 *   SHIPPED   ─ recall()  → RECALLED
 * </pre>
 * 각 전이 메서드는 선행 상태가 맞지 않으면 {@code 409 CONFLICT} 를 던진다.
 *
 * <p>FIFO 정렬 키 = {@link #receivedAt}. 회수 역-FIFO 근거 = {@link #outboundPartnerCode} + {@link #outboundAt}.
 *
 * <p>{@code @SQLRestriction("is_deleted = false")} 로 soft-delete 자동 필터.
 */
@Entity
@Getter
@Table(name = "stock_instances")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@SQLRestriction("is_deleted = false")
public class StockInstance extends BaseEntity {

    @Id
    @GeneratedValue
    @UuidGenerator
    @Column(name = "id", updatable = false, nullable = false)
    private UUID id;

    /** product-service products.id 논리 참조 (FK 없음 — MSA cross-DB). */
    @Column(name = "product_id", nullable = false)
    private UUID productId;

    /** 품목코드 그룹 스냅샷 — FIFO 인덱스 키. */
    @Column(name = "product_code", nullable = false, length = 50)
    private String productCode;

    /** 현재 위치 창고 UUID. */
    @Column(name = "warehouse_id", nullable = false)
    private UUID warehouseId;

    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false, length = 20)
    private StockInstanceStatus status;

    /** 입고 구분 — 구매/차용. */
    @Column(name = "inbound_type", length = 20)
    private String inboundType;

    /** 입고일시 — FIFO 정렬 키. */
    @Column(name = "received_at", nullable = false)
    private LocalDateTime receivedAt;

    /** 입고 단위 원가. */
    @Column(name = "unit_cost", precision = 15, scale = 2)
    private BigDecimal unitCost;

    /** 입고(구매)전표 번호 — 사용자 표시용 비즈니스 식별자. */
    @Column(name = "inbound_slip_no", length = 64)
    private String inboundSlipNo;

    /** 출고 거래처 코드 — 회수 역-FIFO 근거. */
    @Column(name = "outbound_partner_code", length = 100)
    private String outboundPartnerCode;

    /** 출고(판매)전표 번호 — 사용자 표시용 비즈니스 식별자. */
    @Column(name = "outbound_slip_no", length = 64)
    private String outboundSlipNo;

    /** 출고일시 — 역-FIFO 정렬 키. */
    @Column(name = "outbound_at")
    private LocalDateTime outboundAt;

    /**
     * 내부 생성자 — 정적 팩토리를 통해서만 사용.
     */
    private StockInstance(UUID productId, String productCode, UUID warehouseId,
                          String inboundType, LocalDateTime receivedAt, BigDecimal unitCost,
                          String inboundSlipNo) {
        if (productId == null) {
            throw new IllegalArgumentException("productId 필수");
        }
        if (productCode == null || productCode.isBlank()) {
            throw new IllegalArgumentException("productCode 필수");
        }
        if (warehouseId == null) {
            throw new IllegalArgumentException("warehouseId 필수");
        }
        this.productId = productId;
        this.productCode = productCode;
        this.warehouseId = warehouseId;
        this.status = StockInstanceStatus.AVAILABLE;
        this.inboundType = inboundType;
        this.receivedAt = receivedAt == null ? LocalDateTime.now() : receivedAt;
        this.unitCost = unitCost;
        this.inboundSlipNo = inboundSlipNo;
    }

    /**
     * 입고 정적 팩토리 — 신규 가용 인스턴스 생성(AVAILABLE).
     *
     * @param productId     제품 UUID (product-service 논리 참조)
     * @param productCode   품목코드 그룹 (FIFO 인덱스 키)
     * @param warehouseId   입고 창고 UUID
     * @param inboundType   입고 구분(구매/차용, nullable)
     * @param receivedAt    입고일시 (null 이면 now() 사용)
     * @param unitCost      단위 원가 (nullable)
     * @param inboundSlipNo 입고전표 번호 (nullable)
     * @return AVAILABLE 상태의 신규 StockInstance (영속화 전)
     */
    public static StockInstance inbound(UUID productId, String productCode, UUID warehouseId,
                                        String inboundType, LocalDateTime receivedAt,
                                        BigDecimal unitCost, String inboundSlipNo) {
        return new StockInstance(productId, productCode, warehouseId, inboundType,
                receivedAt, unitCost, inboundSlipNo);
    }

    /**
     * 출고 — AVAILABLE → SHIPPED + 출고처 기록(S3 입출고 연동에서 호출).
     *
     * @param partnerCode    출고 거래처 코드
     * @param outboundSlipNo 출고(판매)전표 번호
     * @param outboundAt     출고일시 (null 이면 now() 사용)
     * @throws ResponseStatusException 409 — 현재 상태가 AVAILABLE 이 아닌 경우
     */
    public void ship(String partnerCode, String outboundSlipNo, LocalDateTime outboundAt) {
        requireStatus(StockInstanceStatus.AVAILABLE, "출고");
        this.status = StockInstanceStatus.SHIPPED;
        this.outboundPartnerCode = partnerCode;
        this.outboundSlipNo = outboundSlipNo;
        this.outboundAt = outboundAt == null ? LocalDateTime.now() : outboundAt;
    }

    /**
     * 회수 — SHIPPED → RECALLED (반품/회차 역-FIFO, S4 연동).
     *
     * @throws ResponseStatusException 409 — 현재 상태가 SHIPPED 이 아닌 경우
     */
    public void recall() {
        requireStatus(StockInstanceStatus.SHIPPED, "회수");
        this.status = StockInstanceStatus.RECALLED;
    }

    /**
     * 예약 — AVAILABLE → RESERVED (2.6c 수량 reserve 통합 후속).
     *
     * @throws ResponseStatusException 409 — 현재 상태가 AVAILABLE 이 아닌 경우
     */
    public void reserve() {
        requireStatus(StockInstanceStatus.AVAILABLE, "예약");
        this.status = StockInstanceStatus.RESERVED;
    }

    /**
     * 예약 해제 — RESERVED → AVAILABLE.
     *
     * @throws ResponseStatusException 409 — 현재 상태가 RESERVED 이 아닌 경우
     */
    public void release() {
        requireStatus(StockInstanceStatus.RESERVED, "예약 해제");
        this.status = StockInstanceStatus.AVAILABLE;
    }

    /**
     * 상태 전이 가드 — 예상 상태와 다르면 409 CONFLICT 를 던진다.
     *
     * @param expected 기대 상태
     * @param action   동작명 (한국어, 오류 메시지에 포함)
     */
    private void requireStatus(StockInstanceStatus expected, String action) {
        if (this.status != expected) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    action + " 불가 — 현재 상태 " + this.status + " (필요 " + expected + ")");
        }
    }
}
