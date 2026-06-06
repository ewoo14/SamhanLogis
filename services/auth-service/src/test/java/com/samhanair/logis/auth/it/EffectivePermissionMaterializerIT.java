package com.samhanair.logis.auth.it;

import static org.assertj.core.api.Assertions.assertThat;

import com.samhanair.logis.auth.AuthServiceApplication;
import com.samhanair.logis.auth.service.EffectivePermissionMaterializer;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;

/** 권한그룹 합집합과 계정 override 를 account_page_permissions effective 캐시에 반영하는 IT. */
@SpringBootTest(classes = AuthServiceApplication.class)
class EffectivePermissionMaterializerIT extends AbstractPostgresIT {

    private static final UUID TEST_ACCOUNT_ID =
            UUID.fromString("a0000000-0000-0000-0000-0000000000f1");
    private static final UUID TEST_MASTER_ACCOUNT_ID =
            UUID.fromString("a0000000-0000-0000-0000-0000000000f2");
    private static final UUID MASTER_GROUP_ID =
            UUID.fromString("00000000-0000-0000-0000-000000000100");
    private static final UUID MANAGER_GROUP_ID =
            UUID.fromString("00000000-0000-0000-0000-000000000101");
    private static final UUID ACCOUNTANT_GROUP_ID =
            UUID.fromString("00000000-0000-0000-0000-000000000104");

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Autowired
    private EffectivePermissionMaterializer materializer;

    @BeforeEach
    void setUpTestAccounts() {
        cleanTestRows();
        seedTestAccount(TEST_ACCOUNT_ID, "it_materializer_staff", "[IT] materializer staff", "STAFF");
        seedTestAccount(TEST_MASTER_ACCOUNT_ID, "it_materializer_master", "[IT] materializer master", "STAFF");
        assignTestAccountToGroup(TEST_ACCOUNT_ID, MANAGER_GROUP_ID, "it-manager-account-group");
        assignTestAccountToGroup(TEST_MASTER_ACCOUNT_ID, MASTER_GROUP_ID, "it-master-account-group");
    }

    private void assignTestAccountToGroup(UUID accountId, UUID groupId, String actor) {
        jdbcTemplate.update("""
                INSERT INTO account_groups
                    (id, account_id, group_id, created_at, created_by, modified_at, modified_by, is_deleted)
                VALUES
                    (gen_random_uuid(), ?, ?, NOW(), ?, NOW(), ?, FALSE)
                ON CONFLICT (account_id, group_id) WHERE is_deleted = FALSE DO NOTHING
                """, accountId, groupId, actor, actor);
    }

    @AfterEach
    void tearDownTestAccounts() {
        cleanTestRows();
    }

    @Test
    @DisplayName("계정 다중 그룹은 페이지별 7-action OR 합집합으로 materialize 된다")
    void materializeForAccount_unionsMultipleGroups() {
        assignTestAccountToAccountantGroup();

        materializer.materializeForAccount(TEST_ACCOUNT_ID);

        Map<String, Object> row = permissionRow(TEST_ACCOUNT_ID, "accounting.journals");
        assertThat(row).isNotNull();
        assertThat(row.get("can_view")).isEqualTo(true);
        assertThat(row.get("can_create")).isEqualTo(true);
        assertThat(row.get("can_update")).isEqualTo(true);
        assertThat(row.get("can_download")).isEqualTo(true);
    }

    @Test
    @DisplayName("계정 override 행이 있는 페이지는 그룹 합집합보다 우선하며 명시적 deny 를 표현한다")
    void materializeForAccount_overrideWinsAndCanDeny() {
        assignTestAccountToAccountantGroup();
        jdbcTemplate.update("""
                INSERT INTO account_permission_overrides
                    (id, account_id, page_code,
                     can_view, can_create, can_update, can_delete, can_restore, can_download, can_print,
                     created_at, created_by, modified_at, modified_by, is_deleted)
                VALUES
                    (gen_random_uuid(), ?, 'accounting.journals',
                     FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE,
                     NOW(), 'it-override-deny', NOW(), 'it-override-deny', FALSE)
                """, TEST_ACCOUNT_ID);

        materializer.materializeForAccount(TEST_ACCOUNT_ID);

        Map<String, Object> row = permissionRow(TEST_ACCOUNT_ID, "accounting.journals");
        assertThat(row).isNotNull();
        assertThat(row.get("can_view")).isEqualTo(false);
        assertThat(row.get("can_create")).isEqualTo(false);
        assertThat(row.get("can_update")).isEqualTo(false);
        assertThat(row.get("can_download")).isEqualTo(false);
    }

