package com.samhanair.logis.groupware.dto;

import java.util.List;

/** Claude 도구 호출과 실제 서버 응답을 한 화면에서 검증할 수 있는 응답이다. */
public record ClaudeToolResultResponse(
        String toolName,
        String toolDisplayName,
        String method,
        String path,
        boolean readOnly,
        List<ClaudeApprovalSummary> result) {
}
