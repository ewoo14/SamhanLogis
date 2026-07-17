package com.samhanair.logis.auth.it;

import static org.assertj.core.api.Assertions.assertThat;

import com.samhanair.logis.auth.AuthServiceApplication;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.core.io.ClassPathResource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.init.ScriptUtils;
import org.springframework.boot.test.context.SpringBootTest;

/**
 * V88 ACCOUNTANT partners.search 권한 seed와 override-aware materialize 행동 검증.
 *
 * <p>본 IT는 실 빌트인 seed 행(ACCOUNTANT role/template + 그룹 104/101 partners.search)을
 * 의도적으로 변형한 뒤 실제 V88 migration 파일을 재실행한다. static 공유 Testcontainer 를
 * 전 auth IT 가 공유하므로, 종료 시 잔여 오염 0 이 격리 계약이다:
 * <ol>
 *   <li>{@code @BeforeEach} 에서 변형 대상 공유 seed 행의 변형 전 값을 스냅샷</li>
 *   <li>{@code @AfterEach} 에서 테스트 계정 제거 → 스냅샷 원복 → V88 재실행으로 실 그룹 104
 *       계정의 {@code account_page_permissions} 캐시를 정상 프로덕션 상태(V88 정상 적용
 *       결과)로 재-materialize</li>
 *   <li>{@code @AfterAll} 에서 공유 seed 행이 클래스 시작 시점 값과 동일한지 + 그룹 104
 *       partners.search VIEW/실 계정 캐시가 정상인지 자가 검증 (컨테이너가 JVM 과 함께
 *       소멸하므로 사후 psql 확인의 등가물)</li>
 * </ol>
 */
@SpringBootTest(classes = AuthServiceApplication.class, webEnvironment = SpringBootTest.WebEnvironment.NONE)
class AuthFlywayV88SeedIT extends AbstractPostgresIT {

    private static final UUID ACCOUNTANT_ACCOUNT_ID =
            UUID.fromString("a0000000-0000-0000-0000-000000008801");
    private static final UUID OVERRIDE_ACCOUNT_ID =
            UUID.fromString("a0000000-0000-0000-0000-000000008802");
    private static final UUID MULTI_GROUP_ACCOUNT_ID =
            UUID.fromString("a0000000-0000-0000-0000-000000008803");
    private static final UUID MANAGER_ACCOUNT_ID =
            UUID.fromString("a0000000-0000-0000-0000-000000008804");
    private static final UUID MASTER_ACCOUNT_ID =
            UUID.fromString("a0000000-0000-0000-0000-000000008805");

    private static final UUID MASTER_GROUP_ID =
            UUID.fromString("00000000-0000-0000-0000-000000000100");
    private static final UUID MANAGER_GROUP_ID =
            UUID.fromString("00000000-0000-0000-0000-000000000101");
    private static final UUID ACCOUNTANT_GROUP_ID =
            UUID.fromString("00000000-0000-0000-0000-000000000104");
    private static final String PAGE_CODE = "partners.search";

    /** 공유 seed 행 스냅샷/원복/자가검증 공용 조회 SQL. */
    private static final String ROLE_ROW_SQL = """
            SELECT can_view, can_edit FROM role_page_permissions
             WHERE role_code = 'ACCOUNTANT' AND page_code = ? AND is_deleted = FALSE
            """;
    private static final String TEMPLATE_ROW_SQL = """
            SELECT can_view, can_create, can_update, can_delete, can_restore, can_download, can_print
              FROM role_page_permission_templates
             WHERE role_code = 'ACCOUNTANT' AND page_code = ? AND is_deleted = FALSE
            """;
    private static final String GROUP_ROW_SQL = """
            SELECT can_view, can_create, can_update, can_delete, can_restore, can_download, can_print
              FROM group_page_permissions
             WHERE group_id = ? AND page_code = ? AND is_deleted = FALSE
            """;

