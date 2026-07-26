package com.samhanair.logis.slip.domain;

import com.samhanair.logis.common.entity.BaseEntity;
import com.samhanair.logis.common.financial.VatAmountCalculator;
import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
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

    /**
     * MED-4(#824 R2) — {@code unit_price}/{@code unit_price_with_vat}/{@code vat_amount} 는
     * {@code NUMERIC(15,2)}(V1/V12 migration) — 정수부 최대 13자리.
     */
    private static final int NARROW_MAX_INTEGER_DIGITS = 13;

    /**
     * MED-4(#824 R2) — {@code line_total}/{@code supply_amount} 는 {@code NUMERIC(17,2)}
     * (V1 컨벤션 주석: "수량 곱셈 마진") — 정수부 최대 15자리.
     */
    private static final int WIDE_MAX_INTEGER_DIGITS = 15;

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

    /**
     * 단가 권위 도메인 — #937 재수렴 6차, 개발책임자 결정 A안 (V59 migration).
     *
     * <p>두 단가 컬럼 중 <b>어느 쪽이 사용자 입력이고 어느 쪽이 파생값인지</b>를 저장 시점에
     * 기록한다. 값이 있으면 표시 계층은 휴리스틱 판정 없이 그대로 해석하고, {@code null}
     * (V59 이전 legacy 행)일 때만 현행 휴리스틱으로 추측한다. 상세는 {@link UnitPriceDomain}.
     *
     * <p>🚨 이 필드는 <b>생성 팩토리에서만</b> 정해진다 — 라인 편집은 전부 전량 교체
     * ({@code Slip.replaceLines}/{@code replaceSalesLines})라 실사용 mutator 가 없다.
     * 새 팩토리를 추가하면 반드시 이 값을 함께 정해야 한다.
     */
    @Enumerated(EnumType.STRING)
    @Column(name = "unit_price_domain", length = 20)
    private UnitPriceDomain unitPriceDomain;

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
        // #937 재수렴 6차 A안 — 이 생성자는 VAT 제외 공급 단가를 받아 나머지를 파생시킨다.
        // VAT 포함 입력 팩토리는 아래에서 권위 금액을 덮어쓰며 도메인도 함께 바꾼다.
        this.unitPriceDomain = UnitPriceDomain.SUPPLY;
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
        SlipLine line = new SlipLine(slip, productId, productName, modelName, specification,
                quantity, unitPrice, note, sourceOrderLineId);
        // MED-4(#824 R2) — 이 평문(VAT 미포함) 경로가 POST /api/slips 의 실사용 기본 경로다.
        // R1 은 이 경로에 자릿수 가드를 전혀 연결하지 않아 파생 unitPriceWithVat(=unitPrice*1.1)
        // 이 narrow 컬럼(unit_price_with_vat NUMERIC(15,2))을 실 Postgres 에서 그대로 넘겼다
        // (PM 실측: 13자리 단가 → 14자리 파생값 → 500). 생성 직후 최종 필드 상태를 검증한다.
        line.validateStorableAmounts();
        return line;
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
        return create(slip, productId, productName, modelName, specification, quantity, unitPrice,
                note, null);
    }

    /**
     * VAT 포함 단가 기반 생성 — 단가 부가세포함 전환(2026-06-09 개발책임자 확정, 라인 단위 eCount 방식).
     *
     * <p>사용자 입력 단가는 <b>부가세 포함</b>. 라인 단위로 공급가액/부가세를 분리:
     * <ul>
     *   <li>합계(VAT포함) = {@code 수량 × unitPriceWithVat}</li>
     *   <li>공급가액(supplyAmount) = {@code 합계 ÷ 1.1} 원 단위 절사</li>
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
        VatAmountCalculator.Split vatSplit = VatAmountCalculator.splitVatInclusive(lineInclVat);
        BigDecimal supply = vatSplit.supplyAmount();
        BigDecimal vat = vatSplit.vatAmount();
        BigDecimal supplyUnit = supply.divide(BigDecimal.valueOf(quantity), 2, RoundingMode.HALF_UP);
        // 공급 단가로 일반 생성 후 라인 단위 권위값으로 덮어쓴다.
        SlipLine line = new SlipLine(slip, productId, productName, modelName, specification,
                quantity, supplyUnit, note, sourceOrderLineId);
        line.lineTotal = supply;
        line.supplyAmount = supply;
        line.vatAmount = vat;
        line.unitPriceWithVat = unitPriceWithVat.setScale(2, RoundingMode.HALF_UP);
        // #937 재수렴 6차 A안 — 사용자가 입력한 값은 VAT 포함 단가다(파라미터 자체가 그 계약).
        line.unitPriceDomain = UnitPriceDomain.VAT_INCLUSIVE;
        // MED-4(#824 R2) — R1 은 이 경로(2026-06-09 라인단위 eCount 전환 이후 기본 입력 방식)에
        // 자릿수 가드를 전혀 연결하지 않았다. 위 4개 덮어쓰기 이후 "최종" 필드 상태를 검증해야
        // 실제 저장될 값을 검사하는 것이 된다(생성자 내부에서 검증하면 이후 덮어써질 중간값을
        // 검사하는 셈이라 무의미).
        line.validateStorableAmounts();
        return line;
    }

    /**
     * 화면에서 편집한 공급가액·부가세·VAT 포함 합계와 입력 단가를 권위값으로 보존한다.
     *
     * <p>전표의 {@code lineTotal} 은 기존 계약상 VAT 미포함 공급가액이므로 {@code S} 를 저장한다.
     * 요청의 VAT 포함 합계 {@code T} 는 {@code lineTotalWithVat} 로 검증하되 단가로 역산하지
     * 않는다.
     *
     * <p>🚨 <b>재수렴 4차(#937) 근본수정 — 두 단가 컬럼은 서로 다른 세금 도메인이다.</b>
     * 종전에는 입력 단가를 "화면 왕복 보존" 명목으로 {@code unit_price}·{@code unit_price_with_vat}
     * <b>두 컬럼에 그대로</b> 각인했다. 그러면 화면이 어느 도메인으로 단가를 보내든 두 컬럼 중
     * 하나는 반드시 틀린다 — 화면 단가가 VAT 제외였을 때는 {@code unit_price_with_vat} 가 10%
     * 과소했고(#937 U1), VAT 포함으로 고친 뒤에는 {@code unit_price} 가 10% 과대해져 세금계산서·
     * 매입전표 인쇄의 {@code 단가 × 수량 = 공급가액} 이 깨지고(라이브 실증 2026-07-27:
     * 무수정 재저장만으로 {@code 100000|110000} → {@code 110000|110000}) 감사 이력에 사용자가
     * 하지 않은 "단가 100000 → 110000" 이 찍혔다.
     *
     * <p>화면 단가는 2026-06-09 개발책임자 확정대로 <b>VAT 포함</b>이므로 {@code unitPrice} 는
     * {@code unit_price_with_vat} 에 그대로 보존하고(끝수까지 무손실 — 가격기억 각인 원천),
     * VAT 제외 컬럼 {@code unit_price} 는 권위 공급가액에서 유도한다({@code S ÷ Q}) — 값이
     * 없던 호환 팩토리(아래 오버로드)가 이미 쓰던 것과 같은 계산이다. 이로써 두 컬럼이 각자
     * 자기 도메인의 항등식({@code unit_price × Q = S}, {@code unit_price_with_vat × Q = T})을
     * 만족한다.
     *
     * @param unitPrice 사용자가 입력한 VAT 포함 단가 (0 이상)
     * @param supplyAmount 공급가액 S (원 단위 정수, 0 이상)
     * @param vatAmount 부가세 V (원 단위 정수, 0 이상)
     * @param lineTotalWithVat VAT 포함 합계 T (원 단위 정수, 0 이상)
     * @throws BusinessException 금액·수량·항등식이 유효하지 않으면 INVALID_INPUT
     */
    public static SlipLine createFromAuthoritativeAmounts(
            Slip slip, UUID productId, String productName, String modelName,
            String specification, int quantity, BigDecimal unitPrice,
            BigDecimal supplyAmount, BigDecimal vatAmount, BigDecimal lineTotalWithVat,
            String note, UUID sourceOrderLineId) {
        validatePositive(quantity);
        validateUnitPrice(unitPrice);
        validateAuthoritativeAmounts(supplyAmount, vatAmount, lineTotalWithVat);
        // S/V/T는 화면 권위값이고 단가는 사용자가 직접 입력한 별도 권위값(VAT 포함)이다.
        // VAT 제외 컬럼은 그 권위 공급가액에서 유도한다(재수렴 4차 #937 — 위 javadoc 참고).
        BigDecimal supplyUnit = supplyAmount.divide(BigDecimal.valueOf(quantity), 2,
                RoundingMode.HALF_UP);
        SlipLine line = new SlipLine(slip, productId, productName, modelName, specification,
                quantity, supplyUnit, note, sourceOrderLineId);
        line.lineTotal = supplyAmount;
        line.supplyAmount = supplyAmount;
        line.vatAmount = vatAmount;
        line.unitPriceWithVat = unitPrice;
        // 🚨 #937 재수렴 6차 A안 — 여기가 D-1R6 의 발생 지점이다. 사용자가 화면에서 입력한
        // VAT 포함 단가를 그대로 각인하면서도 "그것이 VAT 포함 입력이라는 사실"을 남기지 않아,
        // 사용자가 공급가액을 단가×수량 에 맞춘 순간(부가세 별도 정정) 저장 상태가 구 BE 오염행
        // (두 컬럼에 같은 VAT 제외 값)과 완전히 같아졌다. 그 결과 표시 계층 휴리스틱이 사용자
        // 입력 100,000 을 110,000 으로 유도했다. 이제 도메인을 함께 남겨 추측을 없앤다.
        line.unitPriceDomain = UnitPriceDomain.VAT_INCLUSIVE;
        line.validateStorableAmounts();
        return line;
    }

    /**
     * 화면에서 편집한 공급가액·부가세·VAT 포함 합계를 권위값으로 보존하는 기존 호환 팩토리.
     * 입력 단가가 없던 내부 호출자의 기존 파생 단가 의미를 유지한다.
     *
     * <p>새 요청 저장 경로는 입력 단가 보존 오버로드를 사용한다.
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
        // #937 재수렴 6차 A안 — 이 호환 팩토리는 입력 단가가 없어 두 컬럼을 모두 권위 금액에서
        // 유도한다. unit_price_with_vat 는 VAT 포함 합계 T ÷ Q 이므로 도메인은 VAT 포함이다
        // (표시 계층이 이 값을 그대로 써도 T 항등식이 성립한다).
        line.unitPriceDomain = UnitPriceDomain.VAT_INCLUSIVE;
        // MED-4(#824 R2) — R1 의 validateAuthoritativeAmounts 는 입력 3값만 단일 임계값(15)으로
        // 검사해 quantity=1 처럼 나눗셈 마진이 없는 경우 파생 unitPriceWithVat(narrow 컬럼,
        // 13자리 한계)이 여전히 overflow 될 수 있었다. 최종 필드 상태를 다시 검증한다.
        line.validateStorableAmounts();
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
            // #937 재수렴 6차 A안 — 금액을 그대로 승계하므로 도메인도 그대로 승계한다. 원본이
            // legacy(null)면 사본도 legacy 로 남겨야 사본이 원본과 <b>같은 단가를 표시</b>한다
            // (추측으로 채우면 원본과 사본이 다른 단가를 보이게 된다).
            line.unitPriceDomain = source.unitPriceDomain;
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
     * @param unitPriceDomain 캡처 시점 단가 권위 도메인 (#937 재수렴 6차 A안 — 캡처 당시 값을
     *        그대로 승계한다. 도메인 컬럼이 없던 구 스냅샷은 null 이며, 그 경우 복원본도
     *        legacy 로 남아 <b>복원 전과 같은 단가를 표시</b>한다. 추측으로 채우면 복원만으로
     *        표시 단가가 바뀐다.)
     */
    void restoreAuthoritativeAmounts(BigDecimal lineTotal, BigDecimal supplyAmount,
                                     BigDecimal vatAmount, BigDecimal unitPriceWithVat,
                                     UnitPriceDomain unitPriceDomain) {
        if (unitPriceWithVat == null) {
            return;
        }
        this.unitPriceWithVat = unitPriceWithVat;
        this.unitPriceDomain = unitPriceDomain;
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
        validateStorableAmounts();
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
        // #937 재수렴 6차 A안 — 이 mutator 는 VAT 제외 단가를 권위로 받아 나머지를 파생시키므로
        // 도메인도 SUPPLY 로 옮겨간다(생성자와 같은 계약). 실사용 호출자는 없다 — 라인 편집은
        // 전량 교체 경로다 — 그러나 "쓰는 지점"이므로 도메인을 미정으로 두지 않는다.
        this.unitPriceDomain = UnitPriceDomain.SUPPLY;
        validateStorableAmounts();
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
     * 공통 부가세 계산기의 원 단위 절사 규칙을 사용한다.
     */
    private static BigDecimal computeVat(BigDecimal supplyAmount) {
        return VatAmountCalculator.fromSupply(supplyAmount).setScale(2);
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

    /**
     * 부호 + 소수부만 검사한다(음수/소수 원단위 위반). 자릿수(저장 가능 범위) 검사는
     * {@link #validateStorableAmounts()} 로 분리했다 — MED-4(#824 R2). 이유: 이 메서드는
     * {@code createFromAuthoritativeAmounts} 의 "입력 원본" 3값(공급가액/부가세/합계)만
     * 검사하는데, 실제로 컬럼에 저장되는 값은 quantity 로 나눈 <b>파생값</b>(supplyUnit,
     * unitPriceWithVat)이다. 입력값이 자기 자릿수 한계를 통과해도 나눗셈 이후 파생값이 narrow
     * 컬럼(13자리)을 넘을 수 있어(quantity=1 이면 나눗셈 마진이 0), 자릿수 검사는 "최종 저장될
     * 필드"를 대상으로 사후에 한 번만 하는 것이 유일하게 정확하다.
     */
    private static void validateAmount(BigDecimal amount, String label) {
        if (amount == null || amount.signum() < 0 || amount.stripTrailingZeros().scale() > 0) {
            throw new BusinessException(ErrorCode.INVALID_INPUT,
                    label + "은 0 이상의 원 단위 정수여야 합니다");
        }
    }

    /**
     * MED-4(#824 R2) — 실제 DB 컬럼 precision/scale 한계로 "저장 가능성"을 검증한다.
     * 모든 생성 팩토리(create/createFromVatInclusive/createFromAuthoritativeAmounts)와
     * 금액을 재계산하는 mutator(changeQuantity/changeUnitPrice) 의 마지막 단계에서
     * <b>최종 필드 상태</b>를 검사하도록 호출한다 — R1 이 실서버에서 500 을 낸 두 원인을
     * 구조적으로 막는다:
     * <ol>
     *   <li>경로 누락 — create()/createFromVatInclusive() 는 R1 가드를 아예 호출하지 않았다.
     *       이제 두 경로 모두 반환 직전 이 메서드를 거친다.</li>
     *   <li>임계값 불일치 — R1 은 모든 필드에 정수부 15자리를 적용했지만 실제로는
     *       unit_price/unit_price_with_vat/vat_amount 가 {@code NUMERIC(15,2)}(13자리 한계)
     *       다. 컬럼별 실제 한계로 각자 검사한다.</li>
     * </ol>
     */
    private void validateStorableAmounts() {
        validateColumnRange(this.unitPrice, "단가", NARROW_MAX_INTEGER_DIGITS);
        validateColumnRange(this.unitPriceWithVat, "VAT 포함 단가", NARROW_MAX_INTEGER_DIGITS);
        validateColumnRange(this.vatAmount, "부가세", NARROW_MAX_INTEGER_DIGITS);
        validateColumnRange(this.lineTotal, "라인 합계", WIDE_MAX_INTEGER_DIGITS);
        validateColumnRange(this.supplyAmount, "공급가액", WIDE_MAX_INTEGER_DIGITS);
    }

    /**
     * MED-4(#824 R1) 자릿수 압축표기 우회 방지 — stripTrailingZeros() 단독으로는 1E+17
     * (unscaled=1, scale=-17) 이 precision=1 로 측정돼 통과한다. precision()-scale() 은
     * stripTrailingZeros 전후로 불변(값의 실제 정수부 자릿수)이므로 이 조합을 쓴다.
     *
     * @param amount 검사할 금액 (null 이면 검사하지 않음 — unitPriceWithVat 등 nullable 컬럼)
     * @param label 오류 메시지에 쓸 필드명
     * @param maxIntegerDigits 이 필드가 실제로 저장될 컬럼의 정수부 최대 자릿수
     */
    private static void validateColumnRange(BigDecimal amount, String label, int maxIntegerDigits) {
        if (amount == null) {
            return;
        }
        BigDecimal stripped = amount.stripTrailingZeros();
        if (stripped.precision() - stripped.scale() > maxIntegerDigits) {
            throw new BusinessException(ErrorCode.INVALID_INPUT,
                    label + "이(가) 너무 큽니다. 정수부 " + maxIntegerDigits + "자리까지 저장할 수 있습니다");
        }
    }
}
