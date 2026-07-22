package com.samhanair.logis.groupware.dto;

import java.util.UUID;

/** 메신저 수신자 검색 결과. userId는 payload 식별 전용이며 화면에 표시하지 않는다. */
public record RecipientSearchResponse(
        UUID userId,
        String name,
        String department
) {
}
