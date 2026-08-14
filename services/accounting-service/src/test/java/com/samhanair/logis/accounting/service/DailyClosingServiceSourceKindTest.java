package com.samhanair.logis.accounting.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.when;

import com.samhanair.logis.security.permission.DynamicPermissionClient;
import com.samhanair.logis.accounting.client.PartnerLookupClient;
import com.samhanair.logis.accounting.domain.DailyClosing;
import com.samhanair.logis.accounting.domain.DailyClosingKind;
import com.samhanair.logis.accounting.domain.DailyClosingSourceKind;
import com.samhanair.logis.accounting.domain.PurchaseAccountingSlip;
import com.samhanair.logis.accounting.domain.PurchaseAccountingSlipAllocation;
import com.samhanair.logis.accounting.domain.PurchaseAccountingSlipLine;
import com.samhanair.logis.accounting.domain.PurchaseSlipStatus;
import com.samhanair.logis.accounting.domain.SalesAccountingSlip;
import com.samhanair.logis.accounting.domain.SalesAccountingSlipAllocation;
import com.samhanair.logis.accounting.domain.SalesAccountingSlipLine;
import com.samhanair.logis.accounting.domain.SalesSlipStatus;
import com.samhanair.logis.accounting.domain.SalesTaxType;
import com.samhanair.logis.accounting.domain.TaxInvoice;
import com.samhanair.logis.accounting.domain.TaxInvoiceStatus;
import com.samhanair.logis.accounting.domain.TaxInvoiceType;
import com.samhanair.logis.accounting.repository.DailyClosingRepository;
import com.samhanair.logis.accounting.repository.PurchaseAccountingSlipRepository;
import com.samhanair.logis.accounting.repository.SalesAccountingSlipRepository;
import com.samhanair.logis.accounting.repository.TaxInvoiceRepository;
import com.samhanair.logis.accounting.web.dto.CreateDailyClosingRequest;
import com.samhanair.logis.accounting.web.dto.DailyClosingResponse;
import java.lang.reflect.Field;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

@ExtendWith(MockitoExtension.class)
class DailyClosingServiceSourceKindTest {

    private static final LocalDate DATE = LocalDate.of(2026, 5, 19);

    @Mock private DailyClosingRepository dailyClosingRepository;
    @Mock private TaxInvoiceRepository taxInvoiceRepository;
    @Mock private SalesAccountingSlipRepository salesAccountingSlipRepository;
    @Mock private PurchaseAccountingSlipRepository purchaseAccountingSlipRepository;
    @Mock private PartnerLookupClient partnerLookupClient;
    @Mock private DynamicPermissionClient dynamicPermissionClient;
    @Mock private DailyClosingVerificationService dailyClosingVerificationService;

    @InjectMocks private DailyClosingService service;

    @BeforeEach
    void stubServerVerification() {
        lenient().when(dailyClosingVerificationService.verifyBeforeClose(any(), any(), any()))
                .thenReturn(new DailyClosingVerificationService.VerificationResult(
                        DailyClosingVerificationService.Status.VERIFIED, ""));
    }

    @Test
    void amountVerified_요청값과_무관하게_서버검증결과를_사용한다() {
        when(dailyClosingVerificationService.verifyBeforeClose(any(), any(), any()))
                .thenReturn(new DailyClosingVerificationService.VerificationResult(
                        DailyClosingVerificationService.Status.AMOUNT_MISMATCH,
                        "금액 검증을 완료해 주세요"));

        assertThatThrownBy(() -> service.close(
                new CreateDailyClosingRequest(DATE, null, "ALL", DailyClosingKind.SALES,
                        DailyClosingSourceKind.TAX_INVOICE, true),
                "accountant", null))
                .isInstanceOf(com.samhanair.logis.common.exception.BusinessException.class)
                .hasMessageContaining("금액 검증")
                .hasMessageNotContaining("amountVerified");
    }

