package com.samhanair.logis.arologis.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.samhanair.logis.arologis.domain.ArologisDepartment;
import com.samhanair.logis.arologis.domain.ArologisEmployee;
import com.samhanair.logis.arologis.domain.ArologisRoleChangeHistory;
import com.samhanair.logis.arologis.domain.auth.AdminUser;
import com.samhanair.logis.arologis.domain.auth.AdminUserRole;
import com.samhanair.logis.arologis.repository.AdminUserRepository;
import com.samhanair.logis.arologis.repository.ArologisDepartmentRepository;
import com.samhanair.logis.arologis.repository.ArologisEmployeeRepository;
import com.samhanair.logis.arologis.repository.ArologisRoleChangeHistoryRepository;
import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.util.ReflectionTestUtils;

/**
 * 아로로지스 HR 직원 서비스 단위 검증.
 *
 * <p>직원 생성은 AdminUser provisioning 과 1:1로 묶이며, 응답에는 UUID 대신 loginId/부서명만
 * 노출되어야 한다.
 */
@ExtendWith(MockitoExtension.class)
class ArologisEmployeeServiceTest {

    @Mock private ArologisEmployeeRepository employeeRepository;
    @Mock private ArologisDepartmentRepository departmentRepository;
    @Mock private ArologisRoleChangeHistoryRepository historyRepository;
    @Mock private AdminUserRepository adminUserRepository;

    private final PasswordEncoder passwordEncoder = new BCryptPasswordEncoder(10);
    private ArologisEmployeeService service;

    @BeforeEach
    void setUp() {
        service = new ArologisEmployeeService(
                employeeRepository, departmentRepository, historyRepository, adminUserRepository, passwordEncoder);
    }

    @Test
    void createEmployee_provisionsAdminUserAndReturnsPlainTemporaryPasswordOnce() {
        ArologisDepartment department = ArologisDepartment.create("DISPATCH", "배차", 20);
        when(adminUserRepository.findByLoginIdAndIsDeletedFalse("hr-kim")).thenReturn(Optional.empty());
        when(employeeRepository.findByLoginIdAndIsDeletedFalse("hr-kim")).thenReturn(Optional.empty());
        when(departmentRepository.findByCodeAndIsDeletedFalse("DISPATCH")).thenReturn(Optional.of(department));
        when(adminUserRepository.findById(UUID.fromString("00000000-0000-0000-0000-000000000901")))
                .thenReturn(Optional.of(AdminUser.create(
                        "master-admin", "$2a$10$hash", "마스터", AdminUserRole.AROLOGIS_MASTER)));
        when(adminUserRepository.saveAndFlush(any(AdminUser.class))).thenAnswer(inv -> inv.getArgument(0));
        when(employeeRepository.saveAndFlush(any(ArologisEmployee.class))).thenAnswer(inv -> {
            ArologisEmployee employee = inv.getArgument(0);
            ReflectionTestUtils.setField(employee, "id", UUID.fromString("00000000-0000-0000-0000-000000000702"));
            return employee;
        });
        when(historyRepository.save(any(ArologisRoleChangeHistory.class))).thenAnswer(inv -> inv.getArgument(0));

        ArologisEmployeeService.ProvisionedEmployee result = service.createEmployee(
                new ArologisEmployeeService.CreateEmployeeCommand(
                        "hr-kim", "김인사", "대리", "DISPATCH", LocalDate.of(2026, 6, 8),
                        "hr-kim@example.com", "010-1111-2222", AdminUserRole.AROLOGIS_MANAGER),
                "00000000-0000-0000-0000-000000000901",
                "AROLOGIS_MASTER");

        ArgumentCaptor<AdminUser> adminCaptor = ArgumentCaptor.forClass(AdminUser.class);
        ArgumentCaptor<ArologisEmployee> employeeCaptor = ArgumentCaptor.forClass(ArologisEmployee.class);
        ArgumentCaptor<ArologisRoleChangeHistory> historyCaptor =
                ArgumentCaptor.forClass(ArologisRoleChangeHistory.class);
        verify(adminUserRepository).saveAndFlush(adminCaptor.capture());
        verify(employeeRepository).saveAndFlush(employeeCaptor.capture());
        verify(historyRepository).save(historyCaptor.capture());

        assertThat(result.employee().loginId()).isEqualTo("hr-kim");
        assertThat(result.employee().departmentName()).isEqualTo("배차");
        assertThat(result.temporaryPassword()).isNotBlank();
        assertThat(passwordEncoder.matches(result.temporaryPassword(), adminCaptor.getValue().getPasswordHash())).isTrue();
        assertThat(adminCaptor.getValue().getRole()).isEqualTo(AdminUserRole.AROLOGIS_MANAGER);
        assertThat(employeeCaptor.getValue().getAdminUser()).isSameAs(adminCaptor.getValue());
        assertThat(historyCaptor.getValue().getChangedByLoginId()).isEqualTo("master-admin");
    }

