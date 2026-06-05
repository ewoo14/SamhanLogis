package com.samhanair.logis.auth.web;

import com.samhanair.logis.auth.domain.Account;
import com.samhanair.logis.auth.service.PasswordPolicy;
import com.samhanair.logis.auth.service.PasswordResetService;
import com.samhanair.logis.auth.web.dto.PasswordChangeRequest;
import com.samhanair.logis.auth.web.dto.PasswordPolicyResponse;
import com.samhanair.logis.auth.web.dto.PasswordResetConfirmRequest;
import com.samhanair.logis.auth.web.dto.PasswordResetRequest;
import com.samhanair.logis.common.dto.ApiResponse;
import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import com.samhanair.logis.security.permission.PermissionAction;
import com.samhanair.logis.security.permission.RequirePermission;
import jakarta.validation.Valid;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/**
 * 비밀번호 정책 / 재설정 / 변경 / 잠금 해제 endpoint — Phase 10 P0-2.
 *
 * <p>출처: {@code docs/manual/06-트러블슈팅/01-로그인-실패.md §1-3} — 7 누락 중 5 종 해소
 * (정책 + 본인 변경 + 토큰 reset request/confirm + MASTER 잠금 해제). 잔여 2 종 (첫 로그인 강제 변경,
 * 메일 SMTP 연결) 은 별도 phase 처리.
 *
 * <p>endpoint:
 * <ul>
 *     <li>{@code GET    /auth/password/policy}                        — 정책 조회 (인증 불필요)</li>
 *     <li>{@code POST   /auth/password/reset/request}                 — 토큰 발급 + 메일 (NoOp stub)</li>
 *     <li>{@code POST   /auth/password/reset/confirm}                 — 토큰으로 비밀번호 교체</li>
 *     <li>{@code POST   /auth/password/change}                        — 본인 변경 (X-User-Id 필요)</li>
 *     <li>{@code PATCH  /auth/admin/accounts/{id}/unlock}             — MASTER 잠금 해제</li>
 * </ul>
 */
@RestController
@RequestMapping("/auth")
@RequiredArgsConstructor
public class PasswordController {

    private final PasswordResetService passwordResetService;

    /** 비밀번호 정책 조회 — 신규 비밀번호 입력 폼 helper text. */
    @GetMapping("/password/policy")
    public ApiResponse<PasswordPolicyResponse> getPolicy() {
        PasswordPolicyResponse body = new PasswordPolicyResponse(
                PasswordPolicy.MIN_LENGTH,
                PasswordPolicy.MAX_LENGTH,
                true,
                true,
                true,
                Account.PASSWORD_HISTORY_SIZE,
                Account.MAX_FAILED_LOGIN_ATTEMPTS,
                PasswordResetService.RESET_TOKEN_TTL.toMinutes(),
                PasswordPolicy.describe());
        return ApiResponse.ok(body);
    }

    /**
     * 비밀번호 reset 토큰 요청. 사용자 존재 여부와 무관하게 항상 200 OK
     * (enumeration 공격 방지 — service 내부에서 silent skip).
     */
    @PostMapping("/password/reset/request")
    public ApiResponse<Void> requestReset(@Valid @RequestBody PasswordResetRequest request) {
        passwordResetService.requestReset(request.loginId(), request.email());
        return ApiResponse.ok(null, "재설정 메일이 발송되었습니다");
    }

    /** 토큰 confirm + 비밀번호 교체. 토큰 무효 시 401, 정책 위반 시 400. */
    @PostMapping("/password/reset/confirm")
    public ApiResponse<Void> confirmReset(@Valid @RequestBody PasswordResetConfirmRequest request) {
        passwordResetService.confirmReset(request.token(), request.newPassword());
        return ApiResponse.ok(null, "비밀번호가 변경되었습니다");
    }

    /** 본인 비밀번호 변경. {@code X-User-Id} 헤더 필요 (gateway pre-auth). */
    @PostMapping("/password/change")
    @PreAuthorize("isAuthenticated()")
    public ApiResponse<Void> changePassword(
            @RequestHeader(value = "X-User-Id", required = false) String userIdHeader,
            @Valid @RequestBody PasswordChangeRequest request) {
        UUID userId = parseUserId(userIdHeader);
        passwordResetService.changePassword(userId, request.oldPassword(), request.newPassword());
        return ApiResponse.ok(null, "비밀번호가 변경되었습니다");
    }

    /** MASTER 권한 잠금 해제. */
    @PatchMapping("/admin/accounts/{id}/unlock")
    @RequirePermission(page = "system.password-admin", action = PermissionAction.UPDATE)
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void unlock(@PathVariable UUID id) {
        passwordResetService.unlockAccount(id);
    }

    private UUID parseUserId(String headerValue) {
        if (headerValue == null || headerValue.isBlank()) {
            throw new BusinessException(ErrorCode.UNAUTHORIZED, "인증이 필요합니다");
        }
        try {
            return UUID.fromString(headerValue);
        } catch (IllegalArgumentException ex) {
            throw new BusinessException(ErrorCode.UNAUTHORIZED, "유효하지 않은 사용자 식별자입니다");
        }
    }
}
