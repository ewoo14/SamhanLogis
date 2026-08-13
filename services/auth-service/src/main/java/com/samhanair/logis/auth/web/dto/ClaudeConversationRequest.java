package com.samhanair.logis.auth.web.dto;

import jakarta.validation.constraints.NotBlank;

/** Claude 대화 질문 요청. 업무 데이터나 내부 식별자를 받지 않는다. */
public record ClaudeConversationRequest(@NotBlank(message = "질문은 필수입니다.") String question) {}
