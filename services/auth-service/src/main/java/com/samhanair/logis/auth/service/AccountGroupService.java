package com.samhanair.logis.auth.service;

import com.samhanair.logis.auth.domain.Account;
import com.samhanair.logis.auth.domain.AccountGroup;
import com.samhanair.logis.auth.domain.PermissionGroup;
import com.samhanair.logis.auth.repository.AccountGroupRepository;
import com.samhanair.logis.auth.repository.AccountRepository;
import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import java.util.Comparator;
import java.util.List;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** 계정과 권한그룹의 M:N 배속을 관리하고 effective 권한 재계산을 트리거한다. */
@Service
@RequiredArgsConstructor
public class AccountGroupService {

    private static final String ACTOR = "account-group-service";

    private final AccountRepository accountRepository;
    private final AccountGroupRepository accountGroupRepository;
    private final PermissionGroupService permissionGroupService;
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
        return accountGroupRepository.findByAccountIdAndIsDeletedFalse(accountId).stream()
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
        Account account = requireAccount(accountId);
        PermissionGroup group = permissionGroupService.requireGroup(groupId);
        rejectSystemGroupAssignment(group);
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
        requireAccount(accountId);
        permissionGroupService.requireGroup(groupId);
        accountGroupRepository.findByAccountIdAndGroupIdAndIsDeletedFalse(accountId, groupId)
                .ifPresent(accountGroup -> {
                    accountGroup.markDeleted(ACTOR);
                    accountGroupRepository.save(accountGroup);
                });
        materializer.materializeForAccount(accountId);
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
