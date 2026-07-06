package com.samhanair.logis.slip.audit.web;

import com.samhanair.logis.common.dto.ApiResponse;
import com.samhanair.logis.security.permission.RequirePermission;
import com.samhanair.logis.slip.audit.domain.SlipAuditLog;
import com.samhanair.logis.slip.audit.service.SlipAuditLogService;
import com.samhanair.logis.slip.audit.web.dto.OverlayPatchRequest;
import com.samhanair.logis.slip.audit.web.dto.SlipAuditLogResponse;
import com.samhanair.logis.slip.service.SlipService;
import com.samhanair.logis.slip.web.dto.SlipDetailResponse;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import jakarta.validation.Valid;
import java.util.List;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * 슬립 audit overlay REST endpoint — PR-H2 (Phase 12 Step 2).
 *
 * <p>endpoint:
 * <ul>
 *   <li>{@code GET    /slips/{id}/audit-logs} — audit timeline (최신 revision 우선)</li>
 *   <li>{@code PATCH  /slips/{id}/audit/overlay} — 단일 필드 patch + audit + SSE broadcast</li>
 * </ul>
 *
 * <p>권한 매트릭스:
 * <ul>
 *   <li>조회 — 모든 인증 사용자 (slip 화면 표시)</li>
 *   <li>overlay patch — SALES, WAREHOUSE, MANAGER, MASTER (실시간 협업 주체)</li>
 * </ul>
 *
 * <p>응답 형식 = {@link ApiResponse} wrapper.
 */
@RestController
@RequestMapping("/slips/{slipId}")
@RequiredArgsConstructor
public class SlipAuditLogController {

    private static final String CALLER_ID_HEADER = "X-User-Id";
    private static final String CALLER_NAME_HEADER = "X-User-Name";

    private final SlipAuditLogService auditLogService;
    private final SlipService slipService;

    /**
     * 슬립 audit timeline 조회 — 최신 revision 우선. FE 가 본 응답을 받아 "수정 이력" 섹션 표시.
     */
    @Operation(summary = "슬립 audit timeline",
            description = "PR-H2 — slip 본문 수정 이력 (최신 revision 우선). soft-deleted 자동 제외")
    @GetMapping("/audit-logs")
    @RequirePermission(page = "slip.audit-overlay", action = com.samhanair.logis.security.permission.PermissionAction.VIEW)
    public ApiResponse<List<SlipAuditLogResponse>> listAuditLogs(@PathVariable UUID slipId) {
        List<SlipAuditLogResponse> items = auditLogService.listBySlip(slipId).stream()
                .map(SlipAuditLogResponse::from)
                .toList();
        return ApiResponse.ok(items);
    }

    /**
     * 단일 필드 audit overlay patch + SSE broadcast.
     *
     * <p>FE 가 사용자가 특정 필드 (예: 배송지 주소) 를 편집 완료할 때 본 endpoint 호출. 응답 즉시
     * 모든 SSE 구독자에게 {@code slip:edit} event 가 broadcast 되어 동시 협업 화면 sync.
     */
    @Operation(summary = "audit overlay 단일 필드 patch",
            description = "PR-H2 — 필드 1건 수정 + audit log INSERT + SSE 'slip:edit' broadcast")
    @ApiResponses({
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200", description = "patch 성공"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "400", description = "미지원 필드 또는 길이 초과"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "404", description = "슬립 미존재"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "409", description = "마감 lock")
    })
    @PatchMapping("/audit/overlay")
    @RequirePermission(page = "slip.audit-overlay", action = com.samhanair.logis.security.permission.PermissionAction.UPDATE)
    public ApiResponse<SlipDetailResponse> applyOverlayPatch(
            @PathVariable UUID slipId,
            @Valid @RequestBody OverlayPatchRequest request,
            @RequestHeader(value = CALLER_ID_HEADER, required = false) String callerId,
            @RequestHeader(value = CALLER_NAME_HEADER, required = false) String callerName) {
        return ApiResponse.ok(slipService.applyOverlayPatch(slipId,
                request.fieldName(), request.newValue(), callerId, callerName));
    }
}
