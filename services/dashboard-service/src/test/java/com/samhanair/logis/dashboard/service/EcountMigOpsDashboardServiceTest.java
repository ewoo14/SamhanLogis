package com.samhanair.logis.dashboard.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.when;

import com.samhanair.logis.dashboard.client.AccountingClient;
import com.samhanair.logis.dashboard.dto.EcountMigOpsDashboardResponse;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

@ExtendWith(MockitoExtension.class)
class EcountMigOpsDashboardServiceTest {

    @Mock
    private AccountingClient accountingClient;

    @Test
    void parses_prometheus_metrics_into_dashboard_response() {
        when(accountingClient.fetchPrometheusMetrics()).thenReturn("""
                ecount_mig_transform_status_total{slice="mig-8",status="TRANSFORMED"} 12.0
                ecount_mig_transform_status_total{slice="mig-8",status="REJECTED"} 2.0
                ecount_mig_imported_total{slice="mig-8"} 12.0
                ecount_mig_rejected_total{slice="mig-8",errorCode="MIG8_LOOKUP_MISS"} 2.0
                ecount_daily_closing_diff_count{closing_kind="SALES",source_kind="TAX_INVOICE"} 4.0
                ecount_aging_snapshot_net_receivable_total 150000.0
                ecount_aging_snapshot_net_payable_total 27000.0
                ecount_reimport_runs_total{slice="mig-8",status="FAIL"} 1.0
                ecount_reimport_files_scanned_total{slice="mig-8"} 3.0
                """);
        EcountMigOpsDashboardService service = new EcountMigOpsDashboardService(accountingClient);

        EcountMigOpsDashboardResponse response = service.load();

        assertThat(response.transformStatus()).hasSize(2);
        assertThat(response.transformStatus())
                .anySatisfy(row -> {
                    assertThat(row.slice()).isEqualTo("mig-8");
                    assertThat(row.status()).isEqualTo("REJECTED");
                    assertThat(row.count()).isEqualByComparingTo("2.0");
                });
        assertThat(response.importedTotals()).singleElement()
                .satisfies(row -> assertThat(row.count()).isEqualByComparingTo("12.0"));
        assertThat(response.rejectedTotals()).singleElement()
                .satisfies(row -> assertThat(row.errorCode()).isEqualTo("MIG8_LOOKUP_MISS"));
        assertThat(response.dailyClosingDiffs()).singleElement()
                .satisfies(row -> assertThat(row.diffCount()).isEqualByComparingTo("4.0"));
        assertThat(response.agingNet().netReceivable()).isEqualByComparingTo("150000.0");
        assertThat(response.agingNet().netPayable()).isEqualByComparingTo("27000.0");
        assertThat(response.reimportRuns()).singleElement()
                .satisfies(row -> assertThat(row.status()).isEqualTo("FAIL"));
        assertThat(response.reimportFilesScanned()).singleElement()
                .satisfies(row -> assertThat(row.count()).isEqualByComparingTo("3.0"));
    }
}
