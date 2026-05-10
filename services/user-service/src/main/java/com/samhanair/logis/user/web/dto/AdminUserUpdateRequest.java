package com.samhanair.logis.user.web.dto;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.Size;
import java.util.UUID;

/**
 * {@code PATCH /api/v1/admin/users/{id}} 요청 바디 — Phase 10 P0-5 일반 정보 수정.
 *
 * <p>MASTER 권한 전용. 모든 필드 optional — null 이 아닌 필드만 적용 (PATCH 시맨틱).
 * 역할 변경은 본 DTO 에서 지원하지 않음 — {@code PATCH /api/v1/admin/users/{id}/role} 전용 경로 사용.
 *
 * @param fullName     성명 (optional, 50자 이내)
 * @param email        이메일 (optional, 100자 이내)
 * @param phoneNumber  전화번호 (optional, 20자 이내)
 * @param departmentId 소속 부서 UUID (optional)
 */
public record AdminUserUpdateRequest(
        @Size(max = 50) String fullName,
        @Email @Size(max = 100) String email,
        @Size(max = 20) String phoneNumber,
        UUID departmentId) {
}
