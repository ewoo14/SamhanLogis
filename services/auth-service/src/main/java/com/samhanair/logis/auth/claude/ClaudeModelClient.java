package com.samhanair.logis.auth.claude;

/** 사용자 질문을 Claude 모델에 전달하는 외부 호출 경계. 도구 호출은 이 인터페이스에 포함하지 않는다. */
public interface ClaudeModelClient {

    /** 질문을 외부 모델에 전달하고 모델의 텍스트 응답을 반환한다. */
    String ask(String question);

    /** 모델 답변의 한 줄을 목록 제목으로 저장한다. 목록 조회에서는 호출되지 않는다. */
    default ClaudeModelResult askWithSummary(String question) {
        String answer = ask(question);
        String summary = answer == null ? "" : answer.split("\\R", 2)[0];
        return new ClaudeModelResult(summary, answer);
    }

    /** 응답이 실제 외부 모델이 아닌 QA 가상 에이전트인지 구분한다. */
    default boolean isVirtual() {
        return false;
    }
}
