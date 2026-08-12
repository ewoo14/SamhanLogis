package com.samhanair.logis.inventory.domain;

import com.samhanair.logis.common.entity.BaseEntity;
import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
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
 *   RESERVED  ─ ship()    → SHIPPED
 *   RESERVED  ─ release() → AVAILABLE
 *   SHIPPED   ─ recall()  → RECALLED
 *   RECALLED  ─ unrecall()→ SHIPPED
 *   RECALLED  ─ resell()  → AVAILABLE
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

    private static final String SERIAL_CHARSET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
    private static final int SERIAL_RANDOM_LENGTH = 6;
    private static final java.security.SecureRandom SERIAL_RANDOM = new java.security.SecureRandom();

    @Id
    @GeneratedValue
    @UuidGenerator
    @Column(name = "id", updatable = false, nullable = false)
    private UUID id;

    /** UUID와 분리된 사용자 노출용 시리얼키. QR payload도 후속 슬라이스에서 이 값을 사용한다. */
    @Column(name = "serial_key", nullable = false, unique = true, length = 9)
    private String serialKey;

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

    /** 재고상황과 독립된 품질 축. */
    @Enumerated(EnumType.STRING)
    @Column(name = "quality", nullable = false, length = 20)
    private StockInstanceQuality quality;

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

    /** 회수(반품/회차)전표 번호 — S4 멱등 마커. */
    @Column(name = "recall_slip_no", length = 64)
    private String recallSlipNo;

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
        this.serialKey = generateSerialKey();
        this.status = StockInstanceStatus.AVAILABLE;
        this.quality = StockInstanceQuality.NORMAL;
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

    /** 창고 코드와 같은 6자 혼동방지 charset을 사용하는 인스턴스 노출 시리얼키를 생성한다. */
    private static String generateSerialKey() {
        StringBuilder suffix = new StringBuilder(SERIAL_RANDOM_LENGTH);
        for (int i = 0; i < SERIAL_RANDOM_LENGTH; i++) {
            suffix.append(SERIAL_CHARSET.charAt(SERIAL_RANDOM.nextInt(SERIAL_CHARSET.length())));
        }
        return "SI-" + suffix;
    }

    /**
     * 출고 — AVAILABLE/RESERVED → SHIPPED + 출고처 기록(S3 입출고 연동에서 호출).
     *
     * @param partnerCode    출고 거래처 코드
     * @param outboundSlipNo 출고(판매)전표 번호
     * @param outboundAt     출고일시 (null 이면 now() 사용)
     * @throws BusinessException 409 — 현재 상태가 AVAILABLE 또는 RESERVED 가 아닌 경우
     */
    public void ship(String partnerCode, String outboundSlipNo, LocalDateTime outboundAt) {
        if (this.status != StockInstanceStatus.AVAILABLE && this.status != StockInstanceStatus.RESERVED) {
            throw new BusinessException(ErrorCode.CONFLICT,
                    "출고 불가 — 현재 상태 " + this.status.getDisplayName()
                            + " (필요 " + StockInstanceStatus.AVAILABLE.getDisplayName()
                            + " 또는 " + StockInstanceStatus.RESERVED.getDisplayName() + ")");
        }
        this.status = StockInstanceStatus.SHIPPED;
        this.outboundPartnerCode = partnerCode;
        this.outboundSlipNo = outboundSlipNo;
        this.outboundAt = outboundAt == null ? LocalDateTime.now() : outboundAt;
    }

    /** 출고 전 품질을 변경한다. 출고된 인스턴스의 품질은 과거 기록 보존을 위해 잠근다. */
    public void changeQuality(StockInstanceQuality newQuality) {
        if (this.status == StockInstanceStatus.SHIPPED) {
            throw new BusinessException(ErrorCode.CONFLICT,
                    "SHIPPED 인스턴스의 품목 상태는 변경할 수 없습니다.");
        }
        if (newQuality == null) {
            throw new IllegalArgumentException("품목 상태 필수");
        }
        this.quality = newQuality;
    }

    /**
     * 회수 — SHIPPED → RECALLED (반품/회차 역-FIFO, S4 연동).
     *
     * @throws BusinessException 409 — 현재 상태가 SHIPPED 이 아닌 경우
     */
    public void recall() {
        recall(null);
    }

    /**
     * 회수 — SHIPPED → RECALLED + 회수전표 번호 기록.
     *
     * <p>S4 회수연동은 동일 INBOUND RETURN/RETURN_TRIP 전표 재호출 시 추가 회수를 막기 위해
     * {@code recallSlipNo + productCode + RECALLED} 로 멱등 판정한다.
     *
     * @param recallSlipNo 회수 입고전표 번호
     * @throws BusinessException 409 — 현재 상태가 SHIPPED 이 아닌 경우
     */
    public void recall(String recallSlipNo) {
        requireStatus(StockInstanceStatus.SHIPPED, "회수");
        this.status = StockInstanceStatus.RECALLED;
        this.recallSlipNo = recallSlipNo;
    }

    /**
     * 회수 취소 — RECALLED → SHIPPED + 회수전표 마커 제거.
     *
     * <p>OUTBOUND 마커({@code outboundPartnerCode/outboundSlipNo/outboundAt}) 는 유지한다.
     * completeRecallInbound 보상에서 회수만 되돌려 같은 출고처 기준 재회수가 가능해야 하기 때문이다.
     *
     * @throws BusinessException 409 — 현재 상태가 RECALLED 가 아닌 경우
     */
    public void unrecall() {
        requireStatus(StockInstanceStatus.RECALLED, "회수 취소");
        this.status = StockInstanceStatus.SHIPPED;
        this.recallSlipNo = null;
    }

    /**
     * 회수품 재판매 — RECALLED → AVAILABLE + 회수/출고 마커 제거.
     *
     * <p>검수 완료 후 재판매 가능한 재고로 되돌리는 운영자 명시 액션이다.
     * 출고·회수 마커를 모두 지워 신규 가용 재고로 취급하고, {@code receivedAt} 을 현재 시각으로
     * 갱신해 FIFO 소진 순서에 재입고 시점 기준으로 재진입시킨다.
     *
     * @throws BusinessException 409 — 현재 상태가 RECALLED 가 아닌 경우
     */
    public void resell() {
        requireStatus(StockInstanceStatus.RECALLED, "재판매");
        this.status = StockInstanceStatus.AVAILABLE;
        this.recallSlipNo = null;
        this.outboundPartnerCode = null;
        this.outboundSlipNo = null;
        this.outboundAt = null;
        this.receivedAt = LocalDateTime.now();
    }

    /**
     * 예약 — AVAILABLE → RESERVED (2.6c 수량 reserve 통합 후속).
     *
     * @throws BusinessException 409 — 현재 상태가 AVAILABLE 이 아닌 경우
     */
    public void reserve() {
        reserve(null);
    }

    /**
     * 출고 예약 — AVAILABLE → RESERVED + 출고전표 마커 기록.
     *
     * <p>S3 출고연동에서 accept 시점에 어느 OUTBOUND 전표가 인스턴스를 점유했는지
     * {@code outboundSlipNo} 로 기록한다. complete/reject/cancel 경로는 이 마커로 대상을 특정한다.
     *
     * @param outboundSlipNo 출고(판매)전표 번호
     * @throws BusinessException 409 — 현재 상태가 AVAILABLE 이 아닌 경우
     */
    public void reserve(String outboundSlipNo) {
        requireStatus(StockInstanceStatus.AVAILABLE, "예약");
        this.status = StockInstanceStatus.RESERVED;
        this.outboundSlipNo = outboundSlipNo;
    }

    /**
     * 예약 해제 — RESERVED → AVAILABLE + 출고전표 마커 제거.
     *
     * @throws BusinessException 409 — 현재 상태가 RESERVED 이 아닌 경우
     */
    public void release() {
        requireStatus(StockInstanceStatus.RESERVED, "예약 해제");
        this.status = StockInstanceStatus.AVAILABLE;
        this.outboundSlipNo = null;
    }

    /**
     * 상태 전이 가드 — 예상 상태와 다르면 {@link BusinessException}(409 CONFLICT) 를 던진다.
     *
     * <p>도메인 레이어가 Spring Web 에 의존하지 않도록 {@link BusinessException} 사용.
     * {@link com.samhanair.logis.inventory.web.GlobalExceptionHandler} 에서 409 ApiResponse 로 변환.
     *
     * @param expected 기대 상태
     * @param action   동작명 (한국어, 오류 메시지에 포함)
     * @throws BusinessException 409 — 현재 상태가 expected 와 다른 경우
     */
    private void requireStatus(StockInstanceStatus expected, String action) {
        if (this.status != expected) {
            throw new BusinessException(ErrorCode.CONFLICT,
                    action + " 불가 — 현재 상태 " + this.status.getDisplayName()
                            + " (필요 " + expected.getDisplayName() + ")");
        }
    }
}
