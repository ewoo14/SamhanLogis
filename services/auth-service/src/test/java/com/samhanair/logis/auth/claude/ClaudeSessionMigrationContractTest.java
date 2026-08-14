package com.samhanair.logis.auth.claude;

import static org.assertj.core.api.Assertions.assertThat;

import java.nio.charset.StandardCharsets;
import java.util.Objects;
import org.junit.jupiter.api.Test;

class ClaudeSessionMigrationContractTest {

    @Test
    void legacySessionBackfillMustNotCopyQuestionIntoTitle() throws Exception {
        String sql = new String(
                Objects.requireNonNull(getClass().getResourceAsStream(
                        "/db/migration/V107__add_claude_session_list_metadata.sql"))
                        .readAllBytes(),
                StandardCharsets.UTF_8);

        assertThat(sql).contains("SET title = '대화 요약 없음'");
        assertThat(sql).doesNotContain("SET title = LEFT");
        assertThat(sql).doesNotContain("latest.question), 120");
    }
}
