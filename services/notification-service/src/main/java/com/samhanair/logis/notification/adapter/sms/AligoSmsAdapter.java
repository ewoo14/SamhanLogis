package com.samhanair.logis.notification.adapter.sms;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.samhanair.logis.notification.adapter.NotificationGatewayResult;
import com.samhanair.logis.notification.config.AligoProperties;
import com.samhanair.logis.notification.domain.NotificationRequest;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.util.MultiValueMap;
import org.springframework.web.client.RestClient;

/**
 * Aligo SMS 게이트웨이 어댑터 — Phase 5 {@code AligoSmsGateway} 의 동일 호출 모델 흡수.
 *
 * <p>API: {@code POST https://apis.aligo.in/send/} (form-urlencoded body)
 * <ul>
 *   <li>{@code key} — API key (Aligo console 발급)</li>
 *   <li>{@code user_id} — Aligo 계정 ID</li>
 *   <li>{@code sender} — 사전 등록된 발신번호</li>
 *   <li>{@code receiver} — 수신번호 (콤마 구분 가능)</li>
 *   <li>{@code msg} — 메시지 텍스트</li>
 *   <li>{@code testmode_yn} — 운영은 N</li>
 * </ul>
 *
 * <p>응답 (JSON): {@code {"result_code": 1, "message": "성공", "msg_id": "..."}}.
 * {@code result_code == 1} 만 success, 그 외 모두 failure.
 *
 * <p>SP-09-2 placeholder runtime guard 강화 (SP-09-1 ETaxClientImpl {@code isPlaceholderApiKey()} 와 동일 패턴):
 * 아래 값 중 하나라도 placeholder 로 판정되면 외부 호출을 건너뛰고 비전송 실패를 반환한다.
 * 판정 대상 키워드 (case-insensitive): {@code CHANGE_ME_LOCAL_ONLY}, {@code PLACEHOLDER_DEV_ONLY},
 * {@code changeme}, {@code dummy}.
 * 운영 / staging 에서 실제 key 주입 시 본격 호출.
 */
@Slf4j
@Component
public class AligoSmsAdapter implements SmsAdapter {

    private static final String SEND_PATH = "/send/";
    private static final ObjectMapper MAPPER = new ObjectMapper();

    private final AligoProperties properties;
    private final RestClient.Builder restClientBuilder;

    public AligoSmsAdapter(AligoProperties properties, RestClient.Builder restClientBuilder) {
        this.properties = properties;
        this.restClientBuilder = restClientBuilder;
    }

    @Override
    public NotificationGatewayResult send(NotificationRequest request) {
        if (isPlaceholder(properties.getKey()) || isPlaceholder(properties.getUserid())
                || isPlaceholder(properties.getSender())) {
            log.debug("[AligoSmsAdapter] Aligo credentials placeholder — not sent requestId={}",
                    request.getId());
            return NotificationGatewayResult.notSent(
                    "NOT_SENT_CREDENTIALS_PLACEHOLDER",
                    "{\"note\":\"Aligo 호출 생략: 자격증명 placeholder\"}");
        }

        try {
            String phone = resolvePhone(request);
            String message = request.getBody() == null ? "" : request.getBody();

            MultiValueMap<String, String> form = new LinkedMultiValueMap<>();
            form.add("key", properties.getKey());
            form.add("user_id", properties.getUserid());
            form.add("sender", properties.getSender());
            form.add("receiver", phone);
            form.add("msg", message);
            form.add("testmode_yn", "N");

            RestClient client = restClientBuilder.baseUrl(deriveBaseUrl(properties.getApiUrl())).build();
            String response = client.post()
                    .uri(SEND_PATH)
                    .contentType(MediaType.APPLICATION_FORM_URLENCODED)
                    .body(form)
                    .retrieve()
                    .body(String.class);

            JsonNode root = MAPPER.readTree(response == null ? "{}" : response);
            int resultCode = root.path("result_code").asInt(-1);
            if (resultCode == 1) {
                String messageId = root.path("msg_id").asText(null);
                log.info("[AligoSmsAdapter] sent requestId={} phone={} msgId={}",
                        request.getId(), phone, messageId);
                return NotificationGatewayResult.success(messageId, response);
            }
            String errorMsg = root.path("message").asText("Aligo error code=" + resultCode);
            log.warn("[AligoSmsAdapter] failed requestId={} phone={} code={} msg={}",
                    request.getId(), phone, resultCode, errorMsg);
            return NotificationGatewayResult.failure("FAILURE_ALIGO_" + resultCode, response);
        } catch (Exception ex) {
            log.warn("[AligoSmsAdapter] exception requestId={} msg={}", request.getId(), ex.getMessage());
            return NotificationGatewayResult.failure("FAILURE_ALIGO_EXCEPTION", ex.getMessage());
        }
    }

    private String resolvePhone(NotificationRequest request) {
        String addr = request.getRecipientAddress();
        if (addr == null || addr.isBlank()) {
            throw new IllegalArgumentException("Aligo SMS 발송 — recipientAddress (전화번호) 필수");
        }
        return addr.replace("-", "");
    }

    /**
     * SP-09-2 placeholder runtime guard — SP-09-1 {@code ETaxClientImpl.isPlaceholderApiKey()} 와 동일 패턴.
     *
     * <p>판정 대상 키워드 (case-insensitive):
     * <ul>
     *   <li>{@code CHANGE_ME_LOCAL_ONLY} — 기존 dev default</li>
     *   <li>{@code PLACEHOLDER_DEV_ONLY} — SP-09-1 ETax 패턴 통일</li>
     *   <li>{@code changeme} — 일반 placeholder 변형</li>
     *   <li>{@code dummy} — 테스트 fixture placeholder</li>
     * </ul>
     *
     * @param value 검사 대상 문자열 (key / userid / sender)
     * @return placeholder 로 판정되면 true (외부 호출 skip 트리거)
     */
    boolean isPlaceholder(String value) {
        if (value == null || value.isBlank()) {
            return true;
        }
        String lower = value.toLowerCase(java.util.Locale.ROOT);
        return lower.equals("change_me_local_only")
                || lower.equals("placeholder_dev_only")
                || lower.equals("changeme")
                || lower.equals("dummy");
    }

    /** {@code api-url} 이 {@code https://host/send/} 형태든 {@code https://host} 형태든 base 까지만 사용. */
    private String deriveBaseUrl(String apiUrl) {
        if (apiUrl == null || apiUrl.isBlank()) {
            return "https://apis.aligo.in";
        }
        int idx = apiUrl.indexOf("/send");
        if (idx > 0) {
            return apiUrl.substring(0, idx);
        }
        return apiUrl.endsWith("/") ? apiUrl.substring(0, apiUrl.length() - 1) : apiUrl;
    }
}