    @Test
    void createEmployee_rejectsDuplicateActiveLoginId() {
        AdminUser existing = AdminUser.create("hr-kim", "$2a$10$hash", "기존", AdminUserRole.AROLOGIS_MANAGER);
        when(adminUserRepository.findByLoginIdAndIsDeletedFalse("hr-kim")).thenReturn(Optional.of(existing));

        assertThatThrownBy(() -> service.createEmployee(
                new ArologisEmployeeService.CreateEmployeeCommand(
                        "hr-kim", "김인사", "대리", "DISPATCH", LocalDate.of(2026, 6, 8),
                        null, null, AdminUserRole.AROLOGIS_MANAGER),
                "tester",
                "AROLOGIS_MASTER"))
                .isInstanceOf(BusinessException.class)
                .extracting(ex -> ((BusinessException) ex).getErrorCode())
                .isEqualTo(ErrorCode.CONFLICT);
    }

    @Test
    void createEmployee_rejectsMasterProvisioningByManagerActorRole() {
        assertThatThrownBy(() -> service.createEmployee(
                new ArologisEmployeeService.CreateEmployeeCommand(
                        "hr-master", "마스터대상", "팀장", "DISPATCH", LocalDate.of(2026, 6, 8),
                        null, null, AdminUserRole.AROLOGIS_MASTER),
                "manager-actor",
                "AROLOGIS_MANAGER"))
                .isInstanceOf(BusinessException.class)
                .hasMessage("AROLOGIS_MASTER 권한 부여는 마스터만 가능합니다")
                .extracting(ex -> ((BusinessException) ex).getErrorCode())
                .isEqualTo(ErrorCode.FORBIDDEN);

        verify(adminUserRepository, never()).saveAndFlush(any());
        verify(employeeRepository, never()).saveAndFlush(any());
        verify(historyRepository, never()).save(any());
    }

    @Test
    void createEmployee_allowsMasterProvisioningByMasterActorRole() {
        ArologisDepartment department = ArologisDepartment.create("DISPATCH", "배차", 20);
        when(adminUserRepository.findByLoginIdAndIsDeletedFalse("hr-master")).thenReturn(Optional.empty());
        when(employeeRepository.findByLoginIdAndIsDeletedFalse("hr-master")).thenReturn(Optional.empty());
        when(departmentRepository.findByCodeAndIsDeletedFalse("DISPATCH")).thenReturn(Optional.of(department));
        when(adminUserRepository.saveAndFlush(any(AdminUser.class))).thenAnswer(inv -> inv.getArgument(0));
        when(employeeRepository.saveAndFlush(any(ArologisEmployee.class))).thenAnswer(inv -> {
            ArologisEmployee employee = inv.getArgument(0);
            ReflectionTestUtils.setField(employee, "id", UUID.fromString("00000000-0000-0000-0000-000000000703"));
            return employee;
        });

        ArologisEmployeeService.ProvisionedEmployee result = service.createEmployee(
                new ArologisEmployeeService.CreateEmployeeCommand(
                        "hr-master", "마스터대상", "팀장", "DISPATCH", LocalDate.of(2026, 6, 8),
                        null, null, AdminUserRole.AROLOGIS_MASTER),
                "master-actor",
                "AROLOGIS_MASTER");

        assertThat(result.employee().role()).isEqualTo(AdminUserRole.AROLOGIS_MASTER);
    }

    @Test
    void createEmployee_convertsLoginIdUniqueRaceToConflict() {
        ArologisDepartment department = ArologisDepartment.create("DISPATCH", "배차", 20);
        when(adminUserRepository.findByLoginIdAndIsDeletedFalse("hr-race")).thenReturn(Optional.empty());
        when(employeeRepository.findByLoginIdAndIsDeletedFalse("hr-race")).thenReturn(Optional.empty());
        when(departmentRepository.findByCodeAndIsDeletedFalse("DISPATCH")).thenReturn(Optional.of(department));
        when(adminUserRepository.saveAndFlush(any(AdminUser.class))).thenAnswer(inv -> inv.getArgument(0));
        when(employeeRepository.saveAndFlush(any(ArologisEmployee.class)))
                .thenThrow(new DataIntegrityViolationException("ux_arologis_employee_login_id_active"));

        assertThatThrownBy(() -> service.createEmployee(
                new ArologisEmployeeService.CreateEmployeeCommand(
                        "hr-race", "김경합", "대리", "DISPATCH", LocalDate.of(2026, 6, 8),
                        null, null, AdminUserRole.AROLOGIS_MANAGER),
                "tester",
                "AROLOGIS_MASTER"))
                .isInstanceOf(BusinessException.class)
                .extracting(ex -> ((BusinessException) ex).getErrorCode())
                .isEqualTo(ErrorCode.CONFLICT);
    }

