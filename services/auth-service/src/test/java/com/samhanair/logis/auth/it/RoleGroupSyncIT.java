package com.samhanair.logis.auth.it;

import static org.assertj.core.api.Assertions.assertThat;

import com.samhanair.logis.auth.AuthServiceApplication;
import com.samhanair.logis.auth.service.AuthService;
import com.samhanair.logis.auth.service.dto.RegisterResponse;
import com.samhanair.logis.common.security.Role;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;

/**
 * Phase C3a — 역할 변경 시 빌트인 role-group 자동 동기화 Testcontainers IT.
 *
 * <p>시나리오:
 * <ol>
 *   <li>MANAGER→SALES: group101 soft-delete + group102 active, 수동 배속 그룹 보존,
 *       account_page_permissions 가 SALES grant 반영.</li>
 *   <li>MASTER→MANAGER: group100 soft-delete + group101 active.</li>
 *   <li>신규 계정 생성 후 초기 role-group 배속 보장.</li>
 * </ol>
 */
@SpringBootTest(classes = AuthServiceApplication.class)
class RoleGroupSyncIT extends AbstractPostgresIT {

    // 빌트인 role-group UUID (V43)
    private static final UUID MASTER_GROUP_ID =
            UUID.fromString("00000000-0000-0000-0000-000000000100");
    private static final UUID MANAGER_GROUP_ID =
            UUID.fromString("00000000-0000-0000-0000-000000000101");
    private static final UUID SALES_GROUP_ID =
            UUID.fromString("00000000-0000-0000-0000-000000000102");

    // 테스트 전용 수동 권한그룹 UUID
    private static final UUID MANUAL_GROUP_ID =
            UUID.fromString("f0000000-0000-0000-0000-000000000001");

    // 테스트 계정 UUID
    private static final UUID MANAGER_ACCOUNT_ID =
            UUID.fromString("c3a00000-0000-0000-0000-000000000001");
    private static final UUID MASTER_ACCOUNT_ID =
            UUID.fromString("c3a00000-0000-0000-0000-000000000002");
    private static final UUID NEW_ACCOUNT_ID =
            UUID.fromString("c3a00000-0000-0000-0000-000000000003");

    @Autowired
    private AuthService authService;

    @Autowired
    private JdbcTemplate jdbc;

    /** 신규 계정 등록 테스트에서 실제 생성된 계정 UUID (merge 후 managed id). */
    private UUID registeredAccountId;

    @BeforeEach
    void setUp() {
        registeredAccountId = null;
        cleanAll();
        seedManualGroup();
        seedAccount(MANAGER_ACCOUNT_ID, "c3a_manager", "C3a Manager", "MANAGER");
        seedAccount(MASTER_ACCOUNT_ID, "c3a_master", "C3a Master", "MASTER");
        // MANAGER 계정은 group101(빌트인) + MANUAL_GROUP(수동) 에 배속
        assignGroup(MANAGER_ACCOUNT_ID, MANAGER_GROUP_ID, "it-manager-builtin");
        assignGroup(MANAGER_ACCOUNT_ID, MANUAL_GROUP_ID, "it-manager-manual");
        // MASTER 계정은 group100 에 배속
        assignGroup(MASTER_ACCOUNT_ID, MASTER_GROUP_ID, "it-master-builtin");
    }

    @AfterEach
    void tearDown() {
        cleanAll();
        // 신규 등록 계정 정리 (merge 후 실제 UUID 가 NEW_ACCOUNT_ID 와 다를 수 있으므로 별도 삭제)
        if (registeredAccountId != null) {
            jdbc.update("DELETE FROM account_page_permissions WHERE account_id = ?", registeredAccountId);
            jdbc.update("DELETE FROM account_groups WHERE account_id = ?", registeredAccountId);
            jdbc.update("DELETE FROM accounts WHERE id = ?", registeredAccountId);
        }
    }

    // -------------------------------------------------------------------------
    // 시나리오 1: MANAGER → SALES
    // -------------------------------------------------------------------------

    @Test
    @DisplayName("MANAGER→SALES: group101 soft-delete + group102 active / 수동 그룹 보존")
    void updateAccountRole_managerToSales_swapsBuiltinGroup() {
        authService.updateAccountRole(MANAGER_ACCOUNT_ID, Role.SALES);

        // group101(MANAGER 빌트인) 은 soft-delete 돼야 한다
        Integer activeManagerGroup = jdbc.queryForObject("""
                SELECT COUNT(*) FROM account_groups
                WHERE account_id = ? AND group_id = ? AND is_deleted = FALSE
                """, Integer.class, MANAGER_ACCOUNT_ID, MANAGER_GROUP_ID);
        assertThat(activeManagerGroup).isZero();

        // group102(SALES 빌트인) 는 활성 배속이어야 한다
        Integer activeSalesGroup = jdbc.queryForObject("""
                SELECT COUNT(*) FROM account_groups
                WHERE account_id = ? AND group_id = ? AND is_deleted = FALSE
                """, Integer.class, MANAGER_ACCOUNT_ID, SALES_GROUP_ID);
        assertThat(activeSalesGroup).isOne();

        // 수동 배속 그룹은 보존돼야 한다
        Integer activeManualGroup = jdbc.queryForObject("""
                SELECT COUNT(*) FROM account_groups
                WHERE account_id = ? AND group_id = ? AND is_deleted = FALSE
                """, Integer.class, MANAGER_ACCOUNT_ID, MANUAL_GROUP_ID);
        assertThat(activeManualGroup).isOne();
    }

