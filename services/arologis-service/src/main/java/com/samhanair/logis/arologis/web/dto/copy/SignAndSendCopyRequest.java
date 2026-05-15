package com.samhanair.logis.arologis.web.dto.copy;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import java.math.BigDecimal;
import java.time.LocalDateTime;

/**
 * POST /driver-app/.../sign-and-send-copy 요청 — Phase F (D-DF-07).
 *
 * <p>본 PR (Phase F) 한정 — driverSignatureBase64 / recipientSignatureBase64 는 mobile 캡처 PNG base64.
 * 후속 PR 에서 file-server upload 후 imageRef 만 전달하는 형태로 분리 가능.
 */
public record SignAndSendCopyRequest(
        @NotBlank(message = "driverSignatureBase64 필수") String driverSignatureBase64,
        @NotBlank(message = "recipientSignatureBase64 필수") String recipientSignatureBase64,
        @NotNull(message = "capturedAt 필수") LocalDateTime capturedAt,
        BigDecimal gpsLat,
        BigDecimal gpsLng,
        Long parsedKakaoSeq
) {}
