package com.samhanair.logis.auth.domain;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.junit.jupiter.api.Test;

/** D-G6 역할별 7-action seed와 과다 권한 방지 계약 테스트. */
class SalesCommissionSettlementPermissionSeedTest {

    private static final String PAGE_CODE = "accounting.sales-commission-settlement";
    private static final List<String> ALL_ROLES = List.of(
            "MASTER", "MANAGER", "ACCOUNTANT", "SALES", "WAREHOUSE", "DISPATCH",
            "INVENTORY", "DEVELOPER", "PARTNER", "STAFF", "DRIVER");
    private static final Map<String, String> EXPECTED_TEMPLATE_BITS = Map.ofEntries(
            Map.entry("MASTER", "1110000"),
            Map.entry("MANAGER", "1110000"),
            Map.entry("ACCOUNTANT", "1110000"),
            Map.entry("SALES", "0000000"),
            Map.entry("WAREHOUSE", "0000000"),
            Map.entry("DISPATCH", "0000000"),
            Map.entry("INVENTORY", "0000000"),
            Map.entry("DEVELOPER", "0000000"),
            Map.entry("PARTNER", "0000000"),
            Map.entry("STAFF", "0000000"),
            Map.entry("DRIVER", "0000000"));
    private static final Map<String, String> EXPECTED_ROLE_BITS = Map.ofEntries(
            Map.entry("MASTER", "11"),
            Map.entry("MANAGER", "11"),
            Map.entry("ACCOUNTANT", "11"),
            Map.entry("SALES", "00"),
            Map.entry("WAREHOUSE", "00"),
            Map.entry("DISPATCH", "00"),
            Map.entry("INVENTORY", "00"),
            Map.entry("DEVELOPER", "00"),
            Map.entry("PARTNER", "00"),
            Map.entry("STAFF", "00"),
            Map.entry("DRIVER", "00"));
    private static final Pattern ROLE_ROW = Pattern.compile(
            "\\('([A-Z]+)'\\s*(?:,\\s*(TRUE|FALSE))?\\s*(?:,\\s*(TRUE|FALSE))?\\s*"
                    + "(?:,\\s*(TRUE|FALSE))?\\s*\\)");

    @Test
    void migrationSeedsTheExactSevenBitTemplateForEveryRole() throws IOException {
        String sql = migrationSql();

        assertThat(sql).contains(PAGE_CODE);
        assertThat(sql).contains("can_view, can_create, can_update, can_delete,");
        assertThat(sql).contains("can_restore, can_download, can_print,");

        int templateInsert = sql.indexOf("INSERT INTO role_page_permission_templates");
        assertThat(templateInsert).as("template INSERT must exist").isGreaterThan(0);
        int templateCteStart = sql.lastIndexOf("WITH roles(role_code) AS (", templateInsert);
        String rolesBlock = blockBetween(
                sql,
                templateCteStart,
                sql.indexOf("), grants(role_code, can_view, can_create, can_update) AS (", templateCteStart));
        int templateGrantStart = sql.indexOf("VALUES", sql.indexOf(
                "), grants(role_code, can_view, can_create, can_update) AS (", templateCteStart));
        String grantsBlock = blockBetween(
                sql,
                templateGrantStart,
                sql.indexOf(")\nINSERT INTO role_page_permission_templates", templateGrantStart));

        assertThat(parseRows(rolesBlock).stream().map(SeedRow::role).toList())
                .containsExactlyInAnyOrderElementsOf(ALL_ROLES);
        assertThat(bitsMap(parseRows(grantsBlock), 3, 7))
                .as("role × 7-action template must be an exact matrix, not substring evidence")
                .isEqualTo(EXPECTED_TEMPLATE_BITS);
    }

    @Test
    void migrationSeedsTheExactRolePermissionPairForEveryRole() throws IOException {
        String sql = migrationSql();

        int firstGrants = sql.indexOf("), grants(role_code, can_view, can_edit) AS (");
        assertThat(firstGrants).as("role_page_permissions grant CTE must exist").isGreaterThan(0);
        String grantsBlock = blockBetween(
                sql,
                sql.indexOf("VALUES", firstGrants),
                sql.indexOf(")\nINSERT INTO role_page_permissions", firstGrants));

        assertThat(bitsMap(parseRows(grantsBlock), 2, 2))
                .as("role_page_permissions must explicitly deny every non-accounting role")
                .isEqualTo(EXPECTED_ROLE_BITS);
    }

    @Test
    void migrationUsesTheExactSevenBitsForBuiltinGroupAndAccountMaterialization() throws IOException {
        String normalized = migrationSql().replaceAll("\\s+", " ");
        String insertSevenBits = "TRUE, TRUE, TRUE, FALSE, FALSE, FALSE, FALSE, NOW()";
        String updateSevenBits = "can_view = TRUE, can_create = TRUE, can_update = TRUE,"
                + " can_delete = FALSE, can_restore = FALSE, can_download = FALSE, can_print = FALSE";

        assertThat(countOccurrences(normalized, insertSevenBits))
                .as("group/account INSERT seed must retain the same 7 bits")
                .isEqualTo(2);
        assertThat(countOccurrences(normalized, updateSevenBits))
                .as("group/account conflict updates must retain the same 7 bits")
                .isEqualTo(2);
    }

    private static Map<String, String> bitsMap(List<SeedRow> rows, int grantWidth, int outputWidth) {
        Map<String, String> actual = new LinkedHashMap<>();
        for (String role : ALL_ROLES) {
            actual.put(role, "0".repeat(outputWidth));
        }
        for (SeedRow row : rows) {
            assertThat(row.bits()).as("grant row %s must define exactly %d role bits", row.role(), grantWidth)
                    .hasSize(grantWidth);
            String existing = actual.put(row.role(), bits(row.bits(), outputWidth));
            assertThat(existing).as("duplicate grant row for %s", row.role())
                    .isEqualTo("0".repeat(outputWidth));
        }
        return actual;
    }

    private static String bits(List<Boolean> bits, int width) {
        StringBuilder result = new StringBuilder(width);
        for (int i = 0; i < width; i++) {
            result.append(i < bits.size() && bits.get(i) ? '1' : '0');
        }
        return result.toString();
    }

    private static List<SeedRow> parseRows(String block) {
        List<SeedRow> rows = new ArrayList<>();
        Matcher matcher = ROLE_ROW.matcher(block);
        while (matcher.find()) {
            List<Boolean> bits = new ArrayList<>();
            for (int i = 2; i <= 4; i++) {
                if (matcher.group(i) != null) {
                    bits.add("TRUE".equals(matcher.group(i)));
                }
            }
            rows.add(new SeedRow(matcher.group(1), bits));
        }
        return rows;
    }

    private static String blockBetween(String sql, int start, int end) {
        assertThat(start).as("SQL block start").isGreaterThanOrEqualTo(0);
        assertThat(end).as("SQL block end").isGreaterThan(start);
        return sql.substring(start, end);
    }

    private static int countOccurrences(String value, String needle) {
        int count = 0;
        int offset = 0;
        while ((offset = value.indexOf(needle, offset)) >= 0) {
            count++;
            offset += needle.length();
        }
        return count;
    }

    private record SeedRow(String role, List<Boolean> bits) {}

    private String migrationSql() throws IOException {
        try (InputStream input = getClass().getResourceAsStream(
                "/db/migration/V101__seed_sales_commission_settlement_page_permission.sql")) {
            assertThat(input).as("V101 permission seed must be packaged").isNotNull();
            return new String(input.readAllBytes(), StandardCharsets.UTF_8)
                    .replace("\r\n", "\n");
        }
    }
}
