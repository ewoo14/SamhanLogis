package com.samhanair.logis.auth.service;

import com.samhanair.logis.auth.domain.AccountGroup;
import com.samhanair.logis.auth.domain.AccountPagePermission;
import com.samhanair.logis.auth.domain.AccountPermissionOverride;
import com.samhanair.logis.auth.domain.GroupPagePermission;
import com.samhanair.logis.auth.repository.AccountGroupRepository;
import com.samhanair.logis.auth.repository.AccountPagePermissionRepository;
import com.samhanair.logis.auth.repository.AccountPermissionOverrideRepository;
import com.samhanair.logis.auth.repository.GroupPagePermissionRepository;
import com.samhanair.logis.auth.repository.PermissionGroupRepository;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 권한그룹/override 결과를 기존 {@code account_page_permissions} enforcement 캐시로 재계산한다.
 *
 * <p>계정 실권한은 {@code override(page) ?? OR(group_page_permissions)} 이다.
 * 기존 {@code PermissionAspect}, {@code DynamicPermissionClient} 는 이 캐시만 읽으므로 Phase A 에서
 * enforcement 경로를 변경하지 않는다.
 */
@Service
@RequiredArgsConstructor
public class EffectivePermissionMaterializer {

    private static final String ACTOR = "permission-materializer";

    private final AccountGroupRepository accountGroupRepository;
    private final PermissionGroupRepository permissionGroupRepository;
    private final GroupPagePermissionRepository groupPagePermissionRepository;
    private final AccountPermissionOverrideRepository overrideRepository;
    private final AccountPagePermissionRepository accountPagePermissionRepository;

    /**
     * 단일 계정의 effective 권한을 재계산한다.
     *
     * <p>MASTER 시스템 그룹에 배속된 계정은 기존 MASTER bypass 를 유지하기 위해
     * {@code account_page_permissions} 활성 행을 만들지 않는다.
     *
     * @param accountId 재계산 대상 계정 UUID
     */
    @Transactional
    public void materializeForAccount(UUID accountId) {
        if (accountId == null) {
            return;
        }

        List<AccountGroup> accountGroups =
                accountGroupRepository.findByAccountIdAndIsDeletedFalseOrderByGroupIdAsc(accountId);
        softDeleteCurrentRows(accountId);

        if (hasSystemMasterGroup(accountGroups)) {
            return;
        }

        Map<String, PermissionMatrix> effective = unionGroupPermissions(accountGroups);
        applyOverrides(accountId, effective);

        List<AccountPagePermission> rows = effective.entrySet().stream()
                .map(entry -> entry.getValue().toAccountPagePermission(accountId, entry.getKey()))
                .toList();
        accountPagePermissionRepository.saveAll(rows);
    }

    /**
     * 권한그룹에 배속된 모든 계정의 effective 권한을 재계산한다.
     *
     * @param groupId 변경된 권한그룹 UUID
     */
    @Transactional
    public void materializeForGroup(UUID groupId) {
        if (groupId == null) {
            return;
        }
        List<UUID> accountIds = accountGroupRepository.findByGroupIdAndIsDeletedFalse(groupId).stream()
                .map(AccountGroup::getAccountId)
                .distinct()
                .toList();
        for (UUID accountId : accountIds) {
            materializeForAccount(accountId);
        }
    }

    private boolean hasSystemMasterGroup(List<AccountGroup> accountGroups) {
        for (AccountGroup accountGroup : accountGroups) {
            boolean systemMaster = permissionGroupRepository
                    .findByIdAndIsDeletedFalse(accountGroup.getGroupId())
                    .map(group -> group.isSystemMaster())
                    .orElse(false);
            if (systemMaster) {
                return true;
            }
        }
        return false;
    }

    private Map<String, PermissionMatrix> unionGroupPermissions(List<AccountGroup> accountGroups) {
        Map<String, PermissionMatrix> effective = new LinkedHashMap<>();
        for (AccountGroup accountGroup : accountGroups) {
            List<GroupPagePermission> groupPermissions =
                    groupPagePermissionRepository.findByGroupIdAndIsDeletedFalse(accountGroup.getGroupId());
            for (GroupPagePermission permission : groupPermissions) {
                effective.put(
                        permission.getPageCode(),
                        effective.getOrDefault(permission.getPageCode(), PermissionMatrix.none()).or(permission));
            }
        }
        return effective;
    }

    private void applyOverrides(UUID accountId, Map<String, PermissionMatrix> effective) {
        for (AccountPermissionOverride override : overrideRepository.findByAccountIdAndIsDeletedFalse(accountId)) {
            effective.put(override.getPageCode(), PermissionMatrix.from(override));
        }
    }

    private void softDeleteCurrentRows(UUID accountId) {
        List<AccountPagePermission> currentRows =
                new ArrayList<>(accountPagePermissionRepository.findByAccountId(accountId));
        for (AccountPagePermission row : currentRows) {
            row.markDeleted(ACTOR);
        }
        accountPagePermissionRepository.saveAll(currentRows);
        accountPagePermissionRepository.flush();
    }

    private record PermissionMatrix(
            boolean view,
            boolean create,
            boolean update,
            boolean delete,
            boolean restore,
            boolean download,
            boolean print,
            String actorId) {

        static PermissionMatrix none() {
            return new PermissionMatrix(false, false, false, false, false, false, false, null);
        }

        static PermissionMatrix from(AccountPermissionOverride override) {
            return new PermissionMatrix(
                    override.isCanView(),
                    override.isCanCreate(),
                    override.isCanUpdate(),
                    override.isCanDelete(),
                    override.isCanRestore(),
                    override.isCanDownload(),
                    override.isCanPrint(),
                    override.getActorId());
        }

        PermissionMatrix or(GroupPagePermission permission) {
            return new PermissionMatrix(
                    view || permission.isCanView(),
                    create || permission.isCanCreate(),
                    update || permission.isCanUpdate(),
                    delete || permission.isCanDelete(),
                    restore || permission.isCanRestore(),
                    download || permission.isCanDownload(),
                    print || permission.isCanPrint(),
                    actorId != null ? actorId : permission.getActorId());
        }

        AccountPagePermission toAccountPagePermission(UUID accountId, String pageCode) {
            return AccountPagePermission.of(accountId, pageCode)
                    .setActions(view, create, update, delete, restore, download, print)
                    .setActorId(actorId);
        }
    }
}
