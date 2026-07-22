package com.samhanair.logis.groupware.dto;

import com.samhanair.logis.groupware.domain.Message;
import com.samhanair.logis.groupware.domain.MessageStatus;
import java.time.LocalDateTime;
import java.util.UUID;

/**
 * 메신저 단건 응답 DTO. inbox / 발송 응답 공용.
 *
 * @param messageId 메신저 식별자
 * @param senderId 송신자 (payload 전용 — 화면에는 senderDisplayName만 노출한다)
 * @param senderDisplayName 발신자 표시명 (수신함 전용, 발송 응답에는 필요 없어 null 허용)
 * @param recipientId 수신자
 * @param body 본문
 * @param status 읽음 여부
 * @param sentAt 발송 시각
 * @param readAt 열람 시각 (READ 만 의미)
 */
public record MessageResponse(
        UUID messageId,
        UUID senderId,
        String senderDisplayName,
        UUID recipientId,
        String body,
        MessageStatus status,
        LocalDateTime sentAt,
        LocalDateTime readAt
) {

    public static MessageResponse from(Message m) {
        return from(m, null);
    }

    public static MessageResponse from(Message m, String senderDisplayName) {
        return new MessageResponse(m.getId(), m.getSenderId(), senderDisplayName, m.getRecipientId(), m.getBody(),
                m.getStatus(), m.getSentAt(), m.getReadAt());
    }
}