    @Test
    @DisplayName("MANAGER→SALES: account_page_permissions 는 SALES group 권한을 반영한다")
    void updateAccountRole_managerToSales_permissionsReflectSalesGroup() {
        authService.updateAccountRole(MANAGER_ACCOUNT_ID, Role.SALES);

        // SALES 빌트인 그룹(102)에 배속된 page 중 하나가 active 로 materialise 돼야 한다
        // SALES 는 영업 관련 페이지(예: partner-order)에 can_view=true 를 가짐
        // MANAGER 전용 페이지(예: hr.role.management)는 SALES 그룹에 없으므로 active 행이 없어야 한다
        // (구체적 page_code 는 실제 V43 seed 기준으로 검증)
        Integer activePermRows = jdbc.queryForObject("""
                SELECT COUNT(*) FROM account_page_permissions
                WHERE account_id = ? AND is_deleted = FALSE
                """, Integer.class, MANAGER_ACCOUNT_ID);
        // SALES 그룹은 1개 이상의 page 권한을 보유하므로 active 행이 존재해야 한다
        assertThat(activePermRows).isPositive();

        // hr.role.management 는 MANAGER 그룹 고유 페이지가 아닌지 확인(SALES 엔 없어야 함)
        // → SALES 빌트인 그룹 seed 에 hr.role.management 가 없으면 active 행도 없어야 한다
        List<Map<String, Object>> hrRows = jdbc.queryForList("""
                SELECT gpp.page_code FROM group_page_permissions gpp
                WHERE gpp.group_id = ?
                  AND gpp.page_code = 'hr.role.management'
                  AND gpp.is_deleted = FALSE
                """, SALES_GROUP_ID);
        if (hrRows.isEmpty()) {
            // SALES 그룹에 hr.role.management 없음 → account_page_permissions 에도 없어야 함
            Integer hrPermRows = jdbc.queryForObject("""
                    SELECT COUNT(*) FROM account_page_permissions
                    WHERE account_id = ?
                      AND page_code = 'hr.role.management'
                      AND is_deleted = FALSE
                    """, Integer.class, MANAGER_ACCOUNT_ID);
            assertThat(hrPermRows).isZero();
        }
    }

    // -------------------------------------------------------------------------
    // 시나리오 2: MASTER → MANAGER
    // -------------------------------------------------------------------------

    @Test
    @DisplayName("MASTER→MANAGER: group100 soft-delete + group101 active")
    void updateAccountRole_masterToManager_swapsBuiltinGroup() {
        authService.updateAccountRole(MASTER_ACCOUNT_ID, Role.MANAGER);

        // group100(MASTER) 은 soft-delete 돼야 한다
        Integer activeMasterGroup = jdbc.queryForObject("""
                SELECT COUNT(*) FROM account_groups
                WHERE account_id = ? AND group_id = ? AND is_deleted = FALSE
                """, Integer.class, MASTER_ACCOUNT_ID, MASTER_GROUP_ID);
        assertThat(activeMasterGroup).isZero();

        // group101(MANAGER 빌트인) 은 active 이어야 한다
        Integer activeManagerGroup = jdbc.queryForObject("""
                SELECT COUNT(*) FROM account_groups
                WHERE account_id = ? AND group_id = ? AND is_deleted = FALSE
                """, Integer.class, MASTER_ACCOUNT_ID, MANAGER_GROUP_ID);
        assertThat(activeManagerGroup).isOne();
    }

    @Test
    @DisplayName("MASTER→MANAGER: MASTER 로서 bypass 상태 해제 — account_page_permissions 활성 행 생성")
    void updateAccountRole_masterToManager_materializesPermissions() {
        authService.updateAccountRole(MASTER_ACCOUNT_ID, Role.MANAGER);

        // MANAGER 그룹은 page 권한을 보유하므로 account_page_permissions active 행이 있어야 한다
        Integer activeRows = jdbc.queryForObject("""
                SELECT COUNT(*) FROM account_page_permissions
                WHERE account_id = ? AND is_deleted = FALSE
                """, Integer.class, MASTER_ACCOUNT_ID);
        assertThat(activeRows).isPositive();
    }

    // -------------------------------------------------------------------------
    // 시나리오 3: 신규 계정 생성 후 초기 role-group 배속
    // -------------------------------------------------------------------------

