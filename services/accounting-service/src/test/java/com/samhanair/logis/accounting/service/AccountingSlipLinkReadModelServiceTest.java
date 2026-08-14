package com.samhanair.logis.accounting.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.samhanair.logis.accounting.client.SlipLineSnapshot;
import com.samhanair.logis.accounting.client.SlipServiceClient;
import com.samhanair.logis.accounting.domain.SalesAccountingSlip;
import com.samhanair.logis.accounting.domain.SalesAccountingSlipAllocation;
import com.samhanair.logis.accounting.domain.SalesAccountingSlipLine;
import com.samhanair.logis.accounting.repository.PurchaseAccountingSlipAllocationRepository;
import com.samhanair.logis.accounting.repository.SalesAccountingSlipAllocationRepository;
import java.math.BigDecimal;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Test;

class AccountingSlipLinkReadModelServiceTest {

    @Test
    void N대M_allocation은_회계전표번호별_한행으로_묶고_합계는_모든_allocation을_반영한다() {
        UUID sourceId = UUID.randomUUID();
        SlipServiceClient slipClient = mock(SlipServiceClient.class);
        SalesAccountingSlipAllocationRepository salesRepository = mock(SalesAccountingSlipAllocationRepository.class);
        PurchaseAccountingSlipAllocationRepository purchaseRepository = mock(PurchaseAccountingSlipAllocationRepository.class);
        SalesAccountingSlip accountingSlip = mock(SalesAccountingSlip.class);
        SalesAccountingSlipLine accountingLine = mock(SalesAccountingSlipLine.class);
        SalesAccountingSlipAllocation first = mock(SalesAccountingSlipAllocation.class);
        SalesAccountingSlipAllocation second = mock(SalesAccountingSlipAllocation.class);

        when(slipClient.getSlipLines(sourceId)).thenReturn(List.of(
                snapshot(sourceId, "OUT-001", 1, "100"),
                snapshot(sourceId, "OUT-001", 2, "50")));
        when(salesRepository.findActiveBySourceSlipId(sourceId)).thenReturn(List.of(first, second));
        when(first.getAllocatedAmount()).thenReturn(new BigDecimal("60"));
        when(first.getAllocatedQty()).thenReturn(BigDecimal.ONE);
        when(second.getAllocatedAmount()).thenReturn(new BigDecimal("40"));
        when(second.getAllocatedQty()).thenReturn(BigDecimal.ONE);
        when(first.getSalesSlipLine()).thenReturn(accountingLine);
        when(second.getSalesSlipLine()).thenReturn(accountingLine);
        when(accountingLine.getSlip()).thenReturn(accountingSlip);
        when(accountingSlip.getSlipNo()).thenReturn("AS-001");
        when(accountingSlip.getStatus()).thenReturn(com.samhanair.logis.accounting.domain.SalesSlipStatus.DRAFT);
        when(accountingSlip.getTotalAmount()).thenReturn(new BigDecimal("100"));
        when(accountingSlip.getTaxInvoiceId()).thenReturn(UUID.randomUUID());

        AccountingSlipLinkReadModel result = new AccountingSlipLinkReadModelService(
                slipClient, salesRepository, purchaseRepository).read(sourceId, "OUTBOUND");

        assertThat(result.sourceQuantity()).isEqualByComparingTo("3");
        assertThat(result.allocatedQuantity()).isEqualByComparingTo("2");
        assertThat(result.remainingQuantity()).isEqualByComparingTo("1");
        assertThat(result.sourceAmount()).isEqualByComparingTo("150");
        assertThat(result.allocatedAmount()).isEqualByComparingTo("100");
        assertThat(result.remainingAmount()).isEqualByComparingTo("50");
        assertThat(result.linkedSlips()).hasSize(1);
        assertThat(result.taxInvoiceLinkStatus())
                .isEqualTo(AccountingSlipLinkReadModel.TaxInvoiceLinkStatus.LINKED);
        verify(salesRepository).findActiveBySourceSlipId(sourceId);
    }

    @Test
    void UUID_only는_전표번호를_유지한_데이터무결성차단_결과로_반환된다() {
        UUID sourceId = UUID.randomUUID();
        SlipServiceClient slipClient = mock(SlipServiceClient.class);
        SalesAccountingSlipAllocationRepository salesRepository = mock(SalesAccountingSlipAllocationRepository.class);
        PurchaseAccountingSlipAllocationRepository purchaseRepository = mock(PurchaseAccountingSlipAllocationRepository.class);
        when(slipClient.getSlipLines(sourceId)).thenReturn(List.of(
                new SlipLineSnapshot(sourceId, "IN-UUID-ONLY-001", UUID.randomUUID(), UUID.randomUUID(),
                        "", "legacy", "item", 1, BigDecimal.TEN, BigDecimal.TEN,
                        "CONFIRMED", "INBOUND")));
        when(purchaseRepository.findActiveBySourceSlipId(sourceId)).thenReturn(List.of());

        AccountingSlipLinkReadModel result = new AccountingSlipLinkReadModelService(
                slipClient, salesRepository, purchaseRepository).read(sourceId, "INBOUND");

        assertThat(result.sourceSlipNo()).isEqualTo("IN-UUID-ONLY-001");
        assertThat(result.dataIntegrityBlocked()).isTrue();
        assertThat(AccountingSlipEligibility.evaluate(result, true, "ACCOUNTANT").allowed())
                .isFalse();
    }

    private static SlipLineSnapshot snapshot(UUID slipId, String slipNo, int quantity, String amount) {
        return new SlipLineSnapshot(slipId, slipNo, UUID.randomUUID(), UUID.randomUUID(),
                "P-001", "partner", "item", quantity, BigDecimal.ONE,
                new BigDecimal(amount), "CONFIRMED", "OUTBOUND");
    }
}
