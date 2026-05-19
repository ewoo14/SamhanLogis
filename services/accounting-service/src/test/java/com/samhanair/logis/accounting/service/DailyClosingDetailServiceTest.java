package com.samhanair.logis.accounting.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.when;

import com.samhanair.logis.accounting.client.ProductClient;
import com.samhanair.logis.accounting.client.SlipServiceClient;
import com.samhanair.logis.accounting.domain.AccountingPeriod;
import com.samhanair.logis.accounting.domain.PeriodStatus;
import com.samhanair.logis.accounting.domain.PeriodType;
import com.samhanair.logis.accounting.domain.TaxInvoice;
import com.samhanair.logis.accounting.domain.TaxInvoiceLine;
import com.samhanair.logis.accounting.domain.TaxInvoiceStatus;
import com.samhanair.logis.accounting.repository.AccountingPeriodRepository;
import com.samhanair.logis.accounting.repository.JournalLineRepository;
import com.samhanair.logis.accounting.repository.PurchaseAccountingSlipRepository;
import com.samhanair.logis.accounting.repository.SalesAccountingSlipRepository;
import com.samhanair.logis.accounting.repository.TaxInvoiceRepository;
import com.samhanair.logis.accounting.web.dto.DailyClosingDetailResponse;
import com.samhanair.logis.common.exception.BusinessException;
import java.lang.reflect.Field;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

/**
 * MonthEndCloseService.getDailyDetail() 단위 테스트 — BE-A12.
 *
 * <p>커버 시나리오 4건:
 * <ul>
 *   <li>일별 detail — 세금계산서 합계 + 모델별 합계</li>
 *   <li>product 마스터 — productClient 주입 보장 (NPE 가드)</li>
 *   <li>할인 적용 — totalDiscount 0 (placeholder)</li>
 *   <li>마감 lock 가드 — requireDateNotClosed 호출 시 CONFLICT</li>
 * </ul>
 */
@ExtendWith(MockitoExtension.class)
class DailyClosingDetailServiceTest {

    @Mock private AccountingPeriodRepository periodRepository;
    @Mock private JournalLineRepository journalLineRepository;
    @Mock private SlipServiceClient slipServiceClient;
    @Mock private TaxInvoiceRepository taxInvoiceRepository;
    @Mock private ProductClient productClient;
    @Mock private SalesAccountingSlipRepository salesAccountingSlipRepository;
    @Mock private PurchaseAccountingSlipRepository purchaseAccountingSlipRepository;

    @InjectMocks private MonthEndCloseService service;

    private static final LocalDate DATE = LocalDate.of(2026, 5, 10);

    @Test
    @DisplayName("일별 detail — 세금계산서 합계 + 모델별 합계")
    void dailyDetailNormal() {
        TaxInvoice ti = newIssued("TI-001", "거래처A", DATE);
        addLine(ti, "에어컨", BigDecimal.ONE, new BigDecimal("500000"));
        addLine(ti, "에어컨", BigDecimal.ONE, new BigDecimal("500000")); // 같은 모델 누적
        addLine(ti, "송풍기", new BigDecimal("2"), new BigDecimal("100000"));
        recalcSnapshot(ti);

        when(taxInvoiceRepository.findIssuedInRange(TaxInvoiceStatus.ISSUED, DATE, DATE))
                .thenReturn(List.of(ti));

        DailyClosingDetailResponse resp = service.getDailyDetail(DATE);

        assertThat(resp.date()).isEqualTo(DATE);
        assertThat(resp.totalTaxInvoiceCount()).isEqualTo(1);
        assertThat(resp.totalSupply()).isEqualByComparingTo("1200000");
        assertThat(resp.totalVat()).isEqualByComparingTo("120000");
        assertThat(resp.taxInvoices()).hasSize(1);
        assertThat(resp.productSummaries()).hasSize(2); // 에어컨 + 송풍기
        DailyClosingDetailResponse.DailyProductLine 에어컨Line = resp.productSummaries().stream()
                .filter(p -> "에어컨".equals(p.productName())).findFirst().orElseThrow();
        assertThat(에어컨Line.quantity()).isEqualByComparingTo("2");
        assertThat(에어컨Line.supplyAmount()).isEqualByComparingTo("1000000");
    }

    @Test
    @DisplayName("product 마스터 — productClient 주입 가드 (정상 호출)")
    void productClientInjected() {
        when(taxInvoiceRepository.findIssuedInRange(TaxInvoiceStatus.ISSUED, DATE, DATE))
                .thenReturn(List.of());

        DailyClosingDetailResponse resp = service.getDailyDetail(DATE);

        assertThat(resp.totalTaxInvoiceCount()).isZero();
        assertThat(resp.productSummaries()).isEmpty();
    }

