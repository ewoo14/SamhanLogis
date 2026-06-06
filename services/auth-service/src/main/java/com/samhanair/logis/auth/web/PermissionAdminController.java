package com.samhanair.logis.auth.web;

import com.samhanair.logis.auth.domain.PageCode;
import com.samhanair.logis.auth.service.AccountPermissionService;
import com.samhanair.logis.auth.service.DynamicPermissionService;
import com.samhanair.logis.auth.service.dto.PermissionDto;
import com.samhanair.logis.auth.web.dto.PermissionBatchUpdateRequest;
import com.samhanair.logis.auth.web.dto.PermissionUpdateRequest;
import com.samhanair.logis.common.dto.ApiResponse;
import com.samhanair.logis.security.InternalAuthProperties;
import com.samhanair.logis.security.permission.PermissionAction;
import com.samhanair.logis.security.permission.RequirePermission;
import jakarta.validation.Valid;
import java.util.Arrays;
import java.util.EnumSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

// SP-D1 preauth-role 제거: @PreAuthorize("hasRole('MASTER')") → @RequirePermission single source
// (system.permission-admin seed = MASTER-only, PermissionAspect.isMasterBypass() 통과 → widening 0)

// C5-4: getMyPermissions endpoint — X-User-Role 제거. X-Is-System-Master / X-Is-Partner 기반으로 전환 완료.

/**
 * 동적 RBAC 권한 관리 API — SP-D1.
 *
 * <p>MASTER 전용 endpoint. 역할별 페이지 권한을 체크박스 형태로 override 가능.
 *
 * <p>권한 전략:
 * <ul>
 *   <li>모든 MASTER 전용 handler 는 {@code @RequirePermission(page="system.permission-admin")} 단일 가드.</li>
 *   <li>{@code system.permission-admin} seed = MASTER-only (V29),
 *       {@link com.samhanair.logis.security.permission.PermissionAspect#isMasterBypass()} 로 통과,
 *       non-MASTER 는 deny → widening 0.</li>
 *   <li>MASTER 권한 자체는 동적 override 불가 — 시스템 안전 장치.</li>
 *   <li>마스터가 설정한 override row 가 존재하면 다른 서비스에서 DB 권한 우선 적용.</li>
 * </ul>
 *
 * <p>UUID 비공개 정책: 응답에 UUID 필드는 포함하지 않는다.
 * roleCode + pageCode 비즈니스 식별자만 사용.
 *
 * <p>참고: auth-service 는 springdoc-openapi 의존성이 없으므로
 * Swagger {@code @Operation} / {@code @ApiResponses} 어노테이션은 사용하지 않는다.
 */
@RestController
@RequestMapping("/auth/admin/permissions")
@RequiredArgsConstructor
public class PermissionAdminController {

    private static final String USER_ID_HEADER = "X-User-Id";
    /** C5-4: X-User-Role 제거 — actor MASTER 판정은 X-Is-System-Master, PARTNER 판정은 X-Is-Partner 로 전환. */
    private static final String SYSTEM_MASTER_HEADER = "X-Is-System-Master";
    private static final String IS_PARTNER_HEADER    = "X-Is-Partner";
    private static final String INTERNAL_TOKEN_HEADER = "X-Internal-Token";
    private static final List<String> ALL_ACTION_NAMES = Arrays.stream(PermissionAction.values())
            .map(Enum::name)
            .toList();

    private final DynamicPermissionService permissionService;
    private final AccountPermissionService accountPermissionService;
    private final InternalAuthProperties internalAuthProperties;

    @GetMapping("/accounts")
    @RequirePermission(page = "system.permission-admin", action = PermissionAction.VIEW)
    public ApiResponse<List<AccountPermissionService.AccountSummary>> getAccounts() {
        return ApiResponse.ok(accountPermissionService.listAccounts());
    }

    @GetMapping("/account/{accountId}")
    @RequirePermission(page = "system.permission-admin", action = PermissionAction.VIEW)
    public ApiResponse<Map<String, AccountPermissionService.ActionMatrix>> getAccountMatrix(
            @org.springframework.web.bind.annotation.PathVariable UUID accountId) {
        return ApiResponse.ok(accountPermissionService.getAccountMatrix(accountId));
    }

