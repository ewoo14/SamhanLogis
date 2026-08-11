package com.samhanair.logis.accounting.domain;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.LocalDate;
import org.junit.jupiter.api.Test;

class SalesCommissionSettlementTest {

    @Test
    void draft_hasNoDocumentNumber_untilConfirmed() {
        LocalDate settlementDate = LocalDate.of(2026, 8, 11);

        SalesCommissionSettlement settlement = SalesCommissionSettlement.createDraft(settlementDate);

        assertThat(settlement.getSettlementDate()).isEqualTo(settlementDate);
        assertThat(settlement.getStatus()).isEqualTo(SalesCommissionSettlementStatus.DRAFT);
        assertThat(settlement.getDocumentNo()).isNull();
    }

    @Test
    void confirm_assignsDocumentNumber_andReturnsDomainForChaining() {
        SalesCommissionSettlement settlement = SalesCommissionSettlement
                .createDraft(LocalDate.of(2026, 8, 11));

        SalesCommissionSettlement result = settlement.confirm("2026/08/11-1");

        assertThat(result).isSameAs(settlement);
        assertThat(settlement.getDocumentNo()).isEqualTo("2026/08/11-1");
        assertThat(settlement.getStatus()).isEqualTo(SalesCommissionSettlementStatus.CONFIRMED);
    }
}
