package com.samhanair.logis.inventory.domain;

import com.samhanair.logis.common.entity.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
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
 * 입고 단위 재고 로트 (plan §3.2 의 "물품 UUID"). FIFO 정렬 키는 {@link #receivedAt}.
 * {@link #productId} 는 product-service 의 logical reference 이며 FK 는 사용하지 않는다.
 */
@Entity
@Getter
@Table(name = "stock_lots")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@SQLRestriction("is_deleted = false")
public class StockLot extends BaseEntity {

    @Id
    @GeneratedValue
    @UuidGenerator
    @Column(name = "id", updatable = false, nullable = false)
    private UUID id;

    @Column(name = "product_id", nullable = false)
    private UUID productId;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "warehouse_id", nullable = false)
    private Warehouse warehouse;

    @Column(name = "lot_no", length = 50)
    private String lotNo;

    /** 입고전표 라인 식별자 — 같은 전표의 동일 품목 복수 라인을 구분하는 내부 키. */
    @Column(name = "inbound_line_id")
    private UUID inboundLineId;

    @Column(name = "quantity", nullable = false)
    private int quantity;

    @Column(name = "initial_quantity", nullable = false)
    private int initialQuantity;

    @Column(name = "received_at", nullable = false)
    private LocalDateTime receivedAt;

    @Column(name = "unit_cost", precision = 15, scale = 2)
    private BigDecimal unitCost;

    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false, length = 20)
    private StockLotStatus status;

    @Column(name = "source_transfer_id")
    private UUID sourceTransferId;

    private StockLot(UUID productId, Warehouse warehouse, String lotNo, UUID inboundLineId,
                     int quantity, LocalDateTime receivedAt, BigDecimal unitCost,
                     UUID sourceTransferId) {
        if (quantity <= 0) {
            throw new IllegalArgumentException("입고 수량은 0보다 커야 합니다");
        }
        this.productId = productId;
        this.warehouse = warehouse;
        this.lotNo = lotNo;
        this.inboundLineId = inboundLineId;
        this.quantity = quantity;
        this.initialQuantity = quantity;
        this.receivedAt = receivedAt == null ? LocalDateTime.now() : receivedAt;
        this.unitCost = unitCost;
        this.status = StockLotStatus.AVAILABLE;
        this.sourceTransferId = sourceTransferId;
    }

    /**
     * 일반 입고로 새 lot 을 생성한다 (sourceTransferId = null). receivedAt 이 null 이면 now() 사용.
     *
     * @param productId 제품 UUID
     * @param warehouse 입고 창고 (영속 상태)
     * @param lotNo 외부 로트 번호 (선택, 최대 50자)
     * @param quantity 입고 수량 (1 이상)
     * @param receivedAt 입고 일시 (null 이면 LocalDateTime.now())
     * @param unitCost 단위 원가 (선택)
     * @return AVAILABLE 상태의 신규 StockLot 인스턴스 (영속화 전)
     * @throws IllegalArgumentException quantity 가 0 이하일 때
     */
    public static StockLot create(UUID productId, Warehouse warehouse, String lotNo,
                                  int quantity, LocalDateTime receivedAt, BigDecimal unitCost) {
        return create(productId, warehouse, lotNo, null, quantity, receivedAt, unitCost);
    }

    /** 입고전표 라인 키를 포함한 일반 입고 lot 를 생성한다. */
    public static StockLot create(UUID productId, Warehouse warehouse, String lotNo, UUID inboundLineId,
                                  int quantity, LocalDateTime receivedAt, BigDecimal unitCost) {
        return new StockLot(productId, warehouse, lotNo, inboundLineId, quantity, receivedAt, unitCost, null);
    }

    /**
     * 이동전표 입고로 새 lot 을 생성한다. sourceTransferId 로 출처를 추적.
     *
     * @param productId 제품 UUID
     * @param warehouse 입고 창고 (이동전표 destination)
     * @param lotNo 외부 로트 번호 (선택)
     * @param quantity 입고 수량 (1 이상)
     * @param receivedAt 입고 일시 (null 이면 LocalDateTime.now())
     * @param unitCost 단위 원가 (선택, source lot 의 원가 승계 가능)
     * @param transferId 출처 이동전표 ID (감사용)
     * @return AVAILABLE 상태의 신규 StockLot 인스턴스 (영속화 전)
     * @throws IllegalArgumentException quantity 가 0 이하일 때
     */
    public static StockLot createFromTransfer(UUID productId, Warehouse warehouse, String lotNo,
                                              int quantity, LocalDateTime receivedAt,
                                              BigDecimal unitCost, UUID transferId) {
        return new StockLot(productId, warehouse, lotNo, null, quantity, receivedAt, unitCost, transferId);
    }

    /**
     * 로트 잔량을 차감한다. quantity 가 0 이 되면 자동으로 SOLD_OUT 으로 전이.
     *
     * @param amount 차감 수량 (1 이상)
     * @return 차감 후 남은 잔량
     * @throws IllegalArgumentException amount 가 0 이하일 때
     * @throws IllegalStateException 잔량보다 많이 차감 시도 시 (서비스 레이어에서 CONFLICT 로 매핑)
     */
    public int deduct(int amount) {
        if (amount <= 0) {
            throw new IllegalArgumentException("차감 수량은 양수여야 합니다");
        }
        if (amount > this.quantity) {
            throw new IllegalStateException(
                    "로트 잔량 부족: 요청 " + amount + ", 잔량 " + this.quantity);
        }
        this.quantity -= amount;
        if (this.quantity == 0) {
            this.status = StockLotStatus.SOLD_OUT;
        }
        return this.quantity;
    }

    /**
     * 로트 상태를 IN_TRANSIT 으로 전이 — 이동전표 ship() 시 source lot 에 설정.
     * IN_TRANSIT 상태 lot 은 FIFO 차감 후보에서 제외된다.
     */
    public void markInTransit() {
        this.status = StockLotStatus.IN_TRANSIT;
    }

    /**
     * 로트 상태를 AVAILABLE 로 되돌린다 — 이동전표 reject/cancel 시 source lot 복원에 사용.
     */
    public void markAvailable() {
        this.status = StockLotStatus.AVAILABLE;
    }

    /**
     * 실사 조정 등으로 잔량을 절대값으로 재설정. 0 이면 SOLD_OUT, SOLD_OUT 에서 양수면 AVAILABLE 로 전이.
     *
     * @param newQuantity 조정 후 잔량 (0 이상)
     * @throws IllegalArgumentException newQuantity 가 음수일 때
     */
    public void adjustQuantity(int newQuantity) {
        if (newQuantity < 0) {
            throw new IllegalArgumentException("조정 후 수량은 0 이상이어야 합니다");
        }
        this.quantity = newQuantity;
        if (this.quantity == 0) {
            this.status = StockLotStatus.SOLD_OUT;
        } else if (this.status == StockLotStatus.SOLD_OUT) {
            this.status = StockLotStatus.AVAILABLE;
        }
    }
}
