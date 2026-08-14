package com.samhanair.logis.accounting.service;

import static org.assertj.core.api.Assertions.assertThat;

import com.samhanair.logis.accounting.report.ReceivablesPayablesService;
import java.lang.reflect.Field;
import java.nio.file.Files;
import java.nio.file.Path;
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

    @Test
    void legacy_display_mapping_uses_every_v101_target_and_only_leaves_unmapped_codes() {
        assertThat(AccountEcountMapping.resolve("919").ecountCode()).isEqualTo("9399");
        assertThat(AccountEcountMapping.resolve("142").ecountCode()).isEqualTo("2024");
        assertThat(AccountEcountMapping.resolve("900").status())
                .isEqualTo(AccountEcountMapping.Status.UNDETERMINED);
    }

    @Test
    void mapped_legacy_codes_are_not_reintroduced_at_production_account_sites() throws Exception {
        assertNoLegacyCodes("src/main/java/com/samhanair/logis/accounting/report/CashFlowStatementService.java",
                "101", "102", "110", "201", "210", "220", "142", "146", "260", "301");
        assertNoLegacyCodes("src/main/java/com/samhanair/logis/accounting/report/AccountStatementService.java",
                "110", "201", "210");
        assertNoLegacyCodes("src/main/java/com/samhanair/logis/accounting/service/CollectionPlanService.java", "110");
        assertNoLegacyCodes("src/main/java/com/samhanair/logis/accounting/service/EcountDepositReportImporter.java", "110");
        assertNoLegacyCodes("src/main/java/com/samhanair/logis/accounting/service/EcountExpenseVoucherImporter.java", "201");
        // AccountEcountMapping is an explicit legacy-input compatibility boundary; its old keys are intentional.
        assertThat(Files.readString(Path.of(
                "src/main/java/com/samhanair/logis/accounting/report/FundsStatusService.java")))
                .contains("\"114\""); // V101에 매핑이 없어 정상적으로 유지한 코드
    }

    private static void assertNoLegacyCodes(String relativePath, String... codes) throws Exception {
        String source = Files.readString(Path.of(relativePath));
        for (String code : codes) {
            assertThat(source).as(relativePath + " legacy account code " + code)
                    .doesNotContain("\"" + code + "\"");
        }
    }

    @SuppressWarnings("unchecked")
    private static List<String> staticCodes(Class<?> type, String fieldName) throws Exception {
        Field field = type.getDeclaredField(fieldName);
        field.setAccessible(true);
        return (List<String>) field.get(null);
    }
}
