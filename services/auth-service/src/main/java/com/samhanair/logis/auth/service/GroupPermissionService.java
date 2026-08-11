package com.samhanair.logis.auth.service;

import com.samhanair.logis.auth.domain.GroupPagePermission;
import com.samhanair.logis.auth.domain.PageCode;
import com.samhanair.logis.auth.domain.PermissionGroup;
import com.samhanair.logis.auth.repository.GroupPagePermissionRepository;
import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** 권한그룹별 page×7-action 매트릭스 조회와 저장을 담당한다. */
@Service
@RequiredArgsConstructor
public class GroupPermissionService {

    private static final String DELEGATION_ACTOR = "permission-delegation";

    private final PermissionGroupService permissionGroupService;
    private final GroupPagePermissionRepository groupPagePermissionRepository;
    private final EffectivePermissionMaterializer materializer;

    /**
     * 권한그룹의 전체 페이지 매트릭스를 조회한다.
     *
     * @param groupId 권한그룹 UUID
     * @return pageCode → 7-action matrix
     */
    @Transactional(readOnly = true)
    public Map<String, AccountPermissionService.ActionMatrix> getGroupMatrix(UUID groupId) {
        permissionGroupService.requireGroup(groupId);
        Map<String, GroupPagePermission> rows = groupPagePermissionRepository
                .findByGroupIdAndIsDeletedFalse(groupId).stream()
                .collect(Collectors.toMap(
                        GroupPagePermission::getPageCode,
                        permission -> permission,
                        (left, right) -> left,
                        LinkedHashMap::new));

        Map<String, AccountPermissionService.ActionMatrix> result = new LinkedHashMap<>();
        for (PageCode pageCode : PageCode.values()) {
            GroupPagePermission permission = rows.get(pageCode.getCode());
            result.put(pageCode.getCode(), permission == null
                    ? AccountPermissionService.ActionMatrix.none()
                    : AccountPermissionService.ActionMatrix.from(permission));
        }
        return result;
    }

    /**
     * 권한그룹 매트릭스를 upsert 하고 배속 계정들의 effective 권한을 재계산한다.
     *
     * @param groupId 그룹 UUID
     * @param updates 갱신할 페이지 권한 목록
     * @return 갱신 행 수
     */
    @Transactional
    public int updateGroupMatrix(UUID groupId, List<AccountPermissionService.AccountPermissionUpdate> updates) {
        return updateGroupMatrix(groupId, updates, null);
    }

    /**
     * 권한그룹 매트릭스를 upsert 하고 배속 계정들의 effective 권한을 재계산한다.
     *
     * <p>관리권위 page-code 는 MASTER 만 grant/revoke 할 수 있다. 이 봉쇄는
     * 권한설정 위임자가 다시 관리권위를 확산하는 것을 차단한다.
     *
     * <p>C5-4 actor 전환: {@code actorRole} 파라미터는 이전 X-User-Role 유래였으나
     * 게이트웨이가 헤더를 주입하지 않으므로 {@code isSystemMaster} 로 시맨틱 전환됨.
     * 호출처({@link com.samhanair.logis.auth.web.PermissionGroupController})는
     * X-Is-System-Master 헤더를 직접 수신해 이 파라미터로 전달한다.
     *
     * @param groupId        그룹 UUID
     * @param updates        갱신할 페이지 권한 목록
     * @param isSystemMaster X-Is-System-Master 헤더 값 ("true" = MASTER)
     * @return 갱신 행 수
     */
    @Transactional
    public int updateGroupMatrix(
            UUID groupId,
            List<AccountPermissionService.AccountPermissionUpdate> updates,
            String isSystemMaster) {
        return updateGroupMatrix(groupId, updates, isSystemMaster, null);
    }

