package com.samhanair.logis.auth.service;

import com.samhanair.logis.auth.domain.Account;
import com.samhanair.logis.auth.domain.AccountGroup;
import com.samhanair.logis.auth.domain.PageCode;
import com.samhanair.logis.auth.domain.PermissionGroup;
import com.samhanair.logis.auth.repository.AccountGroupRepository;
import com.samhanair.logis.auth.repository.AccountRepository;
import com.samhanair.logis.auth.repository.GroupPagePermissionRepository;
import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import com.samhanair.logis.common.security.Role;
import java.util.Comparator;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** 계정과 권한그룹의 M:N 배속을 관리하고 effective 권한 재계산을 트리거한다. */
@Slf4j
@Service
@RequiredArgsConstructor
public class AccountGroupService {

    private static final String ACTOR = "account-group-service";

    private final AccountRepository accountRepository;
    private final AccountGroupRepository accountGroupRepository;
    private final PermissionGroupService permissionGroupService;
    private final GroupPagePermissionRepository groupPagePermissionRepository;
    private final EffectivePermissionMaterializer materializer;

    /**
     * 계정의 현재 권한그룹 배속 목록을 조회한다.
     *
     * @param accountId 계정 UUID
     * @return 계정 표시명과 그룹 표시명을 포함한 배속 목록
     */
    @Transactional(readOnly = true)
    public List<AccountGroupSummary> getGroups(UUID accountId) {
        Account account = requireAccount(accountId);
        return accountGroupRepository.findByAccountIdAndIsDeletedFalseOrderByGroupIdAsc(accountId).stream()
                .map(accountGroup -> toSummary(account, permissionGroupService.requireGroup(accountGroup.getGroupId())))
                .sorted(Comparator.comparing(AccountGroupSummary::groupName))
                .toList();
    }

    /**
     * 계정을 권한그룹에 배속한다. 이미 배속된 경우에도 성공으로 처리한다.
     *
     * @param accountId 계정 UUID
     * @param groupId   권한그룹 UUID
     * @return 배속 결과 요약
     */
    @Transactional
    public AccountGroupSummary assign(UUID accountId, UUID groupId) {
        return assign(accountId, groupId, null);
    }

    /**
     * 계정을 권한그룹에 배속한다.
     *
     * <p>관리 page-code 를 가진 그룹은 배속만으로 관리권한이 상속되므로 MASTER 만 배속할 수 있다.
     *
     * <p>C5-4 actor 전환: {@code isSystemMaster} 는 X-Is-System-Master 헤더 유래.
     * 헤더 부재/false → 비MASTER 로 판정 — fail-secure.
     *
     * @param accountId      계정 UUID
     * @param groupId        권한그룹 UUID
     * @param isSystemMaster X-Is-System-Master 헤더 값 ("true" = MASTER)
     * @return 배속 결과 요약
     */
    @Transactional
    public AccountGroupSummary assign(UUID accountId, UUID groupId, String isSystemMaster) {
        Account account = requireAccount(accountId);
        PermissionGroup group = permissionGroupService.requireGroup(groupId);
        rejectSystemGroupAssignment(group);
        rejectManagementGroupAssignment(groupId, isSystemMaster);
        accountGroupRepository.findByAccountIdAndGroupIdAndIsDeletedFalse(accountId, groupId)
                .orElseGet(() -> accountGroupRepository.save(AccountGroup.assign(accountId, groupId)));
        materializer.materializeForAccount(accountId);
        return toSummary(account, group);
    }

    /**
     * 계정의 권한그룹 배속을 해제한다. 미배속 상태면 재계산만 수행하고 성공으로 처리한다.
     *
     * @param accountId 계정 UUID
     * @param groupId   권한그룹 UUID
     */
    @Transactional
    public void unassign(UUID accountId, UUID groupId) {
        unassign(accountId, groupId, null);
    }

    /**
     * 계정의 권한그룹 배속을 해제한다.
     *
     * <p>관리 page-code 보유 그룹의 멤버십 변경은 재위임/자기상승 방지 정책에 따라 MASTER 만 수행한다.
     *
     * <p>C5-4 actor 전환: {@code isSystemMaster} 는 X-Is-System-Master 헤더 유래.
     *
     * @param accountId      계정 UUID
     * @param groupId        권한그룹 UUID
     * @param isSystemMaster X-Is-System-Master 헤더 값 ("true" = MASTER)
     */
    @Transactional
    public void unassign(UUID accountId, UUID groupId, String isSystemMaster) {
        requireAccount(accountId);
        permissionGroupService.requireGroup(groupId);
        rejectManagementGroupAssignment(groupId, isSystemMaster);
        accountGroupRepository.findByAccountIdAndGroupIdAndIsDeletedFalse(accountId, groupId)
                .ifPresent(accountGroup -> {
                    accountGroup.markDeleted(ACTOR);
                    accountGroupRepository.save(accountGroup);
                });
        materializer.materializeForAccount(accountId);
    }

