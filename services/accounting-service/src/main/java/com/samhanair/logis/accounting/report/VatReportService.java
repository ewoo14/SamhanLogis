package com.samhanair.logis.accounting.report;

import com.samhanair.logis.accounting.domain.TaxInvoiceType;
import com.samhanair.logis.accounting.repository.TaxInvoiceRepository;
import com.samhanair.logis.accounting.repository.TaxInvoiceRepository.VatSummary;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.YearMonth;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 부가세 신고서 (VAT Report) 집계 Service.
 *
 * <p>집계 대상: TaxInvoice ISSUED 상태만 (DRAFT / CANCELLED 제외).
 *
 * <p>분기별 신고 기한 규칙 (한국 부가가치세법 §49):
 * <ul>
 *   <li>1분기(1~3월): 당해연도 4월 25일</li>
 *   <li>2분기(4~6월): 당해연도 7월 25일</li>
 *   <li>3분기(7~9월): 당해연도 10월 25일</li>
 *   <li>4분기(10~12월): 다음연도 1월 25일</li>
 * </ul>
 *
 * <p>납부세액 계산: vatPayable = 매출VAT - 매입VAT (음수 = 환급 대상).
 */
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class VatReportService {

    private final TaxInvoiceRepository taxInvoiceRepository;

    /**
     * 단월 부가세 신고서 조회.
     *
     * @param period 회계 월 (yyyyMM)
     * @return 부가세 신고서 응답 DTO
     */
    public VatReportResponse findByPeriod(YearMonth period) {
        LocalDate from = period.atDay(1);
        LocalDate to = period.atEndOfMonth();
        String periodLabel = period.getYear() + "-" + String.format("%02d", period.getMonthValue());
        return buildReport(from, to, periodLabel);
    }

    /**
     * 기간 부가세 신고서 조회 (분기/반기 등).
     *
     * @param from 시작 월 (yyyyMM)
     * @param to   종료 월 (yyyyMM)
     * @return 부가세 신고서 응답 DTO
     * @throws IllegalArgumentException from &gt; to 인 경우
     */
    public VatReportResponse findByPeriodRange(YearMonth from, YearMonth to) {
        if (from.isAfter(to)) {
            throw new IllegalArgumentException(
                    "fromPeriod(" + from + ") 은 toPeriod(" + to + ") 보다 이전이어야 합니다");
        }
        LocalDate fromDate = from.atDay(1);
        LocalDate toDate = to.atEndOfMonth();
        String fromLabel = from.getYear() + "-" + String.format("%02d", from.getMonthValue());
        String toLabel = to.getYear() + "-" + String.format("%02d", to.getMonthValue());
        String periodLabel = fromLabel.equals(toLabel) ? fromLabel : fromLabel + " ~ " + toLabel;
        return buildReport(fromDate, toDate, periodLabel);
    }

    /**
     * 부가세 신고서 집계 실행.
     *
     * @param from        집계 시작 일자
     * @param to          집계 종료 일자
     * @param periodLabel UI 표시용 기간 문자열
     * @return 부가세 신고서 응답 DTO
     */
    private VatReportResponse buildReport(LocalDate from, LocalDate to, String periodLabel) {
        VatSummary sales = taxInvoiceRepository.aggregateVatByType(TaxInvoiceType.SALES, from, to);
        VatSummary purchase = taxInvoiceRepository.aggregateVatByType(TaxInvoiceType.PURCHASE, from, to);

        BigDecimal salesSupply = nullToZero(sales.getSupplyAmountSum());
        BigDecimal salesVat    = nullToZero(sales.getVatAmountSum());
        int salesCount         = sales.getInvoiceCount() == null ? 0 : sales.getInvoiceCount().intValue();

        BigDecimal purchaseSupply = nullToZero(purchase.getSupplyAmountSum());
        BigDecimal purchaseVat    = nullToZero(purchase.getVatAmountSum());
        int purchaseCount         = purchase.getInvoiceCount() == null ? 0 : purchase.getInvoiceCount().intValue();

        BigDecimal vatPayable = salesVat.subtract(purchaseVat);
        String filingDeadline = resolveFilingDeadline(to);

        return new VatReportResponse(
                periodLabel,
                from,
                to,
                salesSupply,
                salesVat,
                salesSupply.add(salesVat),
                salesCount,
                purchaseSupply,
                purchaseVat,
                purchaseSupply.add(purchaseVat),
                purchaseCount,
                vatPayable,
                filingDeadline,
                LocalDateTime.now()
        );
    }

    /**
     * 신고 기한 계산 — toDate 기준 분기 판단.
     *
     * <p>toDate 가 속한 월의 분기로 기한 결정:
     * 1~3월 → 4/25, 4~6월 → 7/25, 7~9월 → 10/25, 10~12월 → 다음해 1/25.
     *
     * @param toDate 집계 종료 일자
     * @return 신고 기한 문자열 (YYYY-MM-DD)
     */
    String resolveFilingDeadline(LocalDate toDate) {
        int month = toDate.getMonthValue();
        int year  = toDate.getYear();
        if (month <= 3) {
            return year + "-04-25";
        } else if (month <= 6) {
            return year + "-07-25";
        } else if (month <= 9) {
            return year + "-10-25";
        } else {
            return (year + 1) + "-01-25";
        }
    }

    private BigDecimal nullToZero(BigDecimal value) {
        return value == null ? BigDecimal.ZERO : value;
    }
}
