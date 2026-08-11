package com.samhanair.logis.groupware.controller;

import com.samhanair.logis.common.dto.ApiResponse;
import com.samhanair.logis.groupware.dto.ApprovalLineInternalResponse;
import com.samhanair.logis.groupware.dto.UnreadCountResponse;
import com.samhanair.logis.groupware.service.ApprovalLineService;
import com.samhanair.logis.groupware.service.ApprovalAttachmentService;
import com.samhanair.logis.groupware.service.MessageService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * 형제 service (notification-service / dashboard-service) 가 결재 / 메신저 상태를
 * 조회하는 internal endpoint.
 *
 * <p>인증 = X-Internal-Token 필수. 토큰 누락 시 익명 요청 → AuthorizationFilter 의
 * AccessDeniedException → 403. 토큰 불일치 시 InternalTokenFilter 가 직접 401 응답.
 *
 * <p>UUID 비공개 가드 — 본 응답은 내부 형제 service 만 받는다 (사용자 화면 직접 노출 X).
 */
@RestController
@RequestMapping("/internal/groupware")
@RequiredArgsConstructor
public class GroupwareInternalController {

    private final ApprovalLineService approvalLineService;
    private final ApprovalAttachmentService approvalAttachmentService;
    private final MessageService messageService;

    /**
     * 결재선 단건 lookup — 형제 service 가 결재 상태 polling 또는 알림 발송 시 호출.
     *
     * @param approvalId 결재선 식별자 (path)
     * @return 200 + {@link ApprovalLineInternalResponse} ; 미존재 404 ; 토큰 누락 403 ; 토큰 불일치 401
     */
    @Operation(summary = "결재선 단건 lookup",
            description = "형제 service 가 결재 상태 조회 시 사용. X-Internal-Token 필수")
    @ApiResponses({
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200", description = "조회 성공"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "401", description = "내부 토큰 불일치 (InternalTokenFilter 직접 응답)"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "403", description = "내부 토큰 누락 (Spring Security AccessDeniedException)"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "404", description = "결재선 미존재")
    })
    @GetMapping("/approvals/{approvalId}")
    @PreAuthorize("hasRole('MASTER')")
    public ApiResponse<ApprovalLineInternalResponse> findApproval(@PathVariable UUID approvalId) {
        return ApiResponse.ok(ApprovalLineInternalResponse.from(approvalLineService.findById(approvalId)));
    }

    /**
     * 미열람 메신저 카운트 — 알림 / 배지 / dashboard KPI 용.
     *
     * @param userId 대상 user UUID (query)
     */
    @Operation(summary = "미열람 메신저 수")
    @GetMapping("/messages/unread-count")
    @PreAuthorize("hasRole('MASTER')")
    public ApiResponse<UnreadCountResponse> unreadCount(@RequestParam UUID userId) {
        long count = messageService.unreadCount(userId);
        return ApiResponse.ok(new UnreadCountResponse(userId, count));
    }

    /** accounting-service가 정산 확정 취소 전에 활성 결재 첨부를 확인한다. */
    @Operation(summary = "정산서 활성 결재 여부")
    @GetMapping("/settlement-approvals/active")
    @PreAuthorize("hasRole('MASTER')")
    public ApiResponse<Boolean> hasActiveSettlementApproval(@RequestParam String documentNo) {
        return ApiResponse.ok(approvalAttachmentService.hasActiveSettlementApproval(documentNo));
    }
}
