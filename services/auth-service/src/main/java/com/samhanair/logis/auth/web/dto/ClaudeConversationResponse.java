package com.samhanair.logis.auth.web.dto;

/** Claude 대화 응답. 내부 UUID를 포함하지 않는다. */
public record ClaudeConversationResponse(String answer, boolean virtualAgent) {}
