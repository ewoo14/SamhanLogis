package com.samhanair.logis.notification.dto;

import com.samhanair.logis.notification.domain.NotificationChannel;
import com.samhanair.logis.notification.domain.RecipientType;
import jakarta.validation.constraints.AssertTrue;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.nio.charset.StandardCharsets;
import java.util.UUID;

/**
 * 발송 요청 DTO — Internal + Admin 양쪽 endpoint 공용.
 *
 * <p>EXTERNAL_PHONE 인 경우 recipientAddress (전화번호) 필수, USER/PARTNER 인 경우 recipientId 필수.
 *
 * <p>post-W5 backlog cleanup (Q-W3-2, D-P9-21) — payload 에 {@link Size}(max=4000) 추가.
 * Postgres TOAST (TOAST 임계 ~ 2KB 압축, 4KB 비압축) 회피용 + 비정상 페이로드 입력 차단.
 *
 * <p>post-W5 종합 fix (BE-1) — {@link Size}(max=4000) 는 char length 검증이지만 Postgres TOAST 의도는
 * byte length. 한국어 / 이모지 등 multi-byte 문자가 포함된 payload 는 char length &lt; 4000 이어도
 * UTF-8 byte length 가 4000 을 초과할 수 있다. {@link AssertTrue} 추가로 byte length 까지 강제.
 *
 * @param recipientType USER / PARTNER / EXTERNAL_PHONE
 * @param recipientId USER / PARTNER UUID (EXTERNAL_PHONE 인 경우 null)
 * @param recipientAddress EXTERNAL_PHONE 의 전화번호 또는 보조 채널 주소
 * @param channel PUSH / EMAIL / SMS
 * @param templateCode 사전 등록 템플릿 코드 (선택)
 * @param subject 제목 (이메일 / push)
 * @param body 본문
 * @param payload 부가 메타 (JSON 문자열, 선택, max 4000 byte UTF-8)
 * @param idempotencyKey 동일 발송 사건의 재시도를 dedupe 하는 키 (선택)
 */
public record NotificationSendRequest(
        @NotNull RecipientType recipientType,
        UUID recipientId,
        @Size(max = 200) String recipientAddress,
        @NotNull NotificationChannel channel,
        @Size(max = 50) String templateCode,
        @Size(max = 200) String subject,
        @Size(max = 2000) String body,
        @Size(max = 4000, message = "payload size 는 4000 char 이하만 허용 (Postgres TOAST 임계 회피)")
        String payload,
        @Size(max = 100) String idempotencyKey
) {

    public NotificationSendRequest(RecipientType recipientType, UUID recipientId, String recipientAddress,
                                   NotificationChannel channel, String templateCode, String subject,
                                   String body, String payload) {
        this(recipientType, recipientId, recipientAddress, channel, templateCode, subject, body, payload, null);
    }

    /**
     * post-W5 종합 fix (BE-1, D-P9-21) — payload 의 UTF-8 byte length 가 4000 byte 이하인지 검증.
     *
     * <p>{@link Size} 는 char length 검증 — multi-byte 문자 (한국어 / 이모지 등) 가 포함된 payload 는
     * char length &lt; 4000 이어도 byte length 가 4000 을 초과할 수 있다. Postgres TOAST 임계 회피
     * 의도를 정합 보장.
     *
     * @return payload null 또는 UTF-8 byte length &le; 4000 이면 true
     */
    @AssertTrue(message = "payload byte size 는 4000 byte 이하만 허용 (Postgres TOAST 임계 회피, UTF-8 기준)")
    public boolean isPayloadByteSizeValid() {
        if (payload == null) {
            return true;
        }
        return payload.getBytes(StandardCharsets.UTF_8).length <= 4000;
    }
}
