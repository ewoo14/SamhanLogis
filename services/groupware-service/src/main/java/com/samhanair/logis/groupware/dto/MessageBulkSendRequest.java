package com.samhanair.logis.groupware.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.util.List;
import java.util.UUID;

/** 메신저 복수 수신 발송 요청. 송신자 식별자는 게이트웨이 헤더에서만 받는다. */
public record MessageBulkSendRequest(
        @NotEmpty(message = "수신자를 1명 이상 선택하십시오")
        @Size(max = 50, message = "수신자는 최대 50명까지 선택할 수 있습니다")
        List<@NotNull UUID> recipientIds,

        @NotBlank(message = "본문을 입력하십시오")
        @Size(max = 2000, message = "본문은 2000자 이하로 입력하십시오")
        String body
) {
}