    /**
     * 그룹 104 소속 실 계정(마스터 제외·해당 page override 부재·enabled) 중 partners.search
     * VIEW 캐시가 재계산되지 않은 계정 수 — 격리 복원 후 0 이어야 한다.
     */
    private static final String GROUP104_UNMATERIALIZED_VIEW_SQL = """
            SELECT COUNT(*) FROM accounts a
             WHERE a.is_deleted = FALSE
               AND a.enabled = TRUE
               AND EXISTS (SELECT 1 FROM account_groups ag
                            WHERE ag.account_id = a.id AND ag.group_id = ?
                              AND ag.is_deleted = FALSE)
               AND NOT EXISTS (SELECT 1
                                 FROM account_groups mag
                                 JOIN permission_groups mpg
                                   ON mpg.id = mag.group_id
                                  AND mpg.is_deleted = FALSE
                                  AND mpg.is_system_master = TRUE
                                WHERE mag.account_id = a.id AND mag.is_deleted = FALSE)
               AND NOT EXISTS (SELECT 1 FROM account_permission_overrides apo
                                WHERE apo.account_id = a.id AND apo.page_code = ?
                                  AND apo.is_deleted = FALSE)
               AND NOT EXISTS (SELECT 1 FROM account_page_permissions app
                                WHERE app.account_id = a.id AND app.page_code = ?
                                  AND app.can_view = TRUE AND app.is_deleted = FALSE)
            """;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    /** 변형 전 실 seed 행 스냅샷 — {@code @AfterEach} 원복용 (공유 DB 격리 계약). */
    private Map<String, Object> pristineRoleRow;
    private Map<String, Object> pristineTemplateRow;
    private Map<String, Object> pristineAccountantGroupRow;
    private Map<String, Object> pristineManagerGroupRow;

    /** 클래스 시작 시점 스냅샷 — {@code @AfterAll} 잔여 오염 0 자가 검증용. */
    private static JdbcTemplate verificationJdbcTemplate;
    private static boolean classStartCaptured = false;
    private static Map<String, Object> classStartRoleRow;
    private static Map<String, Object> classStartTemplateRow;
    private static Map<String, Object> classStartAccountantGroupRow;
    private static Map<String, Object> classStartManagerGroupRow;

