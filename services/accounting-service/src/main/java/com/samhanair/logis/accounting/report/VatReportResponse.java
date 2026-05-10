package com.samhanair.logis.accounting.report;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;

/**
 * 부가세 신고서 (VAT Report) 응답 DTO.
 *
 * <p>집계 대상: TaxInvoice 중 ISSUED 상태만 (DRAFT / CANCELLED 제외).
 * 매출(SALES) / 매입(PURCHASE) 분기 집계 후 납부세액 = 매출VAT - 매입VAT 산출.
 *
 * <p>신고 기한 규칙 (한국 부가가치세법):
 * <ul>
 *   <li>1분기(1~3월): 당해연도 4월 25일</li>
 *   <li>2분기(4~6월): 당해연도 7월 25일</li>
 *   <li>3분기(7~9월): 당해연도 10월 25일</li>
 *   <li>4분기(10~12월): 다음연도 1월 25일</li>
 *   <li>복수 분기 또는 단월의 경우 toDate 기준 분기 기한 표시</li>
 * </ul>
 *
 * @param period               표시 기간 문자열 ("2026-04" 또는 "2026-04 ~ 2026-06")
 * @param fromDate             집계 시작 일자
 * @param toDate               집계 종료 일자
 * @param salesSupplyAmount    매출 공급가액 합계
 * @param salesVatAmount       매출 부가세 합계
 * @param salesTotalAmount     매출 총액 (공급가액 + 부가세)
 * @param salesInvoiceCount    매출 세금계산서 건수
 * @param purchaseSupplyAmount 매입 공급가액 합계
 * @param purchaseVatAmount    매입 부가세 합계
 * @param purchaseTotalAmount  매입 총액 (공급가액 + 부가세)
 * @param purchaseInvoiceCount 매입 세금계산서 건수
 * @param vatPayable           납부세액 = 매출VAT - 매입VAT (음수 = 환급)
 * @param filingDeadline       신고 기한 ("2026-07-25" 형식)
 * @param generatedAt          보고서 생성 시각
 */
public record VatReportResponse(
        String period,
        LocalDate fromDate,
        LocalDate toDate,
        BigDecimal salesSupplyAmount,
        BigDecimal salesVatAmount,
        BigDecimal salesTotalAmount,
        int salesInvoiceCount,
        BigDecimal purchaseSupplyAmount,
        BigDecimal purchaseVatAmount,
        BigDecimal purchaseTotalAmount,
        int purchaseInvoiceCount,
        BigDecimal vatPayable,
        String filingDeadline,
        LocalDateTime generatedAt
) {}
