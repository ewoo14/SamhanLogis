package com.samhanair.logis.auth.web;

import com.samhanair.logis.auth.service.AccountPermissionService;
import com.samhanair.logis.auth.service.DynamicPermissionService;
import com.samhanair.logis.common.dto.ApiResponse;
import com.samhanair.logis.security.permission.PermissionAction;
import java.util.EnumSet;
import java.util.Map;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

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
    private final DynamicPermissionService dynamicPermissionService;

    /**
     * 단일 권한 조회 — 타 서비스가 권한 체크 시 호출.
     *
     * <p>account-form 은 {@code accountId + pageCode + action} 으로 계정별 7-action grant 를 확인한다.
     * role-form 은 기존 운영 소비자 호환을 위해 {@code roleCode + pageCode + type(VIEW|EDIT)} 로
     * {@code role_page_permissions} 의 실제 {@code can_view/can_edit} grant 를 확인한다.
     *
     * @param accountId 계정 UUID (account-form)
     * @param roleCode 역할 코드 (role-form)
     * @param pageCode 페이지 코드
     * @param action   권한 액션 문자열 (account-form, role-form action fallback)
     * @param type     role-form 권한 유형 (VIEW 또는 EDIT)
     * @return 권한 허용 여부 {@code {"allowed": true/false}}
     */
    @GetMapping("/check")
    @PreAuthorize("hasRole('INTERNAL')")
    public ApiResponse<PermissionCheckResponse> checkPermission(
            @RequestParam(required = false) UUID accountId,
            @RequestParam(required = false) String roleCode,
            @RequestParam String pageCode,
            @RequestParam(required = false) String action,
            @RequestParam(required = false) String type) {
        boolean allowed;
        if (accountId != null) {
            PermissionAction permissionAction = parseAccountAction(action);
            allowed = permissionService.check(accountId, pageCode, permissionAction);
        } else if (roleCode != null && !roleCode.isBlank()) {
            String permissionType = resolveRolePermissionType(type, action);
            allowed = dynamicPermissionService.canAccess(roleCode, pageCode, permissionType);
        } else {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "accountId 또는 roleCode 파라미터가 필요합니다.");
        }
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

    private PermissionAction parseAccountAction(String action) {
        PermissionAction permissionAction = PermissionAction.fromOrNull(action);
        if (permissionAction == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "account-form 권한 조회에는 유효한 action 파라미터가 필요합니다.");
        }
        return permissionAction;
    }

    private String resolveRolePermissionType(String type, String action) {
        String permissionType = type;
        if (permissionType == null || permissionType.isBlank()) {
            if (action == null) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                        "role-form 권한 조회에는 type 또는 action 파라미터가 필요합니다.");
            }
            permissionType = action;
        }
        String normalized = permissionType.trim().toUpperCase();
        if (PermissionAction.fromOrNull(normalized) != null && !"VIEW".equals(normalized)) {
            return "EDIT";
        }
        if (!"VIEW".equals(normalized) && !"EDIT".equals(normalized)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "role-form type 은 VIEW 또는 EDIT 이어야 합니다: " + permissionType);
        }
        return normalized;
    }
}
