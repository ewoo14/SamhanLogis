package com.samhanair.logis.partnerorder.editrequest.web;

import com.samhanair.logis.common.dto.ApiResponse;
import com.samhanair.logis.common.security.ActorDisplayName;
import com.samhanair.logis.partnerorder.editrequest.domain.PartnerOrderEditRequest;
import com.samhanair.logis.partnerorder.editrequest.service.PartnerOrderEditRequestService;
import com.samhanair.logis.partnerorder.editrequest.web.dto.ApproveRequest;
import com.samhanair.logis.partnerorder.editrequest.web.dto.CreateEditRequestRequest;
import com.samhanair.logis.partnerorder.editrequest.web.dto.PartnerOrderEditRequestResponse;
import com.samhanair.logis.partnerorder.editrequest.web.dto.RejectRequest;
import com.samhanair.logis.security.permission.RequirePermission;
import com.samhanair.logis.security.permission.PermissionAction;
import com.samhanair.logis.shared.realtime.editrequest.EditRequestStatus;
import com.samhanair.logis.shared.realtime.editrequest.EditTargetRole;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import jakarta.validation.Valid;
import java.util.List;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * 거래처 주문 수정/삭제 요청 워크플로우 REST endpoint — PR-H4b (Phase 12 Step 4b BE-C).
 *
 * <p>endpoint:
 * <ul>
 *   <li>{@code POST /api/v1/partner-orders/{id}/edit-request {type, reason}} — 요청 생성</li>
 *   <li>{@code POST /api/v1/partner-orders/{id}/edit-request/{requestId}/approve {note?}} — 수락</li>
 *   <li>{@code POST /api/v1/partner-orders/{id}/edit-request/{requestId}/reject {reason}} — 거절</li>
 *   <li>{@code GET  /api/v1/partner-orders/edit-requests?targetRole=MANAGER} — 권한자 대시보드</li>
 *   <li>{@code GET  /api/v1/partner-orders/{id}/edit-requests} — 주문별 요청 이력</li>
 * </ul>
 *
 * <p>권한 매트릭스 (slip-service PR-H3 일관, 거래처 도메인은 MANAGER 기본):
 * <ul>
 *   <li>요청 생성 — PARTNER, SALES, MANAGER, MASTER (작성자 본인 또는 위임)</li>
 *   <li>수락/거절 — MANAGER, MASTER (거래처 주문 admin 결정 권한)</li>
 *   <li>대시보드 조회 — MANAGER, MASTER</li>
 * </ul>
 */
@RestController
@RequestMapping("/api/v1/partner-orders")
@RequiredArgsConstructor
public class PartnerOrderEditRequestController {

    private static final String CALLER_ID_HEADER = "X-User-Id";
    private static final String CALLER_NAME_HEADER = "X-User-Name";
    private static final String PARTNER_CODE_HEADER = "X-Partner-Code";

    private final PartnerOrderEditRequestService editRequestService;

