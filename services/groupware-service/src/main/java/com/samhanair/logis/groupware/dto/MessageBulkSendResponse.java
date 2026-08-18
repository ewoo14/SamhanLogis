package com.samhanair.logis.groupware.dto;

import java.util.List;

/** 메신저 복수 수신 발송 결과. messages는 수신자별 1행 응답이다. */
public record MessageBulkSendResponse(
        int sentCount,
        List<MessageResponse> messages
) {
}