    @Test
    @DisplayName("MASTER 시스템 그룹 계정은 account_page_permissions 행 없이 bypass 상태를 유지한다")
    void materializeForAccount_masterGroupKeepsNoRows() {
        materializer.materializeForAccount(TEST_MASTER_ACCOUNT_ID);

        Integer activeRows = jdbcTemplate.queryForObject("""
                SELECT COUNT(*)
                FROM account_page_permissions
                WHERE account_id = ?
                  AND is_deleted = FALSE
                """, Integer.class, TEST_MASTER_ACCOUNT_ID);

        assertThat(activeRows).isZero();
    }

    @Test
    @DisplayName("materializeForGroup 은 해당 그룹에 배속된 모든 계정의 effective 권한을 재계산한다")
    void materializeForGroup_recalculatesAssignedAccounts() {
        assignTestAccountToAccountantGroup();

        materializer.materializeForGroup(ACCOUNTANT_GROUP_ID);

        Map<String, Object> row = permissionRow(TEST_ACCOUNT_ID, "accounting.journals");
        assertThat(row).isNotNull();
        assertThat(row.get("can_create")).isEqualTo(true);
        assertThat(row.get("can_download")).isEqualTo(true);
    }

    private void assignTestAccountToAccountantGroup() {
        assignTestAccountToGroup(TEST_ACCOUNT_ID, ACCOUNTANT_GROUP_ID, "it-account-group");
    }

    /**
     * 테스트 계정 시드 — C5-5 이후 role 컬럼 없음(V46 DROP).
     * role 파라미터는 하위 호환 시그니처 유지용이며 INSERT 에 포함되지 않는다.
     */
    private void seedTestAccount(UUID accountId, String loginId, String displayName,
                                 @SuppressWarnings("unused") String role) {
        jdbcTemplate.update("""
                INSERT INTO accounts (
                    id, login_id, password_hash, display_name, enabled,
                    failed_login_attempts, locked_at,
                    password_changed_at, password_history,
                    password_change_required,
                    created_at, created_by, is_deleted
                ) VALUES (
                    ?, ?,
                    '$2a$12$6cxHjNrguvlnEE.4s4jrAOuGNGGmHPc4Gg8/MuMBHYh/B.Q4sU/xu',
                    ?, TRUE,
                    0, NULL,
                    NOW(), '[]'::jsonb,
                    FALSE,
                    NOW(), 'it-materializer', FALSE
                )
                """, accountId, loginId, displayName);
    }

    private void cleanTestRows() {
        jdbcTemplate.update("""
                DELETE FROM account_page_permissions
                WHERE account_id IN (?, ?)
                """, TEST_ACCOUNT_ID, TEST_MASTER_ACCOUNT_ID);
        jdbcTemplate.update("""
                DELETE FROM account_groups
                WHERE account_id IN (?, ?)
                """, TEST_ACCOUNT_ID, TEST_MASTER_ACCOUNT_ID);
        jdbcTemplate.update("""
                DELETE FROM account_permission_overrides
                WHERE account_id IN (?, ?)
                """, TEST_ACCOUNT_ID, TEST_MASTER_ACCOUNT_ID);
        jdbcTemplate.update("""
                DELETE FROM accounts
                WHERE id IN (?, ?)
                """, TEST_ACCOUNT_ID, TEST_MASTER_ACCOUNT_ID);
    }

    private Map<String, Object> permissionRow(UUID accountId, String pageCode) {
        return jdbcTemplate.queryForMap("""
                SELECT can_view, can_create, can_update, can_delete, can_restore, can_download, can_print
                FROM account_page_permissions
                WHERE account_id = ?
                  AND page_code = ?
                  AND is_deleted = FALSE
                """, accountId, pageCode);
    }
}