    @Transactional
    public int updateGroupMatrix(
            UUID groupId,
            List<AccountPermissionService.AccountPermissionUpdate> updates,
            String isSystemMaster,
            String actorId) {
        PermissionGroup group = permissionGroupService.requireGroup(groupId);
        rejectBuiltinMutation(group);
        if (updates == null || updates.isEmpty()) {
            materializer.materializeForGroup(groupId);
            return 0;
        }

        Map<String, AccountPermissionService.ActionMatrix> normalized = new LinkedHashMap<>();
        for (AccountPermissionService.AccountPermissionUpdate update : updates) {
            validatePageCode(update.pageCode());
            ManagementPageMutationGuard.rejectManagementPageMutation(update.pageCode(), isSystemMaster);
            validateActions(update.actions());
            normalized.put(update.pageCode(), update.actions());
        }

        for (Map.Entry<String, AccountPermissionService.ActionMatrix> entry : normalized.entrySet()) {
            GroupPagePermission permission = groupPagePermissionRepository
                    .findByGroupIdAndPageCodeAndIsDeletedFalse(groupId, entry.getKey())
                    .orElseGet(() -> GroupPagePermission.of(groupId, entry.getKey()));
            entry.getValue().applyTo(permission);
            permission.setActorId(actorId);
            groupPagePermissionRepository.save(permission);
        }
        materializer.materializeForGroup(groupId);
        return normalized.size();
    }

    /**
     * 관리권위 위임 현황을 조회한다.
     *
     * @param groupId 그룹 UUID
     * @return 관리 page-code 3종 보유 여부
     */
    @Transactional(readOnly = true)
    public DelegationMatrix getDelegations(UUID groupId) {
        permissionGroupService.requireGroup(groupId);
        Map<String, GroupPagePermission> rows = groupPagePermissionRepository
                .findByGroupIdAndIsDeletedFalse(groupId).stream()
                .filter(permission -> PageCode.isManagementPageCode(permission.getPageCode()))
                .collect(Collectors.toMap(
                        GroupPagePermission::getPageCode,
                        permission -> permission,
                        (left, right) -> left,
                        LinkedHashMap::new));
        return DelegationMatrix.from(rows);
    }

    /**
     * MASTER 전용 관리권위 위임 토글.
     *
     * <p>각 토글은 해당 page-code 의 view/update 를 함께 부여하거나 모두 회수한다.
     * 저장 후 그룹 배속 계정의 effective 권한을 재계산한다.
     *
     * <p>C5-4 actor 전환: {@code isSystemMaster} 파라미터는 X-Is-System-Master 헤더 유래.
     * 비MASTER(헤더 부재/false) 거절 — fail-secure.
     *
     * @param groupId        그룹 UUID
     * @param request        위임 토글 요청
     * @param isSystemMaster X-Is-System-Master 헤더 값 ("true" = MASTER)
     * @return 저장 후 위임 현황
     */
    @Transactional
    public DelegationMatrix updateDelegations(UUID groupId, DelegationUpdateRequest request, String isSystemMaster) {
        return updateDelegations(groupId, request, isSystemMaster, null);
    }

    @Transactional
    public DelegationMatrix updateDelegations(
            UUID groupId, DelegationUpdateRequest request, String isSystemMaster, String actorId) {
        PermissionGroup group = permissionGroupService.requireGroup(groupId);
        rejectBuiltinMutation(group);
        requireMaster(isSystemMaster);
        DelegationUpdateRequest normalized = request == null ? DelegationUpdateRequest.none() : request;
        upsertDelegation(groupId, PageCode.SYSTEM_PERMISSION_ADMIN.getCode(), normalized.permissionAdmin(), actorId);
        upsertDelegation(groupId, PageCode.HR_ROLE_MANAGEMENT.getCode(), normalized.hrRoleManagement(), actorId);
        upsertDelegation(groupId, PageCode.ADMIN_PERMISSION_GROUPS.getCode(), normalized.permissionGroups(), actorId);
        materializer.materializeForGroup(groupId);
        return getDelegations(groupId);
    }