    /**
     * 거래처 주문 수정/삭제 요청 생성.
     */
    @Operation(summary = "거래처 주문 수정/삭제 요청 생성",
            description = "PR-H4b — CONFIRMED 주문의 mutation 잠금 해제 요청 + MANAGER 알림")
    @ApiResponses({
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "201", description = "요청 생성 성공"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "400",
                    description = "DRAFT/CONFIRMING (작성자 직접 가능) 또는 CANCELED (종결)"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "404", description = "주문 미존재"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "409", description = "완전 잠금 단계")
    })
    @PostMapping("/{partnerOrderId}/edit-request")
    @RequirePermission(page = "sales.partner-order.edit-requests", action = PermissionAction.CREATE,
            partnerSelfService = true)
    public ResponseEntity<ApiResponse<PartnerOrderEditRequestResponse>> createRequest(
            @PathVariable UUID partnerOrderId,
            @Valid @RequestBody CreateEditRequestRequest request,
            @RequestHeader(value = CALLER_ID_HEADER, required = false) String callerId,
            @RequestHeader(value = CALLER_NAME_HEADER, required = false) String callerName,
            @RequestHeader(value = PARTNER_CODE_HEADER, required = false) String partnerCode) {
        UUID requesterId = parseActorId(callerId);
        String requesterName = resolveName(callerId, callerName);
        PartnerOrderEditRequest saved = editRequestService.request(partnerOrderId, request.type(),
                request.reason(), requesterId, requesterName, partnerCode);
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(ApiResponse.ok(PartnerOrderEditRequestResponse.from(saved)));
    }

    /**
     * 요청 수락.
     */
    @Operation(summary = "수정/삭제 요청 수락",
            description = "PR-H4b — MANAGER 수락 시 작성자가 1회 mutation 가능 + SSE broadcast")
    @ApiResponses({
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200", description = "수락 성공"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "404", description = "요청 미존재"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "409", description = "이미 종결된 요청")
    })
    @PostMapping("/{partnerOrderId}/edit-request/{requestId}/approve")
    @RequirePermission(page = "sales.partner-order.edit-requests.decide", action = PermissionAction.UPDATE)
    public ApiResponse<PartnerOrderEditRequestResponse> approveRequest(
            @PathVariable UUID partnerOrderId,
            @PathVariable UUID requestId,
            @Valid @RequestBody(required = false) ApproveRequest body,
            @RequestHeader(value = CALLER_ID_HEADER, required = false) String callerId,
            @RequestHeader(value = CALLER_NAME_HEADER, required = false) String callerName) {
        UUID approverId = parseActorId(callerId);
        String approverName = resolveName(callerId, callerName);
        String note = body == null ? null : body.note();
        PartnerOrderEditRequest updated = editRequestService.approve(requestId, approverId,
                approverName, note);
        return ApiResponse.ok(PartnerOrderEditRequestResponse.from(updated));
    }

    /**
     * 요청 거절.
     */
    @Operation(summary = "수정/삭제 요청 거절",
            description = "PR-H4b — MANAGER 거절 시 SSE broadcast. 거절 사유 필수")
    @ApiResponses({
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200", description = "거절 성공"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "400", description = "거절 사유 누락"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "404", description = "요청 미존재"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "409", description = "이미 종결된 요청")
    })
    @PostMapping("/{partnerOrderId}/edit-request/{requestId}/reject")
    @RequirePermission(page = "sales.partner-order.edit-requests.decide", action = PermissionAction.UPDATE)
    public ApiResponse<PartnerOrderEditRequestResponse> rejectRequest(
            @PathVariable UUID partnerOrderId,
            @PathVariable UUID requestId,
            @Valid @RequestBody RejectRequest body,
            @RequestHeader(value = CALLER_ID_HEADER, required = false) String callerId,
            @RequestHeader(value = CALLER_NAME_HEADER, required = false) String callerName) {
        UUID approverId = parseActorId(callerId);
        String approverName = resolveName(callerId, callerName);
        PartnerOrderEditRequest updated = editRequestService.reject(requestId, approverId,
                approverName, body.reason());
        return ApiResponse.ok(PartnerOrderEditRequestResponse.from(updated));
    }

    /**
     * 권한자 대시보드 — PENDING 요청 목록.
     */
    @Operation(summary = "권한자 대시보드 — PENDING 요청 목록",
            description = "PR-H4b — MANAGER 그룹의 PENDING 요청 (대시보드)")
    @GetMapping("/edit-requests")
    @RequirePermission(page = "sales.partner-order.edit-requests.decide", action = PermissionAction.VIEW)
    public ApiResponse<List<PartnerOrderEditRequestResponse>> listForRole(
            @RequestParam EditTargetRole targetRole) {
        List<PartnerOrderEditRequest> rows = editRequestService.listPendingForRole(targetRole);
        return ApiResponse.ok(rows.stream().map(PartnerOrderEditRequestResponse::from).toList());
    }

    /**
     * 주문별 요청 이력 — 주문 화면 표시용. status null 이면 전체.
     */
    @Operation(summary = "주문별 요청 이력",
            description = "PR-H4b — 주문 화면의 '수정 요청 이력' 섹션. status filter 선택")
    @GetMapping("/{partnerOrderId}/edit-requests")
    @RequirePermission(page = "sales.partner-order.edit-requests", action = PermissionAction.VIEW,
            partnerSelfService = true)
    public ApiResponse<List<PartnerOrderEditRequestResponse>> listByOrder(
            @PathVariable UUID partnerOrderId,
            @RequestParam(required = false) EditRequestStatus status,
            @RequestHeader(value = PARTNER_CODE_HEADER, required = false) String partnerCode) {
        List<PartnerOrderEditRequest> rows = editRequestService.listByOrder(partnerOrderId, status, partnerCode);
        return ApiResponse.ok(rows.stream().map(PartnerOrderEditRequestResponse::from).toList());
    }

    private UUID parseActorId(String callerId) {
        if (callerId == null || callerId.isBlank()) {
            return new UUID(0L, 0L);
        }
        try {
            return UUID.fromString(callerId);
        } catch (IllegalArgumentException ex) {
            return new UUID(0L, 0L);
        }
    }

    private String resolveName(String callerId, String callerName) {
        return ActorDisplayName.resolve(callerId, callerName);
    }
}
