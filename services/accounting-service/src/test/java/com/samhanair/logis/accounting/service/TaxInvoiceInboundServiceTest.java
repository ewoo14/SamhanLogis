package com.samhanair.logis.accounting.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.samhanair.logis.accounting.client.PartnerLookupClient;
import com.samhanair.logis.accounting.client.PartnerSummary;
import com.samhanair.logis.accounting.domain.PurchaseAccountingSlip;
import com.samhanair.logis.accounting.domain.PurchaseAccountingSlipAllocation;
import com.samhanair.logis.accounting.domain.PurchaseAccountingSlipLine;
import com.samhanair.logis.accounting.domain.PurchaseSlipStatus;
import com.samhanair.logis.accounting.domain.SalesTaxType;
import com.samhanair.logis.accounting.domain.TaxInvoice;
import com.samhanair.logis.accounting.domain.TaxInvoiceDirection;
import com.samhanair.logis.accounting.domain.TaxInvoiceStatus;
import com.samhanair.logis.accounting.repository.PurchaseAccountingSlipRepository;
import com.samhanair.logis.accounting.repository.TaxInvoiceRepository;
import com.samhanair.logis.accounting.web.dto.RegisterInboundTaxInvoiceRequest;
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
class TaxInvoiceInboundServiceTest {

    @Mock PurchaseAccountingSlipRepository purchaseSlipRepository;
    @Mock TaxInvoiceRepository taxInvoiceRepository;
    @Mock TaxInvoiceNumberService taxInvoiceNumberService;
    @Mock PartnerLookupClient partnerLookupClient;

    TaxInvoiceInboundService service;

    @BeforeEach
    void setUp() {
        service = new TaxInvoiceInboundService(
                purchaseSlipRepository, taxInvoiceRepository, taxInvoiceNumberService,
                partnerLookupClient);
    }

    @Test
    void listInbound_direction_INBOUND_기간_거래처필터_목록응답() {
        LocalDate from = LocalDate.of(2026, 5, 1);
        LocalDate to = LocalDate.of(2026, 5, 31);
        TaxInvoice invoice = TaxInvoice.createInbound(
                "2026/05/19-1",
                LocalDate.of(2026, 5, 19),
                UUID.randomUUID(),
                "V-001",
                "한국공조",
                "123-45-67890",
                new BigDecimal("100000.00"),
                new BigDecimal("10000.00"),
                new BigDecimal("110000.00"),
                "actor-1");
        invoice.markReceived("actor-1");
        when(taxInvoiceRepository.findInboundByFilters(from, to, "V-001"))
                .thenReturn(List.of(invoice));

        var responses = service.listInbound(from, to, "V-001");

        assertThat(responses).hasSize(1);
        assertThat(responses.get(0).taxInvoiceNo()).isEqualTo("2026/05/19-1");
        assertThat(responses.get(0).partnerCode()).isEqualTo("V-001");
        assertThat(responses.get(0).status()).isEqualTo(TaxInvoiceStatus.ISSUED);
        verify(taxInvoiceRepository).findInboundByFilters(from, to, "V-001");
    }

    @Test
    void registerInbound_정상_ISSUED_전이_lines_partnerBusinessNo_direction_INBOUND() {
        UUID partnerId = UUID.randomUUID();
        UUID taxInvoiceId = UUID.randomUUID();
        PurchaseAccountingSlip slip = postedSlip("PAS-1", LocalDate.of(2026, 5, 1),
                partnerId, "P-001", "한국공조", "100000.00", "10000.00");
        List<UUID> ids = List.of(UUID.randomUUID());

        when(purchaseSlipRepository.findAllByIdsForBatch(ids)).thenReturn(List.of(slip));
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

        var response = service.registerInbound(
                new RegisterInboundTaxInvoiceRequest(ids, "2026-05-19"), "actor-1");

        assertThat(response.taxInvoiceNo()).isEqualTo("2026/05/19-1");
        assertThat(response.partnerCode()).isEqualTo("P-001");
        assertThat(response.partnerName()).isEqualTo("한국공조");
        assertThat(response.totalSupplyAmount()).isEqualByComparingTo("100000.00");
        assertThat(response.totalVatAmount()).isEqualByComparingTo("10000.00");
        assertThat(response.totalAmount()).isEqualByComparingTo("110000.00");
        assertThat(response.linkedPurchaseSlipCount()).isEqualTo(1);
        assertThat(response.status()).isEqualTo("ISSUED");
        assertThat(slip.getTaxInvoiceId()).isEqualTo(taxInvoiceId);

        ArgumentCaptor<TaxInvoice> captor = ArgumentCaptor.forClass(TaxInvoice.class);
        verify(taxInvoiceRepository).save(captor.capture());
        TaxInvoice savedInvoice = captor.getValue();
        assertThat(savedInvoice.getStatus()).isEqualTo(TaxInvoiceStatus.ISSUED);
        assertThat(savedInvoice.getDirection()).isEqualTo(TaxInvoiceDirection.INBOUND);
        assertThat(savedInvoice.getIssuedBy()).isEqualTo("actor-1");
        assertThat(savedInvoice.getPartnerBusinessNo()).isEqualTo("123-45-67890");
        assertThat(savedInvoice.getLines()).hasSize(1);
        assertThat(savedInvoice.getLines().get(0).getItemName()).isEqualTo("상품");
    }