    @Test
    @DisplayName("신규 계정 생성 시 초기 역할에 대응하는 빌트인 role-group 이 자동 배속된다")
    void registerWithId_assignsInitialBuiltinRoleGroup() {
        // registerWithId 가 반환하는 실제 UUID(merge 후 managed entity id) 를 사용
        RegisterResponse response = authService.registerWithId(
                NEW_ACCOUNT_ID,
                "c3a_new_sales",
                "TempPass1!",
                "C3a New Sales",
                Role.SALES,
                false
        );
        UUID actualAccountId = UUID.fromString(response.userId());
        registeredAccountId = actualAccountId;

        // SALES 빌트인 그룹이 배속돼야 한다
        Integer activeSalesGroup = jdbc.queryForObject("""
                SELECT COUNT(*) FROM account_groups
                WHERE account_id = ? AND group_id = ? AND is_deleted = FALSE
                """, Integer.class, actualAccountId, SALES_GROUP_ID);
        assertThat(activeSalesGroup).isOne();

        // account_page_permissions 에 active 행이 생성돼야 한다
        Integer activePermRows = jdbc.queryForObject("""
                SELECT COUNT(*) FROM account_page_permissions
                WHERE account_id = ? AND is_deleted = FALSE
                """, Integer.class, actualAccountId);
        assertThat(activePermRows).isPositive();
    }

    @Test
    @DisplayName("신규 MASTER 계정 생성 시 group100 배속 — account_page_permissions active 행 없음(bypass 유지)")
    void registerWithId_masterAccount_noPermissionRows() {
        // registerWithId 가 반환하는 실제 UUID(merge 후 managed entity id) 를 사용
        RegisterResponse response = authService.registerWithId(
                NEW_ACCOUNT_ID,
                "c3a_new_master",
                "TempPass1!",
                "C3a New Master",
                Role.MASTER,
                false
        );
        UUID actualAccountId = UUID.fromString(response.userId());
        registeredAccountId = actualAccountId;

        // group100(isSystemMaster=TRUE) 에 배속
        Integer activeMasterGroup = jdbc.queryForObject("""
                SELECT COUNT(*) FROM account_groups
                WHERE account_id = ? AND group_id = ? AND is_deleted = FALSE
                """, Integer.class, actualAccountId, MASTER_GROUP_ID);
        assertThat(activeMasterGroup).isOne();

        // MASTER bypass → account_page_permissions active 행 없어야 함
        Integer activePermRows = jdbc.queryForObject("""
                SELECT COUNT(*) FROM account_page_permissions
                WHERE account_id = ? AND is_deleted = FALSE
                """, Integer.class, actualAccountId);
        assertThat(activePermRows).isZero();
    }

    // -------------------------------------------------------------------------
    // Helper
    // -------------------------------------------------------------------------

    private void seedManualGroup() {
        jdbc.update("""
                INSERT INTO permission_groups
                    (id, name, description, is_builtin, is_system_master,
                     created_at, created_by, modified_at, modified_by, is_deleted)
                VALUES
                    (?, '수동테스트그룹', '수동 배속 보존 검증용', FALSE, FALSE,
                     NOW(), 'it-c3a', NOW(), 'it-c3a', FALSE)
                ON CONFLICT (id) DO NOTHING
                """, MANUAL_GROUP_ID);
    }

    private void seedAccount(UUID id, String loginId, String displayName, String role) {
        jdbc.update("""
                INSERT INTO accounts (
                    id, login_id, password_hash, display_name, role, enabled,
                    failed_login_attempts, locked_at,
                    password_changed_at, password_history,
                    password_change_required,
                    created_at, created_by, modified_at, modified_by, is_deleted
                ) VALUES (
                    ?, ?,
                    '$2a$12$6cxHjNrguvlnEE.4s4jrAOuGNGGmHPc4Gg8/MuMBHYh/B.Q4sU/xu',
                    ?, ?, TRUE,
                    0, NULL,
                    NOW(), '[]'::jsonb,
                    FALSE,
                    NOW(), 'it-c3a', NOW(), 'it-c3a', FALSE
                )
                """, id, loginId, displayName, role);
    }

    private void assignGroup(UUID accountId, UUID groupId, String actor) {
        jdbc.update("""
                INSERT INTO account_groups
                    (id, account_id, group_id, created_at, created_by, modified_at, modified_by, is_deleted)
                VALUES
                    (gen_random_uuid(), ?, ?, NOW(), ?, NOW(), ?, FALSE)
                ON CONFLICT (account_id, group_id) WHERE is_deleted = FALSE DO NOTHING
                """, accountId, groupId, actor, actor);
    }

    private void cleanAll() {
        UUID[] accounts = {MANAGER_ACCOUNT_ID, MASTER_ACCOUNT_ID, NEW_ACCOUNT_ID};
        for (UUID id : accounts) {
            jdbc.update("DELETE FROM account_page_permissions WHERE account_id = ?", id);
            jdbc.update("DELETE FROM account_groups WHERE account_id = ?", id);
            jdbc.update("DELETE FROM accounts WHERE id = ?", id);
        }
        jdbc.update("DELETE FROM permission_groups WHERE id = ?", MANUAL_GROUP_ID);
    }
}