    @PutMapping("/account/{accountId}")
    @RequirePermission(page = "system.permission-admin", action = PermissionAction.UPDATE)
    public ApiResponse<ChangedCountResponse> updateAccountMatrix(
            @org.springframework.web.bind.annotation.PathVariable UUID accountId,
            @RequestBody List<AccountPermissionService.AccountPermissionUpdate> request,
            @RequestHeader(value = USER_ID_HEADER, required = false) String actorId,
            @RequestHeader(value = SYSTEM_MASTER_HEADER, required = false) String isSystemMaster) {
        int changed = accountPermissionService.updateAccountMatrix(
                accountId,
                request,
                callerOrSystem(actorId),
                isSystemMaster);
        return ApiResponse.ok(new ChangedCountResponse(changed));
    }

    @PostMapping("/account/{accountId}/apply-template")
    @RequirePermission(page = "system.permission-admin", action = PermissionAction.UPDATE)
    public ApiResponse<ChangedCountResponse> applyTemplate(
            @org.springframework.web.bind.annotation.PathVariable UUID accountId,
            @RequestParam String roleCode,
            @RequestHeader(value = USER_ID_HEADER, required = false) String actorId,
            @RequestHeader(value = SYSTEM_MASTER_HEADER, required = false) String isSystemMaster) {
        int changed = accountPermissionService.applyTemplate(accountId, roleCode, callerOrSystem(actorId), isSystemMaster);
        return ApiResponse.ok(new ChangedCountResponse(changed));
    }

    @PostMapping("/account/{accountId}/copy-from")
    @RequirePermission(page = "system.permission-admin", action = PermissionAction.UPDATE)
    public ApiResponse<ChangedCountResponse> copyFrom(
            @org.springframework.web.bind.annotation.PathVariable UUID accountId,
            @RequestParam UUID sourceAccountId,
            @RequestHeader(value = USER_ID_HEADER, required = false) String actorId,
            @RequestHeader(value = SYSTEM_MASTER_HEADER, required = false) String isSystemMaster) {
        int changed = accountPermissionService.copyFromAccount(
                accountId,
                sourceAccountId,
                callerOrSystem(actorId),
                isSystemMaster);
        return ApiResponse.ok(new ChangedCountResponse(changed));
    }

    @GetMapping("/templates")
    @RequirePermission(page = "system.permission-admin", action = PermissionAction.VIEW)
    public ApiResponse<Map<String, Map<String, AccountPermissionService.ActionMatrix>>> getTemplates() {
        return ApiResponse.ok(accountPermissionService.getTemplates());
    }

    @PutMapping("/templates/{roleCode}")
    @RequirePermission(page = "system.permission-admin", action = PermissionAction.UPDATE)
    public ApiResponse<ChangedCountResponse> updateTemplate(
            @org.springframework.web.bind.annotation.PathVariable String roleCode,
            @RequestBody List<AccountPermissionService.AccountPermissionUpdate> request,
            @RequestHeader(value = USER_ID_HEADER, required = false) String actorId,
            @RequestHeader(value = SYSTEM_MASTER_HEADER, required = false) String isSystemMaster) {
        int changed = accountPermissionService.updateTemplate(roleCode, request, callerOrSystem(actorId), isSystemMaster);
        return ApiResponse.ok(new ChangedCountResponse(changed));
    }

    @PostMapping("/bulk")
    @RequirePermission(page = "system.permission-admin", action = PermissionAction.UPDATE)
    public ApiResponse<ChangedCountResponse> bulkApply(
            @RequestBody AccountPermissionService.BulkPermissionRequest request,
            @RequestHeader(value = USER_ID_HEADER, required = false) String actorId,
            @RequestHeader(value = SYSTEM_MASTER_HEADER, required = false) String isSystemMaster) {
        int changed = accountPermissionService.bulkApply(request, callerOrSystem(actorId), isSystemMaster);
        return ApiResponse.ok(new ChangedCountResponse(changed));
    }

