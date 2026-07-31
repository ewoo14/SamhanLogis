package com.samhanair.logis.accounting.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.samhanair.logis.accounting.client.PartnerLookupClient;
import com.samhanair.logis.accounting.client.PartnerSummary;
import com.samhanair.logis.accounting.domain.SalesAccountingSlip;
import com.samhanair.logis.accounting.domain.SalesAccountingSlipAllocation;
import com.samhanair.logis.accounting.domain.SalesAccountingSlipLine;
import com.samhanair.logis.accounting.domain.SalesSlipStatus;
import com.samhanair.logis.accounting.domain.SalesTaxType;
import com.samhanair.logis.accounting.domain.TaxInvoice;
import com.samhanair.logis.accounting.domain.TaxInvoiceLine;
import com.samhanair.logis.accounting.domain.TaxInvoiceStatus;
import com.samhanair.logis.accounting.repository.SalesAccountingSlipRepository;
import com.samhanair.logis.accounting.repository.TaxInvoiceRepository;
import com.samhanair.logis.accounting.web.dto.CreateTaxInvoiceFromSalesSlipsRequest;
import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import java.lang.reflect.Field;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

@ExtendWith(MockitoExtension.class)
class TaxInvoiceBatchFromSalesSlipsServiceTest {

    @Mock SalesAccountingSlipRepository salesSlipRepository;
    @Mock TaxInvoiceRepository taxInvoiceRepository;
    @Mock TaxInvoiceNumberService taxInvoiceNumberService;
    @Mock PartnerLookupClient partnerLookupClient;

    TaxInvoiceBatchFromSalesSlipsService service;

    @BeforeEach
    void setUp() {
        service = new TaxInvoiceBatchFromSalesSlipsService(
                salesSlipRepository, taxInvoiceRepository, taxInvoiceNumberService,
                partnerLookupClient);
    }

    @Test
    void listCandidates_POSTED_미연결_매출전표를_거래처_월별로_그룹화() {
        LocalDate from = LocalDate.of(2026, 5, 1);
        LocalDate to = LocalDate.of(2026, 5, 31);
        UUID partnerId = UUID.randomUUID();
        SalesAccountingSlip s1 = postedSlip("SAS-CAND-1", LocalDate.of(2026, 5, 1),
                partnerId, "P-001", "한국공조", "100000.00", "10000.00");
        SalesAccountingSlip s2 = postedSlip("SAS-CAND-2", LocalDate.of(2026, 5, 9),
                partnerId, "P-001", "한국공조", "200000.00", "20000.00");
        when(salesSlipRepository.findPostedUnlinkedForBatchCandidates(from, to, "P-001"))
                .thenReturn(List.of(s1, s2));

        var responses = service.listCandidates(from, to, "P-001");

        assertThat(responses).hasSize(1);
        assertThat(responses.get(0).partnerCode()).isEqualTo("P-001");
        assertThat(responses.get(0).month()).isEqualTo("2026-05");
        assertThat(responses.get(0).slipCount()).isEqualTo(2);
        assertThat(responses.get(0).totalSupplyAmount()).isEqualByComparingTo("300000.00");
        assertThat(responses.get(0).salesSlips())
                .extracting(row -> row.slipNo())
                .containsExactly("SAS-CAND-1", "SAS-CAND-2");
        verify(salesSlipRepository).findPostedUnlinkedForBatchCandidates(from, to, "P-001");
    }

