package com.samhanair.logis.groupware.claude;

import java.util.Map;
import org.springframework.stereotype.Component;

/** 서버가 Claude에 공개하는 읽기 전용 업무 도구 allowlist다. */
@Component
public class ClaudeReadOnlyToolRegistry {
    public static final String APPROVAL_LIST = "groupware.approval-list";

    private static final Map<String, ClaudeToolDefinition> TOOLS = Map.of(
            APPROVAL_LIST,
            new ClaudeToolDefinition(
                    APPROVAL_LIST,
                    "결재 문서 목록 조회",
                    "GET",
                    "/admin/groupware/approvals",
                    true));

    public ClaudeToolDefinition require(String name) {
        ClaudeToolDefinition tool = TOOLS.get(name);
        if (tool == null) {
            throw new UnknownClaudeToolException(name);
        }
        return tool;
    }
}
