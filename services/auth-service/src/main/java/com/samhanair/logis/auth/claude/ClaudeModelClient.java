package com.samhanair.logis.auth.claude;

/** 사용자 질문을 Claude 모델에 전달하는 외부 호출 경계. 도구 호출은 이 인터페이스에 포함하지 않는다. */
public interface ClaudeModelClient {

    /** 질문을 외부 모델에 전달하고 모델의 텍스트 응답을 반환한다. */
    String ask(String question);
}
