package com.samhanair.logis.auth.web;

import com.samhanair.logis.auth.service.AccountGroupService;
import com.samhanair.logis.auth.service.AccountPermissionService;
import com.samhanair.logis.auth.service.GroupPermissionService;
import com.samhanair.logis.auth.service.PermissionGroupService;
import com.samhanair.logis.auth.web.PermissionAdminController.ChangedCountResponse;
import com.samhanair.logis.auth.web.dto.PermissionGroupDtos.AssignAccountGroupRequest;
import com.samhanair.logis.auth.web.dto.PermissionGroupDtos.CreateGroupRequest;
import com.samhanair.logis.auth.web.dto.PermissionGroupDtos.RenameGroupRequest;
import com.samhanair.logis.auth.web.dto.PermissionGroupDtos.UpdateGroupMatrixRequest;
import com.samhanair.logis.common.dto.ApiResponse;
import com.samhanair.logis.security.permission.PermissionAction;
import com.samhanair.logis.security.permission.RequirePermission;
import jakarta.validation.Valid;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/**
 * 동적 권한그룹 관리 API.
 *
 * <p>권한그룹 CRUD/매트릭스는 기존 시스템 권한 관리 권한
 * {@code system.permission-admin} 으로 보호한다. MASTER 는 PermissionAspect 의 bypass 로
 * 통과하고, 위임 계정은 Phase B 에서 이 page 권한을 부여받아 접근한다.
 * 관리권위 page-code 자체의 부여/회수는 별도 MASTER 검사를 추가해 재위임을 차단한다.
 */
@RestController
@RequestMapping("/auth/admin")
@RequiredArgsConstructor
public class PermissionGroupController {

    /** C5-4: X-User-Role 제거 — actor MASTER 판정은 X-Is-System-Master 헤더로만 수행. */
    private static final String SYSTEM_MASTER_HEADER = "X-Is-System-Master";
    private static final String USER_ID_HEADER = "X-User-Id";

    private final PermissionGroupService permissionGroupService;
    private final GroupPermissionService groupPermissionService;
    private final AccountGroupService accountGroupService;

    /**
     * 권한그룹 목록을 조회한다.
     *
     * @return 그룹 UUID, 그룹명, 설명, 시스템 여부, 배속 계정 수
     */
    @GetMapping("/permission-groups")
    @RequirePermission(page = "system.permission-admin", action = PermissionAction.VIEW)
    public ApiResponse<List<PermissionGroupService.GroupSummary>> listGroups() {
        return ApiResponse.ok(permissionGroupService.listGroups());
    }

    /**
     * 권한그룹을 생성한다.
     *
     * @param request 그룹명/설명
     * @return 생성된 그룹
     */
    @PostMapping("/permission-groups")
    @ResponseStatus(HttpStatus.CREATED)
    @RequirePermission(page = "system.permission-admin", action = PermissionAction.UPDATE)
    public ApiResponse<PermissionGroupService.GroupSummary> createGroup(
            @Valid @RequestBody CreateGroupRequest request) {
        return ApiResponse.ok(permissionGroupService.create(request.name(), request.description()));
    }

    /**
     * 권한그룹 이름과 설명을 변경한다.
     *
     * @param id      권한그룹 UUID
     * @param request 새 그룹명/설명
     * @return 변경된 그룹
     */
    @PutMapping("/permission-groups/{id}")
    @RequirePermission(page = "system.permission-admin", action = PermissionAction.UPDATE)
    public ApiResponse<PermissionGroupService.GroupSummary> renameGroup(
            @PathVariable UUID id,
            @Valid @RequestBody RenameGroupRequest request) {
        return ApiResponse.ok(permissionGroupService.rename(id, request.name(), request.description()));
    }

