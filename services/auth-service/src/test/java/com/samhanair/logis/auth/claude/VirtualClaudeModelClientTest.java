package com.samhanair.logis.auth.claude;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

class VirtualClaudeModelClientTest {

    @Test
    void responseIsUnmistakablyVirtual() {
        String answer = new VirtualClaudeModelClient().ask("질문");

        assertThat(answer).contains("[가상 에이전트]");
        assertThat(answer).contains("실제 Claude 모델 응답이 아닙니다");
    }
}
