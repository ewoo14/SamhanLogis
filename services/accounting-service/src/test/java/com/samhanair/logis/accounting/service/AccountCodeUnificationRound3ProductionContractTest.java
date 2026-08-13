package com.samhanair.logis.accounting.service;

import static org.assertj.core.api.Assertions.assertThat;

import com.samhanair.logis.accounting.report.ReceivablesPayablesService;
import java.lang.reflect.Field;
import java.util.List;
import org.junit.jupiter.api.Test;

class AccountCodeUnificationRound3ProductionContractTest {

    @Test
    void production_accounting_aggregates_use_v101_targets() throws Exception {
        assertThat(SalesAggregateService.ACCOUNT_RECEIVABLES).isEqualTo("1089");
        assertThat(SalesAggregateService.ACCOUNT_REVENUE).isEqualTo("4019");
        assertThat(staticCodes(ReceivablesPayablesService.class, "RECEIVABLE_ACCOUNTS"))
                .containsExactly("1089", "1209");
        assertThat(staticCodes(ReceivablesPayablesService.class, "PAYABLE_ACCOUNTS"))
                .containsExactly("2519", "2539");
        assertThat(staticCodes(ReceivablesPayablesService.class, "ALL_ACCOUNTS"))
                .containsExactly("1089", "1209", "2519", "2539");
    }

    @SuppressWarnings("unchecked")
    private static List<String> staticCodes(Class<?> type, String fieldName) throws Exception {
        Field field = type.getDeclaredField(fieldName);
        field.setAccessible(true);
        return (List<String>) field.get(null);
    }
}
