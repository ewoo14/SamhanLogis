package com.samhanair.logis.slip.estimate.domain;

import com.samhanair.logis.common.entity.BaseEntity;
import com.samhanair.logis.common.financial.VatAmountCalculator;
import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
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
 *
 * <p><b>주의 — {@code is_deleted}/{@code @SQLRestriction} 는 현재 완전 dead code</b>
 * (2026-07-07 BE 적대검증, PR #759 STEP4 백로그 L1). {@link Estimate#lines} 는
 * {@code orphanRemoval=true} 로 매핑되어 있고, 라인 제거 경로({@link Estimate#removeLine},
 * {@link Estimate#restoreFromSnapshot} 의 {@code lines.clear()})는 전부 컬렉션에서 빼는
 * 즉시 Hibernate 가 물리 DELETE 를 실행한다. 이 클래스에는 {@code @SQLDelete} 오버라이드가
 * 없고 {@code markDeleted()} 를 호출하는 코드 경로도 0건이라, {@code is_deleted=true} 인 라인
 * 행이 실제로 존재한 적이 없다(soft-delete 자체가 발생하지 않는다). <b>이것이 견적 라인이
 * 판매전표(D) 의 헤더≠라인 삭제시각 불일치로 인한 over-restore·레거시 빈껍데기 결함군
 * (#758 STEP4 감사, {@link com.samhanair.logis.slip.service.SlipRestoreService} 참조)에서
 * 구조적으로 안전한 이유다</b> — 애초에 soft-delete 라인이 없으니 시각 불일치도 있을 수 없다.
 *
 * <p><b>향후 라인 단위 soft-delete 기능을 추가한다면</b> 반드시 {@code Slip} 의 cascade
 * 삭제/복원 패턴을 준용할 것:
 * <ol>
 *   <li>헤더 삭제 시 라인 전체에 <b>단일 시각</b>을 각인하는 cascade soft-delete
 *       ({@code markDeleted(deleter, deletedAt)} — 동일 인스턴트 주입, 라인마다 각자
 *       {@code now()} 찍는 것 금지)</li>
 *   <li>복원은 그 시각과 정확히 일치하는 라인만 대상으로 삼는 시각매칭 쿼리</li>
 *   <li>삭제 라인 수 대비 복원 라인 수가 어긋나면(레거시 등) 무음 부분복원 대신 즉시
 *       실패시키는 fail-loud 가드
 *       ({@link com.samhanair.logis.slip.service.SlipRestoreService#restore} 참조)</li>
 * </ol>
 * 헤더≠라인 삭제시각 정합 보장 없이 단순히 {@code @SQLDelete} 만 얹으면, 판매전표(D)에서
 * 실측된 over-restore(#758 CRITICAL)와 레거시 빈껍데기 결함이 견적에도 그대로 재현된다.
 */
@Entity
@Getter
@Table(name = "estimate_lines")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
// 위 클래스 Javadoc "주의" 단락 참조 — is_deleted 는 orphanRemoval 물리삭제만 쓰여 dead code.
@SQLRestriction("is_deleted = false")
public class EstimateLine extends BaseEntity {

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

    /**
     * VAT 포함 단가 — 단가 부가세포함 전환(2026-06-09, V35). non-null 이면 이 라인은 VAT 포함 단가 입력.
     * 화면 '단가' 표시값 + 견적→전표 변환 시 SlipLine.createFromVatInclusive 전달용. nullable(legacy).
     */
    @Column(name = "unit_price_with_vat", precision = 15, scale = 2)
    private BigDecimal unitPriceWithVat;

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

    /**
     * VAT 포함 단가 기반 생성 — 단가 부가세포함 전환(라인 단위, 원 단위 절사).
     * 합계(VAT포함)=수량×unitPriceWithVat, 공급가액=절사(합계/1.1), 부가세=차액(모두 원 단위).
     * unitPrice(공급단가, 비권위)=공급가액/수량. lineTotal=합계(VAT포함). {@link SlipLine#createFromVatInclusive} 와 동일 규칙.
     */
    public static EstimateLine createFromVatInclusive(Estimate estimate, int lineNo, UUID productId,
                                                      String productName, String modelName, String specification,
                                                      int quantity, BigDecimal unitPriceWithVat, String note) {
        validatePositive(quantity);
        validateUnitPrice(unitPriceWithVat);
        BigDecimal lineInclVat = unitPriceWithVat.multiply(BigDecimal.valueOf(quantity))
                .setScale(0, RoundingMode.HALF_UP);
        VatAmountCalculator.Split vatSplit = VatAmountCalculator.splitVatInclusive(lineInclVat);
        BigDecimal supply = vatSplit.supplyAmount();
        BigDecimal supplyUnit = supply.divide(BigDecimal.valueOf(quantity), 2, RoundingMode.HALF_UP);
        EstimateLine line = new EstimateLine(estimate, lineNo, productId, productName, modelName,
                specification, quantity, supplyUnit, note);
        // 라인 단위 권위값으로 덮어쓴다(공급/부가세/합계 원 단위 + VAT포함 단가 보존).
        line.supplyAmount = supply.setScale(2, RoundingMode.HALF_UP);
        line.vatAmount = lineInclVat.subtract(supply).setScale(2, RoundingMode.HALF_UP);
        line.lineTotal = lineInclVat.setScale(2, RoundingMode.HALF_UP);
        line.unitPriceWithVat = unitPriceWithVat.setScale(2, RoundingMode.HALF_UP);
        return line;
    }

    /**
     * 화면에서 편집한 공급가액·부가세·VAT 포함 합계를 권위값으로 보존하는 생성 팩토리.
     *
     * <p>견적의 {@code lineTotal} 은 기존 계약상 VAT 포함 합계이므로 {@code T} 를 저장한다.
     * 모든 금액은 요청의 정수값을 재계산하지 않고 그대로 보존한다.
     *
     * @param supplyAmount 공급가액 S (원 단위 정수, 0 이상)
     * @param vatAmount 부가세 V (원 단위 정수, 0 이상)
     * @param lineTotalWithVat VAT 포함 합계 T (원 단위 정수, 0 이상)
     * @throws BusinessException 금액·수량·항등식이 유효하지 않으면 INVALID_INPUT
     */
    public static EstimateLine createFromAuthoritativeAmounts(
            Estimate estimate, int lineNo, UUID productId, String productName,
            String modelName, String specification, int quantity, BigDecimal supplyAmount,
            BigDecimal vatAmount, BigDecimal lineTotalWithVat, String note) {
        validatePositive(quantity);
        validateAuthoritativeAmounts(supplyAmount, vatAmount, lineTotalWithVat);
        BigDecimal supplyUnit = supplyAmount.divide(BigDecimal.valueOf(quantity), 2,
                RoundingMode.HALF_UP);
        EstimateLine line = new EstimateLine(estimate, lineNo, productId, productName, modelName,
                specification, quantity, supplyUnit, note);
        line.supplyAmount = supplyAmount;
        line.vatAmount = vatAmount;
        line.lineTotal = lineTotalWithVat;
        line.unitPriceWithVat = lineTotalWithVat.divide(BigDecimal.valueOf(quantity), 2,
                RoundingMode.HALF_UP);
        return line;
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
        this.vatAmount = VatAmountCalculator.fromSupply(this.supplyAmount).setScale(2);
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

    private static void validateAuthoritativeAmounts(BigDecimal supplyAmount,
                                                     BigDecimal vatAmount,
                                                     BigDecimal lineTotalWithVat) {
        validateAmount(supplyAmount, "공급가액");
        validateAmount(vatAmount, "부가세");
        validateAmount(lineTotalWithVat, "합계");
        if (supplyAmount.add(vatAmount).compareTo(lineTotalWithVat) != 0) {
            throw new BusinessException(ErrorCode.INVALID_INPUT,
                    ("공급가액(%s)과 부가세(%s)의 합이 합계(%s)와 일치하지 않습니다. "
                            + "화면을 새로고침한 뒤 다시 시도해 주세요.")
                            .formatted(supplyAmount.toPlainString(), vatAmount.toPlainString(),
                                    lineTotalWithVat.toPlainString()));
        }
    }

    private static void validateAmount(BigDecimal amount, String label) {
        if (amount == null || amount.signum() < 0) {
            throw new BusinessException(ErrorCode.INVALID_INPUT,
                    label + "은 0 이상의 원 단위 정수여야 합니다");
        }
        // MED-4(#824 R1): stripTrailingZeros().precision() 단독으로는 1E+17(unscaled=1) 같은
        // 압축표기가 precision=1 로 측정돼 NUMERIC(15,2) 초과(18자리)를 통과시킨다.
        // precision()-scale() 은 stripTrailingZeros 전후로 불변(실제 자릿수)이므로 이 조합을 쓴다 —
        // SlipLine.validateAmount 동일 sweep(#824 R1 MED-4).
        BigDecimal stripped = amount.stripTrailingZeros();
        if (stripped.scale() > 0 || stripped.precision() - stripped.scale() > 15) {
            throw new BusinessException(ErrorCode.INVALID_INPUT,
                    label + "은 0 이상의 원 단위 정수여야 합니다");
        }
    }
}