    /**
     * 전체 권한 매트릭스 조회 — 역할 × 페이지 (MASTER 전용).
     *
     * <p>구조: {@code Map<roleCode, Map<pageCode, PermissionDto>>}
     * DB override row 가 없는 조합은 {@code isOverride = false} 로 표시.
     *
     * @return 전체 매트릭스 ApiResponse
     */
    @GetMapping
    @RequirePermission(page = "system.permission-admin", action = PermissionAction.VIEW)
    public ApiResponse<Map<String, Map<String, PermissionDto>>> getMatrix() {
        return ApiResponse.ok(permissionService.getPermissionMatrix());
    }

    /**
     * 단일 권한 갱신 (MASTER 전용).
     *
     * <p>roleCode + pageCode 조합이 이미 있으면 update, 없으면 신규 insert.
     * canEdit=true 이면 canView 도 자동 true (도메인 메서드 {@code updatePermissions} 적용).
     *
     * @param request  갱신 요청 (roleCode / pageCode / canView / canEdit)
     * @param actorId  요청자 X-User-Id 헤더
     * @return 갱신된 PermissionDto
     */
    @PutMapping
    @RequirePermission(page = "system.permission-admin", action = PermissionAction.UPDATE)
    public ApiResponse<PermissionDto> updatePermission(
            @Valid @RequestBody PermissionUpdateRequest request,
            @RequestHeader(value = USER_ID_HEADER, required = false) String actorId,
            @RequestHeader(value = SYSTEM_MASTER_HEADER, required = false) String isSystemMaster) {
        return ApiResponse.ok(
                permissionService.updatePermission(request, callerOrSystem(actorId), isSystemMaster));
    }

    /**
     * 다건 권한 일괄 갱신 — 체크박스 다중 토글 (MASTER 전용).
     *
     * <p>최대 100건. 하나라도 실패 시 전체 롤백.
     *
     * @param request  일괄 갱신 요청 (1~100건)
     * @param actorId  요청자 X-User-Id 헤더
     * @return 갱신된 PermissionDto 목록
     */
    @PostMapping("/batch")
    @RequirePermission(page = "system.permission-admin", action = PermissionAction.UPDATE)
    public ApiResponse<List<PermissionDto>> batchUpdate(
            @Valid @RequestBody PermissionBatchUpdateRequest request,
            @RequestHeader(value = USER_ID_HEADER, required = false) String actorId,
            @RequestHeader(value = SYSTEM_MASTER_HEADER, required = false) String isSystemMaster) {
        return ApiResponse.ok(
                permissionService.updatePermissionsBatch(request, callerOrSystem(actorId), isSystemMaster));
    }

    /**
     * 단일 권한 override 삭제 (soft-delete, MASTER 전용).
     *
     * <p>삭제 후 해당 (roleCode, pageCode) 조합은 fallback 정책으로 복귀.
     * 주의: 완전히 DB에서 제거하지 않고 soft-delete 처리.
     *
     * @param roleCode 역할 코드
     * @param pageCode 페이지 코드
     * @param actorId  요청자 X-User-Id 헤더
     */
    @DeleteMapping
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @RequirePermission(page = "system.permission-admin", action = PermissionAction.DELETE)
    public void deletePermission(
            @RequestParam String roleCode,
            @RequestParam String pageCode,
            @RequestHeader(value = USER_ID_HEADER, required = false) String actorId,
            @RequestHeader(value = SYSTEM_MASTER_HEADER, required = false) String isSystemMaster) {
        permissionService.deletePermission(roleCode, pageCode, callerOrSystem(actorId), isSystemMaster);
    }

