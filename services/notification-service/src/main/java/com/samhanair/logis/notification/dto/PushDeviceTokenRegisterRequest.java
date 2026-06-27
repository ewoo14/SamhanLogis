package com.samhanair.logis.notification.dto;

import com.samhanair.logis.notification.domain.PushDevicePlatform;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

/**
 * 푸시 토큰 등록 요청.
 *
 * @param token 푸시 등록 토큰
 * @param platform ANDROID / IOS / WEB
 * @param appClient DESKTOP / MOBILE 등 클라이언트 구분
 */
public record PushDeviceTokenRegisterRequest(
        @NotBlank @Size(max = 512) String token,
        @NotNull PushDevicePlatform platform,
        @NotBlank @Size(max = 50) String appClient
) {
}
