package com.samhanair.logis.accounting.it;

import static org.assertj.core.api.Assertions.assertThat;

import com.samhanair.logis.accounting.AccountingServiceApplication;
import com.samhanair.logis.accounting.client.PartnerLookupClient;
import com.samhanair.logis.accounting.domain.PurchaseAccountingSlip;
import com.samhanair.logis.accounting.domain.SalesAccountingSlip;
import com.samhanair.logis.accounting.domain.SalesTaxType;
import com.samhanair.logis.accounting.domain.TaxInvoice;
import com.samhanair.logis.accounting.repository.PurchaseAccountingSlipRepository;
import com.samhanair.logis.accounting.repository.SalesAccountingSlipRepository;
import com.samhanair.logis.accounting.repository.TaxInvoiceRepository;
import com.samhanair.logis.accounting.service.PurchaseAccountingSlipService;
import com.samhanair.logis.accounting.service.SalesAccountingSlipService;
import com.samhanair.logis.accounting.service.TaxInvoiceInboundService;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.transaction.annotation.Transactional;

/** 회계 partnerCode free-text 목록 3경로의 PostgreSQL wildcard literal IT. */
@SpringBootTest(classes = AccountingServiceApplication.class)
@Transactional
class AccountingPartnerCodeWildcardIT extends AbstractPostgresIT {

    private static final LocalDate DATE = LocalDate.of(2026, 7, 24);
    private static final UUID PARTNER_ID = UUID.randomUUID();

    @Autowired private SalesAccountingSlipService salesService;
    @Autowired private PurchaseAccountingSlipService purchaseService;
    @Autowired private TaxInvoiceInboundService inboundService;
    @Autowired private SalesAccountingSlipRepository salesRepository;
    @Autowired private PurchaseAccountingSlipRepository purchaseRepository;
    @Autowired private TaxInvoiceRepository taxInvoiceRepository;

    @MockBean private PartnerLookupClient partnerLookupClient;
    @MockBean private com.samhanair.logis.security.permission.DynamicPermissionClient dynamicPermissionClient;

    @Test
    void sales_purchase_and_inbound_partnerCode_searches_treat_percent_as_literal() {
        salesRepository.save(salesSlip("SALES%", "SALES%"));
        salesRepository.save(salesSlip("SALESX", "SALESX"));
        purchaseRepository.save(purchaseSlip("PURCHASE%", "PURCHASE%"));
        purchaseRepository.save(purchaseSlip("PURCHASEX", "PURCHASEX"));
        taxInvoiceRepository.save(inboundInvoice("INBOUND%", "INBOUND%"));
        taxInvoiceRepository.save(inboundInvoice("INBOUNDX", "INBOUNDX"));
        salesRepository.flush();
        purchaseRepository.flush();
        taxInvoiceRepository.flush();

        assertThat(salesService.list(DATE, DATE, "SALES%", null)).hasSize(1);
        assertThat(purchaseService.list(DATE, DATE, "PURCHASE%", null)).hasSize(1);
        assertThat(inboundService.listInbound(DATE, DATE, "INBOUND%")).hasSize(1);
    }

    private SalesAccountingSlip salesSlip(String code, String name) {
        return SalesAccountingSlip.createDraft(
                "S-" + UUID.randomUUID(), DATE, PARTNER_ID, code, name, SalesTaxType.TAXABLE, null);
    }

    private PurchaseAccountingSlip purchaseSlip(String code, String name) {
        return PurchaseAccountingSlip.createDraft(
                "P-" + UUID.randomUUID(), DATE, PARTNER_ID, code, name, SalesTaxType.TAXABLE, null);
    }

    private TaxInvoice inboundInvoice(String code, String name) {
        TaxInvoice invoice = TaxInvoice.createInbound(
                "T-" + UUID.randomUUID().toString().substring(0, 8), DATE, PARTNER_ID, code, name,
                null, new BigDecimal("100"), new BigDecimal("10"), new BigDecimal("110"), "it");
        invoice.markReceived("it");
        return invoice;
    }
}