    /**
     * 역할 변경 시 빌트인 role-group 을 원자적으로 교체한다 (내부 전용 경로).
     *
     * <p>시스템 빌트인 그룹({@code isBuiltin=true} 또는 {@code isSystemMaster=true}) 은
     * 공개 {@link #assign}/{@link #unassign} 경로에서 가드로 차단되므로,
     * role 변경 시 이 내부 메서드를 통해 가드를 우회해 직접 교체한다.
     *
     * <ol>
     *   <li>계정의 현재 활성 배속 중 {@link BuiltinRoleGroupIds} 에 속하는 <b>모든</b> 빌트인 그룹 배속을
     *       soft-delete한다. (단일 빌트인 그룹 정리의 P1-a 결함 수정: oldRole 단독 역산 대신 전체 정리)</li>
     *   <li>새 role 의 빌트인 그룹 배속 행이 없으면 생성, 있으면 유지.</li>
     * </ol>
     *
     * <p>수동으로 배속된 비-빌트인 그룹은 건드리지 않는다 (보존).
     * materializer 재계산은 호출자(AuthService)가 담당한다.
     *
     * <p>정상 운영(단일 빌트인 그룹 배속)에서는 기존 동작과 동일하다.
     * 이례적으로 빌트인 그룹이 2개+ 활성이었던 경우에도 모두 정리한 뒤 newRole 그룹 단일 배속으로 복원된다.
     *
     * @param accountId 대상 계정 UUID
     * @param oldRole   변경 전 역할 (참조용, 더 이상 정리 범위를 결정하지 않음)
     * @param newRole   변경 후 역할
     */
    @Transactional
    public void syncBuiltinRoleGroup(UUID accountId, Role oldRole, Role newRole) {
        log.debug("[syncBuiltinRoleGroup] accountId={} oldRole={} newRole={}", accountId, oldRole, newRole);

        // 1. 계정의 활성 배속 중 BuiltinRoleGroupIds 에 속하는 모든 빌트인 그룹을 일괄 soft-delete.
        //    P1-a 수정: oldRole 역산 단일 그룹 정리가 아닌 전체 빌트인 그룹 정리로 강화.
        //    이례적으로 빌트인 그룹이 2개+ 활성이더라도 모두 정리하여 stale 권한 잔존을 방지한다.
        Set<UUID> allBuiltinGroupIds = BuiltinRoleGroupIds.BUILTIN_ROLE_GROUP_IDS.values()
                .stream()
                .collect(Collectors.toUnmodifiableSet());
        List<AccountGroup> activeGroups =
                accountGroupRepository.findByAccountIdAndIsDeletedFalseOrderByGroupIdAsc(accountId);
        for (AccountGroup ag : activeGroups) {
            if (allBuiltinGroupIds.contains(ag.getGroupId())) {
                log.debug("[syncBuiltinRoleGroup] soft-deleting stale builtin group={} for account={}",
                        ag.getGroupId(), accountId);
                ag.markDeleted(ACTOR);
                accountGroupRepository.save(ag);
            }
        }

        // 2. 새 role 의 빌트인 그룹 배속 (없으면 생성, 있으면 유지)
        Optional<UUID> newGroupId = BuiltinRoleGroupIds.of(newRole);
        newGroupId.ifPresent(groupId -> {
            log.debug("[syncBuiltinRoleGroup] assigning new group={} for account={}", groupId, accountId);
            // 방금 soft-delete 한 행이 flush 전에 캐시에 있을 수 있으므로 is_deleted=false 조건으로 재조회.
            AccountGroup existing = accountGroupRepository
                    .findByAccountIdAndGroupIdAndIsDeletedFalse(accountId, groupId)
                    .orElse(null);
            if (existing == null) {
                AccountGroup saved = accountGroupRepository.save(AccountGroup.assign(accountId, groupId));
                log.debug("[syncBuiltinRoleGroup] created new group assignment id={}", saved.getId());
            } else {
                log.debug("[syncBuiltinRoleGroup] group already assigned id={}", existing.getId());
            }
        });
    }

    private Account requireAccount(UUID accountId) {
        if (accountId == null) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "계정 ID는 필수입니다.");
        }
        return accountRepository.findById(accountId)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "계정을 찾을 수 없습니다."));
    }

    /** 시스템/빌트인 권한그룹은 role 변경 경로로만 부여되도록 직접 배속을 차단한다. */
    private void rejectSystemGroupAssignment(PermissionGroup group) {
        if (group.isBuiltin() || group.isSystemMaster()) {
            throw new BusinessException(ErrorCode.CONFLICT, "시스템 권한그룹에는 계정을 직접 배속할 수 없습니다.");
        }
    }

    /**
     * 관리 page-code 를 보유한 그룹의 배속 변경은 MASTER 전용으로 제한한다.
     *
     * <p>C5-4: {@code isSystemMaster} 는 X-Is-System-Master 헤더 유래.
     */
    private void rejectManagementGroupAssignment(UUID groupId, String isSystemMaster) {
        boolean hasManagementPageCode = groupPagePermissionRepository.findByGroupIdAndIsDeletedFalse(groupId).stream()
                .anyMatch(permission -> PageCode.isManagementPageCode(permission.getPageCode()));
        if (hasManagementPageCode && !ManagementPageMutationGuard.isSystemMaster(isSystemMaster)) {
            throw new BusinessException(
                    ErrorCode.FORBIDDEN,
                    "관리권한 page-code 보유 그룹의 배속 변경은 MASTER 만 수행할 수 있습니다.");
        }
    }

    private AccountGroupSummary toSummary(Account account, PermissionGroup group) {
        return new AccountGroupSummary(
                account.getId(),
                account.getDisplayName(),
                group.getId(),
                group.getName(),
                group.getDescription(),
                group.isBuiltin(),
                group.isSystemMaster());
    }

    /** 계정-권한그룹 배속 응답 DTO. */
    public record AccountGroupSummary(
            UUID accountId,
            String accountDisplayName,
            UUID groupId,
            String groupName,
            String groupDescription,
            boolean groupBuiltin,
            boolean groupSystemMaster) {
    }
}
