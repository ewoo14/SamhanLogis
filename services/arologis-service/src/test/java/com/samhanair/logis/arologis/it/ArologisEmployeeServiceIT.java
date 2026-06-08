package com.samhanair.logis.arologis.it;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.lenient;

import com.samhanair.logis.arologis.ArologisServiceApplication;
import com.samhanair.logis.arologis.client.NotificationClient;
import com.samhanair.logis.arologis.client.PartnerClient;
import com.samhanair.logis.arologis.client.SlipClient;
import com.samhanair.logis.arologis.client.SlipServiceClient;
import com.samhanair.logis.arologis.domain.auth.AdminUser;
import com.samhanair.logis.arologis.domain.auth.AdminUserRole;
import com.samhanair.logis.arologis.repository.AdminUserRepository;
import com.samhanair.logis.arologis.repository.ArologisEmployeeRepository;
import com.samhanair.logis.arologis.service.ArologisEmployeeService;
import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.security.permission.DynamicPermissionClient;
import java.time.LocalDate;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.transaction.annotation.Transactional;

/**
 * 아로로지스 HR 직원 서비스 IT.
 *
 * <p>Flyway V14 schema/seed 와 실제 JPA repository 를 사용한다. 외부 client 는
 * {@code @MockBean} 으로 격리한다.
 */
@SpringBootTest(classes = ArologisServiceApplication.class)
@Transactional
class ArologisEmployeeServiceIT extends AbstractPostgresIT {

    @Autowired private ArologisEmployeeService employeeService;
    @Autowired private AdminUserRepository adminUserRepository;
    @Autowired private ArologisEmployeeRepository employeeRepository;
    @Autowired private PasswordEncoder passwordEncoder;

    @MockBean private PartnerClient partnerClient;
    @MockBean private SlipClient slipClient;
    @MockBean private NotificationClient notificationClient;
    @MockBean private SlipServiceClient slipServiceClient;
    @MockBean private DynamicPermissionClient dynamicPermissionClient;

    @BeforeEach
    void setUp() {
        lenient().when(partnerClient.findByCodes(any())).thenReturn(java.util.List.of());
        lenient().when(partnerClient.findByCode(any())).thenReturn(Optional.empty());
        lenient().when(slipClient.registerSignature(any(), any())).thenReturn(false);
        lenient().when(notificationClient.send(any(), any(), any(), any())).thenReturn(true);
        lenient().when(slipServiceClient.getOutboundSlips(any(), any())).thenReturn(java.util.List.of());
        lenient().when(dynamicPermissionClient.canView(anyString(), anyString())).thenReturn(true);
        lenient().when(dynamicPermissionClient.canEdit(anyString(), anyString())).thenReturn(true);
    }

    @Test
    void createEmployee_provisionsAdminUserAndLinksEmployee() {
        ArologisEmployeeService.ProvisionedEmployee provisioned = employeeService.createEmployee(
                command("it-hr-create", AdminUserRole.AROLOGIS_MANAGER),
                "it-tester");

        AdminUser adminUser = adminUserRepository.findByLoginIdAndIsDeletedFalse("it-hr-create").orElseThrow();

        assertThat(provisioned.employee().loginId()).isEqualTo("it-hr-create");
        assertThat(provisioned.employee().departmentCode()).isEqualTo("ADMIN");
        assertThat(provisioned.employee().departmentName()).isEqualTo("행정");
        assertThat(provisioned.temporaryPassword()).isNotBlank();
        assertThat(passwordEncoder.matches(provisioned.temporaryPassword(), adminUser.getPasswordHash())).isTrue();
        assertThat(employeeRepository.findByLoginIdAndIsDeletedFalse("it-hr-create").orElseThrow()
                .getAdminUser().getLoginId()).isEqualTo("it-hr-create");
    }

    @Test
    void changeRole_appendsHistoryAndSameRoleDoesNotAppend() {
        employeeService.createEmployee(command("it-hr-role", AdminUserRole.AROLOGIS_MANAGER), "it-tester");

        employeeService.changeRole("it-hr-role", AdminUserRole.AROLOGIS_MASTER, "승급", "it-tester");
        employeeService.changeRole("it-hr-role", AdminUserRole.AROLOGIS_MASTER, "동일", "it-tester");

        assertThat(adminUserRepository.findByLoginIdAndIsDeletedFalse("it-hr-role").orElseThrow().getRole())
                .isEqualTo(AdminUserRole.AROLOGIS_MASTER);
        assertThat(employeeService.roleHistories("it-hr-role"))
                .filteredOn(history -> history.previousRole() == AdminUserRole.AROLOGIS_MANAGER
                        && history.newRole() == AdminUserRole.AROLOGIS_MASTER)
                .hasSize(1);
    }

    @Test
    void terminateEmployee_softDeletesEmployeeAndAdminUser() {
        employeeService.createEmployee(command("it-hr-term", AdminUserRole.AROLOGIS_MANAGER), "it-tester");

        ArologisEmployeeService.EmployeeView terminated =
                employeeService.terminate("it-hr-term", LocalDate.of(2026, 6, 30), "it-tester");

        assertThat(terminated.active()).isFalse();
        assertThat(terminated.terminationDate()).isEqualTo(LocalDate.of(2026, 6, 30));
        assertThat(adminUserRepository.findByLoginIdAndIsDeletedFalse("it-hr-term")).isEmpty();
        assertThat(employeeRepository.findByLoginIdAndIsDeletedFalse("it-hr-term")).isEmpty();
    }

    @Test
    void createEmployee_rejectsDuplicateLoginId() {
        employeeService.createEmployee(command("it-hr-dup", AdminUserRole.AROLOGIS_MANAGER), "it-tester");

        assertThatThrownBy(() ->
                employeeService.createEmployee(command("it-hr-dup", AdminUserRole.AROLOGIS_MASTER), "it-tester"))
                .isInstanceOf(BusinessException.class);
    }

    private static ArologisEmployeeService.CreateEmployeeCommand command(String loginId, AdminUserRole role) {
        return new ArologisEmployeeService.CreateEmployeeCommand(
                loginId,
                "통합테스트",
                "대리",
                "ADMIN",
                LocalDate.of(2026, 6, 8),
                loginId + "@example.com",
                "010-5555-6666",
                role);
    }
}
