package com.samhanair.logis.inventory.web;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.samhanair.logis.inventory.service.StockLedgerResponse;
import com.samhanair.logis.inventory.service.StockLedgerService;
import java.time.LocalDate;
import org.junit.jupiter.api.Test;

class StockLedgerControllerS2bTest {

    @Test
    void acceptsEditableDateRangeAndDelegatesIt() {
        StockLedgerService service = mock(StockLedgerService.class);
        StockLedgerController controller = new StockLedgerController(service);
        StockLedgerResponse response = mock(StockLedgerResponse.class);
        when(service.getLedger("CODE", LocalDate.of(2026, 8, 1), LocalDate.of(2026, 8, 12)))
                .thenReturn(response);

        assertThat(controller.ledger("CODE", LocalDate.of(2026, 8, 1), LocalDate.of(2026, 8, 12)).getData())
                .isSameAs(response);
    }
}