    /**
     * 빈 권한그룹을 soft-delete 한다.
     *
     * @param id 권한그룹 UUID
     */
    @DeleteMapping("/permission-groups/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @RequirePermission(page = "system.permission-admin", action = PermissionAction.UPDATE)
    public void deleteGroup(@PathVariable UUID id) {
        permissionGroupService.softDelete(id);
    }

    /**
     * 권한그룹의 page×7-action 매트릭스를 조회한다.
     *
     * @param id 권한그룹 UUID
     * @return pageCode → 7-action matrix
     */
    @GetMapping("/permission-groups/{id}/permissions")
    @RequirePermission(page = "system.permission-admin", action = PermissionAction.VIEW)
    public ApiResponse<Map<String, AccountPermissionService.ActionMatrix>> getGroupMatrix(
            @PathVariable UUID id) {
        return ApiResponse.ok(groupPermissionService.getGroupMatrix(id));
    }

    /**
     * 권한그룹의 page×7-action 매트릭스를 갱신하고 배속 계정의 effective 권한을 재계산한다.
     *
     * <p>관리 page-code grant 는 MASTER 전용 — X-Is-System-Master 헤더로 판정.
     *
     * @param id             권한그룹 UUID
     * @param request        갱신할 row 목록
     * @param isSystemMaster X-Is-System-Master 헤더 ("true" = MASTER)
     * @return 변경 행 수
     */
    @PutMapping("/permission-groups/{id}/permissions")
    @RequirePermission(page = "system.permission-admin", action = PermissionAction.UPDATE)
    public ApiResponse<ChangedCountResponse> updateGroupMatrix(
            @PathVariable UUID id,
            @Valid @RequestBody UpdateGroupMatrixRequest request,
            @RequestHeader(value = SYSTEM_MASTER_HEADER, required = false) String isSystemMaster,
            @RequestHeader(value = USER_ID_HEADER, required = false) String actorId) {
        int changed = groupPermissionService.updateGroupMatrix(id, request.rows(), isSystemMaster, actorId);
        return ApiResponse.ok(new ChangedCountResponse(changed));
    }

    /**
     * 권한그룹의 관리권위 위임 현황을 조회한다.
     *
     * @param id 권한그룹 UUID
     * @return system.permission-admin / hr.role-management / admin.permission-groups 보유 여부
     */
    @GetMapping("/permission-groups/{id}/delegations")
    @RequirePermission(page = "system.permission-admin", action = PermissionAction.VIEW)
    public ApiResponse<GroupPermissionService.DelegationMatrix> getDelegations(
            @PathVariable UUID id) {
        return ApiResponse.ok(groupPermissionService.getDelegations(id));
    }

    /**
     * MASTER 전용 관리권위 위임 토글.
     *
     * <p>위임받은 비MASTER 가 다시 관리권위를 확산하는 것을 막기 위해
     * X-Is-System-Master 헤더 추가 검사를 서비스에서 수행한다 (C5-4 전환).
     *
     * @param id             권한그룹 UUID
     * @param request        위임 토글
     * @param isSystemMaster X-Is-System-Master 헤더 ("true" = MASTER, 부재/false → 403)
     * @return 저장 후 위임 현황
     */
    @PutMapping("/permission-groups/{id}/delegations")
    @RequirePermission(page = "system.permission-admin", action = PermissionAction.UPDATE)
    public ApiResponse<GroupPermissionService.DelegationMatrix> updateDelegations(
            @PathVariable UUID id,
            @RequestBody GroupPermissionService.DelegationUpdateRequest request,
            @RequestHeader(value = SYSTEM_MASTER_HEADER, required = false) String isSystemMaster,
            @RequestHeader(value = USER_ID_HEADER, required = false) String actorId) {
        return ApiResponse.ok(groupPermissionService.updateDelegations(id, request, isSystemMaster, actorId));
    }

    /**
     * 계정의 권한그룹 배속 목록을 조회한다.
     *
     * @param accountId 계정 UUID
     * @return 계정 표시명과 그룹 표시명을 포함한 배속 목록
     */
    @GetMapping("/accounts/{accountId}/groups")
    @RequirePermission(page = "system.permission-admin", action = PermissionAction.VIEW)
    public ApiResponse<List<AccountGroupService.AccountGroupSummary>> getAccountGroups(
            @PathVariable UUID accountId) {
        return ApiResponse.ok(accountGroupService.getGroups(accountId));
    }

    /**
     * 계정을 권한그룹에 배속한다. 이미 배속된 경우에도 같은 결과를 반환한다.
     *
     * <p>관리 page-code 보유 그룹 배속은 MASTER 전용 — X-Is-System-Master 헤더로 판정 (C5-4 전환).
     *
     * @param accountId      계정 UUID
     * @param request        배속할 권한그룹 UUID
     * @param isSystemMaster X-Is-System-Master 헤더 ("true" = MASTER)
     * @return 배속 결과
     */
    @PostMapping("/accounts/{accountId}/groups")
    @RequirePermission(page = "system.permission-admin", action = PermissionAction.UPDATE)
    public ApiResponse<AccountGroupService.AccountGroupSummary> assignAccountGroup(
            @PathVariable UUID accountId,
            @Valid @RequestBody AssignAccountGroupRequest request,
            @RequestHeader(value = SYSTEM_MASTER_HEADER, required = false) String isSystemMaster) {
        return ApiResponse.ok(accountGroupService.assign(accountId, request.groupId(), isSystemMaster));
    }

    /**
     * 계정의 권한그룹 배속을 해제한다.
     *
     * <p>관리 page-code 보유 그룹 배속 해제도 MASTER 전용 — X-Is-System-Master 헤더로 판정 (C5-4 전환).
     *
     * @param accountId      계정 UUID
     * @param groupId        권한그룹 UUID
     * @param isSystemMaster X-Is-System-Master 헤더 ("true" = MASTER)
     */
    @DeleteMapping("/accounts/{accountId}/groups/{groupId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @RequirePermission(page = "system.permission-admin", action = PermissionAction.UPDATE)
    public void unassignAccountGroup(
            @PathVariable UUID accountId,
            @PathVariable UUID groupId,
            @RequestHeader(value = SYSTEM_MASTER_HEADER, required = false) String isSystemMaster) {
        accountGroupService.unassign(accountId, groupId, isSystemMaster);
    }
}
