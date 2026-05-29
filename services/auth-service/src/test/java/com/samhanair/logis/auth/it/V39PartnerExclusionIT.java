package com.samhanair.logis.auth.it;

import static org.assertj.core.api.Assertions.assertThat;

import com.samhanair.logis.auth.AuthServiceApplication;
import java.util.UUID;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;

/** V39 account materialize 단계의 PARTNER 제외 검증. */
@SpringBootTest(classes = AuthServiceApplication.class)
class V39PartnerExclusionIT extends AbstractPostgresIT {

    private static final UUID PARTNER_ACCOUNT_ID =
            UUID.fromString("a0000000-0000-0000-0000-000000000010");

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Test
    @DisplayName("PARTNER role 계정에는 account_page_permissions 행을 만들지 않는다")
    void partnerAccountsExcludedFromAccountPermissions() {
        seedPartnerAccount();
        rerunV39MaterializeForPartnerAccount();

        Integer partnerTemplates = jdbcTemplate.queryForObject("""
                SELECT COUNT(*)
                FROM role_page_permission_templates
                WHERE role_code = 'PARTNER'
                  AND is_deleted = FALSE
                """, Integer.class);
        Integer count = jdbcTemplate.queryForObject("""
                SELECT COUNT(*)
                FROM account_page_permissions app
                JOIN accounts a ON a.id = app.account_id
                WHERE a.role = 'PARTNER'
                  AND app.is_deleted = FALSE
                """, Integer.class);

        assertThat(partnerTemplates).isPositive();
        assertThat(count).isZero();
    }

    private void seedPartnerAccount() {
        jdbcTemplate.update("""
                INSERT INTO accounts (
                    id, login_id, password_hash, display_name, role, enabled,
                    failed_login_attempts, locked_at,
                    password_changed_at, password_history,
                    password_change_required,
                    created_at, created_by, is_deleted
                ) VALUES (
                    ?, 'it_v39_partner',
                    '$2a$12$6cxHjNrguvlnEE.4s4jrAOuGNGGmHPc4Gg8/MuMBHYh/B.Q4sU/xu',
                    '[IT] V39 파트너', 'PARTNER', TRUE,
                    0, NULL,
                    NOW(), '[]'::jsonb,
                    FALSE,
                    NOW(), 'it', FALSE
                )
                ON CONFLICT (id) DO UPDATE
                SET role = 'PARTNER',
                    enabled = TRUE,
                    is_deleted = FALSE
                """, PARTNER_ACCOUNT_ID);
    }

    private void rerunV39MaterializeForPartnerAccount() {
        jdbcTemplate.update("""
                INSERT INTO account_page_permissions
                    (id, account_id, page_code,
                     can_view, can_create, can_update, can_delete, can_restore, can_download, can_print,
                     created_at, created_by, modified_at, modified_by, is_deleted)
                SELECT
                    gen_random_uuid(),
                    a.id,
                    t.page_code,
                    t.can_view,
                    t.can_create,
                    t.can_update,
                    t.can_delete,
                    t.can_restore,
                    t.can_download,
                    t.can_print,
                    NOW(),
                    'v39-account-materialize-it',
                    NOW(),
                    'v39-account-materialize-it',
                    FALSE
                FROM accounts a
                JOIN role_page_permission_templates t
                  ON t.role_code = a.role
                 AND t.is_deleted = FALSE
                WHERE a.id = ?
                  AND a.is_deleted = FALSE
                  AND a.enabled = TRUE
                  AND a.role NOT IN ('MASTER', 'PARTNER')
                ON CONFLICT (account_id, page_code) WHERE is_deleted = FALSE DO NOTHING
                """, PARTNER_ACCOUNT_ID);
    }
}
