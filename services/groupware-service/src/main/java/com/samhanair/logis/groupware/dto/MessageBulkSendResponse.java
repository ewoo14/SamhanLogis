package com.samhanair.logis.groupware.dto;

import java.util.List;
import java.util.UUID;

/** 메신저 복수 수신 발송 결과. messages는 수신자별 1행 응답이다. */
public record MessageBulkSendResponse(
        UUID batchId,
        int sentCount,
        List<MessageResponse> messages
) {
}