    @BeforeEach
    void setUpFixturesAndRerunV88() throws Exception {
        cleanFixtures();
        snapshotSharedSeedRows();

        seedAccount(ACCOUNTANT_ACCOUNT_ID, "it-v88-accountant");
        seedAccount(OVERRIDE_ACCOUNT_ID, "it-v88-override");
        seedAccount(MULTI_GROUP_ACCOUNT_ID, "it-v88-multi");
        seedAccount(MANAGER_ACCOUNT_ID, "it-v88-manager");
        seedAccount(MASTER_ACCOUNT_ID, "it-v88-master");

        assignGroup(ACCOUNTANT_ACCOUNT_ID, ACCOUNTANT_GROUP_ID);
        assignGroup(OVERRIDE_ACCOUNT_ID, ACCOUNTANT_GROUP_ID);
        assignGroup(OVERRIDE_ACCOUNT_ID, MANAGER_GROUP_ID);
        assignGroup(MULTI_GROUP_ACCOUNT_ID, ACCOUNTANT_GROUP_ID);
        assignGroup(MULTI_GROUP_ACCOUNT_ID, MANAGER_GROUP_ID);
        assignGroup(MANAGER_ACCOUNT_ID, MANAGER_GROUP_ID);
        assignGroup(MASTER_ACCOUNT_ID, MASTER_GROUP_ID);
        assignGroup(MASTER_ACCOUNT_ID, ACCOUNTANT_GROUP_ID);

        // 기존 source action을 의도적으로 TRUE/FALSE로 섞어 V88이 can_view만 바꾸는지 검증한다.
        jdbcTemplate.update("""
                UPDATE role_page_permissions
                   SET can_view = FALSE, can_edit = TRUE
                 WHERE role_code = 'ACCOUNTANT' AND page_code = ? AND is_deleted = FALSE
                """, PAGE_CODE);
        jdbcTemplate.update("""
                UPDATE role_page_permission_templates
                   SET can_view = FALSE, can_create = TRUE, can_update = TRUE,
                       can_delete = TRUE, can_restore = TRUE, can_download = TRUE, can_print = TRUE
                 WHERE role_code = 'ACCOUNTANT' AND page_code = ? AND is_deleted = FALSE
                """, PAGE_CODE);
        jdbcTemplate.update("""
                UPDATE group_page_permissions
                   SET can_view = FALSE, can_create = TRUE, can_update = FALSE,
                       can_delete = TRUE, can_restore = TRUE, can_download = TRUE, can_print = TRUE
                 WHERE group_id = ? AND page_code = ? AND is_deleted = FALSE
                """, ACCOUNTANT_GROUP_ID, PAGE_CODE);
        jdbcTemplate.update("""
                UPDATE group_page_permissions
                   SET can_view = FALSE, can_create = FALSE, can_update = TRUE,
                       can_delete = FALSE, can_restore = FALSE, can_download = FALSE, can_print = FALSE
                 WHERE group_id = ? AND page_code = ? AND is_deleted = FALSE
                """, MANAGER_GROUP_ID, PAGE_CODE);

        jdbcTemplate.update("""
                INSERT INTO account_permission_overrides
                    (id, account_id, page_code, can_view, can_create, can_update, can_delete,
                     can_restore, can_download, can_print, created_at, created_by, modified_at,
                     modified_by, is_deleted)
                VALUES (gen_random_uuid(), ?, ?, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE,
                        NOW(), 'it-v88-deny', NOW(), 'it-v88-deny', FALSE)
                """, OVERRIDE_ACCOUNT_ID, PAGE_CODE);

        // V88 대상이 아닌 MANAGER 단독 계정의 캐시 기준값은 반드시 V88 실행 "전"에 insert 한다.
        // (V88 실행 후 insert 하면 "V88이 이 행을 건드리지 않았다"는 단언이 동어반복이 된다.)
        // can_print=TRUE 는 그룹 101 변형행 파생값(FALSE)과 다른 판별 컬럼 — V88이 전 계정
        // 재계산으로 개악되면 이 값이 뒤집혀 반드시 적발된다.
        jdbcTemplate.update("""
                INSERT INTO account_page_permissions
                    (id, account_id, page_code, can_view, can_create, can_update, can_delete,
                     can_restore, can_download, can_print, created_at, created_by, modified_at,
                     modified_by, is_deleted)
                VALUES (gen_random_uuid(), ?, ?, FALSE, FALSE, TRUE, FALSE, FALSE, FALSE, TRUE,
                        NOW(), 'it-v88-manager-baseline', NOW(), 'it-v88-manager-baseline', FALSE)
                """, MANAGER_ACCOUNT_ID, PAGE_CODE);

        // 역할/그룹/계정 캐시를 실제 V88 migration 파일로 재실행한다.
        runV88Script();
    }

    /**
     * 공유 DB 격리 복원 — 테스트 계정 제거 → 공유 seed 행 스냅샷 원복 → V88 재실행으로
     * 실 그룹 104 계정 캐시를 정상 프로덕션 상태로 재-materialize 한다.
     */
    @AfterEach
    void tearDownFixtures() throws Exception {
        cleanFixtures();
        restoreSharedSeedRows();
        runV88Script();
    }

