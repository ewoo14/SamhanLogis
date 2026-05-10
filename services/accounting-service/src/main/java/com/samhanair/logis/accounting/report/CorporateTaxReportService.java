package com.samhanair.logis.accounting.report;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.YearMonth;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 법인세 신고서 (Corporate Tax Report) 집계 Service — 간소형.
 *
 * <p>과세표준 = 손익계산서 법인세차감전순이익 + 가산조정 - 차감조정.
 * 현재 세무조정(가산/차감)은 0으로 간소화. 추후 세무조정 항목 도메인 확장 시 변경.
 *
 * <p>한국 법인세율 (법인세법 §55, 2023년 이후 세율):
 * <table summary="법인세율표">
 *   <tr><th>과세표준 구간</th><th>세율</th></tr>
 *   <tr><td>2억 이하</td><td>9%</td></tr>
 *   <tr><td>2억 초과 ~ 200억 이하</td><td>19%</td></tr>
 *   <tr><td>200억 초과 ~ 3000억 이하</td><td>21%</td></tr>
 *   <tr><td>3000억 초과</td><td>24%</td></tr>
 * </table>
 *
 * <p>신고 기한: 사업연도 종료일 + 3개월 (법인세법 §60①).
 * 예: 12월 결산 법인 → 다음해 3월 31일.
 */
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class CorporateTaxReportService {

    // ── 한국 법인세율 구간 (법인세법 §55, 2023년 이후) ──
    private static final BigDecimal TIER1_LIMIT = new BigDecimal("200000000");     // 2억
    private static final BigDecimal TIER2_LIMIT = new BigDecimal("20000000000");   // 200억
    private static final BigDecimal TIER3_LIMIT = new BigDecimal("300000000000");  // 3000억

    private static final BigDecimal RATE_TIER1 = new BigDecimal("0.09");  // 9%
    private static final BigDecimal RATE_TIER2 = new BigDecimal("0.19");  // 19%
    private static final BigDecimal RATE_TIER3 = new BigDecimal("0.21");  // 21%
    private static final BigDecimal RATE_TIER4 = new BigDecimal("0.24");  // 24%

    private final IncomeStatementService incomeStatementService;

    /**
     * 사업연도 법인세 신고서 조회.
     *
     * <p>사업연도 1~12월 손익계산서를 집계하여 법인세차감전순이익을 산출한 후
     * 단계별 세율을 적용한다. 과세표준이 0 이하(결손)인 경우 산출세액 = 0.
     *
     * @param fiscalYear 사업연도 (예: 2026)
     * @return 법인세 신고서 응답 DTO
     */
    public CorporateTaxReportResponse findByFiscalYear(int fiscalYear) {
        LocalDate fromDate = LocalDate.of(fiscalYear, 1, 1);
        LocalDate toDate   = LocalDate.of(fiscalYear, 12, 31);

        // 손익계산서 집계 (사업연도 전체)
        IncomeStatementResponse is = incomeStatementService.findByPeriodRange(
                YearMonth.of(fiscalYear, 1),
                YearMonth.of(fiscalYear, 12));
        BigDecimal incomeBeforeTax = is.incomeBeforeTax();

        // 세무조정 (현재 간소화 — 0)
        BigDecimal addedDeductions      = BigDecimal.ZERO;
        BigDecimal subtractedDeductions = BigDecimal.ZERO;

        // 과세표준
        BigDecimal taxableIncome = incomeBeforeTax
                .add(addedDeductions)
                .subtract(subtractedDeductions);

        // 산출세액 (결손 시 0)
        BigDecimal calculatedTax = taxableIncome.signum() <= 0
                ? BigDecimal.ZERO
                : computeProgressiveTax(taxableIncome);

        // 기납부세액 (현재 0 — 추후 예정신고 도메인 추가 시 확장)
        BigDecimal taxAlreadyPaid = BigDecimal.ZERO;

        BigDecimal taxPayable = calculatedTax.subtract(taxAlreadyPaid);

        // 신고 기한: toDate + 3개월
        String filingDeadline = toDate.plusMonths(3).toString();

        return new CorporateTaxReportResponse(
                fiscalYear,
                fromDate,
                toDate,
                incomeBeforeTax,
                addedDeductions,
                subtractedDeductions,
                taxableIncome,
                calculatedTax,
                taxAlreadyPaid,
                taxPayable,
                filingDeadline,
                LocalDateTime.now()
        );
    }

    /**
     * 단계별 법인세 산출세액 계산.
     *
     * <p>과세표준 구간별 세율 누진 적용 (법인세법 §55):
     * <ul>
     *   <li>2억 이하: 과세표준 × 9%</li>
     *   <li>2억 초과 200억 이하: 2억 × 9% + (과세표준 - 2억) × 19%</li>
     *   <li>200억 초과 3000억 이하: 위 누적 + (과세표준 - 200억) × 21%</li>
     *   <li>3000억 초과: 위 누적 + (과세표준 - 3000억) × 24%</li>
     * </ul>
     *
     * @param taxableIncome 과세표준 (양수 보장 — 호출 전 검증)
     * @return 산출세액 (소수점 이하 반올림)
     */
    BigDecimal computeProgressiveTax(BigDecimal taxableIncome) {
        BigDecimal tax = BigDecimal.ZERO;

        if (taxableIncome.compareTo(TIER1_LIMIT) <= 0) {
            // 2억 이하: 9%
            tax = taxableIncome.multiply(RATE_TIER1);
        } else if (taxableIncome.compareTo(TIER2_LIMIT) <= 0) {
            // 2억 이하분: 2억 × 9%
            // 2억 초과분: (과표 - 2억) × 19%
            tax = TIER1_LIMIT.multiply(RATE_TIER1)
                    .add(taxableIncome.subtract(TIER1_LIMIT).multiply(RATE_TIER2));
        } else if (taxableIncome.compareTo(TIER3_LIMIT) <= 0) {
            // 200억 이하 누적분
            BigDecimal tier2Tax = TIER1_LIMIT.multiply(RATE_TIER1)
                    .add(TIER2_LIMIT.subtract(TIER1_LIMIT).multiply(RATE_TIER2));
            // 200억 초과분: (과표 - 200억) × 21%
            tax = tier2Tax.add(taxableIncome.subtract(TIER2_LIMIT).multiply(RATE_TIER3));
        } else {
            // 3000억 이하 누적분
            BigDecimal tier2Tax = TIER1_LIMIT.multiply(RATE_TIER1)
                    .add(TIER2_LIMIT.subtract(TIER1_LIMIT).multiply(RATE_TIER2));
            BigDecimal tier3Tax = tier2Tax.add(TIER3_LIMIT.subtract(TIER2_LIMIT).multiply(RATE_TIER3));
            // 3000억 초과분: (과표 - 3000억) × 24%
            tax = tier3Tax.add(taxableIncome.subtract(TIER3_LIMIT).multiply(RATE_TIER4));
        }

        return tax.setScale(0, RoundingMode.HALF_UP);
    }
}
