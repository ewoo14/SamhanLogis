package com.samhanair.logis.user.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import com.samhanair.logis.common.security.Role;
import com.samhanair.logis.user.client.AuthClient;
import com.samhanair.logis.user.domain.Department;
import com.samhanair.logis.user.domain.Employee;
import com.samhanair.logis.user.repository.DepartmentRepository;
import com.samhanair.logis.user.repository.EmployeeRepository;
import com.samhanair.logis.user.repository.RoleChangeHistoryRepository;
import com.samhanair.logis.user.web.dto.CreateEmployeeRequest;
import com.samhanair.logis.user.web.dto.UpdateEmployeeRequest;
import java.time.LocalDate;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.test.util.ReflectionTestUtils;

@ExtendWith(MockitoExtension.class)
class EmployeeProvisioningServiceTest {

    @Mock
    private EmployeeRepository employeeRepository;

    @Mock
    private DepartmentRepository departmentRepository;

    @Mock
    private RoleChangeHistoryRepository roleHistoryRepository;

    @Mock
    private AuthClient authClient;

    @InjectMocks
    private EmployeeProvisioningService service;

    private Department salesTeam;
    private UUID departmentId;
    private UUID callerId;

    @BeforeEach
    void setUp() {
        salesTeam = Department.create("SALES_1", "영업1팀", 2);
        departmentId = UUID.randomUUID();
        ReflectionTestUtils.setField(salesTeam, "id", departmentId);
        callerId = UUID.randomUUID();
    }

    private CreateEmployeeRequest createRequest() {
        return new CreateEmployeeRequest(
                "obyeongseung", "test-provisioning-password", "오병승", "이사",
                Role.SALES, departmentId, true, LocalDate.of(2026, 1, 1), null, null);
    }

    @Test
    void create_callsAuthClient_thenPersistsEmployee_withSameUuid() {
        when(departmentRepository.findById(departmentId)).thenReturn(Optional.of(salesTeam));
        when(employeeRepository.save(any(Employee.class))).thenAnswer(inv -> inv.getArgument(0));

        service.create(createRequest(), callerId);

        ArgumentCaptor<UUID> authIdCaptor = ArgumentCaptor.forClass(UUID.class);
        verify(authClient).createAccount(authIdCaptor.capture(), eq("obyeongseung"),
                eq("test-provisioning-password"), eq("오병승"), eq(Role.SALES));

        ArgumentCaptor<Employee> employeeCaptor = ArgumentCaptor.forClass(Employee.class);
        verify(employeeRepository).save(employeeCaptor.capture());

        assertThat(employeeCaptor.getValue().getId()).isEqualTo(authIdCaptor.getValue());
        assertThat(employeeCaptor.getValue().getAccountId()).isEqualTo(authIdCaptor.getValue());
        assertThat(employeeCaptor.getValue().getDepartment()).isEqualTo(salesTeam);
    }

    @Test
    void create_authClientFails_throwsAndDoesNotPersistEmployee() {
        when(departmentRepository.findById(departmentId)).thenReturn(Optional.of(salesTeam));
        doThrow(new BusinessException(ErrorCode.CONFLICT, "이미 사용중인 아이디입니다"))
                .when(authClient).createAccount(any(), any(), any(), any(), any());

        assertThatThrownBy(() -> service.create(createRequest(), callerId))
                .isInstanceOf(BusinessException.class)
                .satisfies(ex -> assertThat(((BusinessException) ex).getErrorCode())
                        .isEqualTo(ErrorCode.CONFLICT));

        verify(employeeRepository, never()).save(any());
    }

    @Test
    void create_employeePersistFails_callsAuthClientDelete_compensation() {
        when(departmentRepository.findById(departmentId)).thenReturn(Optional.of(salesTeam));
        when(employeeRepository.save(any(Employee.class)))
                .thenThrow(new RuntimeException("DB down"));

        assertThatThrownBy(() -> service.create(createRequest(), callerId))
                .isInstanceOf(RuntimeException.class)
                .hasMessage("DB down");

        ArgumentCaptor<UUID> deleteCaptor = ArgumentCaptor.forClass(UUID.class);
        verify(authClient).delete(deleteCaptor.capture());
        // The id passed to delete must equal the id passed to createAccount.
        ArgumentCaptor<UUID> createCaptor = ArgumentCaptor.forClass(UUID.class);
        verify(authClient).createAccount(createCaptor.capture(), any(), any(), any(), any());
        assertThat(deleteCaptor.getValue()).isEqualTo(createCaptor.getValue());
    }

