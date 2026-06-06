package com.samhanair.logis.auth.it;

import static org.assertj.core.api.Assertions.assertThat;

import com.samhanair.logis.auth.AuthServiceApplication;
import com.samhanair.logis.auth.service.AuthService;
import com.samhanair.logis.auth.service.dto.RegisterResponse;
import com.samhanair.logis.common.security.Role;
import java.util.UUID;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;

/**
 * Phase C3a / C5-5 P1-a — 역할 변경 시 빌트인 role-group 자동 동기화 Testcontainers IT.
 *
 * <p>시나리오:
 * <ol>
 *   <li>MANAGER→SALES: group101 soft-delete + group102 active, 수동 배속 그룹 보존,
 *       account_page_permissions 가 SALES grant 반영.</li>
 *   <li>MASTER→MANAGER: group100 soft-delete + group101 active.</li>
 *   <li>신규 계정 생성 후 초기 role-group 배속 보장.</li>
 *   <li><b>P1-a:</b> 다중 빌트인 그룹(MANAGER + SALES) 활성인 계정의 역할 변경 시
 *       모든 구 빌트인 그룹이 정리되고 신규 단일 그룹만 남는다.</li>
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
    private static final UUID WAREHOUSE_GROUP_ID =
            UUID.fromString("00000000-0000-0000-0000-000000000103");

    // P1-a 다중 빌트인 그룹 테스트 계정 UUID
    private static final UUID MULTI_BUILTIN_ACCOUNT_ID =
            UUID.fromString("c3a00000-0000-0000-0000-000000000004");

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
        // P1-a 다중 빌트인 그룹 계정 정리
        jdbc.update("DELETE FROM account_page_permissions WHERE account_id = ?", MULTI_BUILTIN_ACCOUNT_ID);
        jdbc.update("DELETE FROM account_groups WHERE account_id = ?", MULTI_BUILTIN_ACCOUNT_ID);
        jdbc.update("DELETE FROM accounts WHERE id = ?", MULTI_BUILTIN_ACCOUNT_ID);
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

    /**
     * MANAGER→SALES 전환 후 account_page_permissions 가 SALES 그룹 권한 집합으로 재구성됐음을
     * 특정 page_code 고정 assert 로 실증한다.
     *
     * <p>근거 (seed grep):
     * <ul>
     *   <li><b>[Positive]</b> {@code sales.partner-order.list} — V10 line 37:
     *       SALES can_view=TRUE, can_edit=TRUE.
     *       SALES 그룹(group102) 배속 후 account_page_permissions active 행이 반드시 존재해야 한다.</li>
     *   <li><b>[Absence of effective access]</b> {@code accounting.edit-requests} — V28/V37:
     *       MANAGER 그룹(group101) 은 can_view=TRUE 를 가지나, SALES(group102) 는 V37 CROSS JOIN 으로
     *       can_view=FALSE 행만 존재한다. role-group swap 후 can_view=TRUE active 행이 없어야 한다.</li>
     * </ul>
     * 이 두 assert 의 조합으로 role-group swap 이 MANAGER 권한 집합을 SALES 로 실제 교체했음을 입증한다.
     */
    @Test
    @DisplayName("MANAGER→SALES: account_page_permissions 는 SALES group 권한을 반영한다")
    void updateAccountRole_managerToSales_permissionsReflectSalesGroup() {
        authService.updateAccountRole(MANAGER_ACCOUNT_ID, Role.SALES);

        // [Positive assert] sales.partner-order.list 는 SALES 에 can_view=TRUE 로 grant 됨(V10).
        // SALES 그룹(group102) 배속 후 account_page_permissions 에 active 행이 존재해야 한다.
        Integer salesOrderListRows = jdbc.queryForObject("""
                SELECT COUNT(*) FROM account_page_permissions
                WHERE account_id = ?
                  AND page_code = 'sales.partner-order.list'
                  AND is_deleted = FALSE
                """, Integer.class, MANAGER_ACCOUNT_ID);
        assertThat(salesOrderListRows)
                .as("SALES 그룹 grant page sales.partner-order.list 는 active 행이 1개여야 한다")
                .isOne();

        // [Absence assert] accounting.edit-requests 의 can_view 가 SALES 로 전환 후 FALSE 임을 검증.
        //
        // 근거:
        //   - V28: accounting.edit-requests 는 MASTER(view+edit) / MANAGER(view) / ACCOUNTANT(view+edit) 전용.
        //   - V37: CROSS JOIN 11-role matrix 로 인해 SALES 에도 can_view=FALSE, can_edit=FALSE 행이 삽입됨.
        //   - 결과: group102 group_page_permissions 에 accounting.edit-requests 행이 존재하나 can_view=FALSE.
        //   - materializer 는 이 행을 account_page_permissions 에 active(is_deleted=FALSE) 행으로 저장하지만
        //     can_view=FALSE 임.
        //   - MANAGER 그룹(group101) 은 can_view=TRUE 인 반면, SALES 로 전환 후에는 can_view=FALSE 여야 한다.
        //   - 이 assert 로 role-group swap 이 accounting.edit-requests 의 can_view 를 TRUE→FALSE 로 바꿨음을 실증.
        Integer canViewTrueRows = jdbc.queryForObject("""
                SELECT COUNT(*) FROM account_page_permissions
                WHERE account_id = ?
                  AND page_code = 'accounting.edit-requests'
                  AND can_view = TRUE
                  AND is_deleted = FALSE
                """, Integer.class, MANAGER_ACCOUNT_ID);
        assertThat(canViewTrueRows)
                .as("MANAGER 전용 page accounting.edit-requests 의 can_view 는 SALES 전환 후 TRUE 가 아니어야 한다")
                .isZero();
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
    // P1-a 시나리오 4: 다중 빌트인 그룹 배속 → 역할 변경 시 전체 정리
    // -------------------------------------------------------------------------

    /**
     * P1-a 핵심 케이스 — 이례적으로 빌트인 그룹이 2개+ 활성인 계정의 역할 변경 시
     * 모든 구 빌트인 그룹이 soft-delete 되고 신규 단일 그룹만 활성으로 남는다.
     *
     * <p>정상 운영(단일 배속)에서 발생하지 않지만, 데이터 이상/마이그레이션 결함으로
     * 2개+ 빌트인 그룹이 활성인 경우를 방어한다.
     *
     * <p>시나리오:
     * <ul>
     *   <li>MULTI_BUILTIN_ACCOUNT_ID — group101(MANAGER) + group102(SALES) 동시 활성 배속</li>
     *   <li>updateAccountRole(WAREHOUSE) 호출</li>
     *   <li>결과: group101, group102 모두 soft-delete + group103(WAREHOUSE) 단일 활성</li>
     * </ul>
     */
    @Test
    @DisplayName("P1-a: 다중 빌트인 그룹(MANAGER+SALES) 배속 계정 → WAREHOUSE 변경 시 구 빌트인 그룹 전체 정리 + 신규 단일")
    void updateAccountRole_multipleBuiltinGroups_allOldBuiltinGroupsCleaned() {
        // given: MULTI_BUILTIN_ACCOUNT_ID 에 MANAGER + SALES 빌트인 그룹 동시 배속 (이상 상태 재현)
        seedAccount(MULTI_BUILTIN_ACCOUNT_ID, "c3a_multi_builtin", "C3a Multi Builtin", "MANAGER");
        assignGroup(MULTI_BUILTIN_ACCOUNT_ID, MANAGER_GROUP_ID, "it-multi-builtin-setup");
        assignGroup(MULTI_BUILTIN_ACCOUNT_ID, SALES_GROUP_ID,   "it-multi-builtin-setup");

        // 사전 검증: 두 빌트인 그룹이 모두 활성임을 확인
        Integer beforeManager = jdbc.queryForObject("""
                SELECT COUNT(*) FROM account_groups
                WHERE account_id = ? AND group_id = ? AND is_deleted = FALSE
                """, Integer.class, MULTI_BUILTIN_ACCOUNT_ID, MANAGER_GROUP_ID);
        assertThat(beforeManager).as("시작 전 MANAGER 빌트인 그룹 활성").isOne();
        Integer beforeSales = jdbc.queryForObject("""
                SELECT COUNT(*) FROM account_groups
                WHERE account_id = ? AND group_id = ? AND is_deleted = FALSE
                """, Integer.class, MULTI_BUILTIN_ACCOUNT_ID, SALES_GROUP_ID);
        assertThat(beforeSales).as("시작 전 SALES 빌트인 그룹 활성").isOne();

        // when
        authService.updateAccountRole(MULTI_BUILTIN_ACCOUNT_ID, Role.WAREHOUSE);

        // then: MANAGER 빌트인 그룹 soft-delete
        Integer afterManager = jdbc.queryForObject("""
                SELECT COUNT(*) FROM account_groups
                WHERE account_id = ? AND group_id = ? AND is_deleted = FALSE
                """, Integer.class, MULTI_BUILTIN_ACCOUNT_ID, MANAGER_GROUP_ID);
        assertThat(afterManager).as("WAREHOUSE 전환 후 MANAGER 빌트인 그룹 정리됨").isZero();

        // then: SALES 빌트인 그룹 soft-delete
        Integer afterSales = jdbc.queryForObject("""
                SELECT COUNT(*) FROM account_groups
                WHERE account_id = ? AND group_id = ? AND is_deleted = FALSE
                """, Integer.class, MULTI_BUILTIN_ACCOUNT_ID, SALES_GROUP_ID);
        assertThat(afterSales).as("WAREHOUSE 전환 후 SALES 빌트인 그룹 정리됨").isZero();

        // then: WAREHOUSE 빌트인 그룹 단일 활성
        Integer afterWarehouse = jdbc.queryForObject("""
                SELECT COUNT(*) FROM account_groups
                WHERE account_id = ? AND group_id = ? AND is_deleted = FALSE
                """, Integer.class, MULTI_BUILTIN_ACCOUNT_ID, WAREHOUSE_GROUP_ID);
        assertThat(afterWarehouse).as("WAREHOUSE 전환 후 WAREHOUSE 빌트인 그룹 단일 활성").isOne();

        // then: 활성 빌트인 그룹은 정확히 1개 (WAREHOUSE 만)
        Integer totalActiveBuiltin = jdbc.queryForObject("""
                SELECT COUNT(*) FROM account_groups ag
                WHERE ag.account_id = ?
                  AND ag.is_deleted = FALSE
                  AND ag.group_id IN (
                      '00000000-0000-0000-0000-000000000100',
                      '00000000-0000-0000-0000-000000000101',
                      '00000000-0000-0000-0000-000000000102',
                      '00000000-0000-0000-0000-000000000103',
                      '00000000-0000-0000-0000-000000000104',
                      '00000000-0000-0000-0000-000000000105',
                      '00000000-0000-0000-0000-000000000106',
                      '00000000-0000-0000-0000-000000000107',
                      '00000000-0000-0000-0000-000000000108',
                      '00000000-0000-0000-0000-000000000109'
                  )
                """, Integer.class, MULTI_BUILTIN_ACCOUNT_ID);
        assertThat(totalActiveBuiltin)
                .as("전환 후 활성 빌트인 그룹은 정확히 1개여야 한다")
                .isOne();
    }

    /**
     * P1-a 정상 운영 동작 불변성 검증 — 단일 빌트인 그룹 배속 계정의 역할 변경이
     * 기존 동작과 동일하게 수행됨을 보장한다.
     */
    @Test
    @DisplayName("P1-a 정상 경로: 단일 빌트인 그룹 배속 계정 역할 변경 시 동작 불변성 유지")
    void updateAccountRole_singleBuiltinGroup_behaviorPreserved() {
        // MANAGER_ACCOUNT_ID 는 setUp 에서 group101(MANAGER) + MANUAL_GROUP 배속됨
        authService.updateAccountRole(MANAGER_ACCOUNT_ID, Role.WAREHOUSE);

        // MANAGER 빌트인 그룹 soft-delete
        Integer afterManager = jdbc.queryForObject("""
                SELECT COUNT(*) FROM account_groups
                WHERE account_id = ? AND group_id = ? AND is_deleted = FALSE
                """, Integer.class, MANAGER_ACCOUNT_ID, MANAGER_GROUP_ID);
        assertThat(afterManager).as("WAREHOUSE 전환 후 MANAGER 빌트인 그룹 정리됨").isZero();

        // WAREHOUSE 빌트인 그룹 단일 활성
        Integer afterWarehouse = jdbc.queryForObject("""
                SELECT COUNT(*) FROM account_groups
                WHERE account_id = ? AND group_id = ? AND is_deleted = FALSE
                """, Integer.class, MANAGER_ACCOUNT_ID, WAREHOUSE_GROUP_ID);
        assertThat(afterWarehouse).as("WAREHOUSE 전환 후 WAREHOUSE 빌트인 그룹 단일 활성").isOne();

        // 수동 배속 그룹 보존
        Integer activeManualGroup = jdbc.queryForObject("""
                SELECT COUNT(*) FROM account_groups
                WHERE account_id = ? AND group_id = ? AND is_deleted = FALSE
                """, Integer.class, MANAGER_ACCOUNT_ID, MANUAL_GROUP_ID);
        assertThat(activeManualGroup).as("수동 배속 그룹 보존됨").isOne();
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

    /**
     * 테스트 계정 시드 — C5-5 이후 role 컬럼 없음(V46 DROP).
     * 역할 표현은 이후 {@link #assignGroup} 빌트인 그룹 배속으로 완결된다.
     *
     * <p>P2: {@code role} 파라미터는 호출부 가독성(어떤 역할로 시드하는지 의도 표시) 목적으로만 존재한다.
     * V46 DROP 이후 accounts 테이블에 role 컬럼이 없어 실제로 DB 에 쓰이지 않는다.
     * {@code @SuppressWarnings("unused")} 는 컴파일 경고를 억제하기 위한 의도적 어노테이션이다.
     *
     * @param id          계정 UUID
     * @param loginId     로그인 아이디
     * @param displayName 표시 이름
     * @param role        (의도 표시 전용) 역할 — accounts 테이블에 저장되지 않음
     */
    private void seedAccount(UUID id, String loginId, String displayName, @SuppressWarnings("unused") String role) {
        jdbc.update("""
                INSERT INTO accounts (
                    id, login_id, password_hash, display_name, enabled,
                    failed_login_attempts, locked_at,
                    password_changed_at, password_history,
                    password_change_required,
                    created_at, created_by, modified_at, modified_by, is_deleted
                ) VALUES (
                    ?, ?,
                    '$2a$12$6cxHjNrguvlnEE.4s4jrAOuGNGGmHPc4Gg8/MuMBHYh/B.Q4sU/xu',
                    ?, TRUE,
                    0, NULL,
                    NOW(), '[]'::jsonb,
                    FALSE,
                    NOW(), 'it-c3a', NOW(), 'it-c3a', FALSE
                )
                """, id, loginId, displayName);
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
        // MANAGER_ACCOUNT_ID / MASTER_ACCOUNT_ID / MULTI_BUILTIN_ACCOUNT_ID 는
        // setUp 에서 고정 UUID 로 직접 INSERT 하므로 정리 대상.
        // NEW_ACCOUNT_ID 는 registerWithId 의 JPA merge 후 실제 계정 UUID 가 다를 수 있으므로
        // 여기서 DELETE 해도 no-op이 된다. 신규 등록 계정의 실 정리는 tearDown 의 registeredAccountId 경로가 담당한다.
        UUID[] accounts = {MANAGER_ACCOUNT_ID, MASTER_ACCOUNT_ID, MULTI_BUILTIN_ACCOUNT_ID};
        for (UUID id : accounts) {
            jdbc.update("DELETE FROM account_page_permissions WHERE account_id = ?", id);
            jdbc.update("DELETE FROM account_groups WHERE account_id = ?", id);
            jdbc.update("DELETE FROM accounts WHERE id = ?", id);
        }
        jdbc.update("DELETE FROM permission_groups WHERE id = ?", MANUAL_GROUP_ID);
    }
}
