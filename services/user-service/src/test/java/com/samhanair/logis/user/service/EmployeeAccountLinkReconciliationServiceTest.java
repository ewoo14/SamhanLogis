package com.samhanair.logis.user.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.when;

import com.samhanair.logis.common.security.Role;
import com.samhanair.logis.user.domain.Department;
import com.samhanair.logis.user.domain.Employee;
import com.samhanair.logis.user.domain.EmployeeAccountLink;
import com.samhanair.logis.user.domain.LinkStatus;
import com.samhanair.logis.user.client.AuthClient;
import com.samhanair.logis.user.repository.EmployeeAccountLinkRepository;
import com.samhanair.logis.user.repository.EmployeeRepository;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

@ExtendWith(MockitoExtension.class)
class EmployeeAccountLinkReconciliationServiceTest {

    @Mock
    private EmployeeRepository employeeRepository;

    @Mock
    private EmployeeAccountLinkRepository linkRepository;

    @Mock
    private AuthClient authClient;

    @Test
    void preview_plansBrokenEmployeeWhenEmployeeIdEqualsAccountIdButAuthReferenceExists() {
        UUID employeeId = UUID.randomUUID();
        UUID targetAccountId = UUID.randomUUID();
        Employee employee = Employee.create(employeeId, "gyeonjinseong", "견진성", "차장",
                Role.SALES, Department.create("SALES_3", "영업3팀", 3), false,
                LocalDate.of(2026, 1, 1), null, null);
        when(employeeRepository.findAllActiveByLoginIds(List.of("gyeonjinseong")))
                .thenReturn(List.of(employee));
        when(authClient.findActiveAccountIdByLoginId("gyeonjinseong"))
                .thenReturn(targetAccountId);
        when(linkRepository.saveAll(any())).thenAnswer(invocation -> invocation.getArgument(0));

        EmployeeAccountLinkReconciliationService service =
                new EmployeeAccountLinkReconciliationService(employeeRepository, linkRepository, authClient);

        var result = service.preview(List.of(new EmployeeAccountLinkReconciliationService.AccountCandidate(
                targetAccountId, "견진성", "gyeonjinseong")));

        assertThat(result.items()).hasSize(1);
    }

    @Test
    void previewThenApply_linksOnlyAfterPreview_andStoresBothMatchReasons() {
        UUID employeeId = UUID.randomUUID();
        UUID oldAccountId = UUID.randomUUID();
        UUID targetAccountId = UUID.randomUUID();
        Employee employee = Employee.create(employeeId, "gyeonjinseong", "견진성", "차장",
                Role.SALES, Department.create("SALES_3", "영업3팀", 3), false,
                LocalDate.of(2026, 1, 1), null, null);
        employee.linkToAccount(oldAccountId);
        when(employeeRepository.findAllActiveByLoginIds(List.of("gyeonjinseong")))
                .thenReturn(List.of(employee));
        when(authClient.findActiveAccountIdByLoginId("gyeonjinseong"))
                .thenReturn(targetAccountId, targetAccountId);
        when(linkRepository.saveAll(any())).thenAnswer(invocation -> invocation.getArgument(0));
        when(linkRepository.findByPlanKeyAndStatus(any(), any())).thenReturn(List.of());

        EmployeeAccountLinkReconciliationService service =
                new EmployeeAccountLinkReconciliationService(employeeRepository, linkRepository, authClient);
        var candidate = new EmployeeAccountLinkReconciliationService.AccountCandidate(
                targetAccountId, "견진성", "gyeonjinseong");

        var preview = service.preview(List.of(candidate));

        assertThat(preview.items()).hasSize(1);
        assertThat(preview.items().get(0).employeeName()).isEqualTo("견진성");
        assertThat(preview.items().get(0).matchReason())
                .contains("full_name exact", "login_id exact");
        assertThat(employee.getAccountId()).isEqualTo(oldAccountId);

        when(linkRepository.findByPlanKeyAndStatus(preview.planKey(), LinkStatus.PLANNED))
                .thenReturn(List.of(new EmployeeAccountLink(employee, preview.planKey(),
                        oldAccountId, targetAccountId, "full_name exact; login_id exact")));
        when(employeeRepository.findById(employeeId)).thenReturn(Optional.of(employee));

        service.apply(preview.planKey());

        assertThat(employee.getAccountId()).isEqualTo(targetAccountId);
        verify(linkRepository, times(2)).saveAll(any());
    }

