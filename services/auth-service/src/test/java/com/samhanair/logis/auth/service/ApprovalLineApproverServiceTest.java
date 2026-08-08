package com.samhanair.logis.auth.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.samhanair.logis.approval.StepType;
import com.samhanair.logis.auth.domain.Account;
import com.samhanair.logis.auth.domain.ApprovalLineApprover;
import com.samhanair.logis.auth.domain.ApprovalLineConfig;
import com.samhanair.logis.auth.domain.ApproverType;
import com.samhanair.logis.auth.domain.PermissionGroup;
import com.samhanair.logis.auth.repository.AccountRepository;
import com.samhanair.logis.auth.repository.ApprovalLineApproverRepository;
import com.samhanair.logis.auth.repository.ApprovalLineConfigRepository;
import com.samhanair.logis.auth.repository.PermissionGroupRepository;
import java.lang.reflect.Field;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.domain.Pageable;

@ExtendWith(MockitoExtension.class)
class ApprovalLineApproverServiceTest {

    @Mock ApprovalLineConfigRepository roleRepository;
    @Mock ApprovalLineApproverRepository approverRepository;
    @Mock PermissionGroupRepository groupRepository;
    @Mock AccountRepository accountRepository;
    @InjectMocks ApprovalLineApproverService service;

    @Test
    void addApprover_GROUP_정상추가() {
        UUID roleId = UUID.randomUUID();
        UUID groupId = UUID.randomUUID();
        when(roleRepository.findById(roleId)).thenReturn(Optional.of(role(roleId, StepType.GROUP)));
        when(groupRepository.findByIdAndIsDeletedFalse(groupId)).thenReturn(Optional.of(PermissionGroup.create("창고원", null)));
        when(approverRepository.existsByConfigRoleIdAndApproverTypeAndApproverRefIdAndIsDeletedFalse(
                roleId, ApproverType.GROUP, groupId)).thenReturn(false);
        when(approverRepository.save(any())).thenAnswer(invocation -> invocation.getArgument(0));

        ApprovalLineApprover saved = service.addApprover(roleId, ApproverType.GROUP, groupId);

        assertThat(saved.getConfigRoleId()).isEqualTo(roleId);
        assertThat(saved.getApproverType()).isEqualTo(ApproverType.GROUP);
        assertThat(saved.getApproverRefId()).isEqualTo(groupId);
    }

    @Test
    void addApprover_USER_정상추가() {
        UUID roleId = UUID.randomUUID();
        UUID userId = UUID.randomUUID();
        when(roleRepository.findById(roleId)).thenReturn(Optional.of(role(roleId, StepType.GROUP)));
        when(accountRepository.findActiveById(userId)).thenReturn(Optional.of(account(userId, "홍길동", "물류팀")));
        when(approverRepository.save(any())).thenAnswer(invocation -> invocation.getArgument(0));

        ApprovalLineApprover saved = service.addApprover(roleId, ApproverType.USER, userId);

        assertThat(saved.getApproverType()).isEqualTo(ApproverType.USER);
        assertThat(saved.getApproverRefId()).isEqualTo(userId);
    }

    @Test
    void addApprover_중복은_거부한다() {
        UUID roleId = UUID.randomUUID();
        UUID groupId = UUID.randomUUID();
        when(roleRepository.findById(roleId)).thenReturn(Optional.of(role(roleId, StepType.GROUP)));
        when(groupRepository.findByIdAndIsDeletedFalse(groupId)).thenReturn(Optional.of(PermissionGroup.create("창고원", null)));
        when(approverRepository.existsByConfigRoleIdAndApproverTypeAndApproverRefIdAndIsDeletedFalse(
                roleId, ApproverType.GROUP, groupId)).thenReturn(true);

        assertThatThrownBy(() -> service.addApprover(roleId, ApproverType.GROUP, groupId))
                .hasMessageContaining("이미 지정된 결재자");
    }

    @Test
    void addApprover_systemMaster_GROUP은_거부한다() {
        UUID roleId = UUID.randomUUID();
        UUID groupId = UUID.randomUUID();
        when(roleRepository.findById(roleId)).thenReturn(Optional.of(role(roleId, StepType.GROUP)));
        when(groupRepository.findByIdAndIsDeletedFalse(groupId)).thenReturn(Optional.of(systemMasterGroup()));

        assertThatThrownBy(() -> service.addApprover(roleId, ApproverType.GROUP, groupId))
                .hasMessageContaining("시스템 마스터 그룹");
    }

