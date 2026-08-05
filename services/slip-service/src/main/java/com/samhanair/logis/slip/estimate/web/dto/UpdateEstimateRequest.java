package com.samhanair.logis.slip.estimate.web.dto;

import jakarta.validation.Valid;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.Size;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

/**
 * 견적서 수정 요청 — DRAFT/SENT 단계에서 헤더 + 라인 일괄 갱신.
 *
 * <p>{@code lines} 가 null 이면 라인 보존, 비어있는 list 면 모든 라인 제거,
 * 값이 있으면 기존 라인 모두 제거 후 신규 라인으로 replace (단순 정책).
 *
 * <p>{@code lineIdContract} 는 D-R8-9 신규 — 요청 레벨 계약 마커. 상세는
 * {@link com.samhanair.logis.slip.service.LineIdContractGate}.
 */
public record UpdateEstimateRequest(
        UUID partnerId,
        @Size(max = 100) String partnerName,
        @Size(max = 20) String partnerBusinessNo,
        @Size(max = 200) String partnerAddress,
        LocalDate validUntil,
        @Size(max = 1000) String memo,
        @Size(max = 100, message = "견적 라인은 최대 100건까지 저장할 수 있습니다")
        @Valid List<EstimateLineUpdate> lines,
        /**
         * [D-R8-9] lineId 계약 마커 — {@code true} 만 계약 선언으로 인정한다. 전표
         * {@code SlipUpdateRequest.lineIdContract} 의 미러이며 같은 게이트가 판정한다.
         *
         * <p>{@code lines} 가 null(라인 보존) 인 헤더 전용 수정에도 마커를 요구한다 — 마커는
         * 라인이 아니라 <b>클라이언트 버전</b>에 대한 선언이고, 구 클라이언트는 헤더 수정에서도
         * {@code partnerId} 를 보내지 않아 가격기억을 원 거래처에 각인시키기 때문이다.
         */
        Boolean lineIdContract) {

    /**
     * 교체할 견적 라인.
     *
     * <p><b>D-R8-9 — 호환 생성자 폐지</b>: 종전에는 lineId(및 setOptions/priceVatInclusive)를
     * 생략할 수 있는 호환 생성자 3개를 두어 호출자가 <b>계보 승계 포기를 침묵으로</b> 선택할 수
     * 있었다. 그 침묵이 곧 데이터 손실 경로였으므로(R8-QA-8 이 비판한 "호환 생성자가 파괴를
     * 통과시킨다" 패턴) 단일 canonical 로 좁혀 <b>모든 호출자가 lineId 의도를 명시</b>하게 한다.
     * 전표 {@code SlipUpdateRequest.LineRequest} 가 같은 이유로 이미 폐지했고, 견적만 남겨두면
     * 이 PR 이 8라운드째 겪은 <b>전표/견적 비대칭</b>이 그대로 재발한다.
     *
     * <p>신규 라인은 {@code lineId} 에 {@code null} 을 명시한다.
     */
    public record EstimateLineUpdate(
            @NotNull UUID productId,
            /**
             * 수정 시점의 품목명 snapshot.
             *
             * <p>수정 PUT은 클라이언트 snapshot을 권위값으로 받는다. 누락/공백을 카탈로그 이름으로
             * 암묵 보강하지 않고 매입·매출과 동일하게 400으로 거부해 경로 비대칭과 DB 409 오인을 막는다.
             */
            @NotBlank(message = "품목명은 필수입니다.") @Size(max = 200) String productName,
            @Size(max = 100) String modelName,
            @Size(max = 50) String specification,
            @NotNull @Positive Integer quantity,
            @NotNull @DecimalMin("0.00") BigDecimal unitPrice,
            @Size(max = 200) String note,
            BundleSetOptions setOptions,
            /** 단가 부가세포함 여부 — true 면 unitPrice 가 VAT 포함 단가(라인 단위 분해). 2026-06-09. */
            Boolean priceVatInclusive,
            /**
             * 기존 상세 응답 라인의 영속 UUID 왕복값. payload 전용이며 화면에 표시하지 않는다.
             * null 이면 신규 라인으로 처리하고 세트 계보를 승계하지 않는다.
             */
            UUID lineId,
            /** 권위 공급가액 S — 부가세·합계와 함께 보낼 때만 적용한다. */
            BigDecimal supplyAmount,
            /** 권위 부가세 V — 공급가액·합계와 함께 보낼 때만 적용한다. */
            BigDecimal vatAmount,
            /** 권위 VAT 포함 합계 T — 견적 lineTotal 컬럼과 동일한 의미다. */
            BigDecimal lineTotalWithVat,
            String specificationSource) {
        /** 기존 lineId 계약을 사용하는 호출자용 — VAT 권위 필드는 모두 생략한다. */
        public EstimateLineUpdate(UUID productId, String productName, String modelName,
                                  String specification, Integer quantity, BigDecimal unitPrice,
                                  String note, BundleSetOptions setOptions, Boolean priceVatInclusive,
                                  UUID lineId) {
            this(productId, productName, modelName, specification, quantity, unitPrice, note,
                    setOptions, priceVatInclusive, lineId, null, null, null, null);
        }
    }
}