    @Test
    void createEmployee_convertsAdminUserIdUniqueRaceToConflict() {
        ArologisDepartment department = ArologisDepartment.create("DISPATCH", "배차", 20);
        when(adminUserRepository.findByLoginIdAndIsDeletedFalse("hr-admin-race")).thenReturn(Optional.empty());
        when(employeeRepository.findByLoginIdAndIsDeletedFalse("hr-admin-race")).thenReturn(Optional.empty());
        when(departmentRepository.findByCodeAndIsDeletedFalse("DISPATCH")).thenReturn(Optional.of(department));
        when(adminUserRepository.saveAndFlush(any(AdminUser.class))).thenAnswer(inv -> inv.getArgument(0));
        when(employeeRepository.saveAndFlush(any(ArologisEmployee.class)))
                .thenThrow(new DataIntegrityViolationException("ux_arologis_employee_admin_user_active"));

        assertThatThrownBy(() -> service.createEmployee(
                new ArologisEmployeeService.CreateEmployeeCommand(
                        "hr-admin-race", "김경합", "대리", "DISPATCH", LocalDate.of(2026, 6, 8),
                        null, null, AdminUserRole.AROLOGIS_MANAGER),
                "tester",
                "AROLOGIS_MASTER"))
                .isInstanceOf(BusinessException.class)
                .hasMessage("이미 사용 중인 로그인 ID입니다.")
                .extracting(ex -> ((BusinessException) ex).getErrorCode())
                .isEqualTo(ErrorCode.CONFLICT);
    }

    @Test
    void createEmployee_propagatesNonLoginIntegrityViolation() {
        ArologisDepartment department = ArologisDepartment.create("DISPATCH", "배차", 20);
        DataIntegrityViolationException violation =
                new DataIntegrityViolationException("arologis_employee_full_name_not_null");
        when(adminUserRepository.findByLoginIdAndIsDeletedFalse("hr-integrity")).thenReturn(Optional.empty());
        when(employeeRepository.findByLoginIdAndIsDeletedFalse("hr-integrity")).thenReturn(Optional.empty());
        when(departmentRepository.findByCodeAndIsDeletedFalse("DISPATCH")).thenReturn(Optional.of(department));
        when(adminUserRepository.saveAndFlush(any(AdminUser.class))).thenAnswer(inv -> inv.getArgument(0));
        when(employeeRepository.saveAndFlush(any(ArologisEmployee.class))).thenThrow(violation);

        assertThatThrownBy(() -> service.createEmployee(
                new ArologisEmployeeService.CreateEmployeeCommand(
                        "hr-integrity", "김무결성", "대리", "DISPATCH", LocalDate.of(2026, 6, 8),
                        null, null, AdminUserRole.AROLOGIS_MANAGER),
                "tester",
                "AROLOGIS_MASTER"))
                .isSameAs(violation);
    }

    @Test
    void changeRole_updatesAdminUserAndAppendsHistory() {
        ArologisEmployee employee = employee("hr-lee", AdminUserRole.AROLOGIS_MANAGER);
        when(employeeRepository.findByLoginIdAndIsDeletedFalse("hr-lee")).thenReturn(Optional.of(employee));
        when(adminUserRepository.findById(UUID.fromString("00000000-0000-0000-0000-000000000901")))
                .thenReturn(Optional.of(AdminUser.create(
                        "master-admin", "$2a$10$hash", "마스터", AdminUserRole.AROLOGIS_MASTER)));
        when(historyRepository.save(any(ArologisRoleChangeHistory.class))).thenAnswer(inv -> inv.getArgument(0));

        service.changeRole(
                "hr-lee",
                AdminUserRole.AROLOGIS_MASTER,
                "승급",
                "00000000-0000-0000-0000-000000000901",
                "AROLOGIS_MASTER");

        ArgumentCaptor<ArologisRoleChangeHistory> historyCaptor =
                ArgumentCaptor.forClass(ArologisRoleChangeHistory.class);
        verify(historyRepository).save(historyCaptor.capture());
        assertThat(employee.getAdminUser().getRole()).isEqualTo(AdminUserRole.AROLOGIS_MASTER);
        assertThat(historyCaptor.getValue().getPreviousRole()).isEqualTo(AdminUserRole.AROLOGIS_MANAGER);
        assertThat(historyCaptor.getValue().getNewRole()).isEqualTo(AdminUserRole.AROLOGIS_MASTER);
        assertThat(historyCaptor.getValue().getReason()).isEqualTo("승급");
        assertThat(historyCaptor.getValue().getChangedByLoginId()).isEqualTo("master-admin");
    }