    @Test
    void createFromSalesSlips_N1_묶음_거래처월동일_라인과_사업자번호_스냅샷_정상() {
        UUID partnerId = UUID.randomUUID();
        UUID taxInvoiceId = UUID.randomUUID();
        SalesAccountingSlip s1 = postedSlip("SAS-1", LocalDate.of(2026, 5, 1),
                partnerId, "P-001", "한국공조", "100000.00", "10000.00");
        SalesAccountingSlip s2 = postedSlip("SAS-2", LocalDate.of(2026, 5, 9),
                partnerId, "P-001", "한국공조", "200000.00", "20000.00");
        SalesAccountingSlip s3 = postedSlip("SAS-3", LocalDate.of(2026, 5, 31),
                partnerId, "P-001", "한국공조", "300000.00", "30000.00");
        List<UUID> ids = List.of(UUID.randomUUID(), UUID.randomUUID(), UUID.randomUUID());

        when(salesSlipRepository.findAllByIdsForBatch(ids)).thenReturn(List.of(s1, s2, s3));
        when(partnerLookupClient.findByPartnerCode("P-001"))
                .thenReturn(Optional.of(new PartnerSummary(
                        partnerId, "P-001", "한국공조", "123-45-67890", "서울")));
        when(taxInvoiceNumberService.next(LocalDate.of(2026, 5, 19)))
                .thenReturn("2026/05/19-1");
        when(taxInvoiceRepository.save(any(TaxInvoice.class))).thenAnswer(inv -> {
            TaxInvoice taxInvoice = inv.getArgument(0);
            setId(taxInvoice, taxInvoiceId);
            return taxInvoice;
        });

        var response = service.createFromSalesSlips(
                new CreateTaxInvoiceFromSalesSlipsRequest(ids, "2026-05-19"),
                "actor-1");

        assertThat(response.taxInvoiceNo()).isEqualTo("2026/05/19-1");
        assertThat(response.partnerCode()).isEqualTo("P-001");
        assertThat(response.partnerName()).isEqualTo("한국공조");
        assertThat(response.totalSupplyAmount()).isEqualByComparingTo("600000.00");
        assertThat(response.totalVatAmount()).isEqualByComparingTo("60000.00");
        assertThat(response.totalAmount()).isEqualByComparingTo("660000.00");
        assertThat(response.linkedSalesSlipCount()).isEqualTo(3);
        assertThat(response.linkedSalesSlipNos()).containsExactly("SAS-1", "SAS-2", "SAS-3");
        assertThat(response.status()).isEqualTo("ISSUED");
        assertThat(s1.getTaxInvoiceId()).isEqualTo(taxInvoiceId);
        assertThat(s2.getTaxInvoiceId()).isEqualTo(taxInvoiceId);
        assertThat(s3.getTaxInvoiceId()).isEqualTo(taxInvoiceId);
        verify(salesSlipRepository).findAllByIdsForBatch(ids);

        ArgumentCaptor<TaxInvoice> captor = ArgumentCaptor.forClass(TaxInvoice.class);
        verify(taxInvoiceRepository).save(captor.capture());
        TaxInvoice savedInvoice = captor.getValue();
        assertThat(savedInvoice.getStatus()).isEqualTo(TaxInvoiceStatus.ISSUED);
        assertThat(savedInvoice.getIssuedBy()).isEqualTo("actor-1");
        assertThat(savedInvoice.getPartnerBusinessNo()).isEqualTo("123-45-67890");
        assertThat(savedInvoice.getLines()).hasSize(3);
        assertThat(savedInvoice.getLines())
                .extracting(line -> line.getItemName())
                .containsExactly("상품", "상품", "상품");
        assertThat(savedInvoice.getLines())
                .extracting(line -> line.getSupplyAmount())
                .containsExactly(
                        new BigDecimal("100000.00"),
                        new BigDecimal("200000.00"),
                        new BigDecimal("300000.00"));
    }

    @Test
    void B08_혼합_매출전표_묶음발행은_known_축과_공급가를_분리한다() {
        UUID partnerId = UUID.randomUUID();
        UUID firstSlipId = UUID.randomUUID();
        UUID secondSlipId = UUID.randomUUID();
        SalesAccountingSlip slip = SalesAccountingSlip.createDraft(
                "SAS-B08-MIXED", LocalDate.of(2026, 5, 1), partnerId,
                "P-001", "한국공조", SalesTaxType.TAXABLE, "B-08");
        SalesAccountingSlipLine line = SalesAccountingSlipLine.create(
                slip, 1, "AR80F07D21WS", "첫 번째 상품", null, null,
                new BigDecimal("2"), new BigDecimal("300"), new BigDecimal("300"),
                new BigDecimal("30"), new BigDecimal("330"));
        line.getAllocations().add(SalesAccountingSlipAllocation.create(line,
                firstSlipId, "OUT-FIRST", UUID.randomUUID(), 1, BigDecimal.ONE,
                new BigDecimal("110"), "AR80F07D21WS", "singleSets"));
        line.getAllocations().add(SalesAccountingSlipAllocation.create(line,
                secondSlipId, "OUT-SECOND", UUID.randomUUID(), 1, BigDecimal.ONE,
                new BigDecimal("220"), "AM480AXVHJH1SY", "commercialMulti"));
        slip.getLines().add(line);
        slip.recalcTotals();
        slip.post("actor-1");
        List<UUID> ids = List.of(UUID.randomUUID());
        when(salesSlipRepository.findAllByIdsForBatch(ids)).thenReturn(List.of(slip));
        when(taxInvoiceNumberService.next(LocalDate.of(2026, 5, 19))).thenReturn("TI-B08");
        when(partnerLookupClient.findByPartnerCodeResult("P-001"))
                .thenReturn(PartnerLookupClient.LookupResult.found(
                        new PartnerSummary(partnerId, "P-001", "한국공조", "123-45-67890", null)));
        when(taxInvoiceRepository.save(any(TaxInvoice.class))).thenAnswer(invocation -> invocation.getArgument(0));

        service.createFromSalesSlips(
                new CreateTaxInvoiceFromSalesSlipsRequest(ids, "2026-05-19"), "actor-1");

        ArgumentCaptor<TaxInvoice> captor = ArgumentCaptor.forClass(TaxInvoice.class);
        verify(taxInvoiceRepository).save(captor.capture());
        TaxInvoice invoice = captor.getValue();
        assertThat(invoice.getLines()).hasSize(2);
        assertThat(invoice.getLines()).extracting(TaxInvoiceLine::getCategoryKey)
                .containsExactly("singleSets", "commercialMulti");
        assertThat(invoice.getLines()).extracting(TaxInvoiceLine::getSupplyAmount)
                .containsExactly(new BigDecimal("100.00"), new BigDecimal("200.00"));
        assertThat(invoice.getLines()).extracting(TaxInvoiceLine::getModelName)
                .containsExactly("AR80F07D21WS", "AM480AXVHJH1SY");
    }

