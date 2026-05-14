package com.samhanair.logis.slip.client;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.header;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.method;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withServerError;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.security.InternalAuthProperties;
import com.samhanair.logis.slip.dto.dispatch.ArologisCancellationRequest;
import com.samhanair.logis.slip.dto.dispatch.ArologisDispatchRequest;
import com.samhanair.logis.slip.dto.dispatch.ArologisDispatchResponse;
import com.samhanair.logis.slip.dto.dispatch.ArologisModificationRequest;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;

/**
 * {@link ArologisDispatchClient} 단위 IT — RestClient + MockRestServiceServer 패턴.
 *
 * <p>테스트 전용 생성자 (RestClient 직접 주입) 활용 — MockRestServiceServer 와 binding.
 */
class ArologisDispatchClientTest {

    private static final String AROLOGIS_BASE = "http://arologis-service";

    private ArologisDispatchClient client;
    private MockRestServiceServer server;
    private final ObjectMapper objectMapper = new ObjectMapper().findAndRegisterModules();

    @BeforeEach
    void setUp() {
        RestClient.Builder builder = RestClient.builder().baseUrl(AROLOGIS_BASE);
        server = MockRestServiceServer.bindTo(builder).build();
        RestClient bound = builder.build();

        InternalAuthProperties props = new InternalAuthProperties();
        props.setToken("test-internal-token");

        this.client = new ArologisDispatchClient(bound, props);
    }

    @Test
    void send_success_returns_response_and_attaches_internal_token() throws Exception {
        UUID taskId = UUID.randomUUID();
        UUID arologisId = UUID.randomUUID();
        ArologisDispatchResponse mockRes = new ArologisDispatchResponse(
                arologisId, taskId, Instant.parse("2026-05-14T10:00:00Z"),
                Instant.parse("2026-05-14T10:00:01Z"));

        server.expect(requestTo(AROLOGIS_BASE + "/internal/arologis/dispatches"))
                .andExpect(method(HttpMethod.POST))
                .andExpect(header("X-Internal-Token", "test-internal-token"))
                .andRespond(withSuccess(objectMapper.writeValueAsString(mockRes), MediaType.APPLICATION_JSON));

        ArologisDispatchRequest req = new ArologisDispatchRequest(
                taskId, "DT-20260514-001", LocalDate.of(2026, 5, 14),
                List.of(new ArologisDispatchRequest.VehicleGroup(1, "TONNAGE_1", List.of())));

        ArologisDispatchResponse res = client.send(req);
        assertThat(res.arologisDispatchId()).isEqualTo(arologisId);
        assertThat(res.samhanDispatchTaskId()).isEqualTo(taskId);
        server.verify();
    }

    @Test
    void send_failure_throws_business_exception() {
        server.expect(requestTo(AROLOGIS_BASE + "/internal/arologis/dispatches"))
                .andExpect(method(HttpMethod.POST))
                .andRespond(withServerError());

        ArologisDispatchRequest req = new ArologisDispatchRequest(
                UUID.randomUUID(), "DT-x", LocalDate.now(), List.of());

        assertThatThrownBy(() -> client.send(req))
                .isInstanceOf(BusinessException.class);
    }

    @Test
    void send_without_token_throws() {
        InternalAuthProperties emptyProps = new InternalAuthProperties();
        emptyProps.setToken("");
        ArologisDispatchClient noTokenClient = new ArologisDispatchClient(
                RestClient.builder().baseUrl(AROLOGIS_BASE).build(), emptyProps);

        ArologisDispatchRequest req = new ArologisDispatchRequest(
                UUID.randomUUID(), "DT-x", LocalDate.now(), List.of());
        assertThatThrownBy(() -> noTokenClient.send(req))
                .isInstanceOf(BusinessException.class);
    }

    // ---------- Phase C (BE Task B2) ----------

    @Test
    void requestModification_success_posts_to_modification_request_path() {
        UUID arologisId = UUID.randomUUID();
        UUID taskId = UUID.randomUUID();

        server.expect(requestTo(AROLOGIS_BASE
                        + "/internal/arologis/dispatches/" + arologisId + "/modification-request"))
                .andExpect(method(HttpMethod.POST))
                .andExpect(header("X-Internal-Token", "test-internal-token"))
                .andRespond(withSuccess());

        client.requestModification(arologisId,
                new ArologisModificationRequest(taskId, "슬립 추가 필요"));
        server.verify();
    }

    @Test
    void requestCancellation_success_posts_to_cancellation_request_path() {
        UUID arologisId = UUID.randomUUID();
        UUID taskId = UUID.randomUUID();

        server.expect(requestTo(AROLOGIS_BASE
                        + "/internal/arologis/dispatches/" + arologisId + "/cancellation-request"))
                .andExpect(method(HttpMethod.POST))
                .andExpect(header("X-Internal-Token", "test-internal-token"))
                .andRespond(withSuccess());

        client.requestCancellation(arologisId,
                new ArologisCancellationRequest(taskId, "거래처 일정 변경"));
        server.verify();
    }

    @Test
    void requestModification_failure_throws_business_exception() {
        UUID arologisId = UUID.randomUUID();

        server.expect(requestTo(AROLOGIS_BASE
                        + "/internal/arologis/dispatches/" + arologisId + "/modification-request"))
                .andExpect(method(HttpMethod.POST))
                .andRespond(withServerError());

        assertThatThrownBy(() -> client.requestModification(arologisId,
                new ArologisModificationRequest(UUID.randomUUID(), null)))
                .isInstanceOf(BusinessException.class);
    }
}