    @Test
    void create_duplicateLoginId_propagatesConflict() {
        when(departmentRepository.findById(departmentId)).thenReturn(Optional.of(salesTeam));
        doThrow(new BusinessException(ErrorCode.CONFLICT, "이미 사용중인 아이디입니다"))
                .when(authClient).createAccount(any(), any(), any(), any(), any());

        assertThatThrownBy(() -> service.create(createRequest(), callerId))
                .isInstanceOf(BusinessException.class)
                .satisfies(ex -> assertThat(((BusinessException) ex).getErrorCode())
                        .isEqualTo(ErrorCode.CONFLICT));
    }

    @Test
    void create_unknownDepartment_throwsNotFound_andSkipsAuthCall() {
        UUID badDept = UUID.randomUUID();
        when(departmentRepository.findById(badDept)).thenReturn(Optional.empty());

        var req = new CreateEmployeeRequest("x", "test-provisioning-password", "X", "사원",
                Role.SALES, badDept, false, LocalDate.now(), null, null);

        assertThatThrownBy(() -> service.create(req, callerId))
                .isInstanceOf(BusinessException.class)
                .satisfies(ex -> assertThat(((BusinessException) ex).getErrorCode())
                        .isEqualTo(ErrorCode.NOT_FOUND));

        verifyNoInteractions(authClient);
    }

    @Test
    void update_fullNameChanged_callsAuthDisplayNameSync() {
        Employee employee = anEmployee("기존이름");
        when(employeeRepository.findById(employee.getId())).thenReturn(Optional.of(employee));

        var req = new UpdateEmployeeRequest("새이름", null, null, null, null, null);
        service.update(employee.getId(), req, callerId);

        verify(authClient).updateDisplayName(employee.getId(), "새이름");
        assertThat(employee.getFullName()).isEqualTo("새이름");
    }

    @Test
    void update_fullNameUnchanged_doesNotCallAuth() {
        Employee employee = anEmployee("그대로");
        when(employeeRepository.findById(employee.getId())).thenReturn(Optional.of(employee));

        var req = new UpdateEmployeeRequest("그대로", "차장", null, null, null, null);
        service.update(employee.getId(), req, callerId);

        verify(authClient, never()).updateDisplayName(any(), any());
        assertThat(employee.getPosition()).isEqualTo("차장");
    }

    @Test
    void updateRole_callsAuthAndUpdatesSnapshot() {
        Employee employee = anEmployee("이성미");
        when(employeeRepository.findById(employee.getId())).thenReturn(Optional.of(employee));

        service.updateRole(employee.getId(), Role.MANAGER, callerId);

        assertThat(employee.getRoleSnapshot()).isEqualTo(Role.MANAGER);
        verify(authClient).updateRole(employee.getId(), Role.MANAGER);
    }

    @Test
    void terminate_setsDateAndMarksDeleted_andCallsAuthDisable() {
        Employee employee = anEmployee("퇴사예정");
        when(employeeRepository.findById(employee.getId())).thenReturn(Optional.of(employee));

        LocalDate when = LocalDate.of(2026, 6, 30);
        service.terminate(employee.getId(), when, callerId);

        assertThat(employee.getTerminationDate()).isEqualTo(when);
        assertThat(employee.getIsDeleted()).isTrue();
        verify(authClient).disable(employee.getId());
    }

    private Employee anEmployee(String fullName) {
        Employee employee = Employee.create(
                UUID.randomUUID(), "loginx", fullName, "사원",
                Role.SALES, salesTeam, false, LocalDate.of(2026, 1, 1), null, null);
        return employee;
    }
}