    @Test
    @DisplayName("기본 요청은 SALES + TAX_INVOICE 집계로 하위 호환된다")
    void defaultRequestAggregatesTaxInvoiceSales() {
        TaxInvoice invoice = issuedTaxInvoice("2026/05/19-1", TaxInvoiceType.SALES,
                new BigDecimal("100000"), new BigDecimal("10000"));
        when(taxInvoiceRepository.findIssuedInRange(TaxInvoiceStatus.ISSUED, DATE, DATE))
                .thenReturn(List.of(invoice));
        when(dailyClosingRepository.findByClosingDateAndPartnerIdIsNullAndClosingKindAndSourceKind(
                DATE, DailyClosingKind.SALES, DailyClosingSourceKind.TAX_INVOICE))
                .thenReturn(Optional.empty());
        when(dailyClosingRepository.save(any(DailyClosing.class)))
                .thenAnswer(inv -> inv.getArgument(0));

        DailyClosingResponse response = service.close(
                new CreateDailyClosingRequest(DATE, null, "ALL", null, null),
                "accountant", null);

        assertThat(response.closingKind()).isEqualTo(DailyClosingKind.SALES);
        assertThat(response.sourceKind()).isEqualTo(DailyClosingSourceKind.TAX_INVOICE);
        assertThat(response.totalSupply()).isEqualByComparingTo("100000");
        assertThat(response.totalVat()).isEqualByComparingTo("10000");
        assertThat(response.totalAmount()).isEqualByComparingTo("110000");
        assertThat(response.slipCount()).isEqualTo(1);
        assertThat(response.isLocked()).isTrue();
    }

    @Test
    @DisplayName("SALES_SLIP sourceKind 는 POSTED 매출전표를 집계한다")
    void salesSlipSourceAggregatesPostedSalesSlips() {
        SalesAccountingSlip slip = postedSalesSlip("2026/05/19-1",
                new BigDecimal("200000"), new BigDecimal("20000"));
        when(salesAccountingSlipRepository.findBySlipDateAndStatus(DATE, SalesSlipStatus.POSTED))
                .thenReturn(List.of(slip));
        when(dailyClosingRepository.findByClosingDateAndPartnerIdIsNullAndClosingKindAndSourceKind(
                DATE, DailyClosingKind.SALES, DailyClosingSourceKind.SALES_SLIP))
                .thenReturn(Optional.empty());
        when(dailyClosingRepository.save(any(DailyClosing.class)))
                .thenAnswer(inv -> inv.getArgument(0));

        DailyClosingResponse response = service.close(
                new CreateDailyClosingRequest(DATE, null, "ALL",
                        DailyClosingKind.SALES, DailyClosingSourceKind.SALES_SLIP),
                "accountant", null);

        assertThat(response.totalSupply()).isEqualByComparingTo("200000");
        assertThat(response.totalVat()).isEqualByComparingTo("20000");
        assertThat(response.totalAmount()).isEqualByComparingTo("220000");
        assertThat(response.slipCount()).isEqualTo(1);
        assertThat(response.closingKind()).isEqualTo(DailyClosingKind.SALES);
        assertThat(response.sourceKind()).isEqualTo(DailyClosingSourceKind.SALES_SLIP);
    }

    @Test
    @DisplayName("PURCHASE_SLIP sourceKind 는 POSTED 매입전표를 집계한다")
    void purchaseSlipSourceAggregatesPostedPurchaseSlips() {
        PurchaseAccountingSlip slip = postedPurchaseSlip("2026/05/19-1",
                new BigDecimal("300000"), new BigDecimal("30000"));
        when(purchaseAccountingSlipRepository.findBySlipDateAndStatus(DATE, PurchaseSlipStatus.POSTED))
                .thenReturn(List.of(slip));
        when(dailyClosingRepository.findByClosingDateAndPartnerIdIsNullAndClosingKindAndSourceKind(
                DATE, DailyClosingKind.PURCHASE, DailyClosingSourceKind.PURCHASE_SLIP))
                .thenReturn(Optional.empty());
        when(dailyClosingRepository.save(any(DailyClosing.class)))
                .thenAnswer(inv -> inv.getArgument(0));

        DailyClosingResponse response = service.close(
                new CreateDailyClosingRequest(DATE, null, "ALL",
                        DailyClosingKind.PURCHASE, DailyClosingSourceKind.PURCHASE_SLIP),
                "accountant", null);

        assertThat(response.totalSupply()).isEqualByComparingTo("300000");
        assertThat(response.totalVat()).isEqualByComparingTo("30000");
        assertThat(response.totalAmount()).isEqualByComparingTo("330000");
        assertThat(response.slipCount()).isEqualTo(1);
        assertThat(response.closingKind()).isEqualTo(DailyClosingKind.PURCHASE);
        assertThat(response.sourceKind()).isEqualTo(DailyClosingSourceKind.PURCHASE_SLIP);
    }

