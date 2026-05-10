package com.samhanair.logis.user.web.dto;

import com.samhanair.logis.common.security.Role;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.util.UUID;

/**
 * {@code POST /api/v1/admin/users} 요청 바디 — Phase 10 P0-5 사용자 신규 등록.
 *
 * <p>MASTER 권한 전용. 임시 비밀번호는 서버가 자동 생성하므로 클라이언트가 전달하지 않음.
 * 신규 직원은 첫 로그인 후 비밀번호 변경이 강제됨 ({@code passwordChangeRequired = true}).
 *
 * @param loginId      로그인 아이디 (50자 이내, 중복 불가)
 * @param fullName     성명 (50자 이내)
 * @param email        이메일 (optional — 비밀번호 재설정 교차 검증 및 연락처 용)
 * @param role         초기 역할 (MASTER / MANAGER / SALES / ACCOUNTANT / WAREHOUSE / INVENTORY / DEVELOPER)
 * @param departmentId 소속 부서 UUID (optional — null 시 기본 부서 배정은 비즈니스 로직에서 처리)
 * @param phoneNumber  전화번호 (optional, 20자 이내)
 */
public record AdminUserCreateRequest(
        @NotBlank @Size(max = 50) String loginId,
        @NotBlank @Size(max = 50) String fullName,
        @Email @Size(max = 100) String email,
        @NotNull Role role,
        UUID departmentId,
        @Size(max = 20) String phoneNumber) {
}
