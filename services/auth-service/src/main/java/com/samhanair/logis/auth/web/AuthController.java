package com.samhanair.logis.auth.web;

import com.samhanair.logis.auth.domain.Account;
import com.samhanair.logis.auth.repository.AccountGroupRepository;
import com.samhanair.logis.auth.repository.AccountRepository;
import com.samhanair.logis.auth.service.AuthService;
import com.samhanair.logis.auth.service.BuiltinRoleGroupIds;
import com.samhanair.logis.auth.service.dto.LoginResponse;
import com.samhanair.logis.auth.service.dto.RegisterResponse;
import com.samhanair.logis.auth.web.dto.LoginRequest;
import com.samhanair.logis.auth.web.dto.MeResponse;
import com.samhanair.logis.auth.web.dto.RegisterRequest;
import com.samhanair.logis.common.dto.ApiResponse;
import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import com.samhanair.logis.security.permission.PermissionAction;
import com.samhanair.logis.security.permission.RequirePermission;
import jakarta.validation.Valid;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * 공개 + 관리자 인증 엔드포인트.
 *
 * <p>C5-5: /me 응답의 role 필드는 account_groups ∩ 빌트인(BuiltinRoleGroupIds) 역매핑으로 파생한다.
 * accounts.role 컬럼이 DROP(V46)되었으므로 entity 직접 접근 불가.
 */
@RestController
@RequestMapping("/auth")
@RequiredArgsConstructor
public class AuthController {

    private final AuthService authService;
    private final AccountRepository accountRepository;
    /** C5-5: /me role 파생을 위한 그룹 배속 저장소. */
    private final AccountGroupRepository accountGroupRepository;

    @PostMapping("/login")
    public ApiResponse<LoginResponse> login(@Valid @RequestBody LoginRequest request) {
        return ApiResponse.ok(authService.login(request.loginId(), request.password()));
    }

    @PostMapping("/register")
    @RequirePermission(page = "system.account-admin", action = PermissionAction.CREATE)
    public ApiResponse<RegisterResponse> register(@Valid @RequestBody RegisterRequest request) {
        return ApiResponse.ok(authService.register(
                request.loginId(), request.password(), request.displayName(), request.role()));
    }

    @GetMapping("/me")
    public ApiResponse<MeResponse> me(@RequestHeader(value = "X-User-Id", required = false) String userIdHeader) {
        if (userIdHeader == null || userIdHeader.isBlank()) {
            throw new BusinessException(ErrorCode.UNAUTHORIZED, "인증이 필요합니다");
        }
        UUID userId;
        try {
            userId = UUID.fromString(userIdHeader);
        } catch (IllegalArgumentException ex) {
            throw new BusinessException(ErrorCode.UNAUTHORIZED, "유효하지 않은 사용자 식별자입니다");
        }
        Account account = accountRepository.findById(userId)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "사용자를 찾을 수 없습니다"));
        // C5-5: role = account_groups ∩ 빌트인(BuiltinRoleGroupIds) 역매핑 파생
        // accounts.role 컬럼이 DROP(V46)되어 entity 직접 접근 불가.
        String role = accountGroupRepository
                .findByAccountIdAndIsDeletedFalseOrderByGroupIdAsc(userId)
                .stream()
                .map(ag -> BuiltinRoleGroupIds.fromGroupId(ag.getGroupId()))
                .filter(java.util.Optional::isPresent)
                .map(opt -> opt.get().name())
                .findFirst()
                .orElse("");
        return ApiResponse.ok(new MeResponse(
                account.getId().toString(),
                account.getLoginId(),
                role,
                account.getDisplayName()));
    }
}
