package com.samhanair.logis.arologis.client;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.content;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.header;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.jsonPath;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.method;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withStatus;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.SerializationFeature;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;
import com.samhanair.logis.arologis.dto.dispatch.SlipDispatchConfirmRequest;
import com.samhanair.logis.arologis.dto.dispatch.SlipDispatchUnavailableRequest;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.converter.json.MappingJackson2HttpMessageConverter;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;

/**
 * {@link SlipDispatchTaskClient} 단위 검증 — skeleton-mode + slip-service internal wire 계약.
 */
class SlipDispatchTaskClientTest {

    private static final String BASE_URL = "http://slip-service";
    private static final String TOKEN = "test-token";

    @Test
    void confirm_in_skeleton_mode_returns_true_without_call() {
        SlipDispatchTaskClient client = new SlipDispatchTaskClient(
                RestClient.builder(),
                BASE_URL,
                TOKEN,
                /* skeletonMode = */ true);

        boolean ok = client.confirm(UUID.randomUUID(),
                new SlipDispatchConfirmRequest(UUID.randomUUID(), List.of(), Instant.now()));
        assertThat(ok).isTrue();
    }

    @Test
    void unavailable_in_skeleton_mode_returns_true_without_call() {
        SlipDispatchTaskClient client = new SlipDispatchTaskClient(
                RestClient.builder(),
                BASE_URL,
                TOKEN,
                /* skeletonMode = */ true);

        boolean ok = client.unavailable(UUID.randomUUID(),
                new SlipDispatchUnavailableRequest(UUID.randomUUID(), "reason", List.of(1)));
        assertThat(ok).isTrue();
    }

    @Test
    void confirm_without_token_returns_false() {
        SlipDispatchTaskClient client = new SlipDispatchTaskClient(
                RestClient.builder(),
                BASE_URL,
                /* token = */ "",
                /* skeletonMode = */ false);

        boolean ok = client.confirm(UUID.randomUUID(),
                new SlipDispatchConfirmRequest(UUID.randomUUID(), List.of(), Instant.now()));
        assertThat(ok).isFalse();
    }