    @Test
    void registerInbound_partner_service_UNAVAILABLE이면_null사업자번호발행을차단한다() {
        UUID partnerId = UUID.randomUUID();
        List<UUID> ids = List.of(UUID.randomUUID());
        PurchaseAccountingSlip slip = postedSlip("PAS-DOWN", LocalDate.of(2026, 5, 1),
                partnerId, "P-DOWN", "장애거래처", "100000.00", "10000.00");
        when(purchaseSlipRepository.findAllByIdsForBatch(ids)).thenReturn(List.of(slip));
        when(partnerLookupClient.findByPartnerCodeResult("P-DOWN"))
                .thenReturn(PartnerLookupClient.LookupResult.unavailable());

        assertThatThrownBy(() -> service.registerInbound(
                new RegisterInboundTaxInvoiceRequest(ids, "2026-05-19"), "actor-1"))
                .isInstanceOf(BusinessException.class)
                .satisfies(ex -> assertThat(((BusinessException) ex).getErrorCode())
                        .isEqualTo(ErrorCode.PARTNER_IDENTITY_LOOKUP_UNAVAILABLE));
        verify(taxInvoiceRepository, org.mockito.Mockito.never()).save(any(TaxInvoice.class));
    }

    @Test
    void registerInbound_with_purchaseSlipIds_3장_매칭_link() {
        UUID partnerId = UUID.randomUUID();
        UUID taxInvoiceId = UUID.randomUUID();
        PurchaseAccountingSlip s1 = postedSlip("PAS-1", LocalDate.of(2026, 5, 1),
                partnerId, "P-001", "한국공조", "100000.00", "10000.00");
        PurchaseAccountingSlip s2 = postedSlip("PAS-2", LocalDate.of(2026, 5, 9),
                partnerId, "P-001", "한국공조", "200000.00", "20000.00");
        PurchaseAccountingSlip s3 = postedSlip("PAS-3", LocalDate.of(2026, 5, 31),
                partnerId, "P-001", "한국공조", "300000.00", "30000.00");
        List<UUID> ids = List.of(UUID.randomUUID(), UUID.randomUUID(), UUID.randomUUID());

        when(purchaseSlipRepository.findAllByIdsForBatch(ids)).thenReturn(List.of(s1, s2, s3));
        when(partnerLookupClient.findByPartnerCode("P-001"))
                .thenReturn(Optional.empty());
        when(taxInvoiceNumberService.next(LocalDate.of(2026, 5, 19)))
                .thenReturn("2026/05/19-2");
        when(taxInvoiceRepository.save(any(TaxInvoice.class))).thenAnswer(inv -> {
            TaxInvoice taxInvoice = inv.getArgument(0);
            setId(taxInvoice, taxInvoiceId);
            return taxInvoice;
        });

        var response = service.registerInbound(
                new RegisterInboundTaxInvoiceRequest(ids, "2026-05-19"), "actor-1");

        assertThat(response.totalSupplyAmount()).isEqualByComparingTo("600000.00");
        assertThat(response.totalVatAmount()).isEqualByComparingTo("60000.00");
        assertThat(response.totalAmount()).isEqualByComparingTo("660000.00");
        assertThat(response.linkedPurchaseSlipCount()).isEqualTo(3);
        assertThat(response.linkedPurchaseSlipNos())
                .containsExactly("PAS-1", "PAS-2", "PAS-3");
        assertThat(s1.getTaxInvoiceId()).isEqualTo(taxInvoiceId);
        assertThat(s2.getTaxInvoiceId()).isEqualTo(taxInvoiceId);
        assertThat(s3.getTaxInvoiceId()).isEqualTo(taxInvoiceId);
    }

    @Test
    void registerInbound_거래처_다른_입고전표_SAS_PARTNER_MONTH_MISMATCH() {
        List<UUID> ids = List.of(UUID.randomUUID(), UUID.randomUUID());
        when(purchaseSlipRepository.findAllByIdsForBatch(ids)).thenReturn(List.of(
                postedSlip("PAS-1", LocalDate.of(2026, 5, 1),
                        UUID.randomUUID(), "P-001", "A", "100000.00", "10000.00"),
                postedSlip("PAS-2", LocalDate.of(2026, 5, 2),
                        UUID.randomUUID(), "P-002", "B", "100000.00", "10000.00")
        ));

        assertThatThrownBy(() -> service.registerInbound(
                new RegisterInboundTaxInvoiceRequest(ids, "2026-05-19"), "actor-1"))
                .isInstanceOf(BusinessException.class)
                .satisfies(ex -> assertThat(((BusinessException) ex).getErrorCode())
                        .isEqualTo(ErrorCode.SAS_PARTNER_MONTH_MISMATCH));
    }

    private static PurchaseAccountingSlip postedSlip(String slipNo, LocalDate slipDate,
            UUID partnerId, String partnerCode, String partnerName,
            String supplyAmount, String vatAmount) {
        PurchaseAccountingSlip slip = PurchaseAccountingSlip.createDraft(
                slipNo, slipDate, partnerId, partnerCode, partnerName, SalesTaxType.TAXABLE, null);
        BigDecimal supply = new BigDecimal(supplyAmount);
        BigDecimal vat = new BigDecimal(vatAmount);
        BigDecimal total = supply.add(vat);
        PurchaseAccountingSlipLine line = PurchaseAccountingSlipLine.create(slip, 1,
                "P", "상품", BigDecimal.ONE, supply, supply, vat, total);
        line.getAllocations().add(PurchaseAccountingSlipAllocation.create(line,
                UUID.randomUUID(), "IN-" + slipNo, UUID.randomUUID(), 1, BigDecimal.ONE, total));
        slip.getLines().add(line);
        slip.recalcTotals();
        slip.post("actor-1");
        assertThat(slip.getStatus()).isEqualTo(PurchaseSlipStatus.POSTED);
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
