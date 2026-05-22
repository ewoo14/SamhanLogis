package com.samhanair.logis.notification.publisher;

import java.util.List;
import java.util.UUID;

/**
 * {@code POST /internal/notifications} 요청 body — source service 가 호출.
 *
 * <p>notification-service 의 {@code NotificationPublishRequest} record 와 wire format 1:1 정합.
 *
 * @param channel       알림 채널 키 (SAFETY_STOCK / MESSENGER / APPROVAL ...)
 * @param severity      INFO/WARNING/CRITICAL
 * @param title         제목 (200자)
 * @param body          본문 (TEXT)
 * @param targetRole    role 배열 (예: ["MASTER","MANAGER"]). null/empty 면 role 필터 미적용.
 * @param targetUserId  특정 사용자 UUID. null 면 role 기반.
 * @param sourceService 발송 service 명 (예: inventory-service)
 * @param sourceRefId   source 식별자
 * @param deeplink      FE 가 클릭 시 이동할 라우트
 */
public record NotificationPublishRequest(
        String channel,
        NotificationSeverity severity,
        String title,
        String body,
        List<String> targetRole,
        UUID targetUserId,
        String sourceService,
        String sourceRefId,
        String deeplink
) {
}
