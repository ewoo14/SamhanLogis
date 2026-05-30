package com.samhanair.logis.auth.web.dto;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/**
 * {@code POST /auth/password-reset/request} 요청 DTO — P0-2 비밀번호 셀프 재설정.
 *
 * <p>loginId 만 필수. email 은 선택(optional) — 미전송 시 BE 가 loginId 로 계정을 조회해
 * 등록된 이메일로 자동 발송한다 (FE {@code passwordResetApi.ts} 계약 일치).
 * email 을 전송한 경우에는 형식 검증만 수행하며, 등록 이메일과의 교차 검증은
 * 서비스 계층에서 수행한다.
 *
 * <p>미존재/불일치/비활성 계정 모두 동일 200 응답 (enumeration 공격 방지).
 *
 * @param loginId 사용자 로그인 ID (이메일 또는 사번) — 필수
 * @param email   등록된 이메일 주소 — 선택. 미전송 시 BE 가 loginId 로 자동 조회
 */
public record PasswordResetRequestDto(
        @NotBlank @Size(max = 50) String loginId,
        @Email @Size(max = 255) String email) {
}