    @Test
    void preview_doesNotPlanWhenCandidateIsNotUnique() {
        Employee employee = Employee.create(UUID.randomUUID(), "same-login", "동일후보", "사원",
                Role.SALES, Department.create("SALES", "영업팀", 1), false,
                LocalDate.of(2026, 1, 1), null, null);
        when(employeeRepository.findAllActiveByLoginIds(List.of("same-login")))
                .thenReturn(List.of(employee));
        when(linkRepository.saveAll(any())).thenAnswer(invocation -> invocation.getArgument(0));
        EmployeeAccountLinkReconciliationService service =
                new EmployeeAccountLinkReconciliationService(employeeRepository, linkRepository, authClient);

        var result = service.preview(List.of(
                new EmployeeAccountLinkReconciliationService.AccountCandidate(
                        UUID.randomUUID(), "동일후보", "same-login"),
                new EmployeeAccountLinkReconciliationService.AccountCandidate(
                        UUID.randomUUID(), "동일후보", "same-login")));

        assertThat(result.items()).isEmpty();
    }

    @Test
    void preview_doesNotPlanAlreadyNormalEmployee() {
        UUID employeeId = UUID.randomUUID();
        Employee employee = Employee.create(employeeId, "normal", "정상직원", "사원",
                Role.SALES, Department.create("SALES", "영업팀", 1), false,
                LocalDate.of(2026, 1, 1), null, null);
        when(employeeRepository.findAllActiveByLoginIds(List.of("normal")))
                .thenReturn(List.of(employee));
        when(authClient.findActiveAccountIdByLoginId("normal")).thenReturn(employeeId);
        when(linkRepository.saveAll(any())).thenAnswer(invocation -> invocation.getArgument(0));
        EmployeeAccountLinkReconciliationService service =
                new EmployeeAccountLinkReconciliationService(employeeRepository, linkRepository, authClient);

        var result = service.preview(List.of(
                new EmployeeAccountLinkReconciliationService.AccountCandidate(
                        employeeId, "정상직원", "normal")));

        assertThat(result.items()).isEmpty();
        assertThat(employee.getAccountId()).isEqualTo(employeeId);
    }

    @Test
    void apply_stopsWhenAuthReferenceChangedAfterPreview() {
        UUID employeeId = UUID.randomUUID();
        UUID oldAccountId = UUID.randomUUID();
        UUID targetAccountId = UUID.randomUUID();
        UUID changedAccountId = UUID.randomUUID();
        Employee employee = Employee.create(employeeId, "changed-auth", "변경검증", "사원",
                Role.SALES, Department.create("SALES", "영업팀", 1), false,
                LocalDate.of(2026, 1, 1), null, null);
        employee.linkToAccount(oldAccountId);
        EmployeeAccountLink plan = new EmployeeAccountLink(employee, "EAL-plan",
                oldAccountId, targetAccountId, "full_name exact; login_id exact");
        when(linkRepository.findByPlanKeyAndStatus("EAL-plan", LinkStatus.PLANNED))
                .thenReturn(List.of(plan));
        when(employeeRepository.findById(employeeId)).thenReturn(Optional.of(employee));
        when(authClient.findActiveAccountIdByLoginId("changed-auth")).thenReturn(changedAccountId);

        EmployeeAccountLinkReconciliationService service =
                new EmployeeAccountLinkReconciliationService(employeeRepository, linkRepository, authClient);

        assertThatThrownBy(() -> service.apply("EAL-plan"))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("auth 계정이 변경");
        assertThat(employee.getAccountId()).isEqualTo(oldAccountId);
    }
}
