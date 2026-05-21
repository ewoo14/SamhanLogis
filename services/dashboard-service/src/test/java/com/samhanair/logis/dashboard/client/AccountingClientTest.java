package com.samhanair.logis.dashboard.client;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.header;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withServerError;

import com.samhanair.logis.discovery.ServiceDiscoveryClient;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import org.junit.jupiter.api.Test;
import org.mockito.Mockito;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;

class AccountingClientTest {

    @Test
    void prometheus_scrape_failure_increments_metric_and_fails_soft() {
        RestClient.Builder builder = RestClient.builder();
        MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
        SimpleMeterRegistry registry = new SimpleMeterRegistry();
        AccountingClient client = new AccountingClient(
                builder,
                Mockito.mock(ServiceDiscoveryClient.class),
                "http://accounting-service",
                "test-internal-token",
                true,
                registry);

        server.expect(requestTo("http://accounting-service/actuator/prometheus"))
                .andExpect(header("X-Internal-Token", "test-internal-token"))
                .andRespond(withServerError());

        assertThat(client.fetchPrometheusMetrics()).isEmpty();
        assertThat(registry.counter("dashboard_accounting_scrape_failures").count())
                .isEqualTo(1.0);
        server.verify();
    }

}
