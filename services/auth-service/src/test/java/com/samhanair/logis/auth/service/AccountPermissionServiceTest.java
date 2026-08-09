package com.samhanair.logis.auth.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.BDDMockito.given;

import com.samhanair.logis.auth.domain.AccountPagePermission;
import com.samhanair.logis.auth.repository.AccountGroupRepository;
import com.samhanair.logis.auth.repository.AccountPermissionOverrideRepository;
import com.samhanair.logis.auth.repository.AccountPagePermissionRepository;
import com.samhanair.logis.auth.repository.AccountRepository;
import com.samhanair.logis.auth.repository.RolePagePermissionTemplateRepository;
import com.samhanair.logis.auth.repository.PermissionGroupRepository;
import com.samhanair.logis.auth.domain.AccountGroup;
import com.samhanair.logis.auth.domain.PermissionGroup;
import com.samhanair.logis.security.permission.PermissionAction;
import java.util.EnumSet;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

@ExtendWith(MockitoExtension.class)
class AccountPermissionServiceTest {

    @Mock
    private AccountPagePermissionRepository accountPermissionRepository;

    @Mock
    private AccountPermissionOverrideRepository overrideRepository;

    @Mock
    private RolePagePermissionTemplateRepository templateRepository;

    @Mock
    private AccountRepository accountRepository;

    /** C5-5: AccountPermissionService 생성자에 추가된 accountGroupRepository mock */
    @Mock
    private AccountGroupRepository accountGroupRepository;

    @Mock
    private PermissionGroupRepository permissionGroupRepository;

    @Mock
    private EffectivePermissionMaterializer materializer;

    @Test
    void checkReadsAccountPagePermission() {
        UUID accountId = UUID.fromString("a0000000-0000-0000-0000-000000000001");
        AccountPagePermission permission = AccountPagePermission.of(accountId, "accounting.journals")
                .grant(PermissionAction.CREATE);
        given(accountPermissionRepository.findByAccountIdAndPageCode(accountId, "accounting.journals"))
                .willReturn(Optional.of(permission));
        AccountPermissionService service = service();

        assertThat(service.check(accountId, "accounting.journals", PermissionAction.CREATE)).isTrue();
        assertThat(service.check(accountId, "accounting.journals", PermissionAction.DELETE)).isFalse();
    }

    @Test
    void bulkLoadReturnsGrantedActionsByPage() {
        UUID accountId = UUID.fromString("a0000000-0000-0000-0000-000000000001");
        AccountPagePermission permission = AccountPagePermission.of(accountId, "accounting.journals")
                .grant(PermissionAction.VIEW)
                .grant(PermissionAction.DOWNLOAD);
        given(accountPermissionRepository.findByAccountIdOrderByPageCodeAsc(accountId))
                .willReturn(List.of(permission));
        AccountPermissionService service = service();

        Map<String, EnumSet<PermissionAction>> result = service.bulkLoad(accountId);

        assertThat(result).containsEntry("accounting.journals",
                EnumSet.of(PermissionAction.VIEW, PermissionAction.DOWNLOAD));
    }

    @Test
    void checkAllowsEveryActionForSystemMasterWithoutMaterializedCacheRow() {
        UUID accountId = UUID.fromString("a0000000-0000-0000-0000-000000000002");
        UUID masterGroupId = UUID.fromString("00000000-0000-0000-0000-000000000100");
        AccountGroup membership = AccountGroup.assign(accountId, masterGroupId);
        PermissionGroup masterGroup = org.mockito.Mockito.mock(PermissionGroup.class);
        given(accountGroupRepository.findByAccountIdAndIsDeletedFalseOrderByGroupIdAsc(accountId))
                .willReturn(List.of(membership));
        given(permissionGroupRepository.findByIdAndIsDeletedFalse(masterGroupId))
                .willReturn(Optional.of(masterGroup));
        given(masterGroup.isSystemMaster()).willReturn(true);
        AccountPermissionService service = service();

        assertThat(service.check(accountId, "slip.closed-date-exception", PermissionAction.CREATE)).isTrue();
    }

    private AccountPermissionService service() {
        // C5-5: accountGroupRepository 파라미터 추가 (listAccounts role 파생용)
        return new AccountPermissionService(
                accountPermissionRepository,
                overrideRepository,
                templateRepository,
                accountRepository,
                accountGroupRepository,
                permissionGroupRepository,
                materializer);
    }
}