    @Test
    void changeRole_rejectsMissingEmployeeWithNotFound() {
        when(employeeRepository.findByLoginIdAndIsDeletedFalse("missing")).thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.changeRole(
                "missing", AdminUserRole.AROLOGIS_MASTER, "승급", "tester", "AROLOGIS_MASTER"))
                .isInstanceOf(BusinessException.class)
                .extracting(ex -> ((BusinessException) ex).getErrorCode())
                .isEqualTo(ErrorCode.NOT_FOUND);
    }

    @Test
    void changeRole_rejectsMasterPromotionByManagerActorRole() {
        ArologisEmployee employee = employee("hr-lee", AdminUserRole.AROLOGIS_MANAGER);

        assertThatThrownBy(() -> service.changeRole(
                "hr-lee", AdminUserRole.AROLOGIS_MASTER, "승급", "manager-actor", "AROLOGIS_MANAGER"))
                .isInstanceOf(BusinessException.class)
                .hasMessage("AROLOGIS_MASTER 권한 부여는 마스터만 가능합니다")
                .extracting(ex -> ((BusinessException) ex).getErrorCode())
                .isEqualTo(ErrorCode.FORBIDDEN);

        verify(historyRepository, never()).save(any());
        assertThat(employee.getAdminUser().getRole()).isEqualTo(AdminUserRole.AROLOGIS_MANAGER);
    }

    @Test
    void changeRole_sameRoleIsIdempotentWithoutHistory() {
        ArologisEmployee employee = employee("hr-lee", AdminUserRole.AROLOGIS_MANAGER);
        when(employeeRepository.findByLoginIdAndIsDeletedFalse("hr-lee")).thenReturn(Optional.of(employee));

        service.changeRole("hr-lee", AdminUserRole.AROLOGIS_MANAGER, "동일", "tester", "AROLOGIS_MANAGER");

        verify(historyRepository, never()).save(any());
        assertThat(employee.getAdminUser().getRole()).isEqualTo(AdminUserRole.AROLOGIS_MANAGER);
    }

    @Test
    void terminateEmployee_setsTerminationDateAndSoftDeletesEmployeeAndAdminUser() {
        ArologisEmployee employee = employee("hr-lee", AdminUserRole.AROLOGIS_MANAGER);
        when(employeeRepository.findByLoginIdAndIsDeletedFalse("hr-lee")).thenReturn(Optional.of(employee));

        service.terminate("hr-lee", LocalDate.of(2026, 6, 30), "tester");

        assertThat(employee.getTerminationDate()).isEqualTo(LocalDate.of(2026, 6, 30));
        assertThat(employee.getIsDeleted()).isTrue();
        assertThat(employee.getAdminUser().getIsDeleted()).isTrue();
    }

    @Test
    void terminateEmployee_rejectsTerminationDateBeforeHireDate() {
        ArologisEmployee employee = employee("hr-lee", AdminUserRole.AROLOGIS_MANAGER);
        when(employeeRepository.findByLoginIdAndIsDeletedFalse("hr-lee")).thenReturn(Optional.of(employee));

        assertThatThrownBy(() -> service.terminate("hr-lee", LocalDate.of(2026, 6, 7), "tester"))
                .isInstanceOf(BusinessException.class)
                .extracting(ex -> ((BusinessException) ex).getErrorCode())
                .isEqualTo(ErrorCode.CONFLICT);
    }

    @Test
    void roleHistoryView_exposesChangedByLoginIdInsteadOfCreatedByUuid() {
        ArologisRoleChangeHistory history = ArologisRoleChangeHistory.record(
                UUID.fromString("00000000-0000-0000-0000-000000000701"),
                AdminUserRole.AROLOGIS_MANAGER,
                AdminUserRole.AROLOGIS_MASTER,
                "승급",
                "master-admin");
        ReflectionTestUtils.setField(history, "createdBy", "00000000-0000-0000-0000-000000000901");
        ReflectionTestUtils.setField(history, "createdAt", LocalDateTime.of(2026, 6, 8, 10, 0));

        ArologisEmployeeService.RoleHistoryView view = ArologisEmployeeService.RoleHistoryView.from(history);

        assertThat(view.changedBy()).isEqualTo("master-admin");
        assertThat(view.changedBy()).doesNotContain("00000000-0000-0000-0000-000000000901");
    }

    private static ArologisEmployee employee(String loginId, AdminUserRole role) {
        ArologisDepartment department = ArologisDepartment.create("ADMIN", "행정", 10);
        AdminUser adminUser = AdminUser.create(loginId, "$2a$10$hash", "이인사", role);
        ArologisEmployee employee = ArologisEmployee.create(
                adminUser, loginId, "이인사", "과장", department,
                LocalDate.of(2026, 6, 8), "lee@example.com", "010-3333-4444");
        ReflectionTestUtils.setField(employee, "id", UUID.fromString("00000000-0000-0000-0000-000000000701"));
        return employee;
    }
}
