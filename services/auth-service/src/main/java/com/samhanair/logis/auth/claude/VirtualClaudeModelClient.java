package com.samhanair.logis.auth.claude;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;

/** 명시적으로 켠 비운영 라이브 QA에서만 쓰이는, 실제 모델을 호출하지 않는 에이전트. */
@Component
@ConditionalOnProperty(name = "claude.virtual-agent.enabled", havingValue = "true")
public class VirtualClaudeModelClient implements ClaudeModelClient {

    @Override
    public String ask(String question) {
        return "[가상 에이전트] 실제 Claude 모델 응답이 아닙니다. 라이브 QA 시나리오 응답입니다.";
    }

    @Override
    public ClaudeModelResult askWithSummary(String question) {
        String normalized = question == null ? "" : question.trim().replaceAll("\\s+", " ");
        String summary = normalized.contains("미배차") ? "미배차 차량 처리 순서 요약" : "질문 내용 요약";
        return new ClaudeModelResult(summary, ask(question));
    }

    @Override
    public boolean isVirtual() {
        return true;
    }
}
