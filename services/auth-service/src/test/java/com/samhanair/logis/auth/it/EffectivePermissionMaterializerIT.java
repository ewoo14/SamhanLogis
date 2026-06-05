package com.samhanair.logis.auth.it;

import static org.assertj.core.api.Assertions.assertThat;

import com.samhanair.logis.auth.AuthServiceApplication;
import com.samhanair.logis.auth.service.EffectivePermissionMaterializer;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.annotation.Transactional;

/** 권한그룹 합집합과 계정 override 를 account_page_permissions effective 캐시에 반영하는 IT. */
@SpringBootTest(classes = AuthServiceApplication.class)
@Transactional
class EffectivePermissionMaterializerIT extends AbstractPostgresIT {

    private static final UUID MASTER_ACCOUNT_ID =
            UUID.fromString("a0000000-0000-0000-0000-000000000001");
    private static final UUID MANAGER_ACCOUNT_ID =
            UUID.fromString("a0000000-0000-0000-0000-000000000003");
    private static final UUID ACCOUNTANT_GROUP_ID =
            UUID.fromString("00000000-0000-0000-0000-000000000104");

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Autowired
    private EffectivePermissionMaterializer materializer;

    @BeforeEach
    void cleanTestRows() {
        jdbcTemplate.update("""
                DELETE FROM account_permission_overrides
                WHERE account_id IN (?, ?)
                """, MANAGER_ACCOUNT_ID, MASTER_ACCOUNT_ID);
        jdbcTemplate.update("""
                DELETE FROM account_groups
                WHERE account_id = ?
                  AND group_id = ?
                """, MANAGER_ACCOUNT_ID, ACCOUNTANT_GROUP_ID);
    }

    @Test
    @DisplayName("계정 다중 그룹은 페이지별 7-action OR 합집합으로 materialize 된다")
    void materializeForAccount_unionsMultipleGroups() {
        assignManagerToAccountantGroup();

        materializer.materializeForAccount(MANAGER_ACCOUNT_ID);

        Map<String, Object> row = permissionRow(MANAGER_ACCOUNT_ID, "accounting.journals");
        assertThat(row).isNotNull();
        assertThat(row.get("can_view")).isEqualTo(true);
        assertThat(row.get("can_create")).isEqualTo(true);
        assertThat(row.get("can_update")).isEqualTo(true);
        assertThat(row.get("can_download")).isEqualTo(true);
    }

    @Test
    @DisplayName("계정 override 행이 있는 페이지는 그룹 합집합보다 우선하며 명시적 deny 를 표현한다")
    void materializeForAccount_overrideWinsAndCanDeny() {
        assignManagerToAccountantGroup();
        jdbcTemplate.update("""
                INSERT INTO account_permission_overrides
                    (id, account_id, page_code,
                     can_view, can_create, can_update, can_delete, can_restore, can_download, can_print,
                     created_at, created_by, modified_at, modified_by, is_deleted)
                VALUES
                    (gen_random_uuid(), ?, 'accounting.journals',
                     FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE,
                     NOW(), 'it-override-deny', NOW(), 'it-override-deny', FALSE)
                """, MANAGER_ACCOUNT_ID);

        materializer.materializeForAccount(MANAGER_ACCOUNT_ID);

        Map<String, Object> row = permissionRow(MANAGER_ACCOUNT_ID, "accounting.journals");
        assertThat(row).isNotNull();
        assertThat(row.get("can_view")).isEqualTo(false);
        assertThat(row.get("can_create")).isEqualTo(false);
        assertThat(row.get("can_update")).isEqualTo(false);
        assertThat(row.get("can_download")).isEqualTo(false);
    }

    @Test
    @DisplayName("MASTER 시스템 그룹 계정은 account_page_permissions 행 없이 bypass 상태를 유지한다")
    void materializeForAccount_masterGroupKeepsNoRows() {
        materializer.materializeForAccount(MASTER_ACCOUNT_ID);

        Integer activeRows = jdbcTemplate.queryForObject("""
                SELECT COUNT(*)
                FROM account_page_permissions
                WHERE account_id = ?
                  AND is_deleted = FALSE
                """, Integer.class, MASTER_ACCOUNT_ID);

        assertThat(activeRows).isZero();
    }

    @Test
    @DisplayName("materializeForGroup 은 해당 그룹에 배속된 모든 계정의 effective 권한을 재계산한다")
    void materializeForGroup_recalculatesAssignedAccounts() {
        assignManagerToAccountantGroup();

        materializer.materializeForGroup(ACCOUNTANT_GROUP_ID);

        Map<String, Object> row = permissionRow(MANAGER_ACCOUNT_ID, "accounting.journals");
        assertThat(row).isNotNull();
        assertThat(row.get("can_create")).isEqualTo(true);
        assertThat(row.get("can_download")).isEqualTo(true);
    }

    private void assignManagerToAccountantGroup() {
        jdbcTemplate.update("""
                INSERT INTO account_groups
                    (id, account_id, group_id, created_at, created_by, modified_at, modified_by, is_deleted)
                VALUES
                    (gen_random_uuid(), ?, ?, NOW(), 'it-account-group', NOW(), 'it-account-group', FALSE)
                ON CONFLICT (account_id, group_id) WHERE is_deleted = FALSE DO NOTHING
                """, MANAGER_ACCOUNT_ID, ACCOUNTANT_GROUP_ID);
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
