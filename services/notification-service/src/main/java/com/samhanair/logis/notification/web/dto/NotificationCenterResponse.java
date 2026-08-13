package com.samhanair.logis.notification.web.dto;

import com.samhanair.logis.notification.domain.NotificationCenter;
import com.samhanair.logis.notification.domain.NotificationSeverity;
import com.fasterxml.jackson.databind.annotation.JsonSerialize;
import java.time.LocalDateTime;
import java.util.UUID;

/**
 * @param refId source 식별자 (예: messageId) — 채널별 소비처가 알림을 원본 레코드와 상관시킬 때 사용.
 *              원본은 {@code source_ref_id} 컬럼이며 UUID 자체가 아니라 opaque 문자열로 취급한다.
 */
public record NotificationCenterResponse(
        @JsonSerialize(using = OpaqueUuidSerializer.class) UUID id,
        String channel,
        NotificationSeverity severity,
        String title,
        String body,
        String deeplink,
        LocalDateTime createdAt,
        LocalDateTime readAt,
        String refId
) {
    public static NotificationCenterResponse from(NotificationCenter n) {
        return new NotificationCenterResponse(
                n.getId(),
                OpaqueUuidCodec.maskUuidLiterals(n.getChannel()),
                n.getSeverity(),
                OpaqueUuidCodec.maskUuidLiterals(n.getTitle()),
                OpaqueUuidCodec.maskUuidLiterals(n.getBody()),
                OpaqueUuidCodec.maskUuidLiterals(n.getDeeplink()),
                n.getCreatedAt(),
                n.getReadAt(),
                OpaqueUuidCodec.maskUuidLiterals(n.getSourceRefId())
        );
    }
}
