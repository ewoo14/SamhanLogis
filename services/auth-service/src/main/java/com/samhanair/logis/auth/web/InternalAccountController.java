package com.samhanair.logis.auth.web;

import com.samhanair.logis.security.InternalTokenFilter;
import com.samhanair.logis.auth.service.AuthService;
import com.samhanair.logis.auth.service.dto.RegisterResponse;
import com.samhanair.logis.auth.web.dto.internal.CreateAccountInternalRequest;
import com.samhanair.logis.auth.web.dto.internal.UpdateDisplayNameInternalRequest;
import com.samhanair.logis.auth.web.dto.internal.UpdateRoleInternalRequest;
import com.samhanair.logis.common.dto.ApiResponse;
import jakarta.validation.Valid;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/**
 * Internal service-to-service endpoints used by User Service to provision Account
 * aggregates. Security is enforced by {@link com.samhanair.logis.security.InternalTokenFilter}.
 */
@RestController
@RequestMapping("/auth/internal/accounts")
@RequiredArgsConstructor
public class InternalAccountController {

    private final AuthService authService;

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public ApiResponse<RegisterResponse> create(@Valid @RequestBody CreateAccountInternalRequest request) {
        return ApiResponse.ok(authService.registerWithId(
                request.id(),
                request.loginId(),
                request.password(),
                request.displayName(),
                request.role(),
                request.passwordChangeRequired()));
    }

    @PatchMapping("/{id}/role")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void updateRole(@PathVariable UUID id, @Valid @RequestBody UpdateRoleInternalRequest request) {
        authService.updateAccountRole(id, request.role());
    }

    @PatchMapping("/{id}/display-name")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void updateDisplayName(
            @PathVariable UUID id, @Valid @RequestBody UpdateDisplayNameInternalRequest request) {
        authService.updateAccountDisplayName(id, request.displayName());
    }

    @PatchMapping("/{id}/disable")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void disable(@PathVariable UUID id) {
        authService.disableAccount(id, InternalTokenFilter.INTERNAL_PRINCIPAL);
    }

    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@PathVariable UUID id) {
        authService.deleteAccount(id);
    }

    /**
     * 계정 잠금 해제 — MASTER 가 사용자 관리 화면에서 호출 (Phase 10 P0-5).
     *
     * <p>{@code lockedAt = null}, {@code failedLoginAttempts = 0} 으로 초기화.
     * 이미 잠금 해제 상태인 계정에 호출해도 멱등 처리.
     */
    @PostMapping("/{id}/unlock")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void unlock(@PathVariable UUID id) {
        authService.unlockAccount(id);
    }
}
