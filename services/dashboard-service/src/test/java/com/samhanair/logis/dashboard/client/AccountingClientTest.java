package com.samhanair.logis.dashboard.client;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.header;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.method;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withServerError;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

import com.samhanair.logis.discovery.ServiceDiscoveryClient;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.mockito.Mockito;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;

/**
 * {@link AccountingClient} 동작·요청 계약 테스트.
 *
 * <p>#531 RestClient 계약테스트 보강 — 실 동작/요청 계약만 검증한다. {@code /internal/sales} 의
 * 응답 파싱은 Phase 10 cutover 시점 구현이므로(현재 skeleton-mode), 그 다운스트림 응답 계약은
 * 가짜로 박제하지 않고 요청 계약 + 미구현(UnsupportedOperationException) 상태만 고정한다.
 */
class AccountingClientTest {

    private static final String TOKEN = "test-internal-token";

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

    @Test
    void fetchPrometheusMetrics_returnsBody_onSuccess() {
        RestClient.Builder builder = RestClient.builder();
        MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
        AccountingClient client = new AccountingClient(
                builder,
                Mockito.mock(ServiceDiscoveryClient.class),
                "http://accounting-service",
                TOKEN,
                true,
                new SimpleMeterRegistry());

        String metrics = "jvm_memory_used_bytes 123.0\n";
        server.expect(requestTo("http://accounting-service/actuator/prometheus"))
                .andExpect(method(HttpMethod.GET))
                .andExpect(header("X-Internal-Token", TOKEN))
                .andRespond(withSuccess(metrics, MediaType.TEXT_PLAIN));

        assertThat(client.fetchPrometheusMetrics()).isEqualTo(metrics);
        server.verify();
    }

    @Test
    void sumSalesByPartner_returnsZero_withoutHttpCall_whenArgumentNull() {
        RestClient.Builder builder = RestClient.builder();
        MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
        // skeleton-mode=false 라도 null 인자 가드가 먼저 동작해 외부 호출이 없어야 한다.
        AccountingClient client = new AccountingClient(
                builder,
                Mockito.mock(ServiceDiscoveryClient.class),
                "http://accounting-service",
                TOKEN,
                false,
                new SimpleMeterRegistry());

        // server expectation 미설정 — 호출 발생 시 실패하므로 HTTP 무호출이 검증된다.
        assertThat(client.sumSalesByPartner(null, LocalDate.of(2026, 1, 1), LocalDate.of(2026, 1, 31)))
                .isEqualByComparingTo(BigDecimal.ZERO);
        assertThat(client.sumSalesByPartner(UUID.randomUUID(), null, LocalDate.of(2026, 1, 31)))
                .isEqualByComparingTo(BigDecimal.ZERO);
        assertThat(client.sumSalesByPartner(UUID.randomUUID(), LocalDate.of(2026, 1, 1), null))
                .isEqualByComparingTo(BigDecimal.ZERO);
        server.verify();
    }

    @Test
    void sumSalesByPartner_returnsZero_withoutHttpCall_inSkeletonMode() {
        RestClient.Builder builder = RestClient.builder();
        MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
        // Phase 9 W4 기본값 skeleton-mode=true: 정상 인자라도 외부 호출 없이 ZERO.
        AccountingClient client = new AccountingClient(
                builder,
                Mockito.mock(ServiceDiscoveryClient.class),
                "http://accounting-service",
                TOKEN,
                true,
                new SimpleMeterRegistry());

        assertThat(client.sumSalesByPartner(
                UUID.randomUUID(), LocalDate.of(2026, 1, 1), LocalDate.of(2026, 1, 31)))
                .isEqualByComparingTo(BigDecimal.ZERO);
        server.verify();
    }

    @Test
    void sumSalesByPartner_sendsRequestContract_andBodyParsingPendingPhase10() {
        RestClient.Builder builder = RestClient.builder();
        MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
        // skeleton-mode=false → 실 요청 전송. 응답 파싱은 Phase 10 cutover 시점 구현(현재 미구현).
        AccountingClient client = new AccountingClient(
                builder,
                Mockito.mock(ServiceDiscoveryClient.class),
                "http://accounting-service",
                TOKEN,
                false,
                new SimpleMeterRegistry());

        UUID partnerId = UUID.randomUUID();
        server.expect(requestTo("http://accounting-service/internal/sales?partnerId=" + partnerId
                        + "&from=2026-01-01&to=2026-01-31"))
                .andExpect(method(HttpMethod.GET))
                .andExpect(header("X-Internal-Token", TOKEN))
                .andRespond(withSuccess("{}", MediaType.APPLICATION_JSON));

        // 요청 경로/쿼리/헤더 계약은 검증되나, 응답 파싱 미구현이라 UnsupportedOperationException 전파.
        assertThatThrownBy(() -> client.sumSalesByPartner(
                partnerId, LocalDate.of(2026, 1, 1), LocalDate.of(2026, 1, 31)))
                .isInstanceOf(UnsupportedOperationException.class);
        server.verify();
    }
}