    /**
     * 격리 계약 자가 검증 — 컨테이너가 테스트 JVM 과 함께 소멸하므로 사후 psql 확인 대신,
     * 마지막 {@code @AfterEach} 직후 같은 DB에서 잔여 오염 0 을 단언한다:
     * 공유 seed 행 4개 = 클래스 시작 시점 값, 그룹 104 partners.search VIEW=TRUE (V88 정상
     * 적용 결과), 그룹 104 소속 실 계정 캐시 VIEW 재계산 누락 0.
     */
    @AfterAll
    static void verifySharedStateRestored() {
        if (!classStartCaptured || verificationJdbcTemplate == null) {
            return;
        }
        JdbcTemplate jdbc = verificationJdbcTemplate;

        Map<String, Object> role = firstRowOrNull(jdbc, ROLE_ROW_SQL, PAGE_CODE);
        Map<String, Object> template = firstRowOrNull(jdbc, TEMPLATE_ROW_SQL, PAGE_CODE);
        Map<String, Object> accountantGroup =
                firstRowOrNull(jdbc, GROUP_ROW_SQL, ACCOUNTANT_GROUP_ID, PAGE_CODE);
        Map<String, Object> managerGroup =
                firstRowOrNull(jdbc, GROUP_ROW_SQL, MANAGER_GROUP_ID, PAGE_CODE);

        assertThat(role).as("role_page_permissions 잔여 오염").isEqualTo(classStartRoleRow);
        assertThat(template).as("role_page_permission_templates 잔여 오염")
                .isEqualTo(classStartTemplateRow);
        assertThat(accountantGroup).as("group_page_permissions(104) 잔여 오염")
                .isEqualTo(classStartAccountantGroupRow);
        assertThat(managerGroup).as("group_page_permissions(101) 잔여 오염")
                .isEqualTo(classStartManagerGroupRow);

        // V88 정상 적용 하드 계약 — 복원 후에도 그룹 104 partners.search VIEW 는 TRUE.
        assertThat(accountantGroup).as("group104 partners.search 행 존재").isNotNull();
        assertThat(accountantGroup.get("can_view")).as("group104 partners.search VIEW")
                .isEqualTo(true);

        Integer unmaterialized = jdbc.queryForObject(GROUP104_UNMATERIALIZED_VIEW_SQL,
                Integer.class, ACCOUNTANT_GROUP_ID, PAGE_CODE, PAGE_CODE);
        assertThat(unmaterialized).as("그룹 104 실 계정 partners.search VIEW 캐시 재계산 누락 수")
                .isZero();

        System.out.println("[AuthFlywayV88SeedIT] 격리 복원 확인 — group104 partners.search="
                + accountantGroup + ", group101 partners.search=" + managerGroup);
    }

    @Test
    @DisplayName("V88은 ACCOUNTANT role/template/group의 partners.search VIEW를 켜고 다른 action을 보존한다")
    void accountantSourceRowsGrantViewAndPreserveActions() {
        Map<String, Object> role = jdbcTemplate.queryForMap(ROLE_ROW_SQL, PAGE_CODE);
        assertThat(role.get("can_view")).isEqualTo(true);
        assertThat(role.get("can_edit")).isEqualTo(true);

        Map<String, Object> template = jdbcTemplate.queryForMap(TEMPLATE_ROW_SQL, PAGE_CODE);
        assertThat(template).containsEntry("can_view", true)
                .containsEntry("can_create", true).containsEntry("can_update", true)
                .containsEntry("can_delete", true).containsEntry("can_restore", true)
                .containsEntry("can_download", true).containsEntry("can_print", true);

        Map<String, Object> group = permissionRow(ACCOUNTANT_GROUP_ID, "group_page_permissions");
        assertThat(group).containsEntry("can_view", true)
                .containsEntry("can_create", true).containsEntry("can_update", false)
                .containsEntry("can_delete", true).containsEntry("can_restore", true)
                .containsEntry("can_download", true).containsEntry("can_print", true);
    }

    @Test
    @DisplayName("V88은 활성 deny override를 그룹 VIEW보다 우선한다")
    void denyOverrideRemainsFalse() {
        Map<String, Object> row = permissionRow(OVERRIDE_ACCOUNT_ID, "account_page_permissions");
        assertThat(row.get("can_view")).isEqualTo(false);
        assertThat(row.get("can_create")).isEqualTo(false);
        assertThat(row.get("can_update")).isEqualTo(false);
    }

    @Test
    @DisplayName("V88은 다중 그룹 action을 BOOL_OR로 materialize한다")
    void multipleGroupsAreUnioned() {
        Map<String, Object> row = permissionRow(MULTI_GROUP_ACCOUNT_ID, "account_page_permissions");
        assertThat(row.get("can_view")).isEqualTo(true);
        assertThat(row.get("can_create")).isEqualTo(true);
        assertThat(row.get("can_update")).isEqualTo(true);
    }

