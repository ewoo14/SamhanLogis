package com.samhanair.logis.partnerauth.dto;

import java.time.LocalDateTime;

/**
 * GET /api/v1/auth/partner-expiration 응답.
 *
 * <p>레거시 주문·출고 활동 또는 생성시각 기준 30일 만료 일시.
 * {@code expiredAlready} = true 면 LONG_UNUSED 단계로 전환 가능.
 */
public record ExpirationResponse(
        String bizNo,
        LocalDateTime expiresAt,
        boolean expiredAlready,
        long remainingDays
) {}
