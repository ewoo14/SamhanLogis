package com.samhanair.logis.groupware.claude;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

import org.junit.jupiter.api.Test;

class ClaudeReadOnlyToolRegistryTest {

    private final ClaudeReadOnlyToolRegistry registry = new ClaudeReadOnlyToolRegistry();

    @Test
    void exposesOnlyTheServerOwnedApprovalListTool() {
        assertEquals(
                new ClaudeToolDefinition(
                        "groupware.approval-list",
                        "결재 문서 목록 조회",
                        "GET",
                        "/admin/groupware/approvals",
                        true),
                registry.require("groupware.approval-list"));
    }

    @Test
    void rejectsUnknownOrWriteToolNamesByDefault() {
        assertThrows(UnknownClaudeToolException.class, () -> registry.require("arbitrary-api-call"));
        assertThrows(UnknownClaudeToolException.class, () -> registry.require("groupware.approval-create"));
    }
}
