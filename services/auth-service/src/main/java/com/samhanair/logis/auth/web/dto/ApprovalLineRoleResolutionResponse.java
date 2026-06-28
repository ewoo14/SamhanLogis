package com.samhanair.logis.auth.web.dto;

import java.util.List;

/** 서비스 간 결재선 인스턴스화용 역할 목록 응답. */
public record ApprovalLineRoleResolutionResponse(
        boolean configured,
        List<ApprovalLineRoleResolutionItem> roles
) {
    public ApprovalLineRoleResolutionResponse {
        roles = roles == null ? List.of() : List.copyOf(roles);
    }

    public static ApprovalLineRoleResolutionResponse unconfigured() {
        return new ApprovalLineRoleResolutionResponse(false, List.of());
    }
}
