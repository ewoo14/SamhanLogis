package com.samhanair.logis.user.web.dto;

import com.samhanair.logis.common.security.Role;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

/**
 * {@code PATCH /api/v1/admin/users/{id}/role} 요청 바디 — Phase 10 P0-5 역할 변경.
 *
 * <p>MASTER 권한 전용. 역할 변경은 한 번에 하나. 변경 사유는 optional 이며
 * {@code role_change_history} 테이블에 영속화되어 변경 이력 화면에 표시됨.
 *
 * @param newRole 변경할 역할 (필수)
 * @param reason  변경 사유 (optional, 500자 이내)
 */
public record AdminUserRoleChangeRequest(
        @NotNull Role newRole,
        @Size(max = 500) String reason) {
}
