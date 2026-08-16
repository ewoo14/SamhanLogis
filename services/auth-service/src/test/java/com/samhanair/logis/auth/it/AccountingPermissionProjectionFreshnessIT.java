package com.samhanair.logis.auth.it;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.TestInstance;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

/** auth_db 정본과 프런트 체크인 projection의 양방향 freshness 가드. */
@Testcontainers
@TestInstance(TestInstance.Lifecycle.PER_CLASS)
class AccountingPermissionProjectionFreshnessIT {

    private static final Path REPOSITORY_ROOT = findRepositoryRoot();
    private static final Path CATALOG = REPOSITORY_ROOT.resolve(
            "clients/desktop/src/renderer/test-utils/accounting-slip-permission-snapshot.ts");
    private static final Path PROJECTION = REPOSITORY_ROOT.resolve(
            "clients/desktop/src/renderer/test-utils/accounting-slip-permission-db-snapshot.ts");
    private static final Pattern QUOTED = Pattern.compile("\\\"([^\\\"]+)\\\"|\\'([^\\']+)\\'");
    private static final Pattern ROLE_BLOCK = Pattern.compile(
            "(?s)\\'([A-Z]+)\\'\\s*:\\s*\\{(.*?)\\n\\s*\\},");
    private static final Pattern CELL = Pattern.compile("\\'([^\\']+)\\'\\s*:\\s*\\'([01]{7})\\'");
    private static final String POSTGRES_PASSWORD = UUID.randomUUID().toString();

    @Container
    private static final PostgreSQLContainer<?> POSTGRES = new PostgreSQLContainer<>("postgres:16-alpine")
            .withDatabaseName("auth_db")
            .withUsername(UUID.randomUUID().toString())
            .withPassword(POSTGRES_PASSWORD);

    private JdbcTemplate jdbcTemplate;

    @BeforeAll
    void migrateRealPostgres() {
        Flyway.configure()
                .dataSource(POSTGRES.getJdbcUrl(), POSTGRES.getUsername(), POSTGRES.getPassword())
                .locations("classpath:db/migration")
                .load()
                .migrate();
        DriverManagerDataSource dataSource = new DriverManagerDataSource(
                POSTGRES.getJdbcUrl(), POSTGRES.getUsername(), POSTGRES.getPassword());
        jdbcTemplate = new JdbcTemplate(dataSource);
    }

    @Test
    @DisplayName("auth_db migration 정본과 체크인 projection이 모든 역할·page-code에서 일치한다")
    void projectionMatchesMigrationSourceOfTruth() throws Exception {
        assertThat(Files.exists(CATALOG)).as("permission catalog file").isTrue();
        assertThat(Files.exists(PROJECTION)).as("DB-derived projection file").isTrue();

        String catalog = Files.readString(CATALOG);
        String projection = Files.readString(PROJECTION);
        List<String> roles = quotedValues(catalog, "PERMISSION_ROLES");
        List<String> pages = quotedValues(catalog, "PERMISSION_PAGE_CODES");
        assertThat(roles).as("permission roles").isNotEmpty();
        assertThat(pages).as("permission page codes").isNotEmpty();

        Map<String, String> projectionCells = parseProjection(projection);
        Map<String, String> databaseCells = jdbcTemplate.query(
                """
                SELECT role_code, page_code,
                       concat(can_view::int, can_create::int, can_update::int,
                              can_delete::int, can_restore::int, can_download::int,
                              can_print::int) AS bits
                  FROM role_page_permission_templates
                 WHERE is_deleted = FALSE
                 ORDER BY role_code, page_code
                """,
                rows -> {
                    Map<String, String> result = new LinkedHashMap<>();
                    Set<String> seenCells = new HashSet<>();
                    while (rows.next()) {
                        String role = rows.getString("role_code");
                        String page = rows.getString("page_code");
                        String bits = rows.getString("bits");
                        String cell = key(role, page);
                        assertThat(seenCells.add(cell))
                                .as("duplicate auth_db cell %s bits=%s", cell, bits)
                                .isTrue();
                        result.put(cell, bits);
                    }
                    return result;
                });

        Map<String, String> expected = new LinkedHashMap<>();
        for (String role : roles) {
            for (String page : pages) {
                expected.put(key(role, page), "0000000");
            }
        }
        databaseCells.forEach((cell, bits) -> {
            if (expected.containsKey(cell)) {
                expected.put(cell, bits);
            }
        });

        assertThat(projectionCells.keySet())
                .as("projection entries outside the checked catalog")
                .isSubsetOf(expected.keySet());
        assertThat(databaseCells).as("auth_db must contain active template rows").isNotEmpty();

        List<String> differences = new ArrayList<>();
        expected.forEach((cell, bits) -> {
            String projected = projectionCells.getOrDefault(cell, "0000000");
            if (!bits.equals(projected)) {
                differences.add(cell + " db=" + bits + " projection=" + projected);
            }
        });
        assertThat(differences)
                .withFailMessage("auth_db ↔ projection 불일치: %s", differences)
                .isEmpty();
    }

    @Test
    void projectionParserRejectsDuplicateRolePageCellsBeforeMapOverwrite() {
        String source = """
                const TEMPLATE_PERMISSION_DB_BITS_BY_ROLE = {
                  'ACCOUNTANT': {
                    'accounting.sales-commission-settlement': '0000000',
                    'accounting.sales-commission-settlement': '1110000',
                  },
                }
                """;

        assertThatThrownBy(() -> parseProjection(source))
                .isInstanceOf(AssertionError.class)
                .hasMessageContaining("ACCOUNTANT|accounting.sales-commission-settlement")
                .hasMessageContaining("firstBits=0000000")
                .hasMessageContaining("secondBits=1110000");
    }

    private static List<String> quotedValues(String source, String constant) {
        Matcher assignment = Pattern.compile(
                "(?s)" + Pattern.quote(constant) + "\\s*=\\s*\\[(.*?)\\]\\s+as const")
                .matcher(source);
        assertThat(assignment.find()).as(constant + " declaration").isTrue();
        Matcher values = QUOTED.matcher(assignment.group(1));
        List<String> result = new ArrayList<>();
        while (values.find()) {
            result.add(values.group(1) != null ? values.group(1) : values.group(2));
        }
        return result;
    }

    private static Map<String, String> parseProjection(String source) {
        Map<String, String> result = new LinkedHashMap<>();
        Set<String> seenRoles = new HashSet<>();
        Matcher roles = ROLE_BLOCK.matcher(source);
        while (roles.find()) {
            String role = roles.group(1);
            assertThat(seenRoles.add(role))
                    .as("duplicate projection role block %s", role)
                    .isTrue();
            Matcher cells = CELL.matcher(roles.group(2));
            while (cells.find()) {
                String page = cells.group(1);
                String bits = cells.group(2);
                String cell = key(role, page);
                String firstBits = result.get(cell);
                assertThat(firstBits)
                        .as("duplicate projection cell %s firstBits=%s secondBits=%s", cell, firstBits, bits)
                        .isNull();
                result.put(cell, bits);
            }
        }
        return result;
    }

    private static String key(String role, String page) {
        return role + "|" + page;
    }

    private static Path findRepositoryRoot() {
        Path candidate = Path.of("").toAbsolutePath().normalize();
        while (candidate != null) {
            if (Files.exists(candidate.resolve("settings.gradle"))
                    && Files.exists(candidate.resolve("clients/desktop"))) {
                return candidate;
            }
            candidate = candidate.getParent();
        }
        throw new IllegalStateException("Samhan-Public repository root was not found");
    }
}
