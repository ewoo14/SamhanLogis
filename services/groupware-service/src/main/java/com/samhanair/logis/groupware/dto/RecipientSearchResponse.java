package com.samhanair.logis.groupware.dto;

import java.util.UUID;

/**
 * 메신저 수신자 검색 결과. userId는 payload 식별 전용이며 화면에 표시하지 않는다.
 *
 * @param employeeCode 담당자코드({@code employees.ecount_code}) — 동명이인 구분용. 로그인ID/이메일/UUID
 *                     대신 이 값만 화면 병기 후보로 쓴다. 미부여 계정은 null.
 */
public record RecipientSearchResponse(
        UUID userId,
        String name,
        String department,
        String employeeCode
) {
}