    @Test
    @DisplayName("할인 적용 — totalDiscount 0 (placeholder)")
    void discountPlaceholder() {
        TaxInvoice ti = newIssued("TI-DC", "할인거래처", DATE);
        addLine(ti, "할인품목", BigDecimal.ONE, new BigDecimal("100000"));
        recalcSnapshot(ti);
        when(taxInvoiceRepository.findIssuedInRange(TaxInvoiceStatus.ISSUED, DATE, DATE))
                .thenReturn(List.of(ti));

        DailyClosingDetailResponse resp = service.getDailyDetail(DATE);

        assertThat(resp.totalDiscount()).isEqualByComparingTo("0");
    }

    @Test
    @DisplayName("마감 lock 가드 — requireDateNotClosed 호출 시 CONFLICT (CLOSED 일자)")
    void closedLockGuard() {
        AccountingPeriod closed = AccountingPeriod.create(PeriodType.DAILY, DATE, "마감됨");
        // closed 상태로 reflection
        try {
            Field statusField = AccountingPeriod.class.getDeclaredField("status");
            statusField.setAccessible(true);
            statusField.set(closed, PeriodStatus.CLOSED);
            Field idField = AccountingPeriod.class.getDeclaredField("id");
            idField.setAccessible(true);
            idField.set(closed, UUID.randomUUID());
        } catch (Exception ex) {
            throw new RuntimeException(ex);
        }
        lenient().when(periodRepository.findCoveringClosedPeriod(PeriodStatus.CLOSED,
                DATE, DATE.withDayOfMonth(1))).thenReturn(List.of(closed));

        assertThatThrownBy(() -> service.requireDateNotClosed(DATE))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("마감된 회계 기간");
    }

    private static TaxInvoice newIssued(String taxInvoiceNo, String partnerName,
                                         LocalDate supplyDate) {
        TaxInvoice ti = TaxInvoice.create(UUID.randomUUID(), "111-22-33333", partnerName,
                "주소", supplyDate, null);
        try {
            Field idField = TaxInvoice.class.getDeclaredField("id");
            idField.setAccessible(true);
            idField.set(ti, UUID.randomUUID());
            Field noField = TaxInvoice.class.getDeclaredField("taxInvoiceNo");
            noField.setAccessible(true);
            noField.set(ti, taxInvoiceNo);
            Field statusField = TaxInvoice.class.getDeclaredField("status");
            statusField.setAccessible(true);
            statusField.set(ti, TaxInvoiceStatus.ISSUED);
            Field linesField = TaxInvoice.class.getDeclaredField("lines");
            linesField.setAccessible(true);
            linesField.set(ti, new ArrayList<TaxInvoiceLine>());
        } catch (Exception ex) {
            throw new RuntimeException(ex);
        }
        return ti;
    }

    private static void addLine(TaxInvoice ti, String itemName,
                                 BigDecimal qty, BigDecimal unitPrice) {
        TaxInvoiceLine line = TaxInvoiceLine.create(ti, 1, itemName, null, qty, unitPrice, null);
        try {
            Field linesField = TaxInvoice.class.getDeclaredField("lines");
            linesField.setAccessible(true);
            @SuppressWarnings("unchecked")
            List<TaxInvoiceLine> lines = (List<TaxInvoiceLine>) linesField.get(ti);
            lines.add(line);
        } catch (Exception ex) {
            throw new RuntimeException(ex);
        }
    }

    private static void recalcSnapshot(TaxInvoice ti) {
        try {
            Field linesField = TaxInvoice.class.getDeclaredField("lines");
            linesField.setAccessible(true);
            @SuppressWarnings("unchecked")
            List<TaxInvoiceLine> lines = (List<TaxInvoiceLine>) linesField.get(ti);
            BigDecimal supplySum = lines.stream()
                    .map(TaxInvoiceLine::getSupplyAmount)
                    .reduce(BigDecimal.ZERO, BigDecimal::add);
            BigDecimal vatSum = lines.stream()
                    .map(TaxInvoiceLine::getVatAmount)
                    .reduce(BigDecimal.ZERO, BigDecimal::add);
            Field supplyField = TaxInvoice.class.getDeclaredField("supplyAmount");
            supplyField.setAccessible(true);
            supplyField.set(ti, supplySum);
            Field vatField = TaxInvoice.class.getDeclaredField("vatAmount");
            vatField.setAccessible(true);
            vatField.set(ti, vatSum);
            Field totalField = TaxInvoice.class.getDeclaredField("totalAmount");
            totalField.setAccessible(true);
            totalField.set(ti, supplySum.add(vatSum));
        } catch (Exception ex) {
            throw new RuntimeException(ex);
        }
    }
}
