package com.samhanair.logis.auth.web.dto.internal;

import com.samhanair.logis.common.security.Role;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.util.UUID;

/**
 * Body of {@code POST /auth/internal/accounts} — caller (User Service) supplies the canonical UUID.
 *
 * <p>Phase 10 P0-5 — {@code passwordChangeRequired} 옵션 추가.
 * 관리자(MASTER) 가 임시 비밀번호로 신규 직원을 등록할 때 {@code true} 로 전달하면
 * 첫 로그인 후 비밀번호 변경이 강제됨.
 */
public record CreateAccountInternalRequest(
        @NotNull UUID id,
        @NotBlank @Size(max = 50) String loginId,
        @NotBlank @Size(min = 8, max = 100) String password,
        @NotBlank @Size(max = 100) String displayName,
        @NotNull Role role,
        boolean passwordChangeRequired) {
}
