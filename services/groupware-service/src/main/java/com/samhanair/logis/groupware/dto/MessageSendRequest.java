package com.samhanair.logis.groupware.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.util.UUID;

/**
 * 메신저 발송 요청 DTO.
 *
 * @param senderId deprecated. 송신자는 {@code X-User-Id} 헤더로만 확정하며 이 값은 무시한다.
 * @param recipientId 수신자 user UUID (송신자와 동일 시 거부)
 * @param body 본문
 */
public record MessageSendRequest(
        UUID senderId,
        @NotNull UUID recipientId,
        @NotBlank @Size(max = 2000) String body
) {
}
