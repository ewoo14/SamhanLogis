package com.samhanair.logis.partnerorder.domain;

import com.samhanair.logis.common.entity.BaseEntity;
import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import com.samhanair.logis.common.financial.VatAmountCalculator;
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
import java.math.RoundingMode;
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
 * 보낸 가격은 일반 라인에서는 무시하고 server 가 권위로 확정한다. 세트 구성품의
 * {@code setAllocation=true} 계약 라인은 화면·미리보기·확정의 동일한 배분 단가를 보존한다.
 * {@link #subtotal} 은 VAT 포함 라인 합계(T)이며, 신규 라인은 공급가액(S)·부가세(V)와
 * {@code S + V = T} 항등식을 함께 보존한다. 기존 행은 신규 컬럼이 null인 legacy 스냅샷으로
 * 읽고 다시 계산하거나 backfill하지 않는다.
 */
@Entity
@Getter
@Table(name = "partner_order_lines")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@SQLRestriction("is_deleted = false")
public class PartnerOrderLine extends BaseEntity {

    /**
     * MED-4(#824 R2) — SlipLine/EstimateLine 과 동일 결함군의 주문 측 sweep.
     * {@code price_vat}/{@code subtotal}/{@code supply_amount}/{@code vat_amount} 는 넷 다
     * {@code NUMERIC(15,2)}(V1/V12 migration, "가격/금액은 NUMERIC(15,2)" 컨벤션 주석) —
     * slip/estimate 와 달리 wide(17,2) 컬럼이 없어 quantity 곱셈 여유가 전혀 없다.
     */
    private static final int MAX_INTEGER_DIGITS = 13;

    @Id
    @GeneratedValue
    @UuidGenerator
    @Column(name = "id", updatable = false, nullable = false)
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "partner_order_id", nullable = false)
    private PartnerOrder partnerOrder;

    /** product-service 의 logical product UUID (FK 없음). */
    @Column(name = "product_id")
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

    /** 공급가액(S). 기존 주문 행은 소급 계산하지 않으므로 null 허용 legacy 컬럼. */
    @Column(name = "supply_amount", precision = 15, scale = 2)
    private BigDecimal supplyAmount;

    /** 부가세(V). 기존 주문 행은 소급 계산하지 않으므로 null 허용 legacy 컬럼. */
    @Column(name = "vat_amount", precision = 15, scale = 2)
    private BigDecimal vatAmount;

    /** 비고 (selectVal3 / specVal 등 legacy 옵션 합성 — 단순 텍스트 보관). */
    @Column(name = "remark", length = 500)
    private String remark;

    /**
     * 출고전표로 전환된 누적 수량 — Phase 2.6a (V8 migration).
     * 잔여 = quantity - convertedQuantity. int 기본값 0 이므로 명시 초기화 불필요.
     */
    @Column(name = "converted_quantity", nullable = false)
    private int convertedQuantity;

    /** 금액 권위 열. 주문도 전표·견적과 같은 네 경로를 사용한다. */
    public enum AmountAuthority {
        PRICE,
        SUPPLY,
        VAT,
        TOTAL
    }

    /** 생성·편집 시 금액을 결정한 원천. legacy 행은 migration에서 PRICE로 명시한다. */
    @Enumerated(EnumType.STRING)
    @Column(name = "amount_authority", length = 10, nullable = false)
    private AmountAuthority amountAuthority;

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
        if (priceVat == null) {
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
        return createFromAuthoritativeAmounts(productId, modelName, productName, categoryKey,
                quantity, priceVat, null, null, null, AmountAuthority.PRICE, remark);
    }

    /** 레거시 주문서웹 가격행 — VAT 포함 합계를 절대값 기준 HALF_UP으로 분리하고 음수를 허용한다. */
    public static PartnerOrderLine createFromLegacyPrice(UUID productId, String modelName,
                                                          String productName, String categoryKey,
                                                          int quantity, BigDecimal priceVat,
                                                          String remark) {
        validateQuantity(quantity);
        if (priceVat == null) throw new IllegalArgumentException("priceVat 필수");
        BigDecimal total = priceVat.multiply(BigDecimal.valueOf(quantity));
        VatAmountCalculator.Split positiveSplit = VatAmountCalculator.splitVatInclusive(
                total.abs(), RoundingMode.HALF_UP);
        VatAmountCalculator.Split split = total.signum() < 0
                ? new VatAmountCalculator.Split(positiveSplit.supplyAmount().negate(),
                        positiveSplit.vatAmount().negate(), total)
                : positiveSplit;
        PartnerOrderLine line = new PartnerOrderLine(productId, modelName, productName,
                categoryKey, quantity, priceVat, remark);
        line.subtotal = total;
        line.supplyAmount = split.supplyAmount();
        line.vatAmount = split.vatAmount();
        line.amountAuthority = AmountAuthority.PRICE;
        line.validateStorableAmounts();
        return line;
    }

    /**
     * 공급가액·부가세·VAT 포함 합계를 권위 열로 생성한다.
     *
     * <p>주문에서 {@code subtotal}은 기존 계약상 VAT 포함 합계이므로 새 컬럼에는 S/V만
     * 추가하고 subtotal을 T로 사용한다. authority에 따라 한 값만 입력 권위로 취급하며,
     * 나머지는 공통 부가세 계산 규칙으로 파생한다.
     */
    public static PartnerOrderLine createFromAuthoritativeAmounts(
            UUID productId, String modelName, String productName, String categoryKey,
            int quantity, BigDecimal priceVat, BigDecimal supplyAmount, BigDecimal vatAmount,
            BigDecimal lineTotal, AmountAuthority authority, String remark) {
        if (authority == null) {
            throw new IllegalArgumentException("금액 권위는 필수입니다");
        }
        validateQuantity(quantity);

        BigDecimal effectivePrice = priceVat;
        BigDecimal resolvedSupply;
        BigDecimal resolvedVat;
        BigDecimal resolvedTotal;
        switch (authority) {
            case PRICE -> {
                requireNonNegative(priceVat, "priceVat");
                resolvedTotal = priceVat.multiply(BigDecimal.valueOf(quantity));
                VatAmountCalculator.Split split = VatAmountCalculator.splitVatInclusive(
                        resolvedTotal, RoundingMode.HALF_UP);
                resolvedSupply = split.supplyAmount();
                resolvedVat = split.vatAmount();
            }
            case SUPPLY -> {
                requireNonNegative(supplyAmount, "공급가액");
                resolvedSupply = supplyAmount;
                resolvedVat = VatAmountCalculator.fromSupply(supplyAmount);
                resolvedTotal = resolvedSupply.add(resolvedVat);
                effectivePrice = resolvedTotal.divide(BigDecimal.valueOf(quantity), 2,
                        RoundingMode.HALF_UP);
            }
            case VAT -> {
                requireNonNegative(supplyAmount, "공급가액");
                requireNonNegative(vatAmount, "부가세");
                resolvedSupply = supplyAmount;
                resolvedVat = vatAmount;
                resolvedTotal = resolvedSupply.add(resolvedVat);
                effectivePrice = resolvedTotal.divide(BigDecimal.valueOf(quantity), 2,
                        RoundingMode.HALF_UP);
            }
            case TOTAL -> {
                requireNonNegative(lineTotal, "합계");
                resolvedTotal = lineTotal;
                VatAmountCalculator.Split split = VatAmountCalculator.splitVatInclusive(lineTotal);
                resolvedSupply = split.supplyAmount();
                resolvedVat = split.vatAmount();
                effectivePrice = resolvedTotal.divide(BigDecimal.valueOf(quantity), 2,
                        RoundingMode.HALF_UP);
            }
            default -> throw new IllegalStateException("지원하지 않는 금액 권위: " + authority);
        }

        PartnerOrderLine line = new PartnerOrderLine(productId, modelName, productName,
                categoryKey, quantity, effectivePrice, remark);
        line.subtotal = resolvedTotal;
        line.supplyAmount = resolvedSupply;
        line.vatAmount = resolvedVat;
        line.amountAuthority = authority;
        // MED-4(#824 R2) — PRICE/SUPPLY/VAT/TOTAL 네 권위 경로가 전부 이 지점으로 수렴하므로
        // 자릿수 가드는 여기 한 곳만 있으면 된다. R1 이전에는 requireNonNegative(부호만 검사)
        // 뿐이라 자릿수 가드 자체가 전혀 없었다(SlipLine/EstimateLine 과 동일 결함군).
        line.validateStorableAmounts();
        return line;
    }

    /** 요청/견적 스냅샷의 공급가액·부가세·합계 경로 하위 호환 진입점. */
    public static PartnerOrderLine createFromAuthoritativeAmounts(
            UUID productId, String modelName, String productName, String categoryKey,
            int quantity, BigDecimal supplyAmount, BigDecimal vatAmount,
            BigDecimal lineTotal, String remark) {
        return createFromAuthoritativeAmounts(productId, modelName, productName, categoryKey,
                quantity, null, supplyAmount, vatAmount, lineTotal, AmountAuthority.VAT, remark);
    }

    /** 단가 권위 생성의 명시적 이름. 주문 confirm/DC 경로가 사용한다. */
    public static PartnerOrderLine createFromPrice(
            UUID productId, String modelName, String productName, String categoryKey,
            int quantity, BigDecimal priceVat, String remark) {
        return create(productId, modelName, productName, categoryKey, quantity, priceVat, remark);
    }

    /** 주문의 VAT 포함 lineTotal은 기존 subtotal의 의미를 그대로 노출한다. */
    public BigDecimal getLineTotal() {
        return this.subtotal;
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

    /**
     * 협업 수정완료 overlay 라인 비고 변경.
     *
     * <p>품목/수량/단가/금액/전환수량 등 주문 핵심 필드는 불변으로 두고, 설명성 보조 필드인
     * remark 만 갱신한다.
     *
     * @param remark 신규 라인 비고. null 허용, 500자 이하.
     * @return 현재 PartnerOrderLine (도메인 메서드 체인용)
     */
    public PartnerOrderLine updateRemark(String remark) {
        if (remark != null && remark.length() > 500) {
            throw new IllegalArgumentException("remark 는 최대 500자입니다");
        }
        this.remark = remark == null || remark.isBlank() ? null : remark.trim();
        return this;
    }

    /** PartnerOrder.addLine 내부 호출 — bidirectional 관계 동기화. */
    void bind(PartnerOrder partnerOrder) {
        this.partnerOrder = partnerOrder;
    }

    private static void validateQuantity(int quantity) {
        if (quantity <= 0) {
            throw new IllegalArgumentException("quantity 는 1 이상");
        }
    }

    private static void requireNonNegative(BigDecimal amount, String label) {
        if (amount == null || amount.signum() < 0) {
            throw new IllegalArgumentException(label + " 는 0 이상 필수입니다");
        }
    }

    /**
     * MED-4(#824 R2) — 실제 DB 컬럼 precision/scale 한계로 "저장 가능성"을 검증한다.
     * SlipLine.validateStorableAmounts 와 동일 sweep.
     */
    private void validateStorableAmounts() {
        validateColumnRange(this.priceVat, "단가");
        validateColumnRange(this.subtotal, "합계");
        validateColumnRange(this.supplyAmount, "공급가액");
        validateColumnRange(this.vatAmount, "부가세");
    }

    /**
     * MED-4(#824 R1) 자릿수 압축표기 우회 방지 — SlipLine.validateColumnRange 와 동일 규칙
     * (stripTrailingZeros 전후로 precision()-scale() 이 불변이므로 이 조합을 쓴다).
     *
     * @param amount 검사할 금액 (null 이면 검사하지 않음 — supplyAmount/vatAmount 는 legacy
     *     주문 행에서 nullable)
     * @param label 오류 메시지에 쓸 필드명
     */
    private static void validateColumnRange(BigDecimal amount, String label) {
        if (amount == null) {
            return;
        }
        BigDecimal stripped = amount.stripTrailingZeros();
        if (stripped.precision() - stripped.scale() > MAX_INTEGER_DIGITS) {
            throw new BusinessException(ErrorCode.INVALID_INPUT,
                    label + "이(가) 너무 큽니다. 정수부 " + MAX_INTEGER_DIGITS + "자리까지 저장할 수 있습니다");
        }
    }
}
