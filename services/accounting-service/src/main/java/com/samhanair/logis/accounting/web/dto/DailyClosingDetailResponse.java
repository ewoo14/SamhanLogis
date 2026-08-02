package com.samhanair.logis.accounting.web.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;

/**
 * 일별 세금계산서 마감 detail (PR-E2 BE-A12).
 *
 * <p>legacy GAS 12번 "일마감 프로그램" — 일별 매출/세금계산서/할인 detail. sourceKind
 * (TAX_INVOICE/SALES_SLIP/PURCHASE_SLIP) 별 조회이며, S2c 로 전표 경로도 재검증 필드를 노출한다.
 *
 * <p>{@link MonthEndCloseService} 의 OPEN/CLOSED 기간 헤더와 별개로 endpoint 단독 조회 — 마감
 * 전후 모두 호출 가능 (read-only).
 *
 * @param date 대상 일자
 * @param totalTaxInvoiceCount 발행된 세금계산서 건수 (ISSUED 상태)
 * @param totalSupply 공급가액 합
 * @param totalVat 세액 합
 * @param totalAmount 합계
 * @param totalDiscount 할인 합 (분개 라인 memo 에 "할인" 포함되거나 별도 계정 — 본 단계 placeholder 0)
 * @param taxInvoices 일별 세금계산서 detail (slipNo + 거래처 + 합계)
 * @param productSummaries 모델별 매출 합계 (top N)
 */
public record DailyClosingDetailResponse(
        LocalDate date,
        int totalTaxInvoiceCount,
        BigDecimal totalSupply,
        BigDecimal totalVat,
        BigDecimal totalAmount,
        BigDecimal totalDiscount,
        List<DailyTaxInvoice> taxInvoices,
        List<DailyProductLine> productSummaries) {

    /** 일별 세금계산서 1건 — 발행번호 / 사업자번호 / 거래처 / 합계. */
    public record DailyTaxInvoice(
            String taxInvoiceNo,
            String salesSlipNo,
            String sourceSlipNo,
            String bizNo,
            String partnerName,
            BigDecimal supplyAmount,
            BigDecimal vatAmount,
            BigDecimal totalAmount) {
    }

    /**
     * 모델별 detail (product-service 마스터 lookup + 단가변동 재검증 결과).
     *
     * <p><b>PURCHASE(매입) 경로 유의</b>: release/delivery/fixedDc referent 는 삼한의 <b>판매(출고)</b>
     * 기준 정가·할인정책이다. PURCHASE_SLIP/매입 세금계산서에도 동일 재검증 엔진이 적용되나, 매입단가를
     * 자사 판매기준과 대조하는 것이라 {@code verified}/{@code expectedRate}는 <b>참고용</b>이며 정식
     * 매입단가 감사가 아니다(#773 spec §6.6.5 — PURCHASE 재검증 의미론 flag). S4(FE 렌더) 착수 전 매입
     * 재검증 노출 방식은 개발책임자 확정 대상.
     */
    public record DailyProductLine(
            @Schema(description = "품명 — 재검증 집계 그룹 키(원본 라벨). product-service 마스터 lookup 대상")
            String productName,
            @Schema(description = "모델 토큰 — 실 모델코드만(extractModelTokenOrNull). 운임/서비스 등 미매치는 "
                    + "null → FE '—'. 재검증 분기 토큰과 동일 clean() 기반이라 표시↔판정 정합")
            String modelName,
            @Schema(description = "판매 당시 정규화된 GAS schedule 카테고리 키. 미상은 UNKNOWN")
            String categoryKey,
            BigDecimal quantity,
            BigDecimal supplyAmount,
            @Schema(description = "원천 전표의 VAT 포함 실제 단가(공급가액+부가세 ÷ 수량). 수량 0이면 null")
            BigDecimal actualUnitPrice,
            @Schema(description = "적용 출고가(price_history 시점 정가). 미매칭·정가결측 시 null")
            BigDecimal releasePrice,
            @Schema(description = "적용 납품가(price_history). 미매칭·정가결측 시 null")
            BigDecimal deliveryPrice,
            @Schema(description = "기대 할인율(정수 %). 0 은 유효한 무할인이며 null(해당 없음/비교 불가)과 "
                    + "구분됨. 운임/액세서리/default 분기는 null")
            Integer expectedRate,
            @Schema(description = "출고가 대비 유효 할인율(정수 %). 운임/절삭/액세서리/default 분기에서는 "
                    + "판정 근거가 아닌 참고값. 수량 0 등 판정 불가 시 null")
            Integer actualRate,
            @Schema(description = "싱글중대형 실제 DC액(출고가 - VAT 포함 유효단가). 다른 계열 또는 판정 불가 시 null")
            BigDecimal discountAmount,
            @Schema(description = "확인 판정. true=정합·false=불일치·null=판정 불가(revalidationStatus 로 사유 구분)")
            Boolean verified,
            @Schema(description = "재검증 사유",
                    allowableValues = {"VERIFIED", "NOT_FOUND", "AMBIGUOUS", "MISSING_REFERENT",
                            "NOT_MEASURABLE", "OUT_OF_SCOPE"})
            String revalidationStatus) {

        /** 기존 응답 생성자 호환 — 카테고리 축은 UNKNOWN으로 명시한다. */
        public DailyProductLine(String productName, String modelName, BigDecimal quantity,
                                BigDecimal supplyAmount, BigDecimal releasePrice,
                                BigDecimal deliveryPrice, Integer expectedRate, Integer actualRate,
                                Boolean verified, String revalidationStatus) {
            this(productName, modelName, "UNKNOWN", quantity, supplyAmount, null,
                    releasePrice, deliveryPrice, expectedRate, actualRate, null,
                    verified, revalidationStatus);
        }
    }
}
