package com.samhanair.logis.notification.controller;

import com.samhanair.logis.common.dto.ApiResponse;
import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import com.samhanair.logis.notification.domain.PushDeviceToken;
import com.samhanair.logis.notification.dto.PushDeviceTokenRegisterRequest;
import com.samhanair.logis.notification.dto.PushDeviceTokenResponse;
import com.samhanair.logis.notification.service.PushDeviceTokenService;
import io.swagger.v3.oas.annotations.Operation;
import jakarta.validation.Valid;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * 인증 사용자 본인의 네이티브 푸시 토큰 등록/해제 API.
 *
 * <p>게이트웨이가 인증 검증 후 주입한 principal 을 사용한다.
 * 별도 권한 permission 은 요구하지 않는다.
 */
@RestController
@RequestMapping("/api/v1/push-tokens")
@RequiredArgsConstructor
public class PushDeviceTokenController {

    private final PushDeviceTokenService service;

    /** 로그인/앱 기동 후 현재 디바이스 푸시 등록 토큰을 등록한다. */
    @Operation(summary = "푸시 토큰 등록")
    @PostMapping
    public ApiResponse<PushDeviceTokenResponse> register(
            @Valid @RequestBody PushDeviceTokenRegisterRequest request) {
        UUID userId = currentUserId();
        PushDeviceToken saved = service.register(
                userId, request.token(), request.platform(), request.appClient());
        return ApiResponse.ok(PushDeviceTokenResponse.from(saved));
    }

    /** 로그아웃/기기 변경 시 현재 사용자 소유 토큰을 해제한다. */
    @Operation(summary = "푸시 토큰 해제")
    @DeleteMapping("/{token}")
    public ResponseEntity<Void> revoke(@PathVariable String token) {
        service.revoke(currentUserId(), token);
        return ResponseEntity.status(HttpStatus.NO_CONTENT).build();
    }

    private UUID currentUserId() {
        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        if (authentication == null || !authentication.isAuthenticated()
                || "anonymousUser".equals(authentication.getPrincipal())) {
            throw new BusinessException(ErrorCode.UNAUTHORIZED, "인증 사용자 정보가 없습니다");
        }
        try {
            return UUID.fromString(authentication.getName());
        } catch (IllegalArgumentException ex) {
            throw new BusinessException(ErrorCode.UNAUTHORIZED, "인증 정보가 올바르지 않습니다");
        }
    }
}
