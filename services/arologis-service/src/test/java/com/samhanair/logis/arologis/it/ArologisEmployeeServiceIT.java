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
import org.springframework.transaction.annotation.Propagation;
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
                "it-tester",
                "AROLOGIS_MANAGER");

        AdminUser adminUser = adminUserRepository.findByLoginIdAndIsDeletedFalse("it-hr-create").orElseThrow();

        assertThat(provisioned.employee().loginId()).isEqualTo("it-hr-create");
        assertThat(provisioned.employee().departmentCode()).isEqualTo("ADMIN");
        // V17: ADMIN 부서명 "행정" → "행정팀" 개명(대표실/행정팀/회계팀 확정).
        assertThat(provisioned.employee().departmentName()).isEqualTo("행정팀");
        assertThat(provisioned.temporaryPassword()).isNotBlank();
        assertThat(passwordEncoder.matches(provisioned.temporaryPassword(), adminUser.getPasswordHash())).isTrue();
        assertThat(employeeRepository.findByLoginIdAndIsDeletedFalse("it-hr-create").orElseThrow()
                .getAdminUser().getLoginId()).isEqualTo("it-hr-create");
    }

    @Test
    void changeRole_appendsHistoryAndSameRoleDoesNotAppend() {
        employeeService.createEmployee(
                command("it-hr-role", AdminUserRole.AROLOGIS_MANAGER), "it-tester", "AROLOGIS_MANAGER");
        saveActor("it-master-role", AdminUserRole.AROLOGIS_MASTER);

        employeeService.changeRole(
                "it-hr-role", AdminUserRole.AROLOGIS_MASTER, "승급", "it-master-role", "AROLOGIS_MANAGER");
        employeeService.changeRole(
                "it-hr-role", AdminUserRole.AROLOGIS_MASTER, "동일", "it-master-role", "AROLOGIS_MANAGER");

        assertThat(adminUserRepository.findByLoginIdAndIsDeletedFalse("it-hr-role").orElseThrow().getRole())
                .isEqualTo(AdminUserRole.AROLOGIS_MASTER);
        assertThat(employeeService.roleHistories("it-hr-role"))
                .filteredOn(history -> history.previousRole() == AdminUserRole.AROLOGIS_MANAGER
                        && history.newRole() == AdminUserRole.AROLOGIS_MASTER)
                .hasSize(1);
    }

    @Test
    void terminateEmployee_softDeletesEmployeeAndAdminUser() {
        employeeService.createEmployee(
                command("it-hr-term", AdminUserRole.AROLOGIS_MANAGER), "it-tester", "AROLOGIS_MANAGER");

        ArologisEmployeeService.EmployeeView terminated =
                employeeService.terminate("it-hr-term", LocalDate.of(2026, 6, 30), "it-tester");

        assertThat(terminated.active()).isFalse();
        assertThat(terminated.terminationDate()).isEqualTo(LocalDate.of(2026, 6, 30));
        assertThat(adminUserRepository.findByLoginIdAndIsDeletedFalse("it-hr-term")).isEmpty();
        assertThat(employeeRepository.findByLoginIdAndIsDeletedFalse("it-hr-term")).isEmpty();
    }

    @Test
    void createEmployee_rejectsDuplicateLoginId() {
        employeeService.createEmployee(
                command("it-hr-dup", AdminUserRole.AROLOGIS_MANAGER), "it-tester", "AROLOGIS_MANAGER");

        assertThatThrownBy(() ->
                employeeService.createEmployee(
                        command("it-hr-dup", AdminUserRole.AROLOGIS_MANAGER), "it-tester", "AROLOGIS_MASTER"))
                .isInstanceOf(BusinessException.class);
    }

    @Test
    void createEmployee_rejectsMasterRoleByManagerActor() {
        saveActor("it-manager", AdminUserRole.AROLOGIS_MANAGER);

        assertThatThrownBy(() -> employeeService.createEmployee(
                command("it-hr-master-deny", AdminUserRole.AROLOGIS_MASTER),
                "it-manager",
                "AROLOGIS_MASTER"))
                .isInstanceOf(BusinessException.class)
                .hasMessage("AROLOGIS_MASTER 권한 부여는 마스터만 가능합니다")
                .extracting(ex -> ((BusinessException) ex).getErrorCode())
                .isEqualTo(com.samhanair.logis.common.exception.ErrorCode.FORBIDDEN);

        assertThat(adminUserRepository.findByLoginIdAndIsDeletedFalse("it-hr-master-deny")).isEmpty();
        assertThat(employeeRepository.findByLoginIdAndIsDeletedFalse("it-hr-master-deny")).isEmpty();
    }

    @Test
    void createEmployee_allowsMasterRoleByMasterActor() {
        saveActor("it-master", AdminUserRole.AROLOGIS_MASTER);

        ArologisEmployeeService.ProvisionedEmployee provisioned = employeeService.createEmployee(
                command("it-hr-master-allow", AdminUserRole.AROLOGIS_MASTER),
                "it-master",
                "AROLOGIS_MANAGER");

        assertThat(provisioned.employee().role()).isEqualTo(AdminUserRole.AROLOGIS_MASTER);
        assertThat(adminUserRepository.findByLoginIdAndIsDeletedFalse("it-hr-master-allow").orElseThrow().getRole())
                .isEqualTo(AdminUserRole.AROLOGIS_MASTER);
    }

    @Test
    void changeRole_rejectsMasterPromotionByManagerActor() {
        employeeService.createEmployee(
                command("it-hr-role-deny", AdminUserRole.AROLOGIS_MANAGER), "it-manager", "AROLOGIS_MANAGER");
        saveActor("it-manager", AdminUserRole.AROLOGIS_MANAGER);

        assertThatThrownBy(() -> employeeService.changeRole(
                "it-hr-role-deny",
                AdminUserRole.AROLOGIS_MASTER,
                "승급",
                "it-manager",
                "AROLOGIS_MASTER"))
                .isInstanceOf(BusinessException.class)
                .hasMessage("AROLOGIS_MASTER 권한 부여는 마스터만 가능합니다")
                .extracting(ex -> ((BusinessException) ex).getErrorCode())
                .isEqualTo(com.samhanair.logis.common.exception.ErrorCode.FORBIDDEN);

        assertThat(adminUserRepository.findByLoginIdAndIsDeletedFalse("it-hr-role-deny").orElseThrow().getRole())
                .isEqualTo(AdminUserRole.AROLOGIS_MANAGER);
    }

    @Test
    void changeRole_rejectsMasterDemotionByManagerActor() {
        employeeService.createEmployee(
                command("it-hr-demote-deny", AdminUserRole.AROLOGIS_MASTER), "admin", "AROLOGIS_MANAGER");
        saveActor("it-demote-manager", AdminUserRole.AROLOGIS_MANAGER);

        assertThatThrownBy(() -> employeeService.changeRole(
                "it-hr-demote-deny",
                AdminUserRole.AROLOGIS_MANAGER,
                "강등",
                "it-demote-manager",
                "AROLOGIS_MASTER"))
                .isInstanceOf(BusinessException.class)
                .hasMessage("AROLOGIS_MASTER 권한 부여는 마스터만 가능합니다")
                .extracting(ex -> ((BusinessException) ex).getErrorCode())
                .isEqualTo(com.samhanair.logis.common.exception.ErrorCode.FORBIDDEN);

        assertThat(adminUserRepository.findByLoginIdAndIsDeletedFalse("it-hr-demote-deny").orElseThrow().getRole())
                .isEqualTo(AdminUserRole.AROLOGIS_MASTER);
    }

    @Test
    @Transactional(propagation = Propagation.NOT_SUPPORTED)
    void createEmployee_rollsBackAdminUserWhenEmployeeFlushFails() {
        String loginId = "it-hr-rollback";
        String tooLongEmail = "a".repeat(101);

        assertThatThrownBy(() -> employeeService.createEmployee(
                command(loginId, AdminUserRole.AROLOGIS_MANAGER, tooLongEmail),
                "it-master",
                "AROLOGIS_MASTER"))
                .isInstanceOf(org.springframework.dao.DataIntegrityViolationException.class);

        assertThat(adminUserRepository.findByLoginIdAndIsDeletedFalse(loginId)).isEmpty();
        assertThat(employeeRepository.findByLoginIdAndIsDeletedFalse(loginId)).isEmpty();
    }

    /**
     * 아로로지스 6-롤 확장(2026-06-08) — 신규 4롤 직원 생성이 CHECK 제약(V16) 을 통과함을 단언.
     *
     * <p>auth_admin_user.role / role_change_history.new_role·previous_role CHECK 가 구 2롤만
     * 허용하던 회귀(실 QA 적발)를 가드한다. 매니저 actor 가 비-마스터 신규 롤을 부여 가능해야 한다.
     */
    @Test
    void createEmployee_allowsNewSixRoleMembers() {
        AdminUserRole[] newRoles = {
            AdminUserRole.AROLOGIS_DEVELOPER,
            AdminUserRole.AROLOGIS_SALES,
            AdminUserRole.AROLOGIS_ACCOUNTANT,
            AdminUserRole.AROLOGIS_DRIVER,
        };
        for (AdminUserRole role : newRoles) {
            String loginId = "it-6role-" + role.name().toLowerCase();
            ArologisEmployeeService.ProvisionedEmployee provisioned = employeeService.createEmployee(
                    command(loginId, role), "it-tester", "AROLOGIS_MANAGER");
            assertThat(provisioned.employee().role()).isEqualTo(role);
            assertThat(adminUserRepository.findByLoginIdAndIsDeletedFalse(loginId).orElseThrow().getRole())
                    .isEqualTo(role);
        }
    }

    /**
     * 신규 롤로의 롤변경이 role_change_history new_role/previous_role CHECK(V16) 를 통과함을 단언.
     */
    @Test
    void changeRole_toNewSixRole_recordsHistory() {
        employeeService.createEmployee(
                command("it-6role-change", AdminUserRole.AROLOGIS_SALES), "it-tester", "AROLOGIS_MANAGER");

        employeeService.changeRole(
                "it-6role-change", AdminUserRole.AROLOGIS_ACCOUNTANT, "직무 전환", "it-tester", "AROLOGIS_MANAGER");

        assertThat(adminUserRepository.findByLoginIdAndIsDeletedFalse("it-6role-change").orElseThrow().getRole())
                .isEqualTo(AdminUserRole.AROLOGIS_ACCOUNTANT);
        assertThat(employeeService.roleHistories("it-6role-change"))
                .filteredOn(history -> history.previousRole() == AdminUserRole.AROLOGIS_SALES
                        && history.newRole() == AdminUserRole.AROLOGIS_ACCOUNTANT)
                .hasSize(1);
    }

    private static ArologisEmployeeService.CreateEmployeeCommand command(String loginId, AdminUserRole role) {
        return command(loginId, role, loginId + "@example.com");
    }

    private static ArologisEmployeeService.CreateEmployeeCommand command(
            String loginId, AdminUserRole role, String email) {
        return new ArologisEmployeeService.CreateEmployeeCommand(
                loginId,
                "통합테스트",
                "대리",
                "ADMIN",
                LocalDate.of(2026, 6, 8),
                email,
                "010-5555-6666",
                role);
    }

    private void saveActor(String loginId, AdminUserRole role) {
        adminUserRepository.saveAndFlush(AdminUser.create(loginId, "$2a$10$hash", loginId, role));
    }
}
