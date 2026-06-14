package com.samhanair.logis.groupware.dto;

import java.util.UUID;

/** 결재 작성 화면의 결재자 검색 결과. */
public record ApproverSearchResponse(
        UUID userId,
        String name,
        String department
) {
}
