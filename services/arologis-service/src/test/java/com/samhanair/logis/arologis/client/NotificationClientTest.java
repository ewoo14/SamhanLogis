package com.samhanair.logis.arologis.client;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.client.ExpectedCount.never;
import static org.springframework.test.web.client.ExpectedCount.once;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.header;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.jsonPath;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.method;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withServerError;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

import com.samhanair.logis.arologis.domain.ArologisNotifyStatus;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;

/** notification-service 내부 발송 endpoint 계약 테스트. */
class NotificationClientTest {

    private static final String TOKEN = "test-internal-token";
    private static final String BASE_URL = "http://notification-service";
    private static final String ENDPOINT = BASE_URL + "/internal/notifications/send";

    private MockRestServiceServer server;
    private NotificationClient client;

    @BeforeEach
    void setUp() {
        RestClient.Builder builder = RestClient.builder().baseUrl(BASE_URL);
        server = MockRestServiceServer.bindTo(builder).build();
        client = new NotificationClient(builder, BASE_URL, TOKEN, false);
    }

    @Test
    @DisplayName("배차 SMS는 EXTERNAL_PHONE/SMS 본문과 내부 토큰으로 발송한다")
    void sendDispatchSms_builds_external_phone_sms_request() {
        server.expect(once(), requestTo(ENDPOINT))
                .andExpect(method(HttpMethod.POST))
                .andExpect(header("X-Internal-Token", TOKEN))
                .andExpect(jsonPath("$.recipientType").value("EXTERNAL_PHONE"))
                .andExpect(jsonPath("$.recipientAddress").value("010-1111-2222"))
                .andExpect(jsonPath("$.recipientId").doesNotExist())
                .andExpect(jsonPath("$.channel").value("SMS"))
                .andExpect(jsonPath("$.subject").value("신규 배차 매칭"))
                .andExpect(jsonPath("$.body").value("차량 #1 (TONNAGE_1) 배정"))
                .andRespond(withSuccess(envelope("SENT"), MediaType.APPLICATION_JSON));

        NotificationSendOutcome outcome = client.sendDispatchSms(
                "010-1111-2222",
                "신규 배차 매칭",
                "차량 #1 (TONNAGE_1) 배정");

        assertThat(outcome.attempted()).isTrue();
        assertThat(outcome.status()).isEqualTo(ArologisNotifyStatus.SUCCESS);
        assertThat(outcome.errorCode()).isNull();
        server.verify();
    }

    @Test
    @DisplayName("notification-service 상태를 아로로지스 알림 상태로 매핑한다")
    void sendDispatchSms_maps_notification_statuses() {
        server.expect(once(), requestTo(ENDPOINT))
                .andRespond(withSuccess(envelope("FAILED"), MediaType.APPLICATION_JSON));
        server.expect(once(), requestTo(ENDPOINT))
                .andRespond(withSuccess(envelope("RETRYING"), MediaType.APPLICATION_JSON));
        server.expect(once(), requestTo(ENDPOINT))
                .andRespond(withSuccess(envelope("PENDING"), MediaType.APPLICATION_JSON));

        NotificationSendOutcome failed = client.sendDispatchSms("010-0000-0000", "제목", "본문");
        NotificationSendOutcome retrying = client.sendDispatchSms("010-0000-0000", "제목", "본문");
        NotificationSendOutcome pending = client.sendDispatchSms("010-0000-0000", "제목", "본문");

        assertThat(failed).isEqualTo(new NotificationSendOutcome(true, ArologisNotifyStatus.FAILED, "SEND_FAILED"));
        assertThat(retrying).isEqualTo(new NotificationSendOutcome(true, ArologisNotifyStatus.DELAYED, null));
        assertThat(pending).isEqualTo(new NotificationSendOutcome(true, ArologisNotifyStatus.DELAYED, null));
        server.verify();
    }

    @Test
    @DisplayName("skeleton-mode는 실제 발송을 시도하지 않았다고 반환한다")
    void sendDispatchSms_in_skeleton_mode_returns_not_attempted() {
        RestClient.Builder builder = RestClient.builder().baseUrl(BASE_URL);
        MockRestServiceServer noCallServer = MockRestServiceServer.bindTo(builder).build();
        NotificationClient skeletonClient = new NotificationClient(builder, BASE_URL, TOKEN, true);
        noCallServer.expect(never(), requestTo(ENDPOINT));

        NotificationSendOutcome outcome = skeletonClient.sendDispatchSms("010-1111-2222", "제목", "본문");

        assertThat(outcome).isEqualTo(new NotificationSendOutcome(false, null, null));
        noCallServer.verify();
    }

    @Test
    @DisplayName("HTTP 오류와 예외는 fail-soft 실패 outcome으로 반환한다")
    void sendDispatchSms_maps_http_error_to_failed_outcome() {
        server.expect(once(), requestTo(ENDPOINT))
                .andRespond(withServerError());

        NotificationSendOutcome outcome = client.sendDispatchSms("010-1111-2222", "제목", "본문");

        assertThat(outcome.attempted()).isTrue();
        assertThat(outcome.status()).isEqualTo(ArologisNotifyStatus.FAILED);
        assertThat(outcome.errorCode()).isEqualTo("HTTP_500");
        server.verify();
    }

    private static String envelope(String status) {
        return """
                {
                  "success": true,
                  "code": "SUCCESS",
                  "message": "OK",
                  "data": {
                    "requestId": "00000000-0000-0000-0000-000000000001",
                    "recipientType": "EXTERNAL_PHONE",
                    "recipientAddress": "010-1111-2222",
                    "channel": "SMS",
                    "subject": "제목",
                    "body": "본문",
                    "status": "%s",
                    "attemptCount": 0,
                    "createdAt": "2026-07-14T12:00:00"
                  },
                  "timestamp": "2026-07-14T12:00:00"
                }
                """.formatted(status);
    }
}
