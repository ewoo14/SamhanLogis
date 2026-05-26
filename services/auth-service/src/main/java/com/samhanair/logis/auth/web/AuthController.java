package com.samhanair.logis.auth.web;

import com.samhanair.logis.auth.domain.Account;
import com.samhanair.logis.auth.repository.AccountRepository;
import com.samhanair.logis.auth.service.AuthService;
import com.samhanair.logis.auth.service.dto.LoginResponse;
import com.samhanair.logis.auth.service.dto.RegisterResponse;
import com.samhanair.logis.auth.web.dto.LoginRequest;
import com.samhanair.logis.auth.web.dto.MeResponse;
import com.samhanair.logis.auth.web.dto.RegisterRequest;
import com.samhanair.logis.common.dto.ApiResponse;
import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import com.samhanair.logis.security.permission.RequirePermission;
import jakarta.validation.Valid;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** Public + admin auth endpoints. Method security is enabled in SecurityConfig. */
@RestController
@RequestMapping("/auth")
@RequiredArgsConstructor
public class AuthController {

    private final AuthService authService;
    private final AccountRepository accountRepository;

    @PostMapping("/login")
    public ApiResponse<LoginResponse> login(@Valid @RequestBody LoginRequest request) {
        return ApiResponse.ok(authService.login(request.loginId(), request.password()));
    }

    @PostMapping("/register")
    @PreAuthorize("hasRole('MASTER')")
    @RequirePermission(page = "system.account-admin", action = "VIEW")
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
        return ApiResponse.ok(new MeResponse(
                account.getId().toString(),
                account.getLoginId(),
                account.getRole().name(),
                account.getDisplayName()));
    }
}
