package com.samhanair.logis.accounting.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.samhanair.logis.accounting.client.ApplicablePrice;
import com.samhanair.logis.accounting.client.ProductClient;
import com.samhanair.logis.accounting.client.ProductLabelMatch;
import com.samhanair.logis.accounting.client.PartnerLookupClient;
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
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.Spy;
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
    @Spy private DiscountRevalidator discountRevalidator = new DiscountRevalidator();
    @Mock private PartnerLookupClient partnerLookupClient;
    @Mock private SalesAccountingSlipRepository salesAccountingSlipRepository;
    @Mock private PurchaseAccountingSlipRepository purchaseAccountingSlipRepository;

    @InjectMocks private MonthEndCloseService service;

    private static final LocalDate DATE = LocalDate.of(2026, 5, 10);

    @BeforeEach
    void setUpProductClientDefaults() {
        lenient().when(productClient.applicablePrices(anyList(), eq(DATE))).thenReturn(Map.of());
        lenient().when(productClient.fixedDiscountRates(anyList())).thenReturn(Map.of());
    }

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
        when(productClient.resolveByLabel("에어컨")).thenReturn(ProductLabelMatch.notFound());
        when(productClient.resolveByLabel("송풍기")).thenReturn(ProductLabelMatch.notFound());

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
        assertThat(에어컨Line.releasePrice()).isNull();
        assertThat(에어컨Line.deliveryPrice()).isNull();
        assertThat(에어컨Line.expectedRate()).isNull();
        assertThat(에어컨Line.actualRate()).isNull();
        assertThat(에어컨Line.verified()).isNull();
        assertThat(에어컨Line.revalidationStatus()).isEqualTo("NOT_FOUND");
        verify(productClient, never()).applicablePrices(anyList(), eq(DATE));
        verify(productClient, never()).fixedDiscountRates(anyList());
    }

    @Test
    @DisplayName("product 마스터 — productClient 주입 가드 (정상 호출)")
    void productClientInjected() {
        when(taxInvoiceRepository.findIssuedInRange(TaxInvoiceStatus.ISSUED, DATE, DATE))
                .thenReturn(List.of());

        DailyClosingDetailResponse resp = service.getDailyDetail(DATE);

        assertThat(resp.totalTaxInvoiceCount()).isZero();
        assertThat(resp.productSummaries()).isEmpty();
        verify(productClient, never()).resolveByLabel(org.mockito.ArgumentMatchers.anyString());
        verify(productClient, never()).applicablePrices(anyList(), eq(DATE));
        verify(productClient, never()).fixedDiscountRates(anyList());
    }

    @Test
    @DisplayName("할인 적용 — totalDiscount 0 (placeholder)")
    void discountPlaceholder() {
        TaxInvoice ti = newIssued("TI-DC", "할인거래처", DATE);
        addLine(ti, "할인품목", BigDecimal.ONE, new BigDecimal("100000"));
        recalcSnapshot(ti);
        when(taxInvoiceRepository.findIssuedInRange(TaxInvoiceStatus.ISSUED, DATE, DATE))
                .thenReturn(List.of(ti));
        when(productClient.resolveByLabel("할인품목")).thenReturn(ProductLabelMatch.notFound());

        DailyClosingDetailResponse resp = service.getDailyDetail(DATE);

        assertThat(resp.totalDiscount()).isEqualByComparingTo("0");
    }

    @Test
    @DisplayName("세금계산서 detail — 라벨 해소 후 referent bulk 1회 조회와 재검증 필드를 노출한다")
    void taxInvoiceDetailRevalidatesWithBulkReferents() {
        UUID matched = UUID.randomUUID();
        UUID missingPrice = UUID.randomUUID();
        UUID missingFixedRate = UUID.randomUUID();
        TaxInvoice ti = newIssued("TI-RV", "재검증거래처", DATE);
        addLine(ti, "AJ040RXH4BC1 (RX다배관)", BigDecimal.ONE, new BigDecimal("55000"));
        addLine(ti, "AJ050RXH5BC1 [5다배관]", BigDecimal.ONE, new BigDecimal("55000"));
        addLine(ti, "AJ060MXHNBC1 [단배관]", BigDecimal.ONE, new BigDecimal("55000"));
        addLine(ti, "AXJ-YA1509N [N-분기관]", BigDecimal.ONE, new BigDecimal("70000"));
        addLine(ti, "AC023CN1DBC1 [CN냉전 실내기]", BigDecimal.ONE, new BigDecimal("80000"));
        recalcSnapshot(ti);

        when(taxInvoiceRepository.findIssuedInRange(TaxInvoiceStatus.ISSUED, DATE, DATE))
                .thenReturn(List.of(ti));
        when(productClient.resolveByLabel("AJ040RXH4BC1 (RX다배관)"))
                .thenReturn(ProductLabelMatch.matched(matched, "AJ040RXH4BC1"));
        when(productClient.resolveByLabel("AJ050RXH5BC1 [5다배관]"))
                .thenReturn(ProductLabelMatch.matched(missingPrice, "AJ050RXH5BC1"));
        when(productClient.resolveByLabel("AJ060MXHNBC1 [단배관]"))
                .thenReturn(ProductLabelMatch.matched(missingFixedRate, "AJ060MXHNBC1"));
        when(productClient.resolveByLabel("AXJ-YA1509N [N-분기관]"))
                .thenReturn(ProductLabelMatch.notFound());
        when(productClient.resolveByLabel("AC023CN1DBC1 [CN냉전 실내기]"))
                .thenReturn(ProductLabelMatch.ambiguous());
        when(productClient.applicablePrices(anyList(), eq(DATE))).thenReturn(Map.of(
                matched, new ApplicablePrice(new BigDecimal("100000"), new BigDecimal("70000"), DATE),
                missingFixedRate, new ApplicablePrice(new BigDecimal("100000"), new BigDecimal("70000"), DATE)));
        Map<UUID, BigDecimal> fixedRates = new LinkedHashMap<>();
        fixedRates.put(matched, new BigDecimal("45.00"));
        fixedRates.put(missingPrice, null);
        when(productClient.fixedDiscountRates(anyList())).thenReturn(fixedRates);

        DailyClosingDetailResponse resp = service.getDailyDetail(DATE);

        DailyClosingDetailResponse.DailyProductLine verified = findProductLine(resp, "AJ040RXH4BC1 (RX다배관)");
        assertThat(verified.releasePrice()).isEqualByComparingTo("100000");
        assertThat(verified.deliveryPrice()).isEqualByComparingTo("70000");
        assertThat(verified.expectedRate()).isEqualTo(45);
        assertThat(verified.actualRate()).isEqualTo(45);
        assertThat(verified.verified()).isTrue();
        assertThat(verified.revalidationStatus()).isEqualTo("VERIFIED");

        DailyClosingDetailResponse.DailyProductLine missing = findProductLine(resp, "AJ050RXH5BC1 [5다배관]");
        assertThat(missing.revalidationStatus()).isEqualTo("MISSING_REFERENT");
        assertThat(missing.verified()).isNull();
        assertThat(missing.releasePrice()).isNull();

        DailyClosingDetailResponse.DailyProductLine missingFixed =
                findProductLine(resp, "AJ060MXHNBC1 [단배관]");
        assertThat(missingFixed.revalidationStatus()).isEqualTo("MISSING_REFERENT");
        assertThat(missingFixed.releasePrice()).isEqualByComparingTo("100000");
        assertThat(missingFixed.verified()).isNull();

        DailyClosingDetailResponse.DailyProductLine notFound = findProductLine(resp, "AXJ-YA1509N [N-분기관]");
        assertThat(notFound.revalidationStatus()).isEqualTo("NOT_FOUND");
        assertThat(notFound.verified()).isNull();

        DailyClosingDetailResponse.DailyProductLine ambiguous = findProductLine(resp, "AC023CN1DBC1 [CN냉전 실내기]");
        assertThat(ambiguous.revalidationStatus()).isEqualTo("AMBIGUOUS");
        assertThat(ambiguous.verified()).isNull();

        @SuppressWarnings("unchecked")
        ArgumentCaptor<List<UUID>> idsCaptor = ArgumentCaptor.forClass(List.class);
        verify(productClient, times(5)).resolveByLabel(org.mockito.ArgumentMatchers.anyString());
        verify(productClient, times(1)).applicablePrices(idsCaptor.capture(), eq(DATE));
        assertThat(idsCaptor.getValue()).containsExactly(matched, missingPrice, missingFixedRate);
        verify(productClient, times(1)).fixedDiscountRates(idsCaptor.capture());
        assertThat(idsCaptor.getValue()).containsExactly(matched, missingPrice, missingFixedRate);
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

    private static DailyClosingDetailResponse.DailyProductLine findProductLine(
            DailyClosingDetailResponse response,
            String productName) {
        return response.productSummaries().stream()
                .filter(line -> productName.equals(line.productName()))
                .findFirst()
                .orElseThrow();
    }
}