    @Test
    @DisplayName("매출 마감에 PURCHASE_SLIP sourceKind 를 섞으면 차단한다")
    void invalidKindSourceCombinationRejected() {
        assertThatThrownBy(() -> service.close(
                new CreateDailyClosingRequest(DATE, null, "ALL",
                        DailyClosingKind.SALES, DailyClosingSourceKind.PURCHASE_SLIP),
                "accountant", null))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("매출 마감")
                .hasMessageContaining("매입전표")
                .hasMessageNotContaining("SALES")
                .hasMessageNotContaining("PURCHASE_SLIP")
                .hasMessageNotContaining("closingKind/sourceKind");
    }

    @Test
    @DisplayName("서비스 이중 가드 — scopeMode 와 거래처 선택값이 모순되면 저장 전에 차단")
    void invalidScopeRejectedBeforeAggregation() {
        assertThatThrownBy(() -> service.close(
                new CreateDailyClosingRequest(DATE, null, "SELECTED",
                        DailyClosingKind.SALES, DailyClosingSourceKind.TAX_INVOICE),
                "accountant", null))
                .isInstanceOf(com.samhanair.logis.common.exception.BusinessException.class)
                .hasMessageContaining("scopeMode");
    }

    @Test
    @DisplayName("매입 마감에 SALES_SLIP sourceKind 를 섞으면 차단한다 (대칭 분기)")
    void invalidKindSourceCombinationRejected_반대분기() {
        assertThatThrownBy(() -> service.close(
                new CreateDailyClosingRequest(DATE, null, "ALL",
                        DailyClosingKind.PURCHASE, DailyClosingSourceKind.SALES_SLIP),
                "accountant", null))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("매입 마감")
                .hasMessageContaining("매출전표")
                .hasMessageNotContaining("PURCHASE")
                .hasMessageNotContaining("SALES_SLIP")
                .hasMessageNotContaining("closingKind/sourceKind");
    }

    private static TaxInvoice issuedTaxInvoice(String no, TaxInvoiceType type,
                                               BigDecimal supply, BigDecimal vat) {
        TaxInvoice invoice = TaxInvoice.create(UUID.randomUUID(), "P-001",
                "123-45-67890", "테스트거래처", "서울", DATE, null, type);
        set(invoice, "taxInvoiceNo", no);
        set(invoice, "status", TaxInvoiceStatus.ISSUED);
        set(invoice, "supplyAmount", supply);
        set(invoice, "vatAmount", vat);
        set(invoice, "totalAmount", supply.add(vat));
        set(invoice, "lines", new ArrayList<>());
        return invoice;
    }

    private static SalesAccountingSlip postedSalesSlip(String no, BigDecimal supply, BigDecimal vat) {
        SalesAccountingSlip slip = SalesAccountingSlip.createDraft(no, DATE, UUID.randomUUID(),
                "P-001", "테스트거래처", SalesTaxType.TAXABLE, null);
        SalesAccountingSlipLine line = SalesAccountingSlipLine.create(slip, 1, "SKU-1",
                "상품A", BigDecimal.ONE, supply, supply, vat, supply.add(vat));
        line.getAllocations().add(SalesAccountingSlipAllocation.create(line, UUID.randomUUID(),
                "OUT-001", UUID.randomUUID(), 1, BigDecimal.ONE, supply.add(vat)));
        slip.getLines().add(line);
        slip.recalcTotals();
        slip.post("accountant");
        return slip;
    }

    private static PurchaseAccountingSlip postedPurchaseSlip(String no, BigDecimal supply, BigDecimal vat) {
        PurchaseAccountingSlip slip = PurchaseAccountingSlip.createDraft(no, DATE, UUID.randomUUID(),
                "P-002", "매입거래처", SalesTaxType.TAXABLE, null);
        PurchaseAccountingSlipLine line = PurchaseAccountingSlipLine.create(slip, 1, "SKU-2",
                "상품B", BigDecimal.ONE, supply, supply, vat, supply.add(vat));
        line.getAllocations().add(PurchaseAccountingSlipAllocation.create(line, UUID.randomUUID(),
                "IN-001", UUID.randomUUID(), 1, BigDecimal.ONE, supply.add(vat)));
        slip.getLines().add(line);
        slip.recalcTotals();
        slip.post("accountant");
        return slip;
    }

    private static void set(Object target, String fieldName, Object value) {
        try {
            Field field = target.getClass().getDeclaredField(fieldName);
            field.setAccessible(true);
            field.set(target, value);
        } catch (ReflectiveOperationException ex) {
            throw new IllegalStateException(ex);
        }
    }
}
