package com.samhanair.logis.user.it;

import static org.assertj.core.api.Assertions.assertThat;

import java.nio.charset.StandardCharsets;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.io.InputStream;
import java.util.stream.Collectors;
import org.junit.jupiter.api.Test;

class MessengerMigrationContractTest {

    private static final Pattern COLUMN = Pattern.compile("\\s+(\\w+)\\s+[^,\\n]+(?:,|\\s*$)");

    @Test
    void presenceSessionTableUsesBaseEntitySevenAuditColumns() throws Exception {
        String sql;
        try (InputStream input = getClass().getClassLoader()
                .getResourceAsStream("db/migration/V14__create_messenger_presence_sessions.sql")) {
            sql = new String(input.readAllBytes(), StandardCharsets.UTF_8);
        }

        Set<String> expected = Set.of(
                "created_at", "created_by", "modified_at", "modified_by",
                "deleted_at", "deleted_by", "is_deleted");
        Set<String> actual = Set.of(
                "created_at", "created_by", "modified_at", "modified_by",
                "deleted_at", "deleted_by", "is_deleted").stream()
                .filter(sql::contains)
                .collect(Collectors.toSet());

        assertThat(actual)
                .as("V14 messenger_presence_sessions must match BaseEntity's 7 audit columns")
                .containsExactlyInAnyOrderElementsOf(expected);
        assertThat(sql).doesNotContain("updated_at").doesNotContain("updated_by");
        assertThat(sql).contains("created_by VARCHAR(50) NOT NULL");
    }
}
