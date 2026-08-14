package com.samhanair.logis.auth.claude;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

class ClaudeModelResultContractTest {

    @Test
    void virtualAgentProducesAnAuditableOneLineSummaryDistinctFromQuestion() {
        String question = "오늘 미배차 차량과 우선 처리 순서를 한 줄로 요약해줘";

        ClaudeModelResult result = new VirtualClaudeModelClient().askWithSummary(question);

        assertThat(result.summary()).isNotBlank();
        assertThat(result.summary()).doesNotContain("\\n");
        assertThat(result.summary().length()).isLessThanOrEqualTo(80);
        assertThat(result.summary()).isNotEqualTo(question);
        assertThat(result.answer()).contains("[가상 에이전트]");
    }
}
