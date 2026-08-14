package com.samhanair.logis.groupware.claude;

/** allowlist 밖의 도구 호출은 기본적으로 거부한다. */
public class UnknownClaudeToolException extends RuntimeException {
    public UnknownClaudeToolException(String name) {
        super("허용되지 않은 Claude 도구입니다: " + name);
    }
}
