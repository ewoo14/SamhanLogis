package com.samhanair.logis.auth.web;

import com.samhanair.logis.auth.service.AccountPermissionService;
import com.samhanair.logis.common.dto.ApiResponse;
import com.samhanair.logis.security.permission.PermissionAction;
import java.util.EnumSet;
import java.util.Map;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * 서비스 간 동적 RBAC 권한 조회 API.
 *
 * <p>{@code /auth/internal/**} prefix 로 {@code X-Internal-Token} 검증을 강제한다.
 */
@RestController
@RequestMapping("/auth/internal/permissions")
@RequiredArgsConstructor
public class PermissionInternalController {

    private final AccountPermissionService permissionService;

    /**
     * 단일 권한 조회 — 타 서비스가 권한 체크 시 호출.
     *
     * @param accountId 계정 UUID
     * @param pageCode 페이지 코드
     * @param action   권한 액션
     * @return 권한 허용 여부 {@code {"allowed": true/false}}
     */
    @GetMapping("/check")
    @PreAuthorize("hasRole('INTERNAL')")
    public ApiResponse<PermissionCheckResponse> checkPermission(
            @RequestParam UUID accountId,
            @RequestParam String pageCode,
            @RequestParam PermissionAction action) {
        boolean allowed = permissionService.check(accountId, pageCode, action);
        return ApiResponse.ok(new PermissionCheckResponse(allowed));
    }

    /**
     * 계정별 권한 맵 조회 — FE 부트/사이드바 캐시용.
     *
     * @param accountId 계정 UUID
     * @return pageCode → 허용 action 집합
     */
    @GetMapping("/account/{accountId}")
    @PreAuthorize("hasRole('INTERNAL')")
    public ApiResponse<Map<String, EnumSet<PermissionAction>>> getAccountPermissions(
            @PathVariable UUID accountId) {
        return ApiResponse.ok(permissionService.bulkLoad(accountId));
    }

    /**
     * 단일 권한 조회 응답 DTO.
     *
     * @param allowed 권한 부여 여부
     */
    public record PermissionCheckResponse(boolean allowed) {
    }
}