    /**
     * 현재 계정의 활성 권한 목록 조회 — 인증된 모든 사용자 접근 가능.
     *
     * <p>FE {@code GET /admin/permissions/my} 호출 대응 endpoint.
     * X-User-Id 헤더의 account UUID 로 account_page_permissions 를 조회한다.
     *
     * <p>C5-4 actor 전환: X-User-Role 헤더 대신 아래 헤더로 identity 를 판정한다:
     * <ul>
     *   <li>X-Is-System-Master=true → MASTER: 모든 PageCode 전권 반환</li>
     *   <li>X-Is-Partner=true → PARTNER: 빈 map 반환 (fail-closed)</li>
     *   <li>그 외 → X-User-Id 기반 account_page_permissions 조회</li>
     * </ul>
     * 누락/잘못된 account UUID 는 빈 map 으로 fail-closed 한다.
     *
     * @param userId         요청자 계정 UUID (X-User-Id 헤더, api-gateway 에서 JWT sub 전파)
     * @param isSystemMaster X-Is-System-Master 헤더 ("true" = MASTER)
     * @param isPartner      X-Is-Partner 헤더 ("true" = PARTNER identity)
     * @return pageCode → 허용 action enum name 목록
     */
    @GetMapping("/my")
    @PreAuthorize("isAuthenticated()")
    public ApiResponse<Map<String, List<String>>> getMyPermissions(
            @RequestHeader(value = USER_ID_HEADER, required = false) String userId,
            @RequestHeader(value = SYSTEM_MASTER_HEADER, required = false) String isSystemMaster,
            @RequestHeader(value = IS_PARTNER_HEADER, required = false) String isPartner) {
        if ("true".equalsIgnoreCase(isSystemMaster)) {
            return ApiResponse.ok(allPageActions());
        }
        if ("true".equalsIgnoreCase(isPartner)) {
            return ApiResponse.ok(Map.of());
        }
        UUID accountId = parseUuid(userId);
        if (accountId == null) {
            return ApiResponse.ok(Map.of());
        }
        return ApiResponse.ok(toActionNameMap(accountPermissionService.bulkLoad(accountId)));
    }

    /**
     * 단일 권한 조회 — deprecated alias. 신규 service-to-service 호출은
     * {@code /auth/internal/permissions/check} 로 이동.
     *
     * <p>roleCode + pageCode + type(VIEW|EDIT) 파라미터로 해당 권한 여부를 반환.
     * 인증된 사용자(타 서비스 헤더 기반)이면 모두 호출 가능.
     * MASTER 전용 endpoint 가 아니므로 {@code @PreAuthorize} 는 authenticated 만 적용.
     *
     * @param roleCode 역할 코드
     * @param pageCode 페이지 코드
     * @param type     권한 유형 (VIEW 또는 EDIT, 기본값 EDIT)
     * @return 권한 허용 여부 {@code {"allowed": true/false}}
     */
    @GetMapping("/check")
    @Deprecated(since = "2026-05-22", forRemoval = false)
    @PreAuthorize("isAuthenticated()")
    public ApiResponse<PermissionCheckResponse> checkPermission(
            @RequestParam String roleCode,
            @RequestParam String pageCode,
            @RequestParam(defaultValue = "EDIT") String type,
            @RequestHeader(value = INTERNAL_TOKEN_HEADER, required = false) String internalToken) {
        assertInternalToken(internalToken);
        boolean allowed = permissionService.canAccess(roleCode, pageCode, type);
        return ApiResponse.ok(new PermissionCheckResponse(allowed));
    }

    /**
     * 단일 권한 조회 응답 DTO.
     *
     * @param allowed 권한 부여 여부
     */
    public record PermissionCheckResponse(boolean allowed) {
    }

    public record ChangedCountResponse(int changedCount) {
    }

    private void assertInternalToken(String supplied) {
        String expected = internalAuthProperties.getToken();
        if (expected == null || expected.isBlank()
                || supplied == null || supplied.isBlank()
                || !expected.equals(supplied)) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "X-Internal-Token invalid");
        }
    }

    private String callerOrSystem(String header) {
        return (header == null || header.isBlank()) ? "system" : header;
    }

    private Map<String, List<String>> allPageActions() {
        Map<String, List<String>> result = new LinkedHashMap<>();
        for (PageCode pageCode : PageCode.values()) {
            result.put(pageCode.getCode(), ALL_ACTION_NAMES);
        }
        return result;
    }

    private Map<String, List<String>> toActionNameMap(Map<String, EnumSet<PermissionAction>> permissions) {
        Map<String, List<String>> result = new LinkedHashMap<>();
        for (Map.Entry<String, EnumSet<PermissionAction>> entry : permissions.entrySet()) {
            result.put(entry.getKey(), entry.getValue().stream()
                    .map(Enum::name)
                    .toList());
        }
        return result;
    }

    private UUID parseUuid(String raw) {
        if (raw == null || raw.isBlank()) {
            return null;
        }
        try {
            return UUID.fromString(raw);
        } catch (IllegalArgumentException ignored) {
            return null;
        }
    }
}
