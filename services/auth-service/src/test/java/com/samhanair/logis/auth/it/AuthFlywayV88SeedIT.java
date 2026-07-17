package com.samhanair.logis.auth.it;

import static org.assertj.core.api.Assertions.assertThat;

import com.samhanair.logis.auth.AuthServiceApplication;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.core.io.ClassPathResource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.init.ScriptUtils;
import org.springframework.boot.test.context.SpringBootTest;

/** V88 ACCOUNTANT partners.search 권한 seed와 override-aware materialize 행동 검증. */
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

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @BeforeEach
    void setUpFixturesAndRerunV88() throws Exception {
        cleanFixtures();
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

        // 역할/그룹/계정 캐시를 실제 V88 migration 파일로 재실행한다.
        try (var connection = jdbcTemplate.getDataSource().getConnection()) {
            ScriptUtils.executeSqlScript(connection,
                    new org.springframework.core.io.support.EncodedResource(
                            new ClassPathResource("db/migration/V88__seed_partner_search_accountant_view.sql")));
        }

        // V88 대상이 아닌 MANAGER 단독 계정의 캐시를 기준값으로 만든다.
        jdbcTemplate.update("""
                INSERT INTO account_page_permissions
                    (id, account_id, page_code, can_view, can_create, can_update, can_delete,
                     can_restore, can_download, can_print, created_at, created_by, modified_at,
                     modified_by, is_deleted)
                VALUES (gen_random_uuid(), ?, ?, FALSE, FALSE, TRUE, FALSE, FALSE, FALSE, FALSE,
                        NOW(), 'it-v88-manager-baseline', NOW(), 'it-v88-manager-baseline', FALSE)
                """, MANAGER_ACCOUNT_ID, PAGE_CODE);
    }

    @AfterEach
    void tearDownFixtures() {
        cleanFixtures();
    }

    @Test
    @DisplayName("V88은 ACCOUNTANT role/template/group의 partners.search VIEW를 켜고 다른 action을 보존한다")
    void accountantSourceRowsGrantViewAndPreserveActions() {
        Map<String, Object> role = jdbcTemplate.queryForMap("""
                SELECT can_view, can_edit FROM role_page_permissions
                 WHERE role_code = 'ACCOUNTANT' AND page_code = ? AND is_deleted = FALSE
                """, PAGE_CODE);
        assertThat(role.get("can_view")).isEqualTo(true);
        assertThat(role.get("can_edit")).isEqualTo(true);

        Map<String, Object> template = jdbcTemplate.queryForMap("""
                SELECT can_view, can_create, can_update, can_delete, can_restore, can_download, can_print
                  FROM role_page_permission_templates
                 WHERE role_code = 'ACCOUNTANT' AND page_code = ? AND is_deleted = FALSE
                """, PAGE_CODE);
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
        Map<String, Object> manager = permissionRow(MANAGER_ACCOUNT_ID, "account_page_permissions");
        assertThat(manager.get("can_view")).isEqualTo(false);
        assertThat(manager.get("can_update")).isEqualTo(true);

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
}
