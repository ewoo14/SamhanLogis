package com.samhanair.logis.notification.dto;

import com.samhanair.logis.notification.domain.PushDevicePlatform;
import com.samhanair.logis.notification.domain.PushDeviceToken;
import java.time.LocalDateTime;
import java.util.UUID;

/**
 * 푸시 토큰 등록 응답.
 *
 * <p>클라이언트가 방금 등록한 토큰의 소유자/플랫폼/마지막 갱신 시각만 확인한다.
 */
public record PushDeviceTokenResponse(
        UUID userId,
        PushDevicePlatform platform,
        String appClient,
        LocalDateTime lastSeenAt
) {

    public static PushDeviceTokenResponse from(PushDeviceToken token) {
        return new PushDeviceTokenResponse(
                token.getUserId(),
                token.getPlatform(),
                token.getAppClient(),
                token.getLastSeenAt());
    }
}