    /** 시스템/빌트인 권한그룹의 page×action 매트릭스는 운영 정책상 불변으로 유지한다. */
    private void rejectBuiltinMutation(PermissionGroup group) {
        if (group.isBuiltin() || group.isSystemMaster()) {
            throw new BusinessException(ErrorCode.CONFLICT, "시스템 권한그룹은 변경하거나 삭제할 수 없습니다.");
        }
    }

    private void validatePageCode(String pageCode) {
        if (pageCode == null || pageCode.isBlank() || !PageCode.isValid(pageCode)) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "등록되지 않은 페이지 코드입니다: " + pageCode);
        }
    }

    private void validateActions(AccountPermissionService.ActionMatrix actions) {
        if (actions == null) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "권한 액션 값은 필수입니다.");
        }
    }

    /**
     * 관리권위 위임 page-code 를 부여하거나 회수한다.
     *
     * <p>회수는 all-false 활성 행을 남기지 않고 soft-delete 하여, 활성 관리 page-code 존재 여부를
     * 사용하는 배속 가드가 회수된 그룹을 일반 그룹으로 판정하게 한다.
     */
    private void upsertDelegation(UUID groupId, String pageCode, boolean grant, String actorId) {
        if (!grant) {
            groupPagePermissionRepository.findByGroupIdAndPageCodeAndIsDeletedFalse(groupId, pageCode)
                    .ifPresent(permission -> {
                        permission.markDeleted(actorId == null ? DELEGATION_ACTOR : actorId);
                        permission.setActorId(actorId);
                        groupPagePermissionRepository.save(permission);
                    });
            return;
        }

        GroupPagePermission permission = groupPagePermissionRepository
                .findByGroupIdAndPageCodeAndIsDeletedFalse(groupId, pageCode)
                .orElseGet(() -> GroupPagePermission.of(groupId, pageCode));
        permission.setActions(true, false, true, false, false, false, false);
        permission.setActorId(actorId);
        groupPagePermissionRepository.save(permission);
    }

    /**
     * 관리 page-code 변경 시 MASTER 여부를 확인한다 (C5-4 전환 후 isSystemMaster 기반).
     *
     * <p>주의: 이 메서드는 현재 사용되지 않음. 공유 정책은
     * {@link ManagementPageMutationGuard#rejectManagementPageMutation(String, String)} 으로 위임.
     */
    @SuppressWarnings("unused")
    private void rejectManagementPageMutation(String pageCode, String isSystemMaster) {
        ManagementPageMutationGuard.rejectManagementPageMutation(pageCode, isSystemMaster);
    }

    /**
     * MASTER 여부를 확인하고 비MASTER 면 FORBIDDEN 을 던진다 (C5-4: isSystemMaster 기반).
     *
     * @param isSystemMaster X-Is-System-Master 헤더 값
     */
    private void requireMaster(String isSystemMaster) {
        if (!ManagementPageMutationGuard.isSystemMaster(isSystemMaster)) {
            throw new BusinessException(ErrorCode.FORBIDDEN, "권한 위임은 MASTER 만 수행할 수 있습니다.");
        }
    }

    public record DelegationUpdateRequest(
            boolean permissionAdmin,
            boolean hrRoleManagement,
            boolean permissionGroups) {

        public static DelegationUpdateRequest none() {
            return new DelegationUpdateRequest(false, false, false);
        }
    }

    public record DelegationMatrix(
            boolean permissionAdmin,
            boolean hrRoleManagement,
            boolean permissionGroups) {

        private static DelegationMatrix from(Map<String, GroupPagePermission> rows) {
            return new DelegationMatrix(
                    isDelegated(rows.get(PageCode.SYSTEM_PERMISSION_ADMIN.getCode())),
                    isDelegated(rows.get(PageCode.HR_ROLE_MANAGEMENT.getCode())),
                    isDelegated(rows.get(PageCode.ADMIN_PERMISSION_GROUPS.getCode())));
        }

        private static boolean isDelegated(GroupPagePermission permission) {
            return permission != null && permission.isCanView() && permission.isCanUpdate();
        }
    }
}
