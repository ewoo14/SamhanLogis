package com.samhanair.logis.auth.web;

import com.samhanair.logis.security.InternalTokenFilter;
import com.samhanair.logis.auth.service.AuthService;
import com.samhanair.logis.auth.service.dto.RegisterResponse;
import com.samhanair.logis.auth.web.dto.internal.CreateAccountInternalRequest;
import com.samhanair.logis.auth.web.dto.internal.InternalAccountLookupResponse;
import com.samhanair.logis.auth.web.dto.internal.UpdateDepartmentNameInternalRequest;
import com.samhanair.logis.auth.web.dto.internal.UpdateDisplayNameInternalRequest;
import com.samhanair.logis.auth.web.dto.internal.UpdateRoleInternalRequest;
import com.samhanair.logis.common.dto.ApiResponse;
import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import jakarta.validation.Valid;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

/**
 * Internal service-to-service endpoints used by User Service to provision Account
 * aggregates. Security is enforced by {@link com.samhanair.logis.security.InternalTokenFilter}.
 */
@RestController
@RequestMapping("/auth/internal/accounts")
@RequiredArgsConstructor
public class InternalAccountController {

    private final AuthService authService;

    @GetMapping("/{id}")
    public ApiResponse<AccountStatusResponse> status(@PathVariable UUID id) {
        var account = authService.findAccount(id);
        return ApiResponse.ok(new AccountStatusResponse(id, account.isEnabled()));
    }

    public record AccountStatusResponse(UUID accountId, boolean enabled) {}

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

    /**
     * loginId 로 내부 계정 UUID 를 조회한다.
     *
     * <p>slip-service 등 도메인 service 가 협업 알림 수신자 목록의 username 식별자를 push 가능한
     * accountId 로 정규화할 때 사용하는 내부 endpoint 다. {@code X-Internal-Token} 인증은
     * {@link InternalTokenFilter} 가 담당한다.
     *
     * @param loginId 조회할 로그인 아이디
     * @return accountId 만 포함한 내부 응답
     */
    @GetMapping("/by-login")
    public ApiResponse<InternalAccountLookupResponse> findByLogin(@RequestParam String loginId) {
        try {
            return ApiResponse.ok(new InternalAccountLookupResponse(
                    authService.findAccountIdByLoginId(loginId)));
        } catch (BusinessException ex) {
            if (ex.getErrorCode() == ErrorCode.NOT_FOUND) {
                throw new ResponseStatusException(HttpStatus.NOT_FOUND, ex.getMessage(), ex);
            }
            throw ex;
        }
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

    /**
     * 소속 부서명 동기화 — Phase 12 인사 카테고리 가드.
     *
     * <p>user-service 에서 직원 등록/부서 변경 시 호출. 다음 로그인 JWT 에 {@code departmentName} claim 갱신.
     * {@code departmentName = null} 요청 시 미배정 상태로 초기화.
     *
     * @param id      대상 계정 UUID
     * @param request 신규 부서명 ({@link UpdateDepartmentNameInternalRequest})
     */
    @PatchMapping("/{id}/department-name")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void updateDepartmentName(
            @PathVariable UUID id,
            @RequestBody UpdateDepartmentNameInternalRequest request) {
        authService.updateAccountDepartmentName(id, request.departmentName());
    }
}
