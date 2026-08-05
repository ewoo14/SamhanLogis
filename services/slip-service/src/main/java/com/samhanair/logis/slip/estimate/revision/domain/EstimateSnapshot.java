package com.samhanair.logis.slip.estimate.revision.domain;

import com.fasterxml.jackson.annotation.JsonInclude;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;
import com.samhanair.logis.slip.estimate.web.dto.BundleSetOptions;

/**
 * 견적 full-snapshot 직렬화 DTO (권한 재편 Phase 2.2).
 *
 * <p>{@link com.samhanair.logis.slip.estimate.domain.Estimate} 헤더 전 필드 + 라인 배열
 * ({@link Line})을 한 시점의 불변 스냅샷으로 담는다. {@code estimate_revisions.snapshot}
 * (JSONB) 컬럼에 Jackson 으로 직렬화/역직렬화된다.
 *
 * <p>JPA 프록시/lazy 연관 직렬화를 회피하기 위해 entity 가 아닌 전용 record 로 분리한다.
 * point-in-time 복원 시 이 스냅샷을 역직렬화해 헤더를 덮어쓰고 라인을 전량 교체한다.
 *
 * <p>UUID 비공개 가드: 화면 표시는 {@code partnerName} 등 비즈니스 식별자를 사용하고,
 * UUID 필드는 복원 시 entity 재구성용으로만 보존한다.
 *
 * <p>{@link com.samhanair.logis.slip.revision.domain.SlipSnapshot} 미러.
 *
 * @param estimateNo 견적번호 스냅샷 (yyyy/MM/dd-N)
 * @param estimateDate 견적 날짜
 * @param partnerId 거래처 UUID (복원용)
 * @param partnerName 거래처명 스냅샷
 * @param partnerBusinessNo 거래처 사업자번호 스냅샷
 * @param partnerAddress 거래처 주소 스냅샷
 * @param validUntil 견적 유효기간
 * @param memo 비고
 * @param lines 라인 스냅샷 배열
 */
@JsonInclude(JsonInclude.Include.NON_NULL)
public record EstimateSnapshot(
        String estimateNo,
        LocalDate estimateDate,
        UUID partnerId,
        String partnerName,
        String partnerBusinessNo,
        String partnerAddress,
        LocalDate validUntil,
        String memo,
        List<Line> lines) {

    /**
     * 견적 라인 1건의 스냅샷.
     *
     * <p>세트 계보 2필드는 R6-H3 신규 — 버전이력 복원 시 세트 구성품이 일반 라인으로 평면화되어
     * 이후 저장마다 배분가가 가격기억(LINE_SAVE)에 각인되는 오염을 막는다. 둘 다 nullable 이므로
     * 계보 필드가 없는 <b>구 JSONB 스냅샷도 null 로 안전하게 역직렬화</b>되며(하위호환), 일반
     * 라인은 {@code NON_NULL} 정책으로 직렬화에서 생략된다.
     *
     * <p>{@code unitPriceWithVat} 는 R6 후속(#822, 라이브 QA 시나리오 16b) 신규 — 종전에는 이
     * 필드가 캡처되지 않아 복원 시 {@code EstimateLine.create}(공급 semantics) 재생성으로
     * {@code unit_price_with_vat} 가 전량 NULL 화됐고, #809 R5-H6 의 provenance 규칙
     * (null=legacy 공급단가 입력)에 따라 편집 폼이 공급단가를 "단가(VAT포함)"로 오표시했다.
     * {@link com.samhanair.logis.slip.revision.domain.SlipSnapshot.Line#unitPriceWithVat} 미러.
     * nullable — 공급단가 입력 라인(legacy)과 필드가 없는 구 JSONB 스냅샷은 null 역직렬화(하위호환).
     *
     * @param productId 제품 UUID (복원용)
     * @param productName 제품명 스냅샷
     * @param modelName 모델명 스냅샷
     * @param specification 규격
     * @param quantity 수량
     * @param unitPrice 단가 (공급 단가 — VAT 포함 입력 라인은 배분된 비권위값)
     * @param supplyAmount 공급가액 (단가 × 수량)
     * @param vatAmount 부가세 (공급가액 × 10%)
     * @param lineTotal 라인 합계 (공급가액 + 부가세)
     * @param note 라인 메모
     * @param unitPriceWithVat VAT 포함 단가 권위값 (#822 — 공급단가 입력 라인/구 스냅샷은 null,
     *        non-null 이면 복원 시 {@code EstimateLine.createFromVatInclusive} 로 권위 복원)
     * @param setHead 세트 전개 그룹 첫 구성품 여부 (R6-H3, head 만 {@code true} — 일반 라인/구
     *        스냅샷은 null, 복원 시 {@code Boolean.TRUE.equals} 로 판정)
     * @param parentSetModel 세트 구성품일 때 부모 세트 modelCode (R6-H3 — 일반 라인/구 스냅샷은 null)
     */
    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record Line(
            UUID productId,
            String productName,
            String modelName,
            String specification,
            int quantity,
            BigDecimal unitPrice,
            BigDecimal supplyAmount,
            BigDecimal vatAmount,
            BigDecimal lineTotal,
            String note,
            BigDecimal unitPriceWithVat,
            Boolean setHead,
            String parentSetModel,
            BundleSetOptions bundleSetOptions) {

        /**
         * 세트 계보/VAT 포함 단가 없는 구 시그니처 호환 생성자 — 기존 호출처(테스트 포함)와
         * 계보·권위단가 무관 라인 생성용.
         */
        public Line(UUID productId, String productName, String modelName, String specification,
                    int quantity, BigDecimal unitPrice, BigDecimal supplyAmount,
                    BigDecimal vatAmount, BigDecimal lineTotal, String note) {
                    this(productId, productName, modelName, specification, quantity, unitPrice,
                    supplyAmount, vatAmount, lineTotal, note, null, null, null, null);
        }

        /**
         * VAT 포함 단가 없는 R6-H3 시그니처 호환 생성자 — 계보만 있는 기존 호출처 유지용
         * (#822 이전 스냅샷 형상).
         */
        public Line(UUID productId, String productName, String modelName, String specification,
                    int quantity, BigDecimal unitPrice, BigDecimal supplyAmount,
                    BigDecimal vatAmount, BigDecimal lineTotal, String note,
                    Boolean setHead, String parentSetModel) {
                    this(productId, productName, modelName, specification, quantity, unitPrice,
                    supplyAmount, vatAmount, lineTotal, note, null, setHead, parentSetModel, null);
        }

        /** BUNDLE 옵션이 없던 구 스냅샷 생성자 하위호환 오버로드. */
        public Line(UUID productId, String productName, String modelName, String specification,
                    int quantity, BigDecimal unitPrice, BigDecimal supplyAmount,
                    BigDecimal vatAmount, BigDecimal lineTotal, String note,
                    BigDecimal unitPriceWithVat, Boolean setHead, String parentSetModel) {
            this(productId, productName, modelName, specification, quantity, unitPrice,
                    supplyAmount, vatAmount, lineTotal, note, unitPriceWithVat, setHead,
                    parentSetModel, null);
        }
    }
}
