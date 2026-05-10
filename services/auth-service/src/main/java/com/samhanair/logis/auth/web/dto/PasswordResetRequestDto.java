package com.samhanair.logis.auth.web.dto;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/**
 * {@code POST /auth/password-reset/request} 요청 DTO — P0-2 비밀번호 셀프 재설정.
 *
 * <p>loginId 와 email 이 모두 일치하는 계정이 있을 때만 인증번호 발송.
 * 불일치/미존재 시도 동일 200 응답 (enumeration 공격 방지).
 *
 * @param loginId 사용자 로그인 ID (이메일 또는 사번)
 * @param email   등록된 이메일 주소 (교차 검증용)
 */
public record PasswordResetRequestDto(
        @NotBlank @Size(max = 50) String loginId,
        @NotBlank @Email @Size(max = 255) String email) {
}
