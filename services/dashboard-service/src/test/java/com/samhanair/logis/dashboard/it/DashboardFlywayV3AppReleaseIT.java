package com.samhanair.logis.dashboard.it;

import static org.assertj.core.api.Assertions.assertThat;

import com.samhanair.logis.dashboard.DashboardServiceApplication;
import com.samhanair.logis.dashboard.client.AccountingClient;
import com.samhanair.logis.dashboard.client.InventoryClient;
import com.samhanair.logis.dashboard.client.PartnerClient;
import com.samhanair.logis.dashboard.client.PartnerOrderClient;
import com.samhanair.logis.security.permission.DynamicPermissionClient;
import java.util.List;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.jdbc.core.JdbcTemplate;

/** V3 app_release 마이그레이션 fresh Postgres probe. */
@SpringBootTest(classes = DashboardServiceApplication.class)
@AutoConfigureMockMvc
class DashboardFlywayV3AppReleaseIT extends AbstractPostgresIT {

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @MockBean
    private InventoryClient inventoryClient;
    @MockBean
    private AccountingClient accountingClient;
    @MockBean
    private PartnerOrderClient partnerOrderClient;
    @MockBean
    private PartnerClient partnerClient;
    @MockBean
    private DynamicPermissionClient dynamicPermissionClient;

    @Test
    @DisplayName("app_release는 enum CHECK, partial unique, published 상태, BaseEntity 7 audit 컬럼을 가진다")
    void v3AppReleaseSchemaIsApplied() {
        Integer auditColumns = jdbcTemplate.queryForObject("""
                SELECT COUNT(*)
                  FROM information_schema.columns
                 WHERE table_name = 'app_release'
                   AND column_name IN (
                       'created_at', 'created_by', 'modified_at', 'modified_by',
                       'deleted_at', 'deleted_by', 'is_deleted'
                   )
                """, Integer.class);
        assertThat(auditColumns).isEqualTo(7);

        Integer partialUnique = jdbcTemplate.queryForObject("""
                SELECT COUNT(*)
                  FROM pg_indexes
                 WHERE tablename = 'app_release'
                   AND indexname = 'ux_app_release_client_type_version_active'
                   AND indexdef LIKE '%WHERE (is_deleted = false)%'
                """, Integer.class);
        assertThat(partialUnique).isEqualTo(1);

        Integer publishedColumns = jdbcTemplate.queryForObject("""
                SELECT COUNT(*)
                  FROM information_schema.columns
                 WHERE table_name = 'app_release'
                   AND column_name = 'is_published'
                   AND column_default = 'true'
                   AND is_nullable = 'NO'
                """, Integer.class);
        assertThat(publishedColumns).isEqualTo(1);

        jdbcTemplate.update("""
                INSERT INTO app_release
                    (id, client_type, version, force_level, release_notes, released_at, min_supported_version,
                     created_at, created_by, is_deleted)
                VALUES
                    (gen_random_uuid(), 'DESKTOP', '9.9.9', 'MINOR', 'probe', NOW(), '9.0.0',
                     NOW(), 'it', FALSE)
                """);
        Integer count = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM app_release WHERE client_type = 'DESKTOP' AND version = '9.9.9'",
                Integer.class);
        assertThat(count).isEqualTo(1);

        Boolean defaultPublished = jdbcTemplate.queryForObject(
                "SELECT is_published FROM app_release WHERE client_type = 'DESKTOP' AND version = '9.9.9'",
                Boolean.class);
        assertThat(defaultPublished).isTrue();
    }

    @Test
    @DisplayName("V7 앱 식별자 제약은 8개 앱과 구버전 값을 허용하고 기존 DESKTOP 값을 보존한다")
    void v7AppClientIdentityConstraintPreservesLegacyDesktopRows() {
        String checkDefinition = jdbcTemplate.queryForObject("""
                SELECT pg_get_constraintdef(oid)
                  FROM pg_constraint
                 WHERE conname = 'ck_app_release_client_type'
                """, String.class);
        assertThat(checkDefinition)
                .contains("SAMHAN_MOBILE")
                .contains("SAMHAN_MOBILE_STAFF")
                .contains("AROLOGIS_MOBILE")
                .contains("SAMHAN_ORDER_WEB")
                .contains("SAMHAN_ESTIMATE_WEB")
                .contains("SAMHAN_MOBILE_PUBLIC_WEB")
                .contains("AROLOGIS_DESKTOP")
                .contains("MOBILE")
                .contains("WEB");

        Integer clientTypeLength = jdbcTemplate.queryForObject("""
                SELECT character_maximum_length
                  FROM information_schema.columns
                 WHERE table_name = 'app_release'
                   AND column_name = 'client_type'
                """, Integer.class);
        assertThat(clientTypeLength).isEqualTo(40);

        jdbcTemplate.update("""
                INSERT INTO app_release
                    (id, client_type, version, force_level, release_notes, released_at, min_supported_version,
                     created_at, created_by, is_deleted)
                VALUES
                    (gen_random_uuid(), 'DESKTOP', '9.9.8', 'CRITICAL', '기존 삼한 데스크톱', NOW(), '9.9.0',
                     NOW(), 'it', FALSE),
                    (gen_random_uuid(), 'AROLOGIS_MOBILE', '9.9.8', 'CRITICAL', '아로로지스 모바일', NOW(), '9.9.0',
                     NOW(), 'it', FALSE)
                """);

        List<String> identities = jdbcTemplate.queryForList("""
                SELECT client_type
                  FROM app_release
                 WHERE version = '9.9.8'
                 ORDER BY client_type
                """, String.class);
        assertThat(identities).containsExactly("AROLOGIS_MOBILE", "DESKTOP");
    }
}
