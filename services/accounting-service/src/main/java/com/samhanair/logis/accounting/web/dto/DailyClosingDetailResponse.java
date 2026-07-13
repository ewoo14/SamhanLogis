package com.samhanair.logis.accounting.web.dto;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;

/**
 * 일별 세금계산서 마감 detail (PR-E2 BE-A12).
 *
 * <p>legacy GAS 12번 "일마감 프로그램" — 일별 매출/세금계산서/할인 detail.
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

    /** 모델별 매출 detail (product-service 마스터 lookup 결과). */
    public record DailyProductLine(
            String productName,
            String modelName,
            BigDecimal quantity,
            BigDecimal supplyAmount,
            BigDecimal releasePrice,
            BigDecimal deliveryPrice,
            Integer expectedRate,
            Integer actualRate,
            Boolean verified,
            String revalidationStatus) {
    }
}
