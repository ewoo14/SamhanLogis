package com.samhanair.logis.notification.controller;

import com.samhanair.logis.common.dto.ApiResponse;
import com.samhanair.logis.notification.dto.DispatchBatchPreviewRequest;
import com.samhanair.logis.notification.dto.DispatchBatchPreviewResponse;
import com.samhanair.logis.notification.service.DispatchBatchPreviewService;
import com.samhanair.logis.security.permission.RequirePermission;
import com.samhanair.logis.security.permission.PermissionAction;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * 배차안내문자 미리보기 admin endpoint — 레거시 표시·편집·복사 계승.
 *
 * <p>POST /preview는 출고전표 조회, 단톡방 그룹화, blocked 가드, 하차일별 문구 조립만 수행한다.
 * SMS 자동 발송 endpoint는 제공하지 않는다.
 */
@RestController
@RequestMapping("/admin/notifications/dispatch-batch")
@RequiredArgsConstructor
@Tag(name = "Notification - Dispatch Message (Admin)",
        description = "배차안내문자 미리보기 및 문구 조립")
public class DispatchBatchAdminController {

    private static final String PAGE_CODE = "notification.dispatch-sms.send-audit";

    private final DispatchBatchPreviewService previewService;

    /**
     * dryRun 미리보기 — 출고전표 자동 조회 + 단톡방 그룹핑 + blocked 가드.
     *
     * @return 200, ChatRoomGroup 목록 + unmapped 목록
     */
    @Operation(summary = "배차안내 SMS 미리보기 (Admin)",
            description = "DISPATCH / MANAGER / MASTER 권한. 출고전표 + 단톡방 매핑 + blocked 가드 + 메시지 템플릿 dryRun.")
    @PostMapping("/preview")
    @RequirePermission(page = PAGE_CODE, action = PermissionAction.CREATE)
    public ApiResponse<DispatchBatchPreviewResponse> preview(
            @Valid @RequestBody DispatchBatchPreviewRequest req) {
        return ApiResponse.ok(previewService.preview(req));
    }

}