    @Test
    @DisplayName("V88은 partners.search를 가진 ACCOUNTANT가 아닌 역할과 master를 확장하지 않는다")
    void managerAndMasterRemainUnchanged() {
        // baseline은 V88 실행 "전"에 insert 됐으므로(setUp), 여기서의 불변 단언은
        // "V88이 그룹 104 미소속 계정을 건드리지 않음"을 진짜로 증명한다.
        // can_print=TRUE(그룹 101 파생값과 상이) + modified_by 로 개악 재계산도 적발한다.
        Map<String, Object> manager = jdbcTemplate.queryForMap("""
                SELECT can_view, can_update, can_print, modified_by
                  FROM account_page_permissions
                 WHERE account_id = ? AND page_code = ? AND is_deleted = FALSE
                """, MANAGER_ACCOUNT_ID, PAGE_CODE);
        assertThat(manager.get("can_view")).isEqualTo(false);
        assertThat(manager.get("can_update")).isEqualTo(true);
        assertThat(manager.get("can_print")).isEqualTo(true);
        assertThat(manager.get("modified_by")).isEqualTo("it-v88-manager-baseline");

        Integer masterRows = jdbcTemplate.queryForObject("""
                SELECT COUNT(*) FROM account_page_permissions
                 WHERE account_id = ? AND page_code = ? AND is_deleted = FALSE
                """, Integer.class, MASTER_ACCOUNT_ID, PAGE_CODE);
        assertThat(masterRows).isZero();
    }

    private Map<String, Object> permissionRow(UUID id, String table) {
        String idColumn = table.equals("group_page_permissions") ? "group_id" : "account_id";
        return jdbcTemplate.queryForMap("""
                SELECT can_view, can_create, can_update, can_delete, can_restore, can_download, can_print
                  FROM %s
                 WHERE %s = ? AND page_code = ? AND is_deleted = FALSE
                """.formatted(table, idColumn), id, PAGE_CODE);
    }

    private void seedAccount(UUID id, String loginId) {
        jdbcTemplate.update("""
                INSERT INTO accounts (
                    id, login_id, password_hash, display_name, enabled, failed_login_attempts,
                    locked_at, password_changed_at, password_history, password_change_required,
                    created_at, created_by, modified_at, modified_by, is_deleted
                ) VALUES (?, ?, '$2a$12$6cxHjNrguvlnEE.4s4jrAOuGNGGmHPc4Gg8/MuMBHYh/B.Q4sU/xu',
                          ?, TRUE, 0, NULL, NOW(), '[]'::jsonb, FALSE, NOW(), 'it-v88',
                          NOW(), 'it-v88', FALSE)
                """, id, loginId, loginId);
    }

    private void assignGroup(UUID accountId, UUID groupId) {
        jdbcTemplate.update("""
                INSERT INTO account_groups
                    (id, account_id, group_id, created_at, created_by, modified_at, modified_by, is_deleted)
                VALUES (gen_random_uuid(), ?, ?, NOW(), 'it-v88', NOW(), 'it-v88', FALSE)
                """, accountId, groupId);
    }

    private void cleanFixtures() {
        jdbcTemplate.update("DELETE FROM account_page_permissions WHERE account_id IN (?, ?, ?, ?, ?)",
                ACCOUNTANT_ACCOUNT_ID, OVERRIDE_ACCOUNT_ID, MULTI_GROUP_ACCOUNT_ID,
                MANAGER_ACCOUNT_ID, MASTER_ACCOUNT_ID);
        jdbcTemplate.update("DELETE FROM account_permission_overrides WHERE account_id IN (?, ?, ?, ?, ?)",
                ACCOUNTANT_ACCOUNT_ID, OVERRIDE_ACCOUNT_ID, MULTI_GROUP_ACCOUNT_ID,
                MANAGER_ACCOUNT_ID, MASTER_ACCOUNT_ID);
        jdbcTemplate.update("DELETE FROM account_groups WHERE account_id IN (?, ?, ?, ?, ?)",
                ACCOUNTANT_ACCOUNT_ID, OVERRIDE_ACCOUNT_ID, MULTI_GROUP_ACCOUNT_ID,
                MANAGER_ACCOUNT_ID, MASTER_ACCOUNT_ID);
        jdbcTemplate.update("DELETE FROM accounts WHERE id IN (?, ?, ?, ?, ?)",
                ACCOUNTANT_ACCOUNT_ID, OVERRIDE_ACCOUNT_ID, MULTI_GROUP_ACCOUNT_ID,
                MANAGER_ACCOUNT_ID, MASTER_ACCOUNT_ID);
    }

