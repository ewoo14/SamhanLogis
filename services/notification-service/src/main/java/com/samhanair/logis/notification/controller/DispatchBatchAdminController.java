package com.samhanair.logis.notification.controller;

import com.samhanair.logis.common.dto.ApiResponse;
import com.samhanair.logis.notification.dto.DispatchBatchPreviewRequest;
import com.samhanair.logis.notification.dto.DispatchBatchPreviewResponse;
import com.samhanair.logis.notification.dto.DispatchBatchSendRequest;
import com.samhanair.logis.notification.dto.DispatchBatchSendResponse;
import com.samhanair.logis.notification.service.DispatchBatchPreviewService;
import com.samhanair.logis.notification.service.DispatchBatchSendService;
import com.samhanair.logis.security.permission.RequirePermission;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * 배차안내 SMS batch 발송 admin endpoint — PR-E1 BE-4 (Samhan Public 이식).
 *
 * <p>legacy GAS 8번 (배차안내문자) 의 수동 워크플로우 (Excel 업로드 + 단톡방 매핑 + 멘트 편집 +
 * 단톡방별 그룹핑 후 복사 발송) 를 자동화. 2-step:
 * <ol>
 *   <li>POST /preview — dryRun (slip 자동 조회 + 단톡방/blocked 라우팅 + 메시지 조립)</li>
 *   <li>POST /send — 실 발송 (FE 가 수정한 메시지 포함 entry 목록)</li>
 * </ol>
 *
 * <p>권한 가드 — {@code dispatch.batch} EDIT 동적 권한. 2-step 모두 동일.
 */
@RestController
@RequestMapping("/admin/notifications/dispatch-batch")
@RequiredArgsConstructor
@Tag(name = "Notification - Dispatch Batch (Admin)",
        description = "배차안내 SMS batch 발송 (preview + send)")
public class DispatchBatchAdminController {

    private final DispatchBatchPreviewService previewService;
    private final DispatchBatchSendService sendService;

    /**
     * dryRun 미리보기 — 출고전표 자동 조회 + 단톡방 그룹핑 + blocked 가드.
     *
     * @return 200, ChatRoomGroup 목록 + unmapped 목록
     */
    @Operation(summary = "배차안내 SMS 미리보기 (Admin)",
            description = "DISPATCH / MANAGER / MASTER 권한. 출고전표 + 단톡방 매핑 + blocked 가드 + 메시지 템플릿 dryRun.")
    @PostMapping("/preview")
    @RequirePermission(page = "dispatch.batch", action = "EDIT")
    public ApiResponse<DispatchBatchPreviewResponse> preview(
            @Valid @RequestBody DispatchBatchPreviewRequest req) {
        return ApiResponse.ok(previewService.preview(req));
    }

    /**
     * 실 발송 — preview 결과 + 운영자 수정 메시지 entry 목록을 SmsAdapter 로 일괄 발송.
     *
     * <p>SP-09-2: 발송 완료 후 {@code dispatch_sms_save_history} 에 {@code SEND_AUDIT} row 자동 저장.
     * {@code X-User-Id} 헤더 값이 감사 저장의 {@code created_by} 로 사용된다.
     *
     * @param userId X-User-Id 헤더 (api-gateway 전파)
     * @param req 발송 요청 본문
     * @return 200, sent / failed / blocked 카운트 + 상세
     */
    @Operation(summary = "배차안내 SMS 실 발송 (Admin)",
            description = "DISPATCH / MANAGER / MASTER 권한. preview 결과 confirm 후 entry 별 SmsAdapter 호출. 발송 완료 후 SEND_AUDIT 자동 저장.")
    @PostMapping("/send")
    @RequirePermission(page = "dispatch.batch", action = "EDIT")
    public ApiResponse<DispatchBatchSendResponse> send(
            @RequestHeader(value = "X-User-Id", required = false) String userId,
            @Valid @RequestBody DispatchBatchSendRequest req) {
        return ApiResponse.ok(sendService.send(req, userId));
    }
}
