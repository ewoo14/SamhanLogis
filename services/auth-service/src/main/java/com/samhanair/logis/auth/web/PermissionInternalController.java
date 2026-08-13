package com.samhanair.logis.auth.web;

import com.samhanair.logis.auth.domain.PageCode;
import com.samhanair.logis.auth.repository.RolePagePermissionRepository;
import com.samhanair.logis.auth.service.AccountPermissionService;
import com.samhanair.logis.auth.service.DynamicPermissionService;
import com.samhanair.logis.auth.service.dto.PermissionDto;
import com.samhanair.logis.common.security.ActorDisplayName;
import com.samhanair.logis.auth.web.dto.PermissionUpdateRequest;
import com.samhanair.logis.common.dto.ApiResponse;
import com.samhanair.logis.security.permission.PermissionAction;
import jakarta.validation.Valid;
import java.util.EnumSet;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
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
@Slf4j
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
     * <p><b>N+1 제거</b>: 이미 로드한 grant row 의 {@code isCanView/isCanEdit} 와 page-code 별
     * displayName 으로 {@link PermissionDto} 를 직접 구성한다(행마다 {@code getPermission} 재조회
     * 금지). 매트릭스는 실제 grant 행만 담으므로 모든 항목의 {@code isOverride} 는 항상 {@code true}
     * 이고, displayName 의미는 {@link com.samhanair.logis.auth.domain.PageCode} 미등록 시 코드 그대로
     * 사용으로 동일하게 유지된다.
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
                        .put(row.getPageCode(), new PermissionDto(
                                row.getRoleCode(), row.getPageCode(),
                                resolveDisplayName(row.getPageCode()),
                                row.isCanView(), row.isCanEdit(), true)));
        return ApiResponse.ok(matrix);
    }

    /**
     * page-code 의 한국어 displayName 을 PageCode enum 에서 조회한다.
     *
     * <p>미등록 코드는 코드 문자열 그대로 사용한다 — {@code DynamicPermissionService} 와 동일한 의미.
     *
     * @param pageCode dot-separated 페이지 코드
     * @return displayName (미등록 시 pageCode 그대로)
     */
    private String resolveDisplayName(String pageCode) {
        try {
            return PageCode.fromCode(pageCode).getDisplayName();
        } catch (IllegalArgumentException e) {
            return pageCode;
        }
    }

    /**
     * 단일 롤-페이지 grant upsert — 호출 서비스의 백오피스 권한 할당 화면용.
     *
     * <p>중앙 {@link DynamicPermissionService#updatePermission(PermissionUpdateRequest, String)} 에
     * 위임하여 활성 행을 갱신하거나 신규 생성한다. {@code canEdit=true} 인 경우 도메인 규칙상
     * {@code canView} 가 자동 true 로 보장된다. page-code 유효성({@link
     * com.samhanair.logis.auth.domain.PageCode#isValid(String)})은 위임받은 서비스가 검증하므로
     * 미등록 코드는 {@code INVALID_INPUT}(400) 으로 거부된다.
     *
     * <p><b>신뢰 모델(중요)</b>: 본 내부 엔드포인트는 {@code X-Internal-Token} 으로만 게이트되며
     * <b>page-code 도메인을 제한하지 않는다</b>. 즉 호출 측이 어떤 도메인 grant 든 변경할 수 있는
     * 무제한 write 면이므로, <b>도메인 스코프 가드(예: arologis.* 한정)는 반드시 호출 서비스
     * 컨트롤러 측에서 강제</b>해야 한다. 본 EP 는 호출측 신뢰를 전제로 위임만 수행하며, 스코프
     * 책임은 호출측에 있다. (오용 탐지를 위해 모든 변경을 actor/롤/페이지/권한과 함께 WARN 으로
     * 감사 로깅한다.)
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
        // 신뢰경계 감사 — 도메인 무제한 write 면이므로 모든 변경을 오용 탐지용으로 WARN 기록.
        log.warn("[PermissionInternal] role-grant 변경 — actorName={} roleCode={} pageCode={} "
                        + "canView={} canEdit={}",
                ActorDisplayName.resolve(actorId, null), request.roleCode(), request.pageCode(),
                request.canView(), request.canEdit());
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
