package com.samhanair.logis.notification.adapter.sms;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

import com.samhanair.logis.notification.adapter.NotificationGatewayResult;
import com.samhanair.logis.notification.config.AligoProperties;
import com.samhanair.logis.notification.domain.NotificationChannel;
import com.samhanair.logis.notification.domain.NotificationRequest;
import com.samhanair.logis.notification.domain.RecipientType;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;

/**
 * SP-09-2 — {@link AligoSmsAdapter#isPlaceholder(String)} placeholder runtime guard 강화 검증.
 *
 * <p>SP-09-1 {@code ETaxClientImpl.isPlaceholderApiKey()} 와 동일 패턴:
 * 아래 4가지 placeholder 키워드 중 하나라도 포함된 자격증명이 설정되면 외부 Aligo API 를 호출하지 않고
 * 외부 호출 없이 비전송 결과를 반환해야 한다.
 *
 * <ol>
 *   <li>{@code CHANGE_ME_LOCAL_ONLY} — 기존 dev default placeholder</li>
 *   <li>{@code PLACEHOLDER_DEV_ONLY} — SP-09-1 ETax 패턴 통일</li>
 *   <li>{@code changeme} — 일반 placeholder 변형 (case-insensitive)</li>
 *   <li>{@code dummy} — 테스트 fixture placeholder (case-insensitive)</li>
 * </ol>
 *
 * <p>Spring context 없이 단순 생성자 주입으로 테스트하므로 경량 (외부 서버 불필요).
 */
class AligoSmsAdapterPlaceholderRuntimeGuardIT {

    /**
     * placeholder key 를 가진 properties 로 어댑터를 생성하고 send() 를 호출하면
     * 외부 호출 없이 stub-success 응답이 반환되어야 한다.
     *
     * @param key 테스트용 placeholder key 문자열
     */
    private NotificationGatewayResult callWithPlaceholderKey(String key) {
        AligoProperties props = new AligoProperties();
        props.setKey(key);
        props.setUserid("valid-user");
        props.setSender("01000000000");
        props.setApiUrl("https://apis.aligo.in/send/");

        AligoSmsAdapter adapter = new AligoSmsAdapter(props, RestClient.builder());

        NotificationRequest request = NotificationRequest.open(
                RecipientType.EXTERNAL_PHONE, null, "01099990000",
                NotificationChannel.SMS, "TEST", null, "placeholder guard 테스트", null);

        return adapter.send(request);
    }

    @Test
    @DisplayName("CHANGE_ME_LOCAL_ONLY — 외부 호출 없이 비전송 결과 반환")
    void changeMeLocalOnly_returnsNotSentResult() {
        NotificationGatewayResult result = callWithPlaceholderKey("CHANGE_ME_LOCAL_ONLY");

        assertThat(result.success()).isFalse();
        assertThat(result.gatewayStatus()).isEqualTo("NOT_SENT_CREDENTIALS_PLACEHOLDER");
    }

    @Test
    @DisplayName("PLACEHOLDER_DEV_ONLY — 외부 호출 없이 비전송 결과 반환")
    void placeholderDevOnly_returnsNotSentResult() {
        NotificationGatewayResult result = callWithPlaceholderKey("PLACEHOLDER_DEV_ONLY");

        assertThat(result.success()).isFalse();
        assertThat(result.gatewayStatus()).isEqualTo("NOT_SENT_CREDENTIALS_PLACEHOLDER");
    }

    @Test
    @DisplayName("changeme (소문자) — 외부 호출 없이 비전송 결과 반환")
    void changeme_lowercase_returnsNotSentResult() {
        NotificationGatewayResult result = callWithPlaceholderKey("changeme");

        assertThat(result.success()).isFalse();
        assertThat(result.gatewayStatus()).isEqualTo("NOT_SENT_CREDENTIALS_PLACEHOLDER");
    }

    @Test
    @DisplayName("dummy (소문자) — 외부 호출 없이 비전송 결과 반환")
    void dummy_lowercase_returnsNotSentResult() {
        NotificationGatewayResult result = callWithPlaceholderKey("dummy");

        assertThat(result.success()).isFalse();
        assertThat(result.gatewayStatus()).isEqualTo("NOT_SENT_CREDENTIALS_PLACEHOLDER");
    }

    @Test
    @DisplayName("정상 자격증명 — Aligo 호출 경로를 막지 않고 성공 응답을 처리한다")
    void realCredentials_useGatewaySuccessPath() {
        AligoProperties props = new AligoProperties();
        props.setKey("valid-key");
        props.setUserid("valid-user");
        props.setSender("01000000000");
        props.setApiUrl("https://apis.aligo.in/send/");

        RestClient.Builder builder = RestClient.builder();
        MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
        server.expect(requestTo("https://apis.aligo.in/send/"))
                .andRespond(withSuccess(
                        "{\"result_code\":1,\"msg_id\":\"mock-message\"}",
                        MediaType.APPLICATION_JSON));

        NotificationRequest request = NotificationRequest.open(
                RecipientType.EXTERNAL_PHONE, null, "01099990000",
                NotificationChannel.SMS, "TEST", null, "정상 경로 테스트", null);
        NotificationGatewayResult result = new AligoSmsAdapter(props, builder).send(request);

        assertThat(result.success()).isTrue();
        assertThat(result.messageId()).isEqualTo("mock-message");
        server.verify();
    }
}
