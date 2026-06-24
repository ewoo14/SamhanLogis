package com.samhanair.logis.auth.web;

import com.samhanair.logis.auth.service.AuthService;
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
import jakarta.servlet.http.HttpServletResponse;
import jakarta.validation.Valid;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseCookie;
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
 *
 * <p>P1-b: AccountGroupRepository/AccountRepository 직접 주입 제거 — /me role 파생을
 * {@link AuthService#getMeResponse(UUID)} 로 위임하여 레이어 의존 원칙 준수.
 */
@RestController
@RequestMapping("/auth")
@RequiredArgsConstructor
public class AuthController {

    private static final String ACCESS_TOKEN_COOKIE = "access_token";

    private final AuthService authService;

    @Value("${app.security.cookie.secure:false}")
    private boolean cookieSecure;

    @Value("${app.security.jwt.ttl-seconds}")
    private long jwtTtlSeconds;

    @PostMapping("/login")
    public ApiResponse<LoginResponse> login(
            @Valid @RequestBody LoginRequest request,
            HttpServletResponse response) {
        LoginResponse login = authService.login(request.loginId(), request.password());
        response.addHeader(HttpHeaders.SET_COOKIE, buildAccessCookie(login.token(), jwtTtlSeconds).toString());
        return ApiResponse.ok(login);
    }

    /**
     * 웹 쿠키 세션을 만료한다.
     *
     * <p>Electron 은 기존 IPC 저장소를 지우고, 웹은 본 endpoint 로 httpOnly 쿠키를 만료한다.
     *
     * @param response servlet 응답
     * @return 표준 성공 envelope
     */
    @PostMapping("/logout")
    public ApiResponse<Void> logout(HttpServletResponse response) {
        response.addHeader(HttpHeaders.SET_COOKIE, expireAccessCookie().toString());
        return ApiResponse.ok(null);
    }

    @PostMapping("/register")
    @RequirePermission(page = "system.account-admin", action = PermissionAction.CREATE)
    public ApiResponse<RegisterResponse> register(@Valid @RequestBody RegisterRequest request) {
        return ApiResponse.ok(authService.register(
                request.loginId(), request.password(), request.displayName(), request.role()));
    }

    /**
     * 현재 인증된 계정의 프로필을 반환한다.
     *
     * <p>P1-b: role 파생 로직은 {@link AuthService#getMeResponse(UUID)} 로 위임한다.
     * Controller 는 헤더 파싱 + Service 호출만 담당한다.
     *
     * @param userIdHeader X-User-Id 헤더 (api-gateway 전파)
     * @return 계정 프로필 응답
     */
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
        return ApiResponse.ok(authService.getMeResponse(userId));
    }

    /** access_token 쿠키 생성 — SameSite=Lax + httpOnly + TTL 은 JWT TTL 과 동일. */
    private ResponseCookie buildAccessCookie(String token, long ttlSeconds) {
        return ResponseCookie.from(ACCESS_TOKEN_COOKIE, token)
                .httpOnly(true)
                .sameSite("Lax")
                .path("/")
                .secure(cookieSecure)
                .maxAge(ttlSeconds)
                .build();
    }

    /** access_token 쿠키 만료 Set-Cookie 값. */
    private ResponseCookie expireAccessCookie() {
        return ResponseCookie.from(ACCESS_TOKEN_COOKIE, "")
                .httpOnly(true)
                .sameSite("Lax")
                .path("/")
                .secure(cookieSecure)
                .maxAge(0)
                .build();
    }
}
