package com.samhanair.logis.slip.domain;

import com.samhanair.logis.common.entity.BaseEntity;
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
 * 전표 라인 — productId/이름 snapshot + 수량 + 단가 + lineTotal(=수량×단가) 자동 계산.
 * 라인 단위 mutation(수량/단가/메모 변경)은 서비스 레이어에서 헤더 상태 가드 후 호출되어야 한다.
 */
@Entity
@Getter
@Table(name = "slip_lines")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@SQLRestriction("is_deleted = false")
public class SlipLine extends BaseEntity {

    @Id
    @GeneratedValue
    @UuidGenerator
    @Column(name = "id", updatable = false, nullable = false)
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "slip_id", nullable = false)
    private Slip slip;

    @Column(name = "product_id", nullable = false)
    private UUID productId;

    @Column(name = "product_name", nullable = false, length = 200)
    private String productName;

    @Column(name = "model_name", length = 100)
    private String modelName;

    /**
     * 규격 — Slice A (sales-polish-2) 신규 필드 (사용자 피드백 #4).
     * 예: "220V", "4HP", "Φ80×L1200". 사용자 자유 입력 (제품 마스터에서 자동 추출 X).
     * 작업지시서 라인 표 7-col 의 "규격" 컬럼에 표시.
     */
    @Column(name = "specification", length = 50)
    private String specification;

    @Column(name = "quantity", nullable = false)
    private int quantity;

    @Column(name = "unit_price", nullable = false, precision = 15, scale = 2)
    private BigDecimal unitPrice;

    @Column(name = "line_total", nullable = false, precision = 17, scale = 2)
    private BigDecimal lineTotal;

    /**
     * VAT 포함 단가 — feature/local-test-setup Stage 2 이카운트 판매입력 매핑 신규 필드 (V12 migration).
     * {@code unitPrice * 1.1} (VAT 10%). 모바일 판매입력 화면 "VAT포함단가" 컬럼 1:1.
     * nullable — 기존 라인 row 호환 (Stage 2 시드/신규 라인만 채움).
     */
    @Column(name = "unit_price_with_vat", precision = 15, scale = 2)
    private BigDecimal unitPriceWithVat;

    /**
     * 공급가액 — feature/local-test-setup Stage 2 이카운트 판매입력 매핑 신규 필드 (V12 migration).
     * {@code unitPrice * quantity} (VAT 미포함). nullable — 기존 라인 row 호환.
     * lineTotal 과 동일 값이지만 의미 상 별도 컬럼 보존 (이카운트 회계 매핑 의도 명시).
     */
    @Column(name = "supply_amount", precision = 17, scale = 2)
    private BigDecimal supplyAmount;

    /**
     * 부가세 — feature/local-test-setup Stage 2 이카운트 판매입력 매핑 신규 필드 (V12 migration).
     * {@code supplyAmount * 0.1} (VAT 10%). nullable — 기존 라인 row 호환.
     */
    @Column(name = "vat_amount", precision = 15, scale = 2)
    private BigDecimal vatAmount;

    @Column(name = "note", length = 200)
    private String note;

    /**
     * 출처 주문 라인 ID — Phase 2.6a 부분전환 추적 (V29 migration).
     * partner-order-service 의 PartnerOrderLine.id 를 역참조. nullable — 부분전환 경로 이외의
     * 기존 발행 라인은 null 유지 (legacy 호환).
     */
    @Column(name = "source_order_line_id")
    private UUID sourceOrderLineId;

    /** 세트 전개 그룹 첫 구성품 라인 여부(PR-3, V34). 일반 라인 = false. */
    @Column(name = "set_head", nullable = false)
    private boolean setHead = false;

    /** 세트 구성품일 때 부모 세트 modelCode(PR-3, V34). 일반 라인 = null. */
    @Column(name = "parent_set_model", length = 64)
    private String parentSetModel;

    private SlipLine(Slip slip, UUID productId, String productName, String modelName,
                     String specification, int quantity, BigDecimal unitPrice, String note,
                     UUID sourceOrderLineId) {
        validatePositive(quantity);
        validateUnitPrice(unitPrice);
        this.slip = slip;
        this.productId = productId;
        this.productName = productName;
        this.modelName = modelName;
        this.specification = specification;
        this.quantity = quantity;
        this.unitPrice = unitPrice;
        this.note = note;
        this.sourceOrderLineId = sourceOrderLineId;
        this.lineTotal = computeLineTotal(quantity, unitPrice);
        this.supplyAmount = this.lineTotal;
        this.vatAmount = computeVat(this.lineTotal);
        this.unitPriceWithVat = computeUnitPriceWithVat(unitPrice);
    }

    /**
     * 라인 1건 생성. quantity 양수 + unitPrice 비음수 검증 후 lineTotal 자동 계산.
     *
     * <p>Slice A (sales-polish-2): {@code specification} 파라미터 신규 추가 (사용자 피드백 #4).
     * 호환성을 위해 {@code specification} 은 nullable.
     *
     * <p>Phase 2.6a: {@code sourceOrderLineId} 파라미터 신규 추가 — 부분전환 경로에서 출처 주문 라인
     * UUID 를 역추적. 비-전환 경로는 null 전달.
     *
     * @param slip 헤더 (cascade ALL — 영속화 전이어도 무방)
     * @param productId 제품 UUID (서비스 레이어 ProductClient 사전 검증)
     * @param productName snapshot 명칭 (필수, 최대 200자)
     * @param modelName snapshot 모델명 (선택)
     * @param specification 규격 (선택, 최대 50자) — 예: "220V", "4HP"
     * @param quantity 수량 (1 이상)
     * @param unitPrice 단가 (0 이상)
     * @param note 라인 메모 (선택, 최대 200자)
     * @param sourceOrderLineId 출처 주문 라인 UUID (Phase 2.6a 부분전환, null 허용)
     * @return 영속화 전 SlipLine 인스턴스
     * @throws IllegalArgumentException 수량 0 이하 또는 unitPrice 가 음수일 때
     */
    public static SlipLine create(Slip slip, UUID productId, String productName, String modelName,
                                  String specification, int quantity, BigDecimal unitPrice,
                                  String note, UUID sourceOrderLineId) {
        return new SlipLine(slip, productId, productName, modelName, specification,
                quantity, unitPrice, note, sourceOrderLineId);
    }

    /**
     * 라인 1건 생성 (sourceOrderLineId 없는 호환 오버로드). 부분전환 외 기존 경로 호출처 유지.
     *
     * @param slip 헤더
     * @param productId 제품 UUID
     * @param productName snapshot 명칭
     * @param modelName snapshot 모델명
     * @param specification 규격
     * @param quantity 수량
     * @param unitPrice 단가
     * @param note 라인 메모
     * @return 영속화 전 SlipLine 인스턴스 (sourceOrderLineId = null)
     */
    public static SlipLine create(Slip slip, UUID productId, String productName, String modelName,
                                  String specification, int quantity, BigDecimal unitPrice,
                                  String note) {
        return new SlipLine(slip, productId, productName, modelName, specification,
                quantity, unitPrice, note, null);
    }

    /**
     * VAT 포함 단가 기반 생성 — 단가 부가세포함 전환(2026-06-09 개발책임자 확정, 라인 단위 eCount 방식).
     *
     * <p>사용자 입력 단가는 <b>부가세 포함</b>. 라인 단위로 공급가액/부가세를 분리:
     * <ul>
     *   <li>합계(VAT포함) = {@code 수량 × unitPriceWithVat}</li>
     *   <li>공급가액(supplyAmount) = {@code round(합계 ÷ 1.1)} (HALF_UP)</li>
     *   <li>부가세(vatAmount) = {@code 합계 − 공급가액}</li>
     *   <li>unitPrice(공급 단가, 저장용 비권위) = {@code 공급가액 ÷ 수량}</li>
     *   <li>lineTotal = 공급가액(VAT 미포함 라인합, 기존 의미 유지)</li>
     * </ul>
     * 합계/공급가액/부가세는 <b>라인 단위 권위값</b>으로 저장(per-unit 재계산 drift 방지).
     *
     * @param unitPriceWithVat 부가세 포함 단가 (per-unit, 0 이상)
     */
    public static SlipLine createFromVatInclusive(Slip slip, UUID productId, String productName,
                                                  String modelName, String specification, int quantity,
                                                  BigDecimal unitPriceWithVat, String note,
                                                  UUID sourceOrderLineId) {
        validatePositive(quantity);
        validateUnitPrice(unitPriceWithVat);
        // 한국 원화 송장 표준(eCount): 합계(VAT포함)·공급가액·부가세는 모두 원 단위(정수) 반올림.
        // FE(SlipFormPage/LineRow 의 Math.round)와 동일 granularity 로 일치시킨다(P2 정합).
        BigDecimal lineInclVat = unitPriceWithVat.multiply(BigDecimal.valueOf(quantity))
                .setScale(0, RoundingMode.HALF_UP);
        BigDecimal supply = lineInclVat.divide(new BigDecimal("1.1"), 0, RoundingMode.HALF_UP);
        BigDecimal vat = lineInclVat.subtract(supply);
        BigDecimal supplyUnit = supply.divide(BigDecimal.valueOf(quantity), 2, RoundingMode.HALF_UP);
        // 공급 단가로 일반 생성 후 라인 단위 권위값으로 덮어쓴다.
        SlipLine line = new SlipLine(slip, productId, productName, modelName, specification,
                quantity, supplyUnit, note, sourceOrderLineId);
        line.lineTotal = supply;
        line.supplyAmount = supply;
        line.vatAmount = vat;
        line.unitPriceWithVat = unitPriceWithVat.setScale(2, RoundingMode.HALF_UP);
        return line;
    }

    /**
     * 화면에서 편집한 공급가액·부가세·VAT 포함 합계를 권위값으로 보존하는 생성 팩토리.
     *
     * <p>전표의 {@code lineTotal} 은 기존 계약상 VAT 미포함 공급가액이므로 {@code S} 를 저장한다.
     * 요청의 VAT 포함 합계 {@code T} 는 {@code lineTotalWithVat} 로만 검증하고, 기존
     * {@code lineTotal} 의미는 변경하지 않는다.
     *
     * @param supplyAmount 공급가액 S (원 단위 정수, 0 이상)
     * @param vatAmount 부가세 V (원 단위 정수, 0 이상)
     * @param lineTotalWithVat VAT 포함 합계 T (원 단위 정수, 0 이상)
     * @throws BusinessException 금액·수량·항등식이 유효하지 않으면 INVALID_INPUT
     */
    public static SlipLine createFromAuthoritativeAmounts(
            Slip slip, UUID productId, String productName, String modelName,
            String specification, int quantity, BigDecimal supplyAmount,
            BigDecimal vatAmount, BigDecimal lineTotalWithVat, String note,
            UUID sourceOrderLineId) {
        validatePositive(quantity);
        validateAuthoritativeAmounts(supplyAmount, vatAmount, lineTotalWithVat);
        BigDecimal supplyUnit = supplyAmount.divide(BigDecimal.valueOf(quantity), 2,
                RoundingMode.HALF_UP);
        SlipLine line = new SlipLine(slip, productId, productName, modelName, specification,
                quantity, supplyUnit, note, sourceOrderLineId);
        line.lineTotal = supplyAmount;
        line.supplyAmount = supplyAmount;
        line.vatAmount = vatAmount;
        line.unitPriceWithVat = lineTotalWithVat.divide(BigDecimal.valueOf(quantity), 2,
                RoundingMode.HALF_UP);
        return line;
    }

    /** 세트 전개 구성품 표시 — 전개된 세트 구성품 라인에만 부여(parentSetModel + 첫 라인 setHead). */
    public void assignBundleComponent(String parentSetModel, boolean setHead) {
        this.parentSetModel = parentSetModel;
        this.setHead = setHead;
    }

    /**
     * 전표 복사용 라인 사본 생성 — 원본 라인의 금액 권위값과 세트 계보를 그대로 승계한다 (R6-H2).
     *
     * <p>FE 평면 재-POST 복사는 세트 구성품이 일반 라인으로 재생성되어 배분가가 가격기억에
     * 각인되고 세트 표시도 소실됐다. 서버 복사는:
     * <ul>
     *   <li>단가/합계/공급가액/부가세/VAT포함단가를 <b>원본 값 그대로</b> 복사 — 재계산으로 인한
     *       반올림 drift 없음. 단, legacy 라인(VAT 필드 null)은 현행 생성 규칙대로 unitPrice 에서
     *       재계산한다 (FE legacy 복사 경로와 동일 의미).</li>
     *   <li>{@code setHead}/{@code parentSetModel} 세트 계보 승계 — 복사본에서도 세트 표시와
     *       가격기억 구성품 제외가 유지된다.</li>
     *   <li>{@code sourceOrderLineId} 는 승계하지 않는다 — 주문 부분전환 역참조가 복사본에
     *       중복 연결되면 전환 추적이 왜곡된다.</li>
     * </ul>
     *
     * @param slip 사본이 속할 새 전표 헤더
     * @param source 원본 라인 (영속 상태)
     * @return 영속화 전 사본 라인
     */
    public static SlipLine copyOf(Slip slip, SlipLine source) {
        SlipLine line = new SlipLine(slip, source.productId, source.productName, source.modelName,
                source.specification, source.quantity, source.unitPrice, source.note, null);
        if (source.unitPriceWithVat != null) {
            // 라인 단위 권위값 보존 (createFromVatInclusive 저장 규칙과 동일한 덮어쓰기)
            line.lineTotal = source.lineTotal;
            line.supplyAmount = source.supplyAmount;
            line.vatAmount = source.vatAmount;
            line.unitPriceWithVat = source.unitPriceWithVat;
        }
        line.parentSetModel = source.parentSetModel;
        line.setHead = source.setHead;
        return line;
    }

    /**
     * 버전이력 스냅샷 복원용 라인 단위 권위 금액 승계 — #822 계열 sweep (전표 측).
     *
     * <p>{@link com.samhanair.logis.slip.domain.Slip#restoreFromSnapshot} 는 스냅샷 라인을
     * {@link #create}(공급 단가) 로 재생성하는데, 이 경로는 {@code vatAmount = 공급가액 × 0.1},
     * {@code unitPriceWithVat = 공급단가 × 1.1} 을 <b>재계산</b>한다. VAT 포함 단가로 입력된
     * 라인({@link #createFromVatInclusive})은 공급가액이 원 단위 반올림된 배분값이라, 재계산
     * 결과가 캡처 시점 권위값과 어긋난다(예: VAT 포함 87,999 × 3 → 캡처 vat 24,000 / 재계산
     * 23,999.70 — 11의 배수가 아닌 단가에서 드리프트). 본 메서드는 {@link #copyOf} 의 덮어쓰기
     * 규칙과 동일하게 스냅샷 캡처값을 그대로 승계해 복원을 무손실로 만든다.
     *
     * <p>가드: {@code unitPriceWithVat == null}(V12 이전 legacy 라인 스냅샷)이면 아무것도 하지
     * 않는다 — 종전과 동일하게 create 재계산 결과를 유지한다(하위호환). 공급 단가로 생성된
     * 일반 라인은 캡처값 == 재계산값이므로 덮어써도 값이 변하지 않는다.
     *
     * @param lineTotal 캡처 시점 라인 합계 (null 이면 재계산값 유지)
     * @param supplyAmount 캡처 시점 공급가액 (null 이면 재계산값 유지)
     * @param vatAmount 캡처 시점 부가세 (null 이면 재계산값 유지)
     * @param unitPriceWithVat 캡처 시점 VAT 포함 단가 (null 이면 전체 no-op)
     */
    void restoreAuthoritativeAmounts(BigDecimal lineTotal, BigDecimal supplyAmount,
                                     BigDecimal vatAmount, BigDecimal unitPriceWithVat) {
        if (unitPriceWithVat == null) {
            return;
        }
        this.unitPriceWithVat = unitPriceWithVat;
        if (lineTotal != null) {
            this.lineTotal = lineTotal;
        }
        if (supplyAmount != null) {
            this.supplyAmount = supplyAmount;
        }
        if (vatAmount != null) {
            this.vatAmount = vatAmount;
        }
    }

    /**
     * 수량 변경 — 양수만 허용. lineTotal 재계산. 헤더 상태 가드는 서비스 레이어 책임.
     *
     * @param newQuantity 새 수량 (1 이상)
     * @throws IllegalArgumentException newQuantity 가 0 이하일 때
     */
    public void changeQuantity(int newQuantity) {
        validatePositive(newQuantity);
        this.quantity = newQuantity;
        this.lineTotal = computeLineTotal(newQuantity, this.unitPrice);
        this.supplyAmount = this.lineTotal;
        this.vatAmount = computeVat(this.lineTotal);
    }

    /**
     * 단가 변경 — 비음수만 허용. lineTotal 재계산.
     *
     * @param newUnitPrice 새 단가 (0 이상)
     * @throws IllegalArgumentException newUnitPrice 가 음수일 때
     */
    public void changeUnitPrice(BigDecimal newUnitPrice) {
        validateUnitPrice(newUnitPrice);
        this.unitPrice = newUnitPrice;
        this.lineTotal = computeLineTotal(this.quantity, newUnitPrice);
        this.supplyAmount = this.lineTotal;
        this.vatAmount = computeVat(this.lineTotal);
        this.unitPriceWithVat = computeUnitPriceWithVat(newUnitPrice);
    }

    /**
     * 라인 메모 변경. null/공백 도 허용 (메모 제거).
     *
     * @param newNote 새 메모 (최대 200자, 길이 검증은 DB constraint)
     */
    public void changeNote(String newNote) {
        this.note = newNote;
    }

    /**
     * 규격 변경 — Slice A (sales-polish-2) 신규 mutator (사용자 피드백 #4).
     * null/공백 도 허용 (규격 제거). 헤더 상태 가드는 서비스 레이어 책임.
     *
     * @param newSpecification 새 규격 (최대 50자, 길이 검증은 DB constraint)
     */
    public void changeSpecification(String newSpecification) {
        this.specification = newSpecification;
    }

    private static BigDecimal computeLineTotal(int quantity, BigDecimal unitPrice) {
        return unitPrice.multiply(BigDecimal.valueOf(quantity)).setScale(2, RoundingMode.HALF_UP);
    }

    /**
     * 부가세 계산 — Stage 2 이카운트 매핑. {@code supplyAmount * 0.1} (VAT 10%).
     * 한국 부가세 표준 (HALF_UP rounding, scale 2).
     */
    private static BigDecimal computeVat(BigDecimal supplyAmount) {
        return supplyAmount.multiply(new BigDecimal("0.1")).setScale(2, RoundingMode.HALF_UP);
    }

    /**
     * VAT 포함 단가 계산 — Stage 2 이카운트 매핑. {@code unitPrice * 1.1}.
     * 한국 부가세 표준 (HALF_UP rounding, scale 2).
     */
    private static BigDecimal computeUnitPriceWithVat(BigDecimal unitPrice) {
        return unitPrice.multiply(new BigDecimal("1.1")).setScale(2, RoundingMode.HALF_UP);
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
        if (amount == null || amount.signum() < 0
                || amount.stripTrailingZeros().scale() > 0
                || amount.stripTrailingZeros().precision() > 15) {
            throw new BusinessException(ErrorCode.INVALID_INPUT,
                    label + "은 0 이상의 원 단위 정수여야 합니다");
        }
    }
}
