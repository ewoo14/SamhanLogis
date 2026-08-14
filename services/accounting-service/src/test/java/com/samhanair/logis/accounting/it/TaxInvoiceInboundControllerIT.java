package com.samhanair.logis.accounting.it;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.samhanair.logis.accounting.AccountingServiceApplication;
import com.samhanair.logis.accounting.client.ChatRoomMappingClient;
import com.samhanair.logis.security.permission.DynamicPermissionClient;
import com.samhanair.logis.accounting.client.ETaxClient;
import com.samhanair.logis.accounting.client.KftcClient;
import com.samhanair.logis.accounting.client.PartnerLookupClient;
import com.samhanair.logis.accounting.client.PartnerSummary;
import com.samhanair.logis.accounting.client.ProductClient;
import com.samhanair.logis.accounting.client.SlipQueryClient;
import com.samhanair.logis.accounting.client.SlipServiceClient;
import com.samhanair.logis.accounting.domain.PurchaseAccountingSlip;
import com.samhanair.logis.accounting.domain.PurchaseAccountingSlipAllocation;
import com.samhanair.logis.accounting.domain.PurchaseAccountingSlipLine;
import com.samhanair.logis.accounting.domain.SalesTaxType;
import com.samhanair.logis.accounting.domain.TaxInvoice;
import com.samhanair.logis.accounting.domain.TaxInvoiceDirection;
import com.samhanair.logis.accounting.domain.TaxInvoiceStatus;
import com.samhanair.logis.accounting.domain.TaxInvoiceType;
import com.samhanair.logis.accounting.repository.PurchaseAccountingSlipRepository;
import com.samhanair.logis.accounting.repository.TaxInvoiceRepository;
import com.samhanair.logis.accounting.web.dto.RegisterInboundTaxInvoiceRequest;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.http.MediaType;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;

@SpringBootTest(classes = AccountingServiceApplication.class)
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Transactional
class TaxInvoiceInboundControllerIT extends AbstractPostgresIT {

    @Autowired MockMvc mvc;
    @Autowired ObjectMapper objectMapper;
    @Autowired PurchaseAccountingSlipRepository purchaseSlipRepository;
    @Autowired TaxInvoiceRepository taxInvoiceRepository;

    @MockBean SlipServiceClient slipServiceClient;
    @MockBean SlipQueryClient slipQueryClient;
    @MockBean PartnerLookupClient partnerLookupClient;
    @MockBean ProductClient productClient;
    @MockBean ChatRoomMappingClient chatRoomMappingClient;
    @MockBean ETaxClient eTaxClient;
    @MockBean KftcClient kftcClient;
    @MockBean(classes = com.samhanair.logis.security.permission.DynamicPermissionClient.class) DynamicPermissionClient dynamicPermissionClient;