    @Test
    void createFromSalesSlips_partner_service_UNAVAILABLE이면_사업자번호없는발행을차단한다() {
        UUID partnerId = UUID.randomUUID();
        List<UUID> ids = List.of(UUID.randomUUID());
        SalesAccountingSlip slip = postedSlip("SAS-DOWN", LocalDate.of(2026, 5, 1),
                partnerId, "P-DOWN", "장애거래처", "100000.00", "10000.00");
        when(salesSlipRepository.findAllByIdsForBatch(ids)).thenReturn(List.of(slip));
        when(partnerLookupClient.findByPartnerCodeResult("P-DOWN"))
                .thenReturn(PartnerLookupClient.LookupResult.unavailable());

        assertThatThrownBy(() -> service.createFromSalesSlips(
                new CreateTaxInvoiceFromSalesSlipsRequest(ids, "2026-05-19"), "actor-1"))
                .isInstanceOf(BusinessException.class)
                .satisfies(ex -> assertThat(((BusinessException) ex).getErrorCode())
                        .isEqualTo(ErrorCode.PARTNER_IDENTITY_LOOKUP_UNAVAILABLE));
        verify(taxInvoiceRepository, org.mockito.Mockito.never()).save(any(TaxInvoice.class));
    }

    @Test
    void createFromSalesSlips_거래처_다름_SAS_PARTNER_MONTH_MISMATCH() {
        List<UUID> ids = List.of(UUID.randomUUID(), UUID.randomUUID());
        when(salesSlipRepository.findAllByIdsForBatch(ids)).thenReturn(List.of(
                postedSlip("SAS-1", LocalDate.of(2026, 5, 1),
                        UUID.randomUUID(), "P-001", "A", "100000.00", "10000.00"),
                postedSlip("SAS-2", LocalDate.of(2026, 5, 2),
                        UUID.randomUUID(), "P-002", "B", "100000.00", "10000.00")
        ));

        assertThatThrownBy(() -> service.createFromSalesSlips(
                new CreateTaxInvoiceFromSalesSlipsRequest(ids, "2026-05-19"), "actor-1"))
                .isInstanceOf(BusinessException.class)
                .satisfies(ex -> assertThat(((BusinessException) ex).getErrorCode())
                        .isEqualTo(ErrorCode.SAS_PARTNER_MONTH_MISMATCH));
    }

    @Test
    void createFromSalesSlips_월_다름_SAS_PARTNER_MONTH_MISMATCH() {
        UUID partnerId = UUID.randomUUID();
        List<UUID> ids = List.of(UUID.randomUUID(), UUID.randomUUID());
        when(salesSlipRepository.findAllByIdsForBatch(ids)).thenReturn(List.of(
                postedSlip("SAS-1", LocalDate.of(2026, 5, 31),
                        partnerId, "P-001", "A", "100000.00", "10000.00"),
                postedSlip("SAS-2", LocalDate.of(2026, 6, 1),
                        partnerId, "P-001", "A", "100000.00", "10000.00")
        ));

        assertThatThrownBy(() -> service.createFromSalesSlips(
                new CreateTaxInvoiceFromSalesSlipsRequest(ids, "2026-05-19"), "actor-1"))
                .isInstanceOf(BusinessException.class)
                .satisfies(ex -> assertThat(((BusinessException) ex).getErrorCode())
                        .isEqualTo(ErrorCode.SAS_PARTNER_MONTH_MISMATCH));
    }

