package com.samhanair.logis.arologis.controller;

import com.samhanair.logis.arologis.dto.AdminLoginRequest;
import com.samhanair.logis.arologis.dto.AuthTokenResponse;
import com.samhanair.logis.arologis.dto.DriverLoginRequest;
import com.samhanair.logis.arologis.dto.MeResponse;
import com.samhanair.logis.arologis.dto.RefreshRequest;
import com.samhanair.logis.arologis.service.auth.AdminLoginService;
import com.samhanair.logis.arologis.service.auth.DriverLoginService;
import com.samhanair.logis.arologis.service.auth.RefreshTokenService;
import jakarta.validation.Valid;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.authentication.BadCredentialsException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/**
 * 아로로지스 자체 auth controller — 2026-05-14 분리.
 *
 * <p>5 endpoint:
 * <ul>
 *   <li>POST /auth/admin/login (loginId+password) — arologis-desktop</li>
 *   <li>POST /auth/driver/login (phoneNumber passwordless) — arologis-mobile</li>
 *   <li>POST /auth/refresh — rotation</li>
 *   <li>POST /auth/logout — refresh revoke (204)</li>
 *   <li>GET /auth/me — 현재 사용자 (JWT bearer 의무)</li>
 * </ul>
 *
 * <p>login / refresh 는 SecurityConfig 의 permitAll. me / logout 은 authenticated 의무.
 * 401 (BadCredentialsException) 은 본 controller exception handler 가 변환.
 */
@RestController
@RequestMapping("/auth")
@RequiredArgsConstructor
public class ArologisAuthController {

    private final AdminLoginService adminLogin;
    private final DriverLoginService driverLogin;
    private final RefreshTokenService refreshSvc;

    @PostMapping("/admin/login")
    public AuthTokenResponse adminLogin(@RequestBody @Valid AdminLoginRequest req) {
        return adminLogin.login(req);
    }

    @PostMapping("/driver/login")
    public AuthTokenResponse driverLogin(@RequestBody @Valid DriverLoginRequest req) {
        return driverLogin.login(req);
    }

    @PostMapping("/refresh")
    public AuthTokenResponse refresh(@RequestBody @Valid RefreshRequest req) {
        return refreshSvc.refresh(req.refreshToken());
    }

    @PostMapping("/logout")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @PreAuthorize("isAuthenticated()")
    public void logout(@RequestBody @Valid RefreshRequest req) {
        refreshSvc.logout(req.refreshToken());
    }

    /**
     * 현재 사용자 정보 — JWT 검증 후 X-User-Id / X-User-Role 헤더 의존.
     *
     * <p>UUID 비공개 가드 — UUID 자체만 반환, loginId/driverCode 는 client 가 JWT claim 에서
     * 직접 사용.
     */
    @GetMapping("/me")
    @PreAuthorize("isAuthenticated()")
    public MeResponse me(@RequestHeader("X-User-Id") UUID userId,
                         @RequestHeader("X-User-Role") String role) {
        return new MeResponse(userId, role);
    }

    @ExceptionHandler(BadCredentialsException.class)
    @ResponseStatus(HttpStatus.UNAUTHORIZED)
    public ErrorResponse handleBadCredentials(BadCredentialsException ex) {
        return new ErrorResponse("UNAUTHORIZED", ex.getMessage());
    }

    /** 401 응답 body — 한국어 사용자 메시지는 client 가 매핑 (boundary 코드만 표준화). */
    public record ErrorResponse(String code, String message) {}
}
