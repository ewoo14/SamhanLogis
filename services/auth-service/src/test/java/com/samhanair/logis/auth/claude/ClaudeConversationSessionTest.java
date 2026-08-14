package com.samhanair.logis.auth.claude;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.UUID;
import org.junit.jupiter.api.Test;

class ClaudeConversationSessionTest {

    @Test
    void sessionStartsWithUsefulTitleAndStoresTheLatestQuestion() {
        ClaudeConversationSession session = ClaudeConversationSession.create(
                UUID.randomUUID(), "CLD-20260814-000001");

        assertThat(session.getTitle()).isNotEqualTo("새 대화");
        session.recordQuestion("오늘 배차 현황을 알려줘", false);

        assertThat(session.getTitle()).contains("오늘 배차 현황");
        assertThat(session.getLastMessage()).isEqualTo("오늘 배차 현황을 알려줘");
        assertThat(session.getSummaryMode()).isEqualTo("REAL");
    }
}
