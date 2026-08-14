package com.samhanair.logis.auth.web.dto;

/** 클라이언트에 노출 가능한 Claude 세션 정보. 내부 UUID는 포함하지 않는다. */
public record ClaudeSessionResponse(String sessionCode, String title, long messageCount) {}
