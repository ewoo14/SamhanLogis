package com.samhanair.logis.user.web.dto;

import java.util.UUID;

/** 형제 service 결재자 검색용 internal 직원 요약 응답. */
public record InternalEmployeeSearchResponse(
        UUID userId,
        String fullName,
        String departmentName,
        String role
) {
}
