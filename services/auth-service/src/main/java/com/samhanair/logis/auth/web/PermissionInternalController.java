package com.samhanair.logis.auth.web;

import com.samhanair.logis.auth.repository.RolePagePermissionRepository;
import com.samhanair.logis.auth.service.AccountPermissionService;
import com.samhanair.logis.auth.service.DynamicPermissionService;
import com.samhanair.logis.auth.service.dto.PermissionDto;
import com.samhanair.logis.auth.web.dto.PermissionUpdateRequest;
import com.samhanair.logis.common.dto.ApiResponse;
import com.samhanair.logis.security.permission.PermissionAction;
import jakarta.validation.Valid;
import java.util.EnumSet;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
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

    private static final String USER_ID_HEADER = "X-User-Id";

    private final AccountPermissionService permissionService;
    private final DynamicPermissionService dynamicPermissionService;
    private final RolePagePermissionRepository rolePagePermissionRepository;

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
     * 페이지-코드 prefix 로 스코프한 롤별 권한 매트릭스 조회.
     *
     * <p>호출 서비스(예: arologis-service)가 자기 도메인 {@code pagePrefix}(예: {@code "arologis."})
     * 로만 매트릭스를 받아 백오피스 권한 관리 화면을 구성할 때 사용한다. 중앙 매트릭스 전체를 노출하지
     * 않고 prefix 로 시작하는 활성 {@code role_page_permissions} 행만 반환하여 도메인 간 권한 격리를
     * 유지한다.
     *
     * <p>구조: {@code Map<roleCode, Map<pageCode, PermissionDto>>}. 실제 grant 행이 있는 (roleCode,
     * pageCode) 조합만 포함한다(fallback 채움 없음). 따라서 응답의 roleCode 집합은 prefix 도메인에
     * 실제로 grant 된 롤(MASTER / MANAGER / AROLOGIS_MASTER 등)만 등장한다.
     *
     * <p>{@code pagePrefix} 는 필수이며 blank 를 거부한다(빈 prefix = 전체 매트릭스 유출 차단).
     *
     * @param pagePrefix 페이지 코드 prefix (필수, blank 거부 — 예: {@code "arologis."})
     * @return roleCode → pageCode → 권한 DTO 매트릭스
     */
    @GetMapping("/role-matrix")
    @PreAuthorize("hasRole('INTERNAL')")
    public ApiResponse<Map<String, Map<String, PermissionDto>>> getRoleMatrix(
            @RequestParam String pagePrefix) {
        if (pagePrefix == null || pagePrefix.isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "pagePrefix 파라미터는 필수입니다. 빈 prefix 로 전체 매트릭스를 조회할 수 없습니다.");
        }
        String normalizedPrefix = pagePrefix.trim();
        Map<String, Map<String, PermissionDto>> matrix = new LinkedHashMap<>();
        rolePagePermissionRepository.findAllOrderByRoleCodeAndPageCode().stream()
                .filter(row -> row.getPageCode() != null
                        && row.getPageCode().startsWith(normalizedPrefix))
                .forEach(row -> matrix
                        .computeIfAbsent(row.getRoleCode(), k -> new LinkedHashMap<>())
                        .put(row.getPageCode(), dynamicPermissionService.getPermission(
                                row.getRoleCode(), row.getPageCode())));
        return ApiResponse.ok(matrix);
    }

    /**
     * 단일 롤-페이지 grant upsert — 호출 서비스의 백오피스 권한 할당 화면용.
     *
     * <p>중앙 {@link DynamicPermissionService#updatePermission(PermissionUpdateRequest, String)} 에
     * 위임하여 활성 행을 갱신하거나 신규 생성한다. {@code canEdit=true} 인 경우 도메인 규칙상
     * {@code canView} 가 자동 true 로 보장된다.
     *
     * <p>도메인 스코프 가드(예: arologis.* 한정)는 <b>호출 서비스 컨트롤러</b> 측에서 강제한다.
     * 본 내부 엔드포인트는 {@code X-Internal-Token} 으로만 게이트되며 page-code 도메인을 제한하지
     * 않으므로, 호출 측이 반드시 자기 도메인 prefix 가드를 적용해야 한다.
     *
     * <p>actor = 호출 서비스의 {@code X-User-Id} 헤더(미존재 시 service-internal 식별자).
     *
     * @param request 갱신 요청 (roleCode / pageCode / canView / canEdit)
     * @param actor   요청자 식별자 (X-User-Id 헤더)
     * @return upsert 결과 권한 DTO
     */
    @PutMapping("/role-grant")
    @PreAuthorize("hasRole('INTERNAL')")
    public ApiResponse<PermissionDto> updateRoleGrant(
            @Valid @RequestBody PermissionUpdateRequest request,
            @RequestHeader(value = USER_ID_HEADER, required = false) String actor) {
        String actorId = (actor == null || actor.isBlank()) ? "system-internal" : actor;
        return ApiResponse.ok(dynamicPermissionService.updatePermission(request, actorId));
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
