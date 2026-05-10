package com.samhanair.logis.auth.web;

import com.samhanair.logis.auth.service.PasswordResetRateLimiter;
import com.samhanair.logis.auth.service.PasswordResetTokenService;
import com.samhanair.logis.auth.web.dto.PasswordResetConfirmDto;
import com.samhanair.logis.auth.web.dto.PasswordResetRequestDto;
import com.samhanair.logis.common.dto.ApiResponse;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * P0-2 비밀번호 셀프 재설정 endpoint — 인증 불필요 (public).
 *
 * <p>출처: {@code docs/manual/00-시작하기/01-로그인.md §비밀번호 재설정 (셀프)}.
 *
 * <p>gateway 라우팅: {@code /api/v1/auth/**} → StripPrefix=2 → auth-service {@code /auth/**}.
 * 따라서 FE 가 호출하는 외부 경로와 controller 내부 경로의 관계는 아래와 같다:
 * <ul>
 *     <li>FE: {@code POST /api/v1/auth/password-reset/request}
 *         → controller: {@code POST /auth/password-reset/request}</li>
 *     <li>FE: {@code POST /api/v1/auth/password-reset/confirm}
 *         → controller: {@code POST /auth/password-reset/confirm}</li>
 * </ul>
 *
 * <p>보안:
 * <ul>
 *     <li>rate-limit: loginId 1분 3회 / IP 1분 10회 ({@link PasswordResetRateLimiter})</li>
 *     <li>token 평문 미노출 — SHA-256 해시 비교</li>
 *     <li>enumeration 방지 — 사용자 미존재/이메일 불일치 시도 동일 200 응답</li>
 * </ul>
 */
@RestController
@RequestMapping("/auth/password-reset")
@RequiredArgsConstructor
public class PasswordResetController {

    private final PasswordResetTokenService passwordResetTokenService;
    private final PasswordResetRateLimiter rateLimiter;

    /**
     * 비밀번호 재설정 인증번호 요청.
     *
     * <p>loginId + email 이 일치하는 활성 계정이 있을 때만 6자리 인증번호를 발송.
     * 불일치/미존재 시에도 동일 200 응답 (enumeration 공격 방지).
     *
     * @param request    loginId + email DTO
     * @param httpRequest 요청자 IP 추출용
     * @return {@code { "success": true, "message": "인증번호가 등록된 이메일로 전송되었습니다." }}
     */
    @PostMapping("/request")
    public ApiResponse<Void> requestReset(
            @Valid @RequestBody PasswordResetRequestDto request,
            HttpServletRequest httpRequest) {
        String clientIp = resolveClientIp(httpRequest);
        rateLimiter.checkAndIncrement(request.loginId(), clientIp);
        passwordResetTokenService.requestReset(request.loginId(), request.email(), clientIp);
        return ApiResponse.ok(null, "인증번호가 등록된 이메일로 전송되었습니다.");
    }

    /**
     * 비밀번호 재설정 확인 — 인증번호 검증 + 새 비밀번호 적용.
     *
     * <p>인증번호가 만료되었거나 이미 사용된 경우 401 반환.
     * 비밀번호 정책 위반 또는 confirmPassword 불일치 시 400 반환.
     *
     * <p>token brute-force 방지를 위해 confirm 단계에도 동일 rate-limit 정책 적용 (TM PR #138 통합 fix).
     *
     * @param request    loginId + 6자리 인증번호 + 새 비밀번호 + 확인 비밀번호 DTO
     * @param httpRequest 요청자 IP 추출용 (rate-limit 키)
     * @return {@code { "success": true, "message": "비밀번호가 재설정되었습니다." }}
     */
    @PostMapping("/confirm")
    public ApiResponse<Void> confirmReset(
            @Valid @RequestBody PasswordResetConfirmDto request,
            HttpServletRequest httpRequest) {
        String clientIp = resolveClientIp(httpRequest);
        rateLimiter.checkAndIncrement(request.loginId(), clientIp);
        passwordResetTokenService.confirmReset(
                request.loginId(),
                request.token(),
                request.newPassword(),
                request.confirmPassword());
        return ApiResponse.ok(null, "비밀번호가 재설정되었습니다.");
    }

    /**
     * 클라이언트 실제 IP 추출 — gateway X-Forwarded-For 헤더 우선, 없으면 remoteAddr.
     *
     * @param request HTTP 요청
     * @return IP 주소 문자열
     */
    private String resolveClientIp(HttpServletRequest request) {
        String xff = request.getHeader("X-Forwarded-For");
        if (xff != null && !xff.isBlank()) {
            // X-Forwarded-For: client, proxy1, proxy2 — 첫 번째가 실제 클라이언트 IP
            return xff.split(",")[0].trim();
        }
        return request.getRemoteAddr();
    }
}
