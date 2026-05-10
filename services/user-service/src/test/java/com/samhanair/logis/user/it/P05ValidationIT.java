package com.samhanair.logis.user.it;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.lenient;

import com.samhanair.logis.common.security.Role;
import com.samhanair.logis.user.UserServiceApplication;
import com.samhanair.logis.user.domain.Department;
import com.samhanair.logis.user.domain.Employee;
import com.samhanair.logis.user.repository.DepartmentRepository;
import com.samhanair.logis.user.repository.EmployeeRepository;
import com.samhanair.logis.user.repository.RoleChangeHistoryRepository;
import com.samhanair.logis.user.service.EmployeeProvisioningService;
import com.samhanair.logis.user.web.dto.CreateEmployeeRequest;
import com.samhanair.logis.user.web.dto.EmployeeResponse;
import java.time.LocalDate;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.transaction.annotation.Transactional;

/**
 * P0-5 사용자/권한 관리 통합 테스트 — Phase 10.
 *
 * <p>시나리오:
 * <ol>
 *   <li>POST /admin/users (신규 등록) — EmployeeProvisioningService.create 경유</li>
 *   <li>PATCH /admin/users/{id}/role (Role 변경) + RoleChangeHistory 적재 검증</li>
 *   <li>PATCH /admin/users/{id}/disable (비활성화) — terminationDate 설정</li>
 *   <li>PATCH /admin/users/{id}/enable (잠금 해제 / 재활성화) — terminationDate 초기화</li>
 * </ol>
 *
 * <p>외부 의존 격리 ({@code @MockBean}):
 * <ul>
 *   <li>{@link com.samhanair.logis.user.client.AuthClient} — auth-service HTTP 호출 전체 stub</li>
 * </ul>
 *
 * <p>Testcontainers PostgreSQL — Docker 미가용 시 {@link AbstractPostgresIT.DockerAvailableCondition}
 * 에 의해 자동 skip (실패 아님).
 */
@SpringBootTest(classes = UserServiceApplication.class)
@Transactional
class P05ValidationIT extends AbstractPostgresIT {

    @Autowired
    private EmployeeProvisioningService provisioningService;

    @Autowired
    private EmployeeRepository employeeRepository;

    @Autowired
    private DepartmentRepository departmentRepository;

    @Autowired
    private RoleChangeHistoryRepository roleChangeHistoryRepository;

    /**
     * AuthClient — auth-service 외부 호출 전체 @MockBean 격리.
     *
     * <p>PR #134/#136 회고: IT 에서 외부 RestClient @MockBean 누락 시 Eureka 비활성 환경에서
     * 500 발생. lenient() 로 미호출 시 UnnecessaryStubbingException 회피.
     */
    @MockBean
    private com.samhanair.logis.user.client.AuthClient authClient;

    private Department salesTeam;
    private UUID masterCallerId;

    @BeforeEach
    void setUp() {
        masterCallerId = UUID.fromString("a0000000-0000-0000-0000-000000000001");

        salesTeam = departmentRepository.findByCode("SALES_1")
                .orElseGet(() -> departmentRepository.save(
                        Department.create("SALES_1", "영업1팀", 2)));

        // AuthClient stub — create/update/disable/delete 전부 lenient no-op
        lenient().doNothing().when(authClient).createAccount(
                any(UUID.class), anyString(), anyString(), anyString(), any(Role.class));
        lenient().doNothing().when(authClient).updateRole(any(UUID.class), any(Role.class));
        lenient().doNothing().when(authClient).updateDisplayName(any(UUID.class), anyString());
        lenient().doNothing().when(authClient).disable(any(UUID.class));
        lenient().doNothing().when(authClient).delete(any(UUID.class));
    }

    // ----------------------------------------------------------------
    // 시나리오 1: 신규 등록 (POST /admin/users → EmployeeProvisioningService.create)
    // ----------------------------------------------------------------

    /**
     * 신규 직원 등록 — 저장 후 id / loginId / role 검증.
     *
     * <p>auth-service.createAccount 는 stub — 로컬 DB 저장만 검증.
     */
    @Test
    @DisplayName("신규 등록: SALES 직원 생성 후 id·loginId·role 정상 반환")
    void createEmployee_persistsCorrectly() {
        CreateEmployeeRequest req = new CreateEmployeeRequest(
                "p05_new_sales",
                "Dev@1234567!",        // 8자 이상 BCrypt 입력 (auth-service stub 이므로 hash 미수행)
                "[DEV-SEED] 신규영업",
                "사원",
                Role.SALES,
                salesTeam.getId(),
                false,
                LocalDate.of(2026, 1, 1),
                "new_sales@samhan-air.com",
                "010-9999-0001"
        );

        EmployeeResponse resp = provisioningService.create(req, masterCallerId);

        assertThat(resp.id()).isNotNull();
        assertThat(resp.loginId()).isEqualTo("p05_new_sales");
        assertThat(resp.role()).isEqualTo(Role.SALES);
        assertThat(resp.terminationDate()).isNull();

        // DB 확인
        Employee saved = employeeRepository.findById(resp.id()).orElseThrow();
        assertThat(saved.getRoleSnapshot()).isEqualTo(Role.SALES);
    }

    // ----------------------------------------------------------------
    // 시나리오 2: Role 변경 (PATCH /admin/users/{id}/role) + 이력 적재
    // ----------------------------------------------------------------