    @Test
    void createFromSalesSlips_이미_링크된_매출전표_SAS_TAX_INVOICE_ALREADY_LINKED() {
        UUID partnerId = UUID.randomUUID();
        SalesAccountingSlip linked = postedSlip("SAS-1", LocalDate.of(2026, 5, 1),
                partnerId, "P-001", "A", "100000.00", "10000.00");
        linked.linkTaxInvoice(UUID.randomUUID());
        List<UUID> ids = List.of(UUID.randomUUID());
        when(salesSlipRepository.findAllByIdsForBatch(ids)).thenReturn(List.of(linked));

        assertThatThrownBy(() -> service.createFromSalesSlips(
                new CreateTaxInvoiceFromSalesSlipsRequest(ids, "2026-05-19"), "actor-1"))
                .isInstanceOf(BusinessException.class)
                .satisfies(ex -> assertThat(((BusinessException) ex).getErrorCode())
                        .isEqualTo(ErrorCode.SAS_TAX_INVOICE_ALREADY_LINKED));
    }

    @Test
    void createFromSalesSlips_POSTED_아닌_매출전표_SAS_SALES_SLIP_NOT_POSTED() {
        SalesAccountingSlip draft = SalesAccountingSlip.createDraft("SAS-DRAFT",
                LocalDate.of(2026, 5, 1), UUID.randomUUID(), "P-001", "A",
                SalesTaxType.TAXABLE, null);
        List<UUID> ids = List.of(UUID.randomUUID());
        when(salesSlipRepository.findAllByIdsForBatch(ids)).thenReturn(List.of(draft));

        assertThatThrownBy(() -> service.createFromSalesSlips(
                new CreateTaxInvoiceFromSalesSlipsRequest(ids, "2026-05-19"), "actor-1"))
                .isInstanceOf(BusinessException.class)
                .satisfies(ex -> assertThat(((BusinessException) ex).getErrorCode())
                        .isEqualTo(ErrorCode.SAS_SALES_SLIP_NOT_POSTED));
    }

    @Test
    void createFromSalesSlips_VOIDED_매출전표_SAS_SALES_SLIP_NOT_POSTED() {
        SalesAccountingSlip voided = postedSlip("SAS-VOIDED",
                LocalDate.of(2026, 5, 1), UUID.randomUUID(), "P-001", "A",
                "100000.00", "10000.00");
        voided.voidSlip("actor-1");
        List<UUID> ids = List.of(UUID.randomUUID());
        when(salesSlipRepository.findAllByIdsForBatch(ids)).thenReturn(List.of(voided));

        assertThatThrownBy(() -> service.createFromSalesSlips(
                new CreateTaxInvoiceFromSalesSlipsRequest(ids, "2026-05-19"), "actor-1"))
                .isInstanceOf(BusinessException.class)
                .satisfies(ex -> assertThat(((BusinessException) ex).getErrorCode())
                        .isEqualTo(ErrorCode.SAS_SALES_SLIP_NOT_POSTED));
    }

    private static SalesAccountingSlip postedSlip(String slipNo, LocalDate slipDate,
            UUID partnerId, String partnerCode, String partnerName,
            String supplyAmount, String vatAmount) {
        SalesAccountingSlip slip = SalesAccountingSlip.createDraft(
                slipNo, slipDate, partnerId, partnerCode, partnerName, SalesTaxType.TAXABLE, null);
        BigDecimal supply = new BigDecimal(supplyAmount);
        BigDecimal vat = new BigDecimal(vatAmount);
        BigDecimal total = supply.add(vat);
        SalesAccountingSlipLine line = SalesAccountingSlipLine.create(slip, 1,
                "P", "상품", BigDecimal.ONE, supply, supply, vat, total);
        line.getAllocations().add(SalesAccountingSlipAllocation.create(line,
                UUID.randomUUID(), "OUT-" + slipNo, UUID.randomUUID(), 1, BigDecimal.ONE, total));
        slip.getLines().add(line);
        slip.recalcTotals();
        slip.post("actor-1");
        assertThat(slip.getStatus()).isEqualTo(SalesSlipStatus.POSTED);
        return slip;
    }

    private static void setId(TaxInvoice taxInvoice, UUID id) {
        try {
            Field field = TaxInvoice.class.getDeclaredField("id");
            field.setAccessible(true);
            field.set(taxInvoice, id);
        } catch (ReflectiveOperationException e) {
            throw new AssertionError(e);
        }
    }
}
