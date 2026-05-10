package com.samhanair.logis.auth.web.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/**
 * {@code POST /auth/password-reset/confirm} 요청 DTO — P0-2 비밀번호 셀프 재설정.
 *
 * <p>6자리 인증번호({@code token}) + 새 비밀번호 + 확인 비밀번호를 전달.
 * 서비스 레이어에서 token 해시 검증 + 비밀번호 정책 검증 + 일치 검증을 수행.
 *
 * @param loginId         사용자 로그인 ID
 * @param token           6자리 숫자 인증번호
 * @param newPassword     새 비밀번호 (8~32자, 영문+숫자+특수문자)
 * @param confirmPassword 새 비밀번호 확인 (newPassword 와 동일해야 함)
 */
public record PasswordResetConfirmDto(
        @NotBlank @Size(max = 50) String loginId,
        @NotBlank @Size(min = 6, max = 6) String token,
        @NotBlank @Size(min = 8, max = 32) String newPassword,
        @NotBlank @Size(min = 8, max = 32) String confirmPassword) {
}
