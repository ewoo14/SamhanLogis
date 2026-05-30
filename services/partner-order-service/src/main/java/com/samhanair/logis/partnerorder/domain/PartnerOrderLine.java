package com.samhanair.logis.partnerorder.domain;

import com.samhanair.logis.common.entity.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import java.math.BigDecimal;
import java.util.UUID;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.SQLRestriction;
import org.hibernate.annotations.UuidGenerator;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

/**
 * 거래처 주문의 라인 1:N. {@link #productId} 는 product-service (M1a) 의 logical reference —
 * FK 사용하지 않음 (다른 서비스 소유). {@link #modelName} + {@link #productName} 은 발행 시점 스냅샷
 * (legacy 동작 — 카탈로그 변동 시에도 주문 history 는 보존).
 *
 * <p>{@link #priceVat} 는 server-side DC 적용 결과 (M3 dc-config-service 에서 받음). client 가
 * 보낸 가격은 무시하고 server 가 권위 (legacy 의 client-side DC 계산을 server 로 이전).
 */
@Entity
@Getter
@Table(name = "partner_order_lines")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@SQLRestriction("is_deleted = false")
public class PartnerOrderLine extends BaseEntity {

    @Id
    @GeneratedValue
    @UuidGenerator
    @Column(name = "id", updatable = false, nullable = false)
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "partner_order_id", nullable = false)
    private PartnerOrder partnerOrder;

    /** product-service 의 logical product UUID (FK 없음). */
    @Column(name = "product_id", nullable = false)
    private UUID productId;

    /** 발행 시점 스냅샷 — 모델명 (사용자 노출 식별자). */
    @Column(name = "model_name", nullable = false, length = 100)
    private String modelName;

    /** 발행 시점 스냅샷 — 상품명. */
    @Column(name = "product_name", nullable = false, length = 200)
    private String productName;

    /** 카테고리 키 (homemulti / singleSets / commercialMulti / oldProducts 등). */
    @Column(name = "category_key", nullable = false, length = 30)
    private String categoryKey;

    @Column(name = "quantity", nullable = false)
    private int quantity;

    /** server-side DC 적용 후 단가 (M3). */
    @Column(name = "price_vat", precision = 15, scale = 2, nullable = false)
    private BigDecimal priceVat;

    /** quantity * priceVat (server-side 계산 검증 결과). */
    @Column(name = "subtotal", precision = 15, scale = 2, nullable = false)
    private BigDecimal subtotal;

    /** 비고 (selectVal3 / specVal 등 legacy 옵션 합성 — 단순 텍스트 보관). */
    @Column(name = "remark", length = 500)
    private String remark;

    /**
     * 출고전표로 전환된 누적 수량 — Phase 2.6a (V8 migration).
     * 잔여 = quantity - convertedQuantity. int 기본값 0 이므로 명시 초기화 불필요.
     */
    @Column(name = "converted_quantity", nullable = false)
    private int convertedQuantity;

    private PartnerOrderLine(UUID productId, String modelName, String productName,
                             String categoryKey, int quantity, BigDecimal priceVat,
                             String remark) {
        if (productId == null) {
            throw new IllegalArgumentException("productId 필수");
        }
        if (modelName == null || modelName.isBlank()) {
            throw new IllegalArgumentException("modelName 필수");
        }
        if (productName == null || productName.isBlank()) {
            throw new IllegalArgumentException("productName 필수");
        }
        if (categoryKey == null || categoryKey.isBlank()) {
            throw new IllegalArgumentException("categoryKey 필수");
        }
        if (quantity <= 0) {
            throw new IllegalArgumentException("quantity 는 1 이상");
        }
        if (priceVat == null || priceVat.signum() < 0) {
            throw new IllegalArgumentException("priceVat 는 0 이상");
        }
        this.productId = productId;
        this.modelName = modelName;
        this.productName = productName;
        this.categoryKey = categoryKey;
        this.quantity = quantity;
        this.priceVat = priceVat;
        this.subtotal = priceVat.multiply(BigDecimal.valueOf(quantity));
        this.remark = remark;
    }

    /**
     * 라인 생성 — server-side 가격 (DC 적용 후) 으로 subtotal 자동 계산.
     *
     * @return 신규 PartnerOrderLine (PartnerOrder 에 add 되기 전 상태)
     */
    public static PartnerOrderLine create(UUID productId, String modelName, String productName,
                                          String categoryKey, int quantity, BigDecimal priceVat,
                                          String remark) {
        return new PartnerOrderLine(productId, modelName, productName, categoryKey, quantity, priceVat, remark);
    }

    /**
     * 미전환 잔여 수량. quantity - convertedQuantity.
     *
     * @return 잔여 수량 (0 이상)
     */
    public int remainingQuantity() {
        return this.quantity - this.convertedQuantity;
    }

    /**
     * 전량 전환 여부. convertedQuantity >= quantity 이면 true.
     *
     * @return 전량 전환 완료 시 true
     */
    public boolean isFullyConverted() {
        return this.convertedQuantity >= this.quantity;
    }

    /**
     * 부분전환 — 전환 수량을 누적한다 (Phase 2.6a).
     *
     * @param qty 이번에 전환할 수량 (1 이상, 잔여 이하)
     * @throws ResponseStatusException(409) 잔여 초과 또는 비양수
     */
    public void convert(int qty) {
        if (qty <= 0) {
            throw new ResponseStatusException(
                    HttpStatus.CONFLICT,
                    "전환 수량은 1 이상이어야 합니다.");
        }
        if (qty > remainingQuantity()) {
            throw new ResponseStatusException(
                    HttpStatus.CONFLICT,
                    "전환 수량이 잔여 수량을 초과합니다. 잔여=" + remainingQuantity() + ", 요청=" + qty);
        }
        this.convertedQuantity += qty;
    }

    /** PartnerOrder.addLine 내부 호출 — bidirectional 관계 동기화. */
    void bind(PartnerOrder partnerOrder) {
        this.partnerOrder = partnerOrder;
    }
}
