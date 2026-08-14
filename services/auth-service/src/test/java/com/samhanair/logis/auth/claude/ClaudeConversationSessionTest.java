package com.samhanair.logis.auth.claude;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.UUID;
import org.junit.jupiter.api.Test;

class ClaudeConversationSessionTest {

    @Test
    void storesModelSummaryAsTitleAndOriginalQuestionAsLastMessage() {
        ClaudeConversationSession session = ClaudeConversationSession.create(UUID.randomUUID(), "CLD-TEST");
        String question = "오늘 미배차 차량과 우선 처리 순서를 한 줄로 요약해줘";

        session.recordSummary("미배차 차량 처리 순서 요약", question, true);

        assertThat(session.getTitle()).isEqualTo("미배차 차량 처리 순서 요약");
        assertThat(session.getTitle()).isNotEqualTo(question);
        assertThat(session.getLastMessage()).isEqualTo(question);
        assertThat(session.getTitle().length()).isLessThanOrEqualTo(80);
    }
}
