package com.samhanair.logis.accounting.report;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;

/**
 * 법인세 신고서 (Corporate Tax Report) 응답 DTO — 간소형.
 *
 * <p>세율 적용 구조 (한국 법인세법 §55 기준, 2023년 이후):
 * <pre>
 *   과세표준 2억 이하             : 9%
 *   과세표준 2억 초과 ~ 200억 이하 : 19%  (2억 × 9% + 초과분 × 19%)
 *   과세표준 200억 초과 ~ 3000억 이하 : 21%
 *   과세표준 3000억 초과           : 24%
 * </pre>
 *
 * <p>세무조정은 현재 간소화 — addedDeductions / subtractedDeductions 모두 0 (추후 확장).
 * 신고 기한: 사업연도 종료일로부터 3개월 이내 (예: 12/31 결산 법인 → 다음해 3/31).
 *
 * @param fiscalYear              사업연도 (예: 2026)
 * @param fromDate                사업연도 시작 일자 (2026-01-01)
 * @param toDate                  사업연도 종료 일자 (2026-12-31)
 * @param incomeBeforeTax         법인세차감전순이익 (손익계산서 집계)
 * @param addedDeductions         가산조정 (현재 0 — 추후 확장)
 * @param subtractedDeductions    차감조정 (현재 0 — 추후 확장)
 * @param taxableIncome           과세표준 = incomeBeforeTax + addedDeductions - subtractedDeductions
 * @param calculatedTax           산출세액 (단계별 세율 적용)
 * @param taxAlreadyPaid          기납부세액 (예정신고 등 — 현재 0)
 * @param taxPayable              차감납부세액 = calculatedTax - taxAlreadyPaid
 * @param filingDeadline          신고 기한 ("2027-03-31" 형식 — 결산일 +3개월)
 * @param generatedAt             보고서 생성 시각
 */
public record CorporateTaxReportResponse(
        int fiscalYear,
        LocalDate fromDate,
        LocalDate toDate,
        BigDecimal incomeBeforeTax,
        BigDecimal addedDeductions,
        BigDecimal subtractedDeductions,
        BigDecimal taxableIncome,
        BigDecimal calculatedTax,
        BigDecimal taxAlreadyPaid,
        BigDecimal taxPayable,
        String filingDeadline,
        LocalDateTime generatedAt
) {}
