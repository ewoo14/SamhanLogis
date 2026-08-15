package com.samhanair.logis.groupware.claude;

/** 서버가 Claude에 공개하는 업무 도구의 불변 계약이다. */
public record ClaudeToolDefinition(String name, String displayName, String method, String path, boolean readOnly) {
}