    @Test
    void POST_admin_tax_invoices_inbound_3장_정상등록과_입고전표_link() throws Exception {
        UUID partnerId = UUID.randomUUID();
        when(partnerLookupClient.findByPartnerCode("P-001"))
                .thenReturn(Optional.of(new PartnerSummary(
                        partnerId, "P-001", "한국공조", "123-45-67890", "서울")));
        PurchaseAccountingSlip s1 = purchaseSlipRepository.save(postedSlip("PAS-IT-IN-1",
                LocalDate.of(2026, 5, 1), partnerId, "P-001", "한국공조",
                "100000.00", "10000.00"));
        PurchaseAccountingSlip s2 = purchaseSlipRepository.save(postedSlip("PAS-IT-IN-2",
                LocalDate.of(2026, 5, 11), partnerId, "P-001", "한국공조",
                "200000.00", "20000.00"));
        PurchaseAccountingSlip s3 = purchaseSlipRepository.save(postedSlip("PAS-IT-IN-3",
                LocalDate.of(2026, 5, 31), partnerId, "P-001", "한국공조",
                "300000.00", "30000.00"));

        RegisterInboundTaxInvoiceRequest request = new RegisterInboundTaxInvoiceRequest(
                List.of(s1.getId(), s2.getId(), s3.getId()), "2026-05-19");

        TaxInvoiceRepository.VatSummary beforePurchaseVat = taxInvoiceRepository.aggregateVatByType(
                TaxInvoiceType.PURCHASE, LocalDate.of(2026, 5, 1),
                LocalDate.of(2026, 5, 31));

        String response = mvc.perform(post("/admin/tax-invoices/inbound")
                        .contentType(MediaType.APPLICATION_JSON)
                        .header("X-User-Id", "00000000-0000-0000-0000-000000000114")
                        .header("X-User-Role", "MASTER")
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.taxInvoiceNo").exists())
                .andExpect(jsonPath("$.partnerCode").value("P-001"))
                .andExpect(jsonPath("$.partnerName").value("한국공조"))
                .andExpect(jsonPath("$.totalSupplyAmount").value(600000.00))
                .andExpect(jsonPath("$.totalVatAmount").value(60000.00))
                .andExpect(jsonPath("$.totalAmount").value(660000.00))
                .andExpect(jsonPath("$.linkedPurchaseSlipCount").value(3))
                .andExpect(jsonPath("$.status").value("ISSUED"))
                .andReturn()
                .getResponse()
                .getContentAsString();

        JsonNode json = objectMapper.readTree(response);
        String taxInvoiceNo = json.get("taxInvoiceNo").asText();
        TaxInvoice taxInvoice = taxInvoiceRepository.findAll().stream()
                .filter(ti -> taxInvoiceNo.equals(ti.getTaxInvoiceNo()))
                .findFirst()
                .orElseThrow();

        assertThat(taxInvoice.getStatus()).isEqualTo(TaxInvoiceStatus.ISSUED);
        assertThat(taxInvoice.getDirection()).isEqualTo(TaxInvoiceDirection.INBOUND);
        assertThat(taxInvoice.getIssuedBy()).isEqualTo("00000000-0000-0000-0000-000000000114");
        assertThat(taxInvoice.getSupplyAmount()).isEqualByComparingTo("600000.00");
        assertThat(taxInvoice.getVatAmount()).isEqualByComparingTo("60000.00");
        assertThat(taxInvoice.getTotalAmount()).isEqualByComparingTo("660000.00");
        assertThat(taxInvoice.getPartnerBusinessNo()).isEqualTo("123-45-67890");
        assertThat(taxInvoice.getLines()).hasSize(3);
        assertThat(purchaseSlipRepository.findByTaxInvoiceId(taxInvoice.getId()))
                .extracting(PurchaseAccountingSlip::getSlipNo)
                .containsExactlyInAnyOrder("PAS-IT-IN-1", "PAS-IT-IN-2", "PAS-IT-IN-3");

        TaxInvoiceRepository.VatSummary afterPurchaseVat = taxInvoiceRepository.aggregateVatByType(
                TaxInvoiceType.PURCHASE, LocalDate.of(2026, 5, 1),
                LocalDate.of(2026, 5, 31));
        assertThat(afterPurchaseVat.getInvoiceCount() - beforePurchaseVat.getInvoiceCount())
                .isEqualTo(1);
        assertThat(afterPurchaseVat.getSupplyAmountSum()
                .subtract(beforePurchaseVat.getSupplyAmountSum()))
                .isEqualByComparingTo("600000.00");
        assertThat(afterPurchaseVat.getVatAmountSum()
                .subtract(beforePurchaseVat.getVatAmountSum()))
                .isEqualByComparingTo("60000.00");
    }

    @Test
    void POST_admin_tax_invoices_inbound_VOIDED_purchase_slip_거부() throws Exception {
        PurchaseAccountingSlip slip = postedSlip("PAS-IT-VOIDED",
                LocalDate.of(2026, 5, 1), UUID.randomUUID(), "P-001", "A",
                "100000.00", "10000.00");
        slip.voidSlip("00000000-0000-0000-0000-000000000114");
        PurchaseAccountingSlip saved = purchaseSlipRepository.save(slip);

        RegisterInboundTaxInvoiceRequest request = new RegisterInboundTaxInvoiceRequest(
                List.of(saved.getId()), "2026-05-19");

        mvc.perform(post("/admin/tax-invoices/inbound")
                        .contentType(MediaType.APPLICATION_JSON)
                        .header("X-User-Id", "00000000-0000-0000-0000-000000000114")
                        .header("X-User-Role", "MASTER")
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.code").value("SAS_PURCHASE_SLIP_NOT_POSTED"));
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
        slip.post("00000000-0000-0000-0000-000000000114");
        return slip;
    }
}
