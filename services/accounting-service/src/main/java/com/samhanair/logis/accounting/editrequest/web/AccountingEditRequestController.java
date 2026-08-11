package com.samhanair.logis.accounting.editrequest.web;

import com.samhanair.logis.security.permission.RequirePermission;
import com.samhanair.logis.accounting.editrequest.domain.AccountingEditRequest;
import com.samhanair.logis.accounting.editrequest.service.AccountingEditRequestService;
import com.samhanair.logis.accounting.editrequest.web.dto.AccountingEditRequestResponse;
import com.samhanair.logis.accounting.editrequest.web.dto.ApproveAccountingRequest;
import com.samhanair.logis.accounting.editrequest.web.dto.CreateAccountingEditRequestRequest;
import com.samhanair.logis.accounting.editrequest.web.dto.RejectAccountingRequest;
import com.samhanair.logis.common.dto.ApiResponse;
import com.samhanair.logis.common.security.ActorDisplayName;
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
 * 회계 도메인 수정/삭제 요청 워크플로우 REST endpoint — PR-H4b (Phase 12 Step 4b).
 *
 * <p>endpoint:
 * <ul>
 *   <li>{@code POST /accounting/entities/{entityId}/edit-request} — {@code accounting.edit-requests CREATE}</li>
 *   <li>{@code POST /accounting/edit-requests/{requestId}/approve} — {@code accounting.edit-requests.decide UPDATE}</li>
 *   <li>{@code POST /accounting/edit-requests/{requestId}/reject} — {@code accounting.edit-requests.decide UPDATE}</li>
 *   <li>{@code GET  /accounting/edit-requests?targetRole=MANAGER} — {@code accounting.edit-requests.decide VIEW}</li>
 *   <li>{@code GET  /accounting/entities/{entityId}/edit-requests} — {@code accounting.edit-requests VIEW}</li>
 * </ul>
 *
 * <p>권한 매트릭스:
 * <ul>
 *   <li>요청 생성/이력 조회 — {@code accounting.edit-requests}</li>
 *   <li>권한자 대시보드/수락/거절 — {@code accounting.edit-requests.decide}</li>
 * </ul>
 */
@RestController
@RequestMapping("/accounting")
@RequiredArgsConstructor
public class AccountingEditRequestController {

    private static final String CALLER_ID_HEADER = "X-User-Id";
    private static final String CALLER_NAME_HEADER = "X-User-Name";

    private final AccountingEditRequestService editRequestService;

    /** 회계 entity 수정/삭제 요청 생성. */
    @Operation(summary = "회계 entity 수정/삭제 요청 생성",
            description = "PR-H4b — TaxInvoice ISSUED / Journal POSTED / AccountingPeriod CLOSED 잠금 mutation 해제 요청")
    @ApiResponses({
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "201", description = "요청 생성 성공"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "400", description = "입력 검증 실패")
    })
    @PostMapping("/entities/{entityId}/edit-request")
    @RequirePermission(page = "accounting.edit-requests", action = com.samhanair.logis.security.permission.PermissionAction.CREATE)
    public ResponseEntity<ApiResponse<AccountingEditRequestResponse>> createRequest(
            @PathVariable UUID entityId,
            @Valid @RequestBody CreateAccountingEditRequestRequest request,
            @RequestHeader(value = CALLER_ID_HEADER, required = false) String callerId,
            @RequestHeader(value = CALLER_NAME_HEADER, required = false) String callerName) {
        UUID requesterId = parseActorId(callerId);
        String requesterName = resolveName(callerId, callerName);
        AccountingEditRequest saved = editRequestService.request(entityId, request.type(),
                request.reason(), requesterId, requesterName);
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(ApiResponse.ok(AccountingEditRequestResponse.from(saved)));
    }

    /** 요청 수락 — MANAGER / MASTER 만 호출 가능. */
    @Operation(summary = "회계 수정/삭제 요청 수락",
            description = "PR-H4b — MANAGER 수락 시 작성자가 1회 mutation 가능 + SSE broadcast")
    @PostMapping("/edit-requests/{requestId}/approve")
    @RequirePermission(page = "accounting.edit-requests.decide", action = com.samhanair.logis.security.permission.PermissionAction.UPDATE)
    public ApiResponse<AccountingEditRequestResponse> approveRequest(
            @PathVariable UUID requestId,
            @Valid @RequestBody(required = false) ApproveAccountingRequest body,
            @RequestHeader(value = CALLER_ID_HEADER, required = false) String callerId,
            @RequestHeader(value = CALLER_NAME_HEADER, required = false) String callerName) {
        UUID approverId = parseActorId(callerId);
        String approverName = resolveName(callerId, callerName);
        String note = body == null ? null : body.note();
        AccountingEditRequest updated = editRequestService.approve(requestId, approverId,
                approverName, note);
        return ApiResponse.ok(AccountingEditRequestResponse.from(updated));
    }

    /** 요청 거절 — MANAGER / MASTER 만 호출 가능. 거절 사유 필수. */
    @Operation(summary = "회계 수정/삭제 요청 거절",
            description = "PR-H4b — MANAGER 거절 시 사유 SSE broadcast + 종결")
    @PostMapping("/edit-requests/{requestId}/reject")
    @RequirePermission(page = "accounting.edit-requests.decide", action = com.samhanair.logis.security.permission.PermissionAction.UPDATE)
    public ApiResponse<AccountingEditRequestResponse> rejectRequest(
            @PathVariable UUID requestId,
            @Valid @RequestBody RejectAccountingRequest body,
            @RequestHeader(value = CALLER_ID_HEADER, required = false) String callerId,
            @RequestHeader(value = CALLER_NAME_HEADER, required = false) String callerName) {
        UUID approverId = parseActorId(callerId);
        String approverName = resolveName(callerId, callerName);
        AccountingEditRequest updated = editRequestService.reject(requestId, approverId,
                approverName, body.reason());
        return ApiResponse.ok(AccountingEditRequestResponse.from(updated));
    }

    /** 권한자 대시보드 — MANAGER PENDING 요청 목록. */
    @Operation(summary = "회계 수정 요청 대시보드 — PENDING 목록",
            description = "PR-H4b — MANAGER 권한자 그룹의 PENDING 요청 목록")
    @GetMapping("/edit-requests")
    @RequirePermission(page = "accounting.edit-requests.decide", action = com.samhanair.logis.security.permission.PermissionAction.VIEW)
    public ApiResponse<List<AccountingEditRequestResponse>> listForRole(
            @RequestParam(defaultValue = "MANAGER") EditTargetRole targetRole) {
        List<AccountingEditRequest> rows = editRequestService.listPendingForRole(targetRole);
        return ApiResponse.ok(rows.stream().map(AccountingEditRequestResponse::from).toList());
    }

    /** entity 별 요청 이력. */
    @Operation(summary = "entity 별 요청 이력",
            description = "PR-H4b — entity 화면의 '수정 요청 이력' 섹션")
    @GetMapping("/entities/{entityId}/edit-requests")
    @RequirePermission(page = "accounting.edit-requests", action = com.samhanair.logis.security.permission.PermissionAction.VIEW)
    public ApiResponse<List<AccountingEditRequestResponse>> listByEntity(
            @PathVariable UUID entityId) {
        List<AccountingEditRequest> rows = editRequestService.listByEntity(entityId);
        return ApiResponse.ok(rows.stream().map(AccountingEditRequestResponse::from).toList());
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
