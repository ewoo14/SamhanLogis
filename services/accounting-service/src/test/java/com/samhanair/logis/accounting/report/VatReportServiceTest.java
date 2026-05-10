package com.samhanair.logis.accounting.report;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.when;

import com.samhanair.logis.accounting.domain.TaxInvoiceType;
import com.samhanair.logis.accounting.repository.TaxInvoiceRepository;
import com.samhanair.logis.accounting.repository.TaxInvoiceRepository.VatSummary;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.YearMonth;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;

/**
 * VatReportService 단위 테스트.
 *
 * <p>fixture 세금계산서 시나리오:
 * <ul>
 *   <li>매출 세금계산서 3건: 공급가액 합계 1,000,000 / VAT 100,000</li>
 *   <li>매입 세금계산서 1건: 공급가액 합계 300,000 / VAT 30,000</li>
 * </ul>
 *
 * <p>기대값:
 * <ul>
 *   <li>매출 총액 = 1,100,000 (공급 + VAT)</li>
 *   <li>매입 총액 = 330,000</li>
 *   <li>납부세액 = 100,000 - 30,000 = 70,000</li>
 * </ul>
 */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class VatReportServiceTest {

    @Mock
    private TaxInvoiceRepository taxInvoiceRepository;

    @InjectMocks
    private VatReportService vatReportService;

    private static final YearMonth PERIOD = YearMonth.of(2026, 4);

    @BeforeEach
    void setUp() {
        when(taxInvoiceRepository.aggregateVatByType(
                eq(TaxInvoiceType.SALES), any(LocalDate.class), any(LocalDate.class)))
                .thenReturn(vatSummary(3L, new BigDecimal("1000000"), new BigDecimal("100000")));

        when(taxInvoiceRepository.aggregateVatByType(
                eq(TaxInvoiceType.PURCHASE), any(LocalDate.class), any(LocalDate.class)))
                .thenReturn(vatSummary(1L, new BigDecimal("300000"), new BigDecimal("30000")));
    }

    @Test
    @DisplayName("단월 부가세신고 — 매출/매입/납부세액 검증")
    void findByPeriod_vatAmounts() {
        VatReportResponse resp = vatReportService.findByPeriod(PERIOD);

        assertThat(resp.salesSupplyAmount()).isEqualByComparingTo("1000000");
        assertThat(resp.salesVatAmount()).isEqualByComparingTo("100000");
        assertThat(resp.salesTotalAmount()).isEqualByComparingTo("1100000");
        assertThat(resp.salesInvoiceCount()).isEqualTo(3);

        assertThat(resp.purchaseSupplyAmount()).isEqualByComparingTo("300000");
        assertThat(resp.purchaseVatAmount()).isEqualByComparingTo("30000");
        assertThat(resp.purchaseTotalAmount()).isEqualByComparingTo("330000");
        assertThat(resp.purchaseInvoiceCount()).isEqualTo(1);

        assertThat(resp.vatPayable()).isEqualByComparingTo("70000");
    }

    @Test
    @DisplayName("단월 부가세신고 — period 레이블 및 fromDate/toDate 검증")
    void findByPeriod_periodLabel() {
        VatReportResponse resp = vatReportService.findByPeriod(PERIOD);

        assertThat(resp.period()).isEqualTo("2026-04");
        assertThat(resp.fromDate()).isEqualTo(LocalDate.of(2026, 4, 1));
        assertThat(resp.toDate()).isEqualTo(LocalDate.of(2026, 4, 30));
    }

    @Test
    @DisplayName("분기 부가세신고 — 1분기 신고 기한 4월 25일")
    void findByPeriodRange_q1_filingDeadline() {
        VatReportResponse resp = vatReportService.findByPeriodRange(
                YearMonth.of(2026, 1), YearMonth.of(2026, 3));

        assertThat(resp.filingDeadline()).isEqualTo("2026-04-25");
        assertThat(resp.period()).isEqualTo("2026-01 ~ 2026-03");
    }

    @Test
    @DisplayName("분기 부가세신고 — 4분기 신고 기한 다음해 1월 25일")
    void findByPeriodRange_q4_filingDeadline_nextYear() {
        VatReportResponse resp = vatReportService.findByPeriodRange(
                YearMonth.of(2026, 10), YearMonth.of(2026, 12));

        assertThat(resp.filingDeadline()).isEqualTo("2027-01-25");
    }

    @Test
    @DisplayName("납부세액 음수 시나리오 — 매입VAT > 매출VAT (환급)")
    void vatPayable_negative_refund() {
        when(taxInvoiceRepository.aggregateVatByType(
                eq(TaxInvoiceType.SALES), any(LocalDate.class), any(LocalDate.class)))
                .thenReturn(vatSummary(1L, new BigDecimal("100000"), new BigDecimal("10000")));
        when(taxInvoiceRepository.aggregateVatByType(
                eq(TaxInvoiceType.PURCHASE), any(LocalDate.class), any(LocalDate.class)))
                .thenReturn(vatSummary(5L, new BigDecimal("500000"), new BigDecimal("50000")));

        VatReportResponse resp = vatReportService.findByPeriod(PERIOD);

        assertThat(resp.vatPayable()).isEqualByComparingTo("-40000");
    }

    @Test
    @DisplayName("빈 데이터 — 세금계산서 없을 때 모든 금액 0")
    void findByPeriod_emptyData() {
        when(taxInvoiceRepository.aggregateVatByType(
                eq(TaxInvoiceType.SALES), any(LocalDate.class), any(LocalDate.class)))
                .thenReturn(vatSummary(0L, BigDecimal.ZERO, BigDecimal.ZERO));
        when(taxInvoiceRepository.aggregateVatByType(
                eq(TaxInvoiceType.PURCHASE), any(LocalDate.class), any(LocalDate.class)))
                .thenReturn(vatSummary(0L, BigDecimal.ZERO, BigDecimal.ZERO));

        VatReportResponse resp = vatReportService.findByPeriod(PERIOD);

        assertThat(resp.salesSupplyAmount()).isEqualByComparingTo("0");
        assertThat(resp.vatPayable()).isEqualByComparingTo("0");
        assertThat(resp.salesInvoiceCount()).isEqualTo(0);
        assertThat(resp.purchaseInvoiceCount()).isEqualTo(0);
    }

    @Test
    @DisplayName("기간 역순 — fromPeriod > toPeriod 예외")
    void findByPeriodRange_invalidRange_throws() {
        assertThatThrownBy(() -> vatReportService.findByPeriodRange(
                YearMonth.of(2026, 6), YearMonth.of(2026, 4)))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("fromPeriod");
    }

    @Test
    @DisplayName("신고 기한 계산 — 2분기(4~6월) → 7월 25일")
    void resolveFilingDeadline_q2() {
        String deadline = vatReportService.resolveFilingDeadline(LocalDate.of(2026, 6, 30));
        assertThat(deadline).isEqualTo("2026-07-25");
    }

    @Test
    @DisplayName("신고 기한 계산 — 3분기(7~9월) → 10월 25일")
    void resolveFilingDeadline_q3() {
        String deadline = vatReportService.resolveFilingDeadline(LocalDate.of(2026, 9, 30));
        assertThat(deadline).isEqualTo("2026-10-25");
    }

    // ── fixture 헬퍼 ──

    private VatSummary vatSummary(long count, BigDecimal supply, BigDecimal vat) {
        return new VatSummary() {
            @Override public Long getInvoiceCount() { return count; }
            @Override public BigDecimal getSupplyAmountSum() { return supply; }
            @Override public BigDecimal getVatAmountSum() { return vat; }
        };
    }
}