    /** 실제 V88 migration 파일을 현재 DB에 실행한다 (setup 재실행 + teardown 정상 재계산 공용). */
    private void runV88Script() throws Exception {
        try (var connection = jdbcTemplate.getDataSource().getConnection()) {
            ScriptUtils.executeSqlScript(connection,
                    new org.springframework.core.io.support.EncodedResource(
                            new ClassPathResource("db/migration/V88__seed_partner_search_accountant_view.sql")));
        }
    }

    /** 변형 대상 공유 seed 행(ACCOUNTANT role/template + 그룹 104/101)의 현재 값을 스냅샷한다. */
    private void snapshotSharedSeedRows() {
        pristineRoleRow = firstRowOrNull(jdbcTemplate, ROLE_ROW_SQL, PAGE_CODE);
        pristineTemplateRow = firstRowOrNull(jdbcTemplate, TEMPLATE_ROW_SQL, PAGE_CODE);
        pristineAccountantGroupRow =
                firstRowOrNull(jdbcTemplate, GROUP_ROW_SQL, ACCOUNTANT_GROUP_ID, PAGE_CODE);
        pristineManagerGroupRow =
                firstRowOrNull(jdbcTemplate, GROUP_ROW_SQL, MANAGER_GROUP_ID, PAGE_CODE);

        verificationJdbcTemplate = jdbcTemplate;
        if (!classStartCaptured) {
            classStartRoleRow = pristineRoleRow;
            classStartTemplateRow = pristineTemplateRow;
            classStartAccountantGroupRow = pristineAccountantGroupRow;
            classStartManagerGroupRow = pristineManagerGroupRow;
            classStartCaptured = true;
        }
    }

    /** 스냅샷해 둔 공유 seed 행 값을 원복한다. 스냅샷이 없던 행(원래 부재)은 건드리지 않는다. */
    private void restoreSharedSeedRows() {
        if (pristineRoleRow != null) {
            jdbcTemplate.update("""
                    UPDATE role_page_permissions
                       SET can_view = ?, can_edit = ?
                     WHERE role_code = 'ACCOUNTANT' AND page_code = ? AND is_deleted = FALSE
                    """, pristineRoleRow.get("can_view"), pristineRoleRow.get("can_edit"), PAGE_CODE);
        }
        if (pristineTemplateRow != null) {
            jdbcTemplate.update("""
                    UPDATE role_page_permission_templates
                       SET can_view = ?, can_create = ?, can_update = ?, can_delete = ?,
                           can_restore = ?, can_download = ?, can_print = ?
                     WHERE role_code = 'ACCOUNTANT' AND page_code = ? AND is_deleted = FALSE
                    """,
                    pristineTemplateRow.get("can_view"), pristineTemplateRow.get("can_create"),
                    pristineTemplateRow.get("can_update"), pristineTemplateRow.get("can_delete"),
                    pristineTemplateRow.get("can_restore"), pristineTemplateRow.get("can_download"),
                    pristineTemplateRow.get("can_print"), PAGE_CODE);
        }
        restoreGroupRow(ACCOUNTANT_GROUP_ID, pristineAccountantGroupRow);
        restoreGroupRow(MANAGER_GROUP_ID, pristineManagerGroupRow);
    }

    /** 그룹 partners.search 행 하나를 스냅샷 값으로 원복한다. */
    private void restoreGroupRow(UUID groupId, Map<String, Object> snapshot) {
        if (snapshot == null) {
            return;
        }
        jdbcTemplate.update("""
                UPDATE group_page_permissions
                   SET can_view = ?, can_create = ?, can_update = ?, can_delete = ?,
                       can_restore = ?, can_download = ?, can_print = ?
                 WHERE group_id = ? AND page_code = ? AND is_deleted = FALSE
                """,
                snapshot.get("can_view"), snapshot.get("can_create"), snapshot.get("can_update"),
                snapshot.get("can_delete"), snapshot.get("can_restore"), snapshot.get("can_download"),
                snapshot.get("can_print"), groupId, PAGE_CODE);
    }

    /** 단일 행 조회 — 행이 없으면 null (partial unique index 로 활성 행은 최대 1개). */
    private static Map<String, Object> firstRowOrNull(JdbcTemplate jdbc, String sql, Object... args) {
        var rows = jdbc.queryForList(sql, args);
        return rows.isEmpty() ? null : rows.get(0);
    }
}
