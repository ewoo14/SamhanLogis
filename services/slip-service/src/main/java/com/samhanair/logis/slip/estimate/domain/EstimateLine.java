package com.samhanair.logis.slip.estimate.domain;

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
import java.math.RoundingMode;
import java.util.UUID;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.SQLRestriction;
import org.hibernate.annotations.UuidGenerator;

/**
 * 견적 라인 — productId / 이름 snapshot + 수량 + 단가 + supplyAmount/vatAmount/lineTotal 자동 계산.
 *
 * <p>{@link com.samhanair.logis.slip.domain.SlipLine} 와 동일 패턴 — convert 시 1:1 매핑.
 *
 * <p>금액 계산:
 * <ul>
 *   <li>supplyAmount = unitPrice × quantity (공급가액)</li>
 *   <li>vatAmount = supplyAmount × 0.10 (부가세 10%)</li>
 *   <li>lineTotal = supplyAmount + vatAmount</li>
 * </ul>
 */
@Entity
@Getter
@Table(name = "estimate_lines")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@SQLRestriction("is_deleted = false")
public class EstimateLine extends BaseEntity {

    /** 한국 부가세율 10%. */
    private static final BigDecimal VAT_RATE = new BigDecimal("0.10");

    @Id
    @GeneratedValue
    @UuidGenerator
    @Column(name = "id", updatable = false, nullable = false)
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "estimate_id", nullable = false)
    private Estimate estimate;

    @Column(name = "line_no", nullable = false)
    private int lineNo;

    @Column(name = "product_id", nullable = false)
    private UUID productId;

    @Column(name = "product_name", nullable = false, length = 200)
    private String productName;

    @Column(name = "model_name", length = 100)
    private String modelName;

    @Column(name = "specification", length = 50)
    private String specification;

    @Column(name = "quantity", nullable = false)
    private int quantity;

    @Column(name = "unit_price", nullable = false, precision = 15, scale = 2)
    private BigDecimal unitPrice;

    @Column(name = "supply_amount", nullable = false, precision = 17, scale = 2)
    private BigDecimal supplyAmount;

    @Column(name = "vat_amount", nullable = false, precision = 15, scale = 2)
    private BigDecimal vatAmount;

    @Column(name = "line_total", nullable = false, precision = 17, scale = 2)
    private BigDecimal lineTotal;

    @Column(name = "note", length = 200)
    private String note;

    /** 세트 전개 그룹의 첫 구성품 라인 여부(전표 그룹 헤더 표시용). 일반 라인 = false. */
    @Column(name = "set_head", nullable = false)
    private boolean setHead = false;

    /** 이 라인이 속한 세트의 부모 modelCode(세트 구성품일 때만). 일반 라인 = null. */
    @Column(name = "parent_set_model", length = 64)
    private String parentSetModel;

    private EstimateLine(Estimate estimate, int lineNo, UUID productId, String productName,
                         String modelName, String specification, int quantity,
                         BigDecimal unitPrice, String note) {
        validatePositive(quantity);
        validateUnitPrice(unitPrice);
        this.estimate = estimate;
        this.lineNo = lineNo;
        this.productId = productId;
        this.productName = productName;
        this.modelName = modelName;
        this.specification = specification;
        this.quantity = quantity;
        this.unitPrice = unitPrice;
        this.note = note;
        recompute();
    }

    /**
     * 라인 1건 생성. quantity 양수 + unitPrice 비음수 검증 후 supply/vat/lineTotal 자동 계산.
     *
     * @param estimate 헤더 (cascade ALL)
     * @param lineNo 라인 순번 (1, 2, 3...)
     * @param productId 제품 UUID
     * @param productName snapshot 명칭 (필수, 최대 200자)
     * @param modelName snapshot 모델명 (선택)
     * @param specification 규격 (선택, 최대 50자)
     * @param quantity 수량 (1 이상)
     * @param unitPrice 단가 (0 이상)
     * @param note 라인 메모 (선택)
     * @return 영속화 전 EstimateLine 인스턴스
     */
    public static EstimateLine create(Estimate estimate, int lineNo, UUID productId,
                                      String productName, String modelName, String specification,
                                      int quantity, BigDecimal unitPrice, String note) {
        return new EstimateLine(estimate, lineNo, productId, productName, modelName,
                specification, quantity, unitPrice, note);
    }

    /** 세트 전개 구성품 표시 — 전개된 세트의 구성품 라인에만 부여(parentSetModel + 첫 라인 setHead). */
    public void assignBundleComponent(String parentSetModel, boolean setHead) {
        this.parentSetModel = parentSetModel;
        this.setHead = setHead;
    }

    /** 수량 변경 — supply/vat/lineTotal 재계산. */
    public void changeQuantity(int newQuantity) {
        validatePositive(newQuantity);
        this.quantity = newQuantity;
        recompute();
    }

    /** 단가 변경 — supply/vat/lineTotal 재계산. */
    public void changeUnitPrice(BigDecimal newUnitPrice) {
        validateUnitPrice(newUnitPrice);
        this.unitPrice = newUnitPrice;
        recompute();
    }

    /** 메모 변경. */
    public void changeNote(String newNote) {
        this.note = newNote;
    }

    private void recompute() {
        this.supplyAmount = this.unitPrice.multiply(BigDecimal.valueOf(this.quantity))
                .setScale(2, RoundingMode.HALF_UP);
        this.vatAmount = this.supplyAmount.multiply(VAT_RATE).setScale(2, RoundingMode.HALF_UP);
        this.lineTotal = this.supplyAmount.add(this.vatAmount);
    }

    private static void validatePositive(int quantity) {
        if (quantity <= 0) {
            throw new IllegalArgumentException("수량은 양수여야 합니다");
        }
    }

    private static void validateUnitPrice(BigDecimal unitPrice) {
        if (unitPrice == null || unitPrice.signum() < 0) {
            throw new IllegalArgumentException("단가는 0 이상이어야 합니다");
        }
    }
}