    @Test
    void addApprover_systemMaster_USER는_거부한다() {
        UUID roleId = UUID.randomUUID();
        UUID userId = UUID.randomUUID();
        when(roleRepository.findById(roleId)).thenReturn(Optional.of(role(roleId, StepType.GROUP)));
        when(accountRepository.findActiveById(userId)).thenReturn(Optional.of(account(userId, "개발마스터", "대표실")));
        when(groupRepository.existsByAccountIdAndSystemMasterTrue(userId)).thenReturn(true);

        assertThatThrownBy(() -> service.addApprover(roleId, ApproverType.USER, userId))
                .hasMessageContaining("시스템 마스터 계정");
    }

    @Test
    void addApprover_미존재_USER는_거부한다() {
        UUID roleId = UUID.randomUUID();
        UUID userId = UUID.randomUUID();
        when(roleRepository.findById(roleId)).thenReturn(Optional.of(role(roleId, StepType.GROUP)));
        when(accountRepository.findActiveById(userId)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.addApprover(roleId, ApproverType.USER, userId))
                .hasMessageContaining("존재하지 않는 사원");
    }

    @Test
    void addApprover_CREATOR역할은_거부한다() {
        UUID roleId = UUID.randomUUID();
        when(roleRepository.findById(roleId)).thenReturn(Optional.of(role(roleId, StepType.CREATOR)));

        assertThatThrownBy(() -> service.addApprover(roleId, ApproverType.USER, UUID.randomUUID()))
                .hasMessageContaining("작성자 역할은 변경할 수 없습니다");
    }

    @Test
    void removeApprover_는_softDelete한다() {
        UUID roleId = UUID.randomUUID();
        UUID approverId = UUID.randomUUID();
        ApprovalLineApprover approver = ApprovalLineApprover.create(roleId, ApproverType.USER, UUID.randomUUID());
        when(roleRepository.findById(roleId)).thenReturn(Optional.of(role(roleId, StepType.GROUP)));
        when(approverRepository.findByIdAndIsDeletedFalse(approverId)).thenReturn(Optional.of(approver));

        service.removeApprover(roleId, approverId);

        assertThat(approver.getIsDeleted()).isTrue();
        assertThat(approver.getDeletedBy()).isEqualTo("approval-line-config");
    }

    @Test
    void searchUsers_는_표시명과_부서를_결합한다() {
        Account user = account(UUID.randomUUID(), "홍길동", "물류팀");
        when(accountRepository.searchActiveByDisplayName(any(), any(Pageable.class))).thenReturn(List.of(user));

        var result = service.searchUsers("홍", 20);

        assertThat(result).hasSize(1);
        assertThat(result.get(0).displayName()).isEqualTo("홍길동 (물류팀)");
        ArgumentCaptor<String> query = ArgumentCaptor.forClass(String.class);
        verify(accountRepository).searchActiveByDisplayName(query.capture(), any(Pageable.class));
        assertThat(query.getValue()).isEqualTo("홍");
    }

    @Test
    void searchUsers_는_LIKE_와일드카드를_리터럴로_전달한다() {
        when(accountRepository.searchActiveByDisplayName(any(), any(Pageable.class))).thenReturn(List.of());

        service.searchUsers(" %_\\ ", 20);

        ArgumentCaptor<String> query = ArgumentCaptor.forClass(String.class);
        verify(accountRepository).searchActiveByDisplayName(query.capture(), any(Pageable.class));
        assertThat(query.getValue()).isEqualTo("\\%\\_\\\\");
    }

    static ApprovalLineConfig role(UUID id, StepType type) {
        try {
            var ctor = ApprovalLineConfig.class.getDeclaredConstructor();
            ctor.setAccessible(true);
            ApprovalLineConfig role = ctor.newInstance();
            set(ApprovalLineConfig.class, role, "id", id);
            set(ApprovalLineConfig.class, role, "documentType", "SLIP_OUTBOUND");
            set(ApprovalLineConfig.class, role, "sequence", type == StepType.CREATOR ? 0 : 1);
            set(ApprovalLineConfig.class, role, "label", type == StepType.CREATOR ? "작성자" : "출고인");
            set(ApprovalLineConfig.class, role, "stepType", type);
            set(ApprovalLineConfig.class, role, "required", true);
            return role;
        } catch (Exception ex) {
            throw new RuntimeException(ex);
        }
    }

    static Account account(UUID id, String displayName, String departmentName) {
        try {
            Account account = Account.createWithId(id, "user-" + id, "{noop}pw", displayName);
            set(Account.class, account, "departmentName", departmentName);
            return account;
        } catch (Exception ex) {
            throw new RuntimeException(ex);
        }
    }

    static PermissionGroup systemMasterGroup() {
        try {
            PermissionGroup group = PermissionGroup.create("마스터", null);
            set(PermissionGroup.class, group, "systemMaster", true);
            return group;
        } catch (Exception ex) {
            throw new RuntimeException(ex);
        }
    }

    static void set(Class<?> type, Object target, String name, Object value) throws Exception {
        Field field = type.getDeclaredField(name);
        field.setAccessible(true);
        field.set(target, value);
    }
}
