package com.samhanair.logis.slip.collab;

import com.samhanair.logis.common.dto.ApiResponse;
import com.samhanair.logis.security.permission.PermissionAction;
import com.samhanair.logis.security.permission.RequirePermission;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** 협업 알림 최종 포기 건을 운영자가 확인하는 읽기 전용 경로. 내부 UUID는 응답하지 않는다. */
@RestController
@RequestMapping("/admin/slip-collab-notifications")
@RequiredArgsConstructor
public class SlipCollabNotificationAdminController {
    private final SlipCollabNotificationOutboxService service;

    @GetMapping("/terminal")
    @RequirePermission(page = "slip.collab-notifications", action = PermissionAction.VIEW)
    public ApiResponse<List<TerminalFailureResponse>> terminalFailures() {
        return ApiResponse.ok(service.listTerminalFailures().stream()
                .map(row -> new TerminalFailureResponse(
                        row.getSlipNo() == null ? "전표번호 미스냅샷" : row.getSlipNo(),
                        row.getTerminalReason(), row.getAttempts()))
                .toList());
    }

    public record TerminalFailureResponse(String slipNo, String reason, int attempts) { }
}
