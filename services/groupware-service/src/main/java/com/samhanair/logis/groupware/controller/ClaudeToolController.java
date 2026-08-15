package com.samhanair.logis.groupware.controller;

import com.samhanair.logis.common.dto.ApiResponse;
import com.samhanair.logis.groupware.claude.ClaudeReadOnlyToolRegistry;
import com.samhanair.logis.groupware.dto.ClaudeApprovalSummary;
import com.samhanair.logis.groupware.dto.ClaudeToolResultResponse;
import com.samhanair.logis.groupware.service.ApprovalLineService;
import com.samhanair.logis.security.permission.PermissionAction;
import com.samhanair.logis.security.permission.RequirePermission;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** Claude가 호출할 수 있는 서버 소유 읽기 전용 도구 표면이다. */
@RestController
@RequestMapping("/admin/groupware/claude-tools")
@RequiredArgsConstructor
public class ClaudeToolController {
    private final ClaudeReadOnlyToolRegistry registry;
    private final ApprovalLineService approvalLineService;

    /** 로그인한 계정의 결재 권한으로 문서 요약 목록을 조회한다. */
    @GetMapping("/approval-list")
    @RequirePermission(page = "groupware.approvals", action = PermissionAction.VIEW)
    public ApiResponse<ClaudeToolResultResponse> approvalList() {
        var tool = registry.require(ClaudeReadOnlyToolRegistry.APPROVAL_LIST);
        List<ClaudeApprovalSummary> result = approvalLineService.findAll(null, null).stream()
                .map(response -> new ClaudeApprovalSummary(
                        response.approvalNo(), response.requesterName(), response.title(),
                        response.documentType(), response.status(),
                        response.steps().stream()
                                .map(step -> new ClaudeApprovalSummary.StepSummary(
                                        step.sequence(), step.stepType(), step.approverName(), step.status()))
                                .toList()))
                .toList();
        return ApiResponse.ok(new ClaudeToolResultResponse(
                tool.name(), tool.displayName(), tool.method(), tool.path(), tool.readOnly(), result));
    }
}