    @Test
    void confirm_204는_internal_token과_매칭완료_body를_전송하고_true를_반환한다() {
        UUID taskId = UUID.fromString("10000000-0000-0000-0000-000000000001");
        UUID dispatchId = UUID.fromString("20000000-0000-0000-0000-000000000001");
        SlipDispatchTaskClient client = liveClient();
        MockRestServiceServer server = bindServer(client);

        server.expect(requestTo(BASE_URL + "/internal/slip/dispatch-tasks/" + taskId + "/confirm"))
                .andExpect(method(HttpMethod.POST))
                .andExpect(header("X-Internal-Token", TOKEN))
                .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_JSON))
                .andExpect(jsonPath("$.arologisDispatchId").value(dispatchId.toString()))
                .andExpect(jsonPath("$.matchedDrivers[0].vehicleGroupSequence").value(1))
                .andExpect(jsonPath("$.matchedDrivers[0].driverCode").value("D-001"))
                .andExpect(jsonPath("$.confirmedAt").value("2026-06-29T01:02:03Z"))
                .andRespond(withStatus(HttpStatus.NO_CONTENT));

        boolean ok = client.confirm(taskId, new SlipDispatchConfirmRequest(
                dispatchId,
                List.of(new SlipDispatchConfirmRequest.MatchedDriverPayload(
                        1, "TONNAGE_1", "D-001", "홍길동", "010-1111-2222",
                        "INTERNAL", "서울12가3456")),
                Instant.parse("2026-06-29T01:02:03Z")));

        assertThat(ok).isTrue();
        server.verify();
    }

    @Test
    void unavailable_204는_internal_token과_매칭불가_body를_전송한다() {
        UUID taskId = UUID.fromString("10000000-0000-0000-0000-000000000002");
        UUID dispatchId = UUID.fromString("20000000-0000-0000-0000-000000000002");
        SlipDispatchTaskClient client = liveClient();
        MockRestServiceServer server = bindServer(client);

        server.expect(requestTo(BASE_URL + "/internal/slip/dispatch-tasks/" + taskId + "/unavailable"))
                .andExpect(method(HttpMethod.POST))
                .andExpect(header("X-Internal-Token", TOKEN))
                .andExpect(jsonPath("$.arologisDispatchId").value(dispatchId.toString()))
                .andExpect(jsonPath("$.reason").value("배차 가능 차량 없음"))
                .andExpect(jsonPath("$.failedVehicleGroups[0]").value(1))
                .andRespond(withStatus(HttpStatus.NO_CONTENT));

        assertThat(client.unavailable(taskId,
                new SlipDispatchUnavailableRequest(dispatchId, "배차 가능 차량 없음", List.of(1, 2))))
                .isTrue();
        server.verify();
    }

    @Test
    void modificationAccepted_204는_수정수락_endpoint로_전송한다() {
        UUID taskId = UUID.fromString("10000000-0000-0000-0000-000000000003");
        UUID dispatchId = UUID.fromString("20000000-0000-0000-0000-000000000003");
        SlipDispatchTaskClient client = liveClient();
        MockRestServiceServer server = bindServer(client);

        server.expect(requestTo(BASE_URL + "/internal/slip/dispatch-tasks/" + taskId + "/modification-accepted"))
                .andExpect(method(HttpMethod.POST))
                .andExpect(header("X-Internal-Token", TOKEN))
                .andExpect(jsonPath("$.arologisDispatchId").value(dispatchId.toString()))
                .andRespond(withStatus(HttpStatus.NO_CONTENT));

        assertThat(client.modificationAccepted(taskId, dispatchId)).isTrue();
        server.verify();
    }

    @Test
    void modificationRejected_204는_수정거부_endpoint와_사유를_전송한다() {
        UUID taskId = UUID.fromString("10000000-0000-0000-0000-000000000004");
        UUID dispatchId = UUID.fromString("20000000-0000-0000-0000-000000000004");
        SlipDispatchTaskClient client = liveClient();
        MockRestServiceServer server = bindServer(client);

        server.expect(requestTo(BASE_URL + "/internal/slip/dispatch-tasks/" + taskId + "/modification-rejected"))
                .andExpect(method(HttpMethod.POST))
                .andExpect(header("X-Internal-Token", TOKEN))
                .andExpect(jsonPath("$.arologisDispatchId").value(dispatchId.toString()))
                .andExpect(jsonPath("$.rejectionReason").value("이미 배차 확정"))
                .andRespond(withStatus(HttpStatus.NO_CONTENT));

        assertThat(client.modificationRejected(taskId, dispatchId, "이미 배차 확정")).isTrue();
        server.verify();
    }

    @Test
    void cancellationAccepted_204는_취소수락_endpoint로_전송한다() {
        UUID taskId = UUID.fromString("10000000-0000-0000-0000-000000000005");
        UUID dispatchId = UUID.fromString("20000000-0000-0000-0000-000000000005");
        SlipDispatchTaskClient client = liveClient();
        MockRestServiceServer server = bindServer(client);

        server.expect(requestTo(BASE_URL + "/internal/slip/dispatch-tasks/" + taskId + "/cancellation-accepted"))
                .andExpect(method(HttpMethod.POST))
                .andExpect(header("X-Internal-Token", TOKEN))
                .andExpect(jsonPath("$.arologisDispatchId").value(dispatchId.toString()))
                .andRespond(withStatus(HttpStatus.NO_CONTENT));

        assertThat(client.cancellationAccepted(taskId, dispatchId)).isTrue();
        server.verify();
    }

    @Test
    void cancellationRejected_204는_취소거부_endpoint와_사유를_전송한다() {
        UUID taskId = UUID.fromString("10000000-0000-0000-0000-000000000006");
        UUID dispatchId = UUID.fromString("20000000-0000-0000-0000-000000000006");
        SlipDispatchTaskClient client = liveClient();
        MockRestServiceServer server = bindServer(client);

        server.expect(requestTo(BASE_URL + "/internal/slip/dispatch-tasks/" + taskId + "/cancellation-rejected"))
                .andExpect(method(HttpMethod.POST))
                .andExpect(header("X-Internal-Token", TOKEN))
                .andExpect(jsonPath("$.arologisDispatchId").value(dispatchId.toString()))
                .andExpect(jsonPath("$.rejectionReason").value("상차 완료"))
                .andRespond(withStatus(HttpStatus.NO_CONTENT));

        assertThat(client.cancellationRejected(taskId, dispatchId, "상차 완료")).isTrue();
        server.verify();
    }

    @Test
    void confirm_4xx는_재시도하지_않고_false를_반환한다() {
        UUID taskId = UUID.fromString("10000000-0000-0000-0000-000000000007");
        SlipDispatchTaskClient client = liveClient();
        MockRestServiceServer server = bindServer(client);

        server.expect(requestTo(BASE_URL + "/internal/slip/dispatch-tasks/" + taskId + "/confirm"))
                .andExpect(method(HttpMethod.POST))
                .andExpect(header("X-Internal-Token", TOKEN))
                .andRespond(withStatus(HttpStatus.BAD_REQUEST));

        boolean ok = client.confirm(taskId,
                new SlipDispatchConfirmRequest(UUID.randomUUID(), List.of(), Instant.now()));

        assertThat(ok).isFalse();
        server.verify();
    }

    private static SlipDispatchTaskClient liveClient() {
        return new SlipDispatchTaskClient(RestClient.builder(), BASE_URL, TOKEN, false);
    }

    /**
     * 생성자가 requestFactory 를 덮어쓰므로 테스트에서는 mock server 에 바인딩된 RestClient 를 주입한다.
     */
    private static MockRestServiceServer bindServer(SlipDispatchTaskClient client) {
        RestClient.Builder builder = jacksonRestClientBuilder().baseUrl(BASE_URL);
        MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
        ReflectionTestUtils.setField(client, "restClient", builder.build());
        return server;
    }

    private static RestClient.Builder jacksonRestClientBuilder() {
        ObjectMapper objectMapper = new ObjectMapper()
                .registerModule(new JavaTimeModule())
                .disable(SerializationFeature.WRITE_DATES_AS_TIMESTAMPS);
        return RestClient.builder()
                .messageConverters(converters -> {
                    converters.removeIf(MappingJackson2HttpMessageConverter.class::isInstance);
                    converters.add(new MappingJackson2HttpMessageConverter(objectMapper));
                });
    }
}
