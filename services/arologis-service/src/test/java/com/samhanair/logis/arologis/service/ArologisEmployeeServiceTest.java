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
import java.time.LocalDate;
import java.util.Optional;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
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
        when(adminUserRepository.save(any(AdminUser.class))).thenAnswer(inv -> inv.getArgument(0));
        when(employeeRepository.save(any(ArologisEmployee.class))).thenAnswer(inv -> {
            ArologisEmployee employee = inv.getArgument(0);
            ReflectionTestUtils.setField(employee, "id", java.util.UUID.fromString("00000000-0000-0000-0000-000000000702"));
            return employee;
        });
        when(historyRepository.save(any(ArologisRoleChangeHistory.class))).thenAnswer(inv -> inv.getArgument(0));

        ArologisEmployeeService.ProvisionedEmployee result = service.createEmployee(
                new ArologisEmployeeService.CreateEmployeeCommand(
                        "hr-kim", "김인사", "대리", "DISPATCH", LocalDate.of(2026, 6, 8),
                        "hr-kim@example.com", "010-1111-2222", AdminUserRole.AROLOGIS_MANAGER),
                "tester");

        ArgumentCaptor<AdminUser> adminCaptor = ArgumentCaptor.forClass(AdminUser.class);
        ArgumentCaptor<ArologisEmployee> employeeCaptor = ArgumentCaptor.forClass(ArologisEmployee.class);
        verify(adminUserRepository).save(adminCaptor.capture());
        verify(employeeRepository).save(employeeCaptor.capture());

        assertThat(result.employee().loginId()).isEqualTo("hr-kim");
        assertThat(result.employee().departmentName()).isEqualTo("배차");
        assertThat(result.temporaryPassword()).isNotBlank();
        assertThat(passwordEncoder.matches(result.temporaryPassword(), adminCaptor.getValue().getPasswordHash())).isTrue();
        assertThat(adminCaptor.getValue().getRole()).isEqualTo(AdminUserRole.AROLOGIS_MANAGER);
        assertThat(employeeCaptor.getValue().getAdminUser()).isSameAs(adminCaptor.getValue());
    }

    @Test
    void createEmployee_rejectsDuplicateActiveLoginId() {
        AdminUser existing = AdminUser.create("hr-kim", "$2a$10$hash", "기존", AdminUserRole.AROLOGIS_MANAGER);
        when(adminUserRepository.findByLoginIdAndIsDeletedFalse("hr-kim")).thenReturn(Optional.of(existing));

        assertThatThrownBy(() -> service.createEmployee(
                new ArologisEmployeeService.CreateEmployeeCommand(
                        "hr-kim", "김인사", "대리", "DISPATCH", LocalDate.of(2026, 6, 8),
                        null, null, AdminUserRole.AROLOGIS_MANAGER),
                "tester"))
                .isInstanceOf(BusinessException.class);
    }

    @Test
    void changeRole_updatesAdminUserAndAppendsHistory() {
        ArologisEmployee employee = employee("hr-lee", AdminUserRole.AROLOGIS_MANAGER);
        when(employeeRepository.findByLoginIdAndIsDeletedFalse("hr-lee")).thenReturn(Optional.of(employee));
        when(historyRepository.save(any(ArologisRoleChangeHistory.class))).thenAnswer(inv -> inv.getArgument(0));

        service.changeRole("hr-lee", AdminUserRole.AROLOGIS_MASTER, "승급", "tester");

        ArgumentCaptor<ArologisRoleChangeHistory> historyCaptor =
                ArgumentCaptor.forClass(ArologisRoleChangeHistory.class);
        verify(historyRepository).save(historyCaptor.capture());
        assertThat(employee.getAdminUser().getRole()).isEqualTo(AdminUserRole.AROLOGIS_MASTER);
        assertThat(historyCaptor.getValue().getPreviousRole()).isEqualTo(AdminUserRole.AROLOGIS_MANAGER);
        assertThat(historyCaptor.getValue().getNewRole()).isEqualTo(AdminUserRole.AROLOGIS_MASTER);
        assertThat(historyCaptor.getValue().getReason()).isEqualTo("승급");
    }

    @Test
    void changeRole_sameRoleIsIdempotentWithoutHistory() {
        ArologisEmployee employee = employee("hr-lee", AdminUserRole.AROLOGIS_MANAGER);
        when(employeeRepository.findByLoginIdAndIsDeletedFalse("hr-lee")).thenReturn(Optional.of(employee));

        service.changeRole("hr-lee", AdminUserRole.AROLOGIS_MANAGER, "동일", "tester");

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

    private static ArologisEmployee employee(String loginId, AdminUserRole role) {
        ArologisDepartment department = ArologisDepartment.create("ADMIN", "행정", 10);
        AdminUser adminUser = AdminUser.create(loginId, "$2a$10$hash", "이인사", role);
        ArologisEmployee employee = ArologisEmployee.create(
                adminUser, loginId, "이인사", "과장", department,
                LocalDate.of(2026, 6, 8), "lee@example.com", "010-3333-4444");
        ReflectionTestUtils.setField(employee, "id", java.util.UUID.fromString("00000000-0000-0000-0000-000000000701"));
        return employee;
    }
}