    /**
     * Role 변경 — SALES → MANAGER 변경 후 roleSnapshot 갱신 + RoleChangeHistory 1건 생성.
     */
    @Test
    @DisplayName("Role 변경: SALES → MANAGER 변경 후 roleSnapshot·변경이력 검증")
    void updateRole_savesHistoryAndUpdatesSnapshot() {
        Employee emp = employeeRepository.save(Employee.create(
                UUID.randomUUID(), "p05_role_target", "[DEV-SEED] 역할변경대상", "사원",
                Role.SALES, salesTeam, false, LocalDate.of(2026, 1, 1), null, null));
        employeeRepository.flush();

        EmployeeResponse resp = provisioningService.updateRole(
                emp.getId(), Role.MANAGER, "P0-5 검증 — SALES→MANAGER", masterCallerId);

        assertThat(resp.role()).isEqualTo(Role.MANAGER);

        Employee updated = employeeRepository.findById(emp.getId()).orElseThrow();
        assertThat(updated.getRoleSnapshot()).isEqualTo(Role.MANAGER);

        var histories = roleChangeHistoryRepository
                .findAllByEmployeeIdOrderByCreatedAtDesc(emp.getId());
        assertThat(histories).hasSize(1);
        assertThat(histories.get(0).getPreviousRole()).isEqualTo(Role.SALES);
        assertThat(histories.get(0).getNewRole()).isEqualTo(Role.MANAGER);
    }

    /**
     * 동일 Role 재요청 — 이력 미적재 (변경 없음 가드).
     */
    @Test
    @DisplayName("Role 변경 무시: 동일 Role 재요청 시 RoleChangeHistory 미생성")
    void updateRole_sameRole_doesNotAppendHistory() {
        Employee emp = employeeRepository.save(Employee.create(
                UUID.randomUUID(), "p05_same_role", "[DEV-SEED] 동일역할", "사원",
                Role.SALES, salesTeam, false, LocalDate.of(2026, 1, 1), null, null));
        employeeRepository.flush();

        provisioningService.updateRole(emp.getId(), Role.SALES, null, masterCallerId);

        var histories = roleChangeHistoryRepository
                .findAllByEmployeeIdOrderByCreatedAtDesc(emp.getId());
        assertThat(histories).isEmpty();
    }

    // ----------------------------------------------------------------
    // 시나리오 3: 비활성화 (PATCH /admin/users/{id}/disable)
    // ----------------------------------------------------------------

    /**
     * 비활성화 — terminationDate = today, soft-delete 미수반.
     */
    @Test
    @DisplayName("비활성화: terminationDate 설정, is_deleted 는 FALSE 유지")
    void disableEmployee_setsTerminationDateOnly() {
        Employee emp = employeeRepository.save(Employee.create(
                UUID.randomUUID(), "p05_disable_target", "[DEV-SEED] 비활성화대상", "사원",
                Role.SALES, salesTeam, false, LocalDate.of(2026, 1, 1), null, null));
        employeeRepository.flush();

        EmployeeResponse resp = provisioningService.disable(emp.getId(), masterCallerId);

        assertThat(resp.terminationDate()).isNotNull();
        assertThat(resp.terminationDate()).isEqualTo(LocalDate.now());

        // is_deleted = FALSE (soft-delete 미수반)
        Employee afterDisable = employeeRepository.findById(emp.getId()).orElseThrow();
        assertThat(afterDisable.getIsDeleted()).isFalse();
    }

    // ----------------------------------------------------------------
    // 시나리오 4: 잠금 해제 / 재활성화 (PATCH /admin/users/{id}/enable)
    // ----------------------------------------------------------------

    /**
     * 재활성화 — disable 후 enable 호출 시 terminationDate = null 복원.
     */
    @Test
    @DisplayName("재활성화: enable 호출 시 terminationDate null 복원")
    void enableEmployee_clearsTerminationDate() {
        Employee emp = employeeRepository.save(Employee.create(
                UUID.randomUUID(), "p05_enable_target", "[DEV-SEED] 재활성화대상", "사원",
                Role.SALES, salesTeam, false, LocalDate.of(2026, 1, 1), null, null));
        employeeRepository.flush();

        // 먼저 비활성화
        provisioningService.disable(emp.getId(), masterCallerId);
        employeeRepository.flush();

        // 재활성화
        EmployeeResponse resp = provisioningService.enable(emp.getId(), masterCallerId);

        assertThat(resp.terminationDate()).isNull();

        Employee afterEnable = employeeRepository.findById(emp.getId()).orElseThrow();
        assertThat(afterEnable.getTerminationDate()).isNull();
    }

    /**
     * LOCKED 상태 직원 — Soft Delete(is_deleted=TRUE) 직원과 구분.
     *
     * <p>LOCKED 는 auth-service 의 locked_at 컬럼 — user-service Employee 는 정상 active.
     * 본 IT 는 terminationDate=NULL 을 통해 employee 가 active 임을 확인한다.
     * (잠금 해제 = auth-service 의 unlock API 호출 — AuthClient stub 으로 격리.)
     */
    @Test
    @DisplayName("LOCKED 직원: user-service Employee 는 active (terminationDate=null)")
    void lockedAccount_employeeIsStillActive() {
        // LOCKED 계정은 auth-service 에서 locked_at 이 설정된 것 — Employee 자체는 정상
        Employee locked = employeeRepository.save(Employee.create(
                UUID.randomUUID(), "p05_locked_check", "[DEV-SEED] 잠금검증", "사원",
                Role.SALES, salesTeam, false, LocalDate.of(2026, 1, 1), null, null));
        employeeRepository.flush();

        Employee found = employeeRepository.findById(locked.getId()).orElseThrow();
        assertThat(found.getTerminationDate()).isNull();
        assertThat(found.getIsDeleted()).isFalse();
    }
}
