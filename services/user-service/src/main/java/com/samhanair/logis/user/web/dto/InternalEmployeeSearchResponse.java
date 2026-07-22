package com.samhanair.logis.user.web.dto;

import java.util.UUID;

/**
 * 형제 service 결재자/수신자 검색용 internal 직원 요약 응답.
 *
 * @param ecountCode 담당자코드({@code employees.ecount_code}) — 동명이인 구분용. 미부여 시 null.
 */
public record InternalEmployeeSearchResponse(
        UUID userId,
        String fullName,
        String departmentName,
        String role,
        String ecountCode
) {
}
